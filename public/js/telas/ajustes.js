import { h, icone, bytes, aviso, toast, confirmar, cabecalho } from '../ui.js';
import { api } from '../api.js';
import { cartaoSugestaoIA } from '../iniciador.js';

export async function render(raiz, { estado }) {
  raiz.append(cabecalho('Sistema', 'Ajustes', 'Atualizações, modelos de IA, aparência e onde os dados ficam guardados.'));
  const area = h('div', { class: 'pilha' });
  raiz.append(area);

  async function desenhar() {
    const [s, cat, ia, au] = await Promise.all([api.get('/api/estado'), api.get('/api/catalogo'), api.get('/api/ia').catch(() => null), api.get('/api/auto').catch((e) => ({ erroCarregar: e.message }))]);
    const sugestao = await cartaoSugestaoIA();
    const vel = (v) => (v ? ` · ${v.toFixed(1)} palavras/s neste PC` : '');
    estado.servidor = s;
    const modelos = s.ollama.modelos;
    const nomeTema = (() => {
      try {
        return localStorage.getItem('pz-tema') || 'auto';
      } catch {
        return 'auto';
      }
    })();
    const personalizado = h('input', { type: 'text', placeholder: 'ex.: llama3.2:3b', style: { maxWidth: '260px' } });

    area.replaceChildren(
      cartaoAuto(au, s.plataforma),
      // ---- IA ----
      h('div', { class: 'cartao pilha' },
        h('div', { class: 'linha entre' },
          h('div', { class: 'linha' }, h('span', { class: 'icone-bolha' }, icone('cerebro')), h('h3', { style: { margin: 0 } }, 'Inteligência artificial (Ollama)')),
          h('span', { class: `etiqueta ${s.ollama.online ? 'musgo' : 'perigo'}` }, s.ollama.online ? `Rodando · v${s.ollama.versao}` : 'Desligado')),
        !s.ollama.online
          ? h('div', { class: 'pilha' },
              s.plataforma === 'linux'
                ? [h('p', {}, 'Instale no terminal:'), h('pre', { class: 'comando' }, 'curl -fsSL https://ollama.com/install.sh | sh')]
                : h('div', { class: 'linha' },
                    h('button', { class: 'botao primario', onclick: async () => { await api.post('/api/ollama/instalar'); toast('Instalando… veja em Transferências.'); } }, 'Instalar o Ollama'),
                    h('a', { class: 'botao', href: 'https://ollama.com/download', target: '_blank', rel: 'noopener' }, 'Baixar manualmente')),
              h('small', {}, 'Se já estiver instalado, abra o aplicativo Ollama.'))
          : null,
        ia?.recomendado
          ? h('div', { class: 'aviso info' }, icone('info'),
              h('div', {},
                h('b', {}, `Recomendado para este computador: ${ia.recomendado.nome}`), ` (${ia.recomendado.nivel}${vel(ia.recomendado.velocidade)}). `,
                ia.atual ? h('span', {}, `Em uso: ${ia.atual.nome} (${ia.atual.nivel}${vel(ia.atual.velocidade)}). `) : null,
                h('br'), h('small', {}, ia.recomendado.motivo)))
          : null,
        sugestao,
        h('div', { class: 'grade c2' },
          h('label', { class: 'campo' }, 'Modelo do assistente',
            h('select', { onchange: async (e) => { await api.post('/api/config', { modeloChat: e.target.value }); toast('Modelo do assistente alterado.'); } },
              h('option', { value: '' }, '—'),
              modelos.filter((m) => !/embed/i.test(m.nome)).map((m) => h('option', { value: m.nome, selected: m.nome.replace(/:latest$/, '') === s.config.modeloChat?.replace(/:latest$/, '') }, m.nome)))),
          h('label', { class: 'campo' }, 'Modelo de busca inteligente',
            h('select', { onchange: async (e) => { await api.post('/api/config', { modeloEmbed: e.target.value }); toast('Modelo de busca alterado. A biblioteca será preparada de novo.'); } },
              h('option', { value: '' }, '— só palavras-chave —'),
              modelos.filter((m) => /embed/i.test(m.nome)).map((m) => h('option', { value: m.nome.replace(/:latest$/, ''), selected: m.nome.replace(/:latest$/, '') === s.config.modeloEmbed }, m.nome))))),
        h('div', {},
          h('b', {}, 'Modelos instalados'),
          modelos.length
            ? h('div', { style: { marginTop: '6px' } }, modelos.map((m) =>
                h('div', { class: 'linha entre', style: { padding: '8px 0', borderBottom: '1px solid var(--linha)' } },
                  h('span', {}, h('span', { class: 'mono' }, m.nome), h('span', { class: 'suave' }, ` · ${bytes(m.tamanho)}${m.parametros ? ` · ${m.parametros}` : ''}`)),
                  h('button', { class: 'botao pequeno perigo', onclick: async () => {
                    if (!(await confirmar(`Remover o modelo ${m.nome}?`, { botao: 'Remover', perigo: true }))) return;
                    await api.del('/api/ollama/modelo', { nome: m.nome }).catch((e) => toast(e.message, 'erro'));
                    desenhar();
                  } }, 'Remover'))))
            : h('p', { class: 'suave' }, 'Nenhum.')),
        h('div', { class: 'linha' },
          h('b', {}, 'Baixar modelo:'),
          h('select', { style: { width: 'auto' }, onchange: (e) => (personalizado.value = e.target.value) },
            h('option', { value: '' }, 'Escolher da lista…'),
            [...cat.modelos.chat, ...cat.modelos.embed].map((m) => h('option', { value: m.tag }, `${m.nome} (${bytes(m.tamanho)})`))),
          personalizado,
          h('button', { class: 'botao', onclick: async () => {
            const nome = personalizado.value.trim();
            if (!nome) return;
            await api.post('/api/ollama/modelo', { nome }).then(() => toast(`Baixando ${nome}… veja em Transferências.`)).catch((e) => toast(e.message, 'erro'));
          } }, 'Baixar'))),

      // ---- busca ----
      h('div', { class: 'cartao pilha' },
        h('div', { class: 'linha' }, h('span', { class: 'icone-bolha musgo' }, icone('busca')), h('h3', { style: { margin: 0 } }, 'Índice de busca')),
        h('p', { class: 'suave', style: { margin: 0 } },
          `${s.indice.documentos} documentos · ${s.indice.trechos.toLocaleString('pt-BR')} trechos · ${s.indice.comVetores.toLocaleString('pt-BR')} com busca inteligente${s.indice.modelo ? ` (${s.indice.modelo})` : ''}`)),

      // ---- aparência ----
      h('div', { class: 'cartao pilha' },
        h('div', { class: 'linha' }, h('span', { class: 'icone-bolha ceu' }, icone('lua')), h('h3', { style: { margin: 0 } }, 'Aparência')),
        h('div', { class: 'linha' },
          [['auto', 'Automático'], ['claro', 'Claro'], ['escuro', 'Escuro']].map(([v, n]) =>
            h('button', { class: `chip ${nomeTema === v ? 'ativo' : ''}`, onclick: () => {
              try {
                v === 'auto' ? localStorage.removeItem('pz-tema') : localStorage.setItem('pz-tema', v);
              } catch {}
              if (v === 'auto') delete document.documentElement.dataset.tema;
              else document.documentElement.dataset.tema = v;
              desenhar();
            } }, n)))),

      // ---- dados ----
      h('div', { class: 'cartao pilha' },
        h('div', { class: 'linha' }, h('span', { class: 'icone-bolha alerta' }, icone('disco')), h('h3', { style: { margin: 0 } }, 'Dados')),
        h('div', {}, h('small', {}, 'Pasta'), h('div', { class: 'mono' }, s.pastaDados)),
        h('div', {}, h('small', {}, 'Espaço livre'), h('div', {}, `${bytes(s.disco.livre)} de ${bytes(s.disco.total)}`)),
        h('div', { class: 'linha' }, h('button', { class: 'botao', onclick: () => api.post('/api/abrir-pasta') }, icone('pasta', 16), 'Abrir pasta')),
        aviso('info', 'Para levar tudo para outro disco ou pendrive, use "Copiar para outro disco" no menu. Para fazer backup, copie a pasta "dados".')),

      // ---- ferramentas ----
      h('div', { class: 'cartao pilha' },
        h('div', { class: 'linha' }, h('span', { class: 'icone-bolha' }, icone('chip')), h('h3', { style: { margin: 0 } }, 'Componentes')),
        h('div', { class: 'linha' },
          h('span', { class: `etiqueta ${s.ferramentas.kiwix ? 'musgo' : ''}` }, `Kiwix: ${s.ferramentas.kiwix ? 'instalado' : 'não instalado'}`),
          h('span', { class: `etiqueta ${s.ferramentas.pmtiles ? 'musgo' : ''}` }, `pmtiles: ${s.ferramentas.pmtiles ? 'instalado' : 'não instalado'}`),
          h('span', { class: `etiqueta ${s.ferramentas.vendor ? 'musgo' : ''}` }, `Leitor de PDF e mapas: ${s.ferramentas.vendor ? 'pronto' : 'não baixado'}`)),
        h('small', {}, 'São baixados automaticamente quando necessários.'))
    );
  }

  // ---- atualizações e inicialização (ao ligar o computador) ----
  function cartaoAuto(au, plataforma) {
    const sistema = plataforma === 'win32' ? 'o Windows' : plataforma === 'darwin' ? 'o Mac' : 'o computador';
    const titulo = h('div', { class: 'linha' }, h('span', { class: 'icone-bolha musgo' }, icone('atualizar')), h('h3', { style: { margin: 0 } }, 'Atualizações e inicialização'));
    // Nunca some: se não carregou, mostra o motivo e um botão para tentar de novo.
    if (!au || au.erroCarregar) {
      return h('div', { class: 'cartao pilha', id: 'atualizacoes' }, titulo,
        aviso('erro', `Não foi possível carregar estas opções${au?.erroCarregar ? `: ${au.erroCarregar}` : ''}. Se o Protocolo Zero foi atualizado agora, feche e abra de novo.`),
        h('div', { class: 'linha' }, h('button', { class: 'botao pequeno', onclick: () => desenhar() }, icone('atualizar', 14), 'Tentar de novo')));
    }
    const salvar = async (campos, caixa, msg) => {
      caixa.disabled = true;
      try {
        await api.put('/api/auto', campos);
        toast(msg);
      } catch (e) {
        toast(e.message, 'erro');
      }
      desenhar();
    };
    const opcao = (marcado, nome, desc, aoMudar, desabilitado = false) =>
      h('label', { class: 'item-sel' },
        h('input', { type: 'checkbox', checked: !!marcado, disabled: desabilitado, onchange: (e) => aoMudar(e.target.checked, e.target) }),
        h('div', {}, h('div', { class: 'nome' }, nome), h('div', { class: 'desc' }, desc)));

    const u = au.ultimo;
    const quando = u?.fim ? new Date(u.fim).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : null;
    const ultimo = !u ? null
      : u.estado === 'sem-internet' ? aviso('', `Última tentativa (${quando}): sem internet. Tenta de novo na próxima vez que ligar ${sistema}.`)
        : h('details', { class: 'auto-ultimo' },
            h('summary', {}, `Última busca automática: ${quando} · `,
              h('span', { class: `etiqueta ${u.estado === 'ok' ? 'musgo' : u.estado === 'erro' ? 'perigo' : 'alerta'}` }, u.estado === 'ok' ? 'tudo certo' : u.estado === 'erro' ? 'com erro' : 'com avisos')),
            h('ul', { class: 'suave' },
              u.erro ? h('li', {}, u.erro) : null,
              u.semFonte ? h('li', {}, 'Sem endereço de catálogo publicado.') : null,
              !u.erro && !u.semFonte ? h('li', {}, u.novos?.length ? `${u.novos.length} fonte(s) nova(s) no catálogo.` : 'Nenhuma fonte nova no catálogo.') : null,
              u.baixados?.length ? h('li', {}, h('b', {}, `Baixadas (pacote ${u.pacote}): `), u.baixados.join(', ')) : null,
              u.novos?.length && !u.baixados?.length && !u.pacote ? h('li', {}, 'Veja as novas em Instalar conteúdo (selo "Novo").') : null,
              u.semEspaco?.length ? h('li', {}, h('b', {}, 'Sem espaço no disco: '), u.semEspaco.join(', ')) : null,
              u.falhas?.length ? h('li', {}, h('b', {}, 'Não foi possível baixar: '), u.falhas.join('; ')) : null,
              u.modelo ? h('li', {}, h('b', {}, 'Modelo de IA: '), u.modelo) : null));

    const ligadoAtualizar = au.ativo && au.registrado;
    const ligadoAbrir = au.abrirAoLigar && au.abrirRegistrado;
    return h('div', { class: 'cartao pilha', id: 'atualizacoes' },
      h('div', { class: 'linha entre' }, titulo,
        h('span', { class: `etiqueta ${ligadoAtualizar || ligadoAbrir ? 'musgo' : ''}` }, ligadoAtualizar ? 'Atualização ligada' : 'Atualização desligada')),

      h('h4', { class: 'ajuste-sub' }, `Ao ligar ${sistema}`),
      opcao(au.ativo, 'Procurar fontes novas sozinho',
        'Uma vez por dia, quando houver internet, procura novas fontes e links adicionados ao catálogo e baixa em segundo plano as novas do pacote que você usa (Essencial, Padrão ou Completo). Não precisa abrir o Protocolo Zero: ele se fecha sozinho quando termina.',
        (v, c) => salvar({ ativo: v }, c, v ? `Pronto: ao ligar ${sistema}, o Protocolo Zero procura fontes novas sozinho.` : 'Busca automática desligada.')),
      opcao(au.modelos, 'Trocar para um modelo de IA melhor quando houver',
        'Se sair um modelo mais preciso que este computador aguenta, baixa e passa a usar. Pode baixar alguns GB. O modelo antigo continua instalado.',
        (v, c) => salvar({ modelos: v }, c, 'Salvo.'), !au.ativo),
      opcao(au.abrirAoLigar, 'Abrir o Protocolo Zero ao ligar',
        `Abre o Protocolo Zero e o navegador sempre que ${sistema} for ligado, pronto para usar. Para fechar, feche a janela do Protocolo Zero na barra de tarefas.`,
        (v, c) => salvar({ abrirAoLigar: v }, c, v ? `Pronto: o Protocolo Zero abre ao ligar ${sistema}.` : 'Não abre mais ao ligar.')),

      aviso('ok', h('b', {}, 'O que você já tem fica no computador: '), 'a atualização só acrescenta. Nada do que já foi baixado é apagado, trocado ou baixado de novo, nem quando a fonte ou o link deixa de existir. Os arquivos que você enviou, suas anotações, a emergência marcada e as conversas também nunca são alterados.'),
      au.ativo && !au.registrado ? aviso('erro', `A busca automática está marcada, mas ${sistema} não está configurado para abri-la. Desmarque e marque de novo.`) : null,
      au.abrirAoLigar && !au.abrirRegistrado ? aviso('erro', `"Abrir ao ligar" está marcado, mas ${sistema} não está configurado para isso. Desmarque e marque de novo.`) : null,
      (au.ativo || au.abrirAoLigar) && au.removivel ? aviso('', 'O Protocolo Zero está num pendrive ou HD externo. Ao ligar o computador, ele só abre se o disco estiver conectado.') : null,
      !au.fonte ? h('small', { class: 'suave' }, 'Esta cópia ainda não tem o endereço do catálogo publicado, então ainda não há onde procurar fontes novas.') : null,
      ultimo,
      h('div', { class: 'linha' },
        h('button', { class: 'botao pequeno', disabled: au.rodando, onclick: async (e) => {
          e.currentTarget.disabled = true;
          await api.post('/api/auto/rodar').then(() => toast('Procurando fontes novas no catálogo… acompanhe em Transferências.')).catch((er) => toast(er.message, 'erro'));
        } }, icone('atualizar', 14), au.rodando ? 'Procurando…' : 'Procurar fontes novas agora')));
  }

  await desenhar();
}
