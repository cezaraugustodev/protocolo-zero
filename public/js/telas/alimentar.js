// "Alimentar" a biblioteca com arquivos do próprio usuário.
// Cada arquivo recebe um nome e uma categoria antes de ser enviado; na Biblioteca ele aparece
// dentro da categoria, separado pelo tipo de arquivo (PDFs, vídeos, áudios, imagens…).
import { h, icone, bytes, barra, toast, cabecalho, aviso } from '../ui.js';
import { api } from '../api.js';
import { ROTULO_TIPO, ICONE_TIPO, CATEGORIAS_FORA_DO_USUARIO } from './biblioteca.js';

const ACEITOS = '.pdf,.epub,.txt,.md,.html,.htm,.csv,.mp4,.webm,.mkv,.mov,.m4v,.mp3,.ogg,.wav,.m4a,.opus,.flac,.jpg,.jpeg,.png,.webp,.gif,.zim,.pmtiles';
// Mesma regra do servidor (server/biblioteca.js → EXTENSOES).
const EXTENSOES = {
  pdf: 'pdf', epub: 'epub',
  txt: 'texto', md: 'texto', markdown: 'texto', html: 'texto', htm: 'texto', csv: 'texto',
  mp4: 'video', webm: 'video', mkv: 'video', mov: 'video', m4v: 'video', ogv: 'video',
  mp3: 'audio', ogg: 'audio', wav: 'audio', m4a: 'audio', opus: 'audio', flac: 'audio',
  jpg: 'imagem', jpeg: 'imagem', png: 'imagem', webp: 'imagem', gif: 'imagem', svg: 'imagem',
  zim: 'zim', pmtiles: 'mapa',
};
const tipoDe = (nome) => EXTENSOES[(nome.split('.').pop() || '').toLowerCase()] || 'outro';
// Sugestão de nome a partir do arquivo: sem extensão e sem "_".
const sugestao = (nome) => nome.replace(/\.[^.]+$/, '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();

export async function render(raiz) {
  const cat = await api.get('/api/catalogo');
  const categorias = cat.categorias.filter((c) => !CATEGORIAS_FORA_DO_USUARIO.has(c.id));
  const nomeMapas = cat.categorias.find((c) => c.id === 'mapas')?.nome || 'Mapas offline';

  raiz.append(cabecalho('Seus arquivos', 'Alimentar a biblioteca',
    'Adicione livros, apostilas, PDFs, vídeos e fotos que você já tem. Dê um nome e escolha a categoria de cada um. Os textos ficam pesquisáveis e o assistente passa a usá-los nas respostas.'));

  const seletor = h('input', { type: 'file', multiple: true, accept: ACEITOS, style: { display: 'none' }, onchange: (e) => adicionar([...e.target.files]) });
  const zona = h('div', { class: 'zona-envio', tabindex: 0, role: 'button', 'aria-label': 'Escolher arquivos para adicionar', onclick: () => seletor.click(), onkeydown: (e) => (e.key === 'Enter' || e.key === ' ') && seletor.click() },
    icone('enviar', 44),
    h('h3', {}, 'Arraste arquivos para cá'),
    h('p', { class: 'suave' }, 'ou clique para escolher. Depois, dê um nome e escolha a categoria de cada arquivo.'),
    h('div', { class: 'linha', style: { justifyContent: 'center', marginTop: '8px' } },
      ['PDF', 'EPUB', 'TXT/MD', 'Vídeo', 'Áudio', 'Imagem', 'ZIM (Kiwix)', 'PMTiles (mapa)'].map((t) => h('span', { class: 'etiqueta' }, t))));
  const revisao = h('div', { class: 'cartao pilha', style: { display: 'none' } });
  const fila = h('div', { class: 'cartao', style: { display: 'none' } });

  ['dragenter', 'dragover'].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add('arrastando'); }));
  ['dragleave', 'drop'].forEach((ev) => zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.remove('arrastando'); }));
  zona.addEventListener('drop', (e) => adicionar([...e.dataTransfer.files]));

  raiz.append(
    h('div', { class: 'grade', style: { gridTemplateColumns: 'minmax(0, 1fr)', gap: '14px' } },
      zona, seletor, revisao, fila,
      aviso('info', h('b', {}, 'Dica: '), 'PDFs escaneados (fotos de páginas) não têm texto, então não aparecem na busca. Prefira PDFs com texto selecionável. Arquivos .zim do Kiwix e mapas .pmtiles também podem ser adicionados aqui.'))
  );

  // ---------- 1. revisar: nome + categoria de cada arquivo ----------
  let lista = []; // { arquivo, tipo, nome, categoria }

  function adicionar(arquivos) {
    for (const a of arquivos) lista.push({ arquivo: a, tipo: tipoDe(a.name), nome: sugestao(a.name), categoria: '' });
    seletor.value = '';
    desenharRevisao();
    revisao.querySelector('input')?.focus();
  }

  const precisaCategoria = (l) => l.tipo !== 'mapa'; // mapas vão sempre para "Mapas offline"
  const valido = (l) => l.nome.trim() && (!precisaCategoria(l) || l.categoria);
  const textoFalta = () => {
    const n = lista.filter((l) => !valido(l)).length;
    return n ? `Falta nome ou categoria em ${n === 1 ? '1 arquivo' : `${n} arquivos`}.` : '';
  };

  function desenharRevisao() {
    if (!lista.length) {
      revisao.style.display = 'none';
      revisao.replaceChildren();
      return;
    }
    revisao.style.display = '';
    const botaoEnviar = h('button', { class: 'botao primario', disabled: lista.some((l) => !valido(l)), onclick: enviarTodos },
      icone('enviar', 16), lista.length === 1 ? 'Adicionar à biblioteca' : `Adicionar ${lista.length} arquivos`);
    const falta = h('small', { class: 'alerta-texto' }, textoFalta());
    const atualizarRodape = () => {
      botaoEnviar.disabled = lista.some((l) => !valido(l));
      falta.textContent = textoFalta();
    };

    const todas = h('select', { onchange: (e) => {
      for (const l of lista) if (precisaCategoria(l)) l.categoria = e.target.value;
      desenharRevisao();
    } }, h('option', { value: '', selected: true, disabled: true }, 'Escolher para todos…'), categorias.map((c) => h('option', { value: c.id }, c.nome)));

    revisao.replaceChildren(
      h('div', { class: 'linha entre', style: { flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' } },
        h('div', {}, h('h2', { style: { margin: 0 } }, 'Nome e categoria'),
          h('small', { class: 'suave' }, 'É assim que o arquivo vai aparecer na Biblioteca: dentro da categoria, separado pelo tipo.')),
        lista.filter(precisaCategoria).length > 1 ? h('label', { class: 'campo', style: { minWidth: '240px' } }, 'Mesma categoria para todos', todas) : null),
      h('div', { class: 'revisao-lista' },
        lista.map((l, i) => {
          const nome = h('input', { type: 'text', value: l.nome, maxlength: 160, placeholder: 'Digite o nome do arquivo', class: l.nome.trim() ? '' : 'invalido', 'aria-label': `Nome para ${l.arquivo.name}`,
            oninput: (e) => { l.nome = e.target.value; nome.classList.toggle('invalido', !l.nome.trim()); atualizarRodape(); } });
          const categoria = precisaCategoria(l)
            ? h('select', { 'aria-label': `Categoria de ${l.arquivo.name}`, class: l.categoria ? '' : 'invalido',
                onchange: (e) => { l.categoria = e.target.value; e.target.classList.remove('invalido'); atualizarRodape(); } },
                h('option', { value: '', disabled: true, selected: !l.categoria }, 'Escolha a categoria…'),
                categorias.map((c) => h('option', { value: c.id, selected: c.id === l.categoria }, c.nome)))
            : h('select', { disabled: true, title: 'Mapas ficam sempre em Mapas offline' }, h('option', {}, nomeMapas));
          return h('div', { class: 'revisao-item' },
            h('span', { class: 'icone-bolha', title: ROTULO_TIPO[l.tipo] }, icone(ICONE_TIPO[l.tipo] || 'pasta', 18)),
            h('div', { class: 'revisao-campos' },
              h('div', { class: 'revisao-origem suave' }, h('span', { class: 'etiqueta' }, ROTULO_TIPO[l.tipo] || 'Arquivo'), h('span', { class: 'mono' }, l.arquivo.name), ` · ${bytes(l.arquivo.size)}`),
              h('div', { class: 'revisao-entradas' },
                h('label', { class: 'campo' }, 'Nome', nome),
                h('label', { class: 'campo' }, 'Categoria', categoria))),
            h('button', { class: 'botao botao-icone fantasma', title: 'Tirar da lista', 'aria-label': `Tirar ${l.arquivo.name} da lista`, onclick: () => { lista.splice(i, 1); desenharRevisao(); } }, icone('x', 16)));
        })),
      h('div', { class: 'linha entre', style: { flexWrap: 'wrap', gap: '10px' } },
        falta,
        h('div', { class: 'linha' },
          h('button', { class: 'botao', onclick: () => { lista = []; desenharRevisao(); } }, 'Cancelar'),
          botaoEnviar)));
  }

  // ---------- 2. enviar ----------
  let enviando = false;
  const pendentes = [];

  function enviarTodos() {
    if (!lista.length || lista.some((l) => !valido(l))) return;
    fila.style.display = '';
    for (const l of lista) {
      const nomeCat = precisaCategoria(l) ? categorias.find((c) => c.id === l.categoria)?.nome : nomeMapas;
      const linha = { ...l, nome: l.nome.trim(), barra: barra(0), status: h('small', { class: 'suave' }, 'Na fila') };
      linha.el = h('div', { class: 'envio' },
        h('div', {}, h('b', {}, linha.nome), h('small', { class: 'suave' }, ` · ${nomeCat} · ${ROTULO_TIPO[l.tipo] || 'Arquivo'} · ${bytes(l.arquivo.size)}`)),
        linha.status, linha.barra);
      fila.append(linha.el);
      pendentes.push(linha);
    }
    lista = [];
    desenharRevisao();
    processar();
  }

  async function processar() {
    if (enviando) return;
    enviando = true;
    while (pendentes.length) {
      const l = pendentes.shift();
      l.status.textContent = 'Enviando…';
      try {
        const it = await api.enviar(l.arquivo, {
          categoria: l.categoria || 'meus',
          titulo: l.nome,
          onProgresso: (feito, total) => {
            l.barra.firstChild.style.width = `${(feito / total) * 100}%`;
            l.status.textContent = `${Math.round((feito / total) * 100)}%`;
          },
        });
        l.barra.className = 'barra musgo';
        l.barra.firstChild.style.width = '100%';
        l.status.replaceChildren(h('span', { class: 'etiqueta musgo' }, icone('ok', 13), ['pdf', 'epub', 'texto'].includes(it.tipo) ? 'Adicionado — preparando a busca' : 'Adicionado'));
      } catch (e) {
        l.status.replaceChildren(h('span', { class: 'etiqueta perigo' }, e.message));
        toast(`Falha ao enviar ${l.nome}: ${e.message}`, 'erro');
      }
    }
    enviando = false;
  }
}
