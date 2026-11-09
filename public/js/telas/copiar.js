// "Copiar para pendrive ou HD": leva o Protocolo Zero para outro disco, pronto para abrir com um clique
// em outro computador ou direto do pendrive/HD. Também cria o atalho na Área de Trabalho deste computador.
import { h, icone, bytes, aviso, toast, cabecalho, barra } from '../ui.js';
import { api } from '../api.js';
import { aoAtualizar } from '../app.js';

const LIMITE_FAT32 = 4 * 1024 ** 3 - 1;
const TIPO = { pendrive: ['Pendrive', 'pacote'], disco: ['HD ou SSD', 'disco'], sistema: ['Este computador', 'computador'] };

export async function render(raiz, { estado }) {
  raiz.append(cabecalho('Levar com você', 'Copiar para outro disco',
    'Copia o Protocolo Zero com tudo o que você baixou para um pendrive, HD ou SSD. Dá para abrir com um clique direto de lá ou instalar em outro computador, sem internet.'));
  const area = h('div', { class: 'pilha' });
  raiz.append(area);

  const s = {
    dados: null,
    escolhido: null, // pasta de destino
    outra: '',
    incluir: { anotacoes: true, ias: true, pacotes: false },
    tarefa: null,
    copiado: null,
  };

  async function carregar() {
    area.replaceChildren(h('div', { class: 'cartao' }, h('div', { class: 'linha' }, h('span', { class: 'ponto alerta pulsa' }), 'Procurando pendrives e discos…')));
    try {
      s.dados = await api.get('/api/copiar');
    } catch (e) {
      area.replaceChildren(aviso('erro', `Não foi possível listar os discos: ${e.message}`));
      return;
    }
    const preferido = s.dados.destinos.find((d) => d.gravavel && d.tipo === 'pendrive') || s.dados.destinos.find((d) => d.gravavel && d.tipo === 'disco');
    if (s.escolhido !== 'outra' && !s.dados.destinos.some((d) => d.pasta === s.escolhido && d.gravavel)) s.escolhido = preferido?.pasta || null;
    desenhar();
  }

  const t = () => s.dados.tamanhos;
  const total = () => t().programa + t().conteudo + (s.incluir.anotacoes ? t().anotacoes : 0) + (s.incluir.pacotes ? t().pacotes : 0)
    + (s.incluir.ias ? t().ias : 0);
  const destinoAtual = () => s.dados.destinos.find((d) => d.pasta === s.escolhido);
  const pastaFinal = () => (s.escolhido === 'outra' ? s.outra.trim() : s.escolhido);

  function problemas() {
    const d = destinoAtual();
    const r = [];
    if (!pastaFinal()) r.push('Escolha onde copiar.');
    if (d && d.livre < total()) r.push(`Não cabe: precisa de ${bytes(total())} e há ${bytes(d.livre)} livres.`);
    const maior = t().maiorArquivo || 0;
    if (d?.fat32 && maior > LIMITE_FAT32) {
      r.push(`Este pendrive está em FAT32, que não aceita arquivos maiores que 4 GB (há um de ${bytes(maior)}). Formate em exFAT ou NTFS e tente de novo, ou desmarque as IAs.`);
    }
    return r;
  }

  function cartaoDestino(d) {
    const [nome, ic] = TIPO[d.tipo] || TIPO.disco;
    const marcado = s.escolhido === d.pasta;
    return h('button', {
      type: 'button', class: `opcao ${marcado ? 'selecionada' : ''} ${d.gravavel ? '' : 'desabilitada'}`,
      onclick: () => { if (d.gravavel) { s.escolhido = d.pasta; desenhar(); } },
    },
      marcado ? h('span', { class: 'etiqueta musgo selo' }, 'Escolhido') : !d.gravavel ? h('span', { class: 'etiqueta perigo selo' }, 'Sem permissão') : null,
      h('div', { class: 'linha' }, h('span', { class: 'icone-bolha' }, icone(ic, 18)),
        h('div', {}, h('b', {}, `${nome}${d.nome ? ` · ${d.nome}` : ''}`), h('div', { class: 'suave mono', style: { fontSize: '12px' } }, d.raiz))),
      h('small', {}, `${bytes(d.livre)} livres de ${bytes(d.total)}`),
      h('small', { class: 'suave mono', style: { wordBreak: 'break-all' } }, d.pasta),
      d.nota ? h('small', { class: 'suave' }, d.nota) : null,
      d.fat32 ? h('small', { class: 'alerta-texto' }, 'FAT32: não aceita arquivos maiores que 4 GB.') : null);
  }

  const opcao = (chave, titulo, tam, desc) =>
    h('label', { class: 'item-sel' },
      h('input', { type: 'checkbox', checked: s.incluir[chave], onchange: (e) => { s.incluir[chave] = e.target.checked; desenhar(); } }),
      h('div', {}, h('div', { class: 'nome' }, titulo), h('div', { class: 'desc' }, desc)),
      h('div', { class: 'tam' }, bytes(tam)));

  function desenhar() {
    if (!s.dados) return;
    const probs = problemas();
    const plataforma = estado.servidor?.plataforma;
    area.replaceChildren(
      h('div', { class: 'cartao pilha' },
        h('div', { class: 'linha entre' },
          h('h2', { style: { margin: 0 } }, '1. Onde copiar'),
          h('button', { class: 'botao pequeno', onclick: carregar }, icone('atualizar', 14), 'Procurar de novo')),
        h('small', { class: 'suave' }, 'Conecte o pendrive ou o HD e clique em "Procurar de novo". A pasta ProtocoloZero é criada na raiz do disco.'),
        h('div', { class: 'grade c3' },
          s.dados.destinos.map(cartaoDestino),
          h('div', { class: `opcao ${s.escolhido === 'outra' ? 'selecionada' : ''}`, onclick: () => { if (s.escolhido !== 'outra') { s.escolhido = 'outra'; desenhar(); } } },
            h('b', {}, 'Outra pasta'),
            h('input', { type: 'text', placeholder: plataforma === 'win32' ? 'Ex.: E:\\ProtocoloZero' : 'Ex.: /media/pendrive/ProtocoloZero', value: s.outra,
              onfocus: () => { if (s.escolhido !== 'outra') { s.escolhido = 'outra'; desenhar(); } },
              oninput: (e) => { s.outra = e.target.value; }, onchange: () => desenhar() }),
            h('small', { class: 'suave' }, 'Uma pasta vazia ou uma cópia anterior (copiar de novo só leva o que mudou).')))),

      h('div', { class: 'cartao pilha' },
        h('h2', { style: { margin: 0 } }, '2. O que levar'),
        h('div', { class: 'lista-itens' },
          h('label', { class: 'item-sel' }, h('input', { type: 'checkbox', checked: true, disabled: true }),
            h('div', {}, h('div', { class: 'nome' }, 'Programa e conteúdo baixado'), h('div', { class: 'desc' }, 'Livros, cartilhas, enciclopédias, mapas, o índice de busca e o Node.js para Windows, macOS e Linux.')),
            h('div', { class: 'tam' }, bytes(t().programa + t().conteudo))),
          opcao('ias', 'Assistente de IA (as IAs baixadas)', t().ias, 'O outro computador ainda precisa do Ollama instalado (gratuito).'),
          opcao('anotacoes', 'Minhas anotações', t().anotacoes, 'Estoque de emergência, saúde e nutrição e a emergência marcada.'),
          opcao('pacotes', 'Cópias compactadas de segurança', t().pacotes, 'Servem para restaurar arquivos danificados sem internet. Ocupam mais espaço.'))),

      h('div', { class: 'cartao pilha' },
        h('div', { class: 'linha entre', style: { flexWrap: 'wrap', gap: '10px' } },
          h('div', {}, h('b', {}, `Total: ${bytes(total())}`), h('div', { class: 'suave', style: { fontSize: '13px' } }, pastaFinal() ? `Para: ${pastaFinal()}` : 'Escolha onde copiar')),
          h('button', { class: 'botao primario grande', disabled: !!probs.length || !!s.tarefa, onclick: copiar }, icone('copiar', 18), 'Copiar agora')),
        ...probs.map((p) => aviso('erro', p)),
        progresso(),
        s.copiado
          ? aviso('ok', h('b', {}, 'Cópia pronta. '), 'No outro computador (ou direto do pendrive/HD), abra o arquivo "Iniciar Protocolo Zero" com dois cliques. As instruções estão no LEIA-ME.txt. ',
              h('button', { class: 'botao pequeno', onclick: () => api.post('/api/copiar/abrir', { pasta: s.copiado }).catch((e) => toast(e.message, 'erro')) }, icone('pasta', 14), 'Abrir a pasta'))
          : null),

      h('div', { class: 'cartao plano pilha' },
        h('h3', { style: { margin: 0 } }, 'Abrir com um clique neste computador'),
        h('p', { class: 'suave', style: { margin: 0 } },
          plataforma === 'win32' ? 'Na pasta do Protocolo Zero está o arquivo "Iniciar Protocolo Zero.bat": dois cliques nele abrem tudo. Crie um atalho na Área de Trabalho ou no Menu Iniciar para ficar mais fácil.'
            : plataforma === 'darwin' ? 'Na pasta do Protocolo Zero está o arquivo "Iniciar Protocolo Zero.command": dois cliques nele abrem tudo.'
              : 'Na pasta do Protocolo Zero está o arquivo "iniciar-protocolo-zero.sh", que abre tudo.'),
        h('div', { class: 'linha', style: { flexWrap: 'wrap', gap: '8px' } },
          botaoAtalho('desktop', 'Criar atalho na Área de Trabalho'),
          botaoAtalho('menu', plataforma === 'win32' ? 'Criar atalho no Menu Iniciar' : plataforma === 'darwin' ? 'Colocar em Aplicativos' : 'Colocar no menu de aplicativos')),
        h('small', { class: 'suave' }, 'Por segurança, o Windows não deixa nenhum programa abrir sozinho quando o pendrive é conectado. Abra com dois cliques.')));
  }

  function botaoAtalho(onde, rotulo) {
    const b = h('button', { class: 'botao', onclick: async () => {
      b.disabled = true;
      try {
        const r = await api.post('/api/atalho', { onde });
        toast(`Atalho criado: ${r.arquivo}`);
      } catch (er) {
        toast(er.message, 'erro');
      }
      b.disabled = false;
    } }, icone(onde === 'menu' ? 'menu' : 'mais', 16), rotulo);
    return b;
  }

  function progresso() {
    if (!s.tarefa) return null;
    const tf = estado.tarefas.find((x) => x.id === s.tarefa);
    if (!tf) return h('small', { class: 'suave' }, 'Começando…');
    const fr = tf.total ? tf.baixado / tf.total : null;
    return h('div', { class: 'pilha', style: { gap: '6px' } },
      barra(fr),
      h('small', { class: 'suave' }, `${tf.mensagem || ''}${tf.total ? ` · ${bytes(tf.baixado)} de ${bytes(tf.total)}` : ''}`));
  }

  async function copiar() {
    const pasta = pastaFinal();
    try {
      const r = await api.post('/api/copiar', { pasta, incluir: s.incluir });
      s.tarefa = r.tarefa;
      s.copiado = null;
      toast('Copiando… pode continuar usando o Protocolo Zero.');
      desenhar();
    } catch (e) {
      toast(e.message, 'erro');
    }
  }

  // Acompanha a cópia pela lista de tarefas.
  const parar = aoAtualizar((tipo) => {
    if (tipo !== 'tarefas' || !s.tarefa) return;
    const tf = estado.tarefas.find((x) => x.id === s.tarefa);
    if (tf && ['concluido', 'erro', 'cancelado'].includes(tf.estado)) {
      if (tf.estado === 'concluido') s.copiado = pastaFinal();
      else toast(tf.mensagem, 'erro');
      s.tarefa = null;
      carregar();
      return;
    }
    desenhar();
  });

  await carregar();
  return parar;
}
