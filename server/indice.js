// Índice de busca da biblioteca: trechos de texto + vetores (embeddings) para o assistente citar fontes.
// O texto entra no índice na hora (busca por palavras-chave); os vetores são gerados depois, em segundo plano.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { PASTAS, lerJSON, gravarJSON } from './util.js';
import { gerarEmbeddings } from './ollama.js';

const ARQ_TRECHOS = path.join(PASTAS.indice, 'trechos.jsonl');
const ARQ_VETORES = path.join(PASTAS.indice, 'vetores.f32');
const ARQ_META = path.join(PASTAS.indice, 'meta.json');
const DIM = 256; // vetores truncados (Matryoshka) para economizar memória

let trechos = []; // { docId, titulo, pagina, texto, termos:Set }
let vetores = []; // Float32Array(DIM) | null
let meta = { modelo: null, dim: DIM };
let carregado = false;
let gravacao = Promise.resolve();

const STOP = new Set('a o e é de do da dos das em no na nos nas um uma uns umas para por com sem que se ao aos à às ou como mais mas não sim seu sua seus suas ele ela eles elas isso isto esse essa este esta são ser foi era há tem ter pelo pela pelos pelas qual quais quando onde muito pouco já também me te lhe nos vos posso pode fazer faço the of and to in is'.split(' '));
const normalizar = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const tokenizar = (s) => normalizar(s).split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(normalizar(t)));

async function carregar() {
  if (carregado) return;
  carregado = true;
  meta = { ...meta, ...(await lerJSON(ARQ_META, {})) };
  try {
    const linhas = (await fsp.readFile(ARQ_TRECHOS, 'utf8')).split('\n').filter(Boolean);
    trechos = linhas.map((l) => {
      const t = JSON.parse(l);
      t.termos = new Set(tokenizar(t.texto));
      return t;
    });
  } catch {
    trechos = [];
  }
  vetores = new Array(trechos.length).fill(null);
  if (meta.modelo && meta.dim === DIM) {
    try {
      const buf = await fsp.readFile(ARQ_VETORES);
      const todos = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
      for (let i = 0; i < trechos.length; i++) {
        const v = todos.subarray(i * DIM, (i + 1) * DIM);
        vetores[i] = v.length === DIM && v[0] !== 0 ? v : null;
      }
    } catch {}
  }
}

function dividir(partes, tamanho = 1000, sobra = 150) {
  const saida = [];
  for (const { texto, pagina } of partes) {
    const limpo = String(texto || '').replace(/\s+/g, ' ').trim();
    if (limpo.length < 40) continue;
    for (let i = 0; i < limpo.length; i += tamanho - sobra) {
      let fim = Math.min(limpo.length, i + tamanho);
      const ponto = limpo.lastIndexOf('. ', fim);
      if (fim < limpo.length && ponto > i + tamanho * 0.6) fim = ponto + 1;
      saida.push({ texto: limpo.slice(i, fim), pagina: pagina ?? null });
      if (fim >= limpo.length) break;
      i = fim - tamanho; // o próximo trecho começa em (fim - sobra)
    }
  }
  return saida;
}

function regravarTudo() {
  gravacao = gravacao.catch(() => {}).then(async () => {
    const linhas = trechos.map(({ termos, ...t }) => JSON.stringify(t)).join('\n');
    await fsp.writeFile(ARQ_TRECHOS, linhas + (trechos.length ? '\n' : ''));
    const buf = new Float32Array(trechos.length * DIM);
    vetores.forEach((v, i) => v && buf.set(v, i * DIM));
    await fsp.writeFile(ARQ_VETORES, Buffer.from(buf.buffer));
    await gravarJSON(ARQ_META, meta);
  });
  return gravacao;
}

/** Indexa o texto de um documento (substitui se já existir). partes = [{ texto, pagina }] */
export async function indexarDocumento({ docId, titulo, partes }) {
  await carregar();
  removerEmMemoria(docId);
  const novos = dividir(partes).map((p) => ({ docId, titulo, pagina: p.pagina, texto: p.texto, termos: new Set(tokenizar(p.texto)) }));
  trechos.push(...novos);
  vetores.push(...novos.map(() => null));
  await regravarTudo();
  return { trechos: novos.length };
}

function removerEmMemoria(docId) {
  const manter = [];
  for (let i = 0; i < trechos.length; i++) if (trechos[i].docId !== docId) manter.push(i);
  if (manter.length === trechos.length) return false;
  trechos = manter.map((i) => trechos[i]);
  vetores = manter.map((i) => vetores[i]);
  return true;
}

export async function removerDocumento(docId) {
  await carregar();
  if (removerEmMemoria(docId)) await regravarTudo();
}

function prepararVetor(e) {
  const v = Float32Array.from(e.slice(0, DIM));
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

export async function pendentesVetorizacao(modelo) {
  await carregar();
  if (!modelo) return 0;
  if (meta.modelo !== modelo) return trechos.length;
  return vetores.filter((v) => !v).length;
}

/** Gera vetores para todos os trechos que ainda não têm (ou todos, se o modelo mudou). */
export async function vetorizarPendentes(modelo, tarefa, sinal) {
  await carregar();
  if (meta.modelo !== modelo) {
    vetores = vetores.map(() => null);
    meta.modelo = modelo;
    meta.dim = DIM;
  }
  const faltando = [];
  for (let i = 0; i < trechos.length; i++) if (!vetores[i]) faltando.push(i);
  tarefa.total = faltando.length;
  tarefa.baixado = 0;
  const LOTE = 16;
  let desdeGravacao = 0;
  for (let k = 0; k < faltando.length; k += LOTE) {
    if (sinal?.aborted) break;
    const idx = faltando.slice(k, k + LOTE);
    // Os índices podem mudar se um documento for removido durante a vetorização.
    const pares = idx.map((i) => [i, trechos[i]]).filter(([, t]) => t);
    const alvos = pares.map(([, t]) => t);
    const embs = await gerarEmbeddings(modelo, alvos.map((t) => `title: ${t.titulo} | text: ${t.texto}`), sinal);
    pares.forEach(([iOriginal, t], j) => {
      const i = trechos[iOriginal] === t ? iOriginal : trechos.indexOf(t);
      if (i >= 0) vetores[i] = prepararVetor(embs[j]);
    });
    tarefa.baixado = Math.min(k + LOTE, faltando.length);
    tarefa.mensagem = `Preparando a busca inteligente: ${tarefa.baixado} de ${faltando.length} trechos`;
    desdeGravacao += alvos.length;
    if (desdeGravacao >= 2000) {
      desdeGravacao = 0;
      await regravarTudo();
    }
  }
  await regravarTudo();
  if (sinal?.aborted) throw new Error('Cancelado');
  tarefa.mensagemFinal = `Busca inteligente pronta (${faltando.length} trechos)`;
}

export async function estatisticasIndice() {
  await carregar();
  const docs = new Set(trechos.map((t) => t.docId));
  return { documentos: docs.size, trechos: trechos.length, comVetores: vetores.filter(Boolean).length, modelo: meta.modelo };
}

/** Texto de um documento já lido, por página (para "Ler e traduzir"). */
export async function textoDoDocumento(docId) {
  await carregar();
  const paginas = new Map();
  for (const t of trechos) {
    if (t.docId !== docId) continue;
    const n = t.pagina || 1;
    paginas.set(n, paginas.has(n) ? `${paginas.get(n)}
${t.texto}` : t.texto);
  }
  return [...paginas.entries()].sort((a, b) => a[0] - b[0]).map(([pagina, texto]) => ({ pagina, texto }));
}

export async function documentosIndexados() {
  await carregar();
  const m = new Map();
  for (const t of trechos) m.set(t.docId, (m.get(t.docId) || 0) + 1);
  return m;
}

/** Busca híbrida: semântica (se houver vetores do mesmo modelo) + palavras-chave. */
/**
 * Busca nos trechos (palavras + significado). Opções do contexto do usuário (server/contexto.js):
 *  extras   — palavras da situação (ex.: termos da emergência), valem metade das da pergunta;
 *  consulta — frase da situação somada à pergunta na busca por significado;
 *  bonus    — (docId) => multiplicador da nota (ex.: Defesa Civil em emergência, documento aberto).
 */
export async function buscar(pergunta, { modeloEmbed, limite = 6, extras = [], consulta = '', bonus = null } = {}) {
  await carregar();
  if (!trechos.length) return [];
  const termos = [...new Set(tokenizar(pergunta))];
  const termosExtras = [...new Set(tokenizar(extras.join(' ')))].filter((t) => !termos.includes(t));
  const N = trechos.length;
  const idf = new Map(
    [...termos, ...termosExtras].map((t) => {
      let df = 0;
      for (const tr of trechos) if (tr.termos.has(t)) df++;
      return [t, df ? Math.log(1 + N / df) : 0];
    })
  );
  const PESO_EXTRA = 0.5;
  const maxKw = (termos.reduce((s, t) => s + idf.get(t), 0) + PESO_EXTRA * termosExtras.reduce((s, t) => s + idf.get(t), 0)) || 1;

  let qv = null;
  if (modeloEmbed && meta.modelo === modeloEmbed && vetores.some(Boolean)) {
    try {
      const [e] = await gerarEmbeddings(modeloEmbed, [`task: search result | query: ${consulta ? `${consulta}. ` : ''}${pergunta}`]);
      qv = prepararVetor(e);
    } catch {}
  }

  const pontos = [];
  for (let i = 0; i < N; i++) {
    const t = trechos[i];
    let kw = 0;
    for (const termo of termos) if (t.termos.has(termo)) kw += idf.get(termo);
    for (const termo of termosExtras) if (t.termos.has(termo)) kw += PESO_EXTRA * idf.get(termo);
    kw /= maxKw;
    let sem = 0;
    const v = vetores[i];
    if (qv && v) for (let j = 0; j < DIM; j++) sem += v[j] * qv[j];
    // Trecho sem vetor (busca inteligente ainda sendo preparada) concorre só pelas palavras; com vetor,
    // vale a melhor das duas notas, para um documento novo não perder só por ainda não ter vetor.
    let nota = qv && v ? Math.max(sem * 0.7 + kw * 0.3, kw * 0.8) : kw * 0.8;
    if (bonus && nota > 0) nota *= bonus(t.docId) || 1;
    if (nota > 0.05) pontos.push([nota, i]);
  }
  pontos.sort((a, b) => b[0] - a[0]);

  const porDoc = new Map();
  const saida = [];
  for (const [nota, i] of pontos) {
    const t = trechos[i];
    const c = porDoc.get(t.docId) || 0;
    if (c >= 2) continue; // no máximo 2 trechos por documento, para variar as fontes
    porDoc.set(t.docId, c + 1);
    saida.push({ docId: t.docId, titulo: t.titulo, pagina: t.pagina, texto: t.texto, nota: Number(nota.toFixed(3)) });
    if (saida.length >= limite) break;
  }
  return saida;
}
