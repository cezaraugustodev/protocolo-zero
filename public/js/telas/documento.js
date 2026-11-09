// Leitor de livros do Protocolo Zero: PDF (pdf.js), EPUB e textos.
// Ferramentas de leitura: sumário, realces e notas, marcadores, busca no livro, 1 ou 2 páginas, zoom,
// temas de leitura (claro, sépia, escuro), tela cheia, continuar de onde parou e tradução feita pela IA
// do computador, que aparece no lugar do texto original (clique no trecho traduzido para ver o original).
import { h, icone, aviso, toast, modal, barra, confirmar } from '../ui.js';
import { api } from '../api.js';
import { traduzirTexto, caixaTraducao } from '../traduzir.js';
import { blocosDaPaginaPdf, coresDoBloco } from '../leitor/pdf-blocos.js';

const AVISO_TRAD = 'Tradução automática feita pela IA do computador: pode ter erros. Em saúde e emergência, siga as fontes oficiais.';
const SEM_PDFJS = 'O leitor de PDF ainda não foi baixado neste computador. Use "Instalar conteúdo" para baixar os componentes de leitura.';
const DICA_ORIGINAL = 'Clique em um trecho traduzido para ver o texto original.';
const ROTULO = { pdf: 'PDF', epub: 'Livro digital (EPUB)', texto: 'Texto' };
const CORES = [['amarelo', 'Amarelo'], ['verde', 'Verde'], ['azul', 'Azul'], ['rosa', 'Rosa']];
const TEMAS = [['claro', 'Claro'], ['sepia', 'Sépia'], ['escuro', 'Escuro']];
const CHAVE_PREFS = 'pz-leitor-prefs';
const MAX_RESULTADOS = 300;

function lerPrefs() {
  const padrao = { modo: 'uma', tema: 'claro', ajuste: 'largura', fator: 1, fonte: 18 };
  try {
    const antiga = Number(localStorage.getItem('pz-leitor-fonte')) || undefined;
    return { ...padrao, ...(antiga ? { fonte: antiga } : {}), ...JSON.parse(localStorage.getItem(CHAVE_PREFS) || '{}') };
  } catch {
    return padrao;
  }
}
function gravarPrefs(p) {
  try {
    localStorage.setItem(CHAVE_PREFS, JSON.stringify(p));
  } catch {}
}

const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esperar = (ms = 0) => new Promise((r) => setTimeout(r, ms));

/** Trechos de um texto onde aparece o termo buscado (sem diferenciar acentos e maiúsculas). */
function trechosAchados(texto, termo, max) {
  const t = String(texto || '').normalize('NFC');
  const n = semAcento(t);
  const q = semAcento(termo);
  const r = [];
  if (!q || n.length !== t.length) {
    // Texto com caracteres que mudam de tamanho ao tirar acentos: busca simples, sem acento.
    let i = t.toLowerCase().indexOf(String(termo).toLowerCase());
    while (q && i >= 0 && r.length < max) {
      r.push({ antes: t.slice(Math.max(0, i - 60), i), achado: t.slice(i, i + termo.length), depois: t.slice(i + termo.length, i + termo.length + 80) });
      i = t.toLowerCase().indexOf(String(termo).toLowerCase(), i + termo.length);
    }
    return r;
  }
  let i = n.indexOf(q);
  while (i >= 0 && r.length < max) {
    r.push({ antes: t.slice(Math.max(0, i - 60), i), achado: t.slice(i, i + q.length), depois: t.slice(i + q.length, i + q.length + 80) });
    i = n.indexOf(q, i + q.length);
  }
  return r;
}

/** Envolve o trecho [inicio, fim) do texto de um elemento num <mark> (atravessa negrito, links etc.). */
function realcar(el, inicio, fim, props) {
  if (fim <= inicio) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let pos = 0;
  const alvos = [];
  for (let no = walker.nextNode(); no; no = walker.nextNode()) {
    const ini = pos;
    pos += no.data.length;
    if (pos <= inicio || ini >= fim) continue;
    alvos.push([no, Math.max(0, inicio - ini), Math.min(no.data.length, fim - ini)]);
  }
  for (const [no, a, b] of alvos) {
    let alvo = no;
    if (b < alvo.data.length) alvo.splitText(b);
    if (a > 0) alvo = alvo.splitText(a);
    const mark = h('mark', props);
    alvo.replaceWith(mark);
    mark.append(alvo);
  }
}

export async function render(raiz, { args = [] } = {}) {
  const id = args[0];
  const querTraducao = args.includes('traduzir');
  const posPagina = args.indexOf('pagina');
  const paginaPedida = posPagina >= 0 ? Math.max(1, Number(args[posPagina + 1]) || 1) : null;
  const posNota = args.indexOf('nota');
  const notaPedida = posNota >= 0 ? args[posNota + 1] : null;

  if (!id) {
    raiz.append(aviso('erro', 'Documento não informado. Volte à Biblioteca e escolha um livro.'));
    return;
  }

  let it;
  let salvas;
  let leitura;
  try {
    [it, salvas, leitura] = await Promise.all([
      api.get(`/api/biblioteca/${encodeURIComponent(id)}`),
      api.get(`/api/biblioteca/${encodeURIComponent(id)}/traducao`).catch(() => ({ partes: {} })),
      api.get(`/api/biblioteca/${encodeURIComponent(id)}/notas`).catch(() => ({ notas: [], marcadores: [], ultima: 1 })),
    ]);
  } catch (e) {
    raiz.append(aviso('erro', e.message), h('a', { class: 'botao', href: '#/biblioteca' }, 'Voltar à Biblioteca'));
    return;
  }

  if (!['pdf', 'epub', 'texto'].includes(it.tipo)) {
    raiz.append(
      aviso('info', `“${it.titulo}” não é um livro com texto. Use a Biblioteca para abri-lo no programa certo.`),
      h('a', { class: 'botao', href: '#/biblioteca' }, 'Voltar à Biblioteca'),
    );
    return;
  }

  const ehPdf = it.tipo === 'pdf';
  const prefs = lerPrefs();
  raiz.classList.add('tela-leitor');

  // ----- notas de leitura (realces, notas, marcadores, última página) -----
  const notas = Array.isArray(leitura.notas) ? leitura.notas : [];
  const marcadores = new Set(leitura.marcadores || []);
  let ultima = leitura.ultima || 1;
  let esperaSalvar = null;
  let pendente = false;
  function salvarLeitura(imediato = false) {
    pendente = true;
    clearTimeout(esperaSalvar);
    const enviar = () => {
      pendente = false;
      return api.put(`/api/biblioteca/${encodeURIComponent(id)}/notas`, { notas, marcadores: [...marcadores], ultima })
        .catch((e) => toast(`Não foi possível salvar as notas: ${e.message}`, 'erro'));
    };
    if (imediato) return enviar();
    esperaSalvar = setTimeout(enviar, 700);
    return null;
  }

  // ----- traduções guardadas: { "3": { "0": { texto, quando, chave }, … }, … } -----
  const traducoes = {};
  for (const [parte, dados] of Object.entries(salvas.partes || {})) {
    for (const [bi, t] of Object.entries(dados?.blocos || {})) {
      if (t?.texto) (traducoes[parte] ||= {})[bi] = { texto: t.texto, quando: t.quando || null, chave: t.chave || null };
    }
  }

  const partes = []; // capítulos do EPUB ou partes do texto
  const blocosCache = new Map(); // parte -> blocos
  const elementos = new Map(); // "parte:bloco" -> { el, dados }
  const alternados = new Set(); // blocos que o usuário mandou mostrar no idioma oposto ao modo atual

  let total = 0;
  let indice = 1;
  let modoTraduzido = querTraducao;
  let ctrl = null;
  let rodandoTudo = false;
  let termoDestaque = '';
  let vis = null; // o leitor do tipo de arquivo (PDF ou texto)

  // ----- elementos da tela -----
  const botao = (ic, rotulo, onclick, classe = '') => h('button', { class: `lt-btn ${classe}`, title: rotulo, 'aria-label': rotulo, onclick },
    icone(ic, 18), h('span', { class: 'lt-btn-rotulo' }, rotulo));
  const sep = () => h('span', { class: 'lt-sep', 'aria-hidden': 'true' });

  const contNotas = h('span', { class: 'lt-contador' });
  const btnSumario = botao('lista', 'Sumário', () => abrirPainel('sumario'));
  const btnNotas = botao('nota', 'Notas', () => abrirPainel('notas'));
  btnNotas.append(contNotas);
  const btnMarcadores = botao('marcador', 'Marcadores', () => abrirPainel('marcadores'));
  const btnBusca = botao('busca', 'Buscar', () => abrirPainel('busca'));
  const btnUma = botao('umapagina', '1 página', () => definirModoPaginas('uma'));
  const btnDuas = botao('duaspaginas', '2 páginas', () => definirModoPaginas('duas'));
  const btnMenos = botao('menos', 'Diminuir', () => mudarZoom(-1), 'so-icone');
  const nivelZoom = h('span', { class: 'lt-zoom-nivel' }, '100%');
  const btnMais = botao('mais', 'Aumentar', () => mudarZoom(1), 'so-icone');
  const btnAjuste = botao('largura', 'Ajustar', () => alternarAjuste());
  const botoesTema = TEMAS.map(([t, nome]) => h('button', { class: `lt-tema-op tema-${t}`, title: `Tema ${nome.toLowerCase()}`, 'aria-label': `Tema ${nome.toLowerCase()}`, onclick: () => definirTema(t) }, 'A'));
  const btnOriginal = h('button', { onclick: () => definirModo(false) }, 'Original');
  const btnTraduzido = h('button', { onclick: () => definirModo(true) }, 'Traduzido');
  const seletorModo = h('div', { class: 'segmentado lt-segmentado', 'aria-label': 'Idioma do texto' }, btnOriginal, btnTraduzido);
  const btnTraduzir = botao('globo', ehPdf ? 'Traduzir página' : 'Traduzir capítulo', () => traduzirAtual(), 'destaque');
  const btnTraduzirTudo = botao('texto', 'Traduzir o livro', () => traduzirTudo());
  const btnParar = h('button', { class: 'botao pequeno perigo', hidden: true, onclick: pararTraducao }, 'Parar');
  const btnMarcar = botao('marcador', 'Marcar página', () => alternarMarcador());
  const btnTelaCheia = botao('telacheia', 'Tela cheia', () => alternarTelaCheia());

  const estadoTrad = h('small', { class: 'suave lt-estado-texto' });
  const progresso = h('div', { class: 'lt-progresso' });
  const avisoTrad = h('div', { class: 'aviso info lt-aviso', hidden: !modoTraduzido }, icone('alerta', 15), h('div', {}, AVISO_TRAD));
  const avisoPagina = h('div', { class: 'aviso info lt-aviso', hidden: true },
    'Esta página não tem texto (pode ter sido escaneada como imagem), por isso não dá para traduzir nem buscar nela.');

  const painelTitulo = h('b', {});
  const painelCorpo = h('div', { class: 'lt-painel-corpo' });
  const painel = h('aside', { class: 'lt-painel', hidden: true },
    h('div', { class: 'lt-painel-topo' }, painelTitulo,
      h('button', { class: 'lt-btn so-icone', title: 'Fechar painel', 'aria-label': 'Fechar painel', onclick: () => abrirPainel(null) }, icone('x', 16))),
    painelCorpo);

  const palco = h('div', { class: 'lt-palco', tabindex: '-1' });
  const setaEsq = h('button', { class: 'lt-seta esq', title: 'Página anterior (seta ←)', 'aria-label': 'Página anterior', onclick: () => ir(indice - passo()) }, icone('esquerda', 26));
  const setaDir = h('button', { class: 'lt-seta dir', title: 'Próxima página (seta →)', 'aria-label': 'Próxima página', onclick: () => ir(indice + passo()) }, icone('direita', 26));
  const palcoCaixa = h('div', { class: 'lt-palco-caixa' }, palco, setaEsq, setaDir);

  const btnPrimeira = botao('primeira', 'Primeira página', () => ir(1), 'so-icone');
  const btnAnterior = botao('esquerda', 'Anterior', () => ir(indice - passo()), 'so-icone');
  const campoPagina = h('input', { class: 'lt-campo-pagina', type: 'number', min: '1', value: '1', 'aria-label': 'Ir para a página',
    onchange: (e) => ir(Number(e.target.value) || 1) });
  const deTotal = h('span', { class: 'suave lt-de-total' });
  const btnProxima = botao('direita', 'Próxima', () => ir(indice + passo()), 'so-icone');
  const btnUltima = botao('ultima', 'Última página', () => ir(total), 'so-icone');
  const deslizante = h('input', { class: 'lt-deslizante', type: 'range', min: '1', value: '1', 'aria-label': 'Posição no livro',
    onchange: (e) => ir(Number(e.target.value)) });
  const porcento = h('span', { class: 'suave lt-porcento' });

  const menuSel = h('div', { class: 'lt-menu-sel', hidden: true, role: 'toolbar', 'aria-label': 'Trecho selecionado' });

  const lt = h('div', { class: 'lt', 'data-tema': prefs.tema, 'data-tipo': it.tipo },
    h('header', { class: 'lt-topo' },
      h('div', { class: 'lt-topo-linha' },
        h('a', { class: 'lt-btn', href: '#/biblioteca', title: 'Voltar à Biblioteca' }, icone('esquerda', 18), h('span', { class: 'lt-btn-rotulo' }, 'Biblioteca')),
        h('div', { class: 'lt-titulo' },
          h('h1', { title: it.titulo }, it.titulo),
          h('small', { class: 'suave' }, [ROTULO[it.tipo], it.fonte].filter(Boolean).join(' · '))),
        h('div', { class: 'lt-grupo' },
          h('a', { class: 'lt-btn so-icone', href: `/arquivos/${it.arquivo}`, target: '_blank', rel: 'noopener', title: 'Abrir o arquivo original em outra aba', 'aria-label': 'Abrir o arquivo original' }, icone('abrir', 18)),
          btnMarcar, btnTelaCheia)),
      h('div', { class: 'lt-ferramentas' },
        h('div', { class: 'lt-grupo' }, btnSumario, btnNotas, btnMarcadores, btnBusca),
        sep(),
        h('div', { class: 'lt-grupo so-pdf' }, btnUma, btnDuas),
        h('span', { class: 'lt-sep so-pdf', 'aria-hidden': 'true' }),
        h('div', { class: 'lt-grupo' }, btnMenos, nivelZoom, btnMais, h('span', { class: 'so-pdf' }, btnAjuste)),
        sep(),
        h('div', { class: 'lt-grupo lt-temas', role: 'group', 'aria-label': 'Tema de leitura' }, botoesTema),
        sep(),
        h('div', { class: 'lt-grupo' }, seletorModo, btnTraduzir, btnTraduzirTudo, btnParar))),
    h('div', { class: 'lt-estado' }, estadoTrad, progresso, avisoTrad, avisoPagina),
    h('div', { class: 'lt-corpo' }, painel, palcoCaixa),
    h('footer', { class: 'lt-rodape' },
      h('div', { class: 'lt-grupo' }, btnPrimeira, btnAnterior,
        h('label', { class: 'lt-pagina-rotulo' }, h('span', { class: 'suave' }, ehPdf ? 'Página' : 'Parte'), campoPagina, deTotal),
        btnProxima, btnUltima),
      deslizante, porcento),
    menuSel);
  raiz.append(lt);

  // ----- traduções -----
  async function salvarBloco(parte, bloco, texto, chave) {
    try {
      await api.put(`/api/biblioteca/${encodeURIComponent(id)}/traducao`, { indice: parte, bloco, texto, chave });
    } catch {}
  }

  // No PDF a tradução só vale se o trecho original for o mesmo (a mesma "chave").
  const traducaoDe = (parte, bloco) => {
    const t = traducoes[String(parte)]?.[String(bloco)];
    if (!t?.texto) return '';
    if (ehPdf && t.chave !== blocosCache.get(parte)?.[bloco]?.chave) return '';
    return t.texto;
  };

  function podeMostrarTraducao(parte, bloco) {
    if (!traducaoDe(parte, bloco)) return false;
    const invertido = alternados.has(`${parte}:${bloco}`);
    return modoTraduzido ? !invertido : invertido;
  }

  function atualizarBlocoEl(parte, bloco, dados, el) {
    const texto = traducaoDe(parte, bloco);
    const mostrando = !!texto && podeMostrarTraducao(parte, bloco);
    // No PDF o bloco fica por cima da página: sem tradução à mostra, fica vazio e a página aparece.
    const sobrePagina = el.classList.contains('doc-sobre-bloco');
    el.textContent = mostrando ? texto : sobrePagina ? '' : dados.texto;
    el.classList.toggle('traduzido', mostrando);
    el.classList.toggle('tem-traducao', !!texto);
    el.classList.remove('traduzindo');
    if (texto) el.title = mostrando ? 'Clique para ver o texto original' : 'Clique para ver a tradução';
    else el.removeAttribute('title');
    vis?.aposBloco?.(parte, bloco, el, mostrando);
  }

  function alternarBloco(parte, bloco, dados, el) {
    if (!traducaoDe(parte, bloco)) return;
    const chave = `${parte}:${bloco}`;
    if (alternados.has(chave)) alternados.delete(chave);
    else alternados.add(chave);
    atualizarBlocoEl(parte, bloco, dados, el);
  }

  function definirModo(verTraducao) {
    if (modoTraduzido === verTraducao) return;
    modoTraduzido = verTraducao;
    alternados.clear();
    atualizarBotoes();
    mostrarParte();
    estadoTrad.textContent = verTraducao ? DICA_ORIGINAL : '';
  }

  async function traduzirBloco(parte, bloco, sinal) {
    const blocos = await obterBlocos(parte);
    if (traducaoDe(parte, bloco)) return;
    const dados = blocos[bloco];
    if (!dados || dados.tipo === 'imagem' || !dados.texto?.trim()) return;
    const chave = `${parte}:${bloco}`;
    const atualizarNaTela = () => {
      const alvo = elementos.get(chave);
      if (alvo) atualizarBlocoEl(parte, bloco, alvo.dados, alvo.el);
    };
    let parcial = '';
    try {
      const texto = await traduzirTexto(dados.texto, {
        sinal,
        onTexto: (pedaco) => {
          parcial += pedaco;
          if (!vis.visiveis().includes(parte) || !modoTraduzido || alternados.has(chave)) return;
          const alvo = elementos.get(chave);
          if (alvo) {
            alvo.el.textContent = parcial;
            alvo.el.classList.add('traduzindo', 'tem-traducao');
            vis.ajustarBloco?.(alvo.el);
          }
        },
      });
      if (!texto) return;
      (traducoes[String(parte)] ||= {})[String(bloco)] = { texto, quando: Date.now(), chave: dados.chave || null };
      await salvarBloco(parte, bloco, texto, dados.chave);
    } catch (e) {
      atualizarNaTela();
      throw e;
    }
    atualizarNaTela();
  }

  function pararTraducao() {
    ctrl?.abort();
    estadoTrad.textContent = 'Tradução parada.';
  }

  function confirmarTraducao(quantidade) {
    return new Promise((resolve) => {
      let fechar;
      const responder = (v) => {
        fechar();
        resolve(v);
      };
      fechar = modal(h('div', { class: 'pilha' },
        h('h3', { style: { margin: 0 } }, 'Traduzir o livro inteiro?'),
        h('p', {}, `São ${quantidade} ${ehPdf ? 'página(s)' : 'parte(s)'}. A IA do computador traduz um trecho de cada vez: um livro grande pode levar bastante tempo.`),
        h('p', { class: 'suave' }, 'A tradução aparece no lugar do texto original. Clique em um trecho traduzido para ver o original. O que já foi traduzido é pulado, e você pode parar quando quiser.'),
        h('div', { class: 'linha', style: { justifyContent: 'flex-end', gap: '8px' } },
          h('button', { class: 'botao', onclick: () => responder(false) }, 'Cancelar'),
          h('button', { class: 'botao primario', onclick: () => responder(true) }, 'Traduzir o livro inteiro'))), { largura: 520 });
    });
  }

  async function traduzirParte(parte, sinal) {
    const blocos = await obterBlocos(parte);
    for (let bloco = 0; bloco < blocos.length; bloco++) {
      if (sinal.aborted) throw new DOMException('Cancelado', 'AbortError');
      if (blocos[bloco].tipo === 'imagem' || traducaoDe(parte, bloco)) continue;
      estadoTrad.textContent = `Traduzindo ${rotuloLongo(parte)} · trecho ${bloco + 1} de ${blocos.length}…`;
      await traduzirBloco(parte, bloco, sinal);
    }
  }

  function entrarNoModoTraduzido() {
    if (modoTraduzido) return false;
    modoTraduzido = true;
    alternados.clear();
    atualizarBotoes();
    return true;
  }

  function travarTraducao(sim) {
    btnTraduzir.disabled = sim;
    btnTraduzirTudo.disabled = sim;
    btnParar.hidden = !sim;
  }

  async function traduzirAtual() {
    if (ctrl) return;
    const meu = new AbortController();
    ctrl = meu;
    travarTraducao(true);
    try {
      if (entrarNoModoTraduzido()) await mostrarParte();
      const alvo = vis.visiveis();
      const temTexto = (await Promise.all(alvo.map(obterBlocos))).some((b) => b.length);
      if (!temTexto) {
        estadoTrad.textContent = ehPdf ? 'Esta página não tem texto para traduzir (pode ser uma imagem escaneada).' : 'Este trecho não tem texto para traduzir.';
        return;
      }
      for (const parte of alvo) await traduzirParte(parte, meu.signal);
      estadoTrad.textContent = `Tradução pronta. ${DICA_ORIGINAL}`;
    } catch (e) {
      if (e.name !== 'AbortError') estadoTrad.textContent = `Não foi possível traduzir: ${e.message}`;
    } finally {
      if (ctrl === meu) ctrl = null;
      travarTraducao(false);
    }
  }

  async function traduzirTudo() {
    if (rodandoTudo || ctrl) return;
    if (!(await confirmarTraducao(total))) return;
    if (rodandoTudo || ctrl) return;
    const meu = new AbortController();
    ctrl = meu;
    rodandoTudo = true;
    travarTraducao(true);
    let interrompeu = false;
    try {
      if (entrarNoModoTraduzido()) await mostrarParte();
      // Começa pelo que está aberto, para o usuário ver a tradução chegando na hora.
      const ordem = [...vis.visiveis(), ...Array.from({ length: total }, (_, k) => k + 1).filter((p) => !vis.visiveis().includes(p))];
      for (let k = 0; k < ordem.length; k++) {
        if (meu.signal.aborted) {
          interrompeu = true;
          break;
        }
        const parte = ordem[k];
        const blocos = await obterBlocos(parte);
        if (!blocos.some((b, bloco) => b.tipo !== 'imagem' && !traducaoDe(parte, bloco))) continue;
        progresso.replaceChildren(barra(k / ordem.length), h('small', { class: 'suave' }, `${rotuloLongo(parte)} · ${k + 1} de ${ordem.length}`));
        await traduzirParte(parte, meu.signal);
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        toast(`A tradução parou: ${e.message}`, 'erro');
        estadoTrad.textContent = `A tradução parou: ${e.message}`;
      } else interrompeu = true;
      interrompeu = true;
    } finally {
      rodandoTudo = false;
      travarTraducao(false);
      progresso.replaceChildren();
      if (ctrl === meu) ctrl = null;
      if (!interrompeu) estadoTrad.textContent = `Tradução do livro concluída. ${DICA_ORIGINAL}`;
    }
  }

  // ----- navegação -----
  const passo = () => vis?.passo() || 1;
  const rotuloLongo = (n) => (ehPdf ? `página ${n}` : partes[n - 1]?.titulo || `parte ${n}`);
  const rotuloCurto = (n) => (ehPdf ? `p. ${n}` : partes[n - 1]?.titulo || `Parte ${n}`);

  async function obterBlocos(parte) {
    if (blocosCache.has(parte)) return blocosCache.get(parte);
    const blocos = await vis.blocos(parte);
    blocosCache.set(parte, blocos);
    return blocos;
  }

  async function mostrarParte() {
    esconderMenu();
    await vis.mostrar(indice);
    atualizarBotoes();
  }

  async function ir(n, { forcar = false } = {}) {
    if (!total || !vis) return;
    const alvo = vis.normalizar(Math.min(total, Math.max(1, Math.round(n) || 1)));
    if (alvo === indice && !forcar) {
      atualizarRodape();
      return;
    }
    indice = alvo;
    ultima = indice;
    salvarLeitura();
    atualizarRodape();
    await mostrarParte();
    palco.scrollTop = 0;
  }

  function atualizarRodape() {
    const vistos = vis ? vis.visiveis() : [indice];
    campoPagina.max = String(total);
    campoPagina.value = String(indice);
    deTotal.textContent = vistos.length > 1 ? `–${vistos[vistos.length - 1]} de ${total}` : `de ${total}`;
    deslizante.max = String(Math.max(1, total));
    deslizante.value = String(indice);
    porcento.textContent = total ? `${Math.round((vistos[vistos.length - 1] / total) * 100)}%` : '';
    const noInicio = indice <= 1;
    const noFim = vistos[vistos.length - 1] >= total;
    btnPrimeira.disabled = noInicio;
    btnAnterior.disabled = noInicio;
    setaEsq.disabled = noInicio;
    btnProxima.disabled = noFim;
    btnUltima.disabled = noFim;
    setaDir.disabled = noFim;
    const marcada = marcadores.has(indice);
    btnMarcar.classList.toggle('ativo', marcada);
    btnMarcar.title = marcada ? 'Tirar o marcador desta página' : 'Marcar esta página';
  }

  function atualizarBotoes() {
    btnOriginal.classList.toggle('ativo', !modoTraduzido);
    btnTraduzido.classList.toggle('ativo', modoTraduzido);
    avisoTrad.hidden = !modoTraduzido;
    btnUma.classList.toggle('ativo', prefs.modo !== 'duas');
    btnDuas.classList.toggle('ativo', prefs.modo === 'duas');
    btnAjuste.querySelector('.lt-btn-rotulo').textContent = prefs.ajuste === 'pagina' ? 'Página inteira' : 'Largura';
    btnAjuste.title = prefs.ajuste === 'pagina' ? 'Mostrando a página inteira (clique para ajustar à largura)' : 'Ajustado à largura (clique para ver a página inteira)';
    botoesTema.forEach((b, k) => b.classList.toggle('ativo', TEMAS[k][0] === prefs.tema));
    contNotas.textContent = notas.length ? String(notas.length) : '';
    atualizarRodape();
  }

  function definirModoPaginas(modo) {
    if (prefs.modo === modo) return;
    prefs.modo = modo;
    gravarPrefs(prefs);
    indice = vis.normalizar(indice);
    atualizarBotoes();
    mostrarParte();
  }

  function mudarZoom(d) {
    if (ehPdf) prefs.fator = Math.min(4, Math.max(0.3, Number((prefs.fator * (d > 0 ? 1.15 : 1 / 1.15)).toFixed(3))));
    else prefs.fonte = Math.min(32, Math.max(13, prefs.fonte + d));
    gravarPrefs(prefs);
    vis.zoom?.();
  }

  function alternarAjuste() {
    prefs.ajuste = prefs.ajuste === 'pagina' ? 'largura' : 'pagina';
    prefs.fator = 1;
    gravarPrefs(prefs);
    atualizarBotoes();
    vis.zoom?.();
  }

  function definirTema(tema) {
    prefs.tema = tema;
    lt.dataset.tema = tema;
    gravarPrefs(prefs);
    atualizarBotoes();
  }

  function alternarMarcador() {
    if (marcadores.has(indice)) marcadores.delete(indice);
    else marcadores.add(indice);
    salvarLeitura();
    atualizarRodape();
    if (painelAtual === 'marcadores') desenharPainel();
    toast(marcadores.has(indice) ? `Marcador colocado na ${rotuloLongo(indice)}.` : 'Marcador retirado.');
  }

  // ----- tela cheia -----
  function aoTelaCheia() {
    const cheio = !!document.fullscreenElement || lt.classList.contains('lt-foco');
    lt.classList.toggle('lt-cheio', cheio);
    btnTelaCheia.replaceChildren(icone(cheio ? 'sairtela' : 'telacheia', 18), h('span', { class: 'lt-btn-rotulo' }, cheio ? 'Sair da tela cheia' : 'Tela cheia'));
    if (!document.fullscreenElement) lt.classList.remove('lt-foco');
    vis?.reajustar();
  }
  async function alternarTelaCheia() {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
      return;
    }
    if (lt.classList.contains('lt-cheio')) {
      lt.classList.remove('lt-foco', 'lt-cheio');
      aoTelaCheia();
      return;
    }
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // Sem tela cheia do navegador: ocupa a janela inteira mesmo assim.
      lt.classList.add('lt-foco');
      aoTelaCheia();
    }
  }
  document.addEventListener('fullscreenchange', aoTelaCheia);

  // ----- painel lateral: sumário, notas, marcadores, busca -----
  let painelAtual = null;
  let sumario = null;
  const busca = { termo: '', resultados: [], ctrl: null, estado: '' };

  function abrirPainel(nome) {
    painelAtual = painelAtual === nome ? null : nome;
    painel.hidden = !painelAtual;
    [[btnSumario, 'sumario'], [btnNotas, 'notas'], [btnMarcadores, 'marcadores'], [btnBusca, 'busca']]
      .forEach(([b, n]) => b.classList.toggle('ativo', painelAtual === n));
    desenharPainel();
    vis?.reajustar();
  }

  function desenharPainel() {
    if (!painelAtual) return;
    painelTitulo.textContent = { sumario: 'Sumário', notas: 'Notas e realces', marcadores: 'Marcadores', busca: 'Buscar no livro' }[painelAtual];
    if (painelAtual === 'sumario') desenharSumario();
    else if (painelAtual === 'notas') desenharNotasPainel();
    else if (painelAtual === 'marcadores') desenharMarcadores();
    else desenharBusca();
  }

  async function desenharSumario() {
    painelCorpo.replaceChildren(h('small', { class: 'suave' }, 'Carregando o sumário…'));
    sumario ||= await vis.sumario().catch(() => []);
    if (painelAtual !== 'sumario') return;
    const lista = (itens, nivel) => h('ul', { class: 'lt-sumario' }, itens.map((i) => h('li', {},
      h('button', { class: `lt-item${i.pagina && vis.visiveis().includes(i.pagina) ? ' atual' : ''}`, style: { paddingLeft: `${8 + nivel * 14}px` }, disabled: !i.pagina, onclick: () => ir(i.pagina) },
        h('span', {}, i.titulo || 'Sem título'), i.pagina && ehPdf ? h('small', { class: 'suave' }, String(i.pagina)) : null),
      i.filhos?.length ? lista(i.filhos, nivel + 1) : null)));
    painelCorpo.replaceChildren(sumario.length ? lista(sumario, 0) : h('p', { class: 'suave' }, 'Este livro não tem sumário. Use a busca ou a barra de páginas embaixo.'));
  }

  const ordemNota = (a, b) => a.pagina - b.pagina || (a.retangulos?.[0]?.y ?? a.inicio ?? 0) - (b.retangulos?.[0]?.y ?? b.inicio ?? 0);

  function desenharNotasPainel() {
    const filtro = h('input', { type: 'search', class: 'lt-filtro', placeholder: 'Filtrar notas…', 'aria-label': 'Filtrar notas' });
    const lista = h('div', { class: 'lt-lista' });
    const pintar = () => {
      const q = semAcento(filtro.value);
      const itens = [...notas].sort(ordemNota).filter((n) => !q || semAcento(`${n.trecho} ${n.nota}`).includes(q));
      lista.replaceChildren(...(itens.length ? itens.map(cartaoNota)
        : [h('p', { class: 'suave' }, notas.length ? 'Nenhuma nota com esse texto.' : 'Selecione um trecho do livro com o mouse para realçar ou escrever uma nota.')]));
    };
    filtro.addEventListener('input', pintar);
    pintar();
    painelCorpo.replaceChildren(filtro, lista,
      h('a', { class: 'lt-link', href: '#/notas' }, 'Ver as notas de todos os livros'));
  }

  function cartaoNota(n) {
    return h('div', { class: `lt-nota cor-${n.cor}` },
      h('div', { class: 'lt-nota-topo' },
        h('button', { class: 'lt-link', onclick: () => irParaNota(n) }, rotuloCurto(n.pagina)),
        h('span', { class: 'lt-nota-acoes' },
          h('button', { class: 'lt-btn so-icone mini', title: 'Editar nota', 'aria-label': 'Editar nota', onclick: () => editarNota(n) }, icone('lapis', 14)),
          h('button', { class: 'lt-btn so-icone mini', title: 'Apagar', 'aria-label': 'Apagar nota', onclick: () => apagarNota(n) }, icone('lixo', 14)))),
      n.trecho ? h('blockquote', { onclick: () => irParaNota(n), title: 'Ir para este trecho' }, n.trecho) : null,
      n.nota ? h('p', {}, n.nota) : h('button', { class: 'lt-link suave', onclick: () => editarNota(n) }, '+ Escrever uma nota'));
  }

  function desenharMarcadores() {
    const lista = [...marcadores].sort((a, b) => a - b);
    painelCorpo.replaceChildren(
      h('button', { class: 'botao pequeno', onclick: alternarMarcador }, icone('marcador', 14), marcadores.has(indice) ? 'Tirar o marcador desta página' : 'Marcar esta página'),
      lista.length
        ? h('div', { class: 'lt-lista' }, lista.map((p) => h('div', { class: 'lt-item-linha' },
          h('button', { class: `lt-item${vis.visiveis().includes(p) ? ' atual' : ''}`, onclick: () => ir(p) }, icone('marcador', 14), h('span', {}, ehPdf ? `Página ${p}` : rotuloCurto(p))),
          h('button', { class: 'lt-btn so-icone mini', title: 'Tirar marcador', 'aria-label': 'Tirar marcador', onclick: () => {
            marcadores.delete(p);
            salvarLeitura();
            atualizarRodape();
            desenharMarcadores();
          } }, icone('x', 14)))))
        : h('p', { class: 'suave' }, 'Nenhuma página marcada ainda. Use o botão "Marcar página" no alto para guardar uma página importante.'));
  }

  function itemResultado(r) {
    return h('button', { class: 'lt-item lt-resultado', onclick: () => ir(r.pagina) },
      h('small', { class: 'suave' }, rotuloCurto(r.pagina)),
      h('span', {}, r.antes ? `…${r.antes}` : '', h('mark', {}, r.achado), r.depois ? `${r.depois}…` : ''));
  }

  function desenharBusca() {
    const campo = h('input', { type: 'search', class: 'lt-filtro', placeholder: 'Palavra ou frase…', value: busca.termo, 'aria-label': 'Buscar no livro' });
    const estado = h('small', { class: 'suave' }, busca.estado);
    const lista = h('div', { class: 'lt-lista' }, busca.resultados.map(itemResultado));
    const executar = async () => {
      busca.ctrl?.abort();
      const meu = new AbortController();
      busca.ctrl = meu;
      busca.termo = campo.value.trim();
      busca.resultados = [];
      lista.replaceChildren();
      termoDestaque = busca.termo.length >= 2 ? busca.termo : '';
      vis.marcarAchados?.();
      if (busca.termo.length < 2) {
        busca.estado = 'Digite pelo menos 2 letras.';
        estado.textContent = busca.estado;
        return;
      }
      estado.textContent = 'Buscando…';
      await vis.buscar(busca.termo, (r) => {
        busca.resultados.push(r);
        if (painelAtual === 'busca') lista.append(itemResultado(r));
      }, meu.signal, (feito, de) => {
        estado.textContent = `Buscando… ${feito} de ${de}`;
      });
      if (meu.signal.aborted) return;
      const n = busca.resultados.length;
      busca.estado = n ? `${n}${n >= MAX_RESULTADOS ? '+' : ''} resultado(s).` : 'Nada encontrado.';
      estado.textContent = busca.estado;
    };
    campo.addEventListener('keydown', (e) => e.key === 'Enter' && executar());
    painelCorpo.replaceChildren(
      h('div', { class: 'linha', style: { gap: '6px' } }, campo, h('button', { class: 'botao pequeno', onclick: executar }, 'Buscar')),
      estado, lista);
    setTimeout(() => campo.focus(), 30);
    return executar;
  }

  // ----- notas e realces -----
  function atualizarNotasNaTela() {
    vis.desenharNotas();
    contNotas.textContent = notas.length ? String(notas.length) : '';
    if (painelAtual === 'notas') desenharNotasPainel();
  }

  async function irParaNota(n) {
    await ir(n.pagina);
    vis.piscarNota?.(n.id);
  }

  async function apagarNota(n) {
    if (n.nota && !(await confirmar('Apagar esta nota? O texto que você escreveu será perdido.', { botao: 'Apagar', perigo: true }))) return;
    const k = notas.indexOf(n);
    if (k >= 0) notas.splice(k, 1);
    salvarLeitura();
    atualizarNotasNaTela();
  }

  function editarNota(n) {
    let cor = n.cor;
    const campo = h('textarea', { class: 'lt-nota-campo', rows: '6', placeholder: 'Escreva sua nota sobre este trecho…' });
    campo.value = n.nota || '';
    const cores = h('div', { class: 'lt-cores' }, CORES.map(([c, nome]) => h('button', {
      class: `lt-cor cor-${c}${c === cor ? ' ativa' : ''}`, title: nome, 'aria-label': `Realce ${nome.toLowerCase()}`,
      onclick: (e) => {
        cor = c;
        cores.querySelectorAll('.lt-cor').forEach((b) => b.classList.toggle('ativa', b === e.currentTarget));
      },
    })));
    let fechar;
    const salvar = () => {
      n.cor = cor;
      n.nota = campo.value.trim();
      n.atualizado = Date.now();
      salvarLeitura();
      fechar();
      atualizarNotasNaTela();
    };
    fechar = modal(h('div', { class: 'pilha' },
      h('h3', { style: { margin: 0 } }, `Nota · ${rotuloLongo(n.pagina)}`),
      n.trecho ? h('blockquote', { class: 'lt-citacao' }, n.trecho) : null,
      h('div', { class: 'linha', style: { gap: '10px' } }, h('small', { class: 'suave' }, 'Cor do realce'), cores),
      campo,
      h('div', { class: 'linha entre' },
        h('button', { class: 'botao pequeno perigo', onclick: () => {
          fechar();
          apagarNota(n);
        } }, icone('lixo', 14), 'Apagar'),
        h('div', { class: 'linha', style: { gap: '8px' } },
          h('button', { class: 'botao', onclick: () => fechar() }, 'Cancelar'),
          h('button', { class: 'botao primario', onclick: salvar }, 'Salvar')))), { largura: 540 });
    campo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) salvar();
    });
    setTimeout(() => campo.focus(), 30);
  }

  // ----- menu do trecho selecionado -----
  let selecaoAtual = null;
  const manter = (e) => e.preventDefault(); // não perde a seleção ao clicar no menu

  function esconderMenu() {
    menuSel.hidden = true;
    selecaoAtual = null;
  }

  function mostrarMenuSelecao(info, ret) {
    selecaoAtual = info;
    menuSel.replaceChildren(
      ...CORES.map(([c, nome]) => h('button', { class: `lt-cor cor-${c}`, title: `Realçar em ${nome.toLowerCase()}`, 'aria-label': `Realçar em ${nome.toLowerCase()}`, onmousedown: manter, onclick: () => criarNota(c, false) })),
      h('span', { class: 'lt-sep' }),
      h('button', { class: 'lt-btn', onmousedown: manter, onclick: () => criarNota('amarelo', true) }, icone('nota', 16), h('span', { class: 'lt-btn-rotulo' }, 'Nota')),
      h('button', { class: 'lt-btn', onmousedown: manter, onclick: traduzirSelecao }, icone('globo', 16), h('span', { class: 'lt-btn-rotulo' }, 'Traduzir')),
      h('button', { class: 'lt-btn', onmousedown: manter, onclick: copiarSelecao }, icone('copiar', 16), h('span', { class: 'lt-btn-rotulo' }, 'Copiar')),
      h('button', { class: 'lt-btn', onmousedown: manter, onclick: buscarSelecao }, icone('busca', 16), h('span', { class: 'lt-btn-rotulo' }, 'Buscar')));
    menuSel.hidden = false;
    const mw = menuSel.offsetWidth;
    const mh = menuSel.offsetHeight;
    let x = ret.left + ret.width / 2 - mw / 2;
    let y = ret.top - mh - 10;
    if (y < 8) y = Math.min(window.innerHeight - mh - 8, ret.bottom + 10);
    x = Math.max(8, Math.min(window.innerWidth - mw - 8, x));
    menuSel.style.left = `${Math.round(x)}px`;
    menuSel.style.top = `${Math.round(y)}px`;
  }

  function criarNota(cor, abrirEditor) {
    const info = selecaoAtual;
    if (!info) return;
    const agora = Date.now();
    const n = { id: novoId(), cor, nota: '', criado: agora, atualizado: agora, ...info };
    notas.push(n);
    salvarLeitura();
    window.getSelection()?.removeAllRanges();
    esconderMenu();
    atualizarNotasNaTela();
    if (abrirEditor) editarNota(n);
  }

  function traduzirSelecao() {
    const info = selecaoAtual;
    if (!info) return;
    esconderMenu();
    const caixa = caixaTraducao();
    modal(h('div', { class: 'pilha' },
      h('h3', { style: { margin: 0 } }, 'Tradução do trecho'),
      h('blockquote', { class: 'lt-citacao' }, info.trecho),
      caixa.elemento), { largura: 620 });
    caixa.traduzir(info.trecho);
  }

  async function copiarSelecao() {
    const info = selecaoAtual;
    if (!info) return;
    try {
      await navigator.clipboard.writeText(info.trecho);
    } catch {
      document.execCommand('copy');
    }
    esconderMenu();
    toast('Trecho copiado.');
  }

  function buscarSelecao() {
    const info = selecaoAtual;
    if (!info) return;
    esconderMenu();
    busca.termo = info.trecho.slice(0, 80);
    if (painelAtual !== 'busca') abrirPainel('busca');
    const executar = desenharBusca();
    executar();
  }

  function verificarSelecao() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      esconderMenu();
      return;
    }
    const range = sel.getRangeAt(0);
    if (!palco.contains(range.commonAncestorContainer)) return;
    const info = vis.infoSelecao(range);
    if (!info?.trecho) {
      esconderMenu();
      return;
    }
    mostrarMenuSelecao(info, range.getBoundingClientRect());
  }

  palco.addEventListener('mouseup', () => setTimeout(verificarSelecao, 0));
  palco.addEventListener('touchend', () => setTimeout(verificarSelecao, 250));
  palco.addEventListener('keyup', (e) => e.shiftKey && verificarSelecao());
  palco.addEventListener('scroll', () => esconderMenu(), { passive: true });
  palco.addEventListener('click', (e) => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    const n = vis.notaNoClique?.(e);
    if (n) editarNota(n);
  });
  const aoApertar = (e) => {
    if (!menuSel.hidden && !menuSel.contains(e.target)) esconderMenu();
  };
  document.addEventListener('mousedown', aoApertar);

  // Teclado: setas viram a página, + e − mudam o zoom (menos quando o foco está num campo ou há uma janela aberta).
  const aoTecla = (e) => {
    if (document.querySelector('.modal-fundo')) return;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      ir(indice - passo());
    } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
      e.preventDefault();
      ir(indice + passo());
    } else if (e.key === 'Home') ir(1);
    else if (e.key === 'End') ir(total);
    else if (e.key === '+' || e.key === '=') mudarZoom(1);
    else if (e.key === '-') mudarZoom(-1);
    else if (e.key === 'Escape') esconderMenu();
  };
  window.addEventListener('keydown', aoTecla);

  let esperaResize;
  const observador = new ResizeObserver(() => {
    clearTimeout(esperaResize);
    esperaResize = setTimeout(() => vis?.reajustar(), 200);
  });

  const limpar = () => {
    ctrl?.abort();
    busca.ctrl?.abort();
    if (pendente) salvarLeitura(true);
    clearTimeout(esperaResize);
    observador.disconnect();
    window.removeEventListener('keydown', aoTecla);
    document.removeEventListener('mousedown', aoApertar);
    document.removeEventListener('fullscreenchange', aoTelaCheia);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    vis?.destruir();
  };

  // ----- monta o leitor do tipo de arquivo -----
  try {
    vis = ehPdf ? await criarLeitorPdf() : await criarLeitorTexto();
  } catch (e) {
    palco.replaceChildren(h('div', { class: 'lt-erro' },
      aviso('erro', e.message),
      h('div', { class: 'linha', style: { gap: '8px' } },
        h('a', { class: 'botao pequeno', href: '#/configurar' }, 'Instalar conteúdo'),
        h('a', { class: 'botao pequeno', href: `/arquivos/${it.arquivo}`, target: '_blank', rel: 'noopener' }, 'Abrir o arquivo original'))));
    return limpar;
  }

  const inicial = paginaPedida ? vis.paginaDe(paginaPedida) : leitura.ultima || 1;
  indice = vis.normalizar(Math.min(total, Math.max(1, inicial)));
  if (indice !== ultima) {
    ultima = indice;
    salvarLeitura();
  }
  atualizarBotoes();
  await mostrarParte();
  observador.observe(palco);
  if (modoTraduzido) estadoTrad.textContent = DICA_ORIGINAL;
  if (notaPedida) {
    const n = notas.find((x) => x.id === notaPedida);
    if (n) vis.piscarNota?.(n.id);
  }
  if (querTraducao) traduzirAtual();
  palco.focus({ preventScroll: true });
  return limpar;

  // =====================================================================
  // PDF (pdf.js): páginas desenhadas, texto selecionável por cima, realces e tradução no lugar do original.
  // =====================================================================
  async function criarLeitorPdf() {
    let pdfjs;
    try {
      pdfjs = await import('/vendor/pdfjs/pdf.min.mjs');
    } catch {
      throw new Error(SEM_PDFJS);
    }
    pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
    const doc = await pdfjs.getDocument({ url: `/arquivos/${it.arquivo}`, isEvalSupported: false }).promise;
    total = doc.numPages;

    const folhas = h('div', { class: 'lt-folhas' });
    palco.replaceChildren(folhas);
    const paginas = new Map(); // número -> { el, canvas, camadaTexto, marcas, pinos, sobre, desenho, camada, pronta }
    const textos = new Map(); // número -> texto corrido (busca)
    let geracao = 0;

    const duas = () => prefs.modo === 'duas' && total > 1;
    const visiveis = (n = indice) => (duas() && n + 1 <= total ? [n, n + 1] : [n]);
    const normalizar = (n) => (duas() ? n - ((n - 1) % 2) : n);

    async function escalaPara(nums) {
      const vps = await Promise.all(nums.map(async (n) => (await doc.getPage(n)).getViewport({ scale: 1 })));
      const gap = 18;
      const largura = Math.max(200, palco.clientWidth - 40);
      const altura = Math.max(200, palco.clientHeight - 32);
      let s = (largura - gap * (nums.length - 1)) / vps.reduce((a, v) => a + v.width, 0);
      if (prefs.ajuste === 'pagina') s = Math.min(s, altura / Math.max(...vps.map((v) => v.height)));
      return Math.max(0.1, s * prefs.fator);
    }

    function criarFolha(num) {
      const canvas = h('canvas', { class: 'lt-canvas' });
      const camadaTexto = h('div', { class: 'textLayer' });
      const marcas = h('div', { class: 'lt-marcas' });
      const sobre = h('div', { class: 'lt-sobre' });
      const pinos = h('div', { class: 'lt-pinos' });
      const el = h('div', { class: 'lt-pagina', 'data-pagina': String(num), 'aria-label': `Página ${num} de ${total}` }, canvas, marcas, camadaTexto, sobre, pinos);
      paginas.set(num, { el, canvas, camadaTexto, marcas, sobre, pinos, pronta: false });
      return el;
    }

    async function desenharFolha(num, s, g) {
      const p = paginas.get(num);
      const pagina = await doc.getPage(num);
      if (g !== geracao) return;
      const vp = pagina.getViewport({ scale: s });
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const px = Math.min(dpr, Math.sqrt(16e6 / Math.max(1, vp.width * vp.height))); // limita a memória do desenho
      p.el.style.width = `${Math.floor(vp.width)}px`;
      p.el.style.height = `${Math.floor(vp.height)}px`;
      p.el.style.setProperty('--scale-factor', String(s));
      p.canvas.width = Math.max(1, Math.floor(vp.width * px));
      p.canvas.height = Math.max(1, Math.floor(vp.height * px));
      p.desenho = pagina.render({ canvasContext: p.canvas.getContext('2d'), viewport: vp, transform: px !== 1 ? [px, 0, 0, px, 0, 0] : undefined });

      // Texto selecionável (para realçar, anotar, copiar e traduzir um trecho).
      const conteudoTexto = await pagina.getTextContent();
      if (g !== geracao) return;
      if (!textos.has(num)) textos.set(num, textoCorrido(conteudoTexto));
      p.camada = new pdfjs.TextLayer({ textContentSource: conteudoTexto, container: p.camadaTexto, viewport: vp });
      p.camada.render().then(() => marcarAchadosEm(p)).catch(() => {});
      desenharNotasEm(num);
      await desenharTraducao(num);
      try {
        await p.desenho.promise;
      } catch (e) {
        if (e?.name !== 'RenderingCancelledException') throw e;
        return;
      }
      if (g !== geracao) return;
      p.pronta = true;
      pintarCores(num);
    }

    async function mostrar(n) {
      const g = ++geracao;
      const nums = visiveis(n);
      const s = await escalaPara(nums);
      if (g !== geracao) return;
      nivelZoom.textContent = `${Math.round(s * 100)}%`;
      for (const p of paginas.values()) {
        try {
          p.desenho?.cancel();
        } catch {}
        try {
          p.camada?.cancel();
        } catch {}
      }
      paginas.clear();
      elementos.clear();
      folhas.replaceChildren(...nums.map(criarFolha));
      folhas.classList.toggle('duas', nums.length > 1);
      await Promise.all(nums.map((num) => desenharFolha(num, s, g)));
      if (g !== geracao) return;
      const semTexto = (await Promise.all(nums.map(obterBlocos))).every((b) => !b.length);
      avisoPagina.hidden = !(semTexto && (modoTraduzido || termoDestaque));
    }

    // ----- tradução por cima da página -----
    function ajustarBloco(el) {
      if (!el.classList.contains('doc-sobre-bloco')) return;
      if (!el.textContent) {
        el.style.fontSize = '';
        return;
      }
      const alturaPagina = el.closest('.lt-pagina')?.clientHeight || 800;
      let tam = Math.max(7, (Number(el.dataset.fonte) || 0.015) * alturaPagina);
      el.style.fontSize = `${tam}px`;
      for (let i = 0; i < 40 && el.scrollHeight > el.clientHeight + 1 && tam > 5; i++) {
        tam *= 0.92;
        el.style.fontSize = `${tam}px`;
      }
    }

    async function desenharTraducao(num) {
      const p = paginas.get(num);
      if (!p) return;
      const blocos = await obterBlocos(num);
      if (paginas.get(num) !== p) return;
      p.sobre.replaceChildren();
      for (const k of [...elementos.keys()]) if (k.startsWith(`${num}:`)) elementos.delete(k);
      blocos.forEach((dados, bloco) => {
        const c = dados.caixa;
        const el = h('div', {
          class: 'doc-sobre-bloco',
          'data-fonte': String(dados.fonte),
          style: { left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.w * 100}%`, height: `${c.h * 100}%` },
        });
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          alternarBloco(num, bloco, dados, el);
        });
        elementos.set(`${num}:${bloco}`, { el, dados });
        p.sobre.append(el);
        atualizarBlocoEl(num, bloco, dados, el);
      });
      if (p.pronta) pintarCores(num);
    }

    // As cores vêm da página desenhada: só dá para ler depois que o desenho termina.
    function pintarCores(num) {
      const p = paginas.get(num);
      if (!p?.pronta) return;
      const ctx = p.canvas.getContext('2d', { willReadFrequently: true });
      for (const [chave, { el, dados }] of elementos) {
        if (!chave.startsWith(`${num}:`)) continue;
        dados.cor ||= coresDoBloco(ctx, p.canvas.width, p.canvas.height, dados.caixa);
        el.style.setProperty('--bloco-fundo', dados.cor.fundo);
        el.style.setProperty('--bloco-letra', dados.cor.letra);
      }
    }

    // ----- realces e notas -----
    function desenharNotasEm(num) {
      const p = paginas.get(num);
      if (!p) return;
      const daPagina = notas.filter((n) => n.pagina === num && n.retangulos?.length);
      p.marcas.replaceChildren(...daPagina.flatMap((n) => n.retangulos.map((r) => h('div', {
        class: `lt-marca cor-${n.cor}`, 'data-nota': n.id,
        style: { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` },
      }))));
      p.pinos.replaceChildren(...daPagina.filter((n) => n.nota).map((n) => {
        const r = n.retangulos[n.retangulos.length - 1];
        return h('button', {
          class: `lt-pino cor-${n.cor}`, title: n.nota.slice(0, 200), 'aria-label': 'Ver nota',
          style: { left: `${Math.min(97, (r.x + r.w) * 100)}%`, top: `${r.y * 100}%` },
          onclick: (e) => {
            e.stopPropagation();
            editarNota(n);
          },
        }, icone('nota', 12));
      }));
    }

    function notaNoClique(e) {
      const pag = e.target.closest?.('.lt-pagina');
      if (!pag || e.target.closest('.doc-sobre-bloco.tem-traducao, .lt-pino')) return null;
      const num = Number(pag.dataset.pagina);
      const c = pag.getBoundingClientRect();
      const fx = (e.clientX - c.left) / c.width;
      const fy = (e.clientY - c.top) / c.height;
      return notas.find((n) => n.pagina === num && n.retangulos?.some((r) => fx >= r.x && fx <= r.x + r.w && fy >= r.y && fy <= r.y + r.h)) || null;
    }

    function piscarNota(idNota) {
      for (const el of folhas.querySelectorAll(`.lt-marca[data-nota="${CSS.escape(idNota)}"]`)) {
        el.classList.remove('piscar');
        void el.offsetWidth;
        el.classList.add('piscar');
      }
      folhas.querySelector(`.lt-marca[data-nota="${CSS.escape(idNota)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    function infoSelecao(range) {
      const no = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
      const pag = no?.closest?.('.lt-pagina');
      if (!pag || !folhas.contains(pag)) return null;
      const num = Number(pag.dataset.pagina);
      const c = pag.getBoundingClientRect();
      const rects = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1 && r.height < c.height * 0.15
        && r.left < c.right && r.right > c.left && r.top < c.bottom && r.bottom > c.top);
      if (!rects.length) return null;
      // Junta os pedaços da mesma linha num retângulo só.
      const linhas = [];
      for (const r of rects.sort((a, b) => a.top - b.top || a.left - b.left)) {
        const l = linhas.find((x) => Math.abs(x.top - r.top) < r.height * 0.5 && r.left <= x.right + r.height);
        if (l) {
          l.left = Math.min(l.left, r.left);
          l.right = Math.max(l.right, r.right);
          l.top = Math.min(l.top, r.top);
          l.bottom = Math.max(l.bottom, r.bottom);
        } else linhas.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
      }
      const retangulos = linhas.map((l) => {
        const x0 = Math.max(l.left, c.left);
        const y0 = Math.max(l.top, c.top);
        return { x: (x0 - c.left) / c.width, y: (y0 - c.top) / c.height, w: (Math.min(l.right, c.right) - x0) / c.width, h: (Math.min(l.bottom, c.bottom) - y0) / c.height };
      }).filter((r) => r.w > 0 && r.h > 0).slice(0, 300);
      const trecho = range.toString().replace(/\s+/g, ' ').trim().slice(0, 4000);
      return trecho && retangulos.length ? { pagina: num, trecho, retangulos } : null;
    }

    // ----- busca -----
    function textoCorrido(c) {
      return c.items.map((i) => (i.str || '') + (i.hasEOL ? ' ' : '')).join('').replace(/\s+/g, ' ').trim();
    }
    async function textoDe(num) {
      if (!textos.has(num)) textos.set(num, textoCorrido(await (await doc.getPage(num)).getTextContent()));
      return textos.get(num);
    }
    async function buscar(termo, aoAchar, sinal, aoProgresso) {
      let n = 0;
      for (let num = 1; num <= total; num++) {
        if (sinal.aborted) return;
        for (const r of trechosAchados(await textoDe(num), termo, MAX_RESULTADOS - n)) {
          aoAchar({ pagina: num, ...r });
          n++;
        }
        if (n >= MAX_RESULTADOS) return;
        if (num % 8 === 0) {
          aoProgresso?.(num, total);
          await esperar();
        }
      }
    }
    function marcarAchadosEm(p) {
      const q = semAcento(termoDestaque);
      for (const span of p.camadaTexto.querySelectorAll('span')) {
        span.classList.toggle('lt-achado', !!q && semAcento(span.textContent).includes(q));
      }
    }

    // ----- sumário -----
    async function sumarioPdf() {
      const outline = await doc.getOutline();
      if (!outline?.length) return [];
      const paginaDoDestino = async (dest) => {
        try {
          const d = typeof dest === 'string' ? await doc.getDestination(dest) : dest;
          if (!Array.isArray(d)) return null;
          return typeof d[0] === 'number' ? d[0] + 1 : (await doc.getPageIndex(d[0])) + 1;
        } catch {
          return null;
        }
      };
      const converter = (itens) => Promise.all(itens.map(async (i) => ({
        titulo: i.title, pagina: await paginaDoDestino(i.dest), filhos: i.items?.length ? await converter(i.items) : [],
      })));
      return converter(outline);
    }

    return {
      visiveis,
      normalizar,
      passo: () => (duas() ? 2 : 1),
      paginaDe: (n) => n,
      mostrar,
      reajustar: () => mostrar(indice),
      zoom: () => mostrar(indice),
      blocos: async (n) => {
        const pagina = await doc.getPage(n);
        return blocosDaPaginaPdf(await pagina.getTextContent(), pagina.getViewport({ scale: 1 }), pdfjs.Util);
      },
      ajustarBloco,
      aposBloco: (parte, bloco, el) => ajustarBloco(el),
      desenharNotas: () => visiveis().forEach(desenharNotasEm),
      notaNoClique,
      piscarNota,
      infoSelecao,
      buscar,
      marcarAchados: () => {
        for (const p of paginas.values()) marcarAchadosEm(p);
      },
      sumario: sumarioPdf,
      destruir: () => {
        geracao++;
        Promise.resolve(doc.destroy?.()).catch(() => {});
      },
    };
  }

  // =====================================================================
  // EPUB e texto: capítulos em texto corrido, com realces no próprio parágrafo.
  // =====================================================================
  async function criarLeitorTexto() {
    const dados = await api.get(`/api/biblioteca/${encodeURIComponent(id)}/leitura`);
    partes.push(...(dados.partes || []));
    if (!partes.length) throw new Error('Não há texto para mostrar neste arquivo.');
    total = partes.length;

    const conteudo = h('article', { class: 'doc-texto lt-texto' });
    const caixa = h('div', { class: 'lt-texto-caixa' }, conteudo);
    palco.replaceChildren(caixa);
    const aplicarFonte = () => {
      conteudo.style.fontSize = `${prefs.fonte}px`;
      nivelZoom.textContent = `${Math.round((prefs.fonte / 18) * 100)}%`;
    };
    aplicarFonte();

    // Realces das notas e da busca no parágrafo (só quando ele mostra o texto original).
    function realcesDoBloco(parte, bloco, el, mostrandoTraducao) {
      if (mostrandoTraducao) return;
      for (const n of notas) {
        if (n.pagina !== parte || n.bloco !== bloco) continue;
        realcar(el, n.inicio, n.fim, { class: `lt-realce cor-${n.cor}${n.nota ? ' com-nota' : ''}`, 'data-nota': n.id, title: n.nota ? n.nota.slice(0, 200) : 'Clique para escrever uma nota' });
      }
      if (termoDestaque.length >= 2) {
        const texto = el.textContent;
        const q = semAcento(termoDestaque);
        const n = semAcento(texto);
        if (n.length === texto.length) {
          const achados = [];
          for (let i = n.indexOf(q); i >= 0; i = n.indexOf(q, i + q.length)) achados.push(i);
          for (const i of achados.reverse()) realcar(el, i, i + q.length, { class: 'lt-achado' });
        }
      }
    }

    function redesenharBlocos() {
      for (const [chave, { el, dados: d }] of elementos) {
        const [parte, bloco] = chave.split(':').map(Number);
        atualizarBlocoEl(parte, bloco, d, el);
      }
    }

    async function mostrar(parte) {
      const blocos = await obterBlocos(parte);
      if (parte !== indice) return;
      elementos.clear();
      conteudo.replaceChildren();
      avisoPagina.hidden = true;
      if (!blocos.length) {
        conteudo.append(aviso('info', 'Este trecho não tem texto para mostrar.'));
        return;
      }
      blocos.forEach((d, bloco) => {
        if (d.tipo === 'imagem') {
          conteudo.append(h('img', { class: 'doc-imagem', src: d.src, alt: 'Ilustração do livro', loading: 'lazy' }));
          return;
        }
        const tag = d.tipo === 'titulo' ? (d.nivel && d.nivel <= 2 ? 'h2' : 'h3') : 'p';
        const el = h(tag, { class: 'doc-bloco', 'data-bloco': String(bloco) });
        el.addEventListener('click', (e) => {
          if (e.target.closest('mark.lt-realce')) return;
          const sel = window.getSelection();
          if (sel && !sel.isCollapsed) return;
          alternarBloco(parte, bloco, d, el);
        });
        elementos.set(`${parte}:${bloco}`, { el, dados: d });
        conteudo.append(el);
        atualizarBlocoEl(parte, bloco, d, el);
      });
      caixa.scrollTop = 0;
    }

    function infoSelecao(range) {
      const no = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
      const blocoEl = no?.closest?.('.doc-bloco');
      const trecho = range.toString().replace(/\s+/g, ' ').trim().slice(0, 4000);
      if (!trecho) return null;
      // Trecho dentro de um parágrafo com o texto original: guarda a posição para mostrar o realce.
      if (!blocoEl || !conteudo.contains(blocoEl) || blocoEl.classList.contains('traduzido')) return { pagina: indice, trecho };
      const r = document.createRange();
      r.setStart(blocoEl, 0);
      r.setEnd(range.startContainer, range.startOffset);
      const inicio = r.toString().length;
      let fim = blocoEl.textContent.length;
      if (blocoEl.contains(range.endContainer)) {
        r.setEnd(range.endContainer, range.endOffset);
        fim = r.toString().length;
      }
      return { pagina: indice, bloco: Number(blocoEl.dataset.bloco), inicio, fim, trecho };
    }

    async function buscar(termo, aoAchar, sinal) {
      let n = 0;
      for (let parte = 1; parte <= total; parte++) {
        if (sinal.aborted) return;
        const texto = (await obterBlocos(parte)).filter((b) => b.texto).map((b) => b.texto).join(' ');
        for (const r of trechosAchados(texto, termo, MAX_RESULTADOS - n)) {
          aoAchar({ pagina: parte, ...r });
          n++;
        }
        if (n >= MAX_RESULTADOS) return;
        if (parte % 10 === 0) await esperar();
      }
    }

    // Número de página vindo da busca da Biblioteca = capítulo do EPUB (capítulos divididos mantêm o número).
    const paginaDe = (n) => {
      const achado = partes.findIndex((p) => p.capitulo === n);
      return achado >= 0 ? achado + 1 : Math.min(total, n);
    };

    return {
      visiveis: () => [indice],
      normalizar: (n) => n,
      passo: () => 1,
      paginaDe,
      mostrar,
      reajustar: () => {},
      zoom: () => {
        aplicarFonte();
        gravarPrefs(prefs);
      },
      blocos: async (parte) => partes[parte - 1]?.blocos || [],
      aposBloco: realcesDoBloco,
      desenharNotas: redesenharBlocos,
      notaNoClique: (e) => {
        const m = e.target.closest?.('mark.lt-realce');
        return m ? notas.find((n) => n.id === m.dataset.nota) || null : null;
      },
      piscarNota: (idNota) => {
        const m = conteudo.querySelector(`mark.lt-realce[data-nota="${CSS.escape(idNota)}"]`);
        if (!m) return;
        m.scrollIntoView({ block: 'center', behavior: 'smooth' });
        m.classList.remove('piscar');
        void m.offsetWidth;
        m.classList.add('piscar');
      },
      infoSelecao,
      buscar,
      marcarAchados: redesenharBlocos,
      sumario: async () => partes.map((p, k) => ({ titulo: p.titulo || `Parte ${k + 1}`, pagina: k + 1, filhos: [] })),
      destruir: () => {},
    };
  }
}
