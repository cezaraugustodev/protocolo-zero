// Registro do que está instalado na máquina + upload ("Alimentar") + extração de texto.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import { DADOS, PASTAS, lerJSON, gravarJSON, nomeSeguro, arquivoLivre, dentroDe } from './util.js';
import { lerZip } from './zip.js';
import { removerDocumento } from './indice.js';
import { remover as removerTraducao } from './traducao.js';
import { remover as removerLeitura } from './leitura.js';

const ARQ = path.join(DADOS, 'biblioteca.json');
let reg = null;

async function carregar() {
  if (!reg) reg = await lerJSON(ARQ, { itens: {} });
  return reg;
}
const salvar = () => gravarJSON(ARQ, reg);

export const EXTENSOES = {
  pdf: 'pdf',
  epub: 'epub',
  txt: 'texto', md: 'texto', markdown: 'texto', html: 'texto', htm: 'texto', csv: 'texto',
  mp4: 'video', webm: 'video', mkv: 'video', mov: 'video', m4v: 'video', ogv: 'video',
  mp3: 'audio', ogg: 'audio', wav: 'audio', m4a: 'audio', opus: 'audio', flac: 'audio',
  jpg: 'imagem', jpeg: 'imagem', png: 'imagem', webp: 'imagem', gif: 'imagem', svg: 'imagem',
  zim: 'zim',
  pmtiles: 'mapa',
};
export const tipoPorNome = (nome) => EXTENSOES[path.extname(nome).slice(1).toLowerCase()] || 'outro';
export const indexavel = (tipo) => ['pdf', 'epub', 'texto'].includes(tipo);

export async function listar() {
  await carregar();
  return Object.values(reg.itens).sort((a, b) => (b.adicionado || 0) - (a.adicionado || 0));
}

export async function obter(id) {
  await carregar();
  return reg.itens[id];
}

export async function registrar(item) {
  await carregar();
  reg.itens[item.id] = { adicionado: Date.now(), ...reg.itens[item.id], ...item };
  await salvar();
  return reg.itens[item.id];
}

export async function atualizar(id, campos) {
  await carregar();
  if (!reg.itens[id]) return null;
  Object.assign(reg.itens[id], campos);
  await salvar();
  return reg.itens[id];
}

export async function remover(id) {
  await carregar();
  const it = reg.itens[id];
  if (!it) return null;
  if (it.arquivo) {
    const abs = path.join(DADOS, it.arquivo);
    if (dentroDe(DADOS, abs)) await fsp.rm(abs, { force: true });
  }
  await removerDocumento(id);
  await removerTraducao(id);
  await removerLeitura(id);
  delete reg.itens[id];
  await salvar();
  return it;
}

export const caminhoAbsoluto = (it) => path.join(DADOS, it.arquivo);

/** Recebe um upload (corpo da requisição = bytes do arquivo). */
export async function receberUpload(req, { nome, categoria = 'meus', titulo }) {
  const limpo = nomeSeguro(nome);
  const tipo = tipoPorNome(limpo);
  const pasta =
    tipo === 'zim' ? PASTAS.zim :
    tipo === 'mapa' ? PASTAS.mapas :
    path.join(PASTAS.meus, nomeSeguro(categoria));
  await fsp.mkdir(pasta, { recursive: true });
  const destino = await arquivoLivre(pasta, limpo);
  const parcial = `${destino}.enviando`;
  try {
    await pipeline(req, fs.createWriteStream(parcial));
    await fsp.rename(parcial, destino);
  } catch (e) {
    await fsp.rm(parcial, { force: true });
    throw e;
  }
  const { size } = await fsp.stat(destino);
  return registrar({
    id: `meu-${randomUUID().slice(0, 8)}`,
    tipo,
    titulo: titulo || path.basename(destino, path.extname(destino)),
    categoria: tipo === 'zim' || tipo === 'mapa' ? (tipo === 'mapa' ? 'mapas' : categoria) : categoria,
    fonte: 'Adicionado por você',
    origem: 'usuario',
    arquivo: path.relative(DADOS, destino).split(path.sep).join('/'),
    tamanho: size,
    indexado: false,
  });
}

const textoDeHtml = (html) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|h\d|li|br|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[#a-z0-9]+;/gi, (m) => decodificarHtml(m))
    .replace(/[ \t]+/g, ' ');

/** Extrai texto no servidor (TXT, MD, HTML, EPUB). PDFs são extraídos no navegador com pdf.js. */
export async function extrairTexto(it) {
  const abs = caminhoAbsoluto(it);
  if (it.tipo === 'texto') {
    const bruto = await fsp.readFile(abs, 'utf8');
    const texto = /\.html?$/i.test(abs) ? textoDeHtml(bruto) : bruto;
    return [{ texto, pagina: null }];
  }
  if (it.tipo === 'epub') {
    const capitulos = await capitulosDoEpub(abs, it.id);
    return capitulos.map((c, i) => ({ texto: c.texto, pagina: i + 1 }));
  }
  throw new Error(`Extração de texto não suportada no servidor para ${it.tipo}`);
}

// ---------- Leitura de livros no leitor do app (EPUB e texto) ----------
// O leitor mostra o livro por capítulos, com títulos e imagens do EPUB. O texto de cada
// capítulo também alimenta o botão "Traduzir o livro inteiro".

const ENTIDADES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  mdash: '—', ndash: '–', hellip: '…', laquo: '«', raquo: '»',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', deg: '°', middot: '·', bull: '•',
};

// Letras acentuadas (&aacute; &Ccedil; &otilde;…) e símbolos comuns, muito usados em EPUBs antigos.
const ACENTOS = { acute: '\u0301', grave: '\u0300', circ: '\u0302', tilde: '\u0303', uml: '\u0308', cedil: '\u0327', ring: '\u030A' };
for (const letra of 'aeiouycnAEIOUYCN') {
  for (const [nome, marca] of Object.entries(ACENTOS)) {
    const c = (letra + marca).normalize('NFC');
    if (c.length === 1) ENTIDADES[letra + nome] = c;
  }
}
Object.assign(ENTIDADES, {
  szlig: 'ß', aelig: 'æ', AElig: 'Æ', oslash: 'ø', Oslash: 'Ø', copy: '©', reg: '®', trade: '™', euro: '€', pound: '£', cent: '¢',
  ordm: 'º', ordf: 'ª', sup1: '¹', sup2: '²', sup3: '³', frac12: '½', frac14: '¼', frac34: '¾', times: '×', divide: '÷',
  plusmn: '±', micro: 'µ', para: '¶', sect: '§', iexcl: '¡', iquest: '¿', shy: '', zwnj: '', zwj: '', thinsp: ' ', ensp: ' ', emsp: ' ',
  sbquo: '‚', bdquo: '„', dagger: '†', Dagger: '‡', permil: '‰', prime: '′', Prime: '″', larr: '←', rarr: '→', uarr: '↑', darr: '↓',
});

function decodificarHtml(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16) || 32))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n) || 32))
    .replace(/&([a-z][a-z0-9]*);/gi, (m, n) => ENTIDADES[n] ?? ENTIDADES[n.toLowerCase()] ?? m);
}

const textoSimples = (html) =>
  decodificarHtml(String(html).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

function atributos(txt) {
  const o = {};
  for (const m of String(txt).matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    o[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return o;
}

/** Caminho de um arquivo dentro do EPUB, relativo ao arquivo que o citou. */
function resolverRel(base, href) {
  const limpo = String(href || '').split('#')[0].trim();
  if (!limpo || /^(?:[a-z]+:|\/\/)/i.test(limpo)) return '';
  return path.posix.normalize(path.posix.join(base === '.' ? '' : base, limpo)).replace(/^\.\//, '');
}

function lerEntrada(zip, caminho) {
  if (!caminho) return null;
  const tentativas = [caminho, caminho.replace(/\//g, '\\')];
  try {
    const decodificado = decodeURIComponent(caminho);
    tentativas.push(decodificado, decodificado.replace(/\//g, '\\'));
  } catch {}
  for (const t of tentativas) {
    const dados = zip.ler(t);
    if (dados) return dados;
  }
  return null;
}

/** Transforma o HTML de um capítulo em blocos simples (títulos, parágrafos e imagens). */
function blocosDeHtml(html, aoImagem) {
  const blocos = [];
  const fonte = String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, ' ');
  for (const parte of fonte.split(/(<img\b[^>]*>)/gi)) {
    if (/^<img\b/i.test(parte)) {
      const src = atributos(parte).src;
      const resolvido = src && aoImagem ? aoImagem(src) : null;
      if (resolvido) blocos.push({ tipo: 'imagem', src: resolvido });
      continue;
    }
    let marcado = parte
      .replace(/<h([1-6])\b[^>]*>/gi, '\u0001$1\u0001')
      .replace(/<\/(?:h[1-6]|p|div|li|blockquote|tr|table|section|article)>/gi, '\n\n')
      .replace(/<li\b[^>]*>/gi, '\n• ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<td\b[^>]*>/gi, ' · ')
      .replace(/<[^>]+>/g, ' ');
    marcado = decodificarHtml(marcado).replace(/\r/g, '');
    for (const bruto of marcado.split(/\n{2,}/)) {
      const limpo = bruto.replace(/[ \t\f\v]+/g, ' ').replace(/ *\n */g, '\n').trim();
      if (!limpo) continue;
      const titulo = /^\u0001([1-6])\u0001([\s\S]*)$/.exec(limpo);
      if (titulo) {
        const texto = titulo[2].replace(/\s+/g, ' ').trim();
        if (texto) blocos.push({ tipo: 'titulo', nivel: Number(titulo[1]), texto });
      } else {
        blocos.push({ tipo: 'paragrafo', texto: limpo });
      }
    }
  }
  return blocos;
}

function textoDosBlocos(blocos) {
  return blocos
    .map((b) => (b.tipo === 'imagem' ? '' : b.texto || ''))
    .filter((t) => t.trim())
    .join('\n\n')
    .trim();
}

/** Divide capítulos muito longos em partes menores, para ler e traduzir sem travar. */
function dividirPartes(partes, limite = 12000) {
  const saida = [];
  for (const p of partes) {
    const blocos = p.blocos?.length ? p.blocos : [{ tipo: 'paragrafo', texto: p.texto || '' }];
    const tamanho = blocos.reduce((a, b) => a + (b.texto?.length || 0), 0);
    if (tamanho <= limite) {
      saida.push({ ...p, blocos, texto: p.texto || textoDosBlocos(blocos) });
      continue;
    }
    const grupos = [];
    let atual = [];
    let conta = 0;
    for (const b of blocos) {
      const n = (b.texto || '').length + 40;
      if (atual.length && conta + n > limite) {
        grupos.push(atual);
        atual = [];
        conta = 0;
      }
      atual.push(b);
      conta += n;
    }
    if (atual.length) grupos.push(atual);
    grupos.forEach((g, k) => saida.push({
      ...p,
      titulo: `${p.titulo} — parte ${k + 1}`,
      blocos: g,
      texto: textoDosBlocos(g),
    }));
  }
  return saida.filter((p) => p.texto.trim());
}

// Um EPUB aberto recentemente fica em memória para o leitor e as imagens não o abrirem várias vezes.
const cacheZips = new Map();
async function zipDoArquivo(abs) {
  const st = await fsp.stat(abs);
  const anterior = cacheZips.get(abs);
  if (anterior && anterior.mtimeMs === st.mtimeMs && anterior.tamanho === st.size) return anterior.zip;
  const zip = await lerZip(abs);
  cacheZips.set(abs, { mtimeMs: st.mtimeMs, tamanho: st.size, zip });
  while (cacheZips.size > 3) cacheZips.delete(cacheZips.keys().next().value);
  return zip;
}

async function titulosDoEpub(zip, manifest, tocId) {
  const mapa = new Map();
  const itens = [...manifest.values()];
  const ncx = (tocId && manifest.get(tocId)) || itens.find((i) => /dtbncx/i.test(i['media-type'] || ''));
  if (ncx) {
    const xml = lerEntrada(zip, ncx.caminho)?.toString('utf8') || '';
    const base = path.posix.dirname(ncx.caminho);
    for (const m of xml.matchAll(/<navPoint\b[\s\S]*?<text[^>]*>([\s\S]*?)<\/text>[\s\S]*?<content\b[^>]*src\s*=\s*["']([^"']+)["']/gi)) {
      const caminho = resolverRel(base, m[2]);
      const titulo = textoSimples(m[1]);
      if (caminho && titulo) mapa.set(caminho, titulo);
    }
  }
  if (!mapa.size) {
    const nav = itens.find((i) => /(^|\s)nav(\s|$)/i.test(i.properties || ''));
    if (nav) {
      const xml = lerEntrada(zip, nav.caminho)?.toString('utf8') || '';
      const base = path.posix.dirname(nav.caminho);
      for (const m of xml.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        const caminho = resolverRel(base, m[1]);
        const titulo = textoSimples(m[2]);
        if (caminho && titulo) mapa.set(caminho, titulo);
      }
    }
  }
  return mapa;
}

async function capitulosDoEpub(abs, id) {
  const zip = await zipDoArquivo(abs);
  const container = lerEntrada(zip, 'META-INF/container.xml')?.toString('utf8');
  if (!container) throw new Error('EPUB inválido: falta o arquivo container.xml');
  const opfPath = (/full-path\s*=\s*"([^"]+)"/i.exec(container) || /full-path\s*=\s*'([^']+)'/i.exec(container))?.[1];
  const opf = opfPath ? lerEntrada(zip, opfPath)?.toString('utf8') : null;
  if (!opf) throw new Error('EPUB inválido: não foi possível abrir o índice do livro');
  const base = path.posix.dirname(opfPath);
  const manifest = new Map();
  for (const m of opf.matchAll(/<item\b([^>]*?)\/?>/gi)) {
    const a = atributos(m[1]);
    if (a.id && a.href) manifest.set(a.id, { ...a, caminho: resolverRel(base, a.href) });
  }
  const spineAttrs = atributos(/<spine\b([^>]*)>/i.exec(opf)?.[1] || '');
  const spine = /<spine\b[^>]*>([\s\S]*?)<\/spine>/i.exec(opf)?.[1] || '';
  const titulos = await titulosDoEpub(zip, manifest, spineAttrs.toc);
  const partes = [];
  for (const m of spine.matchAll(/<itemref\b([^>]*?)\/?>/gi)) {
    const ref = atributos(m[1]);
    const item = manifest.get(ref.idref);
    if (!item || !/x?html/i.test(item['media-type'] || '')) continue;
    const dados = lerEntrada(zip, item.caminho);
    if (!dados) continue;
    const blocos = blocosDeHtml(dados.toString('utf8'), (src) => {
      if (/^(?:[a-z]+:|\/\/|#)/i.test(src)) return null;
      const rel = resolverRel(path.posix.dirname(item.caminho), src);
      if (!rel) return null;
      return `/api/biblioteca/${encodeURIComponent(id)}/epub/${rel.split('/').map(encodeURIComponent).join('/')}`;
    });
    if (!blocos.length) continue;
    const texto = textoDosBlocos(blocos);
    if (!texto.trim()) continue; // capa/página só com imagem não vira capítulo numerado
    const capitulo = partes.length + 1;
    const titulo = titulos.get(item.caminho) || blocos.find((b) => b.tipo === 'titulo')?.texto || `Parte ${capitulo}`;
    partes.push({ capitulo, titulo, blocos, texto });
  }
  if (!partes.length) throw new Error('Não foi possível ler o texto deste EPUB (pode ter apenas imagens).');
  return partes;
}

async function lerEpubArquivo(abs, id) {
  return dividirPartes(await capitulosDoEpub(abs, id));
}

async function lerTextoArquivo(it) {
  const abs = caminhoAbsoluto(it);
  const bruto = (await fsp.readFile(abs, 'utf8')).replace(/\r\n?/g, '\n');
  let blocos;
  if (/\.html?$/i.test(abs)) {
    blocos = blocosDeHtml(bruto);
  } else {
    blocos = bruto.split(/\n{2,}/).map((t) => t.trim()).filter(Boolean).map((texto) => ({ tipo: 'paragrafo', texto }));
    if (!blocos.length && bruto.trim()) blocos = [{ tipo: 'paragrafo', texto: bruto.trim() }];
  }
  if (!blocos.length) throw new Error('Este arquivo não tem texto para ler.');
  return dividirPartes([{ titulo: it.titulo || 'Texto', blocos, texto: textoDosBlocos(blocos) }]);
}

/** Páginas/capítulos prontos para o leitor (EPUB e texto). PDFs são lidos no navegador. */
export async function partesDeLeitura(it) {
  if (it.tipo === 'epub') return lerEpubArquivo(caminhoAbsoluto(it), it.id);
  if (it.tipo === 'texto') return lerTextoArquivo(it);
  return [];
}

/** Entrega uma imagem de dentro do EPUB (o leitor mostra as ilustrações do livro). */
export async function entradaEpub(it, caminho) {
  if (it.tipo !== 'epub') return null;
  const rel = path.posix.normalize(String(caminho || '').replace(/\\/g, '/')).replace(/^\.\//, '');
  if (!rel || rel.startsWith('..') || rel.includes('../')) return null;
  const zip = await zipDoArquivo(caminhoAbsoluto(it));
  const dados = lerEntrada(zip, rel);
  if (!dados) return null;
  const MIME = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
    '.webp': 'image/webp', '.svg': 'image/svg+xml', '.bmp': 'image/bmp',
  };
  const mime = MIME[path.extname(rel).toLowerCase()];
  return mime ? { dados, mime } : null;
}
