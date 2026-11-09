// Notas de leitura: realces, notas e marcadores que o usuário faz nos livros (PDF, EPUB, texto)
// e a última página lida. Ficam em dados/leitura/<id>.json, só neste computador.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { DADOS, lerJSON, gravarJSON, dentroDe } from './util.js';

export const PASTA_LEITURA = path.join(DADOS, 'leitura');
const idValido = (id) => typeof id === 'string' && /^[\w.-]+$/.test(id) && !id.includes('..');
const arquivoDe = (id) => path.join(PASTA_LEITURA, `${id}.json`);
const CORES = new Set(['amarelo', 'verde', 'azul', 'rosa']);

const numero = (v, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
};
const inteiro = (v, min, max) => {
  const n = numero(v, min, max);
  return n == null ? null : Math.round(n);
};

/** Confere e limpa o que veio da tela (nunca grava algo fora do formato esperado). */
function limpar(d = {}) {
  const notas = (Array.isArray(d.notas) ? d.notas : []).slice(0, 5000).map((n) => {
    const nota = {
      id: String(n?.id || '').replace(/[^\w-]/g, '').slice(0, 40) || Math.random().toString(36).slice(2, 12),
      pagina: inteiro(n?.pagina, 1, 100000) || 1,
      cor: CORES.has(n?.cor) ? n.cor : 'amarelo',
      trecho: String(n?.trecho ?? '').slice(0, 4000),
      nota: String(n?.nota ?? '').slice(0, 20000),
      criado: inteiro(n?.criado, 0, 9e15) || Date.now(),
      atualizado: inteiro(n?.atualizado, 0, 9e15) || Date.now(),
    };
    // PDF: retângulos do realce (frações da página). EPUB/texto: parágrafo e posição do trecho nele.
    if (Array.isArray(n?.retangulos)) {
      nota.retangulos = n.retangulos.slice(0, 300).map((r) => ({
        x: numero(r?.x, 0, 1) ?? 0, y: numero(r?.y, 0, 1) ?? 0, w: numero(r?.w, 0, 1) ?? 0, h: numero(r?.h, 0, 1) ?? 0,
      }));
    }
    if (n?.bloco != null) {
      nota.bloco = inteiro(n.bloco, 0, 1e6) ?? 0;
      nota.inicio = inteiro(n.inicio, 0, 1e7) ?? 0;
      nota.fim = Math.max(nota.inicio, inteiro(n.fim, 0, 1e7) ?? 0);
    }
    return nota;
  });
  const marcadores = [...new Set((Array.isArray(d.marcadores) ? d.marcadores : [])
    .map((p) => inteiro(p, 1, 100000)).filter(Boolean))].sort((a, b) => a - b);
  return { notas, marcadores, ultima: inteiro(d.ultima, 1, 100000) || 1, atualizado: Date.now() };
}

export async function obter(id) {
  if (!idValido(id)) return limpar();
  const d = await lerJSON(arquivoDe(id), null);
  return d ? { ...limpar(d), atualizado: d.atualizado || null } : { ...limpar(), atualizado: null };
}

export async function gravar(id, dados) {
  if (!idValido(id)) throw new Error('Documento inválido');
  const arq = arquivoDe(id);
  if (!dentroDe(PASTA_LEITURA, arq)) throw new Error('Documento inválido');
  await fsp.mkdir(PASTA_LEITURA, { recursive: true });
  const limpo = limpar(dados);
  await gravarJSON(arq, limpo);
  return limpo;
}

/** Todas as notas de leitura, de todos os documentos (para a tela "Notas de leitura"). */
export async function todas() {
  let nomes = [];
  try {
    nomes = await fsp.readdir(PASTA_LEITURA);
  } catch {
    return [];
  }
  const lista = [];
  for (const nome of nomes) {
    const m = /^([\w.-]+)\.json$/.exec(nome);
    if (!m || !idValido(m[1])) continue;
    const d = await lerJSON(path.join(PASTA_LEITURA, nome), null);
    if (!d) continue;
    const limpo = limpar(d);
    if (!limpo.notas.length && !limpo.marcadores.length) continue;
    lista.push({ id: m[1], ...limpo, atualizado: d.atualizado || null });
  }
  return lista;
}

/** Apaga as notas de um documento (quando o item sai da biblioteca). */
export async function remover(id) {
  if (!idValido(id)) return;
  const arq = arquivoDe(id);
  if (dentroDe(PASTA_LEITURA, arq)) await fsp.rm(arq, { force: true }).catch(() => {});
}
