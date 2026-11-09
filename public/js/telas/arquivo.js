// Internet Archive: buscar e baixar livros e vídeos-aula, item por item, por temas úteis.
// Música e entretenimento ficam de fora (o usuário guarda isso na própria pasta do computador).
// Usa a internet só quando o usuário busca ou clica em Baixar. Tudo fica marcado como "não verificado".
import { h, icone, bytes, aviso, toast, modal, cabecalho } from '../ui.js';
import { api } from '../api.js';

const TIPOS = [['textos', 'Livros e textos', 'livro'], ['videos', 'Vídeos-aula', 'play']];
const IDIOMAS = [['pt', 'Português'], ['en', 'Inglês'], ['es', 'Espanhol'], ['fr', 'Francês'], ['todos', 'Qualquer idioma']];
const CHAVE_CIENTE = 'pz-ia-ciente';

export async function render(raiz) {
  const ciente = () => { try { return localStorage.getItem(CHAVE_CIENTE) === '1'; } catch { return false; } };
  const estado = { q: '', tema: '', tipo: 'textos', idioma: 'pt', livre: true, pagina: 1, total: 0, itens: [], carregando: false };
  const temas = await api.get('/api/arquivo-internet/temas').catch(() => []);

  raiz.append(
    cabecalho('Fontes extras', 'Internet Archive', 'Biblioteca pública da internet. Aqui você encontra, por tema, livros, manuais e vídeos-aula úteis e baixa item por item para usar sem internet.'),
    aviso('erro',
      h('b', {}, 'Use com cautela. '),
      'Qualquer pessoa pode enviar arquivos ao Internet Archive: o conteúdo não é revisado e pode ter erros, informações antigas ou perigosas. ',
      h('b', {}, 'Em emergência e em saúde, siga as fontes oficiais'), ' (pacote Essencial, em ',
      h('a', { href: '#/configurar' }, 'Instalar conteúdo'), '). O que você baixar daqui aparece na Biblioteca como ',
      h('b', {}, '"não verificado"'), ', e o assistente usa por último, sempre avisando.'),
    h('details', { class: 'cartao plano ia-arquivo-info' },
      h('summary', {}, h('b', {}, 'Dá para baixar o Internet Archive inteiro?')),
      h('p', {}, 'Não. O acervo passa de 100 petabytes (100 mil terabytes): seriam dezenas de milhares de discos rígidos. A maior parte é música, filmes, TV e páginas antigas da internet, que não ajudam numa emergência.'),
      h('p', {}, 'O que vale a pena está separado em temas abaixo: manuais de sobrevivência, horta, criação de animais, saúde, eletricidade, construção, consertos, ciências, idiomas e livros clássicos. Um livro costuma ter de 2 a 50 MB; 100 livros cabem em 1 a 3 GB. Música e filmes ficam de fora: guarde-os na sua própria pasta do computador.'),
      h('p', {}, 'Livros em outros idiomas também servem: no leitor, o botão ', h('b', {}, 'Traduzir'), ' usa a IA do computador para passar o texto para o português, sem internet.'),
      h('p', { class: 'suave' }, 'Esta tela usa a internet apenas quando você busca ou clica em Baixar. Depois de baixado, o arquivo abre sem internet.')),
  );

  const campo = h('input', { type: 'search', placeholder: 'O que você procura? Ex.: horta, primeiros socorros, eletricidade…', 'aria-label': 'Buscar no Internet Archive', onkeydown: (e) => e.key === 'Enter' && buscar(1) });
  const tipos = h('div', { class: 'segmentado' });
  const refazer = () => (estado.q || estado.tema) && buscar(1);
  const idioma = h('select', { 'aria-label': 'Idioma', onchange: (e) => { estado.idioma = e.target.value; refazer(); } }, IDIOMAS.map(([v, n]) => h('option', { value: v }, n)));
  const livre = h('label', { class: 'alternar' }, h('input', { type: 'checkbox', checked: true, onchange: (e) => { estado.livre = e.target.checked; refazer(); } }), 'Só licença livre (domínio público ou Creative Commons)');
  const gradeTemas = h('div', { class: 'ia-arquivo-temas' });
  const resultados = h('div', { class: 'pilha' });
  raiz.append(
    h('div', { class: 'cartao pilha' },
      h('div', { class: 'linha ia-arquivo-busca' }, h('div', { class: 'busca', style: { flex: '1 1 320px' } }, icone('busca'), campo),
        h('button', { class: 'botao primario', onclick: () => buscar(1) }, icone('busca', 16), 'Buscar')),
      h('div', { class: 'linha', style: { flexWrap: 'wrap', gap: '12px' } }, tipos, h('label', { class: 'linha', style: { gap: '6px' } }, h('small', {}, 'Idioma:'), idioma), livre),
      h('div', { class: 'pilha', style: { gap: '6px' } }, h('small', { class: 'suave' }, 'Temas úteis (clique para ver; a busca acima procura dentro do tema escolhido):'), gradeTemas)),
    resultados);

  function desenharTipos() {
    tipos.replaceChildren(...TIPOS.map(([id, nome, ic]) =>
      h('button', { class: estado.tipo === id ? 'ativo' : '', onclick: () => { estado.tipo = id; if (id === 'videos' && temas.find((t) => t.id === estado.tema)?.soTextos) estado.tema = ''; desenharTipos(); desenharTemas(); refazer(); } }, nome)));
  }
  desenharTipos();

  function desenharTemas() {
    gradeTemas.replaceChildren(...temas.filter((t) => !(t.soTextos && estado.tipo === 'videos')).map((t) =>
      h('button', { class: `chip ${estado.tema === t.id ? 'ativo' : ''}`, onclick: () => { estado.tema = estado.tema === t.id ? '' : t.id; desenharTemas(); refazer(); } }, icone(t.icone, 14), t.nome)));
  }
  desenharTemas();

  async function buscar(pagina) {
    const q = campo.value.trim();
    if (!q && !estado.tema) return campo.focus();
    if (!ciente()) {
      const ok = await avisoInicial();
      if (!ok) return;
    }
    Object.assign(estado, { q, pagina, carregando: true });
    resultados.replaceChildren(h('div', { class: 'cartao' }, h('div', { class: 'linha' }, h('span', { class: 'ponto alerta pulsa' }), 'Buscando no Internet Archive (usa a internet)…')));
    try {
      const r = await api.get(`/api/arquivo-internet/buscar?q=${encodeURIComponent(q)}&tema=${estado.tema}&tipo=${estado.tipo}&idioma=${estado.idioma}&livre=${estado.livre ? 1 : 0}&pagina=${pagina}`);
      Object.assign(estado, { total: r.total, itens: r.itens });
      desenharResultados();
    } catch (e) {
      resultados.replaceChildren(aviso('erro', `Não foi possível buscar: ${e.message}`, ' Confira a internet.'));
    }
  }

  function avisoInicial() {
    return new Promise((resolve) => {
      let fechar;
      const responder = (v) => { if (v) { try { localStorage.setItem(CHAVE_CIENTE, '1'); } catch {} } fechar(); resolve(v); };
      fechar = modal(h('div', { class: 'pilha' },
        h('h3', { style: { margin: 0 } }, 'Antes de usar o Internet Archive'),
        h('ul', { class: 'energia-dicas' },
          h('li', {}, 'Esta busca usa a internet.'),
          h('li', {}, 'O conteúdo é enviado por qualquer pessoa e não é revisado. Pode ter erros ou informações perigosas.'),
          h('li', {}, 'Em emergência, saúde, remédios e doses, use as fontes oficiais do pacote Essencial.'),
          h('li', {}, 'Respeite a licença de cada item. Prefira os marcados "Domínio público" ou "Creative Commons".'),
          h('li', {}, 'PDFs escaneados (só imagem) não podem ser lidos pelo assistente nem traduzidos. Prefira os que têm texto, EPUB ou TXT.')),
        h('div', { class: 'linha', style: { justifyContent: 'flex-end', gap: '8px' } },
          h('button', { class: 'botao', onclick: () => responder(false) }, 'Cancelar'),
          h('button', { class: 'botao primario', onclick: () => responder(true) }, 'Entendi, continuar'))), { largura: 500 });
    });
  }

  function desenharResultados() {
    const { itens, total, pagina } = estado;
    if (!itens.length) {
      resultados.replaceChildren(aviso('info', 'Nada encontrado. Tente outras palavras, outro idioma ou desmarque "Só licença livre".'));
      return;
    }
    const paginas = Math.ceil(total / 30);
    resultados.replaceChildren(
      h('div', { class: 'linha entre' }, h('small', { class: 'suave' }, `${total.toLocaleString('pt-BR')} resultado(s) · página ${pagina} de ${paginas}`)),
      ...itens.map((it) => h('button', { class: 'cartao ia-arquivo-item', onclick: () => abrir(it) },
        h('div', {},
          h('b', {}, it.titulo),
          h('small', { class: 'suave' }, [it.autor, it.ano].filter(Boolean).join(' · ') || 'Autor não informado'),
          it.resumo ? h('small', {}, it.resumo) : null),
        h('div', { class: 'ia-arquivo-selos' },
          h('span', { class: `etiqueta ${it.licenca.livre ? 'musgo' : 'alerta'}` }, it.licenca.nome),
          it.tamanho ? h('small', { class: 'suave' }, bytes(it.tamanho)) : null))),
      h('div', { class: 'linha', style: { justifyContent: 'center', gap: '8px' } },
        pagina > 1 ? h('button', { class: 'botao', onclick: () => buscar(pagina - 1) }, 'Anterior') : null,
        pagina < paginas ? h('button', { class: 'botao', onclick: () => buscar(pagina + 1) }, 'Mais resultados') : null));
  }

  async function abrir(it) {
    const corpo = h('div', { class: 'pilha' }, h('div', { class: 'linha' }, h('span', { class: 'ponto alerta pulsa' }), 'Carregando os arquivos…'));
    modal(corpo, { largura: 720 });
    try {
      const d = await api.get(`/api/arquivo-internet/item/${encodeURIComponent(it.id)}`);
      const nomeTipo = { pdf: 'PDF', epub: 'Livro digital (EPUB)', video: 'Vídeo', audio: 'Áudio', texto: 'Texto' };
      corpo.replaceChildren(
        h('h3', { style: { margin: 0 } }, d.titulo),
        h('small', { class: 'suave' }, [d.autor, d.ano, d.idioma].filter(Boolean).join(' · ')),
        h('div', { class: 'linha', style: { gap: '6px', flexWrap: 'wrap' } },
          h('span', { class: `etiqueta ${d.licenca.livre ? 'musgo' : 'alerta'}` }, d.licenca.nome),
          h('span', { class: 'etiqueta alerta' }, icone('alerta', 12), 'Não verificado')),
        d.direitos ? h('small', { class: 'suave' }, `Direitos: ${d.direitos}`) : null,
        d.resumo ? h('p', { class: 'ia-arquivo-resumo' }, d.resumo) : null,
        d.restrito
          ? aviso('erro', 'Este item é só para empréstimo online e não pode ser baixado.')
          : d.arquivos.length
            ? h('div', { class: 'pilha' }, h('b', {}, 'Arquivos para baixar'),
                h('div', { class: 'ia-arquivo-arquivos' }, ...d.arquivos.map((f) => {
                  const b = h('button', { class: 'botao pequeno', onclick: async () => {
                    b.disabled = true;
                    try {
                      await api.post('/api/arquivo-internet/baixar', { id: d.id, nome: f.nome, titulo: d.titulo });
                      toast('Baixando… acompanhe em Transferências. Quando terminar, aparece na Biblioteca.');
                      b.replaceChildren(icone('ok', 13), 'Na fila');
                    } catch (e) { b.disabled = false; toast(e.message, 'erro'); }
                  } }, icone('baixar', 13), 'Baixar');
                  return h('div', { class: 'ia-arquivo-arquivo' },
                    h('div', {}, h('span', {}, f.nome), h('small', { class: 'suave' }, `${nomeTipo[f.tipo] || f.formato}${f.tamanho ? ` · ${bytes(f.tamanho)}` : ''}`)), b);
                })))
            : aviso('info', 'Este item não tem arquivos em formato que o Protocolo Zero abre (PDF, EPUB, MP4, WebM ou texto).'),
        h('small', { class: 'suave' }, 'Página original: ', h('a', { href: d.pagina, target: '_blank', rel: 'noopener' }, d.pagina), ' (abre na internet)'));
    } catch (e) {
      corpo.replaceChildren(aviso('erro', e.message));
    }
  }
}
