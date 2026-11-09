// Atualização do próprio programa (o código do Protocolo Zero), para quem baixou o ZIP do GitHub.
// Quem instalou com `git clone` atualiza com `git pull` (veja atualizar.js).
//
// Como funciona: compara cada arquivo deste computador com a versão publicada no repositório
// (pelo "hash" que o git usa) e baixa só os que mudaram. Cada arquivo baixado é conferido antes de
// ser usado e só substitui o antigo depois que todos chegaram inteiros. Os dados do usuário
// (pasta dados/), o Node.js preparado (runtime/) e as IAs (ia-modelos/) nunca são tocados.
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { RAIZ, DADOS, USER_AGENT, lerJSON, gravarJSON, existe } from './util.js';

export const REPOSITORIO = 'cezaraugustodev/protocolo-zero';
const RAMO = 'main';
const ARQ_VERSAO = path.join(DADOS, 'programa.json'); // { sha, data } da versão instalada
const PASTA_TEMP = path.join(DADOS, 'atualizacao-programa');
// Pastas inteiras do programa: arquivos que saíram do repositório também saem daqui.
const PASTAS = ['server', 'public', 'catalogo', 'instalar'];
const FORA = /^(dados|runtime|ia-modelos|node_modules)\//;

const caminho = (rel) => path.join(RAIZ, ...rel.split('/'));
// O git guarda os textos com fim de linha LF (.gitattributes: text=auto); no computador eles podem
// estar com CRLF (os .bat sempre ficam). Para comparar, faz como o git: texto sem o CR antes do LF.
const ehBat = (rel) => /\.bat$/i.test(rel);
const ehTexto = (buf) => !buf.subarray(0, 8000).includes(0);
const paraGit = (rel, buf) => (ehTexto(buf) ? Buffer.from(buf.toString('latin1').replace(/\r\n/g, '\n'), 'latin1') : buf);
const paraDisco = (rel, buf) => (ehBat(rel) ? Buffer.from(buf.toString('latin1').replace(/\r?\n/g, '\r\n'), 'latin1') : buf);
const hashGit = (buf) => crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');

export const instaladoComGit = () => existe(path.join(RAIZ, '.git'));

async function obterJSON(url, sinal) {
  const r = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github+json' },
    signal: sinal ? AbortSignal.any([sinal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
  });
  if (r.status === 403 || r.status === 429) throw new Error('O GitHub pediu para esperar um pouco antes de consultar de novo. Tente mais tarde.');
  if (!r.ok) throw new Error(`O GitHub respondeu ${r.status}`);
  return r.json();
}

/** Última versão publicada: { sha, data, mensagem }. */
async function versaoPublicada(sinal) {
  const c = await obterJSON(`https://api.github.com/repos/${REPOSITORIO}/commits/${RAMO}`, sinal);
  return { sha: c.sha, data: c.commit?.committer?.date || null, mensagem: String(c.commit?.message || '').split('\n')[0] };
}

/** Arquivos da versão publicada: [{ path, sha, size }]. */
async function arquivosPublicados(sha, sinal) {
  const t = await obterJSON(`https://api.github.com/repos/${REPOSITORIO}/git/trees/${sha}?recursive=1`, sinal);
  if (t.truncated) throw new Error('A lista de arquivos do programa veio incompleta. Tente de novo.');
  return (t.tree || []).filter((e) => e.type === 'blob' && !FORA.test(e.path) && !e.path.includes('..'));
}

async function arquivosLocais() {
  const lista = [];
  const andar = async (abs, rel) => {
    let ents = [];
    try {
      ents = await fsp.readdir(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) await andar(path.join(abs, e.name), r);
      else if (e.isFile()) lista.push(r);
    }
  };
  for (const p of PASTAS) await andar(caminho(p), p);
  return lista;
}

/** O que muda deste computador para a versão publicada: { mudar: [{path, sha, size}], apagar: [path] }. */
export async function diferencas(sha, sinal) {
  const publicados = await arquivosPublicados(sha, sinal);
  const mudar = [];
  for (const e of publicados) {
    const buf = await fsp.readFile(caminho(e.path)).catch(() => null);
    if (!buf || hashGit(paraGit(e.path, buf)) !== e.sha) mudar.push(e);
  }
  const nomes = new Set(publicados.map((e) => e.path));
  const apagar = (await arquivosLocais()).filter((p) => !nomes.has(p));
  return { mudar, apagar };
}

/**
 * Há versão nova do programa? { atualizado, sha, data, mensagem, arquivos, bytes }.
 * Só vale para instalações sem git (ZIP).
 */
export async function verificar(sinal) {
  const local = await lerJSON(ARQ_VERSAO, null);
  const pub = await versaoPublicada(sinal);
  if (local?.sha === pub.sha) return { atualizado: true, ...pub };
  const d = await diferencas(pub.sha, sinal);
  if (!d.mudar.length && !d.apagar.length) {
    // Os arquivos já são os da versão publicada (ex.: acabou de baixar o ZIP).
    await gravarJSON(ARQ_VERSAO, { sha: pub.sha, data: pub.data, quando: Date.now() }).catch(() => {});
    return { atualizado: true, ...pub };
  }
  return { atualizado: false, ...pub, arquivos: d.mudar.length + d.apagar.length, bytes: d.mudar.reduce((a, e) => a + (e.size || 0), 0) };
}

/** Baixa e instala a versão publicada. Devolve { sha, data, trocados, apagados }. */
export async function atualizar({ sinal, aoProgresso } = {}) {
  const pub = await versaoPublicada(sinal);
  const { mudar, apagar } = await diferencas(pub.sha, sinal);
  const temp = path.join(PASTA_TEMP, pub.sha);
  await fsp.rm(PASTA_TEMP, { recursive: true, force: true }).catch(() => {});
  await fsp.mkdir(temp, { recursive: true });
  try {
    // 1) Baixa tudo para uma pasta temporária, conferindo cada arquivo.
    const total = mudar.reduce((a, e) => a + (e.size || 0), 0);
    let feito = 0;
    for (const [i, e] of mudar.entries()) {
      if (sinal?.aborted) throw new Error('Cancelado');
      aoProgresso?.({ arquivo: e.path, n: i + 1, total: mudar.length, bytes: feito, totalBytes: total });
      const url = `https://raw.githubusercontent.com/${REPOSITORIO}/${pub.sha}/${e.path.split('/').map(encodeURIComponent).join('/')}`;
      let buf = null;
      for (let t = 0; t < 3 && !buf; t++) {
        try {
          const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: sinal ? AbortSignal.any([sinal, AbortSignal.timeout(300000)]) : AbortSignal.timeout(300000) });
          if (!r.ok) throw new Error(`O GitHub respondeu ${r.status}`);
          const b = Buffer.from(await r.arrayBuffer());
          if (hashGit(b) !== e.sha) throw new Error(`O arquivo ${e.path} chegou danificado`);
          buf = b;
        } catch (er) {
          if (sinal?.aborted || t === 2) throw er;
        }
      }
      const destino = path.join(temp, ...e.path.split('/'));
      await fsp.mkdir(path.dirname(destino), { recursive: true });
      await fsp.writeFile(destino, paraDisco(e.path, buf));
      feito += e.size || 0;
    }
    if (sinal?.aborted) throw new Error('Cancelado');

    // 2) Tudo chegou inteiro: troca os arquivos do programa.
    for (const e of mudar) {
      const alvo = caminho(e.path);
      await fsp.mkdir(path.dirname(alvo), { recursive: true });
      const tmp = `${alvo}.novo-${process.pid}`;
      await fsp.copyFile(path.join(temp, ...e.path.split('/')), tmp);
      await fsp.rename(tmp, alvo);
    }
    for (const rel of apagar) await fsp.rm(caminho(rel), { force: true }).catch(() => {});
    await gravarJSON(ARQ_VERSAO, { sha: pub.sha, data: pub.data, quando: Date.now() });
    return { sha: pub.sha, data: pub.data, trocados: mudar.length, apagados: apagar.length };
  } finally {
    await fsp.rm(PASTA_TEMP, { recursive: true, force: true }).catch(() => {});
  }
}
