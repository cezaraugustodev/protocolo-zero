import { h, icone, bytes, toast, modal, confirmar, cabecalho } from '../ui.js';
import { api } from '../api.js';
import { navegar, aoAtualizar } from '../app.js';

// Nível de confiança: o assistente usa tudo, mas oficial e científica prevalecem sobre as outras.
const SELO = {
  oficial: ['Oficial', 'selo-oficial', 'Fonte oficial: prevalece nas respostas do assistente.'],
  cientifica: ['Científica', 'selo-cientifico', 'Universidade, instituto federal ou editora científica.'],
  comunidade: ['Não oficial', 'selo-comunidade', 'Fonte não oficial: o assistente usa só como complemento.'],
  'nao-verificada': ['Não verificado', 'selo-nao-verificado', 'Veio do Internet Archive, sem revisão. Use com cautela.'],
};
export const ROTULO_TIPO = { pdf: 'PDF', epub: 'EPUB', texto: 'Texto', video: 'Vídeo', audio: 'Áudio', imagem: 'Imagem', zim: 'Enciclopédia', mapa: 'Mapa', pacote: 'Pacote', outro: 'Arquivo' };
// Na Biblioteca, cada categoria mostra os arquivos separados por tipo, nesta ordem.
export const GRUPOS_TIPO = [
  ['livros', 'Livros, PDFs e textos', ['pdf', 'epub', 'texto']],
  ['video', 'Vídeos', ['video']],
  ['audio', 'Áudios', ['audio']],
  ['imagem', 'Imagens', ['imagem']],
  ['zim', 'Enciclopédias', ['zim']],
  ['mapa', 'Mapas', ['mapa']],
  ['outro', 'Outros arquivos', ['pacote', 'outro']],
];
const grupoDoTipo = (tipo) => (GRUPOS_TIPO.find((g) => g[2].includes(tipo)) || GRUPOS_TIPO.at(-1))[0];
// Categorias que o usuário não escolhe para os próprios arquivos (mapas vão sozinhos para "Mapas").
export const CATEGORIAS_FORA_DO_USUARIO = new Set(['mapas', 'videos', 'internet-archive']);
export const ICONE_TIPO = { pdf: 'livro', epub: 'livro', texto: 'texto', video: 'play', audio: 'audio', imagem: 'imagem', zim: 'globo', mapa: 'mapa', pacote: 'pacote', outro: 'pasta' };
const ROTULO_COMPACTADO = { gz: 'compactado (.gz)', bruto: 'pronto para instalar', zip: 'pacote .zip', tgz: 'pacote .tgz', 'tar.gz': 'pacote .tar.gz', tar: 'pacote .tar' };
const rotuloCompactado = (f) => ROTULO_COMPACTADO[f] || 'compactado';

export function abrirItem(it, { pagina, traduzir } = {}) {
  // Livros abrem no leitor do projeto, que mostra o arquivo e traduz no próprio leitor.
  if (['pdf', 'epub', 'texto'].includes(it.tipo)) {
    return navegar(['ler', encodeURIComponent(it.id), ...(pagina ? ['pagina', String(pagina)] : []), ...(traduzir ? ['traduzir'] : [])].join('/'));
  }
  const url = `/arquivos/${it.arquivo}`;
  if (it.tipo === 'zim') return navegar(`enciclopedia/${encodeURIComponent(it.arquivo.split('/').pop().replace(/\.zim$/, ''))}`);
  if (it.tipo === 'mapa') return navegar(`mapas/${encodeURIComponent(it.id)}`);
  if (it.tipo === 'video') return modal(h('div', { class: 'pilha' }, h('h3', {}, it.titulo), h('video', { src: url, controls: true, autoplay: true, preload: 'metadata' })));
  if (it.tipo === 'audio') return modal(h('div', { class: 'pilha' }, h('h3', {}, it.titulo), h('audio', { src: url, controls: true, autoplay: true })), { largura: 560 });
  if (it.tipo === 'imagem') return modal(h('div', { class: 'pilha' }, h('h3', {}, it.titulo), h('img', { src: url, alt: it.titulo })));
  window.open(pagina ? `${url}#page=${pagina}` : url, '_blank', 'noopener');
}

export async function render(raiz, { estado, args = [] }) {
  const [cat, itensIniciais, compactadosIniciais] = await Promise.all([
    api.get('/api/catalogo'),
    api.get('/api/biblioteca'),
    api.get('/api/compactados').catch(() => []),
  ]);
  let itens = itensIniciais;
  let compactados = compactadosIniciais;
  const categorias = new Map(cat.categorias.map((c) => [c.id, c]));
  let filtro = args[0] || 'todos'; // #/biblioteca/energia abre já filtrado
  let filtroTipo = 'todos';
  const ordemCategoria = new Map(cat.categorias.map((c, i) => [c.id, i]));
  let termo = '';
  const semAcento = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  raiz.append(cabecalho('Acervo', 'Biblioteca', 'Tudo o que está guardado neste computador. Busque por assunto para encontrar até dentro dos PDFs.',
    h('a', { class: 'botao', href: '#/alimentar' }, icone('enviar', 16), 'Adicionar arquivos'),
    h('a', { class: 'botao primario', href: '#/configurar' }, icone('baixar', 16), 'Baixar mais')));

  const entrada = h('input', { type: 'search', placeholder: 'Buscar: "picada de escorpião", "cisterna", "painel solar"…', 'aria-label': 'Buscar na biblioteca' });
  const resultados = h('div');
  const compactadosEl = h('div');
  const filtros = h('div', { class: 'filtros' });
  const filtrosTipo = h('div', { class: 'filtros filtros-tipo' });
  const grade = h('div');
  raiz.append(h('div', { class: 'linha', style: { marginBottom: '14px' } }, h('div', { class: 'busca' }, icone('busca', 18), entrada)), resultados, compactadosEl, filtros, filtrosTipo, grade);

  let espera;
  entrada.addEventListener('input', () => {
    termo = entrada.value.trim();
    clearTimeout(espera);
    desenharGrade();
    desenharCompactados();
    espera = setTimeout(buscarConteudo, 450);
  });

  async function buscarConteudo() {
    if (termo.length < 3) return resultados.replaceChildren();
    resultados.replaceChildren(h('div', { class: 'cartao', style: { marginBottom: '16px' } }, h('span', { class: 'suave' }, 'Procurando dentro dos documentos…')));
    try {
      const r = await api.get(`/api/buscar?q=${encodeURIComponent(termo)}`);
      if (!r.trechos.length && !r.artigos.length) {
        resultados.replaceChildren(h('div', { class: 'cartao plano', style: { marginBottom: '16px' } }, h('span', { class: 'suave' }, 'Nada encontrado dentro dos documentos.')));
        return;
      }
      const destacar = (txt) => {
        const el = h('p');
        const palavras = termo.split(/\s+/).filter((p) => p.length > 2).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const re = palavras.length ? new RegExp(`(${palavras.join('|')})`, 'gi') : null;
        for (const parte of re ? txt.split(re) : [txt]) el.append(re && re.test(parte) ? h('mark', {}, parte) : parte);
        return el;
      };
      resultados.replaceChildren(
        h('div', { class: 'cartao', style: { padding: 0, marginBottom: '20px' } },
          r.trechos.map((t) =>
            h('a', { class: 'resultado', href: '#', style: { display: 'block', color: 'inherit' }, onclick: (e) => {
              e.preventDefault();
              const it = itens.find((i) => i.id === t.docId);
              if (it) abrirItem(it, { pagina: t.pagina });
            } },
              h('b', {}, t.titulo, t.pagina ? h('span', { class: 'suave' }, ` · página ${t.pagina}`) : null),
              destacar(`${t.texto.slice(0, 260)}…`))),
          r.artigos.map((a) =>
            h('a', { class: 'resultado', href: `#/enciclopedia/${encodeURIComponent(`link${a.link}`)}`, style: { display: 'block', color: 'inherit' } },
              h('b', {}, a.titulo, h('span', { class: 'suave' }, ` · ${a.livro}`)),
              destacar(`${a.texto.slice(0, 260)}…`))))
      );
    } catch (e) {
      resultados.replaceChildren();
      toast(e.message, 'erro');
    }
  }

  async function descompactar(c, botao) {
    const botoes = [...compactadosEl.querySelectorAll('button')];
    for (const b of botoes) b.disabled = true;
    const bruto = c.formato === 'bruto';
    const acao = bruto ? 'Instalando…' : 'Descompactando…';
    botao.replaceChildren(icone('pacote', 14), acao);
    try {
      await api.post('/api/compactados/descompactar', { id: c.id });
      compactados = compactados.filter((x) => x.id !== c.id);
      itens = await api.get('/api/biblioteca');
      desenharFiltros();
      desenharGrade();
      desenharCompactados();
      toast(`“${c.titulo}” ${bruto ? 'instalado' : 'descompactado'} e adicionado à biblioteca.`);
    } catch (e) {
      for (const b of botoes) b.disabled = false;
      botao.replaceChildren(icone('pacote', 14), bruto ? 'Instalar' : 'Descompactar');
      toast(e.message, 'erro');
    }
  }

  function desenharCompactados() {
    const visiveis = compactados.filter((c) => !termo || semAcento(`${c.titulo} ${c.fonte || ''}`).includes(semAcento(termo)));
    if (!visiveis.length) {
      compactadosEl.replaceChildren();
      return;
    }
    compactadosEl.replaceChildren(
      h('details', { class: 'cartao compactados', ...(visiveis.length <= 8 || termo ? { open: true } : {}) },
        h('summary', { class: 'compactados-topo' },
          h('span', { class: 'compactados-titulo' }, icone('pacote', 18), 'Arquivos compactados'),
          h('span', { class: 'suave' }, termo
            ? `${visiveis.length} de ${compactados.length}`
            : `${compactados.length} esperando descompactar${compactados.some((c) => c.tamanhoPacote) ? ` · ${bytes(compactados.reduce((a, c) => a + (c.tamanhoPacote || 0), 0))}` : ''}`)),
        h('p', { class: 'suave compactados-dica' }, 'Baixados, mas ainda compactados. Descompacte só o que quer consultar agora — não precisa rodar o Iniciar Protocolo Zero.'),
        h('div', { class: 'compactados-lista' },
          visiveis.map((c) => {
            const botao = h('button', { class: 'botao pequeno', onclick: () => descompactar(c, botao) }, icone('pacote', 14), c.formato === 'bruto' ? 'Instalar' : 'Descompactar');
            return h('div', { class: 'compactado' },
              h('div', { class: 'compactado-info' },
                h('b', {}, c.titulo),
                h('span', { class: 'suave' }, [ROTULO_TIPO[c.tipo] || 'Arquivo', rotuloCompactado(c.formato), bytes(c.tamanhoPacote)].filter(Boolean).join(' · '))),
              botao);
          })))
    );
  }

  function desenharFiltros() {
    const usadas = [...new Set(itens.map((i) => i.categoria))].sort((a, b) => (ordemCategoria.get(a) ?? 99) - (ordemCategoria.get(b) ?? 99));
    // Tipos presentes na categoria escolhida (ou em tudo).
    const naCategoria = itens.filter((i) => filtro === 'todos' || i.categoria === filtro);
    const tipos = GRUPOS_TIPO.filter(([id]) => naCategoria.some((i) => grupoDoTipo(i.tipo) === id));
    if (filtroTipo !== 'todos' && !tipos.some(([id]) => id === filtroTipo)) filtroTipo = 'todos';
    filtrosTipo.replaceChildren(...(tipos.length > 1 ? [
      h('span', { class: 'suave', style: { fontSize: '13px' } }, 'Tipo:'),
      h('button', { class: `chip ${filtroTipo === 'todos' ? 'ativo' : ''}`, onclick: () => { filtroTipo = 'todos'; desenharFiltros(); desenharGrade(); } }, 'Todos os tipos'),
      ...tipos.map(([id, nome]) => h('button', { class: `chip ${filtroTipo === id ? 'ativo' : ''}`, onclick: () => { filtroTipo = id; desenharFiltros(); desenharGrade(); } },
        nome, h('span', { class: 'suave' }, `· ${naCategoria.filter((i) => grupoDoTipo(i.tipo) === id).length}`))),
    ] : []));
    filtros.replaceChildren(
      h('button', { class: `chip ${filtro === 'todos' ? 'ativo' : ''}`, onclick: () => { filtro = 'todos'; desenharFiltros(); desenharGrade(); } }, `Todos · ${itens.length}`),
      ...usadas.map((id) => {
        const c = categorias.get(id) || { nome: id };
        return h('button', { class: `chip ${filtro === id ? 'ativo' : ''}`, onclick: () => { filtro = id; desenharFiltros(); desenharGrade(); } },
          c.nome, h('span', { class: 'suave' }, `· ${itens.filter((i) => i.categoria === id).length}`));
      })
    );
  }

  function estadoTexto(it) {
    if (!it.indexavel) return null;
    if (it.falhaIndexacao) return h('span', { class: 'etiqueta perigo', title: it.falhaIndexacao }, 'Não foi possível ler');
    if (it.semTexto) return h('span', { class: 'etiqueta alerta', title: 'PDF escaneado (imagem): não dá para buscar dentro' }, 'Sem texto');
    if (it.trechos) return h('span', { class: 'etiqueta musgo' }, 'Pesquisável');
    return h('span', { class: 'etiqueta' }, 'Lendo…');
  }

  function desenharGrade() {
    const n = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const visiveis = itens.filter((i) => (filtro === 'todos' || i.categoria === filtro) && (filtroTipo === 'todos' || grupoDoTipo(i.tipo) === filtroTipo) && (!termo || n(`${i.titulo} ${i.fonte || ''}`).includes(n(termo))));
    if (!itens.length) {
      grade.replaceChildren(h('div', { class: 'vazio cartao' }, icone('livro', 48), h('h3', {}, 'Sua biblioteca está vazia'),
        h('p', {}, compactados.length ? 'Descompacte um dos arquivos acima ou adicione seus próprios arquivos.' : 'Baixe os pacotes recomendados ou adicione seus próprios arquivos.'),
        h('div', { class: 'linha', style: { justifyContent: 'center' } },
          h('a', { class: 'botao primario', href: '#/configurar' }, 'Instalar conteúdo'), h('a', { class: 'botao', href: '#/alimentar' }, 'Adicionar meus arquivos'))));
      return;
    }
    if (!visiveis.length) {
      grade.replaceChildren(h('div', { class: 'vazio' }, 'Nenhum item com esse nome.'));
      return;
    }
    // Categoria > tipo de arquivo (Livros e PDFs, Vídeos, Áudios…).
    const porCategoria = new Map();
    for (const it of visiveis) {
      if (!porCategoria.has(it.categoria)) porCategoria.set(it.categoria, []);
      porCategoria.get(it.categoria).push(it);
    }
    const blocos = [...porCategoria.entries()].sort((a, b) => (ordemCategoria.get(a[0]) ?? 99) - (ordemCategoria.get(b[0]) ?? 99));
    grade.replaceChildren(...blocos.map(([idCat, lista]) => {
      const c = categorias.get(idCat) || { cor: '#6d7168', nome: idCat };
      return h('section', { class: 'bib-categoria' },
        filtro === 'todos' ? h('h2', { class: 'bib-categoria-titulo', style: { '--cor': c.cor } }, c.nome, h('span', { class: 'suave' }, ` · ${lista.length}`)) : null,
        GRUPOS_TIPO.map(([idTipo, nomeTipo]) => {
          const doTipo = lista.filter((i) => grupoDoTipo(i.tipo) === idTipo);
          if (!doTipo.length) return null;
          return h('div', { class: 'bib-tipo' },
            h('h3', { class: 'bib-tipo-titulo' }, icone((GRUPOS_TIPO.find((g) => g[0] === idTipo)[2].map((t) => ICONE_TIPO[t]))[0] || 'pasta', 16), nomeTipo, h('span', { class: 'suave' }, ` · ${doTipo.length}`)),
            h('div', { class: 'livros' }, doTipo.map(cartao)));
        }));
    }));
  }

  function cartao(it) {
    const c = categorias.get(it.categoria) || { cor: '#6d7168', nome: it.categoria };
    return h('article', { class: 'livro' },
      h('div', { class: 'capa', style: { '--cor': c.cor } }, icone(ICONE_TIPO[it.tipo] || 'pasta', 34, { espessura: 1.5 }), h('span', { class: 'tipo' }, ROTULO_TIPO[it.tipo] || it.tipo)),
      h('div', {},
        h('h3', {}, it.titulo, SELO[it.confianca] ? h('span', { class: SELO[it.confianca][1], title: SELO[it.confianca][2] }, SELO[it.confianca][0]) : null),
        h('div', { class: 'meta' }, [it.fonte, bytes(it.tamanho)].filter(Boolean).join(' · '))),
      h('div', { class: 'acoes' },
        h('button', { class: 'botao pequeno primario', onclick: () => abrirItem(it) }, icone('abrir', 14), 'Abrir'),
        ['pdf', 'epub', 'texto'].includes(it.tipo) ? h('button', { class: 'botao pequeno', title: 'Ler no leitor do Protocolo Zero e traduzir com a IA do computador', onclick: () => abrirItem(it, { traduzir: true }) }, 'Traduzir') : null,
        estadoTexto(it),
        h('span', { style: { flex: 1 } }),
        h('button', { class: 'botao botao-icone fantasma', title: 'Editar nome e categoria', 'aria-label': `Editar ${it.titulo}`, onclick: () => editar(it) }, icone('lapis', 16)),
        h('button', { class: 'botao botao-icone fantasma', title: 'Remover', 'aria-label': `Remover ${it.titulo}`, onclick: async () => {
          if (!(await confirmar(`Remover “${it.titulo}” deste computador?`, { botao: 'Remover', perigo: true }))) return;
          try {
            await api.del(`/api/biblioteca/${encodeURIComponent(it.id)}`);
            itens = itens.filter((x) => x.id !== it.id);
            desenharFiltros();
            desenharGrade();
            toast('Removido.');
          } catch (e) {
            toast(e.message, 'erro');
          }
        } }, icone('lixo', 17))));
  }

  // Trocar o nome e a categoria de um item (o arquivo continua no mesmo lugar).
  function editar(it) {
    const nome = h('input', { type: 'text', value: it.titulo, maxlength: 160 });
    const fixa = it.tipo === 'mapa';
    const opcoes = cat.categorias.filter((c) => !CATEGORIAS_FORA_DO_USUARIO.has(c.id) || c.id === it.categoria);
    const categoria = h('select', { disabled: fixa }, opcoes.map((c) => h('option', { value: c.id, selected: c.id === it.categoria }, c.nome)));
    let fechar;
    const salvar = h('button', { class: 'botao primario', onclick: async () => {
      const titulo = nome.value.trim();
      if (!titulo) return nome.focus();
      salvar.disabled = true;
      try {
        const novo = await api.patch(`/api/biblioteca/${encodeURIComponent(it.id)}`, fixa ? { titulo } : { titulo, categoria: categoria.value });
        itens = itens.map((x) => (x.id === it.id ? { ...x, ...novo } : x));
        fechar();
        desenharFiltros();
        desenharGrade();
        toast('Salvo.');
      } catch (e) {
        salvar.disabled = false;
        toast(e.message, 'erro');
      }
    } }, 'Salvar');
    fechar = modal(h('div', { class: 'pilha' },
      h('h3', { style: { margin: 0 } }, 'Editar'),
      h('label', { class: 'campo' }, 'Nome', nome),
      h('label', { class: 'campo' }, 'Categoria', categoria),
      h('small', { class: 'suave' }, `Tipo: ${ROTULO_TIPO[it.tipo] || 'Arquivo'}. Ele aparece dentro da categoria, junto com os outros do mesmo tipo.`),
      h('div', { class: 'linha', style: { justifyContent: 'flex-end' } }, h('button', { class: 'botao', onclick: () => fechar() }, 'Cancelar'), salvar)), { largura: 480 });
    nome.focus();
  }

  desenharFiltros();
  desenharGrade();
  desenharCompactados();

  let concluidas = estado.tarefas.filter((t) => t.estado === 'concluido').length;
  const parar = aoAtualizar(async (tipo) => {
    if (tipo !== 'tarefas') return;
    const agora = estado.tarefas.filter((t) => t.estado === 'concluido').length;
    if (agora === concluidas) return;
    concluidas = agora;
    itens = await api.get('/api/biblioteca');
    compactados = await api.get('/api/compactados').catch(() => compactados);
    desenharFiltros();
    desenharGrade();
    desenharCompactados();
  });
  const recarregar = setInterval(async () => {
    // Atualiza o selo "Lendo…" → "Pesquisável" enquanto PDFs são indexados.
    if (!itens.some((i) => i.indexavel && !i.trechos && !i.falhaIndexacao && !i.semTexto)) return;
    itens = await api.get('/api/biblioteca').catch(() => itens);
    desenharGrade();
  }, 8000);
  return () => {
    parar();
    clearInterval(recarregar);
  };
}
