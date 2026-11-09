import { h, icone, bytes, aviso } from '../ui.js';
import { api } from '../api.js';
import { aoAtualizar } from '../app.js';
import { NUMEROS, FICHAS } from '../guia.js';
import { secaoEnergia } from '../energia.js';
import { painelIniciar, painelAtualizar, cartaoSugestaoIA, irParaAtualizar } from '../iniciador.js';

function topografia() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', '520');
  svg.setAttribute('height', '360');
  svg.setAttribute('viewBox', '0 0 520 360');
  svg.classList.add('topografia');
  for (let i = 0; i < 9; i++) {
    const e = document.createElementNS(ns, 'ellipse');
    e.setAttribute('cx', 340 + i * 4);
    e.setAttribute('cy', 150 - i * 3);
    e.setAttribute('rx', 40 + i * 26);
    e.setAttribute('ry', 26 + i * 17);
    e.setAttribute('fill', 'none');
    e.setAttribute('stroke', 'currentColor');
    e.setAttribute('stroke-width', '1.2');
    e.setAttribute('transform', `rotate(${-12 + i * 2} 340 150)`);
    svg.append(e);
  }
  return svg;
}

export async function render(raiz, { estado, args = [] }) {
  const area = h('div');
  // O painel "Iniciar" fica fora do redesenho para não perder o acompanhamento ao vivo.
  const configurado0 = estado.servidor?.config?.configurado;
  // Iniciar (sem internet: descompacta e configura) e Atualizar (internet: baixa compactado).
  const painel = configurado0 ? painelIniciar({ aoTerminar: () => desenhar() }) : null;
  const painelAtu = configurado0 ? painelAtualizar({ aoTerminar: () => setTimeout(() => painel?.recarregar(), 300) }) : null;
  const sugestao = h('div');
  // Energia sem rede elétrica (fora do redesenho: guarda as escolhas do usuário).
  const energia = h('div');
  secaoEnergia().then((el) => el && energia.replaceChildren(el));
  raiz.append(area);
  if (configurado0) cartaoSugestaoIA().then((c) => c && sugestao.replaceChildren(c));

  async function desenhar() {
    const s = estado.servidor;
    const [itens, catalogo] = await Promise.all([api.get('/api/biblioteca').catch(() => []), api.get('/api/catalogo').catch(() => null)]);
    const total = itens.reduce((a, i) => a + (i.tamanho || 0), 0);
    const zims = itens.filter((i) => i.tipo === 'zim').length;
    const mapas = itens.filter((i) => i.tipo === 'mapa').length;
    const docs = itens.filter((i) => ['pdf', 'epub', 'texto'].includes(i.tipo)).length;
    const midias = itens.filter((i) => ['video', 'audio'].includes(i.tipo)).length;
    const configurado = s?.config?.configurado;

    area.replaceChildren(...[
      h('section', { class: 'heroi' },
        topografia(),
        h('div', { class: 'sobretitulo' }, 'Protocolo Zero'),
        h('h1', {}, 'Conhecimento que não depende de internet.'),
        h('p', {}, 'Manuais de saúde, ervas medicinais, água, energia e sobrevivência em português — guardados no seu computador, com um assistente de IA que responde citando as fontes.'),
        h('div', { class: 'linha', style: { marginTop: '18px' } },
          configurado
            ? [h('a', { class: 'botao primario grande', href: '#/emergencia' }, icone('play', 18), 'Iniciar Protocolo Zero'),
               h('a', { class: 'botao grande', href: '#/assistente' }, icone('chat', 18), 'Perguntar ao assistente'),
               h('a', { class: 'botao grande', href: '#/configurar' }, icone('baixar', 18), 'Instalar conteúdo')]
            : [h('a', { class: 'botao primario grande', href: '#/configurar' }, icone('baixar', 18), 'Configurar meu Protocolo Zero'),
               h('a', { class: 'botao grande', href: '#/emergencia' }, icone('play', 18), 'Iniciar Protocolo Zero'),
               h('span', { class: 'suave' }, 'Leva 2 minutos. Depois é só esperar os downloads.')])),

      secaoInstalar(catalogo, s),
      painel,
      painelAtu,
      sugestao,
      !s?.ollama?.online && configurado
        ? aviso('', h('b', {}, 'O motor de IA (Ollama) não está rodando. '), 'Clique em "Iniciar Protocolo Zero" para ligá-lo; se ele não estiver instalado, use "Atualizar".')
        : null,

      h('div', { class: 'grade c4', style: { margin: '18px 0 30px' } },
        cartao('livro', 'Documentos', `${docs}`, 'PDFs, livros e textos', '', '#/biblioteca'),
        cartao('globo', 'Enciclopédias', `${zims}`, s?.kiwix?.ativo ? 'Abertas no leitor' : 'Wikipédia, iFixit…', 'ceu', '#/enciclopedia'),
        cartao('mapa', 'Mapas', `${mapas}`, 'Regiões offline', 'musgo', '#/mapas'),
        cartao('disco', 'Ocupado', bytes(total), `${midias} vídeos/áudios · ${bytes(s?.disco?.livre)} livres`, 'alerta', '#/ajustes')),

      energia,

      h('div', { class: 'linha entre', style: { marginBottom: '12px' } },
        h('div', {}, h('div', { class: 'sobretitulo' }, 'Guia rápido'), h('h2', {}, 'Em caso de emergência')),
        h('small', {}, 'Disponível mesmo sem nada baixado.')),
      h('div', { class: 'numeros', style: { marginBottom: '16px' } },
        NUMEROS.map((n) => h('div', { class: 'numero' }, h('b', {}, n.n), h('span', {}, n.nome)))),
      h('div', { class: 'guia' },
        FICHAS.map((f) =>
          h('article', { class: 'ficha', style: { '--cor': f.cor } },
            h('h3', {}, icone(f.icone, 18), f.titulo),
            h('ol', {}, f.passos.map((p) => h('li', {}, p))),
            h('div', { class: 'fonte' }, `Fonte: ${f.fonte}`)))),
      h('p', { class: 'suave', style: { marginTop: '14px', fontSize: '13px' } },
        'Estas orientações são para quando não há socorro disponível e não substituem atendimento profissional.'),
    ].filter(Boolean));
  }

  await desenhar();
  if (args[0] === 'atualizar') requestAnimationFrame(irParaAtualizar);
  // Redesenha quando uma transferência termina (novos itens na biblioteca).
  let concluidas = estado.tarefas.filter((t) => t.estado === 'concluido').length;
  const parar = aoAtualizar((tipo) => {
    if (tipo !== 'tarefas') return;
    const agora = estado.tarefas.filter((t) => t.estado === 'concluido').length;
    if (agora !== concluidas) {
      concluidas = agora;
      desenhar();
    }
  });
  return () => {
    parar();
    painel?.destruir();
    painelAtu?.destruir();
  };
}

const DESC_CAT = {
  saude: 'Primeiros socorros, doenças, remédios',
  ervas: 'Plantas medicinais e fitoterápicos',
  agua: 'Tratar, guardar e encontrar água',
  energia: 'Energia solar e sem rede elétrica',
  alimentos: 'Nutrição e estoque de emergência',
  agricultura: 'Horta, criação de animais e pesca',
  sobrevivencia: 'Abrigo, fogo, orientação, desastres',
  reparos: 'Consertos e manutenção',
  educacao: 'Matemática, física, história, elétrica…',
  enciclopedia: 'Wikipédia e outras enciclopédias',
  videos: 'Aulas e vídeos offline',
  mapas: 'Mapas do Brasil e dos estados',
};

// "Instalar conteúdo" em destaque: guia o usuário a escolher o que baixar, categoria por categoria.
function secaoInstalar(cat, s) {
  if (!cat || !s?.config?.configurado) return null;
  const categorias = cat.categorias.filter((c) => c.id !== 'meus')
    .map((c) => {
      const itens = cat.itens.filter((i) => i.categoria === c.id);
      return { c, total: itens.length, ja: itens.filter((i) => i.instalado).length };
    })
    .filter((g) => g.total);
  const ias = (s?.ollama?.modelos || []).filter((m) => !/embed/i.test(m.nome)).length;
  const bloco = (href, ic, cor, titulo, sub, ja, total) =>
    h('a', { class: 'instalar-cat', href },
      h('span', { class: 'icone-bolha', style: { background: `${cor}22`, color: cor } }, icone(ic, 18)),
      h('div', {}, h('b', {}, titulo), h('small', {}, sub)),
      total != null ? h('span', { class: `etiqueta ${ja >= total ? 'musgo' : ja ? 'brasa' : ''}` }, ja >= total ? 'Completo' : `${ja} de ${total}`) : null);
  return h('section', { class: 'cartao instalar-destaque' },
    h('div', { class: 'linha entre' },
      h('div', {}, h('div', { class: 'sobretitulo' }, 'Monte o seu Protocolo Zero'), h('h2', { style: { margin: '2px 0' } }, 'Instalar conteúdo'),
        h('p', { class: 'suave', style: { margin: 0 } }, 'Escolha o que guardar no computador para usar sem internet. Clique numa área para ver e marcar o que baixar.')),
      h('a', { class: 'botao primario grande', href: '#/configurar' }, icone('baixar', 18), 'Escolher o que baixar')),
    h('div', { class: 'instalar-grade' },
      bloco('#/configurar/ia', 'cerebro', '#8a5cc9', 'IAs do assistente', ias ? `${ias} instalada(s) · adicione uma mais inteligente` : 'Rápida, moderada ou mais inteligente', null, null),
      ...categorias.map(({ c, total, ja }) => bloco(`#/configurar/conteudo/${c.id}`, c.icone, c.cor, c.nome, DESC_CAT[c.id] || '', ja, total)),
      bloco('#/arquivo', 'nuvem', '#a2752c', 'Internet Archive (não verificado)', 'Milhões de livros e vídeos da internet. Use com cautela.', null, null)));
}

function cartao(ic, titulo, valor, sub, cor, link) {
  return h('a', { class: 'cartao cartao-status', href: link, style: { color: 'inherit', textDecoration: 'none' } },
    h('div', { class: 'titulo' }, h('span', { class: `icone-bolha ${cor}` }, icone(ic, 19)), titulo),
    h('div', { class: 'indicador' }, h('b', {}, valor), h('span', {}, sub)));
}
