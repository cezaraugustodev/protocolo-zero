// Leitor de livros do Protocolo Zero.
// Lê PDF (com pdf.js, o leitor de código aberto usado na indexação), EPUB e textos.
// A tradução substitui o texto no próprio documento, como o Google Tradutor faz em páginas:
// clique num parágrafo traduzido para ver o texto original.
import { h, icone, aviso, toast, modal, barra } from '../ui.js';
import { api } from '../api.js';
import { traduzirTexto } from '../traduzir.js';

const AVISO_TRAD = 'Tradução automática feita pela IA do computador: pode ter erros. Medidas de outros países ficam sublinhadas — clique para ver a conversão. Em saúde e emergência, siga as fontes oficiais.';
const SEM_PDFJS = 'O leitor de PDF ainda não foi baixado neste computador. Use "Instalar conteúdo" para baixar os componentes de leitura.';
const DICA_ORIGINAL = 'Clique em um parágrafo traduzido para ver o texto original.';

const ROTULO = { pdf: 'PDF', epub: 'Livro digital (EPUB)', texto: 'Texto' };

/** Corta um texto muito longo em pedaços de frase, para traduzir sem perder o sentido. */
function cortarEmFrases(texto, limite = 900) {
  const frases = texto.match(/[^.!?]+[.!?]+["”»)]?\s*|[^.!?]+$/g) || [texto];
  const pedacos = [];
  let atual = '';
  for (const f of frases) {
    const s = f.trim();
    if (!s) continue;
    if (atual && atual.length + s.length > limite) {
      pedacos.push(atual);
      atual = '';
    }
    atual += (atual ? ' ' : '') + s;
  }
  if (atual) pedacos.push(atual);
  return pedacos;
}

/** Texto extraído de uma página de PDF vira parágrafos clicáveis, um a um. */
function blocosDeTextoPdf(textoBruto) {
  const texto = String(textoBruto || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
  if (!texto) return [];
  let paragrafos = texto.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paragrafos.length <= 1) {
    const linhas = texto.split('\n').map((l) => l.trim()).filter(Boolean);
    paragrafos = [];
    let atual = '';
    for (const linha of linhas) {
      if (atual && atual.length + linha.length > 700) {
        paragrafos.push(atual);
        atual = '';
      }
      atual += (atual ? ' ' : '') + linha;
    }
    if (atual) paragrafos.push(atual);
  } else {
    paragrafos = paragrafos.flatMap((p) => (p.length > 1200 ? cortarEmFrases(p, 900) : [p]));
  }
  return paragrafos.map((p) => ({ tipo: 'paragrafo', texto: p }));
}

export async function render(raiz, { args = [] } = {}) {
  const id = args[0];
  const querTraducao = args.includes('traduzir');
  const posPagina = args.indexOf('pagina');
  const paginaInicial = posPagina >= 0 ? Math.max(1, Number(args[posPagina + 1]) || 1) : 1;

  if (!id) {
    raiz.append(aviso('erro', 'Documento não informado. Volte à Biblioteca e escolha um livro.'));
    return;
  }

  let it;
  let salvas;
  try {
    [it, salvas] = await Promise.all([
      api.get(`/api/biblioteca/${encodeURIComponent(id)}`),
      api.get(`/api/biblioteca/${encodeURIComponent(id)}/traducao`).catch(() => ({ partes: {} })),
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

  raiz.style.maxWidth = 'none';

  // Traduções guardadas: { "3": { "0": { texto, quando }, … }, … }.
  const traducoes = {};
  for (const [parte, dados] of Object.entries(salvas.partes || {})) {
    const blocos = dados?.blocos || {};
    for (const [bi, t] of Object.entries(blocos)) {
      if (!t?.texto) continue;
      (traducoes[parte] ||= {})[bi] = { texto: t.texto, quando: t.quando || null };
    }
  }

  const partes = []; // capítulos do EPUB ou partes do texto
  const blocosCache = new Map(); // parte -> blocos (PDF: parágrafos extraídos da página)
  const elementos = new Map(); // "parte:bloco" -> elemento na tela
  const alternados = new Set(); // blocos que o usuário mandou mostrar no idioma oposto ao modo atual

  let total = 0;
  let indice = 1;
  let modoTraduzido = querTraducao;
  let ctrl = null;
  let rodandoTudo = false;
  let destruirDoc = () => {};
  let reajustarVisual = () => {};
  let ir = async () => {};
  let textoDaPagina = async () => '';
  let renderizarCanvas = async () => {};

  // ----- topo -----
  const topo = h('div', { class: 'doc-topo' },
    h('div', { class: 'doc-topo-info' },
      h('a', { class: 'botao pequeno', href: '#/biblioteca' }, '← Biblioteca'),
      h('div', { class: 'doc-topo-titulo' },
        h('h1', {}, it.titulo),
        h('small', { class: 'suave' }, [ROTULO[it.tipo], it.fonte].filter(Boolean).join(' · ')))),
    h('div', { class: 'linha', style: { gap: '6px' } },
      h('a', { class: 'botao pequeno fantasma', href: `/arquivos/${it.arquivo}`, target: '_blank', rel: 'noopener', title: 'Abrir o arquivo original em outra aba' }, icone('abrir', 14), 'Abrir arquivo')));

  const ferramentas = h('div', { class: 'doc-ferramentas' });
  const visual = h('div', { class: 'doc-visual' });
  const conteudo = h('article', { class: 'doc-texto' });
  const caixaTexto = h('div', { class: 'doc-texto-caixa' }, conteudo);

  let caixaCanvas = null;

  // ----- botões de tradução e modo -----
  const btnOriginal = h('button', { onclick: () => definirModo(false) }, 'Original');
  const btnTraduzido = h('button', { onclick: () => definirModo(true) }, 'Traduzido');
  const seletorModo = h('div', { class: 'segmentado', 'aria-label': 'Idioma do texto' }, btnOriginal, btnTraduzido);

  const btnTraduzir = h('button', { class: 'botao pequeno primario' }, icone('texto', 14), 'Traduzir esta parte');
  const btnTraduzirTudo = h('button', { class: 'botao pequeno' }, icone('globo', 14), 'Traduzir o livro inteiro');
  const btnParar = h('button', { class: 'botao pequeno perigo', hidden: true, onclick: pararTraducao }, 'Parar');
  const estadoTrad = h('small', { class: 'suave' });
  const progresso = h('div', { class: 'doc-progresso' });
  const avisoTrad = h('div', { class: 'aviso info doc-aviso-traducao', hidden: !modoTraduzido }, icone('alerta', 15), h('div', {}, AVISO_TRAD));
  btnTraduzir.addEventListener('click', () => traduzirAtual());
  btnTraduzirTudo.addEventListener('click', () => traduzirTudo());

  raiz.append(topo, h('div', { class: 'doc-corpo' },
    h('section', { class: 'doc-principal' }, ferramentas, progresso, avisoTrad, visual)));

  // Setas do teclado viram a página (menos quando o foco está num campo ou há uma janela aberta).
  const aoTecla = (e) => {
    if (document.querySelector('.modal-fundo')) return;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if (e.key === 'ArrowLeft') ir(indice - 1);
    else if (e.key === 'ArrowRight') ir(indice + 1);
  };
  window.addEventListener('keydown', aoTecla);

  // ----- traduções -----
  async function salvarBloco(parte, bloco, texto) {
    try {
      await api.put(`/api/biblioteca/${encodeURIComponent(id)}/traducao`, { indice: parte, bloco, texto });
    } catch {}
  }

  const traducaoDe = (parte, bloco) => traducoes[String(parte)]?.[String(bloco)]?.texto || '';

  function podeMostrarTraducao(parte, bloco) {
    const texto = traducaoDe(parte, bloco);
    if (!texto) return false;
    const invertido = alternados.has(`${parte}:${bloco}`);
    return modoTraduzido ? !invertido : invertido;
  }

  function atualizarBlocoEl(parte, bloco, dados, el) {
    const texto = traducaoDe(parte, bloco);
    const mostrando = texto && podeMostrarTraducao(parte, bloco);
    el.textContent = mostrando ? texto : dados.texto;
    el.classList.toggle('traduzido', !!mostrando);
    el.classList.toggle('tem-traducao', !!texto);
    el.classList.remove('traduzindo');
    if (texto) el.title = mostrando ? 'Clique para ver o texto original' : 'Clique para ver a tradução';
    else el.removeAttribute('title');
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
    atualizarBotoesModo();
    mostrarParte();
    if (verTraducao) estadoTrad.textContent = DICA_ORIGINAL;
  }

  function atualizarBotoesModo() {
    btnOriginal.classList.toggle('ativo', !modoTraduzido);
    btnTraduzido.classList.toggle('ativo', modoTraduzido);
    if (caixaCanvas) caixaCanvas.hidden = modoTraduzido;
    caixaTexto.hidden = !!caixaCanvas && !modoTraduzido;
    avisoTrad.hidden = !modoTraduzido;
  }

  async function traduzirBloco(parte, bloco, sinal) {
    if (traducaoDe(parte, bloco)) return;
    const blocos = await obterBlocos(parte);
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
          if (indice !== parte || !modoTraduzido || alternados.has(chave)) return;
          const alvo = elementos.get(chave);
          if (alvo) {
            alvo.el.textContent = parcial;
            alvo.el.classList.add('traduzindo', 'tem-traducao');
          }
        },
      });
      if (!texto) return;
      (traducoes[String(parte)] ||= {})[String(bloco)] = { texto, quando: Date.now() };
      await salvarBloco(parte, bloco, texto);
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
        h('p', {}, `São ${quantidade} página(s)/capítulo(s). A IA do computador traduz um parágrafo de cada vez: um livro grande pode levar bastante tempo.`),
        h('p', { class: 'suave' }, 'O texto original é substituído pela tradução no próprio documento. Clique em um parágrafo traduzido para ver o original. Páginas já traduzidas são puladas, e você pode parar quando quiser.'),
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
      estadoTrad.textContent = `Traduzindo ${rotuloDe(parte)} · parágrafo ${bloco + 1} de ${blocos.length}…`;
      await traduzirBloco(parte, bloco, sinal);
    }
  }

  async function traduzirAtual() {
    if (ctrl) return;
    const meu = new AbortController();
    ctrl = meu;
    btnTraduzir.disabled = true;
    btnTraduzirTudo.disabled = true;
    btnParar.hidden = false;
    try {
      if (!modoTraduzido) {
        modoTraduzido = true;
        alternados.clear();
        atualizarBotoesModo();
      }
      await mostrarParte();
      await traduzirParte(indice, meu.signal);
      estadoTrad.textContent = `Tradução pronta. ${DICA_ORIGINAL}`;
    } catch (e) {
      if (e.name !== 'AbortError') estadoTrad.textContent = `Não foi possível traduzir: ${e.message}`;
    } finally {
      if (ctrl === meu) ctrl = null;
      btnTraduzir.disabled = false;
      btnTraduzirTudo.disabled = false;
      btnParar.hidden = true;
    }
  }

  async function traduzirTudo() {
    if (rodandoTudo || ctrl) return;
    if (!(await confirmarTraducao(total))) return;
    if (rodandoTudo || ctrl) return;
    const meu = new AbortController();
    ctrl = meu;
    rodandoTudo = true;
    btnTraduzir.disabled = true;
    btnTraduzirTudo.disabled = true;
    btnParar.hidden = false;
    let interrompeu = false;
    try {
      if (!modoTraduzido) {
        modoTraduzido = true;
        alternados.clear();
        atualizarBotoesModo();
      }
      await mostrarParte();
      // Começa pela página/capítulo aberto, para o usuário ver a tradução chegando na hora.
      const blocosAtuais = await obterBlocos(indice);
      if (blocosAtuais.some((b, bloco) => b.tipo !== 'imagem' && !traducaoDe(indice, bloco))) {
        progresso.replaceChildren(barra(0), h('small', { class: 'suave' }, `${rotuloDe(indice)} · começando por esta página`));
        await traduzirParte(indice, meu.signal);
      }
      for (let parte = 1; parte <= total; parte++) {
        if (meu.signal.aborted) {
          interrompeu = true;
          break;
        }
        if (parte === indice) continue;
        const blocos = await obterBlocos(parte);
        const falta = blocos.some((b, bloco) => b.tipo !== 'imagem' && !traducaoDe(parte, bloco));
        if (!falta) continue;
        progresso.replaceChildren(barra(parte / total), h('small', { class: 'suave' }, `${rotuloDe(parte)} · parte ${parte} de ${total}`));
        await traduzirParte(parte, meu.signal);
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        toast(`A tradução parou: ${e.message}`, 'erro');
        estadoTrad.textContent = `A tradução parou: ${e.message}`;
      } else interrompeu = true;
    } finally {
      rodandoTudo = false;
      btnTraduzir.disabled = false;
      btnTraduzirTudo.disabled = false;
      btnParar.hidden = true;
      progresso.replaceChildren();
      if (ctrl === meu) ctrl = null;
      if (!interrompeu) estadoTrad.textContent = `Tradução do livro concluída. ${DICA_ORIGINAL}`;
    }
  }

  // ----- navegação e renderização -----
  function rotuloDe(n) {
    return it.tipo === 'pdf' ? `Página ${n} de ${total}` : partes[n - 1]?.titulo || `Parte ${n} de ${total}`;
  }

  async function obterBlocos(parte) {
    if (blocosCache.has(parte)) return blocosCache.get(parte);
    let blocos;
    if (it.tipo === 'pdf') blocos = blocosDeTextoPdf(await textoDaPagina(parte));
    else blocos = partes[parte - 1]?.blocos || [];
    blocosCache.set(parte, blocos);
    return blocos;
  }

  async function renderizarTexto(parte) {
    const blocos = await obterBlocos(parte);
    if (parte !== indice) return;
    elementos.clear();
    conteudo.replaceChildren();
    if (it.tipo === 'pdf') {
      conteudo.append(h('small', { class: 'suave doc-nota-pdf' },
        'Texto traduzido desta página, em leitura corrida. Use "Original" para ver a página como no PDF.'));
    }
    if (!blocos.length) {
      conteudo.append(aviso('info', it.tipo === 'pdf'
        ? 'Esta página não tem texto (pode ser escaneada como imagem). Use "Original" para ver a página.'
        : 'Este trecho não tem texto para mostrar.'));
      return;
    }
    blocos.forEach((dados, bloco) => {
      if (dados.tipo === 'imagem') {
        conteudo.append(h('img', { class: 'doc-imagem', src: dados.src, alt: 'Ilustração do livro', loading: 'lazy' }));
        return;
      }
      const chave = `${parte}:${bloco}`;
      const tag = dados.tipo === 'titulo' ? (dados.nivel && dados.nivel <= 2 ? 'h2' : 'h3') : 'p';
      const texto = traducaoDe(parte, bloco);
      const mostrando = texto && podeMostrarTraducao(parte, bloco);
      const el = h(tag, {
        class: `doc-bloco${texto ? ' tem-traducao' : ''}${mostrando ? ' traduzido' : ''}`,
        title: texto ? (mostrando ? 'Clique para ver o texto original' : 'Clique para ver a tradução') : null,
      }, mostrando ? texto : dados.texto);
      el.addEventListener('click', () => alternarBloco(parte, bloco, dados, el));
      elementos.set(chave, { el, dados });
      conteudo.append(el);
    });
  }

  async function mostrarParte() {
    if (it.tipo === 'pdf' && !modoTraduzido) {
      if (caixaCanvas) caixaCanvas.hidden = false;
      caixaTexto.hidden = true;
      await renderizarCanvas(indice);
      return;
    }
    if (caixaCanvas) caixaCanvas.hidden = true;
    caixaTexto.hidden = false;
    await renderizarTexto(indice);
  }

  ir = async (n) => {
    if (!total || n < 1 || n > total || n === indice) return;
    indice = n;
    atualizarFerramentas();
    await mostrarParte();
    const caixa = conteudo.parentElement;
    if (caixa) caixa.scrollTop = 0;
  };

  let atualizarFerramentas = () => {};

  // ----- escolhe o tipo de leitor -----
  try {
    if (it.tipo === 'pdf') await montarPdf();
    else await montarTexto();
  } catch (e) {
    visual.replaceChildren(
      aviso('erro', e.message),
      h('div', { class: 'linha', style: { gap: '8px' } },
        h('a', { class: 'botao pequeno', href: '#/configurar' }, 'Instalar conteúdo'),
        h('a', { class: 'botao pequeno', href: `/arquivos/${it.arquivo}`, target: '_blank', rel: 'noopener' }, 'Abrir o arquivo original')),
    );
    ferramentas.replaceChildren();
    return () => {
      window.removeEventListener('keydown', aoTecla);
      destruirDoc();
    };
  }

  atualizarBotoesModo();
  await mostrarParte();
  if (modoTraduzido) estadoTrad.textContent = DICA_ORIGINAL;
  if (querTraducao) traduzirAtual();
  return () => {
    ctrl?.abort();
    window.removeEventListener('keydown', aoTecla);
    destruirDoc();
  };

  // ----- PDF (pdf.js) -----
  async function montarPdf() {
    let pdfjs;
    try {
      pdfjs = await import('/vendor/pdfjs/pdf.min.mjs');
    } catch {
      throw new Error(SEM_PDFJS);
    }
    pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
    const doc = await pdfjs.getDocument({ url: `/arquivos/${it.arquivo}`, isEvalSupported: false }).promise;
    total = doc.numPages;

    const canvas = h('canvas', { class: 'doc-pagina', role: 'img', 'aria-label': `Página ${indice} de ${total}` });
    caixaCanvas = h('div', { class: 'doc-pagina-caixa' }, canvas);
    visual.replaceChildren(caixaCanvas, caixaTexto);
    caixaCanvas.hidden = modoTraduzido;
    caixaTexto.hidden = !modoTraduzido;

    const textos = new Map();
    let renderAtual = null;
    let zoom = 1;

    async function textoDaPaginaLocal(n) {
      if (textos.has(n)) return textos.get(n);
      const pagina = await doc.getPage(n);
      const c = await pagina.getTextContent();
      let texto = '';
      for (const item of c.items) texto += item.str + (item.hasEOL ? '\n' : ' ');
      texto = texto.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
      textos.set(n, texto);
      return texto;
    }
    textoDaPagina = textoDaPaginaLocal;

    async function renderizarCanvasLocal(n) {
      const pagina = await doc.getPage(n);
      const base = pagina.getViewport({ scale: 1 });
      const largura = Math.max(260, (visual.clientWidth || 700) - 8);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const vp = pagina.getViewport({ scale: (largura / base.width) * dpr * zoom });
      canvas.width = Math.max(1, Math.round(vp.width));
      canvas.height = Math.max(1, Math.round(vp.height));
      canvas.style.width = `${Math.round(vp.width / dpr)}px`;
      canvas.style.height = `${Math.round(vp.height / dpr)}px`;
      canvas.setAttribute('aria-label', `Página ${n} de ${total}`);
      try {
        renderAtual?.cancel();
      } catch {}
      renderAtual = pagina.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
      try {
        await renderAtual.promise;
      } catch (e) {
        if (e?.name !== 'RenderingCancelledException') throw e;
      }
    }
    renderizarCanvas = renderizarCanvasLocal;

    const seletor = h('select', { class: 'doc-seletor', 'aria-label': 'Página', onchange: (e) => ir(Number(e.target.value)) },
      Array.from({ length: total }, (_, k) => h('option', { value: k + 1 }, `Página ${k + 1}`)));
    const anterior = h('button', { class: 'botao pequeno', onclick: () => ir(indice - 1) }, 'Anterior');
    const proxima = h('button', { class: 'botao pequeno', onclick: () => ir(indice + 1) }, 'Próxima');
    const menos = h('button', { class: 'botao pequeno', title: 'Diminuir página', onclick: () => mudarZoom(-0.15) }, '−');
    const mais = h('button', { class: 'botao pequeno', title: 'Aumentar página', onclick: () => mudarZoom(0.15) }, '+');
    const nivelZoom = h('span', { class: 'suave', style: { minWidth: '42px', textAlign: 'center' } }, '100%');

    async function mudarZoom(d) {
      zoom = Math.min(3, Math.max(0.5, Number((zoom + d).toFixed(2))));
      nivelZoom.textContent = `${Math.round(zoom * 100)}%`;
      if (!modoTraduzido) await renderizarCanvas(indice);
    }

    ferramentas.replaceChildren(
      h('div', { class: 'doc-linha-ferramentas' },
        anterior, seletor, proxima,
        h('span', { style: { flex: 1 } }),
        h('span', { class: 'doc-zoom' }, menos, nivelZoom, mais)),
      h('div', { class: 'doc-linha-ferramentas' },
        seletorModo, btnTraduzir, btnTraduzirTudo, btnParar, estadoTrad));
    btnTraduzir.replaceChildren(icone('texto', 14), 'Traduzir esta página');

    atualizarFerramentas = () => {
      anterior.disabled = indice <= 1;
      proxima.disabled = indice >= total;
      seletor.value = String(indice);
    };
    indice = Math.min(paginaInicial, total);
    atualizarFerramentas();

    let esperaResize;
    reajustarVisual = () => {
      clearTimeout(esperaResize);
      esperaResize = setTimeout(() => {
        if (!modoTraduzido) renderizarCanvas(indice).catch(() => {});
      }, 250);
    };
    window.addEventListener('resize', reajustarVisual);
    destruirDoc = () => {
      window.removeEventListener('resize', reajustarVisual);
      clearTimeout(esperaResize);
      Promise.resolve(doc.destroy?.()).catch(() => {});
    };
  }

  // ----- EPUB e texto -----
  async function montarTexto() {
    const dados = await api.get(`/api/biblioteca/${encodeURIComponent(id)}/leitura`);
    partes.push(...(dados.partes || []));
    if (!partes.length) throw new Error('Não há texto para mostrar neste arquivo.');
    total = partes.length;

    // Número da página vindo da busca = capítulo do EPUB; caps divididos mantêm o número original.
    const achado = paginaInicial > 1 ? partes.findIndex((p) => p.capitulo === paginaInicial) : -1;
    indice = achado >= 0 ? achado + 1 : 1;
    visual.replaceChildren(caixaTexto);

    let tamanhoFonte = 18;
    try {
      tamanhoFonte = Number(localStorage.getItem('pz-leitor-fonte')) || 18;
    } catch {}
    const aplicarFonte = () => {
      conteudo.style.fontSize = `${tamanhoFonte}px`;
      try {
        localStorage.setItem('pz-leitor-fonte', String(tamanhoFonte));
      } catch {}
    };
    aplicarFonte();

    const seletor = h('select', { class: 'doc-seletor', 'aria-label': 'Capítulo', onchange: (e) => ir(Number(e.target.value)) },
      partes.map((p, k) => h('option', { value: k + 1 }, p.titulo || `Parte ${k + 1}`)));
    const anterior = h('button', { class: 'botao pequeno', onclick: () => ir(indice - 1) }, 'Anterior');
    const proxima = h('button', { class: 'botao pequeno', onclick: () => ir(indice + 1) }, 'Próxima');
    const menor = h('button', { class: 'botao pequeno', title: 'Diminuir letra', onclick: () => mudarFonte(-1) }, 'A−');
    const maior = h('button', { class: 'botao pequeno', title: 'Aumentar letra', onclick: () => mudarFonte(1) }, 'A+');

    function mudarFonte(d) {
      tamanhoFonte = Math.min(30, Math.max(13, tamanhoFonte + d));
      aplicarFonte();
    }

    ferramentas.replaceChildren(
      h('div', { class: 'doc-linha-ferramentas' },
        anterior, seletor, proxima,
        h('span', { style: { flex: 1 } }), menor, maior),
      h('div', { class: 'doc-linha-ferramentas' },
        seletorModo, btnTraduzir, btnTraduzirTudo, btnParar, estadoTrad));
    btnTraduzir.replaceChildren(icone('texto', 14), it.tipo === 'epub' ? 'Traduzir este capítulo' : 'Traduzir esta parte');

    atualizarFerramentas = () => {
      anterior.disabled = indice <= 1;
      proxima.disabled = indice >= total;
      seletor.value = String(indice);
    };
    atualizarFerramentas();
  }
}
