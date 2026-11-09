// Tradução com a IA do computador (sem internet): livros, PDFs e páginas das enciclopédias em outros idiomas.
import { h, icone, aviso } from './ui.js';
import { api } from './api.js';
import { marcarConversoes } from './conversoes.js';

const AVISO = 'Tradução automática feita pela IA do computador: pode ter erros. Medidas de outros países (oz, lb, °F, galão…) ficam sublinhadas: clique para ver o valor original e a conversão. Em saúde e emergência, siga as fontes oficiais.';

/**
 * Traduz um texto e devolve a tradução inteira. Chama onTexto a cada pedaço recebido,
 * para o leitor mostrar a tradução enquanto ela é feita.
 */
export async function traduzirTexto(texto, { onParte, onTexto, sinal } = {}) {
  let erro = null;
  let saida = '';
  await api.fluxo('/api/traduzir', { texto }, (ev) => {
    if (ev.tipo === 'parte') onParte?.(ev);
    else if (ev.tipo === 'texto') {
      saida += ev.texto;
      onTexto?.(ev.texto);
    } else if (ev.tipo === 'erro') erro = ev.erro;
  }, sinal);
  if (erro) throw new Error(erro);
  return saida.trim();
}

/** Caixa que traduz um texto e mostra o resultado aos poucos. Devolve { elemento, traduzir(texto), parar() }. */
export function caixaTraducao() {
  const saida = h('div', { class: 'traducao-texto' });
  const estado = h('small', { class: 'suave' });
  let ctrl = null;
  const parar = () => { ctrl?.abort(); ctrl = null; };
  const elemento = h('div', { class: 'pilha traducao' },
    aviso('', icone('alerta', 16), AVISO),
    estado, saida);
  async function traduzir(texto) {
    parar();
    saida.textContent = '';
    if (!texto?.trim()) {
      estado.textContent = '';
      saida.replaceChildren(aviso('info', 'Não há texto para traduzir aqui. PDFs escaneados (só imagem) não têm texto que a IA consiga ler.'));
      return;
    }
    ctrl = new AbortController();
    estado.textContent = 'Traduzindo com a IA do computador…';
    try {
      await api.fluxo('/api/traduzir', { texto }, (ev) => {
        if (!elemento.isConnected) return parar(); // janela fechada: para de traduzir
        if (ev.tipo === 'parte') estado.textContent = ev.total > 1 ? `Traduzindo parte ${ev.n} de ${ev.total}…` : 'Traduzindo…';
        if (ev.tipo === 'texto') saida.textContent += ev.texto;
        if (ev.tipo === 'erro') estado.textContent = `Erro: ${ev.erro}`;
        if (ev.tipo === 'fim') {
          const n = marcarConversoes(saida);
          estado.textContent = n ? 'Tradução concluída. Medidas sublinhadas: clique para ver a conversão para as medidas do Brasil.' : 'Tradução concluída.';
        }
      }, ctrl.signal);
    } catch (e) {
      if (e.name !== 'AbortError') estado.textContent = `Não foi possível traduzir: ${e.message}`;
    }
  }
  return { elemento, traduzir, parar };
}
