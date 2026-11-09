// Lê o texto dos PDFs no navegador (pdf.js) e envia ao servidor para a busca e o assistente.
import { api } from './api.js';

let pdfjs = null;
let ativo = null; // { titulo, pagina, paginas }
let aoMudar = () => {};

export const statusIndexador = () => (ativo ? { ativo: true, ...ativo } : { ativo: false });

async function carregarPdfjs() {
  if (pdfjs) return pdfjs;
  pdfjs = await import('/vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
  return pdfjs;
}

async function extrair(item) {
  const lib = await carregarPdfjs();
  const doc = await lib.getDocument({ url: `/arquivos/${item.arquivo}`, isEvalSupported: false }).promise;
  const partes = [];
  ativo = { titulo: item.titulo, pagina: 0, paginas: doc.numPages };
  for (let p = 1; p <= doc.numPages; p++) {
    const pagina = await doc.getPage(p);
    const conteudo = await pagina.getTextContent();
    let texto = '';
    for (const it of conteudo.items) texto += it.str + (it.hasEOL ? '\n' : ' ');
    partes.push({ pagina: p, texto });
    pagina.cleanup();
    ativo.pagina = p;
    if (p % 10 === 0) {
      aoMudar();
      await new Promise((r) => setTimeout(r, 0)); // não travar a interface
    }
  }
  await doc.destroy();
  return partes;
}

/** Extrai o texto de um PDF escolhido pelo usuário (anexo do chat). */
export async function textoDePdf(arquivo, limite = 20000) {
  const lib = await carregarPdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()), isEvalSupported: false }).promise;
  let texto = '';
  for (let p = 1; p <= doc.numPages && texto.length < limite; p++) {
    const pagina = await doc.getPage(p);
    const conteudo = await pagina.getTextContent();
    texto += `\n[página ${p}]\n`;
    for (const it of conteudo.items) texto += it.str + (it.hasEOL ? '\n' : ' ');
    pagina.cleanup();
  }
  await doc.destroy();
  return texto.slice(0, limite);
}

async function ciclo() {
  try {
    const estado = await api.get('/api/estado');
    if (!estado.ferramentas.vendor) return;
    const pendentes = await api.get('/api/indexacao/pendentes');
    for (const item of pendentes) {
      try {
        ativo = { titulo: item.titulo, pagina: 0, paginas: 0 };
        aoMudar();
        const partes = await extrair(item);
        await api.post(`/api/indexacao/${encodeURIComponent(item.id)}`, { partes });
      } catch (e) {
        console.warn('Falha ao ler PDF', item.titulo, e);
        await api.post(`/api/indexacao/${encodeURIComponent(item.id)}`, { falha: e.message || String(e) }).catch(() => {});
      }
    }
  } catch {
  } finally {
    ativo = null;
    aoMudar();
  }
}

export function iniciarIndexador(opcoes = {}) {
  aoMudar = opcoes.aoMudar || aoMudar;
  let rodando = false;
  const executar = async () => {
    if (rodando) return;
    rodando = true;
    await ciclo();
    rodando = false;
  };
  setTimeout(executar, 3000);
  setInterval(executar, 15000);
}
