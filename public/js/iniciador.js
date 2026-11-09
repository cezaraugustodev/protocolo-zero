// Painéis "Iniciar Protocolo Zero" (offline: descompacta e configura) e "Atualizar" (internet: baixa
// compactado), com checklist ao vivo, e o cartão de sugestão de modelo de IA.
import { h, icone, bytes, toast, markdown, barra } from './ui.js';
import { api } from './api.js';

const ICONE_ESTADO = { ok: 'ok', aviso: 'alerta', erro: 'x', pulado: 'seta', pendente: 'seta', rodando: 'atualizar' };
const ROTULO_ESTADO = { ok: 'OK', aviso: 'Atenção', erro: 'Problema', pulado: 'Não se aplica', pendente: 'Aguardando', rodando: 'Em andamento…' };
const ROTULO_TIPO = {
  conteudo: 'Conteúdo', 'zim-nova': 'Versão nova', modelo: 'Modelo de IA', ollama: 'Motor de IA',
  kiwix: 'Leitor', componentes: 'Componentes', programa: 'Programa',
};

/** Lê um fluxo NDJSON (mesmo formato do chat). */
async function lerFluxo(url, onEvento, sinal) {
  const r = await fetch(url, { method: 'POST', headers: { 'x-protocolo-zero': '1' }, signal: sinal });
  if (!r.ok) throw new Error(`Erro ${r.status}`);
  const leitor = r.body.getReader();
  const dec = new TextDecoder();
  let resto = '';
  for (;;) {
    const { value, done } = await leitor.read();
    if (done) break;
    resto += dec.decode(value, { stream: true });
    const linhas = resto.split('\n');
    resto = linhas.pop();
    for (const l of linhas) if (l.trim()) onEvento(JSON.parse(l));
  }
}

/** Leva o usuário às atualizações (aba "Atualizações" em Ajustes). */
export function irParaAtualizar() {
  location.hash = '#/ajustes/atualizacoes';
}

/**
 * Painel genérico com botão, checklist ao vivo e "Pedir ajuda à IA".
 * cfg: { id, rota, de, icone, carregarInfo(), cabecalho(rel, info), botao(rel, info, iniciar), extra(rel, info), aoTerminar }
 */
function criarPainel(cfg) {
  const raiz = h('section', { class: `iniciar ${cfg.classe || ''}`, id: cfg.id });
  let rel = null;
  let info = null;
  let timer = null;
  let explicacao = null; // { texto, carregando, erro }
  let ctrlExplicar = null;
  let destruido = false;

  async function atualizar() {
    try {
      const antes = rel?.estado;
      rel = await api.get(cfg.rota);
      if (rel?.estado !== 'rodando' && (antes === 'rodando' || !info)) info = await cfg.carregarInfo?.().catch(() => info);
      desenhar();
      if (rel?.estado === 'rodando') agendar(1000);
      else if (antes === 'rodando') cfg.aoTerminar?.(rel);
    } catch {
      agendar(3000);
    }
  }
  const agendar = (ms) => {
    clearTimeout(timer);
    if (!destruido) timer = setTimeout(atualizar, ms);
  };

  async function iniciar() {
    explicacao = null;
    try {
      rel = await api.post(cfg.rota);
      desenhar();
      agendar(800);
    } catch (e) {
      toast(e.message, 'erro');
    }
  }

  async function recarregarInfo(forcar) {
    info = await cfg.carregarInfo?.(forcar).catch((e) => {
      toast(e.message, 'erro');
      return info;
    });
    desenhar();
  }

  async function explicar() {
    ctrlExplicar?.abort();
    ctrlExplicar = new AbortController();
    explicacao = { texto: '', carregando: true };
    desenhar();
    let ultimo = 0;
    try {
      await lerFluxo(`/api/iniciar/explicar?de=${cfg.de}`, (ev) => {
        if (ev.tipo === 'texto') explicacao.texto += ev.texto;
        if (ev.tipo === 'erro') explicacao.erro = ev.texto;
        if (performance.now() - ultimo > 80) {
          ultimo = performance.now();
          desenharExplicacao();
        }
      }, ctrlExplicar.signal);
    } catch (e) {
      if (e.name !== 'AbortError') explicacao.erro = e.message;
    }
    explicacao.carregando = false;
    desenharExplicacao();
  }

  async function acao(p, botao) {
    if (p.acao?.tipo === 'atualizar') return irParaAtualizar();
    if (p.acao?.tipo === 'usar-recomendado') {
      botao.disabled = true;
      try {
        const r = await api.post('/api/ia/usar-recomendado');
        toast(r.baixando ? `Baixando ${r.modelo}… o assistente passa a usá-lo quando terminar (veja em Transferências).` : `O assistente agora usa ${r.modelo}.`);
      } catch (e) {
        botao.disabled = false;
        toast(e.message, 'erro');
      }
    }
  }

  const caixaExplicacao = h('div');
  function desenharExplicacao() {
    if (!explicacao) return caixaExplicacao.replaceChildren();
    caixaExplicacao.replaceChildren(
      h('div', { class: 'iniciar-ajuda' },
        h('div', { class: 'linha' }, h('span', { class: 'ia-emblema' }, icone('emblema', 15, { espessura: 2.2 })), h('b', {}, 'Ajuda do assistente')),
        explicacao.texto
          ? markdown(explicacao.texto)
          : explicacao.carregando
            ? h('div', { class: 'ia-pensando' }, h('span', { class: 'digitando' }, h('span'), h('span'), h('span')), h('small', {}, 'Analisando os problemas…'))
            : null,
        explicacao.erro ? h('small', { class: 'perigo' }, explicacao.erro) : null));
  }

  function botaoAcao(p) {
    const internet = p.acao.tipo === 'atualizar';
    const b = h('button', { class: `botao pequeno ${internet ? '' : 'primario'}`, style: { marginTop: '8px' } },
      icone(internet ? 'nuvem' : 'baixar', 14), p.acao.rotulo,
      p.acao.tamanho ? h('small', { style: { opacity: 0.8 } }, ` (${bytes(p.acao.tamanho)})`) : null);
    b.addEventListener('click', () => acao(p, b));
    return b;
  }

  function desenhar() {
    const rodando = rel?.estado === 'rodando';
    const passos = rel?.passos || [];
    const feitos = passos.filter((p) => !['pendente', 'rodando'].includes(p.estado)).length;
    const problemas = passos.filter((p) => ['erro', 'aviso'].includes(p.estado));
    const erros = passos.filter((p) => p.estado === 'erro').length;
    const { titulo, sub, icone: ic } = cfg.cabecalho(rel, info, { rodando, erros, problemas });

    raiz.className = `iniciar ${cfg.classe || ''} ${rodando ? 'rodando' : ''} ${rel && !rodando ? (erros ? 'com-erro' : problemas.length ? 'com-aviso' : 'pronto') : ''}`;
    raiz.replaceChildren(...[
      h('div', { class: 'iniciar-topo' },
        h('div', { class: 'iniciar-selo' }, icone(rodando ? 'atualizar' : ic || cfg.icone, 26, { espessura: 2.2 })),
        h('div', { class: 'iniciar-textos' }, h('h2', {}, titulo), h('p', {}, sub)),
        rodando
          ? h('button', { class: 'botao', onclick: () => api.post(`${cfg.rota}/cancelar`) }, 'Cancelar')
          : cfg.botao(rel, info, { iniciar, recarregarInfo })),
      rel && (rodando || cfg.mostrarPassosSempre !== false) ? barra(rodando ? feitos / passos.length : 1, rodando ? '' : erros ? 'perigo' : 'musgo') : null,
      !rodando ? cfg.extra?.(rel, info, { iniciar, recarregarInfo }) : null,
      rel && (rodando || cfg.mostrarPassosSempre !== false)
        ? h('ol', { class: 'iniciar-passos' },
            passos.map((p) =>
              h('li', { class: `ip-passo ${p.estado}` },
                h('span', { class: 'ip-passo-icone', title: ROTULO_ESTADO[p.estado] }, icone(ICONE_ESTADO[p.estado] || 'seta', 15, { espessura: 2.4 })),
                h('div', { class: 'ip-passo-info' },
                  h('div', { class: 'ip-passo-titulo' }, p.titulo, h('small', {}, ROTULO_ESTADO[p.estado])),
                  p.mensagem ? h('div', { class: 'ip-passo-msg' }, p.mensagem) : null,
                  p.estado === 'rodando' && typeof p.progresso === 'number' ? barra(p.progresso) : null,
                  p.detalhes?.length || p.erroTecnico
                    ? h('details', { class: 'ip-passo-detalhe' }, h('summary', {}, 'Detalhes técnicos'),
                        h('pre', {}, [p.erroTecnico, ...(p.detalhes || [])].filter(Boolean).join('\n')))
                    : null,
                  p.acao && !rodando ? botaoAcao(p) : null))))
        : null,
      rel && !rodando && problemas.length
        ? h('div', { class: 'linha', style: { marginTop: '4px' } },
            h('button', { class: 'botao', onclick: explicar }, icone('chat', 16), 'Pedir ajuda à IA'),
            h('a', { class: 'botao fantasma', href: '#/transferencias' }, 'Ver transferências'))
        : null,
      caixaExplicacao].filter(Boolean));
    desenharExplicacao();
  }

  desenhar();
  atualizar();
  raiz.recarregar = () => atualizar();
  raiz.destruir = () => {
    destruido = true;
    clearTimeout(timer);
    ctrlExplicar?.abort();
  };
  return raiz;
}

/** "Iniciar Protocolo Zero": descompacta os pacotes e deixa tudo pronto. Não usa internet. */
export function painelIniciar({ aoTerminar } = {}) {
  return criarPainel({
    id: 'painel-iniciar',
    rota: '/api/iniciar',
    de: 'iniciar',
    icone: 'emblema',
    carregarInfo: async () => (await api.get('/api/estado')).pacotes,
    cabecalho(rel, pac, { rodando, erros, problemas }) {
      const pend = pac?.pendentes || 0;
      const aguardando = pend ? `${pend} pacote(s) baixado(s) aguardando para descompactar${pac.tamanhoPendente ? ` (${bytes(pac.tamanhoPendente)})` : ''}. ` : '';
      if (rodando) return { titulo: 'Preparando o Protocolo Zero…', sub: 'Descompactando e configurando. Pode continuar usando o sistema.' };
      if (!rel || pend) {
        return {
          titulo: pend ? 'Pacotes prontos para instalar' : 'Deixe tudo pronto com um clique',
          sub: `${aguardando}Descompacta os pacotes baixados, confere e restaura arquivos, liga a IA e as enciclopédias e prepara a busca. Funciona sem internet.`,
          icone: pend ? 'pacote' : 'emblema',
        };
      }
      return {
        titulo: erros ? 'Quase lá — alguns itens precisam de atenção' : problemas.length ? 'Pronto, com algumas observações' : 'Tudo pronto para usar',
        sub: `Última verificação: ${new Date(rel.fim || rel.inicio).toLocaleString('pt-BR')} · funciona sem internet`,
        icone: erros || problemas.length ? 'alerta' : 'ok',
      };
    },
    botao: (rel, pac, { iniciar }) =>
      h('button', { class: 'botao primario grande iniciar-botao', onclick: () => (!rel || pac?.pendentes ? (location.hash = '#/emergencia') : iniciar()) }, icone('play', 18),
        !rel || pac?.pendentes ? 'Iniciar Protocolo Zero' : 'Verificar de novo'),
    aoTerminar,
  });
}

/** "Atualizar": baixa pela internet (compactado) e, no fim, roda o Iniciar sozinho. */
export function painelAtualizar({ aoTerminar } = {}) {
  return criarPainel({
    id: 'painel-atualizar',
    classe: 'atualizar',
    rota: '/api/atualizar',
    de: 'atualizar',
    icone: 'nuvem',
    mostrarPassosSempre: false,
    carregarInfo: (forcar) => api.get(`/api/atualizacoes${forcar ? '?forcar' : ''}`),
    cabecalho(rel, info, { rodando }) {
      if (rodando) return { titulo: 'Atualizando pela internet…', sub: 'Baixando e compactando. No fim, o Protocolo Zero descompacta e instala sozinho.' };
      const n = info?.itens?.length || 0;
      const quando = info?.verificadoEm ? `Verificado em ${new Date(info.verificadoEm).toLocaleString('pt-BR')}` : 'Ainda não verificado';
      if (info && info.online === false) {
        return { titulo: 'Sem internet no momento', sub: `Tudo o que já foi baixado continua funcionando. Quando houver conexão, as atualizações aparecem aqui. ${quando}.`, icone: 'semrede' };
      }
      if (n) return { titulo: `${n} atualização(ões) disponível(is)`, sub: `${info.total ? `${bytes(info.total)} para baixar. ` : ''}Nada é baixado sem o seu clique. ${quando}.`, icone: 'nuvem' };
      return { titulo: 'Tudo atualizado', sub: `${quando}. O Protocolo Zero procura atualizações sozinho de tempos em tempos.`, icone: 'ok' };
    },
    botao(rel, info, { iniciar, recarregarInfo }) {
      const n = info?.itens?.length || 0;
      const procurar = h('button', { class: 'botao fantasma' }, icone('atualizar', 16), 'Procurar atualizações');
      procurar.addEventListener('click', async () => {
        procurar.disabled = true;
        procurar.lastChild.textContent = 'Procurando…';
        await recarregarInfo(true);
      });
      return h('div', { class: 'linha', style: { gap: '8px' } },
        procurar,
        n ? h('button', { class: 'botao primario', onclick: iniciar }, icone('nuvem', 17), `Atualizar agora${info.total ? ` (${bytes(info.total)})` : ''}`) : null);
    },
    extra(rel, info) {
      const partes = [];
      if (info?.itens?.length) {
        partes.push(h('ul', { class: 'lista-atualizacoes' },
          info.itens.map((i) =>
            h('li', {},
              h('span', { class: 'etiqueta' }, ROTULO_TIPO[i.tipo] || i.tipo),
              h('span', { class: 'lista-atualizacoes-titulo' }, i.titulo, i.motivo === 'danificado' ? h('small', { class: 'suave' }, ' · arquivo danificado') : null),
              h('small', { class: 'suave' }, i.tamanho ? `${i.aproximado ? '≈ ' : ''}${bytes(i.tamanho)}` : '')))));
      }
      if (rel?.estado && rel.estado !== 'rodando') {
        const r = rel.resumo || {};
        partes.push(h('details', { class: 'ip-passo-detalhe' },
          h('summary', {}, `Última atualização: ${new Date(rel.fim || rel.inicio).toLocaleString('pt-BR')} · ${r.ok || 0} ok${r.avisos ? ` · ${r.avisos} aviso(s)` : ''}${r.erros ? ` · ${r.erros} problema(s)` : ''}`),
          h('ul', { class: 'lista-atualizacoes' }, rel.passos.map((p) => h('li', {}, h('span', { class: `etiqueta ${p.estado === 'ok' ? 'musgo' : p.estado === 'erro' ? 'perigo' : ''}` }, ROTULO_ESTADO[p.estado]), h('span', { class: 'lista-atualizacoes-titulo' }, `${p.titulo}: ${p.mensagem}`))))));
      }
      return partes.length ? h('div', { style: { display: 'grid', gap: '10px' } }, ...partes) : null;
    },
    aoTerminar,
  });
}

/** Cartão que aparece quando o computador aguenta um modelo melhor (ou o atual está lento). */
export async function cartaoSugestaoIA({ compacto = false } = {}) {
  let av;
  try {
    av = await api.get('/api/ia');
  } catch {
    return null;
  }
  if (!av?.sugestao) return null;
  const sg = av.sugestao;
  const usar = async (botao) => {
    botao.disabled = true;
    try {
      const r = await api.post('/api/ia/usar-recomendado');
      toast(r.baixando ? `Baixando ${r.modelo}… o assistente passa a usá-lo automaticamente quando terminar.` : `O assistente agora usa ${r.modelo}.`);
      cartao.remove();
    } catch (e) {
      botao.disabled = false;
      toast(e.message, 'erro');
    }
  };
  const botao = h('button', { class: 'botao primario pequeno' }, icone(sg.baixar ? 'baixar' : 'ok', 14),
    sg.baixar ? `Baixar e usar (${bytes(sg.tamanho)})` : `Usar ${sg.nome}`);
  botao.addEventListener('click', () => usar(botao));
  const cartao = h('div', { class: `sugestao-ia ${compacto ? 'compacta' : ''}` },
    h('span', { class: 'icone-bolha' }, icone('cerebro', 18)),
    h('div', { class: 'sugestao-ia-texto' },
      h('b', {}, sg.titulo),
      compacto ? null : h('p', {}, sg.texto),
      compacto ? null : h('small', {}, av.recomendado.motivo)),
    h('div', { class: 'linha', style: { gap: '6px' } },
      botao,
      h('button', { class: 'botao pequeno fantasma', 'aria-label': 'Dispensar', title: 'Agora não', onclick: () => cartao.remove() }, icone('x', 14))));
  return cartao;
}
