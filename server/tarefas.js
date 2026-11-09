// Fila de tarefas em segundo plano (downloads, instalações, extração de mapas, indexação).
import { randomUUID } from 'node:crypto';
import { registrarErro } from './util.js';

const tarefas = new Map();
const fila = [];
let ativas = 0;
const MAX_SIMULTANEAS = 2;

/**
 * Cria uma tarefa. `fn(tarefa, sinal)` deve atualizar tarefa.baixado/total/mensagem.
 * `chave` evita duplicar a mesma tarefa enquanto ela está na fila ou rodando.
 */
export function criarTarefa({ tipo, titulo, chave, itemId, fn }) {
  if (chave) {
    for (const t of tarefas.values()) {
      if (t.chave === chave && (t.estado === 'fila' || t.estado === 'ativo')) return t;
    }
  }
  const t = {
    id: randomUUID(),
    tipo,
    titulo,
    chave,
    itemId,
    estado: 'fila',
    baixado: 0,
    total: 0,
    mensagem: 'Aguardando…',
    criado: Date.now(),
    _fn: fn,
    _ctrl: new AbortController(),
  };
  t._fim = new Promise((r) => (t._resolver = r));
  tarefas.set(t.id, t);
  fila.push(t);
  processar();
  return t;
}

function processar() {
  while (ativas < MAX_SIMULTANEAS && fila.length) {
    const t = fila.shift();
    if (t.estado !== 'fila') continue;
    ativas++;
    t.estado = 'ativo';
    t.inicio = Date.now();
    t.mensagem = 'Iniciando…';
    Promise.resolve()
      .then(() => t._fn(t, t._ctrl.signal))
      .then(() => {
        t.estado = 'concluido';
        t.mensagem = t.mensagemFinal || 'Concluído';
      })
      .catch((e) => {
        if (t._ctrl.signal.aborted) {
          t.estado = 'cancelado';
          t.mensagem = 'Cancelado (o que já foi baixado fica guardado para retomar)';
        } else {
          t.estado = 'erro';
          t.mensagem = e?.message || String(e);
          console.error(`[tarefa] ${t.titulo}:`, t.mensagem);
          registrarErro(`tarefa ${t.titulo}`, e);
        }
      })
      .finally(() => {
        t.fim = Date.now();
        t._resolver(t);
        ativas--;
        processar();
      });
  }
}

export function cancelarTarefa(id) {
  const t = tarefas.get(id);
  if (!t) return false;
  if (t.estado === 'fila') {
    t.estado = 'cancelado';
    t.mensagem = 'Cancelado';
    t._resolver(t);
  } else if (t.estado === 'ativo') {
    t._ctrl.abort();
  }
  return true;
}

/**
 * Tenta de novo só esta tarefa (com erro ou cancelada), na mesma linha da lista.
 * O download retoma do que já foi baixado. Devolve a tarefa, ou null se não puder repetir.
 */
export function repetirTarefa(id) {
  const t = tarefas.get(id);
  if (!t || !['erro', 'cancelado'].includes(t.estado)) return null;
  if (t.chave) {
    for (const o of tarefas.values()) {
      if (o !== t && o.chave === t.chave && (o.estado === 'fila' || o.estado === 'ativo')) return o;
    }
  }
  Object.assign(t, { estado: 'fila', baixado: 0, total: 0, mensagem: 'Aguardando…', mensagemFinal: undefined, inicio: undefined, fim: undefined, _ctrl: new AbortController() });
  t._fim = new Promise((r) => (t._resolver = r));
  fila.push(t);
  processar();
  return t;
}

export function limparConcluidas() {
  for (const [id, t] of tarefas) if (!['fila', 'ativo'].includes(t.estado)) tarefas.delete(id);
}

export function listarTarefas() {
  return [...tarefas.values()]
    .sort((a, b) => b.criado - a.criado)
    .map(({ _fn, _ctrl, _fim, _resolver, ...pub }) => pub);
}

export function haTarefasAtivas() {
  return [...tarefas.values()].some((t) => t.estado === 'fila' || t.estado === 'ativo');
}

/** Espera a tarefa terminar (concluída, com erro ou cancelada) e devolve seu estado público. */
export async function aguardarTarefa(t) {
  if (!t) return null;
  const real = tarefas.get(t.id) || t;
  await real._fim;
  const { _fn, _ctrl, _fim, _resolver, ...pub } = real;
  return pub;
}
