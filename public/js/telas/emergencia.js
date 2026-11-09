// "Emergência agora": o usuário marca a(s) emergência(s) e vê na hora o que fazer, os livros e cartilhas
// já baixados para aquela situação e perguntas prontas para o assistente. Funciona sem internet.
import { h, icone, aviso, cabecalho, toast } from '../ui.js';
import { api } from '../api.js';
import { navegar } from '../app.js';
import { NUMEROS } from '../guia.js';
import { BASE_EMERGENCIA, emergenciaPorId } from '../emergencias-dados.js';
import { lerEmergencia, salvarEmergencia, gradeEmergencias, perguntarEmergencia } from '../emergencia.js';
import { abrirItem } from './biblioteca.js';

const ORDEM_CONFIANCA = { oficial: 0, cientifica: 1, comunidade: 2, 'nao-verificada': 3 };
const SELO = {
  oficial: ['selo-oficial', 'Oficial'],
  cientifica: ['selo-cientifico', 'Científica'],
  comunidade: ['selo-comunidade', 'Não oficial'],
  'nao-verificada': ['selo-nao-verificado', 'Não verificado'],
};
const normal = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Pontua um item pelos termos da emergência (título vale mais que descrição). */
function pontuar(it, termos) {
  const titulo = normal(it.titulo);
  const resto = normal(`${it.descricao} ${it.materia || ''} ${it.colecaoTitulo || ''}`);
  let p = 0;
  for (const t of termos) {
    if (titulo.includes(t)) p += 3;
    else if (resto.includes(t)) p += 1;
  }
  return p;
}
const relevantes = (lista, termos, max) => lista
  .filter((it) => it.tipo !== 'mapa')
  .map((it) => ({ it, p: pontuar(it, termos) }))
  .filter((x) => x.p > 0)
  .sort((a, b) => b.p - a.p || (ORDEM_CONFIANCA[a.it.confianca] ?? 2) - (ORDEM_CONFIANCA[b.it.confianca] ?? 2))
  .slice(0, max)
  .map((x) => x.it);

/** Abre o assistente já com a pergunta enviada. */
export function perguntarAoAssistente(pergunta) {
  try {
    sessionStorage.setItem('pz-pergunta', pergunta);
  } catch {}
  navegar('assistente');
}

export async function render(raiz, { estado }) {
  raiz.append(cabecalho('Protocolo Zero', 'Iniciar Protocolo Zero', 'Qual é a emergência agora? Marque o que está acontecendo: o Protocolo Zero já se prepara e mostra o que fazer, com os livros e cartilhas baixados para a situação. Tudo funciona sem internet.'));
  // Liga o Protocolo Zero (descompacta, confere, liga a IA e as enciclopédias) sem internet, em segundo plano.
  const configurado = !!estado?.servidor?.config?.configurado;
  let iniciou = false;
  async function iniciarPZ() {
    if (!configurado || iniciou) return;
    iniciou = true;
    try {
      await api.post('/api/iniciar');
    } catch (e) {
      toast(`Não foi possível iniciar: ${e.message}`, 'erro');
    }
  }
  const avisoIniciar = () => (iniciou
    ? aviso('ok', h('b', {}, 'Preparando o Protocolo Zero em segundo plano. '), 'Pode seguir as orientações enquanto isso. O andamento aparece na ', h('a', { href: '#/inicio' }, 'página inicial'), '.')
    : null);
  const area = h('div', { class: 'pilha' });
  raiz.append(area);

  const [estadoEmerg, biblioteca, catalogo] = await Promise.all([
    lerEmergencia(),
    api.get('/api/biblioteca').catch(() => []),
    api.get('/api/catalogo').catch(() => null),
  ]);
  let ativas = (estadoEmerg.ativas || []).filter((id) => emergenciaPorId(id));
  const instalados = new Set(biblioteca.map((i) => i.id));
  const naoBaixados = (catalogo?.itens || []).filter((i) => !instalados.has(i.id) && !i.instalado);

  const numeros = h('div', { class: 'emerg-numeros' },
    NUMEROS.map((n) => h('a', { class: 'emerg-numero', href: `tel:${n.n}` }, h('b', {}, n.n), h('span', {}, n.nome))));

  let escolhendo = true;
  async function mudar(novas) {
    ativas = novas;
    try {
      await salvarEmergencia(ativas);
    } catch (e) {
      toast(e.message, 'erro');
    }
    desenhar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const linhaDoc = (it) => {
    const [cls, nome] = SELO[it.confianca] || SELO.comunidade;
    return h('li', { class: 'emerg-doc' },
      h('button', { type: 'button', class: 'emerg-doc-abrir', onclick: () => abrirItem(it), title: 'Abrir' },
        icone(it.tipo === 'zim' ? 'globo' : 'livro', 16),
        h('span', {}, h('b', {}, it.titulo), h('small', { class: 'suave' }, it.fonte || '')),
        h('span', { class: cls }, nome)));
  };

  function secaoEmergencia(e) {
    const termos = e.termos.map(normal);
    const docs = relevantes(biblioteca, termos, 8);
    const faltam = relevantes(naoBaixados, termos, 4);
    return h('section', { class: 'cartao pilha emerg-cartao', id: `emerg-${e.id}` },
      h('div', { class: 'linha' },
        h('span', { class: 'icone-bolha perigo' }, icone(e.icone, 22)),
        h('div', {}, h('h2', { style: { margin: 0 } }, e.nome), h('small', { class: 'suave' }, e.resumo))),
      h('div', { class: 'emerg-colunas' },
        h('div', {},
          h('h3', {}, 'Faça agora'),
          h('ol', { class: 'emerg-passos' }, e.agora.map((p) => h('li', {}, p)))),
        h('div', {},
          h('h3', {}, 'Depois do pior'),
          h('ul', { class: 'emerg-passos' }, e.depois.map((p) => h('li', {}, p))))),
      h('div', {},
        h('h3', {}, 'Livros e cartilhas já baixados'),
        docs.length
          ? h('ul', { class: 'emerg-docs' }, docs.map(linhaDoc))
          : h('p', { class: 'suave' }, 'Nada baixado ainda sobre isso. O assistente responde com o que tiver disponível.'),
        faltam.length
          ? h('details', { class: 'emerg-faltam' },
              h('summary', {}, `Há ${faltam.length} cartilha(s) sobre isso que você ainda não baixou`),
              h('ul', {}, faltam.map((it) => h('li', {}, it.titulo, h('small', { class: 'suave' }, ` · ${it.fonte}`)))),
              h('small', { class: 'suave' }, 'Só baixa com internet e com o seu clique, em '), h('a', { href: '#/configurar' }, 'Instalar conteúdo'), h('small', { class: 'suave' }, '.'))
          : null),
      h('div', {},
        h('h3', {}, 'Pergunte ao assistente'),
        h('div', { class: 'emerg-perguntas' },
          e.perguntas.map((p) => h('button', { type: 'button', class: 'botao pequeno', onclick: () => perguntarAoAssistente(p) }, icone('chat', 14), p)))));
  }

  function desenhar() {
    // Ao entrar (clique em "Iniciar"), sempre pergunta a emergência; as já marcadas vêm selecionadas.
    if (escolhendo || !ativas.length) {
      const marcadas = new Set(ativas);
      const botao = h('button', { class: 'botao primario grande', disabled: !marcadas.size, onclick: () => { escolhendo = false; iniciarPZ(); mudar([...marcadas]); } }, icone('play', 18), 'Iniciar e ver o que fazer');
      area.replaceChildren(
        numeros,
        h('div', { class: 'cartao pilha' },
          h('h2', { style: { margin: 0 } }, 'Qual é a emergência agora?'),
          h('p', { class: 'suave' }, 'Pode marcar mais de uma.'),
          gradeEmergencias(marcadas, () => { botao.disabled = !marcadas.size; }),
          h('div', { class: 'linha', style: { flexWrap: 'wrap', gap: '8px' } }, botao,
            configurado
              ? h('button', { class: 'botao', onclick: async () => { await salvarEmergencia([]).catch(() => {}); await iniciarPZ(); navegar('inicio'); } }, 'Nenhuma emergência, só iniciar')
              : null)),
        guiaGeral());
      return;
    }
    const lista = ativas.map(emergenciaPorId);
    area.replaceChildren(...[
      avisoIniciar(),
      numeros,
      h('div', { class: 'cartao plano linha entre emerg-ativas', style: { flexWrap: 'wrap', gap: '10px' } },
        h('div', { class: 'linha', style: { flexWrap: 'wrap', gap: '6px' } },
          h('b', {}, 'Emergência marcada:'),
          lista.map((e) => h('a', { class: 'etiqueta perigo', href: `#/emergencia`, onclick: (ev) => { ev.preventDefault(); document.getElementById(`emerg-${e.id}`)?.scrollIntoView({ behavior: 'smooth' }); } }, icone(e.icone, 12), e.nome))),
        h('div', { class: 'linha', style: { gap: '6px' } },
          h('button', { class: 'botao pequeno', onclick: async () => { const r = await perguntarEmergencia({ titulo: 'Mudar a emergência', confirmar: 'Atualizar' }); if (r) mudar(r.ativas); } }, icone('lapis', 14), 'Mudar'),
          h('button', { class: 'botao pequeno', onclick: () => mudar([]) }, icone('ok', 14), 'A emergência passou'))),
      aviso('info', 'O assistente já sabe da emergência e começa pelo que fazer agora. Você pode perguntar sobre ',
        h('b', {}, 'qualquer outro assunto'), ' baixado: ',
        h('a', { href: '#/assistente' }, 'abrir o assistente'), ' ou ', h('a', { href: '#/biblioteca' }, 'a biblioteca'), '.'),
      ...lista.map(secaoEmergencia),
      guiaGeral()].filter(Boolean));
  }

  function guiaGeral() {
    const docs = relevantes(biblioteca, BASE_EMERGENCIA.termos.map(normal), 6);
    return h('section', { class: 'cartao plano pilha' },
      h('h3', { style: { margin: 0 } }, 'Vale para qualquer emergência'),
      h('ul', { class: 'emerg-passos' }, BASE_EMERGENCIA.agora.map((p) => h('li', {}, p))),
      docs.length ? [h('b', {}, 'Primeiros socorros e sobrevivência já baixados:'), h('ul', { class: 'emerg-docs' }, docs.map(linhaDoc))] : null,
      h('div', { class: 'linha', style: { flexWrap: 'wrap', gap: '8px' } },
        h('a', { class: 'botao pequeno', href: '#/estoque' }, icone('pacote', 14), 'Estoque de emergência'),
        h('a', { class: 'botao pequeno', href: '#/mapas' }, icone('mapa', 14), 'Mapas offline'),
        h('a', { class: 'botao pequeno', href: '#/nutricao' }, icone('coracao', 14), 'Saúde e nutrição')),
      h('small', { class: 'suave' }, 'Orientações gerais baseadas na Defesa Civil, Ministério da Saúde, OMS, Cruz Vermelha e FEMA. Siga sempre as autoridades locais. O app não indica doses de remédio.'));
  }

  desenhar();
}

