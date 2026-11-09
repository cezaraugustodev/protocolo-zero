// Instala programas auxiliares portáteis (kiwix-serve, pmtiles) e bibliotecas JS para uso offline.
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { PASTAS, PLATAFORMA, baixar, progressoDe, espelhos, extrair, encontrarArquivo, existe, obterJSON, obterTexto, esperar, executar } from './util.js';

const EXE = PLATAFORMA === 'win32' ? '.exe' : '';
const ARCH = os.arch(); // x64 | arm64

export const caminhoKiwixServe = () => path.join(PASTAS.bin, `kiwix-serve${EXE}`);
export const caminhoPmtiles = () => path.join(PASTAS.bin, `pmtiles${EXE}`);

async function instalarBinario({ urlPacote, nomeBinario, destino, tarefa, sinal }) {
  const pacote = path.join(PASTAS.tmp, path.basename(new URL(urlPacote).pathname));
  tarefa.mensagem = `Baixando ${path.basename(pacote)}…`;
  await baixar(urlPacote, pacote, {
    sinal,
    onProgresso: progressoDe(tarefa),
  });
  tarefa.mensagem = 'Extraindo…';
  const pasta = path.join(PASTAS.tmp, `extr-${Date.now()}`);
  await extrair(pacote, pasta);
  const achado = await encontrarArquivo(pasta, nomeBinario);
  if (!achado) throw new Error(`${nomeBinario} não encontrado no pacote`);
  // Copia o binário e as DLLs/bibliotecas que estiverem ao lado dele.
  const origem = path.dirname(achado);
  for (const f of await fsp.readdir(origem)) {
    const de = path.join(origem, f);
    if ((await fsp.stat(de)).isFile()) await fsp.copyFile(de, path.join(PASTAS.bin, f));
  }
  if (PLATAFORMA !== 'win32') await fsp.chmod(destino, 0o755);
  await fsp.rm(pasta, { recursive: true, force: true });
  await fsp.rm(pacote, { force: true });
}

export async function instalarKiwix(tarefa, sinal) {
  const plat =
    PLATAFORMA === 'win32' ? 'win-x86_64' :
    PLATAFORMA === 'darwin' ? (ARCH === 'arm64' ? 'macos-arm64' : 'macos-x86_64') :
    ARCH === 'arm64' ? 'linux-aarch64' : 'linux-x86_64';
  tarefa.mensagem = 'Procurando a versão mais recente do Kiwix…';
  const base = 'https://download.kiwix.org/release/kiwix-tools/';
  // Lista de versões: tenta o site oficial e, se falhar, os espelhos.
  let html = '';
  for (const u of espelhos(base)) {
    try {
      html = await obterTexto(u, { sinal });
      if (html.includes('kiwix-tools_')) break;
    } catch (e) {
      if (sinal?.aborted) throw e;
    }
  }
  if (!html) throw new Error('Não foi possível consultar o site do Kiwix (sem internet?)');
  const re = new RegExp(`kiwix-tools_${plat}-(\\d+)\\.(\\d+)\\.(\\d+)\\.(zip|tar\\.gz)`, 'g');
  const versoes = [...new Set([...html.matchAll(re)].map((m) => m[0]))].sort((a, b) => {
    const va = a.match(/(\d+)\.(\d+)\.(\d+)/).slice(1).map(Number);
    const vb = b.match(/(\d+)\.(\d+)\.(\d+)/).slice(1).map(Number);
    return va[0] - vb[0] || va[1] - vb[1] || va[2] - vb[2];
  });
  if (!versoes.length) throw new Error(`Não há kiwix-tools para ${plat}`);
  await instalarBinario({ urlPacote: base + versoes.at(-1), nomeBinario: `kiwix-serve${EXE}`, destino: caminhoKiwixServe(), tarefa, sinal });
  tarefa.mensagemFinal = `Kiwix instalado (${versoes.at(-1).match(/\d+\.\d+\.\d+/)[0]})`;
}

export async function instalarPmtiles(tarefa, sinal) {
  tarefa.mensagem = 'Procurando a versão mais recente do pmtiles…';
  const rel = await obterJSON('https://api.github.com/repos/protomaps/go-pmtiles/releases/latest', { sinal });
  const so = PLATAFORMA === 'win32' ? 'Windows' : PLATAFORMA === 'darwin' ? 'Darwin' : 'Linux';
  const arq = ARCH === 'arm64' ? 'arm64' : 'x86_64';
  const asset = rel.assets.find((a) => a.name.includes(`_${so}_${arq}`) || a.name.includes(`${so}_${arq}`));
  if (!asset) throw new Error(`Não há pmtiles para ${so} ${arq}`);
  await instalarBinario({ urlPacote: asset.browser_download_url, nomeBinario: `pmtiles${EXE}`, destino: caminhoPmtiles(), tarefa, sinal });
  tarefa.mensagemFinal = `pmtiles instalado (${rel.tag_name})`;
}

// Bibliotecas de navegador guardadas localmente para funcionar sem internet.
const CDN = 'https://cdn.jsdelivr.net/npm/';
const ASSETS = 'https://protomaps.github.io/basemaps-assets/';
const FONTES = ['Noto Sans Regular', 'Noto Sans Medium', 'Noto Sans Italic'];
const FAIXAS = ['0-255', '256-511', '7936-8191', '8192-8447'];
export const ARQUIVOS_VENDOR = [
  ['pdfjs/pdf.min.mjs', `${CDN}pdfjs-dist@4.10.38/build/pdf.min.mjs`],
  ['pdfjs/pdf.worker.min.mjs', `${CDN}pdfjs-dist@4.10.38/build/pdf.worker.min.mjs`],
  ['maplibre/maplibre-gl.js', `${CDN}maplibre-gl@4.7.1/dist/maplibre-gl.js`],
  ['maplibre/maplibre-gl.css', `${CDN}maplibre-gl@4.7.1/dist/maplibre-gl.css`],
  ['pmtiles/pmtiles.js', `${CDN}pmtiles@3.2.1/dist/pmtiles.js`],
  ['basemaps/basemaps.js', `${CDN}@protomaps/basemaps@5.7.0/dist/basemaps.js`],
  ...['light', 'dark'].flatMap((t) =>
    [`${t}.json`, `${t}.png`, `${t}@2x.json`, `${t}@2x.png`].map((f) => [`sprites/${f}`, `${ASSETS}sprites/v4/${f}`])
  ),
  ...FONTES.flatMap((f) => FAIXAS.map((r) => [`fonts/${f}/${r}.pbf`, `${ASSETS}fonts/${encodeURIComponent(f)}/${r}.pbf`])),
];

export async function vendorInstalado() {
  for (const [rel] of ARQUIVOS_VENDOR) if (!(await existe(path.join(PASTAS.vendor, rel)))) return false;
  return true;
}

export async function instalarVendor(tarefa, sinal) {
  tarefa.total = ARQUIVOS_VENDOR.length;
  let i = 0;
  for (const [rel, url] of ARQUIVOS_VENDOR) {
    const destino = path.join(PASTAS.vendor, rel);
    if (!(await existe(destino))) {
      tarefa.mensagem = `Baixando ${rel}`;
      await baixar(url, destino, { sinal });
    }
    tarefa.baixado = ++i;
  }
  tarefa.mensagemFinal = 'Componentes de leitura e mapas prontos';
}

// ---------- Ollama ----------
/** Onde o Ollama costuma estar instalado em cada sistema. */
async function localizarOllama() {
  const candidatos =
    PLATAFORMA === 'win32'
      ? [path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama app.exe'), path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe'), 'C:\\Program Files\\Ollama\\ollama.exe']
      : PLATAFORMA === 'darwin'
        ? ['/Applications/Ollama.app', path.join(os.homedir(), 'Applications', 'Ollama.app')]
        : ['/usr/local/bin/ollama', '/usr/bin/ollama', path.join(os.homedir(), '.local', 'bin', 'ollama')];
  for (const c of candidatos) if (await existe(c)) return c;
  // Último recurso: procurar no PATH.
  try {
    const r = await executar(PLATAFORMA === 'win32' ? 'where' : 'which', ['ollama'], { timeout: 5000 });
    const linha = String(r.stdout || r).split(/\r?\n/).find((l) => l.trim());
    if (linha) return linha.trim();
  } catch {}
  return null;
}

export const ollamaInstalado = async () => !!(await localizarOllama());

/** Tenta ligar o Ollama já instalado. Retorna true se ele passou a responder. */
export async function ligarOllama(ollamaOnline, { esperaMs = 30000 } = {}) {
  if (await ollamaOnline()) return true;
  const alvo = await localizarOllama();
  if (!alvo) return false;
  try {
    if (PLATAFORMA === 'darwin' && alvo.endsWith('.app')) spawn('open', ['-a', alvo], { detached: true, stdio: 'ignore' }).unref();
    else if (/ollama app\.exe$/i.test(alvo)) spawn(alvo, [], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    else spawn(alvo, ['serve'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } catch {
    return false;
  }
  for (let i = 0; i < esperaMs / 1500; i++) {
    await esperar(1500);
    if (await ollamaOnline()) return true;
  }
  return false;
}

export async function instalarOllama(tarefa, sinal, ollamaOnline) {
  if (PLATAFORMA === 'linux') {
    throw new Error('No Linux, instale com: curl -fsSL https://ollama.com/install.sh | sh');
  }
  if (PLATAFORMA === 'win32') {
    const setup = path.join(PASTAS.tmp, 'OllamaSetup.exe');
    tarefa.mensagem = 'Baixando o instalador oficial do Ollama…';
    await baixar('https://ollama.com/download/OllamaSetup.exe', setup, {
      sinal,
      onProgresso: progressoDe(tarefa),
    });
    tarefa.mensagem = 'Instalando o Ollama (pode levar 1–2 minutos)…';
    await new Promise((resolve, reject) => {
      const p = spawn(setup, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART'], { windowsHide: true });
      p.on('error', reject);
      p.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`Instalador saiu com código ${c}`))));
    });
    await fsp.rm(setup, { force: true });
    const app = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama app.exe');
    if (!(await ollamaOnline()) && (await existe(app))) spawn(app, [], { detached: true, stdio: 'ignore' }).unref();
  } else {
    const zip = path.join(PASTAS.tmp, 'Ollama-darwin.zip');
    tarefa.mensagem = 'Baixando o Ollama para macOS…';
    await baixar('https://ollama.com/download/Ollama-darwin.zip', zip, {
      sinal,
      onProgresso: progressoDe(tarefa),
    });
    tarefa.mensagem = 'Copiando para Aplicativos…';
    let destino = '/Applications';
    try {
      await fsp.access(destino, (await import('node:fs')).constants.W_OK);
    } catch {
      destino = path.join(os.homedir(), 'Applications');
      await fsp.mkdir(destino, { recursive: true });
    }
    await extrair(zip, destino);
    await fsp.rm(zip, { force: true });
    spawn('open', ['-a', path.join(destino, 'Ollama.app')], { detached: true, stdio: 'ignore' }).unref();
  }
  tarefa.mensagem = 'Aguardando o Ollama iniciar…';
  for (let i = 0; i < 60; i++) {
    if (await ollamaOnline()) {
      tarefa.mensagemFinal = 'Ollama instalado e rodando';
      return;
    }
    await esperar(2000);
  }
  throw new Error('O Ollama foi instalado, mas não respondeu. Abra o aplicativo Ollama manualmente.');
}
