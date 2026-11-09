// Controla o kiwix-serve (leitor de arquivos ZIM: Wikipédia, iFixit, etc.) e faz buscas para o assistente.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { PASTAS, existe, esperar } from './util.js';
import { caminhoKiwixServe } from './ferramentas.js';

export const PORTA_KIWIX = Number(process.env.PROTOCOLO_ZERO_PORTA_KIWIX || 4322);
const BASE = `http://127.0.0.1:${PORTA_KIWIX}`;
// Ponte: repassa o kiwix-serve numa porta própria (outra origem, isolada do app) e injeta um script
// pequeno que entrega ao leitor só o texto da página aberta, para o botão "Traduzir".
export const PORTA_PONTE = PORTA_KIWIX + 1;
let ponte = null;
let origensApp = [];
export function definirOrigensApp(porta) {
  origensApp = [`http://localhost:${porta}`, `http://127.0.0.1:${porta}`, `http://[::1]:${porta}`];
}
const SCRIPT_PONTE = () => `(() => {
  const ok = ${JSON.stringify(origensApp)};
  const avisar = (alvo) => parent.postMessage({ pz: 'pagina', caminho: location.pathname + location.search, titulo: document.title }, alvo);
  if (parent === window || parent.parent !== parent) return;
  addEventListener('message', (e) => {
    if (!ok.includes(e.origin) || e.data?.pz !== 'pedirTexto') return;
    // O visualizador do kiwix mostra o artigo num quadro interno (mesma origem): lê o texto de lá.
    let doc = document;
    try { const f = document.querySelector('iframe'); if (f?.contentDocument?.body) doc = f.contentDocument; } catch {}
    const corpo = doc.querySelector('#mw-content-text, main, article, #content') || doc.body;
    const loc = doc.defaultView?.location || location;
    e.source.postMessage({ pz: 'texto', caminho: loc.pathname + loc.search, titulo: doc.title, texto: (corpo.innerText || '').slice(0, 60000) }, e.origin);
  });
  addEventListener('load', () => ok.forEach((o) => { try { avisar(o); } catch {} }));
})();`;

function iniciarPonte() {
  if (ponte) return;
  ponte = http.createServer((req, res) => {
    const host = (req.headers.host || '').toLowerCase();
    if (![`127.0.0.1:${PORTA_PONTE}`, `localhost:${PORTA_PONTE}`].includes(host) || !['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(403);
      return res.end();
    }
    if (req.url === '/__pz/ponte.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(SCRIPT_PONTE());
    }
    const cab = { ...req.headers, host: `127.0.0.1:${PORTA_KIWIX}`, 'accept-encoding': 'identity' };
    const pr = http.request({ host: '127.0.0.1', port: PORTA_KIWIX, path: req.url, method: req.method, headers: cab }, (r) => {
      const tipo = r.headers['content-type'] || '';
      if (!tipo.includes('text/html') || req.method === 'HEAD') {
        res.writeHead(r.statusCode, r.headers);
        return r.pipe(res);
      }
      const partes = [];
      r.on('data', (d) => partes.push(d));
      r.on('end', () => {
        let html = Buffer.concat(partes).toString('utf8');
        const tag = '<script src="/__pz/ponte.js"></script>';
        html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${tag}</body>`) : html + tag;
        const h = { ...r.headers };
        delete h['content-length'];
        delete h['content-encoding'];
        delete h.etag;
        res.writeHead(r.statusCode, h);
        res.end(html);
      });
    });
    pr.on('error', () => { res.writeHead(502); res.end(); });
    pr.end();
  });
  ponte.on('error', (e) => { console.error('[kiwix] ponte:', e.message); ponte = null; });
  ponte.listen(PORTA_PONTE, '127.0.0.1');
}
let processo = null;
let livros = []; // [{ nome, titulo, arquivo }]

async function arquivosZim() {
  try {
    return (await fsp.readdir(PASTAS.zim)).filter((f) => f.endsWith('.zim')).map((f) => path.join(PASTAS.zim, f));
  } catch {
    return [];
  }
}

export async function pararKiwix() {
  if (!processo) return;
  const p = processo;
  processo = null;
  p.kill();
  await new Promise((r) => {
    p.once('exit', r);
    setTimeout(r, 3000);
  });
}

export async function iniciarKiwix() {
  await pararKiwix();
  const bin = caminhoKiwixServe();
  const zims = await arquivosZim();
  if (!zims.length || !(await existe(bin))) {
    livros = [];
    return false;
  }
  processo = spawn(bin, [`--port=${PORTA_KIWIX}`, '--address=127.0.0.1', ...zims], {
    cwd: PASTAS.bin,
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let erro = '';
  processo.stderr.on('data', (d) => (erro = (erro + d).slice(-2000)));
  processo.on('exit', (c) => {
    if (c && c !== 0) console.error('[kiwix] saiu com código', c, erro.trim());
  });
  for (let i = 0; i < 40; i++) {
    await esperar(250);
    try {
      const r = await fetch(`${BASE}/catalog/v2/entries?count=500`);
      if (r.ok) {
        livros = lerLivros(await r.text());
        iniciarPonte();
        return true;
      }
    } catch {}
  }
  return false;
}

function lerLivros(xml) {
  return xml
    .split('<entry>')
    .slice(1)
    .map((e) => ({
      nome: /href="\/content\/([^"]+)"/.exec(e)?.[1],
      titulo: /<title>([^<]*)<\/title>/.exec(e)?.[1],
      idioma: /<language>([^<]*)<\/language>/.exec(e)?.[1],
      categoria: /<category>([^<]*)<\/category>/.exec(e)?.[1],
    }))
    .filter((l) => l.nome);
}

export const kiwixAtivo = () => !!processo;
export const livrosKiwix = () => livros;
export const urlKiwix = () => `http://127.0.0.1:${ponte ? PORTA_PONTE : PORTA_KIWIX}`;

const textoDeHtml = (html) =>
  html
    .replace(/<(script|style|table|nav|footer)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();

/** Busca artigos nos ZIMs de texto e devolve trechos para o assistente usar como contexto. */
export async function buscarNosZims(pergunta, { limite = 3, sinal } = {}) {
  if (!processo || !livros.length) return [];
  const deTexto = livros.filter((l) => !/^ted_|phet|gutenberg|freecodecamp/i.test(l.nome));
  const resultados = [];
  await Promise.all(
    deTexto.map(async (livro) => {
      try {
        const url = `${BASE}/search?books.name=${encodeURIComponent(livro.nome)}&pattern=${encodeURIComponent(pergunta)}&format=xml&pageLength=2`;
        const r = await fetch(url, { signal: sinal ?? AbortSignal.timeout(6000) });
        if (!r.ok) return;
        const xml = await r.text();
        for (const it of xml.split('<item>').slice(1, 3)) {
          const titulo = textoDeHtml(/<title>([\s\S]*?)<\/title>/.exec(it)?.[1] || '');
          const link = /<link>([\s\S]*?)<\/link>/.exec(it)?.[1]?.trim();
          if (!link) continue;
          resultados.push({ livro: livro.titulo, livroNome: livro.nome, titulo, link, ordem: resultados.length });
        }
      } catch {}
    })
  );
  const melhores = resultados.slice(0, limite);
  await Promise.all(
    melhores.map(async (m) => {
      try {
        const r = await fetch(`${BASE}${m.link}`, { signal: AbortSignal.timeout(6000) });
        m.texto = textoDeHtml(await r.text()).slice(0, 1800);
      } catch {
        m.texto = '';
      }
    })
  );
  return melhores.filter((m) => m.texto);
}
