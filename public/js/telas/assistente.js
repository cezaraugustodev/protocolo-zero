// Assistente: chat com a IA local (Ollama), várias conversas, anexos e consulta aos arquivos do Protocolo Zero.
// Funciona mesmo antes de "Iniciar Protocolo Zero": nesse caso responde só com o conhecimento do modelo.
import { h, icone, aviso, markdown, toast, confirmar, copiarTexto, bytes, modal } from '../ui.js';
import { api } from '../api.js';
import { navegar } from '../app.js';
import { cartaoSugestaoIA } from '../iniciador.js';
import { marcarConversoes } from '../conversoes.js';

const SUGESTOES = [
  { icone: 'gota', titulo: 'Água segura', texto: 'Como tornar a água segura para beber sem ferver?' },
  { icone: 'cruz', titulo: 'Primeiros socorros', texto: 'O que fazer em caso de picada de escorpião?' },
  { icone: 'folha', titulo: 'Ervas medicinais', texto: 'Quais plantas medicinais ajudam na diarreia e como preparar? Faça uma tabela.' },
  { icone: 'sol', titulo: 'Energia solar', texto: 'Como dimensionar painéis solares para uma geladeira de 150 W?' },
  { icone: 'broto', titulo: 'Captação de chuva', texto: 'Como construir uma cisterna para captar água da chuva?' },
  { icone: 'chave', titulo: 'Reparos', texto: 'Como testar uma bateria de 12 V com multímetro?' },
];

// Nível de confiança da fonte (server/confianca.js): oficial > científica > não oficial > não verificada.
const CONFIANCA = {
  oficial: { nome: 'Oficial', classe: 'selo-oficial', icone: 'ok', dica: 'Fonte oficial (governo ou órgão oficial): prevalece sobre as outras' },
  cientifica: { nome: 'Científica', classe: 'selo-cientifico', icone: 'livro', dica: 'Fonte científica (universidade, instituto federal ou editora científica)' },
  comunidade: { nome: 'Não oficial', classe: 'selo-comunidade', icone: 'info', dica: 'Fonte não oficial (Wikipédia, comunidade ou arquivo seu): só complementa' },
  'nao-verificada': { nome: 'Não verificada', classe: 'selo-nao-verificado', icone: 'alerta', dica: 'Internet Archive: conteúdo da internet sem revisão. Use com cautela' },
};
const seloConfianca = (nivel) => {
  const c = CONFIANCA[nivel];
  return c ? h('span', { class: c.classe }, icone(c.icone, 11), c.nome) : null;
};

const CHAVE = 'pz-conversas';
const CHAVE_ATUAL = 'pz-conversa-atual';
const CHAVE_PREF = 'pz-chat-pref';
const MAX_CONVERSAS = 60;
const TEXTO_ANEXO_MAX = 12000;
const EXT_TEXTO = /\.(txt|md|markdown|csv|tsv|json|xml|html?|log|ini|conf|ya?ml|js|ts|py|sh|bat|ps1|c|cpp|h|java|go|rs|sql)$/i;

// ---------- armazenamento ----------
const ler = (k, padrao) => {
  try {
    const v = localStorage.getItem(k);
    return v == null ? padrao : JSON.parse(v);
  } catch {
    return padrao;
  }
};
const gravar = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};
const novoId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function carregarConversas() {
  let lista = ler(CHAVE, null);
  if (!Array.isArray(lista)) {
    // migra a conversa única da versão anterior
    const antiga = ler('pz-conversa', []);
    lista = antiga.length ? [{ id: novoId(), titulo: tituloDe(antiga[0]?.texto), data: Date.now(), fixada: false, mensagens: antiga }] : [];
    try {
      localStorage.removeItem('pz-conversa');
    } catch {}
  }
  return lista;
}
function salvarConversas(lista) {
  const ordenada = ordenar(lista).slice(0, MAX_CONVERSAS);
  // limita o tamanho: guarda só as últimas 40 mensagens por conversa
  gravar(CHAVE, ordenada.map((c) => ({ ...c, mensagens: c.mensagens.slice(-40) })));
}
const ordenar = (lista) => [...lista].sort((a, b) => (b.fixada - a.fixada) || (b.data - a.data));
const tituloDe = (t = '') => (t.replace(/\s+/g, ' ').trim().slice(0, 48) || 'Nova conversa') + (t.length > 48 ? '…' : '');

function grupoData(ts) {
  const d = new Date(ts);
  const hoje = new Date();
  const dias = Math.floor((new Date(hoje.toDateString()) - new Date(d.toDateString())) / 864e5);
  if (dias <= 0) return 'Hoje';
  if (dias === 1) return 'Ontem';
  if (dias < 7) return 'Últimos 7 dias';
  if (dias < 30) return 'Últimos 30 dias';
  return 'Mais antigas';
}

function abrirFonte(f) {
  if (f.tipo === 'zim' && f.link) return navegar(`enciclopedia/${encodeURIComponent(`link${f.link}`)}`);
  if (f.arquivo) window.open(`/arquivos/${f.arquivo}${f.pagina ? `#page=${f.pagina}` : ''}`, '_blank', 'noopener');
}

async function lerAnexo(arquivo) {
  if (/\.pdf$/i.test(arquivo.name)) {
    const { textoDePdf } = await import('../indexador.js');
    const t = await textoDePdf(arquivo, TEXTO_ANEXO_MAX);
    if (!t.replace(/\[página \d+\]/g, '').trim()) throw new Error('Este PDF não tem texto (parece escaneado).');
    return t;
  }
  if (EXT_TEXTO.test(arquivo.name) || arquivo.type.startsWith('text/')) {
    if (arquivo.size > 5e6) throw new Error('Arquivo de texto grande demais (máx. 5 MB).');
    return (await arquivo.text()).slice(0, TEXTO_ANEXO_MAX);
  }
  throw new Error('Anexe PDF ou arquivos de texto (.txt, .md, .csv…). Para guardar vídeos e outros, use "Alimentar".');
}

// ---------- tela ----------
export async function render(raiz, { estado }) {
  raiz.classList.add('tela-ia');
  raiz.style.maxWidth = 'none';
  raiz.style.padding = '0';

  const s = estado.servidor;
  const modelosChat = (s?.ollama?.modelos || []).filter((m) => !/embed/i.test(m.nome));
  const semTag = (n) => n?.replace(/:latest$/, '');
  // Consultas começam desmarcadas até os dados estarem prontos (depois do Iniciar ficam ligadas, salvo escolha do usuário).
  const pref = ler(CHAVE_PREF, {});
  let modelo = pref.modelo || s?.config?.modeloChat;
  if (!modelosChat.some((m) => semTag(m.nome) === semTag(modelo))) modelo = modelosChat.find((m) => semTag(m.nome) === semTag(s?.config?.modeloChat))?.nome || modelosChat[0]?.nome || null;

  const dadosProntos = (s?.indice?.trechos || 0) > 0;
  const enciclopediasProntas = !!s?.kiwix?.ativo && (s?.kiwix?.livros?.length || 0) > 0;
  const pronto = (chave) => (chave === 'consultar' ? dadosProntos : enciclopediasProntas);
  const ativo = (chave) => pronto(chave) && (pref[chave] ?? true);
  let pensar = !!pref.pensar;
  let perfisInfo = null; // /api/ia/perfis
  const carregarPerfis = () => api.get('/api/ia/perfis').then((r) => { perfisInfo = r; preencherSeletor(); desenharTopo(); return r; }).catch(() => null);

  // Nomes simples para o usuário comum: Rápido / Moderado / Lento. O nome técnico do modelo
  // aparece só como detalhe ("motor: Qwen 2.5"), nunca "bilhões de parâmetros".
  const motor = (n) => {
    const base = semTag(n || '').split(':')[0];
    return base.replace(/^([a-z]+)([\d.]+)?.*$/i, (_, a, v) => `${a[0].toUpperCase()}${a.slice(1)}${v ? ` ${v}` : ''}`);
  };
  const perfilDe = (n) => [...(perfisInfo?.perfis || []), perfisInfo?.profundo, ...(perfisInfo?.outros || [])]
    .filter(Boolean).find((p) => p.instalado && semTag(p.nomeInstalado) === semTag(n));
  function classe(n) {
    if (!n) return 'IA';
    const p = perfilDe(n);
    const porId = { rapido: 'Rápido', recomendado: 'Moderado', detalhado: 'Lento', profundo: 'Lento' }[p?.id];
    if (porId) return porId;
    if (p?.tps) return p.tps >= 8 ? 'Rápido' : p.tps >= 3 ? 'Moderado' : 'Lento';
    const m = modelosChat.find((x) => semTag(x.nome) === semTag(n));
    const b = parseFloat(String(m?.parametros || n.split(':')[1] || '').replace(',', '.'));
    if (!b) return 'Moderado';
    return b <= 2 ? 'Rápido' : b <= 8 ? 'Moderado' : 'Lento';
  }
  const DESCRICAO = { Rápido: 'responde quase na hora', Moderado: 'equilíbrio entre rapidez e qualidade', Lento: 'mais caprichado, mas demora' };
  const rotuloModelo = (n) => (n ? `${classe(n)} · ${DESCRICAO[classe(n)]}` : 'sem IA instalada');

  let conversas = carregarConversas();
  let atual = conversas.find((c) => c.id === ler(CHAVE_ATUAL, null)) || null;
  let ctrl = null;
  let anexo = null; // { nome, tamanho, texto }
  let menuAberto = null;

  // ---------- elementos ----------
  const lateral = h('aside', { class: 'ia-lateral' });
  const listaConversas = h('nav', { class: 'ia-conversas', 'aria-label': 'Conversas' });
  const mensagens = h('div', { class: 'ia-mensagens', 'aria-live': 'polite' });
  const rolagem = h('div', { class: 'ia-rolagem' }, mensagens);
  const tituloTopo = h('div', { class: 'ia-topo-titulo' });
  const texto = h('textarea', { rows: 1, placeholder: 'Digite sua mensagem…', 'aria-label': 'Sua mensagem' });
  const seletorArquivo = h('input', { type: 'file', accept: '.pdf,.txt,.md,.csv,.json,.html,.htm,.log,text/*', style: { display: 'none' } });
  const previaAnexo = h('div', { class: 'ia-anexo-previa' });
  const botaoEnviar = h('button', { class: 'ia-enviar', type: 'submit', title: 'Enviar (Enter)', 'aria-label': 'Enviar' }, icone('aviao', 18));
  const botaoParar = h('button', { class: 'ia-enviar parar', type: 'button', title: 'Parar resposta', 'aria-label': 'Parar', style: { display: 'none' }, onclick: () => ctrl?.abort() }, icone('parar', 16));
  const modos = h('div', { class: 'ia-modos' });

  const seletorModelo = h('select', { class: 'ia-modelo', 'aria-label': 'Velocidade da IA', onchange: (e) => { modelo = e.target.value; pref.modelo = modelo; gravar(CHAVE_PREF, pref); desenharModos(); desenharTopo(); } });
  const ORDEM = { Rápido: 0, Moderado: 1, Lento: 2 };
  function preencherSeletor() {
    seletorModelo.replaceChildren(...(modelosChat.length
      ? [...modelosChat].sort((a, b) => ORDEM[classe(a.nome)] - ORDEM[classe(b.nome)])
        .map((m) => h('option', { value: m.nome, selected: m.nome === modelo, title: `Motor: ${motor(m.nome)}` }, `${classe(m.nome)} (${motor(m.nome)})`))
      : [h('option', { value: '' }, 'Nenhuma IA instalada')]));
  }
  preencherSeletor();

  lateral.append(
    h('button', { class: 'ia-nova', onclick: () => novaConversa() }, icone('mais', 16), 'Nova conversa'),
    h('label', { class: 'ia-rotulo' }, 'Velocidade da IA', seletorModelo),
    h('div', { class: 'ia-rotulo' }, 'Conversas'),
    listaConversas,
    h('div', { class: 'ia-lateral-rodape' },
      h('span', { class: `ponto ${s?.ollama?.online ? 'ok' : 'erro'}` }),
      s?.ollama?.online ? 'IA ligada · sem internet' : 'IA desligada'));

  const fundoLateral = h('div', { class: 'ia-lateral-fundo', onclick: () => raiz.classList.remove('lateral-aberta') });
  const compositor = h('form', { class: 'ia-compositor', onsubmit: (e) => { e.preventDefault(); enviar(); } },
    previaAnexo,
    texto,
    h('div', { class: 'ia-compositor-barra' },
      h('div', { class: 'linha', style: { gap: '6px', flexWrap: 'wrap' } },
        h('button', { type: 'button', class: 'ia-icone', title: 'Anexar arquivo (PDF ou texto)', 'aria-label': 'Anexar arquivo', onclick: () => seletorArquivo.click() }, icone('clipe', 18)),
        modos),
      h('div', { class: 'linha', style: { gap: '6px' } }, botaoParar, botaoEnviar)),
    seletorArquivo);

  // Sugestão de modelo melhor para este PC (some se já estiver usando o ideal).
  const sugestaoIA = h('div');
  if (s?.ollama?.online) carregarPerfis().then(() => desenharModos());
  if (s?.ollama?.online) cartaoSugestaoIA({ compacto: true }).then((c) => c && sugestaoIA.replaceChildren(c));

  let problema = null;
  if (!s?.ollama?.online) problema = aviso('erro', h('b', {}, 'O Ollama não está rodando. '), 'Abra o aplicativo Ollama ou instale em ', h('a', { href: '#/ajustes' }, 'Ajustes'), '.');
  else if (!modelosChat.length) problema = aviso('', h('b', {}, 'Nenhum modelo de IA instalado. '), 'Baixe um em ', h('a', { href: '#/ajustes' }, 'Ajustes'), ' (ex.: qwen2.5:3b).');

  raiz.append(
    h('div', { class: 'ia' },
      lateral, fundoLateral,
      h('section', { class: 'ia-principal' },
        h('header', { class: 'ia-topo' },
          h('button', { class: 'ia-icone', title: 'Mostrar/esconder conversas', 'aria-label': 'Conversas', onclick: () => raiz.classList.toggle('lateral-aberta') }, icone('menu', 18)),
          tituloTopo,
          h('button', { class: 'ia-icone', title: 'Nova conversa', 'aria-label': 'Nova conversa', onclick: () => novaConversa() }, icone('mais', 18))),
        rolagem,
        h('footer', { class: 'ia-rodape' },
          problema,
          sugestaoIA,
          compositor,
          h('small', { class: 'ia-nota' }, 'A IA pode cometer erros. Em saúde e segurança, prevalecem as fontes oficiais da ', h('a', { href: '#/biblioteca/saude' }, 'Biblioteca'), '. Em emergência, procure atendimento (SAMU 192).')))));

  // ---------- comportamento do compositor ----------
  const ajustarAltura = () => {
    texto.style.height = 'auto';
    texto.style.height = `${Math.min(220, texto.scrollHeight)}px`;
  };
  texto.addEventListener('input', ajustarAltura);
  texto.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      enviar();
    }
  });
  seletorArquivo.addEventListener('change', () => seletorArquivo.files[0] && anexar(seletorArquivo.files[0]));
  compositor.addEventListener('dragover', (e) => { e.preventDefault(); compositor.classList.add('arrastando'); });
  compositor.addEventListener('dragleave', () => compositor.classList.remove('arrastando'));
  compositor.addEventListener('drop', (e) => {
    e.preventDefault();
    compositor.classList.remove('arrastando');
    if (e.dataTransfer.files[0]) anexar(e.dataTransfer.files[0]);
  });
  const fecharMenus = (e) => {
    if (menuAberto && !menuAberto.contains(e.target) && !e.target.closest?.('.ia-modo-ia')) {
      menuAberto.remove();
      menuAberto = null;
    }
  };
  document.addEventListener('click', fecharMenus, true);

  async function anexar(arquivo) {
    previaAnexo.replaceChildren(h('span', { class: 'ia-anexo' }, icone('texto', 14), `Lendo ${arquivo.name}…`));
    try {
      const t = await lerAnexo(arquivo);
      anexo = { nome: arquivo.name, tamanho: arquivo.size, texto: t };
      desenharAnexo();
    } catch (e) {
      anexo = null;
      previaAnexo.replaceChildren();
      toast(e.message, 'erro');
    } finally {
      seletorArquivo.value = '';
    }
  }
  function desenharAnexo() {
    previaAnexo.replaceChildren(anexo
      ? h('span', { class: 'ia-anexo' }, icone(/\.pdf$/i.test(anexo.nome) ? 'livro' : 'texto', 14),
          h('b', {}, anexo.nome), h('small', {}, bytes(anexo.tamanho)),
          h('button', { type: 'button', 'aria-label': 'Remover anexo', onclick: () => { anexo = null; desenharAnexo(); } }, icone('x', 12)))
      : '');
  }

  function desenharModos() {
    const chip = (chave, rotulo, ic, dica) =>
      h('button', {
        type: 'button',
        class: `ia-modo ${ativo(chave) ? 'ativo' : ''} ${pronto(chave) ? '' : 'indisponivel'}`,
        title: pronto(chave) ? dica : `${dica} — ainda não preparado`,
        'aria-pressed': String(ativo(chave)),
        onclick: () => {
          if (!pronto(chave)) return avisoPreparo(chave);
          pref[chave] = !ativo(chave);
          gravar(CHAVE_PREF, pref);
          desenharModos();
        },
      }, icone(ic, 14), rotulo);
    modos.replaceChildren(...[
      botaoModoIA(),
      chip('consultar', 'Arquivos do Protocolo Zero', 'livro', 'Consultar os livros e PDFs baixados e os seus arquivos'),
      chip('enciclopedias', 'Enciclopédias', 'globo', 'Consultar Wikipédia e demais enciclopédias offline'),
      pensar ? h('button', { type: 'button', class: 'ia-modo ativo profundo', title: 'Desligar o pensamento profundo', onclick: () => alternarPensar(false) }, icone('cerebro', 14), 'Pensamento profundo', icone('x', 12)) : null,
    ].filter(Boolean));
  }

  // ---------- aviso: dados compactados / não preparados ----------
  async function avisoPreparo(chave) {
    const est = await api.get('/api/estado').catch(() => s);
    const itens = await api.get('/api/biblioteca').catch(() => []);
    const pac = est?.pacotes || {};
    const docs = chave === 'consultar';
    const tiposAlvo = docs ? ['pdf', 'epub', 'texto'] : ['zim'];
    const compactados = (pac.tipos || []).some((t) => tiposAlvo.includes(t));
    const temInstalado = itens.some((i) => tiposAlvo.includes(i.tipo));
    const livre = est?.disco?.livre;
    let fechar = null;
    const iniciarAgora = async () => {
      try {
        await api.post('/api/iniciar');
        fechar?.();
        toast('Iniciando o Protocolo Zero… acompanhe na tela Início.');
        navegar('inicio');
      } catch (e) {
        toast(e.message, 'erro');
      }
    };
    let titulo;
    let corpo;
    let botoes;
    if (compactados) {
      titulo = docs ? 'Os documentos baixados estão compactados' : 'As enciclopédias baixadas ainda não foram instaladas';
      corpo = [
        h('p', {}, `Para ${docs ? 'consultar os documentos' : 'consultar as enciclopédias'}, clique em `, h('b', {}, 'Iniciar Protocolo Zero'),
          `. Ele descompacta ${pac.pendentes} pacote(s) e prepara a busca. Não precisa de internet.`),
        h('div', { class: 'energia-item' },
          h('b', {}, `Vai ocupar ~${bytes(pac.espacoNecessario || 0)} a mais no disco`),
          h('span', {}, `${bytes(pac.tamanhoFinal || 0)} depois de instalado${livre ? ` · ${bytes(livre)} livres agora` : ''}${livre && pac.espacoNecessario > livre ? ' — espaço insuficiente!' : ''}`)),
      ];
      botoes = [h('button', { class: 'botao primario', onclick: iniciarAgora }, icone('play', 16), 'Iniciar Protocolo Zero agora')];
    } else if (temInstalado) {
      titulo = docs ? 'Os documentos ainda não foram preparados para consulta' : 'As enciclopédias estão fechadas';
      corpo = [h('p', {}, 'Clique em ', h('b', {}, 'Iniciar Protocolo Zero'), docs ? ' para preparar a busca nos documentos. Não precisa de internet.' : ' para abrir as enciclopédias. Não precisa de internet.')];
      botoes = [h('button', { class: 'botao primario', onclick: iniciarAgora }, icone('play', 16), 'Iniciar Protocolo Zero agora')];
    } else {
      titulo = docs ? 'Nenhum documento baixado ainda' : 'Nenhuma enciclopédia baixada ainda';
      corpo = [h('p', {}, docs ? 'Escolha os manuais e livros em "Instalar conteúdo" ou adicione os seus em "Alimentar biblioteca".' : 'Escolha a Wikipédia e outras enciclopédias em "Instalar conteúdo".')];
      botoes = [h('a', { class: 'botao primario', href: '#/configurar', onclick: () => fechar?.() }, icone('baixar', 16), 'Instalar conteúdo')];
    }
    fechar = modal(h('div', { class: 'pilha' },
      h('h3', { style: { margin: 0 } }, titulo),
      ...corpo,
      h('small', { class: 'suave' }, 'Enquanto isso, dá para conversar normalmente: a IA responde com o próprio conhecimento, sem consultar os arquivos.'),
      h('div', { class: 'linha', style: { gap: '8px', justifyContent: 'flex-end' } }, h('button', { class: 'botao fantasma', onclick: () => fechar() }, 'Agora não'), ...botoes)),
    { largura: 520 });
  }

  // ---------- modo da IA: Rápido / Recomendado / Detalhado + Pensamento profundo ----------
  const tempo = (seg) => (seg == null ? '' : seg < 60 ? `~${seg} s` : `~${Math.round(seg / 60)} min`);
  const perfilDoModelo = () => [...(perfisInfo?.perfis || []), perfisInfo?.profundo].filter(Boolean).find((p) => p.instalado && semTag(p.nomeInstalado) === semTag(modelo));
  function botaoModoIA() {
    const p = perfilDoModelo();
    const rotulo = p?.id === 'profundo' ? 'Raciocínio' : classe(modelo);
    return h('button', { type: 'button', class: 'ia-modo ia-modo-ia', title: 'Escolher o modo da IA', onclick: (e) => abrirMenuModo(e.currentTarget) },
      icone('cerebro', 14), rotulo, h('span', { class: 'ia-seta' }, '▾'));
  }
  function alternarPensar(v) {
    pensar = v;
    pref.pensar = v;
    gravar(CHAVE_PREF, pref);
    desenharModos();
  }
  function usarModelo(nome) {
    modelo = nome;
    pref.modelo = nome;
    gravar(CHAVE_PREF, pref);
    seletorModelo.value = nome;
    desenharModos();
    desenharTopo();
  }
  async function baixarPerfil(p, botao) {
    botao.disabled = true;
    try {
      await api.post('/api/ollama/modelo', { nome: p.tag });
      toast(`Baixando a IA ${p.rotulo} (${bytes(p.tamanho)})… quando terminar, ela aparece aqui para escolher.`);
    } catch (e) {
      botao.disabled = false;
      toast(e.message, 'erro');
    }
  }
  const fecharMenu = () => {
    menuAberto?.remove();
    menuAberto = null;
  };
  async function abrirMenuModo(ancora) {
    if (menuAberto) return fecharMenu();
    const menu = h('div', { class: 'ia-menu-modo' }, h('div', { class: 'ia-pensando' }, h('small', {}, 'Carregando opções…')));
    compositor.append(menu); // fora da barra de modos: ela é redesenhada ao trocar opções
    menuAberto = menu;
    await carregarPerfis();
    if (menuAberto !== menu) return;
    const info = perfisInfo;
    const linhaVel = (p) => [p.nivel && p.nivel !== 'desconhecido' ? `qualidade ${p.nivel.replace(/básico$/, 'básica').replace(/bom$/, 'boa')}` : null, p.esperaSeg ? `responde em ${tempo(p.esperaSeg)}${p.estimado ? ' (estimado)' : ''}` : null, `motor: ${motor(p.tag || p.nomeInstalado)}`].filter(Boolean).join(' · ');
    const botaoBaixarPerfil = (p, rotulo) => {
      const b = h('button', { type: 'button', class: 'botao pequeno' }, icone('baixar', 13), rotulo || `Baixar ${bytes(p.tamanho)}`);
      b.addEventListener('click', (e) => { e.stopPropagation(); baixarPerfil(p, b); });
      return b;
    };
    const opcao = (p) => {
      const atualSel = p.instalado && semTag(p.nomeInstalado) === semTag(modelo);
      return h('div', {
        class: `ia-opcao-modo ${atualSel ? 'selecionada' : ''} ${p.instalado ? '' : 'nao-instalado'}`,
        role: 'button', tabindex: 0,
        onclick: () => { if (p.instalado) { usarModelo(p.nomeInstalado); fecharMenu(); } },
      },
        h('div', { class: 'ia-opcao-modo-topo' }, h('b', {}, p.rotulo), atualSel ? h('span', { class: 'ia-check' }, '✓') : null),
        h('small', {}, p.explicacao),
        h('small', { class: 'suave' }, linhaVel(p)),
        p.instalado ? null : botaoBaixarPerfil(p));
    };
    const prof = info?.profundo;
    const nativo = /^(qwen3|deepseek-r1|gpt-oss|magistral|phi4-reasoning)/i.test(semTag(modelo || ''));
    const toggle = h('label', { class: 'ia-opcao-modo ia-toggle' },
      h('input', { type: 'checkbox', checked: pensar, onchange: (e) => alternarPensar(e.target.checked) }),
      h('div', {},
        h('b', {}, 'Pensamento profundo'),
        h('small', {}, 'A IA raciocina passo a passo antes de responder e mostra o raciocínio. Bem mais lento; melhor para problemas difíceis: cálculos, diagnósticos, planejamento.'),
        h('small', { class: 'suave' }, nativo
          ? 'Esta IA pensa de verdade antes de responder.'
          : `Esta IA só imita o passo a passo. Para o raciocínio de verdade, ${prof?.instalado ? 'use a IA de pensamento profundo' : 'baixe a IA de pensamento profundo'}${prof?.esperaSeg ? ` (responde em ${tempo(prof.esperaSeg)})` : ''}.`)));
    const usarPensador = prof?.instalado && !nativo
      ? h('button', { type: 'button', class: 'botao pequeno', onclick: () => { usarModelo(prof.nomeInstalado); alternarPensar(true); fecharMenu(); } }, 'Usar a IA de pensamento profundo')
      : null;
    const baixarPensador = prof && !prof.instalado ? botaoBaixarPerfil(prof, `Baixar a IA de pensamento profundo (${bytes(prof.tamanho)})`) : null;
    const semMaior = info && !info.perfis.some((p) => p.id === 'detalhado');
    menu.replaceChildren(...[
      h('div', { class: 'ia-menu-titulo' }, 'Velocidade × qualidade'),
      ...(info?.perfis || []).map(opcao),
      semMaior ? h('small', { class: 'suave ia-menu-nota' }, 'Este computador não aguenta uma IA mais lenta e caprichada que a Moderada.') : null,
      h('div', { class: 'ia-menu-titulo' }, 'Ferramentas'),
      toggle,
      usarPensador || baixarPensador ? h('div', { class: 'linha', style: { padding: '0 10px 6px', gap: '6px' } }, usarPensador, baixarPensador) : null,
      ...(info?.outros?.length
        ? [h('div', { class: 'ia-menu-titulo' }, 'Outras IAs instaladas'),
           ...info.outros.map((o) => h('div', { class: `ia-opcao-modo ${semTag(o.tag) === semTag(modelo) ? 'selecionada' : ''}`, role: 'button', tabindex: 0, onclick: () => { usarModelo(o.tag); fecharMenu(); } },
             h('div', { class: 'ia-opcao-modo-topo' }, h('b', {}, classe(o.tag)), semTag(o.tag) === semTag(modelo) ? h('span', { class: 'ia-check' }, '✓') : null),
             h('small', { class: 'suave' }, linhaVel(o))))]
        : []),
      !info ? h('small', { class: 'perigo' }, 'Não foi possível carregar as opções (o Ollama está rodando?).') : null,
    ].filter(Boolean));
  }

  // ---------- conversas ----------
  function novaConversa() {
    if (ctrl) return;
    atual = null;
    gravar(CHAVE_ATUAL, null);
    raiz.classList.remove('lateral-aberta');
    desenharTudo();
    texto.focus();
  }
  function selecionar(c) {
    if (ctrl) return toast('Aguarde a resposta terminar ou clique em Parar.');
    atual = c;
    gravar(CHAVE_ATUAL, c.id);
    raiz.classList.remove('lateral-aberta');
    desenharTudo();
  }
  async function excluir(c) {
    if (!(await confirmar(`Excluir a conversa "${c.titulo}"?`, { botao: 'Excluir', perigo: true }))) return;
    conversas = conversas.filter((x) => x.id !== c.id);
    if (atual?.id === c.id) atual = null;
    salvarConversas(conversas);
    desenharTudo();
  }
  function renomear(c, el) {
    const campo = h('input', { class: 'ia-renomear', value: c.titulo, 'aria-label': 'Novo nome' });
    const concluir = (salvar) => {
      if (salvar && campo.value.trim()) c.titulo = campo.value.trim().slice(0, 80);
      salvarConversas(conversas);
      desenharLista();
      desenharTopo();
    };
    campo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') concluir(true);
      if (e.key === 'Escape') concluir(false);
    });
    campo.addEventListener('blur', () => concluir(true));
    el.replaceChildren(campo);
    campo.focus();
    campo.select();
  }
  function abrirMenu(c, ancora, item) {
    menuAberto?.remove();
    const opc = (ic, rot, fn, cls = '') => h('button', { class: cls, onclick: (e) => { e.stopPropagation(); menuAberto?.remove(); menuAberto = null; fn(); } }, icone(ic, 14), rot);
    menuAberto = h('div', { class: 'ia-menu', role: 'menu' },
      opc('pino', c.fixada ? 'Desafixar' : 'Fixar', () => { c.fixada = !c.fixada; salvarConversas(conversas); desenharLista(); }),
      opc('lapis', 'Renomear', () => renomear(c, item.querySelector('.ia-conversa-titulo'))),
      opc('copiar', 'Exportar (.md)', () => exportar(c)),
      opc('lixo', 'Excluir', () => excluir(c), 'perigo'));
    ancora.parentElement.append(menuAberto);
  }
  function exportar(c) {
    const md = [`# ${c.titulo}`, '', ...c.mensagens.map((m) => (m.papel === 'usuario' ? `**Você:** ${m.texto}` : `**Protocolo Zero${m.modelo ? ` (${m.modelo})` : ''}:**\n\n${m.texto || ''}${m.fontes?.length ? `\n\nFontes:\n${m.fontes.map((f) => `- [${f.n}] ${f.titulo}${f.pagina ? `, p. ${f.pagina}` : ''}`).join('\n')}` : ''}`)).flatMap((x) => [x, ''])].join('\n');
    const a = h('a', { href: URL.createObjectURL(new Blob([md], { type: 'text/markdown' })), download: `${c.titulo.replace(/[^\w\s-]/g, '').trim() || 'conversa'}.md` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function desenharLista() {
    listaConversas.replaceChildren();
    if (!conversas.length) {
      listaConversas.append(h('small', { class: 'ia-vazio-lista' }, 'Suas conversas aparecem aqui. Ficam guardadas só neste navegador.'));
      return;
    }
    let grupo = null;
    for (const c of ordenar(conversas)) {
      const g = c.fixada ? 'Fixadas' : grupoData(c.data);
      if (g !== grupo) {
        grupo = g;
        listaConversas.append(h('div', { class: 'ia-grupo' }, g));
      }
      const mais = h('button', { class: 'ia-conversa-mais', 'aria-label': 'Opções da conversa', title: 'Opções' }, icone('pontos', 16, { espessura: 3 }));
      const item = h('div', { class: `ia-conversa ${atual?.id === c.id ? 'ativa' : ''}` },
        h('button', { class: 'ia-conversa-abrir', onclick: () => selecionar(c) },
          c.fixada ? icone('pino', 13) : icone('chat', 13),
          h('span', { class: 'ia-conversa-titulo' }, c.titulo)),
        mais);
      mais.addEventListener('click', (e) => { e.stopPropagation(); abrirMenu(c, mais, item); });
      listaConversas.append(item);
    }
  }

  function desenharTopo() {
    tituloTopo.replaceChildren(
      h('b', {}, atual?.titulo || 'Assistente Protocolo Zero'),
      h('small', { title: modelo ? `Motor: ${motor(modelo)}` : '' }, rotuloModelo(modelo)));
  }

  // ---------- mensagens ----------
  function boasVindas() {
    return h('div', { class: 'ia-boas-vindas' },
      h('div', { class: 'ia-emblema grande' }, icone('emblema', 34, { espessura: 2 })),
      h('h2', {}, 'Como posso ajudar?'),
      h('p', { class: 'suave' },
        dadosProntos || enciclopediasProntas
          ? 'Respondo consultando os arquivos baixados do Protocolo Zero e cito as fontes. Tudo roda no seu computador.'
          : 'Os dados ainda não foram preparados. Já dá para conversar: respondo com o conhecimento do modelo, sem consultar a biblioteca.'),
      !dadosProntos && !enciclopediasProntas
        ? h('a', { class: 'botao pequeno', href: '#/inicio' }, icone('play', 14), 'Iniciar Protocolo Zero')
        : null,
      h('div', { class: 'ia-sugestoes' },
        SUGESTOES.map((sg) => h('button', { class: 'ia-sugestao', onclick: () => { texto.value = sg.texto; enviar(); } },
          h('span', { class: 'ia-sugestao-icone' }, icone(sg.icone, 16)),
          h('b', {}, sg.titulo),
          h('small', {}, sg.texto)))));
  }

  function bolhaUsuario(m) {
    return h('div', { class: 'ia-msg usuario' },
      h('div', { class: 'ia-bolha' },
        m.anexo ? h('div', { class: 'ia-anexo' }, icone('clipe', 13), h('b', {}, m.anexo.nome), h('small', {}, bytes(m.anexo.tamanho))) : null,
        h('div', { class: 'ia-texto-usuario' }, m.texto)));
  }

  function bolhaIA(m, emAndamento) {
    const corpo = h('div', { class: 'ia-corpo' });
    if (m.aviso) corpo.append(h('div', { class: 'ia-aviso-modo' }, icone('info', 14), m.aviso));
    if (m.pensamento) {
      const pensando = emAndamento && !m.texto;
      corpo.append(h('details', { class: 'ia-raciocinio', open: pensando },
        h('summary', {}, icone('cerebro', 13), pensando ? 'Pensando…' : `Raciocínio${m.pensouSeg ? ` (${m.pensouSeg} s)` : ''}${m.cortado ? ` · interrompido por ser longo demais${m.redator ? ` (resposta escrita pela IA ${classe(m.redator)})` : ''}` : ''}`),
        h('div', { class: 'ia-raciocinio-texto' }, m.pensamento)));
    }
    if (m.texto) {
      const md = markdown(m.texto, (n) => {
        const f = m.fontes?.find((x) => x.n === n);
        if (f) abrirFonte(f);
      });
      corpo.append(md);
      if (!emAndamento) marcarConversoes(md); // oz, °F, galão… sublinhados com balão de conversão
      if (emAndamento) {
        // cursor no fim do último bloco de texto (dentro do último parágrafo/item)
        let alvo = md.lastElementChild;
        while (alvo?.lastElementChild && /^(UL|OL|LI|BLOCKQUOTE)$/.test(alvo.tagName)) alvo = alvo.lastElementChild;
        (alvo && /^(P|LI|H\d)$/.test(alvo.tagName) ? alvo : md).append(h('span', { class: 'ia-cursor' }));
      }
    } else if (!m.erro && !m.pensamento) {
      corpo.append(h('div', { class: 'ia-pensando' }, h('span', { class: 'digitando' }, h('span'), h('span'), h('span')), h('small', {}, m.status || 'Pensando…')));
    }
    if (m.erro) corpo.append(aviso('erro', m.erro));

    const fontes = m.fontes?.length
      ? h('details', { class: 'ia-fontes', open: true },
          h('summary', {}, icone('livro', 13), `${m.fontes.length} fonte(s) consultada(s)`),
          h('div', { class: 'fontes' },
            m.fontes.map((f) =>
              h('button', { class: `fonte-chip ${f.oficial ? 'oficial' : ''} ${f.naoVerificado ? 'nao-verificada' : ''}`, title: `${CONFIANCA[f.confianca]?.dica || ''}${f.orgao && !f.naoVerificado ? ` — ${f.orgao}` : ''}\n\n${f.trecho}`, onclick: () => abrirFonte(f) },
                h('b', {}, f.n), icone(f.tipo === 'zim' ? 'globo' : 'livro', 13), h('span', {}, `${f.titulo}${f.pagina ? ` · p. ${f.pagina}` : ''}`),
                seloConfianca(f.confianca)))))
      : null;

    // Alerta em toda resposta: a IA erra; o que vale é a fonte oficial.
    const oficial = m.fontes?.find((f) => f.oficial);
    const alertaIA = !emAndamento && m.texto
      ? h('div', { class: 'ia-alerta-erro' },
          icone('alerta', 14),
          h('span', {}, h('b', {}, 'A IA pode cometer erros. '),
            oficial
              ? 'Antes de agir, confira no documento oficial já baixado na sua Biblioteca (abre offline): '
              : 'Para saúde, doses e segurança, confira sempre nos documentos oficiais da sua '),
          oficial
            ? h('button', { type: 'button', class: 'link', onclick: () => abrirFonte(oficial) }, `[${oficial.n}] ${oficial.titulo}${oficial.pagina ? `, p. ${oficial.pagina}` : ''}`)
            : h('a', { href: '#/biblioteca/saude' }, 'Biblioteca'))
      : null;

    const botaoCopiar = h('button', { class: 'ia-acao', title: 'Copiar resposta' }, icone('copiar', 14), h('span', {}, 'Copiar'));
    botaoCopiar.addEventListener('click', async () => {
      botaoCopiar.lastChild.textContent = (await copiarTexto(m.texto || '')) ? 'Copiado!' : 'Falhou';
      setTimeout(() => (botaoCopiar.lastChild.textContent = 'Copiar'), 1600);
    });
    const rodape = !emAndamento && (m.texto || m.erro)
      ? h('div', { class: 'ia-msg-rodape' },
          h('span', { title: m.modelo ? `Motor: ${motor(m.modelo)}` : '' }, ['Protocolo Zero', m.modelo && `IA ${classe(m.modelo)}`, m.modoPensar ? 'pensamento profundo' : null, m.livre ? 'sem consulta' : m.fontes?.length ? 'com fontes' : null].filter(Boolean).join(' • ')),
          m.texto ? botaoCopiar : null)
      : null;

    return h('div', { class: 'ia-msg ia-resp' },
      h('div', { class: 'ia-emblema' }, icone('emblema', 16, { espessura: 2.2 })),
      h('div', { class: 'ia-resp-conteudo' }, corpo, fontes, alertaIA, rodape));
  }

  let grudarNoFim = true;
  rolagem.addEventListener('scroll', () => {
    grudarNoFim = rolagem.scrollHeight - rolagem.scrollTop - rolagem.clientHeight < 80;
  });

  function desenharMensagens(rolarForcado) {
    mensagens.replaceChildren();
    if (!atual?.mensagens.length) {
      mensagens.append(boasVindas());
      return;
    }
    atual.mensagens.forEach((m, i) => {
      const emAndamento = !!ctrl && i === atual.mensagens.length - 1;
      mensagens.append(m.papel === 'usuario' ? bolhaUsuario(m) : bolhaIA(m, emAndamento));
    });
    if (rolarForcado || grudarNoFim) rolagem.scrollTop = rolagem.scrollHeight;
  }

  function desenharTudo() {
    desenharLista();
    desenharTopo();
    desenharModos();
    desenharMensagens(true);
  }

  // ---------- envio ----------
  async function enviar() {
    const pergunta = texto.value.trim();
    if (!pergunta || ctrl) return;
    if (!s?.ollama?.online) return toast('O Ollama não está rodando.', 'erro');
    if (!modelo) return toast('Nenhum modelo de IA instalado.', 'erro');

    if (!atual) {
      atual = { id: novoId(), titulo: tituloDe(pergunta), data: Date.now(), fixada: false, mensagens: [] };
      conversas.push(atual);
      gravar(CHAVE_ATUAL, atual.id);
    }
    texto.value = '';
    ajustarAltura();
    const historico = atual.mensagens.filter((m) => m.texto && !m.erro).map(({ papel, texto: t }) => ({ papel, texto: t }));
    const anexoEnvio = anexo;
    anexo = null;
    desenharAnexo();

    atual.mensagens.push({ papel: 'usuario', texto: pergunta, anexo: anexoEnvio ? { nome: anexoEnvio.nome, tamanho: anexoEnvio.tamanho } : null });
    const resposta = { papel: 'ia', texto: '', fontes: [], status: 'Pensando…', modelo };
    atual.mensagens.push(resposta);
    atual.data = Date.now();
    ctrl = new AbortController();
    botaoParar.style.display = '';
    botaoEnviar.style.display = 'none';
    grudarNoFim = true;
    desenharLista();
    desenharTopo();
    desenharMensagens(true);

    let ultimo = 0;
    try {
      await api.conversar({
        pergunta,
        historico,
        modelo,
        usarBiblioteca: ativo('consultar'),
        usarWikipedia: ativo('enciclopedias'),
        pensar,
        anexo: anexoEnvio ? { nome: anexoEnvio.nome, texto: anexoEnvio.texto } : undefined,
      }, (ev) => {
        if (ev.tipo === 'modelo') resposta.modelo = ev.modelo;
        if (ev.tipo === 'status') resposta.status = ev.texto;
        if (ev.tipo === 'aviso') { resposta.aviso = ev.texto; resposta.livre = true; }
        if (ev.tipo === 'fontes') resposta.fontes = ev.fontes;
        if (ev.tipo === 'pensamento') resposta.pensamento = (resposta.pensamento || '') + ev.texto;
        if (ev.tipo === 'fim') { resposta.pensouSeg = ev.pensouSeg; resposta.modoPensar = ev.pensamento; resposta.cortado = ev.raciocinioCortado; resposta.redator = ev.redator; }
        if (ev.tipo === 'texto') resposta.texto += ev.texto;
        if (ev.tipo === 'erro') resposta.erro = ev.texto;
        const agora = performance.now();
        if (agora - ultimo > 70 || ev.tipo !== 'texto') {
          ultimo = agora;
          desenharMensagens();
        }
      }, ctrl.signal);
      if (!ativo('consultar') && !ativo('enciclopedias')) resposta.livre = true;
    } catch (e) {
      if (e.name !== 'AbortError') resposta.erro = e.message;
    } finally {
      if (!resposta.texto && !resposta.erro) resposta.erro = 'Resposta interrompida.';
      delete resposta.status;
      ctrl = null;
      botaoParar.style.display = 'none';
      botaoEnviar.style.display = '';
      salvarConversas(conversas);
      desenharMensagens();
      texto.focus();
    }
  }

  desenharTudo();
  texto.focus();
  // Pergunta pronta vinda de "Emergência agora": abre uma conversa nova e envia.
  let pronta = null;
  try {
    pronta = sessionStorage.getItem('pz-pergunta');
    sessionStorage.removeItem('pz-pergunta');
  } catch {}
  if (pronta) {
    atual = null;
    desenharTudo();
    texto.value = pronta;
    enviar();
  }
  return () => {
    ctrl?.abort();
    document.removeEventListener('click', fecharMenus, true);
    raiz.classList.remove('tela-ia', 'lateral-aberta');
    raiz.style.padding = '';
  };
}
