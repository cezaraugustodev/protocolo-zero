// Integração com o Ollama local: status, download de modelos, chat e embeddings.
import { suportaRaciocinio } from './inteligencia.js';
const BASE = (process.env.OLLAMA_HOST && !process.env.OLLAMA_HOST.startsWith('0.0.0.0')
  ? (process.env.OLLAMA_HOST.startsWith('http') ? process.env.OLLAMA_HOST : `http://${process.env.OLLAMA_HOST}`)
  : 'http://127.0.0.1:11434').replace(/\/$/, '');

export async function ollamaOnline() {
  try {
    const r = await fetch(`${BASE}/api/version`, { signal: AbortSignal.timeout(2500) });
    return r.ok;
  } catch {
    return false;
  }
}

export async function statusOllama() {
  try {
    const [v, tags, ps] = await Promise.all([
      fetch(`${BASE}/api/version`, { signal: AbortSignal.timeout(2500) }).then((r) => r.json()),
      fetch(`${BASE}/api/tags`, { signal: AbortSignal.timeout(5000) }).then((r) => r.json()),
      fetch(`${BASE}/api/ps`, { signal: AbortSignal.timeout(5000) }).then((r) => r.json()).catch(() => ({ models: [] })),
    ]);
    return {
      online: true,
      versao: v.version,
      modelos: (tags.models || []).map((m) => ({ nome: m.name, tamanho: m.size, familia: m.details?.family, parametros: m.details?.parameter_size })),
      carregados: (ps.models || []).map((m) => ({ nome: m.name, vram: m.size_vram, tamanho: m.size })),
    };
  } catch {
    return { online: false, modelos: [], carregados: [] };
  }
}

export async function baixarModelo(nome, tarefa, sinal) {
  const r = await fetch(`${BASE}/api/pull`, {
    method: 'POST',
    body: JSON.stringify({ model: nome, stream: true }),
    signal: sinal,
  });
  if (!r.ok) throw new Error(`Ollama recusou o download (${r.status}): ${await r.text()}`);
  const leitor = r.body.getReader();
  const dec = new TextDecoder();
  let resto = '';
  for (;;) {
    const { value, done } = await leitor.read();
    if (done) break;
    resto += dec.decode(value, { stream: true });
    const linhas = resto.split('\n');
    resto = linhas.pop();
    for (const l of linhas) {
      if (!l.trim()) continue;
      const ev = JSON.parse(l);
      if (ev.error) throw new Error(ev.error);
      if (ev.total) {
        tarefa.total = ev.total;
        tarefa.baixado = ev.completed || 0;
      }
      tarefa.mensagem = traduzirStatus(ev.status);
    }
  }
  tarefa.mensagemFinal = `Modelo ${nome} pronto`;
}

function traduzirStatus(s = '') {
  if (s.startsWith('pulling manifest')) return 'Buscando informações do modelo…';
  if (s.startsWith('pulling')) return 'Baixando modelo…';
  if (s.startsWith('verifying')) return 'Verificando integridade…';
  if (s.startsWith('writing')) return 'Gravando…';
  if (s === 'success') return 'Concluído';
  return s;
}

export async function removerModelo(nome) {
  const r = await fetch(`${BASE}/api/delete`, { method: 'DELETE', body: JSON.stringify({ model: nome }) });
  if (!r.ok) throw new Error(`Falha ao remover: ${await r.text()}`);
}

export async function gerarEmbeddings(modelo, textos, sinal) {
  const r = await fetch(`${BASE}/api/embed`, {
    method: 'POST',
    body: JSON.stringify({ model: modelo, input: textos, truncate: true }),
    signal: sinal,
  });
  if (!r.ok) throw new Error(`Embedding falhou (${r.status}): ${await r.text()}`);
  const d = await r.json();
  return d.embeddings;
}

/**
 * Chat em streaming. Chama onTexto(pedaço) para cada parte da resposta.
 * Devolve estatísticas de velocidade { tokens, segundos, tps } medidas pelo próprio Ollama.
 */
export async function conversar({ modelo, mensagens, onTexto, onPensamento, pensar = false, sinal, opcoes = {} }) {
  const corpo = { model: modelo, messages: mensagens, stream: true, options: { temperature: 0.3, num_ctx: 8192, ...opcoes } };
  // Modelos que raciocinam (qwen3…): só pensam quando o usuário liga o "Pensamento profundo".
  if (suportaRaciocinio(modelo)) corpo.think = !!pensar;
  const r = await fetch(`${BASE}/api/chat`, { method: 'POST', body: JSON.stringify(corpo), signal: sinal });
  if (!r.ok) throw new Error(`Ollama: ${await r.text()}`);
  const leitor = r.body.getReader();
  const dec = new TextDecoder();
  let resto = '';
  let stats = null;
  for (;;) {
    const { value, done } = await leitor.read();
    if (done) break;
    resto += dec.decode(value, { stream: true });
    const linhas = resto.split('\n');
    resto = linhas.pop();
    for (const l of linhas) {
      if (!l.trim()) continue;
      const ev = JSON.parse(l);
      if (ev.error) throw new Error(ev.error);
      if (ev.message?.thinking) onPensamento?.(ev.message.thinking);
      if (ev.message?.content) onTexto?.(ev.message.content);
      if (ev.done && ev.eval_count && ev.eval_duration) {
        const segundos = ev.eval_duration / 1e9;
        stats = { tokens: ev.eval_count, segundos, tps: ev.eval_count / segundos, carga: (ev.load_duration || 0) / 1e9 };
      }
    }
  }
  return stats;
}

/** Mede quantas palavras (tokens) por segundo o modelo gera neste computador. */
export async function medirVelocidade(modelo, sinal) {
  return conversar({
    modelo,
    mensagens: [{ role: 'user', content: 'Explique em um parágrafo curto por que é importante ferver a água antes de beber.' }],
    opcoes: { num_predict: 64, num_ctx: 2048 },
    sinal,
  });
}
