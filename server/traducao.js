// Traduções prontas do leitor, guardadas por documento e por página/capítulo.
// Ficam em dados/traducoes/<id>/<número>.json para não traduzir o mesmo livro de novo
// a cada vez que ele é aberto (a IA do computador pode levar bastante tempo).
import fsp from 'node:fs/promises';
import path from 'node:path';
import { DADOS, lerJSON, gravarJSON, dentroDe } from './util.js';

const PASTA = path.join(DADOS, 'traducoes');
const pastaDe = (id) => path.join(PASTA, id);
const idValido = (id) => typeof id === 'string' && /^[\w.-]+$/.test(id) && !id.includes('..');

/** Traduções já feitas: { partes: { "1": { blocos: { "0": { texto, quando }, … } } } }. */
export async function obter(id) {
  if (!idValido(id)) return { partes: {} };
  let nomes = [];
  try {
    nomes = await fsp.readdir(pastaDe(id));
  } catch {
    return { partes: {} };
  }
  const partes = {};
  for (const nome of nomes) {
    const m = /^(\d+)\.json$/.exec(nome);
    if (!m) continue;
    const d = await lerJSON(path.join(pastaDe(id), nome), null);
    if (!d || !d.blocos || typeof d.blocos !== 'object') continue;
    const blocos = {};
    for (const [k, v] of Object.entries(d.blocos)) {
      if (v && typeof v.texto === 'string') blocos[k] = { texto: v.texto, quando: v.quando || null, chave: v.chave || null };
    }
    if (Object.keys(blocos).length) partes[m[1]] = { blocos };
  }
  return { partes };
}

/** Grava a tradução de um parágrafo (sobrescreve a anterior). */
export async function gravarBloco(id, indice, bloco, { texto, chave }) {
  if (!idValido(id)) throw new Error('Documento inválido');
  const n = Number(indice);
  const b = Number(bloco);
  if (!Number.isInteger(n) || n < 1 || n > 100000) throw new Error('Página inválida');
  if (!Number.isInteger(b) || b < 0 || b > 100000) throw new Error('Parágrafo inválido');
  const pasta = pastaDe(id);
  if (!dentroDe(PASTA, pasta)) throw new Error('Documento inválido');
  await fsp.mkdir(pasta, { recursive: true });
  const arquivo = path.join(pasta, `${n}.json`);
  const atual = await lerJSON(arquivo, { blocos: {} });
  const blocos = atual && typeof atual.blocos === 'object' ? atual.blocos : {};
  blocos[String(b)] = { texto: String(texto ?? '').slice(0, 20000), quando: Date.now() };
  // No PDF, "chave" identifica o trecho original: a tradução só é usada se o trecho for o mesmo.
  if (typeof chave === 'string' && /^[a-z0-9]{1,24}$/.test(chave)) blocos[String(b)].chave = chave;
  await gravarJSON(arquivo, { blocos, atualizado: Date.now() });
}

/** Apaga as traduções de um documento (usado quando o item sai da biblioteca). */
export async function remover(id) {
  if (!idValido(id)) return;
  const pasta = pastaDe(id);
  if (!dentroDe(PASTA, pasta)) return;
  await fsp.rm(pasta, { recursive: true, force: true }).catch(() => {});
}

// Estado da tradução do livro inteiro (feita em segundo plano a partir da Biblioteca ou do leitor).
// Fica em dados/traducoes/<id>/estado.json: { total, feitas, completo, atualizado }.
const arquivoEstado = (id) => path.join(pastaDe(id), 'estado.json');

export async function gravarEstado(id, { total, feitas, completo }) {
  if (!idValido(id)) throw new Error('Documento inválido');
  const pasta = pastaDe(id);
  if (!dentroDe(PASTA, pasta)) throw new Error('Documento inválido');
  const t = Math.max(0, Math.min(1e7, Math.round(Number(total) || 0)));
  const f = Math.max(0, Math.min(t, Math.round(Number(feitas) || 0)));
  await fsp.mkdir(pasta, { recursive: true });
  const estado = { total: t, feitas: f, completo: !!completo && f >= t, atualizado: Date.now() };
  await gravarJSON(arquivoEstado(id), estado);
  return estado;
}

/** Resumo das traduções guardadas: { <id>: { total, feitas, completo, bytes } } (para os cards da Biblioteca). */
export async function resumos() {
  let pastas = [];
  try {
    pastas = await fsp.readdir(PASTA, { withFileTypes: true });
  } catch {
    return {};
  }
  const saida = {};
  for (const p of pastas) {
    if (!p.isDirectory() || !idValido(p.name)) continue;
    const pasta = pastaDe(p.name);
    let bytes = 0;
    let partes = 0;
    for (const nome of await fsp.readdir(pasta).catch(() => [])) {
      const st = await fsp.stat(path.join(pasta, nome)).catch(() => null);
      if (st?.isFile()) bytes += st.size;
      if (/^\d+\.json$/.test(nome)) partes++;
    }
    const estado = await lerJSON(path.join(pasta, 'estado.json'), null);
    if (!estado && !partes) continue;
    saida[p.name] = { total: estado?.total || 0, feitas: estado?.feitas || 0, completo: !!estado?.completo, bytes };
  }
  return saida;
}
