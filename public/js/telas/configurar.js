// Assistente de configuração: detecta o PC, sugere modelo de IA e pacote de conteúdo, e instala.
import { h, icone, bytes, aviso, toast, cabecalho, confirmar } from '../ui.js';
import { api } from '../api.js';
import { navegar } from '../app.js';

const GB = 1024 ** 3;
const PASSOS = ['Seu computador', 'Inteligência artificial', 'Conteúdo', 'Revisar e instalar'];

export async function render(raiz, { estado, args = [] }) {
  const s = {
    passo: 0,
    hw: null,
    rec: null,
    cat: null,
    pacote: null,
    selecionados: new Set(),
    modeloChat: null, // IA padrão do chat
    modelos: new Set(), // IAs marcadas para baixar (pode ser mais de uma)
    modeloEmbed: null,
    semIA: false,
    mapasEstados: [], // [{ uf, maxzoom }]
    abertos: new Set(), // categorias expandidas em "Personalizar"
  };

  raiz.append(cabecalho('Instalação', 'Instalar conteúdo', estado.servidor?.config?.configurado
    ? 'O que você já tem aparece marcado. Marque o que quer acrescentar e desmarque o que quer tirar para liberar espaço. Melhorou o computador ou liberou espaço? Veja o "Upgrade" no primeiro passo.'
    : 'Escolha o que guardar no seu computador: IAs, livros, enciclopédias e mapas. Sugerimos o que cabe e funciona bem nele, e você pode mudar tudo.'));
  const carregando = h('div', { class: 'cartao' }, h('div', { class: 'linha' }, h('span', { class: 'ponto alerta pulsa' }), 'Analisando o computador e consultando o catálogo…'));
  raiz.append(carregando);

  try {
    const [hw, cat] = await Promise.all([api.get('/api/hardware'), api.get('/api/catalogo')]);
    s.hw = hw.hardware;
    s.rec = hw.recomendacao;
    s.cat = cat;
  } catch (e) {
    carregando.replaceWith(aviso('erro', `Não foi possível analisar o computador: ${e.message}`));
    return;
  }
  carregando.remove();

  const instalados = new Set(s.cat.itens.filter((i) => i.instalado).map((i) => i.id));
  const modelosInstalados = new Set((estado.servidor?.ollama?.modelos || []).map((m) => m.nome.replace(/:latest$/, '')));
  // Modo "gerenciar": quem já configurou vê o que tem marcado e pode tirar, pôr ou fazer upgrade.
  s.gerenciar = !!estado.servidor?.config?.configurado;
  s.modelosRemover = new Set(); // IAs já baixadas que o usuário desmarcou
  const iasInstaladas = () => s.cat.modelos.chat.map((m) => m.tag).filter((t) => modelosInstalados.has(t) && !s.modelosRemover.has(t));
  s.modeloChat = estado.servidor?.config?.modeloChat || s.rec.modelo.chat.tag;
  if (s.gerenciar) {
    if (!modelosInstalados.has(s.modeloChat)) s.modeloChat = iasInstaladas()[0] || null;
  } else if (!modelosInstalados.has(s.modeloChat)) s.modelos.add(s.modeloChat);
  s.modeloEmbed = estado.servidor?.config?.modeloEmbed || s.rec.modelo.embed.tag;
  if (s.gerenciar) {
    s.selecionados = new Set(instalados);
    s.pacote = 'personalizado';
  } else escolherPacote(s.rec.pacoteSugerido);
  // Atalhos vindos da tela inicial: #/configurar/ia, #/configurar/conteudo/<categoria>
  if (args[0] === 'ia') s.passo = 1;
  if (args[0] === 'conteudo') {
    s.passo = 2;
    if (args[1]) s.abertos.add(args[1]);
  }

  function escolherPacote(id) {
    s.pacote = id;
    const p = s.rec.pacotes.find((x) => x.id === id);
    // Gerenciando: o pacote só acrescenta o que falta; nada instalado sai sem o usuário desmarcar.
    const manter = s.gerenciar ? [...s.selecionados].filter((i) => instalados.has(i)) : [];
    s.selecionados = new Set([...(p ? p.itens : []), ...manter]);
  }

  const passos = h('div', { class: 'passos' });
  const corpo = h('div');
  const rodape = h('div', { class: 'rodape-fixo' });
  raiz.append(passos, corpo, rodape);

  const item = (id) => s.cat.itens.find((i) => i.id === id);
  const novos = () => [...s.selecionados].filter((id) => !instalados.has(id) && item(id));
  const tamanhoModelo = (tag, lista) => (lista.find((m) => m.tag === tag)?.tamanho || 0);
  const iasNovas = () => [...s.modelos].filter((t) => !modelosInstalados.has(t));
  // O que já está instalado e foi desmarcado: será apagado do computador.
  const aRemover = () => [...instalados].filter((id) => !s.selecionados.has(id) && item(id));
  const iasRemover = () => [...s.modelosRemover].filter((t) => modelosInstalados.has(t));
  const liberadoBytes = () =>
    aRemover().reduce((a, id) => a + (item(id).tamanho || 0), 0) +
    iasRemover().reduce((a, t) => a + tamanhoModelo(t, s.cat.modelos.chat), 0);
  const temMudanca = () => novos().length || aRemover().length || iasRemover().length || s.mapasEstados.length || (!s.semIA && iasNovas().length);
  const totalBytes = () => {
    let t = novos().reduce((a, id) => a + (item(id).tamanho || 0), 0);
    t += s.mapasEstados.reduce((a, m) => a + estimarEstado(m), 0);
    if (!s.semIA) {
      for (const tag of iasNovas()) t += tamanhoModelo(tag, s.cat.modelos.chat);
      if (!modelosInstalados.has(s.modeloEmbed)) t += tamanhoModelo(s.modeloEmbed, s.cat.modelos.embed);
    }
    return t;
  };
  const estimarEstado = ({ uf, maxzoom }) => {
    const b = s.cat.estados[uf].bbox;
    const area = (b[2] - b[0]) * (b[3] - b[1]);
    return Math.round(area * ({ 10: 2.5e6, 12: 18e6, 14: 160e6 }[maxzoom] || 18e6));
  };

  function desenhar() {
    passos.replaceChildren(
      ...PASSOS.map((nome, i) =>
        h('button', { class: `passo ${i === s.passo ? 'ativo' : i < s.passo ? 'feito' : ''}`, style: { cursor: 'pointer', font: 'inherit' }, onclick: () => ir(i) },
          h('i', {}, i < s.passo ? '✓' : i + 1), nome))
    );
    corpo.replaceChildren([passoComputador, passoIA, passoConteudo, passoResumo][s.passo]());
    desenharRodape();
  }

  function ir(i) {
    s.passo = Math.max(0, Math.min(PASSOS.length - 1, i));
    desenhar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function desenharRodape() {
    const total = totalBytes();
    const liberado = liberadoBytes();
    // O que é removido sai antes dos downloads começarem, então o espaço liberado conta.
    const livre = s.hw.disco.livre + liberado;
    const soRemove = !total && liberado;
    rodape.replaceChildren(
      h('div', { class: 'conteudo' },
        h('div', {},
          h('b', {}, liberado ? `${bytes(total)} para baixar · ${bytes(liberado)} liberados` : `${bytes(total)} para baixar`),
          h('div', { class: 'suave', style: { fontSize: '13px' } },
            total > livre ? 'Não cabe no espaço livre!' : `Sobram ${bytes(livre - total)} livres no disco`)),
        h('div', { class: 'linha' },
          s.passo > 0 ? h('button', { class: 'botao', onclick: () => ir(s.passo - 1) }, 'Voltar') : null,
          s.passo < PASSOS.length - 1
            ? h('button', { class: 'botao primario', onclick: () => ir(s.passo + 1) }, 'Continuar', icone('seta', 16))
            : h('button', { class: 'botao primario grande', onclick: instalar, disabled: total > livre || (s.gerenciar && !temMudanca()) },
                icone(soRemove ? 'lixo' : 'baixar', 18), s.gerenciar ? 'Aplicar mudanças' : 'Instalar agora')))
    );
  }

  // ---------- passo 1 ----------
  function passoComputador() {
    const hw = s.hw;
    const gpu = hw.gpus[0];
    return h('div', { class: 'pilha' },
      h('div', { class: 'cartao' },
        h('div', { class: 'especs' },
          espec('chip', 'Processador', hw.cpu || 'Desconhecido', `${hw.nucleos} núcleos · ${hw.threads} threads`),
          espec('memoria', 'Memória RAM', `${(hw.ramTotal / GB).toFixed(1)} GB`,
            hw.ramInstalada && Math.abs(hw.ramInstalada - hw.ramTotal) > 0.6 * GB ? `${(hw.ramInstalada / GB).toFixed(0)} GB instalados` : `${(hw.ramLivre / GB).toFixed(1)} GB livres agora`),
          espec('gpu', 'Placa de vídeo', gpu ? gpu.nome : 'Nenhuma detectada',
            gpu ? (gpu.vram ? `${(gpu.vram / GB).toFixed(1)} GB de memória de vídeo` : 'Memória de vídeo desconhecida') : ''),
          espec('disco', 'Espaço livre', bytes(hw.disco.livre), `de ${bytes(hw.disco.total)} no disco dos dados`))),
      hw.aceleracao.tipo === 'cpu'
        ? aviso('info', h('b', {}, 'A IA vai rodar no processador. '),
            'Sua placa de vídeo não tem aceleração compatível com o Ollama, então escolhemos modelos menores que respondem em velocidade aceitável. O conteúdo offline (livros, Wikipédia, mapas) funciona normalmente.')
        : aviso('ok', h('b', {}, 'Aceleração encontrada: '), `${hw.aceleracao.descricao}. `,
            hw.aceleracao.incerto ? 'Algumas placas AMD funcionam com o Ollama e outras não; se a IA ficar lenta, escolha um modelo menor.' : 'Os modelos de IA vão rodar bem mais rápido.'),
      h('div', { class: 'cartao plano' },
        h('div', { class: 'linha entre' },
          h('div', {}, h('b', {}, 'Onde os dados ficam'), h('div', { class: 'mono suave', style: { fontSize: '13px' } }, hw.pastaDados)),
          h('small', {}, 'Para levar tudo para outro disco ou pendrive depois, use "Copiar para outro disco" no menu.'))),
      hw.aviso ? aviso('', hw.aviso) : null,
      s.rec.aviso ? aviso('erro', s.rec.aviso) : null,
      s.gerenciar ? cartaoUpgrade() : null
    );
  }

  // Quem já tem tudo: mostra o que tem e permite "Upgrade" depois de liberar espaço ou trocar peças.
  function cartaoUpgrade() {
    const tamInstalado = [...instalados].reduce((a, id) => a + (item(id)?.tamanho || 0), 0);
    const ias = s.cat.modelos.chat.filter((m) => modelosInstalados.has(m.tag));
    const sug = s.rec.pacotes.find((p) => p.id === s.rec.pacoteSugerido);
    const faltam = sug ? sug.itens.filter((id) => !instalados.has(id) && item(id)) : [];
    const tamFaltam = faltam.reduce((a, id) => a + (item(id).tamanho || 0), 0);
    const iaRec = s.rec.modelo.chat;
    const temIaRec = modelosInstalados.has(iaRec.tag);
    const botaoDetectar = h('button', { class: 'botao', onclick: async (e) => {
      e.currentTarget.disabled = true;
      try {
        const r = await api.get('/api/hardware?forcar=1');
        s.hw = r.hardware;
        s.rec = r.recomendacao;
        toast('Computador analisado de novo.');
      } catch (er) {
        toast(er.message, 'erro');
      }
      desenhar();
    } }, icone('chip', 16), 'Analisar o computador de novo');
    return h('div', { class: 'cartao pilha' },
      h('div', {}, h('h2', { style: { margin: 0 } }, 'Upgrade: aproveitar mais espaço ou um computador melhor'),
        h('p', { class: 'suave' }, 'Liberou espaço no disco, colocou mais memória ou trocou a placa de vídeo? Analise de novo para ver o que agora cabe e funciona bem.')),
      h('div', { class: 'grade c3' },
        h('div', {}, h('small', { class: 'suave' }, 'Você já tem'), h('div', {}, h('b', {}, `${instalados.size} conteúdos`), ` · ${bytes(tamInstalado)}`)),
        h('div', {}, h('small', { class: 'suave' }, 'IAs baixadas'), h('div', {}, h('b', {}, String(ias.length)))),
        h('div', {}, h('small', { class: 'suave' }, 'Pacote sugerido agora'), h('div', {}, h('b', {}, sug?.nome || '—')))),
      faltam.length
        ? aviso('info', h('b', {}, `Do pacote ${sug.nome} faltam ${faltam.length} itens (${bytes(tamFaltam)}). `),
            h('button', { class: 'botao pequeno primario', style: { marginLeft: '6px' }, onclick: () => { escolherPacote(sug.id); ir(2); } }, 'Marcar o que falta'))
        : aviso('ok', 'Você já tem tudo do pacote sugerido para este computador.'),
      !temIaRec
        ? aviso('info', h('b', {}, 'Há uma IA recomendada para este computador que você ainda não tem. '),
            h('button', { class: 'botao pequeno', style: { marginLeft: '6px' }, onclick: () => { s.modelos.add(iaRec.tag); s.modelosRemover.delete(iaRec.tag); s.semIA = false; ir(1); } }, 'Ver as IAs'))
        : null,
      h('div', { class: 'linha' }, botaoDetectar,
        h('small', { class: 'suave' }, 'Para tirar algo e liberar espaço, desmarque nos passos "Inteligência artificial" e "Conteúdo".')));
  }

  // ---------- passo 2 ----------
  // Linguagem simples: Rápido / Moderado / Mais inteligente / Pensamento profundo. Pode marcar várias IAs;
  // uma delas é a "padrão" do chat (o usuário troca no próprio chat quando quiser).
  function classificar(m) {
    const rec = s.rec.modelo.chat;
    const memMax = Math.max(s.hw.aceleracao.tipo !== 'cpu' ? (s.hw.aceleracao.memoria || 0) : 0, s.hw.ramTotal * 0.85) / GB;
    const p = parseFloat(String(m.tag.split(':')[1] || '').replace(',', '.')) || 0;
    const intel = p < 1 ? 1 : p < 2 ? 2 : p < 3.5 ? 3 : p < 10 ? 4 : 5;
    if (m.memoria > memMax) return { grupo: 'naocabe', intel, vel: 0 };
    const vel = m.memoria <= rec.memoria * 0.5 ? 5 : m.memoria < rec.memoria ? 4 : m.memoria === rec.memoria ? 3 : m.memoria <= s.rec.modelo.memoriaGB ? 2 : 1;
    if (m.tag === rec.tag) return { grupo: 'moderado', intel, vel: 3 };
    if (m.soRaciocinio || (m.raciocinio && m.memoria > rec.memoria)) return { grupo: 'profundo', intel, vel: Math.min(vel, 2) };
    if (m.memoria < rec.memoria) return { grupo: 'rapido', intel, vel };
    return { grupo: 'inteligente', intel, vel };
  }
  const GRUPOS_IA = [
    ['rapido', 'Rápido', 'Responde quase na hora. Bom para perguntas simples, mas erra mais.'],
    ['moderado', 'Moderado · recomendado', 'O melhor equilíbrio entre rapidez e qualidade para este computador.'],
    ['inteligente', 'Mais inteligente (lento)', 'Respostas mais completas e corretas, mas demora mais. Vale para quando você pode esperar.'],
    ['profundo', 'Pensamento profundo (lento)', 'Pensa passo a passo antes de responder. Bom para contas, diagnósticos e planejamento.'],
    ['naocabe', 'Não cabem neste computador', 'Precisam de mais memória do que este computador tem.'],
  ];
  const bolinhas = (n) => '●'.repeat(n) + '○'.repeat(5 - n);
  const motor = (m) => m.nome.replace(/\s*—.*$/, '');

  function passoIA() {
    const online = estado.servidor?.ollama?.online;
    const plataforma = estado.servidor?.plataforma;
    const alternarIA = (m) => {
      if (modelosInstalados.has(m.tag)) {
        if (!s.gerenciar) return;
        // Já baixada: desmarcar = apagar do computador (só ao aplicar as mudanças).
        if (s.modelosRemover.has(m.tag)) s.modelosRemover.delete(m.tag);
        else {
          s.modelosRemover.add(m.tag);
          if (s.modeloChat === m.tag) s.modeloChat = iasInstaladas()[0] || [...s.modelos][0] || null;
        }
        desenhar();
        return;
      }
      if (s.modelos.has(m.tag)) {
        s.modelos.delete(m.tag);
        if (s.modeloChat === m.tag) s.modeloChat = [...s.modelos][0] || iasInstaladas()[0] || null;
      } else {
        s.modelos.add(m.tag);
        if (!s.modeloChat) s.modeloChat = m.tag;
        s.semIA = false;
      }
      desenhar();
    };
    const cartaoIA = (m) => {
      const c = classificar(m);
      const ja = modelosInstalados.has(m.tag);
      const sai = ja && s.modelosRemover.has(m.tag);
      const marcado = (ja && !sai) || s.modelos.has(m.tag);
      const padrao = s.modeloChat === m.tag;
      // Uma IA já baixada sempre pode ser removida, mesmo que hoje "não caiba".
      const pode = c.grupo !== 'naocabe' || ja;
      return h('div', {
        class: `opcao opcao-ia ${marcado ? 'selecionada' : ''} ${pode ? '' : 'desabilitada'}`,
        role: 'checkbox', 'aria-checked': String(marcado), tabindex: 0,
        onclick: () => pode && alternarIA(m),
        onkeydown: (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (pode) alternarIA(m); } },
      },
        h('span', { class: `etiqueta selo ${sai ? 'perigo' : ja ? 'musgo' : marcado ? 'brasa' : ''}` },
          sai ? 'Vai remover' : ja ? 'Já baixada' : marcado ? 'Vai baixar' : pode ? 'Marcar' : 'Não cabe'),
        h('div', { class: 'ia-medidas' },
          h('div', {}, h('small', {}, 'Inteligência'), h('b', { class: 'bolinhas' }, bolinhas(c.intel))),
          c.vel ? h('div', {}, h('small', {}, 'Velocidade'), h('b', { class: 'bolinhas' }, bolinhas(c.vel))) : null),
        h('small', {}, m.nota),
        pode && m.memoria > s.rec.modelo.memoriaGB ? h('small', { class: 'alerta-texto' }, 'Neste computador ela demora bastante e deixa o resto mais lento enquanto responde.') : null,
        h('div', { class: 'linha entre' },
          h('small', { class: 'suave' }, `${bytes(m.tamanho)} · motor: ${motor(m)}`),
          marcado ? (padrao
            ? h('span', { class: 'etiqueta musgo' }, icone('ok', 12), 'Padrão no chat')
            : h('button', { type: 'button', class: 'botao pequeno', onclick: (e) => { e.stopPropagation(); s.modeloChat = m.tag; desenhar(); } }, 'Usar como padrão')) : null));
    };
    const grupos = GRUPOS_IA.map(([id, nome, desc]) => {
      const lista = s.cat.modelos.chat.filter((m) => classificar(m).grupo === id);
      if (!lista.length) return null;
      const conteudo = [h('div', {}, h('h3', { style: { margin: 0 } }, nome), h('small', { class: 'suave' }, desc)), h('div', { class: 'grade c3' }, lista.map(cartaoIA))];
      return id === 'naocabe'
        ? h('details', { class: 'cartao plano' }, h('summary', {}, h('b', {}, `${nome} (${lista.length})`)), h('div', { class: 'pilha', style: { marginTop: '10px' } }, ...conteudo))
        : h('div', { class: 'pilha' }, ...conteudo);
    });

    return h('div', { class: 'pilha' },
      online
        ? aviso('ok', h('b', {}, 'O motor de IA está ligado. '), 'Ele roda a IA no seu computador, sem internet.')
        : h('div', { class: 'cartao pilha' },
            h('div', { class: 'linha' }, h('span', { class: 'icone-bolha alerta' }, icone('cerebro')), h('div', {}, h('h3', { style: { margin: 0 } }, 'Falta o motor de IA (Ollama)'), h('small', {}, 'Programa gratuito que roda a IA no seu computador.'))),
            plataforma === 'linux'
              ? [h('p', {}, 'No Linux, cole este comando no terminal (pede sua senha):'), h('pre', { class: 'comando' }, 'curl -fsSL https://ollama.com/install.sh | sh')]
              : h('div', { class: 'linha' },
                  h('button', { class: 'botao primario', onclick: async (e) => {
                    e.target.disabled = true;
                    await api.post('/api/ollama/instalar').catch((er) => toast(er.message, 'erro'));
                    toast('Instalando o motor de IA… acompanhe em Transferências.');
                  } }, icone('baixar', 16), 'Instalar automaticamente'),
                  h('a', { class: 'botao', href: 'https://ollama.com/download', target: '_blank', rel: 'noopener' }, 'Baixar manualmente')),
            h('small', {}, 'Pode continuar: as IAs são baixadas assim que o motor estiver pronto.')),

      h('div', { class: 'cartao pilha' },
        h('div', {}, h('h2', { style: { margin: 0 } }, 'Quais IAs você quer ter?'),
          h('p', { class: 'suave' }, 'Marque uma ou mais. Uma IA mais inteligente erra menos, mas demora mais para responder. No chat, você troca entre elas quando quiser.'),
          s.gerenciar ? h('p', { class: 'suave' }, 'Para apagar uma IA que você já tem e liberar espaço, clique nela até aparecer "Vai remover". Nada é apagado antes de você confirmar no último passo.') : null),
        s.gerenciar && modelosInstalados.size && !iasInstaladas().length && !iasNovas().length && !s.semIA
          ? aviso('erro', 'Assim você fica sem IA no chat. A biblioteca, as enciclopédias e os mapas continuam funcionando.')
          : null,
        ...grupos.filter(Boolean),
        h('label', { class: 'alternar' },
          h('input', { type: 'checkbox', checked: s.semIA, onchange: (e) => { s.semIA = e.target.checked; desenhar(); } }),
          'Não quero assistente de IA agora (só biblioteca, enciclopédias e mapas)')),
      !s.semIA ? h('small', { class: 'suave' }, `Junto vai uma pequena IA de busca (${bytes(tamanhoModelo(s.modeloEmbed, s.cat.modelos.embed))}) que encontra trechos pelo sentido, e não só pelas palavras exatas.`) : null
    );
  }

  // ---------- passo 3 ----------
  function passoConteudo() {
    const livreUtil = s.rec.disco.orcamento;
    const pacotes = h('div', { class: 'grade c3' },
      s.rec.pacotes.map((p) => {
        // Gerenciando: conta só o que falta baixar deste pacote.
        const faltam = p.itens.filter((id) => !instalados.has(id) && item(id));
        const tamFaltam = faltam.reduce((a, id) => a + (item(id).tamanho || 0), 0);
        const cabe = s.gerenciar ? tamFaltam <= s.hw.disco.livre + liberadoBytes() : p.cabe;
        const completo = s.gerenciar && !faltam.length;
        return h('button', { class: `opcao ${s.pacote === p.id ? 'selecionada' : ''} ${cabe ? '' : 'desabilitada'}`, onclick: () => { escolherPacote(p.id); desenhar(); } },
          completo ? h('span', { class: 'etiqueta musgo selo' }, 'Você já tem')
            : p.id === s.rec.pacoteSugerido ? h('span', { class: 'etiqueta musgo selo' }, 'Recomendado') : !cabe ? h('span', { class: 'etiqueta perigo selo' }, 'Não cabe') : null,
          h('h3', {}, p.nome),
          h('div', { class: 'tamanho' }, s.gerenciar ? (completo ? 'Completo' : `+${bytes(tamFaltam)}`) : bytes(p.bytes)),
          h('small', {}, p.descricao),
          h('small', { class: 'suave' }, s.gerenciar ? (completo ? `${p.itens.length} itens, todos instalados` : `faltam ${faltam.length} de ${p.itens.length} itens`) : `${p.itens.length} itens`));
      }),
    );

    const porCategoria = s.cat.categorias
      .filter((c) => c.id !== 'meus')
      .map((c) => ({ c, itens: s.cat.itens.filter((i) => i.categoria === c.id) }))
      .filter((g) => g.itens.length);

    const alternar = (it, marcado) => {
      if (marcado && it.grupo) for (const o of s.cat.itens) if (o.grupo === it.grupo && o.id !== it.id) s.selecionados.delete(o.id);
      marcado ? s.selecionados.add(it.id) : s.selecionados.delete(it.id);
      s.pacote = 'personalizado';
      desenhar();
    };

    const niveis = s.cat.niveis || [];
    const nomeNivel = (id) => niveis.find((n) => n.id === id)?.nome || id;
    // Outro idioma: o leitor e a Biblioteca têm o botão "Traduzir" (IA do computador).
    const NOME_IDIOMA = { en: 'inglês', es: 'espanhol', fr: 'francês' };
    const seloIdioma = (it) => it.idioma && it.idioma !== 'pt'
      ? h('span', { class: 'etiqueta ceu', style: { marginLeft: '8px' }, title: 'A IA do computador traduz para o português no leitor (botão Traduzir).' }, `Em ${NOME_IDIOMA[it.idioma] || it.idioma} · traduzível`)
      : null;
    const seloNivel = (id) => id ? h('span', { class: `etiqueta nivel-${id}`, style: { marginLeft: '8px' } }, nomeNivel(id)) : null;
    // Atalhos por nível só acrescentam/tiram o que é novo; uma coleção (gerenciando) pode ser removida inteira.
    const marcarVarios = (lista, marcado, incluiInstalados = false) => {
      for (const it of lista) if (!instalados.has(it.id) || (incluiInstalados && s.gerenciar)) marcado ? s.selecionados.add(it.id) : s.selecionados.delete(it.id);
      s.pacote = 'personalizado';
      desenhar();
    };

    // Etiqueta de tamanho: instalado, vai remover (gerenciar) ou o tamanho para baixar.
    const etiquetaTam = (lista, tamanhoNovo) => {
      const ja = lista.every((p) => instalados.has(p.id));
      const sai = lista.filter((p) => instalados.has(p.id) && !s.selecionados.has(p.id));
      if (sai.length) return h('span', { class: 'etiqueta perigo' }, `Vai remover · −${bytes(sai.reduce((a, p) => a + (p.tamanho || 0), 0))}`);
      if (ja) return h('span', { class: 'etiqueta musgo' }, 'Instalado');
      return tamanhoNovo;
    };
    const linhaItem = (it) => {
      const ja = instalados.has(it.id);
      return h('label', { class: 'item-sel' },
        h('input', { type: 'checkbox', checked: ja && !s.gerenciar ? true : s.selecionados.has(it.id), disabled: ja && !s.gerenciar, onchange: (e) => alternar(it, e.target.checked) }),
        h('div', {},
          h('div', { class: 'nome' }, it.titulo, it.grupo ? h('span', { class: 'etiqueta', style: { marginLeft: '8px' } }, 'escolha um') : null, seloNivel(it.nivel), seloIdioma(it),
            it.novo ? h('span', { class: 'etiqueta brasa', style: { marginLeft: '8px' }, title: 'Fonte adicionada ao catálogo recentemente' }, 'Novo') : null,
            it.descontinuado ? h('span', { class: 'etiqueta', style: { marginLeft: '8px' }, title: 'A fonte ou o link deixou de funcionar. Você continua com o arquivo.' }, 'Saiu do catálogo') : null),
          h('div', { class: 'desc' }, `${it.fonte} — ${it.descricao}`)),
        h('div', { class: 'tam' }, etiquetaTam([it], `${it.estimado ? '~' : ''}${bytes(it.tamanho)}`)));
    };
    // Coleção em várias partes (ex.: GREF): uma linha só, marca todas as partes juntas.
    const linhaColecao = (partes) => {
      const it = partes[0];
      const todasJa = partes.every((p) => instalados.has(p.id));
      const marcadas = partes.filter((p) => (instalados.has(p.id) && !s.gerenciar) || s.selecionados.has(p.id)).length;
      const caixa = h('input', { type: 'checkbox', checked: marcadas === partes.length, disabled: todasJa && !s.gerenciar, onchange: (e) => marcarVarios(partes, e.target.checked, true) });
      caixa.indeterminate = marcadas > 0 && marcadas < partes.length;
      const tamanho = partes.filter((p) => !instalados.has(p.id)).reduce((a, p) => a + (p.tamanho || 0), 0);
      return h('label', { class: 'item-sel' }, caixa,
        h('div', {},
          h('div', { class: 'nome' }, it.colecaoTitulo, h('span', { class: 'etiqueta', style: { marginLeft: '8px' } }, `${partes.length} partes`), seloNivel(it.nivel)),
          h('div', { class: 'desc' }, `${it.fonte} — ${it.descricao}`)),
        h('div', { class: 'tam' }, etiquetaTam(partes, bytes(tamanho))));
    };
    const linhas = (itens) => {
      const vistas = new Set();
      return itens.flatMap((it) => {
        if (!it.colecao) return [linhaItem(it)];
        if (vistas.has(it.colecao)) return [];
        vistas.add(it.colecao);
        return [linhaColecao(itens.filter((o) => o.colecao === it.colecao))];
      });
    };

    const grupos = porCategoria.map(({ c, itens }) => {
      const marcados = itens.filter((i) => s.selecionados.has(i.id)).length;
      const tamanho = itens.filter((i) => s.selecionados.has(i.id) && !instalados.has(i.id)).reduce((a, i) => a + (i.tamanho || 0), 0);
      // Atalhos por nível (Essencial / Básico / Avançado) quando a categoria tem níveis.
      const comNivel = niveis.filter((n) => itens.some((i) => i.nivel === n.id));
      const atalhos = comNivel.length
        ? h('div', { class: 'linha niveis-atalho' },
            h('span', { class: 'suave' }, 'Marcar por nível:'),
            comNivel.map((n) => {
              const doNivel = itens.filter((i) => i.nivel === n.id);
              const todos = doNivel.every((i) => instalados.has(i.id) || s.selecionados.has(i.id));
              const tam = doNivel.filter((i) => !instalados.has(i.id)).reduce((a, i) => a + (i.tamanho || 0), 0);
              return h('button', { type: 'button', class: `botao pequeno ${todos ? 'primario' : ''}`, title: n.descricao, onclick: () => marcarVarios(doNivel, !todos) },
                todos ? icone('ok', 14) : null, `${n.nome} · ${bytes(tam)}`);
            }))
        : null;
      // Agrupa por matéria (Educação) quando houver.
      const ordem = s.cat.ordemMaterias?.[c.id] || [];
      const posicao = (m) => (ordem.includes(m) ? ordem.indexOf(m) : ordem.length);
      const materias = [...new Set(itens.map((i) => i.materia).filter(Boolean))].sort((x, y) => posicao(x) - posicao(y));
      const corpo = materias.length
        ? [...materias.map((m) => h('div', { class: 'materia' }, h('div', { class: 'sobretitulo' }, m), linhas(itens.filter((i) => i.materia === m)))),
           ...(itens.some((i) => !i.materia) ? [h('div', { class: 'materia' }, h('div', { class: 'sobretitulo' }, 'Outros'), linhas(itens.filter((i) => !i.materia)))] : [])]
        : linhas(itens);
      return h('details', { class: 'grupo', open: s.abertos.has(c.id), ontoggle: (e) => (e.currentTarget.open ? s.abertos.add(c.id) : s.abertos.delete(c.id)) },
        h('summary', {},
          h('span', { class: 'icone-bolha', style: { background: `${c.cor}22`, color: c.cor } }, icone(c.icone, 18)),
          h('div', {}, c.nome, h('div', { class: 'suave', style: { fontSize: '12px', fontWeight: 400 } }, `${marcados} de ${itens.length} selecionados · ${bytes(tamanho)}`)),
          h('span', { class: 'seta' }, icone('seta', 18))),
        h('div', { class: 'lista-itens' }, atalhos, corpo));
    });

    // Mapas por estado
    const ufSel = h('select', {}, Object.entries(s.cat.estados).map(([uf, e]) => h('option', { value: uf }, `${e.nome} (${uf})`)));
    const zoomSel = h('select', {},
      h('option', { value: 10 }, 'Cidades e estradas'),
      h('option', { value: 12, selected: true }, 'Bairros e ruas principais'),
      h('option', { value: 14 }, 'Todas as ruas (grande)'));
    const mapasEstado = h('div', { class: 'cartao pilha' },
      h('div', {}, h('h3', {}, 'Mapa detalhado do seu estado'), h('small', {}, 'Além do mapa do Brasil, baixe só a sua região com mais detalhes.')),
      h('div', { class: 'linha' },
        h('div', { style: { flex: '1 1 220px' } }, ufSel),
        h('div', { style: { flex: '1 1 220px' } }, zoomSel),
        h('button', { class: 'botao', onclick: () => {
          const m = { uf: ufSel.value, maxzoom: Number(zoomSel.value) };
          if (!s.mapasEstados.some((x) => x.uf === m.uf && x.maxzoom === m.maxzoom)) s.mapasEstados.push(m);
          desenhar();
        } }, 'Adicionar')),
      s.mapasEstados.length
        ? h('div', { class: 'linha' }, s.mapasEstados.map((m, i) =>
            h('span', { class: 'etiqueta brasa' }, `${s.cat.estados[m.uf].nome} · ~${bytes(estimarEstado(m))}`,
              h('button', { class: 'botao-icone fantasma', style: { width: '20px', height: '20px', border: 0, background: 'none', cursor: 'pointer', color: 'inherit' }, 'aria-label': 'Remover', onclick: () => { s.mapasEstados.splice(i, 1); desenhar(); } }, icone('x', 14)))))
        : null);

    return h('div', { class: 'pilha' },
      h('div', {}, h('h2', {}, s.gerenciar ? 'Acrescentar um pacote (upgrade)' : 'Escolha um pacote'),
        h('p', { class: 'suave' }, s.gerenciar
          ? `Escolher um pacote só acrescenta o que falta: nada do que você já tem é apagado. Espaço livre agora: ${bytes(s.hw.disco.livre)}.`
          : `Espaço que pode ser usado com segurança: ${bytes(livreUtil)} (deixamos uma folga para o sistema).`)),
      pacotes,
      h('div', { class: 'espaco' }),
      h('div', { class: 'linha entre' },
        h('div', {}, h('h2', {}, s.gerenciar ? 'O que você tem e o que pode acrescentar' : 'Personalizar'),
          h('p', { class: 'suave' }, s.gerenciar
            ? 'Marcado = fica (ou será baixado). Desmarque o que já está instalado para apagar e liberar espaço. A Wikipédia e o mapa do Brasil têm várias versões: escolha uma.'
            : 'Marque ou desmarque o que quiser. A Wikipédia e o mapa do Brasil têm várias versões: escolha uma.')),
        h('div', { class: 'linha' },
          s.gerenciar
            ? h('button', { class: 'botao pequeno', onclick: () => { s.selecionados = new Set(instalados); s.pacote = 'personalizado'; desenhar(); } }, 'Desfazer mudanças')
            : h('button', { class: 'botao pequeno', onclick: () => { s.selecionados = new Set(); s.pacote = 'personalizado'; desenhar(); } }, 'Desmarcar tudo'))),
      grupos,
      mapasEstado
    );
  }

  // ---------- passo 4 ----------
  function passoResumo() {
    const ids = novos();
    const total = totalBytes();
    const livre = s.hw.disco.livre;
    const usado = s.hw.disco.total - livre;
    const pct = (b) => `${Math.min(100, (b / s.hw.disco.total) * 100).toFixed(2)}%`;
    const contar = (tipo) => ids.filter((id) => item(id).tipo === tipo).length;
    const tempoEstimado = total / (3 * 1e6); // ~3 MB/s de média

    return h('div', { class: 'pilha' },
      h('div', { class: 'grade c4' },
        resumo('livro', 'Documentos', contar('pdf')),
        resumo('globo', 'Enciclopédias e vídeos', contar('zim')),
        resumo('mapa', 'Mapas', contar('mapa') + s.mapasEstados.length),
        resumo('cerebro', 'IAs novas', s.semIA ? 'Nenhuma' : iasNovas().length)),
      h('div', { class: 'cartao medidor-disco' },
        h('div', { class: 'linha entre' }, h('b', {}, 'Uso do disco'), h('span', { class: 'suave' }, `${bytes(total)} novos · ${bytes(Math.max(0, livre - total))} continuarão livres`)),
        h('div', { class: 'barra' }, h('i', { class: 'usado', style: { width: pct(usado) } }), h('i', { class: 'novo', style: { width: pct(total) } })),
        h('div', { class: 'linha', style: { fontSize: '12px' } },
          h('span', { class: 'linha' }, h('i', { class: 'ponto', style: { background: 'var(--linha-forte)' } }), 'Já usado'),
          h('span', { class: 'linha' }, h('i', { class: 'ponto', style: { background: 'var(--brasa)' } }), 'Protocolo Zero'))),
      total > 0 && aviso('info',
        h('b', {}, `Tempo estimado: ${tempoEstimado < 3600 ? `${Math.max(1, Math.round(tempoEstimado / 60))} minutos` : `${(tempoEstimado / 3600).toFixed(1)} horas`} `),
        '(depende da sua internet). Você pode usar o Protocolo Zero enquanto baixa, e se a conexão cair, os downloads continuam de onde pararam.'),
      ids.length || s.mapasEstados.length || (!s.semIA && iasNovas().length)
        ? h('div', { class: 'cartao plano' },
            h('b', {}, 'Será baixado:'),
            h('ul', { style: { margin: '8px 0 0', paddingLeft: '20px', columns: '2 260px' } },
              ids.map((id) => h('li', {}, item(id).titulo, h('span', { class: 'suave' }, ` · ${bytes(item(id).tamanho)}`))),
              s.mapasEstados.map((m) => h('li', {}, `Mapa de ${s.cat.estados[m.uf].nome}`)),
              s.semIA ? null : iasNovas().map((tag) => { const m = s.cat.modelos.chat.find((x) => x.tag === tag); const g = GRUPOS_IA.find((x) => x[0] === classificar(m).grupo); return h('li', {}, `IA ${g[1].replace(' · recomendado', '')}${tag === s.modeloChat ? ' (padrão no chat)' : ''}`, h('span', { class: 'suave' }, ` · ${bytes(m.tamanho)}`)); }),
              !s.semIA && !modelosInstalados.has(s.modeloEmbed) ? h('li', {}, 'IA de busca pelo sentido') : null))
        : aviso('', 'Nada novo selecionado.'),
      aRemover().length || iasRemover().length
        ? h('div', { class: 'cartao plano pilha' },
            h('b', {}, `Será apagado do computador (libera ${bytes(liberadoBytes())}):`),
            h('ul', { style: { margin: '0', paddingLeft: '20px', columns: '2 260px' } },
              aRemover().map((id) => h('li', {}, item(id).titulo, h('span', { class: 'suave' }, ` · ${bytes(item(id).tamanho)}`))),
              iasRemover().map((tag) => { const m = s.cat.modelos.chat.find((x) => x.tag === tag); const g = GRUPOS_IA.find((x) => x[0] === classificar(m).grupo); return h('li', {}, `IA ${g[1].replace(' · recomendado', '').replace(/^Não cabem.*/, '')} (motor: ${motor(m)})`, h('span', { class: 'suave' }, ` · ${bytes(m.tamanho)}`)); })),
            aviso('erro', h('b', {}, 'Atenção: '), 'apagar não tem volta. Para ter de novo, será preciso baixar com internet. Os seus próprios arquivos e anotações (estoque, saúde, conversas) não são apagados.'))
        : null
    );
  }

  async function instalar(e) {
    const botao = e.currentTarget;
    const sai = aRemover();
    const saiIA = iasRemover();
    if (sai.length || saiIA.length) {
      const partes = [sai.length ? `${sai.length} conteúdo(s)` : '', saiIA.length ? `${saiIA.length} IA(s)` : ''].filter(Boolean).join(' e ');
      const ok = await confirmar(`Apagar ${partes} do computador (${bytes(liberadoBytes())})? Isso não pode ser desfeito: para ter de novo, será preciso baixar com internet.`, { botao: 'Apagar e continuar', perigo: true });
      if (!ok) return;
    }
    botao.disabled = true;
    try {
      // Remove primeiro, para o espaço liberado já servir aos downloads.
      if (sai.length || saiIA.length) {
        const rr = await api.post('/api/remover', { itens: sai, modelos: saiIA });
        if (rr.falhas?.length) toast(`Não foi possível apagar ${rr.falhas.length} item(ns): ${rr.falhas[0].erro}`, 'erro');
        if (saiIA.includes(s.modeloChat)) s.modeloChat = rr.modeloChat || null;
      }
      if (s.gerenciar && !novos().length && !s.mapasEstados.length && (s.semIA || !iasNovas().length)) {
        toast(`Pronto: ${bytes(liberadoBytes())} liberados.`);
        navegar('inicio');
        return;
      }
      const r = await api.post('/api/instalar', {
        itens: novos(),
        modeloChat: s.semIA ? null : s.modeloChat,
        modelosChat: s.semIA ? [] : iasNovas(),
        modeloEmbed: s.semIA ? null : s.modeloEmbed,
        instalarOllama: !s.semIA && !estado.servidor?.ollama?.online && estado.servidor?.plataforma !== 'linux',
      });
      for (const m of s.mapasEstados) {
        const est = s.cat.estados[m.uf];
        await api.post('/api/mapas/extrair', { titulo: `Mapa de ${est.nome}`, bbox: est.bbox, maxzoom: m.maxzoom });
      }
      await api.post('/api/config', { pacote: s.pacote });
      if (r.falhas?.length) toast(`${r.falhas.length} item(ns) não puderam ser agendados: ${r.falhas[0].erro}`, 'erro');
      // "Atualizar" acompanha os downloads (guardados compactados) e, no fim, roda o
      // "Iniciar Protocolo Zero", que descompacta e deixa tudo pronto.
      await api.post('/api/atualizar').catch(() => {});
      toast('Downloads iniciados! Tudo é guardado compactado e instalado sozinho no fim.');
      navegar('inicio');
    } catch (er) {
      toast(er.message, 'erro');
      botao.disabled = false;
    }
  }

  desenhar();
  if (args[1]) requestAnimationFrame(() => corpo.querySelector('details.grupo[open]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

function espec(ic, rotulo, valor, sub) {
  return h('div', { class: 'espec' }, h('span', { class: 'icone-bolha' }, icone(ic, 19)), h('div', {}, h('small', {}, rotulo), h('b', {}, valor), h('small', {}, sub)));
}
function resumo(ic, rotulo, valor) {
  return h('div', { class: 'cartao cartao-status' }, h('div', { class: 'titulo' }, h('span', { class: 'icone-bolha' }, icone(ic, 18)), rotulo), h('div', { class: 'indicador' }, h('b', { style: { fontSize: '22px', wordBreak: 'break-word' } }, String(valor))));
}
