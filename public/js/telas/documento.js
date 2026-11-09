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

/** Impressão curta do texto original: a tradução guardada só vale para o mesmo trecho. */
function impressao(texto) {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) h1 = Math.imul(h1 ^ texto.charCodeAt(i), 16777619);
  return (h1 >>> 0).toString(36) + texto.length.toString(36);
}

/**
 * Junta os pedaços de texto de uma página de PDF (pdf.js) em blocos (parágrafos, títulos, legendas),
 * guardando onde cada bloco fica na página, para a tradução aparecer no mesmo lugar do original.
 */
function blocosDaPaginaPdf(conteudo, vp, Util) {
  const linhas = [];
  let linha = null;
  for (const item of conteudo.items) {
    if (typeof item.str !== 'string') continue;
    const t = Util.transform(vp.transform, item.transform);
    const tam = Math.hypot(t[2], t[3]);
    const horizontal = tam > 0 && Math.abs(t[1]) < tam * 0.05 && Math.abs(t[2]) < tam * 0.05;
    if (!item.str.trim() || !horizontal) {
      if (linha) linha.espaco = true;
      if (item.hasEOL && linha) linha.fim = true;
      continue;
    }
    const x = t[4];
    const base = t[5];
    const larg = item.width * vp.scale;
    const nova = !linha || linha.fim || Math.abs(base - linha.base) > tam * 0.5
      || x < linha.dir - tam * 0.5 || x - linha.dir > tam * 2.5;
    if (nova) {
      linha = { esq: x, dir: x + larg, base, tam, texto: item.str };
      linhas.push(linha);
    } else {
      const separa = (linha.espaco || x - linha.dir > tam * 0.15) && !/\s$/.test(linha.texto) && !/^\s/.test(item.str);
      linha.texto += (separa ? ' ' : '') + item.str;
      linha.dir = Math.max(linha.dir, x + larg);
      linha.tam = Math.max(linha.tam, tam);
    }
    linha.espaco = false;
    if (item.hasEOL) linha.fim = true;
  }

  const blocos = [];
  let b = null;
  for (const l of linhas) {
    const texto = l.texto.replace(/\s+/g, ' ').trim();
    if (!texto) continue;
    const topo = l.base - l.tam * 0.92;
    const fundo = l.base + l.tam * 0.28;
    const ultima = b?.linhas[b.linhas.length - 1];
    const junta = b && Math.abs(l.tam - b.tam) <= b.tam * 0.2 && topo > ultima.topo
      && topo - ultima.fundo < b.tam * 0.8 && l.esq < b.dir + b.tam && l.dir > b.esq - b.tam && b.texto.length < 1500;
    if (!junta) {
      b = { linhas: [], esq: l.esq, dir: l.dir, topo, fundo, tam: l.tam, texto: '' };
      blocos.push(b);
    }
    // Palavra quebrada com hífen no fim da linha volta a ficar inteira; item de lista começa em linha nova.
    b.texto = !b.texto ? texto
      : /^([•●▪◦■□➢►✓✔–—−-]|\d{1,2}[.)]|[a-z][.)])\s/u.test(texto) ? `${b.texto}\n${texto}`
        : /\p{L}-$/u.test(b.texto) && /^\p{Ll}/u.test(texto) ? b.texto.slice(0, -1) + texto : `${b.texto} ${texto}`;
    b.linhas.push({ topo, fundo });
    b.esq = Math.min(b.esq, l.esq);
    b.dir = Math.max(b.dir, l.dir);
    b.topo = Math.min(b.topo, topo);
    b.fundo = Math.max(b.fundo, fundo);
  }

  const lim = (v) => Math.min(1, Math.max(0, v));
  return blocos.filter((x) => /\p{L}/u.test(x.texto)).map((x) => {
    const m = x.tam * 0.12;
    const esq = lim((x.esq - m) / vp.width);
    const topo = lim((x.topo - m) / vp.height);
    return {
      tipo: 'paragrafo',
      texto: x.texto,
      chave: impressao(x.texto),
      fonte: x.tam / vp.height,
      caixa: { x: esq, y: topo, w: lim((x.dir + m) / vp.width) - esq, h: lim((x.fundo + m) / vp.height) - topo },
    };
  });
}

/** Cor do fundo em volta do bloco (mediana da borda) e uma cor de letra que dê para ler sobre ela. */
function coresDoBloco(ctx, largura, altura, caixa) {
  const x0 = Math.max(0, Math.floor(caixa.x * largura));
  const y0 = Math.max(0, Math.floor(caixa.y * altura));
  const w = Math.max(1, Math.min(largura, Math.ceil((caixa.x + caixa.w) * largura)) - x0);
  const hh = Math.max(1, Math.min(altura, Math.ceil((caixa.y + caixa.h) * altura)) - y0);
  let px;
  try {
    px = ctx.getImageData(x0, y0, w, hh).data;
  } catch {
    return { fundo: '#fff', letra: '#111' };
  }
  const canais = [[], [], []];
  const pegar = (x, y) => {
    const i = (y * w + x) * 4;
    canais[0].push(px[i]);
    canais[1].push(px[i + 1]);
    canais[2].push(px[i + 2]);
  };
  const passo = Math.max(1, Math.floor((w + hh) / 200));
  for (let x = 0; x < w; x += passo) { pegar(x, 0); pegar(x, hh - 1); }
  for (let y = 0; y < hh; y += passo) { pegar(0, y); pegar(w - 1, y); }
  const [r, g, bl] = canais.map((c) => c.sort((a, z) => a - z)[c.length >> 1] ?? 255);
  const luz = (cr, cg, cb) => 0.2126 * cr + 0.7152 * cg + 0.0722 * cb;
  // Cor da letra: média dos pontos de dentro do bloco mais diferentes do fundo (as letras do original).
  const dentro = [];
  const passoD = Math.max(1, Math.floor(Math.sqrt((w * hh) / 6000)));
  for (let y = 0; y < hh; y += passoD) {
    for (let x = 0; x < w; x += passoD) {
      const i = (y * w + x) * 4;
      const d = Math.abs(px[i] - r) + Math.abs(px[i + 1] - g) + Math.abs(px[i + 2] - bl);
      if (d > 120) dentro.push([d, px[i], px[i + 1], px[i + 2]]);
    }
  }
  let letra = luz(r, g, bl) > 140 ? '#111' : '#f5f5f5';
  if (dentro.length >= 5) {
    dentro.sort((a, z) => z[0] - a[0]);
    const topo = dentro.slice(0, Math.max(5, Math.floor(dentro.length * 0.3)));
    const m = [1, 2, 3].map((k) => Math.round(topo.reduce((s, p) => s + p[k], 0) / topo.length));
    if (Math.abs(luz(...m) - luz(r, g, bl)) > 90) letra = `rgb(${m[0]}, ${m[1]}, ${m[2]})`;
  }
  return { fundo: `rgb(${r}, ${g}, ${bl})`, letra };
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
      (traducoes[parte] ||= {})[bi] = { texto: t.texto, quando: t.quando || null, chave: t.chave || null };
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
  let blocosDaPagina = async () => [];
  let renderizarCanvas = async () => {};
  let desenharTraducaoPdf = async () => {};
  let ajustarBloco = () => {};

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
  async function salvarBloco(parte, bloco, texto, chave) {
    try {
      await api.put(`/api/biblioteca/${encodeURIComponent(id)}/traducao`, { indice: parte, bloco, texto, chave });
    } catch {}
  }

  // No PDF a tradução só vale se o trecho original for o mesmo (a mesma "chave").
  const traducaoDe = (parte, bloco) => {
    const t = traducoes[String(parte)]?.[String(bloco)];
    if (!t?.texto) return '';
    if (it.tipo === 'pdf' && t.chave !== blocosCache.get(parte)?.[bloco]?.chave) return '';
    return t.texto;
  };

  function podeMostrarTraducao(parte, bloco) {
    const texto = traducaoDe(parte, bloco);
    if (!texto) return false;
    const invertido = alternados.has(`${parte}:${bloco}`);
    return modoTraduzido ? !invertido : invertido;
  }

  function atualizarBlocoEl(parte, bloco, dados, el) {
    const texto = traducaoDe(parte, bloco);
    const mostrando = texto && podeMostrarTraducao(parte, bloco);
    // No PDF o bloco fica por cima da página: sem tradução à mostra, fica vazio e a página aparece.
    const sobrePagina = el.classList.contains('doc-sobre-bloco');
    el.textContent = mostrando ? texto : sobrePagina ? '' : dados.texto;
    el.classList.toggle('traduzido', !!mostrando);
    el.classList.toggle('tem-traducao', !!texto);
    el.classList.remove('traduzindo');
    if (texto) el.title = mostrando ? 'Clique para ver o texto original' : 'Clique para ver a tradução';
    else el.removeAttribute('title');
    ajustarBloco(el);
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
    avisoTrad.hidden = !modoTraduzido;
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
          if (indice !== parte || !modoTraduzido || alternados.has(chave)) return;
          const alvo = elementos.get(chave);
          if (alvo) {
            alvo.el.textContent = parcial;
            alvo.el.classList.add('traduzindo', 'tem-traducao');
            ajustarBloco(alvo.el);
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
    if (it.tipo === 'pdf') blocos = await blocosDaPagina(parte);
    else blocos = partes[parte - 1]?.blocos || [];
    blocosCache.set(parte, blocos);
    return blocos;
  }

  async function renderizarTexto(parte) {
    const blocos = await obterBlocos(parte);
    if (parte !== indice) return;
    elementos.clear();
    conteudo.replaceChildren();
    if (!blocos.length) {
      conteudo.append(aviso('info', 'Este trecho não tem texto para mostrar.'));
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
    // PDF: a página continua desenhada como no arquivo; a tradução aparece por cima, no lugar do texto original.
    if (it.tipo === 'pdf') {
      await renderizarCanvas(indice);
      await desenharTraducaoPdf(indice);
      return;
    }
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
    // Camada por cima da página: cada bloco traduzido cobre o texto original, no mesmo lugar e com a mesma cor de fundo.
    const sobre = h('div', { class: 'doc-sobre' });
    const folha = h('div', { class: 'doc-folha' }, canvas, sobre);
    const avisoPagina = h('div', { class: 'aviso info', hidden: true },
      'Esta página não tem texto (pode ter sido escaneada como imagem), por isso não dá para traduzir.');
    caixaCanvas = h('div', { class: 'doc-pagina-caixa' }, folha);
    visual.replaceChildren(avisoPagina, caixaCanvas);

    let renderAtual = null;
    let zoom = 1;

    blocosDaPagina = async (n) => {
      const pagina = await doc.getPage(n);
      return blocosDaPaginaPdf(await pagina.getTextContent(), pagina.getViewport({ scale: 1 }), pdfjs.Util);
    };

    // Diminui a letra até a tradução caber no espaço do texto original.
    ajustarBloco = (el) => {
      if (!el.classList.contains('doc-sobre-bloco')) return;
      if (!el.textContent) {
        el.style.fontSize = '';
        return;
      }
      let tam = Math.max(7, (Number(el.dataset.fonte) || 0.015) * canvas.clientHeight);
      el.style.fontSize = `${tam}px`;
      for (let i = 0; i < 40 && el.scrollHeight > el.clientHeight + 1 && tam > 5; i++) {
        tam *= 0.92;
        el.style.fontSize = `${tam}px`;
      }
    };

    desenharTraducaoPdf = async (n) => {
      const blocos = await obterBlocos(n);
      if (n !== indice) return;
      elementos.clear();
      sobre.replaceChildren();
      avisoPagina.hidden = !(modoTraduzido && !blocos.length);
      blocos.forEach((dados, bloco) => {
        const c = dados.caixa;
        const el = h('div', {
          class: 'doc-sobre-bloco',
          'data-fonte': String(dados.fonte),
          style: { left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.w * 100}%`, height: `${c.h * 100}%` },
        });
        el.addEventListener('click', () => alternarBloco(n, bloco, dados, el));
        elementos.set(`${n}:${bloco}`, { el, dados });
        sobre.append(el);
        atualizarBlocoEl(n, bloco, dados, el);
      });
      if (paginaPronta === n) pintarCores(n);
    };

    // As cores vêm da página desenhada: só dá para ler depois que o desenho termina.
    let paginaPronta = 0;
    function pintarCores(n) {
      const ctx = canvas.getContext('2d');
      for (const [chave, { el, dados }] of elementos) {
        if (!chave.startsWith(`${n}:`)) continue;
        dados.cor ||= coresDoBloco(ctx, canvas.width, canvas.height, dados.caixa);
        el.style.setProperty('--fundo', dados.cor.fundo);
        el.style.setProperty('--letra', dados.cor.letra);
      }
    }

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
      paginaPronta = 0;
      const desenho = pagina.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
      renderAtual = desenho;
      try {
        await desenho.promise;
      } catch (e) {
        if (e?.name !== 'RenderingCancelledException') throw e;
        return;
      }
      if (renderAtual !== desenho || n !== indice) return;
      paginaPronta = n;
      pintarCores(n);
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
      await mostrarParte();
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
        mostrarParte().catch(() => {});
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
