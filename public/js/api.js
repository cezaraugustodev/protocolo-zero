// Chamadas ao servidor local. Todas as escritas levam o cabeçalho de segurança.
const SEGURANCA = { 'x-protocolo-zero': '1' };

export const SERVIDOR_FECHADO = 'O servidor do Protocolo Zero está fechado. Abra o terminal na pasta do projeto e rode: npm start';
export const servidorFechado = (e) => e?.message === SERVIDOR_FECHADO;
// "Failed to fetch" = o servidor local não respondeu (janela do npm start fechada ou travada).
const rede = (e) => {
  if (e?.name === 'TypeError') throw new Error(SERVIDOR_FECHADO);
  throw e;
};

async function tratar(r) {
  const tipo = r.headers.get('content-type') || '';
  const dados = tipo.includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new Error(dados?.erro || `Erro ${r.status}`);
  return dados;
}

export const api = {
  get: (url) => fetch(url, { cache: 'no-store' }).then(tratar, rede),
  post: (url, corpo = {}) =>
    fetch(url, { method: 'POST', headers: { ...SEGURANCA, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }).then(tratar, rede),
  patch: (url, corpo = {}) =>
    fetch(url, { method: 'PATCH', headers: { ...SEGURANCA, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }).then(tratar, rede),
  put: (url, corpo = {}) =>
    fetch(url, { method: 'PUT', headers: { ...SEGURANCA, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }).then(tratar, rede),
  del: (url, corpo) =>
    fetch(url, { method: 'DELETE', headers: { ...SEGURANCA, 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined }).then(tratar, rede),

  /** Envia um arquivo com progresso (XHR permite acompanhar o upload). */
  enviar(arquivo, { categoria, titulo, onProgresso }) {
    return new Promise((resolve, reject) => {
      const q = new URLSearchParams({ nome: arquivo.name, categoria: categoria || 'meus' });
      if (titulo) q.set('titulo', titulo);
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `/api/upload?${q}`);
      xhr.setRequestHeader('x-protocolo-zero', '1');
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgresso?.(e.loaded, e.total);
      xhr.onload = () => {
        try {
          const d = JSON.parse(xhr.responseText);
          xhr.status < 300 ? resolve(d) : reject(new Error(d.erro || `Erro ${xhr.status}`));
        } catch {
          reject(new Error(`Erro ${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new Error('Falha de conexão com o servidor local'));
      xhr.send(arquivo);
    });
  },

  /** Conversa com o assistente; chama onEvento para cada linha NDJSON recebida. */
  conversar(corpo, onEvento, sinal) {
    return api.fluxo('/api/chat', corpo, onEvento, sinal);
  },

  /** POST que devolve NDJSON aos poucos (chat, tradução). */
  async fluxo(url, corpo, onEvento, sinal) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { ...SEGURANCA, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      signal: sinal,
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || `Erro ${r.status}`);
    const leitor = r.body.getReader();
    const dec = new TextDecoder();
    let resto = '';
    for (;;) {
      const { value, done } = await leitor.read();
      if (done) break;
      resto += dec.decode(value, { stream: true });
      const linhas = resto.split('\n');
      resto = linhas.pop();
      for (const l of linhas) if (l.trim()) onEvento(JSON.parse(l));
    }
  },
};
