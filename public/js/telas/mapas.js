// Mapas offline: arquivos PMTiles exibidos com MapLibre, tudo servido localmente.
import { h, icone, bytes, aviso, toast, cabecalho } from '../ui.js';
import { api } from '../api.js';
import { PAISES, paisPorCodigo, CONTINENTES, continentePorId } from '../paises.js';

function carregarScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
    document.head.append(s);
  });
}
async function carregarBibliotecas() {
  if (!document.querySelector('link[href="/vendor/maplibre/maplibre-gl.css"]')) {
    document.head.append(h('link', { rel: 'stylesheet', href: '/vendor/maplibre/maplibre-gl.css' }));
  }
  await carregarScript('/vendor/maplibre/maplibre-gl.js');
  await carregarScript('/vendor/pmtiles/pmtiles.js');
  await carregarScript('/vendor/basemaps/basemaps.js');
}

let protocolo = null;
const escuro = () =>
  document.documentElement.dataset.tema === 'escuro' ||
  (!document.documentElement.dataset.tema && matchMedia('(prefers-color-scheme: dark)').matches);

export async function render(raiz, { args, estado }) {
  raiz.style.maxWidth = 'none';
  const [cat, itens] = await Promise.all([api.get('/api/catalogo'), api.get('/api/biblioteca')]);
  const mapas = itens.filter((i) => i.tipo === 'mapa');

  raiz.append(cabecalho('Navegação', 'Mapas offline', 'Ruas, estradas, rios e cidades do OpenStreetMap, funcionando sem internet.'));

  if (!estado.servidor?.ferramentas?.vendor) {
    raiz.append(aviso('', 'Os componentes de mapa ainda não foram baixados. Inicie uma instalação de conteúdo para baixá-los automaticamente.'));
    return;
  }

  let escolhido = mapas.find((m) => m.id === args[0]) || mapas[0];
  const area = h('div', { class: 'mapa' });
  const painel = h('div', { class: 'pilha', style: { alignContent: 'start', overflowY: 'auto' } });
  raiz.append(h('div', { class: 'mapa-area' }, area, painel));

  let mapa = null;
  try {
    await carregarBibliotecas();
  } catch (e) {
    area.append(h('div', { class: 'vazio' }, e.message));
    return;
  }
  const { maplibregl, pmtiles, basemaps } = window;
  if (!protocolo) {
    protocolo = new pmtiles.Protocol();
    maplibregl.addProtocol('pmtiles', protocolo.tile);
  }

  // ---------- estilos ----------
  const ESTILOS = [
    { id: 'auto', nome: 'Automático', desc: 'Claro ou escuro, igual ao tema' },
    { id: 'claro', nome: 'Claro', flavor: 'light' },
    { id: 'escuro', nome: 'Escuro', flavor: 'dark' },
    { id: 'natureza', nome: 'Natureza', desc: 'Rios, matas e áreas verdes em destaque', flavor: 'light', ajuste: natureza },
    { id: 'cinza', nome: 'Cinza', flavor: 'grayscale' },
    { id: 'branco', nome: 'Para imprimir', flavor: 'white' },
    { id: 'preto', nome: 'Preto', flavor: 'black' },
    { id: 'satelite', nome: 'Satélite', desc: 'Imagem real (Sentinel-2 2024) — 10 m por pixel: rios, matas, lavouras e quadras aparecem; casas e carros não. É a melhor imagem gratuita que pode ser usada offline.', satelite: true },
    { id: 'hibrido', nome: 'Satélite + nomes', desc: 'Imagem real com cidades, estradas e limites — 10 m por pixel: rios, matas, lavouras e quadras aparecem; casas e carros não. É a melhor imagem gratuita que pode ser usada offline.', satelite: true, rotulos: true },
  ];
  let estiloId = 'auto';
  try {
    estiloId = localStorage.getItem('pz-mapa-estilo') || 'auto';
  } catch {}
  if (!ESTILOS.some((e) => e.id === estiloId)) estiloId = 'auto';
  const satInfo = await api.get('/api/satelite').catch(() => null);

  function natureza(f) {
    return {
      ...f,
      earth: '#eef2e4',
      water: '#3f97d6',
      park_a: '#b5dca2', park_b: '#86c574',
      wood_a: '#a3d38f', wood_b: '#6fb45c',
      scrub_a: '#cfe6b0', scrub_b: '#b6d995',
      landcover: { ...f.landcover, forest: '#9fd08a', grassland: '#d3ebbd', farmland: '#e7efc6', scrub: '#c9e3a9', barren: '#f2e5c2' },
    };
  }
  function definicao(id) {
    const e = ESTILOS.find((x) => x.id === id) || ESTILOS[0];
    if (e.id === 'auto') return { ...e, flavor: escuro() ? 'dark' : 'light' };
    return e;
  }

  async function estilo(item) {
    const url = `${location.origin}/arquivos/${item.arquivo}`;
    const arquivo = new pmtiles.PMTiles(url);
    protocolo.add(arquivo);
    const cab = await arquivo.getHeader();
    const e = definicao(estiloId);
    const flavorNome = e.satelite ? 'dark' : e.flavor;
    let flavor = basemaps.namedFlavor(flavorNome);
    if (e.ajuste) flavor = e.ajuste(flavor);
    const sprite = ['dark', 'black'].includes(flavorNome) ? 'dark' : 'light';
    const vetor = { type: 'vector', url: `pmtiles://${url}`, attribution: '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> · Protomaps' };
    let sources = { protomaps: vetor };
    let layers;
    if (e.satelite) {
      sources.satelite = {
        type: 'raster', tiles: [`${location.origin}/satelite/{z}/{x}/{y}.jpg`], tileSize: 256,
        maxzoom: satInfo?.maxzoom || 15, attribution: satInfo?.atribuicao || 'Sentinel-2 cloudless (EOX)',
      };
      // O mapa de ruas fica por baixo só para preencher onde ainda não há imagem guardada (offline).
      const nomesIds = new Set(basemaps.layers('protomaps', flavor, { lang: 'pt', labelsOnly: true }).map((l) => l.id));
      const base = basemaps.layers('protomaps', flavor, { lang: 'pt' }).filter((l) => !nomesIds.has(l.id));
      layers = [
        ...base,
        {
          id: 'satelite', type: 'raster', source: 'satelite',
          paint: { 'raster-resampling': 'linear', 'raster-contrast': 0.08, 'raster-saturation': 0.05 },
        },
      ];
      if (e.rotulos) {
        // Por cima da imagem: limites, estradas principais e nomes (do mapa offline).
        const sobre = basemaps.layers('protomaps', flavor, { lang: 'pt' })
          .filter((l) => /^(boundaries|boundaries_country|roads_highway|roads_major|water_river)$/.test(l.id))
          .map((l) => ({ ...l, id: `${l.id}_sobre`, paint: { ...l.paint, ...(l.type === 'line' ? { 'line-opacity': 0.75 } : {}) } }));
        // Nomes em branco com contorno escuro: legíveis sobre a imagem.
        const nomes = basemaps.layers('protomaps', flavor, { lang: 'pt', labelsOnly: true }).map((l) =>
          l.type === 'symbol' && l.layout?.['text-field']
            ? { ...l, paint: { ...l.paint, 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.85)', 'text-halo-width': 1.6 } }
            : l);
        layers.push(...sobre, ...nomes);
      }
    } else {
      layers = basemaps.layers('protomaps', flavor, { lang: 'pt' });
      if (e.id === 'natureza') {
        // Rios mais grossos para enxergar a drenagem.
        layers = layers.map((l) => (/^water_(river|stream)$/.test(l.id) ? { ...l, paint: { ...l.paint, 'line-color': '#3f97d6', 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 6, 0.8, 12, 3, 16, 8] } } : l));
      }
    }
    return {
      cab,
      estilo: {
        version: 8,
        glyphs: `${location.origin}/vendor/fonts/{fontstack}/{range}.pbf`,
        sprite: `${location.origin}/vendor/sprites/${sprite}`,
        sources,
        layers,
      },
    };
  }

  // Vetor continua nítido além do zoom baixado; o satélite (10 m) não ganha nada além do 16.
  let cabAtual = null;
  const zoomMaximo = () => (definicao(estiloId).satelite ? 16 : Math.min(19, (cabAtual?.maxZoom || 14) + 4));

  async function trocarEstilo(id) {
    estiloId = id;
    try {
      localStorage.setItem('pz-mapa-estilo', id);
    } catch {}
    if (!escolhido || !mapa) return desenharPainel();
    const centro = mapa.getCenter();
    const zoom = mapa.getZoom();
    const { estilo: est } = await estilo(escolhido);
    mapa.setStyle(est);
    mapa.setMaxZoom(zoomMaximo());
    mapa.jumpTo({ center: centro, zoom: Math.min(zoom, zoomMaximo()) });
    desenharPainel();
  }

  async function abrir(item) {
    escolhido = item;
    desenharPainel();
    if (!item) {
      area.replaceChildren(h('div', { class: 'vazio' }, icone('mapa', 48), h('h3', {}, 'Nenhum mapa baixado'), h('p', {}, 'Baixe o mapa do Brasil ou do seu estado ao lado.')));
      return;
    }
    try {
      const { cab, estilo: est } = await estilo(item);
      const limites = [[cab.minLon, cab.minLat], [cab.maxLon, cab.maxLat]];
      if (!mapa) {
        area.replaceChildren();
        mapa = new maplibregl.Map({ container: area, style: est, bounds: limites, maxBounds: [[cab.minLon - 2, cab.minLat - 2], [cab.maxLon + 2, cab.maxLat + 2]], attributionControl: { compact: true },
          locale: { 'FullscreenControl.Enter': 'Ver em tela cheia', 'FullscreenControl.Exit': 'Sair da tela cheia' } });
        area.mapa = mapa; // acesso para diagnóstico
        // Tela cheia: só o mapa ocupa a tela toda, cobrindo os menus (Esc ou o mesmo botão para sair).
        mapa.addControl(new maplibregl.FullscreenControl(), 'top-right');
        mapa.addControl(new maplibregl.NavigationControl(), 'top-right');
        mapa.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
        mapa.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true } }), 'top-right');
        // Sem internet, blocos de satélite ainda não guardados simplesmente não aparecem.
        mapa.on('error', (ev) => {
          if (!/satelite/.test(ev?.sourceId || ev?.source?.id || '')) console.warn(ev?.error?.message || ev);
        });
        mapa.on('click', (e) => {
          new maplibregl.Popup().setLngLat(e.lngLat).setHTML(`<b>${e.lngLat.lat.toFixed(5)}, ${e.lngLat.lng.toFixed(5)}</b><br><small>latitude, longitude</small>`).addTo(mapa);
        });
      } else {
        mapa.setMaxBounds(null);
        mapa.setStyle(est);
        mapa.fitBounds(limites, { duration: 0 });
        mapa.setMaxBounds([[cab.minLon - 2, cab.minLat - 2], [cab.maxLon + 2, cab.maxLat + 2]]);
      }
      cabAtual = cab;
      mapa.setMaxZoom(zoomMaximo());
    } catch (e) {
      toast(`Não foi possível abrir o mapa: ${e.message}`, 'erro');
    }
  }

  function desenharPainel() {
    // "Brasil": o país inteiro em um só arquivo (sem duplicar as bordas, como aconteceria baixando os 27 estados).
    const BRASIL = { nome: 'Brasil', bbox: cat.itens.find((i) => i.grupo === 'mapa-brasil')?.bbox || [-74.2, -34, -28.6, 5.5] };
    // "C:" = continente, "P:" = país, sem prefixo = estado do Brasil.
    const regiao = (uf) => (uf === 'BR' ? BRASIL : uf.startsWith('C:') ? continentePorId(uf.slice(2)) : cat.estados[uf] || paisPorCodigo(uf.replace(/^P:/, '')));
    const tituloDe = (uf) => (uf === 'BR' ? 'Mapa do Brasil' : regiao(uf).titulo || `Mapa de ${regiao(uf).nome}`);
    const ufSel = h('select', {},
      h('option', { value: 'BR' }, 'Brasil (todo o país)'),
      h('optgroup', { label: 'Continentes inteiros' }, CONTINENTES.map(([id, nome]) => h('option', { value: `C:${id}` }, nome))),
      h('optgroup', { label: 'Estados do Brasil' }, Object.entries(cat.estados).map(([uf, e]) => h('option', { value: uf }, `${e.nome} (${uf})`))),
      // Outros países: "P:" evita confundir com siglas de estados (ex.: PE, PA, AM).
      PAISES.map((g) => h('optgroup', { label: g.grupo }, g.itens.map(([c, nome]) => h('option', { value: `P:${c}` }, nome)))));
    const zoomSel = h('select', {},
      h('option', { value: 10 }, 'Cidades e estradas'),
      h('option', { value: 12, selected: true }, 'Bairros e ruas principais'),
      h('option', { value: 14 }, 'Todas as ruas (grande)'));
    const estimativa = h('small', { class: 'suave' });
    const alertaBrasil = h('small', { class: 'suave' });
    // Brasil é grande: mostra o tamanho sozinho, sem precisar clicar em "Ver tamanho".
    const atualizarAlerta = () => {
      estimativa.textContent = '';
      const continente = ufSel.value.startsWith('C:');
      alertaBrasil.textContent = ufSel.value === 'BR' ? 'Um único arquivo com todos os estados, sem bordas repetidas.'
        : continente ? 'Um único arquivo com o continente inteiro. Continentes são grandes: comece por "Cidades e estradas".' : '';
      if (ufSel.value === 'BR' || continente) estimar(regiao(ufSel.value).bbox);
    };
    ufSel.addEventListener('change', atualizarAlerta);
    zoomSel.addEventListener('change', atualizarAlerta);

    const pedir = async (titulo, bbox) => {
      try {
        await api.post('/api/mapas/extrair', { titulo, bbox, maxzoom: Number(zoomSel.value) });
        toast('Baixando o mapa… acompanhe em Transferências.');
      } catch (e) {
        toast(e.message, 'erro');
      }
    };
    const estimar = async (bbox) => {
      estimativa.textContent = 'Calculando tamanho…';
      try {
        const r = await api.post('/api/mapas/estimar', { bbox, maxzoom: Number(zoomSel.value) });
        estimativa.textContent = r.bytes ? `Tamanho aproximado: ${bytes(r.bytes)}` : r.motivo ? `Estimativa indisponível (${r.motivo})` : 'Estimativa indisponível';
      } catch (e) {
        estimativa.textContent = e.message;
      }
    };
    const bboxVisivel = () => {
      const b = mapa?.getBounds();
      return b ? [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((n) => Number(n.toFixed(4))) : null;
    };
    atualizarAlerta(); // "Brasil" já vem selecionado

    // ---- estilo do mapa ----
    const atual = definicao(estiloId);
    const cartaoEstilo = h('div', { class: 'cartao pilha' },
      h('h3', { style: { margin: 0 } }, 'Estilo do mapa'),
      h('div', { class: 'estilos-mapa' },
        ESTILOS.map((e) =>
          h('button', { class: `estilo-mapa ${e.id === estiloId ? 'selecionado' : ''}`, title: e.desc || e.nome, onclick: () => trocarEstilo(e.id) },
            h('span', { class: `amostra amostra-${e.id}` }), h('span', {}, e.nome)))),
      atual.desc ? h('small', { class: 'suave' }, atual.desc) : null);

    // ---- satélite: funciona com internet e guarda o que foi visto; dá para salvar uma área para usar offline ----
    let cartaoSatelite = null;
    if (atual.satelite) {
      const zSat = h('select', {},
        h('option', { value: 11 }, 'Região (rios e matas grandes)'),
        h('option', { value: 13, selected: true }, 'Município (rios, lavouras, bairros)'),
        h('option', { value: 15 }, 'Máximo (10 m por pixel)'));
      const estSat = h('small', { class: 'suave' });
      const calcular = async () => {
        const b = bboxVisivel();
        if (!b) return;
        try {
          const r = await api.post('/api/satelite/estimar', { bbox: b, maxzoom: Number(zSat.value) });
          estSat.textContent = r.permitido
            ? `Área visível: ≈ ${bytes(r.bytes)} (${r.tiles.toLocaleString('pt-BR')} blocos)`
            : `Área visível grande demais para este detalhe (${r.tiles.toLocaleString('pt-BR')} blocos). Aproxime o mapa ou escolha menos detalhe.`;
        } catch (er) {
          estSat.textContent = er.message;
        }
      };
      zSat.addEventListener('change', calcular);
      mapa?.once('moveend', () => calcular());
      calcular();
      cartaoSatelite = h('div', { class: 'cartao pilha' },
        h('h3', { style: { margin: 0 } }, 'Satélite offline'),
        h('small', {}, 'Com internet, as imagens carregam sozinhas e cada área vista fica guardada. Sem internet, aparecem só as áreas já vistas ou salvas.'),
        h('label', { class: 'campo' }, 'Detalhe para salvar', zSat),
        h('button', { class: 'botao primario pequeno', onclick: async () => {
          const b = bboxVisivel();
          if (!b) return;
          try {
            await api.post('/api/satelite/baixar', { bbox: b, maxzoom: Number(zSat.value), titulo: escolhido?.titulo });
            toast('Salvando o satélite desta área… acompanhe em Transferências.');
          } catch (er) {
            toast(er.message, 'erro');
          }
        } }, icone('baixar', 14), 'Salvar satélite da área visível'),
        estSat,
        h('small', { class: 'suave' }, `Guardado: ${bytes(satInfo?.bytes || 0)} · Fonte: ${satInfo?.fonte || 'Sentinel-2 cloudless (EOX)'}`));
    }

    painel.replaceChildren(...[
      cartaoEstilo,
      cartaoSatelite,
      h('div', { class: 'cartao pilha' },
        h('h3', { style: { margin: 0 } }, 'Mapas baixados'),
        mapas.length
          ? mapas.map((m) =>
              h('button', { class: `opcao ${escolhido?.id === m.id ? 'selecionada' : ''}`, style: { padding: '12px 14px' }, onclick: () => abrir(m) },
                h('b', {}, m.titulo), h('small', { class: 'suave' }, bytes(m.tamanho))))
          : h('small', { class: 'suave' }, 'Nenhum ainda.')),
      h('div', { class: 'cartao pilha' },
        h('h3', { style: { margin: 0 } }, 'Baixar mais'),
        h('label', { class: 'campo' }, 'Região', ufSel),
        h('label', { class: 'campo' }, 'Nível de detalhe', zoomSel),
        h('div', { class: 'linha' },
          h('button', { class: 'botao primario pequeno', onclick: () => pedir(tituloDe(ufSel.value), regiao(ufSel.value).bbox) }, icone('baixar', 14), 'Baixar'),
          h('button', { class: 'botao pequeno', onclick: () => estimar(regiao(ufSel.value).bbox) }, 'Ver tamanho')),
        alertaBrasil,
        mapa
          ? h('button', { class: 'botao pequeno', onclick: () => {
              const b = bboxVisivel();
              if (b) pedir('Área escolhida no mapa', b);
            } }, 'Baixar a área visível na tela')
          : null,
        estimativa,
        h('small', {}, 'Os mapas vêm do OpenStreetMap via Protomaps. Só a região escolhida é baixada. Para um lugar que não está na lista, arraste o mapa até ele e use "Baixar a área visível na tela". Países grandes com "Todas as ruas" podem passar de 10 GB: clique em "Ver tamanho" antes.')),
    ].filter(Boolean));
  }

  await abrir(escolhido);
  return () => mapa?.remove();
}
