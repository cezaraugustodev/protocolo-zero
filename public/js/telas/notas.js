// Notas de leitura: todos os realces, notas e marcadores feitos nos livros, num lugar só.
// Cada nota leva direto ao livro e à página (ou capítulo) onde foi feita.
import { h, icone, aviso, cabecalho } from '../ui.js';
import { api } from '../api.js';

const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const data = (ms) => (ms ? new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const link = (doc, pagina, nota) => `#/ler/${encodeURIComponent(doc.id)}/pagina/${pagina}${nota ? `/nota/${encodeURIComponent(nota)}` : ''}`;
const onde = (doc, pagina) => (doc.tipo === 'pdf' ? `Página ${pagina}` : `Parte ${pagina}`);

export async function render(raiz) {
  raiz.append(cabecalho('Biblioteca', 'Notas de leitura',
    'Os trechos que você realçou, as notas que escreveu e as páginas que marcou nos livros. Clique em uma nota para abrir o livro direto naquele ponto.'));

  let dados;
  try {
    dados = await api.get('/api/leitura');
  } catch (e) {
    raiz.append(aviso('erro', `Não foi possível carregar as notas: ${e.message}`));
    return;
  }
  const docs = dados.documentos || [];
  if (!docs.length) {
    raiz.append(h('div', { class: 'cartao pilha notas-vazio' },
      icone('nota', 28),
      h('h3', { style: { margin: 0 } }, 'Nenhuma nota ainda'),
      h('p', { class: 'suave', style: { margin: 0 } }, 'Abra um livro na Biblioteca e selecione um trecho com o mouse: aparece um menu para realçar com uma cor ou escrever uma nota. Use "Marcar página" para guardar páginas importantes.'),
      h('a', { class: 'botao primario', href: '#/biblioteca' }, icone('livro', 16), 'Ir para a Biblioteca')));
    return;
  }

  const totalNotas = docs.reduce((a, d) => a + d.notas.length, 0);
  const filtro = h('input', { type: 'search', class: 'campo', placeholder: 'Buscar nas notas e trechos…', 'aria-label': 'Buscar nas notas' });
  const soComTexto = h('input', { type: 'checkbox' });
  const lista = h('div', { class: 'notas-docs' });
  raiz.append(
    h('div', { class: 'notas-barra' },
      filtro,
      h('label', { class: 'linha', style: { gap: '6px' } }, soComTexto, 'Só notas escritas'),
      h('small', { class: 'suave' }, `${totalNotas} nota(s) e realce(s) em ${docs.length} livro(s)`)),
    lista);

  function pintar() {
    const q = semAcento(filtro.value);
    const blocos = [];
    for (const doc of docs) {
      const notas = doc.notas
        .filter((n) => (!soComTexto.checked || n.nota) && (!q || semAcento(`${n.trecho} ${n.nota} ${doc.titulo}`).includes(q)))
        .sort((a, b) => a.pagina - b.pagina);
      const marcadores = q || soComTexto.checked ? [] : doc.marcadores;
      if (!notas.length && !marcadores.length) continue;
      blocos.push(h('section', { class: 'cartao notas-doc' },
        h('div', { class: 'notas-doc-topo' },
          h('div', {},
            h('h3', {}, doc.existe ? h('a', { href: link(doc, doc.ultima || 1) }, doc.titulo) : doc.titulo),
            h('small', { class: 'suave' }, [doc.existe ? null : 'O arquivo saiu da biblioteca', doc.atualizado ? `Atualizado em ${data(doc.atualizado)}` : null].filter(Boolean).join(' · '))),
          doc.existe ? h('a', { class: 'botao pequeno', href: link(doc, doc.ultima || 1) }, icone('livro', 14), `Continuar (${onde(doc, doc.ultima || 1).toLowerCase()})`) : null),
        marcadores.length ? h('div', { class: 'notas-marcadores' },
          h('small', { class: 'suave' }, 'Páginas marcadas:'),
          marcadores.map((p) => (doc.existe ? h('a', { class: 'notas-chip', href: link(doc, p) }, icone('marcador', 12), onde(doc, p)) : h('span', { class: 'notas-chip' }, onde(doc, p))))) : null,
        notas.map((n) => h(doc.existe ? 'a' : 'div', { class: `notas-item cor-${n.cor}`, href: doc.existe ? link(doc, n.pagina, n.id) : null },
          h('div', { class: 'notas-item-topo' },
            h('b', {}, onde(doc, n.pagina)),
            h('small', { class: 'suave' }, data(n.atualizado || n.criado))),
          n.trecho ? h('blockquote', {}, n.trecho) : null,
          n.nota ? h('p', {}, n.nota) : null))));
    }
    lista.replaceChildren(...(blocos.length ? blocos : [h('p', { class: 'suave' }, 'Nenhuma nota encontrada com esse filtro.')]));
  }
  filtro.addEventListener('input', pintar);
  soComTexto.addEventListener('change', pintar);
  pintar();
}
