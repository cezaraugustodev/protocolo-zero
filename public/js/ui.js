// Pequenos utilitários de interface: criação de elementos, ícones, formatação, avisos e janelas.

/** h('div', { class: 'x', onclick }, filhos...) */
export function h(tag, props = {}, ...filhos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [p, val] of Object.entries(v)) {
        if (p.startsWith('--')) el.style.setProperty(p, val);
        else el.style[p] = val;
      }
    }
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  anexar(el, filhos);
  return el;
}
function anexar(el, filhos) {
  for (const f of filhos.flat(Infinity)) {
    if (f == null || f === false) continue;
    el.append(f instanceof Node ? f : document.createTextNode(String(f)));
  }
}

const CAMINHOS = {
  marcador: 'M6 3h12v18l-6-4.5L6 21V3Z',
  lista: 'M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01',
  telacheia: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  sairtela: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  umapagina: 'M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z',
  duaspaginas: 'M3 5h7.5v15H3zM13.5 5H21v15h-7.5z',
  esquerda: 'm15 5-7 7 7 7',
  direita: 'm9 5 7 7-7 7',
  primeira: 'm17 5-7 7 7 7M7 5v14',
  ultima: 'm7 5 7 7-7 7M17 5v14',
  nota: 'M5 3h10l4 4v14H5V3Zm9 0v5h5M8 12h8M8 16h5',
  menos: 'M5 12h14',
  largura: 'M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4',
  inicio: 'M3 11.5 12 4l9 7.5M5 10v10h5v-6h4v6h5V10',
  configurar: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7.6 7.6 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z',
  livro: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15ZM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-5A8 8 0 1 1 21 12Z',
  enviar: 'M12 16V4m0 0-5 5m5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3',
  mapa: 'm9 4-6 2.5v14L9 18l6 2.5 6-2.5V4l-6 2.5L9 4Zm0 0v14m6-11.5v14',
  baixar: 'M12 4v12m0 0 5-5m-5 5-5-5M4 20h16',
  computador: 'M4 5h16v10H4zM2 19h20M9 15v4M15 15v4',
  nuvem: 'M7 18a4.5 4.5 0 0 1-.5-8.97A6 6 0 0 1 18 8.5a4.5 4.5 0 0 1-1 9.5H7Z',
  pacote: 'M21 8 12 3 3 8v8l9 5 9-5V8ZM3 8l9 5 9-5M12 13v8',
  semrede: 'M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 12.9a10 10 0 0 1 4.2-2.6M12 20h.01M19 12.9a10 10 0 0 0-2.3-1.6M2 8.8a15 15 0 0 1 4.3-2.6M22 8.8A15 15 0 0 0 10.7 5',
  ajustes: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  busca: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.3-4.3',
  cruz: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3Z',
  folha: 'M5 21c0-9 5-15 16-16-1 11-7 16-16 16Zm0 0 8-8',
  gota: 'M12 3s7 7.6 7 12a7 7 0 1 1-14 0c0-4.4 7-12 7-12Z',
  sol: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-15v2m0 16v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M2 12h2m16 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  broto: 'M12 21v-9m0 0C12 7 8 5 4 5c0 4 3 7 8 7Zm0 0c0-4 3-7 8-7 0 4-3 7-8 7Z',
  bussola: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm3.5-12.5-2 5-5 2 2-5 5-2Z',
  chave: 'M14.7 6.3a4 4 0 0 1 5 5l-1.6 1.6-5-5 1.6-1.6ZM13 8l-9 9v3h3l9-9',
  play: 'M7 4.5v15l12-7.5-12-7.5Z',
  pasta: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z',
  lixo: 'M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3',
  abrir: 'M14 4h6v6m0-6-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  x: 'M6 6l12 12M18 6 6 18',
  ok: 'm5 12.5 4.5 4.5L19 7.5',
  alerta: 'M12 9v4m0 4h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-10v5m0-8h.01',
  chip: 'M9 3v2m6-2v2M9 19v2m6-2v2M3 9h2m-2 6h2m14-6h2m-2 6h2M7 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm2 4h6v6H9V9Z',
  memoria: 'M3 8h18v8H3V8Zm4 0v8m5-8v8m5-8v8M6 16v3m12-3v3',
  disco: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6m-16 6c0 1.7 3.6 3 8 3s8-1.3 8-3',
  gpu: 'M3 7h18v10H3V7Zm4 10v3m4-3v3M8 12a2 2 0 1 0 4 0 2 2 0 0 0-4 0Zm7-2h3m-3 4h3',
  cerebro: 'M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a2 2 0 0 0-3-1Zm6 0a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1',
  globo: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-9-9h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3Z',
  telefone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z',
  fogo: 'M12 22a7 7 0 0 0 7-7c0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-3 3-5 5.5-5 8a7 7 0 0 0 7 7Z',
  coracao: 'M12 20s-8-4.8-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6.2-8 11-8 11Z',
  imagem: 'M4 5h16v14H4V5Zm0 11 4.5-4.5L13 16m-1.5-1.5L14 12l6 6M15.5 9.5h.01',
  texto: 'M6 3h9l4 4v14H6V3Zm9 0v4h4M9 12h7M9 16h7',
  audio: 'M9 18V6l11-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  atualizar: 'M20 11a8 8 0 0 0-14.9-3M4 4v4h4m-4 5a8 8 0 0 0 14.9 3M20 20v-4h-4',
  seta: 'm9 6 6 6-6 6',
  lua: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z',
  copiar: 'M9 9h10v12H9V9Zm-4 6H4V3h11v1',
  mais: 'M12 5v14M5 12h14',
  pino: 'M9 4h6l-1 6 4 4H6l4-4-1-6Zm3 10v7',
  lapis: 'M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4',
  clipe: 'M20 11.5 12 19.5a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.7 17.2a1.7 1.7 0 0 1-2.4-2.4L15 7',
  aviao: 'M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z',
  pontos: 'M5 12h.01M12 12h.01M19 12h.01',
  menu: 'M4 6h16M4 12h16M4 18h16',
  parar: 'M7 7h10v10H7V7Z',
  onda: 'M2 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 13c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0',
  montanha: 'M3 20 9 8l4 6 3-4 5 10H3Z',
  raio: 'M13 2 4 14h7l-1 8 9-12h-7l1-8Z',
  vento: 'M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8',
  sismo: 'M2 12h4l2-6 3 12 3-9 2 3h6',
  termometro: 'M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0Z',
  neve: 'M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 2 3-2M9 20l3-2 3 2',
  cometa: 'M21 3 10 14M15 3 8 10M21 9l-7 7M7 13a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z',
  virus: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0-4v4m0 10v4M3 12h4m10 0h4M5.6 5.6l2.9 2.9m7 7 2.9 2.9M5.6 18.4l2.9-2.9m7-7 2.9-2.9',
  quimico: 'M9 3h6M10 3v6L4 19a1.5 1.5 0 0 0 1.3 2h13.4a1.5 1.5 0 0 0 1.3-2L14 9V3M7 15h10',
  escudo: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z',
  radiacao: 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM10 10.3 7 5a8 8 0 0 0-4 7h6M14 12h7a8 8 0 0 0-4-7l-3 5.3M13 13.7l3 5.3a8 8 0 0 1-8 0l3-5.3',
  tomada: 'M9 2v6M15 2v6M7 8h10v4a5 5 0 0 1-10 0V8Zm5 9v5',
  cadeado: 'M6 11h12v10H6V11Zm2 0V7a4 4 0 0 1 8 0v4',
  robo: 'M8 8h8a3 3 0 0 1 3 3v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a3 3 0 0 1 3-3Zm4-4v4M9.5 13h.01M14.5 13h.01M9 16h6',
  carrinho: 'M3 4h2l2.5 11h10L20 7H6.2M9 20h.01M17 20h.01',
  pessoas: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 9a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6m2 9a6 6 0 0 0-3-5.2',
  sirene: 'M7 18v-6a5 5 0 0 1 10 0v6M5 21h14v-3H5v3ZM12 2v2M4 6l1.5 1.5M20 6l-1.5 1.5',
  emblema: 'M12 2.5c-3.6 0-6 4.3-6 9.5s2.4 9.5 6 9.5 6-4.3 6-9.5-2.4-9.5-6-9.5ZM8.9 17.6 15.1 6.4',
};

export function icone(nome, tamanho = 20, extra = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', tamanho);
  svg.setAttribute('height', tamanho);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', extra.espessura || 1.8);
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', CAMINHOS[nome] || CAMINHOS.info);
  svg.append(p);
  return svg;
}

export function bytes(b, casas) {
  if (b == null || isNaN(b)) return '—';
  if (b < 1) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(b) / Math.log(1000)));
  const v = b / 1000 ** i;
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: casas ?? (i >= 3 ? 1 : 0) })} ${u[i]}`;
}

export function toast(msg, tipo = '') {
  const t = h('div', { class: `toast ${tipo}` }, msg);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), tipo === 'erro' ? 7000 : 4000);
}

export function modal(conteudo, { largura } = {}) {
  const fechar = () => {
    fundo.remove();
    document.removeEventListener('keydown', esc);
  };
  const esc = (e) => e.key === 'Escape' && fechar();
  const caixa = h('div', { class: 'modal', style: largura ? { width: `min(${largura}px, 100%)` } : null, role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'linha entre', style: { marginBottom: '12px' } },
      h('div'),
      h('button', { class: 'botao botao-icone fantasma', 'aria-label': 'Fechar', onclick: fechar }, icone('x'))),
    conteudo);
  const fundo = h('div', { class: 'modal-fundo', onclick: (e) => e.target === fundo && fechar() }, caixa);
  document.addEventListener('keydown', esc);
  document.body.append(fundo);
  return fechar;
}

export function confirmar(pergunta, { botao = 'Confirmar', perigo = false } = {}) {
  return new Promise((resolve) => {
    let fechar;
    const responder = (v) => {
      fechar();
      resolve(v);
    };
    fechar = modal(
      h('div', { class: 'pilha' },
        h('h3', {}, pergunta),
        h('div', { class: 'linha', style: { justifyContent: 'flex-end' } },
          h('button', { class: 'botao', onclick: () => responder(false) }, 'Cancelar'),
          h('button', { class: `botao ${perigo ? 'perigo' : 'primario'}`, onclick: () => responder(true) }, botao))),
      { largura: 460 }
    );
  });
}

export const barra = (fracao, classe = '') =>
  h('div', { class: `barra ${classe} ${fracao == null ? 'indeterminada' : ''}` }, h('i', { style: { width: `${Math.round((fracao ?? 0.3) * 100)}%` } }));

export function cabecalho(sobretitulo, titulo, texto, ...acoes) {
  return h('div', { class: 'cabecalho' },
    h('div', {}, sobretitulo && h('div', { class: 'sobretitulo' }, sobretitulo), h('h1', {}, titulo), texto && h('p', {}, texto)),
    acoes.length ? h('div', { class: 'linha' }, ...acoes) : null);
}

export function aviso(tipo, ...conteudo) {
  const ic = { info: 'info', erro: 'alerta', ok: 'ok', '': 'alerta' }[tipo] ?? 'alerta';
  return h('div', { class: `aviso ${tipo}` }, icone(ic), h('div', {}, ...conteudo));
}

/**
 * Markdown seguro (o HTML vindo do modelo é sempre escapado).
 * Suporta: títulos, parágrafos, listas (aninhadas e de tarefas), citações (>), linhas (---),
 * tabelas com alinhamento, blocos de código com linguagem + botão copiar, código inline,
 * negrito, itálico, tachado, links http(s) e citações de fonte [n].
 * Tolera texto incompleto (streaming): bloco de código sem fechamento é exibido assim mesmo.
 */
export function markdown(texto, onCitacao) {
  const raiz = h('div', { class: 'md' });
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const inline = (s) => {
    const codigos = [];
    let r = esc(s).replace(/`([^`]+)`/g, (_, c) => `\u0000${codigos.push(c) - 1}\u0000`);
    r = r
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^_]+)__/g, '<strong>$1</strong>')
      .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>')
      .replace(/(^|[^_\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>')
      .replace(/\[(\d{1,2})\]/g, '<span class="cit" data-n="$1" role="button" tabindex="0">$1</span>');
    return r.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codigos[i]}</code>`);
  };
  const celulas = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  const ehSeparador = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);

  const linhas = texto.replace(/\r/g, '').split('\n');
  let i = 0;
  let paragrafo = [];
  const fecharParagrafo = () => {
    if (paragrafo.length) raiz.append(h('p', { html: paragrafo.map(inline).join('<br>') }));
    paragrafo = [];
  };

  while (i < linhas.length) {
    const l = linhas[i];

    // bloco de código
    const cerca = /^\s*(```|~~~)\s*([\w+#.-]*)/.exec(l);
    if (cerca) {
      fecharParagrafo();
      const corpo = [];
      i++;
      while (i < linhas.length && !new RegExp(`^\\s*${cerca[1]}\\s*$`).test(linhas[i])) corpo.push(linhas[i++]);
      i++;
      raiz.append(blocoCodigo(corpo.join('\n'), cerca[2]));
      continue;
    }

    // tabela
    if (l.includes('|') && i + 1 < linhas.length && ehSeparador(linhas[i + 1])) {
      fecharParagrafo();
      const cab = celulas(l);
      const alin = celulas(linhas[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : ''));
      i += 2;
      const corpo = [];
      while (i < linhas.length && linhas[i].includes('|') && linhas[i].trim()) corpo.push(celulas(linhas[i++]));
      const st = (k) => (alin[k] ? { textAlign: alin[k] } : {});
      raiz.append(h('div', { class: 'md-tabela' },
        h('table', {},
          h('thead', {}, h('tr', {}, cab.map((c, k) => h('th', { html: inline(c), style: st(k) })))),
          h('tbody', {}, corpo.map((r) => h('tr', {}, cab.map((_, k) => h('td', { html: inline(r[k] ?? ''), style: st(k) }))))))));
      continue;
    }

    // título
    const tit = /^\s*(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l);
    if (tit) {
      fecharParagrafo();
      raiz.append(h(`h${Math.min(6, tit[1].length + 2)}`, { html: inline(tit[2]) }));
      i++;
      continue;
    }

    // linha horizontal
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) {
      fecharParagrafo();
      raiz.append(h('hr'));
      i++;
      continue;
    }

    // citação
    if (/^\s*>/.test(l)) {
      fecharParagrafo();
      const corpo = [];
      while (i < linhas.length && /^\s*>/.test(linhas[i])) corpo.push(linhas[i++].replace(/^\s*>\s?/, ''));
      const bq = h('blockquote');
      bq.append(...markdown(corpo.join('\n')).childNodes);
      raiz.append(bq);
      continue;
    }

    // listas (com aninhamento por indentação)
    if (/^\s*([-*+•]|\d+[.)])\s+/.test(l)) {
      fecharParagrafo();
      const pilha = [];
      while (i < linhas.length) {
        const m = /^(\s*)([-*+•]|\d+[.)])\s+(.*)$/.exec(linhas[i]);
        if (!m) {
          // continuação de item (linha indentada) ou fim da lista
          if (linhas[i].trim() && /^\s{2,}/.test(linhas[i]) && pilha.length) {
            const li = pilha.at(-1).lista.lastChild;
            li?.insertAdjacentHTML('beforeend', `<br>${inline(linhas[i].trim())}`);
            i++;
            continue;
          }
          if (!linhas[i].trim() && i + 1 < linhas.length && /^\s*([-*+•]|\d+[.)])\s+/.test(linhas[i + 1])) {
            i++;
            continue;
          }
          break;
        }
        const nivel = m[1].replace(/\t/g, '    ').length;
        const tipo = /\d/.test(m[2]) ? 'ol' : 'ul';
        while (pilha.length && nivel < pilha.at(-1).nivel) pilha.pop();
        let topo = pilha.at(-1);
        if (!topo || nivel > topo.nivel || topo.tipo !== tipo) {
          if (topo && nivel === topo.nivel) pilha.pop();
          const nova = h(tipo, tipo === 'ol' && /^\d+/.test(m[2]) && Number.parseInt(m[2], 10) !== 1 ? { start: Number.parseInt(m[2], 10) } : {});
          const pai = pilha.at(-1)?.lista.lastChild;
          (pai && nivel > pilha.at(-1).nivel ? pai : raiz).append(nova);
          topo = { nivel, tipo, lista: nova };
          pilha.push(topo);
        }
        const tarefa = /^\[([ xX])\]\s+(.*)$/.exec(m[3]);
        topo.lista.append(tarefa
          ? h('li', { class: 'tarefa-md' }, h('input', { type: 'checkbox', disabled: true, checked: tarefa[1] !== ' ' }), h('span', { html: inline(tarefa[2]) }))
          : h('li', { html: inline(m[3]) }));
        i++;
      }
      continue;
    }

    if (!l.trim()) fecharParagrafo();
    else paragrafo.push(l.trim());
    i++;
  }
  fecharParagrafo();

  if (onCitacao) {
    raiz.querySelectorAll('.cit').forEach((c) => {
      const ir = () => onCitacao(Number(c.dataset.n));
      c.addEventListener('click', ir);
      c.addEventListener('keydown', (e) => e.key === 'Enter' && ir());
    });
  }
  return raiz;
}

/** Bloco de código com cabeçalho (linguagem) e botão copiar. */
export function blocoCodigo(codigo, linguagem = '') {
  const botao = h('button', { class: 'md-copiar', type: 'button', title: 'Copiar código' }, icone('copiar', 14), h('span', {}, 'Copiar'));
  botao.addEventListener('click', async () => {
    const ok = await copiarTexto(codigo);
    botao.lastChild.textContent = ok ? 'Copiado!' : 'Falhou';
    setTimeout(() => (botao.lastChild.textContent = 'Copiar'), 1600);
  });
  return h('div', { class: 'md-codigo' },
    h('div', { class: 'md-codigo-cab' }, h('span', {}, linguagem || 'texto'), botao),
    h('pre', {}, h('code', { class: linguagem ? `lang-${linguagem}` : '' }, codigo)));
}

export async function copiarTexto(t) {
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    // fallback para navegadores sem clipboard API
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } });
    ta.value = t;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {}
    ta.remove();
    return ok;
  }
}

export const tempo = (ms) => {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}min`;
};
