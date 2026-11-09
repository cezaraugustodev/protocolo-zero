// Utilitários compartilhados: caminhos, JSON, download com retomada e execução de processos.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DADOS = process.env.PROTOCOLO_ZERO_DADOS
  ? path.resolve(process.env.PROTOCOLO_ZERO_DADOS)
  : path.join(RAIZ, 'dados');

export const PASTAS = {
  bin: path.join(DADOS, 'bin'),
  zim: path.join(DADOS, 'zim'),
  pdf: path.join(DADOS, 'pdf'),
  mapas: path.join(DADOS, 'mapas'),
  meus: path.join(DADOS, 'meus'),
  indice: path.join(DADOS, 'indice'),
  vendor: path.join(DADOS, 'vendor'),
  tmp: path.join(DADOS, 'tmp'),
  pacotes: path.join(DADOS, 'pacotes'),
};

export const PLATAFORMA = process.platform; // win32 | darwin | linux
export const USER_AGENT = 'ProtocoloZero/0.1 (biblioteca offline)';

export async function garantirPastas() {
  for (const p of Object.values(PASTAS)) await fsp.mkdir(p, { recursive: true });
}

export async function lerJSON(arquivo, padrao) {
  try {
    return JSON.parse(await fsp.readFile(arquivo, 'utf8'));
  } catch {
    return padrao;
  }
}

// Gravação atômica e serializada por arquivo (evita corromper JSON com escritas concorrentes).
const filas = new Map();
export function gravarJSON(arquivo, dados) {
  const anterior = filas.get(arquivo) || Promise.resolve();
  const proxima = anterior.catch(() => {}).then(async () => {
    const tmp = `${arquivo}.${process.pid}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(dados, null, 2));
    // No Windows, antivírus ou indexador podem prender o arquivo por um instante (EPERM/EBUSY): tenta de novo.
    for (let tentativa = 0; ; tentativa++) {
      try {
        await fsp.rename(tmp, arquivo);
        break;
      } catch (e) {
        if (tentativa >= 6 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
        await new Promise((r) => setTimeout(r, 50 * 2 ** tentativa));
      }
    }
  });
  filas.set(arquivo, proxima);
  return proxima;
}

export async function existe(p) {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

export function nomeSeguro(nome) {
  const base = path.basename(String(nome || 'arquivo'))
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/^\.+/, '_')
    .trim();
  return base.slice(0, 180) || 'arquivo';
}

// Garante que `alvo` está dentro de `base` (bloqueia ../ e caminhos absolutos).
export function dentroDe(base, alvo) {
  const rel = path.relative(base, alvo);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export async function arquivoLivre(pasta, nome) {
  const ext = path.extname(nome);
  const base = nome.slice(0, nome.length - ext.length);
  let candidato = nome;
  for (let i = 2; await existe(path.join(pasta, candidato)); i++) candidato = `${base} (${i})${ext}`;
  return path.join(pasta, candidato);
}

// ---------------- registro de erros ----------------
const ARQ_ERROS = () => path.join(DADOS, 'logs', 'erros.log');

/** Acrescenta uma linha ao log de erros (dados/logs/erros.log), girando em 1 MB. Nunca lança. */
export async function registrarErro(contexto, erro) {
  try {
    const arq = ARQ_ERROS();
    await fsp.mkdir(path.dirname(arq), { recursive: true });
    try {
      if ((await fsp.stat(arq)).size > 1024 * 1024) await fsp.rename(arq, `${arq}.1`);
    } catch {}
    const msg = (erro?.message || String(erro)).replace(/\s+/g, ' ').slice(0, 800);
    await fsp.appendFile(arq, `${new Date().toISOString()}\t${contexto}\t${msg}\n`);
  } catch {}
}

/** Últimas linhas do log de erros, da mais recente para a mais antiga. */
export async function errosRecentes(limite = 30) {
  try {
    const linhas = (await fsp.readFile(ARQ_ERROS(), 'utf8')).trim().split('\n').filter(Boolean);
    return linhas.slice(-limite).reverse().map((l) => {
      const [quando, contexto, ...resto] = l.split('\t');
      return { quando, contexto, mensagem: resto.join('\t') };
    });
  } catch {
    return [];
  }
}

// ---------------- downloads ----------------
/** Cria um onProgresso que atualiza uma tarefa sem apagar campos ausentes. */
export const progressoDe = (tarefa) => ({ baixado, total, mensagem }) => {
  if (baixado != null) tarefa.baixado = baixado;
  if (total) tarefa.total = total;
  if (mensagem) tarefa.mensagem = mensagem;
};

class ErroDefinitivo extends Error {} // não adianta tentar de novo (404, página no lugar do arquivo…)

const ESPELHOS_KIWIX = ['https://download.kiwix.org/', 'https://mirrors.dotsrc.org/kiwix/', 'https://ftp.fau.de/kiwix/'];
/** Lista de endereços alternativos para o mesmo arquivo (hoje: espelhos oficiais do Kiwix). */
export function espelhos(url) {
  const base = ESPELHOS_KIWIX.find((b) => url.startsWith(b));
  if (!base) return [url];
  const resto = url.slice(base.length);
  return [url, ...ESPELHOS_KIWIX.filter((b) => b !== base).map((b) => b + resto)];
}

/**
 * Baixa `url` para `destino` com proteção contra falhas:
 * - retoma de `destino.parcial` (HTTP Range) — nada baixado é perdido;
 * - detecta download travado (sem dados por `travadoMs`) e reconecta;
 * - tenta de novo com espera crescente (até `tentativas` vezes) em erros de rede/servidor;
 * - alterna entre espelhos quando existem.
 * onProgresso({ baixado, total, mensagem }) é chamado periodicamente.
 */
export async function baixar(url, destino, { onProgresso, sinal, tentativas = 6, travadoMs = 60000 } = {}) {
  const urls = Array.isArray(url) ? url : espelhos(url);
  const esperas = [2000, 5000, 15000, 30000, 60000, 90000];
  let ultimoErro;
  for (let t = 0; t < tentativas; t++) {
    if (sinal?.aborted) throw sinal.reason || new Error('Cancelado');
    const atual = urls[t % urls.length];
    try {
      // Com espelhos disponíveis, um servidor lento demais também é motivo para trocar.
      return await baixarUmaVez(atual, destino, { onProgresso, sinal, travadoMs, lentoBps: urls.length > 1 ? 20000 : 0 });
    } catch (e) {
      if (sinal?.aborted) throw e;
      ultimoErro = e;
      await registrarErro(`download ${path.basename(destino)}`, `${e.message} (tentativa ${t + 1}, ${atual})`);
      // Erro definitivo só é definitivo se não houver outro espelho para tentar.
      if (e instanceof ErroDefinitivo && t + 1 >= urls.length) break;
      if (t + 1 < tentativas) {
        const ms = e instanceof ErroDefinitivo ? 500 : esperas[Math.min(t, esperas.length - 1)];
        onProgresso?.({ mensagem: `Falhou (${e.message}). Tentando de novo em ${Math.round(ms / 1000)}s…` });
        await esperar(ms, sinal);
      }
    }
  }
  throw ultimoErro;
}

async function baixarUmaVez(url, destino, { onProgresso, sinal, travadoMs, lentoBps = 0 }) {
  const parcial = `${destino}.parcial`;
  await fsp.mkdir(path.dirname(destino), { recursive: true });
  let inicio = 0;
  try {
    inicio = (await fsp.stat(parcial)).size;
  } catch {}

  // Sinal interno: cancelamento do usuário OU download travado.
  const ctrl = new AbortController();
  const repassar = () => ctrl.abort(sinal.reason);
  sinal?.addEventListener('abort', repassar, { once: true });
  let vigia = null;
  const rearmar = () => {
    clearTimeout(vigia);
    vigia = setTimeout(() => ctrl.abort(new Error('download travado (sem dados por muito tempo)')), travadoMs);
  };

  try {
    const headers = { 'User-Agent': USER_AGENT };
    if (inicio > 0) headers.Range = `bytes=${inicio}-`;
    rearmar();
    const resp = await fetch(url, { headers, redirect: 'follow', signal: ctrl.signal });

    if (resp.status === 416 && inicio > 0) {
      await fsp.rename(parcial, destino); // já estava completo
      return { tamanho: inicio };
    }
    if (!resp.ok) {
      const msg = `HTTP ${resp.status}`;
      throw resp.status >= 400 && resp.status < 500 && resp.status !== 408 && resp.status !== 429 ? new ErroDefinitivo(msg) : new Error(msg);
    }
    const tipo = resp.headers.get('content-type') || '';
    if (tipo.includes('text/html') && /\.(pdf|zim|zip|gz|pmtiles|json|js|mjs|css|exe|pbf|png)$/i.test(destino)) {
      throw new ErroDefinitivo('o servidor devolveu uma página em vez do arquivo (o link pode ter mudado)');
    }

    const retomando = resp.status === 206;
    if (!retomando) inicio = 0;
    const restante = Number(resp.headers.get('content-length') || 0);
    const total = restante ? inicio + restante : 0;
    let baixado = inicio;
    let ultimo = 0;
    // Janela para medir velocidade média (detecção de servidor lento).
    let janela = { quando: Date.now(), bytes: inicio };
    const JANELA_MS = 90000;

    const contador = new Transform({
      transform(pedaco, _enc, cb) {
        baixado += pedaco.length;
        rearmar();
        const agora = Date.now();
        if (lentoBps && agora - janela.quando > JANELA_MS) {
          const bps = ((baixado - janela.bytes) * 1000) / (agora - janela.quando);
          if (bps < lentoBps) {
            ctrl.abort(new Error(`servidor lento (${Math.round(bps / 1024)} KB/s), trocando de espelho`));
            return cb();
          }
          janela = { quando: agora, bytes: baixado };
        }
        if (onProgresso && agora - ultimo > 400) {
          ultimo = agora;
          onProgresso({ baixado, total, mensagem: 'Baixando…' });
        }
        cb(null, pedaco);
      },
    });

    await pipeline(Readable.fromWeb(resp.body), contador, fs.createWriteStream(parcial, { flags: retomando ? 'a' : 'w' }), { signal: ctrl.signal });
    if (total && baixado < total) throw new Error(`conexão encerrada antes do fim (${baixado} de ${total} bytes)`);
    onProgresso?.({ baixado, total: total || baixado, mensagem: 'Concluído' });
    await fsp.rename(parcial, destino);
    return { tamanho: baixado };
  } catch (e) {
    // Converte o "abort" do vigia em uma mensagem compreensível.
    if (ctrl.signal.aborted && !sinal?.aborted) throw ctrl.signal.reason instanceof Error ? ctrl.signal.reason : new Error('download interrompido');
    throw e;
  } finally {
    clearTimeout(vigia);
    sinal?.removeEventListener('abort', repassar);
  }
}

export async function obterJSON(url, opcoes = {}) {
  const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT, ...(opcoes.headers || {}) }, signal: opcoes.sinal });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} em ${url}`);
  return resp.json();
}

export async function obterTexto(url, opcoes = {}) {
  const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: opcoes.sinal });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} em ${url}`);
  return resp.text();
}

/** Executa um comando e devolve stdout (rejeita se o código de saída != 0). */
export function executar(cmd, args = [], { timeout = 60000, cwd } = {}) {
  // PowerShell: saída em UTF-8. Sem isso, nomes com acento (ex.: a pasta do usuário "Cézar")
  // chegam trocados ("C�zar") e os caminhos ficam errados.
  const iCmd = /^powershell(\.exe)?$/i.test(path.basename(cmd)) ? args.indexOf('-Command') : -1;
  if (iCmd >= 0 && typeof args[iCmd + 1] === 'string') {
    args = [...args];
    args[iCmd + 1] = `[Console]::OutputEncoding=[Text.Encoding]::UTF8; ${args[iCmd + 1]}`;
  }
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, windowsHide: true });
    let out = '';
    let err = '';
    const t = setTimeout(() => {
      p.kill();
      reject(new Error(`Tempo esgotado: ${cmd}`));
    }, timeout);
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => {
      clearTimeout(t);
      reject(e);
    });
    p.on('close', (codigo) => {
      clearTimeout(t);
      if (codigo === 0) resolve(out);
      else reject(new Error(err.trim() || `${cmd} saiu com código ${codigo}`));
    });
  });
}

/** Extrai .zip ou .tar.gz usando o `tar` do sistema (Windows 10+, macOS e Linux têm). */
export async function extrair(arquivo, destino) {
  await fsp.mkdir(destino, { recursive: true });
  if (arquivo.endsWith('.zip') && PLATAFORMA === 'linux') {
    await executar('unzip', ['-o', '-q', arquivo, '-d', destino], { timeout: 300000 });
  } else {
    await executar('tar', ['-xf', arquivo, '-C', destino], { timeout: 300000 });
  }
}

/** Procura recursivamente um arquivo por nome dentro de uma pasta. */
export async function encontrarArquivo(pasta, nome) {
  const entradas = await fsp.readdir(pasta, { withFileTypes: true });
  for (const e of entradas) {
    const p = path.join(pasta, e.name);
    if (e.isFile() && e.name.toLowerCase() === nome.toLowerCase()) return p;
    if (e.isDirectory()) {
      const achou = await encontrarArquivo(p, nome);
      if (achou) return achou;
    }
  }
  return null;
}

export function formatarBytes(b) {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(b) / Math.log(1024)));
  return `${(b / 1024 ** i).toFixed(i >= 3 ? 1 : 0)} ${u[i]}`;
}

/** Espera `ms`; termina antes (rejeitando) se `sinal` for cancelado. */
export const esperar = (ms, sinal) =>
  new Promise((resolve, reject) => {
    if (sinal?.aborted) return reject(sinal.reason || new Error('Cancelado'));
    const t = setTimeout(() => {
      sinal?.removeEventListener('abort', parar);
      resolve();
    }, ms);
    const parar = () => {
      clearTimeout(t);
      reject(sinal.reason || new Error('Cancelado'));
    };
    sinal?.addEventListener('abort', parar, { once: true });
  });
