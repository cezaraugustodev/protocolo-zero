// Tradução do livro inteiro em segundo plano, com a IA do computador.
// Começa pelo botão "Traduzir" da Biblioteca ou por "Traduzir o livro" no leitor e continua enquanto o
// usuário usa outras telas do Protocolo Zero. A cópia traduzida fica guardada no computador
// (dados/traducoes/<id>/) até o usuário removê-la. Se o programa for fechado no meio, o que já foi
// traduzido fica guardado e a tradução continua de onde parou.
import { api } from '../api.js';
import { toast } from '../ui.js';
import { traduzirTexto } from '../traduzir.js';
import { blocosDaPaginaPdf } from './pdf-blocos.js';

const trabalhos = new Map(); // id -> { id, titulo, estado, progresso, feitas, total, mensagem, ctrl }
const ouvintes = new Set();
const fila = [];
let rodando = null;

const emitir = (ev) => {
  for (const fn of ouvintes) {
    try { fn(ev); } catch {}
  }
};

/** Recebe avisos: { tipo: 'estado', trabalho } ou { tipo: 'bloco', id, parte, bloco, texto, chave }. */
export function ouvir(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

export const trabalho = (id) => trabalhos.get(id) || null;
export const ativo = (id) => ['fila', 'preparando', 'traduzindo'].includes(trabalhos.get(id)?.estado);

function atualizar(t, mudancas) {
  Object.assign(t, mudancas);
  emitir({ tipo: 'estado', trabalho: { ...t, ctrl: undefined } });
}

/** Põe o livro na fila de tradução (um livro de cada vez, para não sobrecarregar o computador). */
export function iniciar(it) {
  if (ativo(it.id)) return trabalhos.get(it.id);
  const t = { id: it.id, titulo: it.titulo, tipo: it.tipo, arquivo: it.arquivo, estado: 'fila', progresso: 0, feitas: 0, total: 0, mensagem: 'Na fila…', ctrl: new AbortController() };
  trabalhos.set(it.id, t);
  fila.push(t);
  atualizar(t, {});
  proximo();
  return t;
}

export function parar(id) {
  const t = trabalhos.get(id);
  if (!t || !ativo(id)) return;
  t.ctrl.abort();
  const i = fila.indexOf(t);
  if (i >= 0) fila.splice(i, 1);
  atualizar(t, { estado: 'parado', mensagem: 'Tradução parada.' });
}

/** Esquece o trabalho (depois de remover a cópia traduzida). */
export function esquecer(id) {
  parar(id);
  trabalhos.delete(id);
}

async function proximo() {
  if (rodando || !fila.length) return;
  rodando = fila.shift();
  try {
    await executar(rodando);
  } finally {
    rodando = null;
    proximo();
  }
}

// Trechos de cada página/capítulo, no mesmo formato que o leitor usa.
async function abrirFonte(t) {
  if (t.tipo === 'pdf') {
    const pdfjs = await import('/vendor/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
    const doc = await pdfjs.getDocument({ url: `/arquivos/${t.arquivo}`, isEvalSupported: false }).promise;
    return {
      total: doc.numPages,
      blocos: async (n) => {
        const pagina = await doc.getPage(n);
        const b = blocosDaPaginaPdf(await pagina.getTextContent(), pagina.getViewport({ scale: 1 }), pdfjs.Util);
        pagina.cleanup();
        return b;
      },
      fechar: () => doc.destroy(),
    };
  }
  const dados = await api.get(`/api/biblioteca/${encodeURIComponent(t.id)}/leitura`);
  const partes = dados.partes || [];
  return { total: partes.length, blocos: async (n) => partes[n - 1]?.blocos || [], fechar: () => {} };
}

async function executar(t) {
  const sinal = t.ctrl.signal;
  const url = `/api/biblioteca/${encodeURIComponent(t.id)}/traducao`;
  let fonte = null;
  let feitas = 0;
  let total = 0;
  const salvarEstado = (completo = false) => api.put(`${url}/estado`, { total, feitas, completo }).catch(() => {});
  try {
    atualizar(t, { estado: 'preparando', mensagem: 'Preparando o livro…' });
    const salvas = await api.get(url).catch(() => ({ partes: {} }));
    fonte = await abrirFonte(t);

    // 1) Lista todos os trechos com texto e separa os que ainda faltam traduzir.
    const pendentes = [];
    for (let parte = 1; parte <= fonte.total; parte++) {
      if (sinal.aborted) return;
      const blocos = await fonte.blocos(parte);
      blocos.forEach((b, bloco) => {
        if (b.tipo === 'imagem' || !b.texto?.trim()) return;
        total++;
        const s = salvas.partes?.[String(parte)]?.blocos?.[String(bloco)];
        const pronta = s?.texto && (t.tipo !== 'pdf' || s.chave === (b.chave || null));
        if (pronta) feitas++;
        else pendentes.push({ parte, bloco, texto: b.texto, chave: b.chave || null });
      });
      if (parte % 5 === 0 || parte === fonte.total) atualizar(t, { mensagem: `Preparando o livro… (${parte} de ${fonte.total})` });
    }
    if (!total) {
      atualizar(t, { estado: 'erro', mensagem: 'Este livro não tem texto para traduzir (pode ser um PDF escaneado, só com imagens).' });
      return;
    }

    // 2) Traduz trecho por trecho e guarda cada um assim que fica pronto.
    atualizar(t, { estado: 'traduzindo', feitas, total, progresso: feitas / total, mensagem: 'Traduzindo…' });
    let ultimoEstado = 0;
    for (const p of pendentes) {
      if (sinal.aborted) return;
      const texto = await traduzirTexto(p.texto, { sinal });
      if (sinal.aborted) return;
      if (texto) {
        await api.put(url, { indice: p.parte, bloco: p.bloco, texto, chave: p.chave });
        emitir({ tipo: 'bloco', id: t.id, parte: p.parte, bloco: p.bloco, texto, chave: p.chave });
      }
      feitas++;
      atualizar(t, { feitas, progresso: feitas / total, mensagem: `Traduzindo… ${t.tipo === 'pdf' ? 'página' : 'parte'} ${p.parte} de ${fonte.total}` });
      if (Date.now() - ultimoEstado > 3000) {
        ultimoEstado = Date.now();
        salvarEstado();
      }
    }
    await salvarEstado(true);
    atualizar(t, { estado: 'pronto', progresso: 1, mensagem: 'Tradução concluída.' });
    toast(`“${t.titulo}” foi traduzido. Abra pela Biblioteca: botão “Traduzido”.`);
  } catch (e) {
    if (e.name === 'AbortError' || sinal.aborted) return;
    atualizar(t, { estado: 'erro', mensagem: `A tradução parou: ${e.message}` });
    toast(`A tradução de “${t.titulo}” parou: ${e.message}`, 'erro');
  } finally {
    if (total && t.estado !== 'pronto') await salvarEstado(false);
    fonte?.fechar();
  }
}
