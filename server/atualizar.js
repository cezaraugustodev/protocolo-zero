// "Atualizar": tudo o que precisa de internet fica aqui.
// - Procura atualizações (sozinho, de tempos em tempos) e avisa a página — nunca baixa sem o clique do usuário.
// - Ao clicar em "Atualizar", baixa para o armazém de pacotes (compactado) e, no fim, roda o
//   "Iniciar Protocolo Zero", que descompacta e deixa tudo pronto.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { RAIZ, DADOS, PLATAFORMA, existe, lerJSON, gravarJSON, executar as executarCmd, registrarErro } from './util.js';
import { carregarCatalogo, item as itemCatalogo, resolverZim } from './catalogo.js';
import { criarTarefa, aguardarTarefa as aguardarTarefaSo, cancelarTarefa } from './tarefas.js';
import { instalarKiwix, instalarVendor, vendorInstalado, instalarOllama, caminhoKiwixServe, ligarOllama, ollamaInstalado } from './ferramentas.js';
import { statusOllama, ollamaOnline } from './ollama.js';
import { semTag } from './inteligencia.js';
import { explicarSemIA } from './iniciar.js';
import { criarExecutor } from './relatorio.js';
import * as bib from './biblioteca.js';
import * as pacotes from './pacotes.js';
import * as programa from './programa.js';

// Versão nova do programa instalada: precisa reiniciar para usar (a página mostra "Reiniciar agora").
let reinicioPendente = false;
export const precisaReiniciar = () => reinicioPendente;

const ARQ_RELATORIO = path.join(DADOS, 'relatorio-atualizar.json');
const ARQ_VERIFICACAO = path.join(DADOS, 'atualizacoes.json');
const VALIDADE_REMOTA = 12 * 3600 * 1000;

const PASSOS = [
  ['conexao', 'Conexão com a internet'],
  ['catalogo', 'Novas fontes do catálogo'],
  ['componentes', 'Componentes de leitura (PDF e mapas)'],
  ['motor', 'Motor de IA (Ollama)'],
  ['conteudo', 'Conteúdo selecionado'],
  ['novidades', 'Novas versões das enciclopédias'],
  ['modelos', 'Modelos de IA'],
  ['leitor', 'Leitor de enciclopédias (Kiwix)'],
  ['programa', 'Programa Protocolo Zero'],
];

const executor = criarExecutor({ nome: 'atualizar', arquivo: ARQ_RELATORIO, passos: PASSOS, explicar: (m) => explicarSemIA(m) });
export const relatorioAtualizacao = executor.atual;
export const atualizando = executor.rodando;
export const cancelarAtualizacao = executor.cancelar;

/** Há internet? (qualquer resposta de um destes serve) */
export async function temInternet() {
  const alvos = ['https://library.kiwix.org/', 'https://registry.ollama.ai/', 'https://github.com/'];
  try {
    await Promise.any(alvos.map((u) => fetch(u, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(7000) })));
    return true;
  } catch {
    return false;
  }
}

async function arquivoIntegro(it) {
  try {
    const st = await fsp.stat(bib.caminhoAbsoluto(it));
    if (!st.isFile() || st.size === 0) return false;
    return !it.tamanho || Math.abs(st.size - it.tamanho) <= Math.max(1024, it.tamanho * 0.001);
  } catch {
    return false;
  }
}

// ---------------- o que falta / o que há de novo ----------------

/** Pendências calculadas só com o que está no computador (sem internet). */
async function pendenciasLocais(config) {
  const itens = [];
  const cat = await carregarCatalogo();
  const instalados = await bib.listar();
  const porId = new Map(instalados.map((i) => [i.id, i]));
  const aguardando = new Set((await pacotes.pendentes()).map((p) => p.id));

  if (!(await vendorInstalado())) itens.push({ tipo: 'componentes', titulo: 'Componentes de leitura de PDF e mapas', tamanho: 4e6 });
  if (PLATAFORMA !== 'linux' && !(await ollamaOnline()) && !(await ollamaInstalado())) {
    itens.push({ tipo: 'ollama', titulo: 'Motor de IA (Ollama)', tamanho: 1.2e9, aproximado: true });
  }

  // Selecionados + os do catálogo já instalados (para reparar os que danificaram).
  const ids = new Set([...(config.itens || []), ...instalados.filter((i) => i.origem === 'catalogo').map((i) => i.id)]);
  for (const id of ids) {
    if (aguardando.has(id)) continue;
    const c = cat.itens.find((i) => i.id === id);
    if (!c) continue;
    const it = porId.get(id);
    if (it && (await arquivoIntegro(it))) continue;
    if (it && (await pacotes.temCopia(id))) continue; // o Iniciar restaura sem internet
    itens.push({ tipo: 'conteudo', id, titulo: c.titulo, tamanho: c.tamanho || 0, motivo: it ? 'danificado' : 'novo' });
  }

  const precisaKiwix =
    instalados.some((i) => i.tipo === 'zim') ||
    (config.itens || []).some((id) => cat.itens.find((i) => i.id === id)?.tipo === 'zim');
  if (precisaKiwix && !(await existe(caminhoKiwixServe()))) itens.push({ tipo: 'kiwix', titulo: 'Leitor de enciclopédias (Kiwix)', tamanho: 2e7, aproximado: true });

  if (await ollamaOnline()) {
    const st = await statusOllama();
    const tem = (n) => st.modelos.some((m) => semTag(m.nome) === semTag(n));
    for (const n of [config.modeloChat, config.modeloEmbed]) {
      if (!n || tem(n)) continue;
      const m = cat.modelos?.find((x) => semTag(x.tag) === semTag(n));
      itens.push({ tipo: 'modelo', id: n, titulo: `Modelo de IA ${m?.nome || n}`, tamanho: m?.tamanho || 0 });
    }
  }
  return itens;
}

// Versão do programa instalada e se está em dia com o GitHub: { data, emDia }.
let infoPrograma = null;

/** Pendências que dependem da internet: novas versões de ZIM e do programa. */
async function pendenciasRemotas() {
  const itens = [];
  infoPrograma = null;
  const aguardando = await pacotes.pendentes();
  for (const it of (await bib.listar()).filter((i) => i.tipo === 'zim' && i.origem === 'catalogo')) {
    const c = await itemCatalogo(it.id);
    if (!c?.kiwix) continue;
    try {
      const z = await resolverZim(c, { forcar: true });
      const jaBaixada = aguardando.some((p) => p.id === it.id && p.registro.versao === z.data);
      if (z.data && it.versao && z.data > it.versao && !jaBaixada) {
        itens.push({ tipo: 'zim-nova', id: it.id, titulo: `${it.titulo} — versão ${z.data}`, tamanho: z.tamanho, versao: z.data, versaoAtual: it.versao });
      }
    } catch {}
  }
  const git = await estadoGit().catch(() => null);
  if (git?.atras > 0) itens.push({ tipo: 'programa', titulo: `Programa Protocolo Zero (${git.atras} melhoria(s))`, tamanho: 0, podeAplicar: git.limpo });
  if (git) {
    const data = await executarCmd('git', ['log', '-1', '--format=%cI'], { cwd: RAIZ, timeout: 15000 }).catch(() => '');
    infoPrograma = { data: String(data).trim() || null, emDia: !(git.atras > 0) };
  } else if (reinicioPendente) infoPrograma = { data: null, emDia: true };
  if (!git && !reinicioPendente) {
    // Instalado pelo ZIP: compara os arquivos com a versão publicada no GitHub.
    const v = await programa.verificar().catch(() => null);
    if (v) infoPrograma = { data: v.atualizado ? v.data || null : (await lerJSON(path.join(DADOS, 'programa.json'), null))?.data || null, emDia: !!v.atualizado };
    if (v && !v.atualizado) {
      const data = v.data ? new Date(v.data).toLocaleDateString('pt-BR') : '';
      itens.push({ tipo: 'programa', titulo: `Programa Protocolo Zero (versão nova${data ? ` de ${data}` : ''})`, tamanho: v.bytes || 0, podeAplicar: true });
    }
  }
  return itens;
}

/** Estado do repositório git (o programa é instalado com `git clone`). */
async function estadoGit({ buscar = true } = {}) {
  if (!(await existe(path.join(RAIZ, '.git')))) return null;
  const git = (...a) => executarCmd('git', a, { cwd: RAIZ, timeout: 60000 });
  if (buscar) await git('fetch', '--quiet');
  const atras = Number((await git('rev-list', '--count', 'HEAD..@{u}')).trim()) || 0;
  const limpo = !(await git('status', '--porcelain', '--untracked-files=no')).trim();
  return { atras, limpo };
}

let ultima = null; // { quando, online, remotas, itens, total }
let verificando = null;
const somar = (itens) => itens.reduce((a, i) => a + (i.tamanho || 0), 0);

/**
 * Lista o que há para atualizar. As pendências locais são sempre recalculadas;
 * a consulta à internet é reaproveitada por 12 h (ou refeita com `forcar`).
 */
export async function verificarAtualizacoes(config, { forcar = false, semRede = false } = {}) {
  if (!ultima) ultima = await lerJSON(ARQ_VERIFICACAO, null);
  const remotaVelha = !ultima?.quandoRemoto || Date.now() - ultima.quandoRemoto > VALIDADE_REMOTA;
  if (!semRede && (forcar || remotaVelha)) {
    verificando ??= (async () => {
      const online = await temInternet();
      const remotas = online ? await pendenciasRemotas().catch(() => []) : ultima?.remotas || [];
      ultima = { ...ultima, online, remotas, programa: online ? infoPrograma : ultima?.programa || null, quandoRemoto: online ? Date.now() : ultima?.quandoRemoto || null, verificadoEm: Date.now() };
    })().finally(() => (verificando = null));
    await verificando;
  }
  const locais = await pendenciasLocais(config);
  const aguardando = await pacotes.pendentes();
  const instalados = new Map((await bib.listar()).map((i) => [i.id, i]));
  const remotas = (ultima?.remotas || []).filter((r) => {
    if (locais.some((l) => l.id && l.id === r.id)) return false;
    if (r.tipo !== 'zim-nova') return true;
    if (config.versoesIgnoradas?.[r.id] === r.versao) return false; // o usuário pediu para não baixar
    // Já baixada (aguardando o Iniciar) ou já instalada?
    if (aguardando.some((p) => p.id === r.id && p.registro.versao === r.versao)) return false;
    return !(instalados.get(r.id)?.versao >= r.versao);
  });
  const itens = [...locais, ...remotas];
  ultima = { ...ultima, itens, total: somar(itens), quando: Date.now() };
  await gravarJSON(ARQ_VERIFICACAO, ultima).catch(() => {});
  return ultima;
}

/** Último resultado conhecido, sem consultar nada (para o indicador da barra lateral). */
export const resumoAtualizacoes = () =>
  ultima ? { quantidade: ultima.itens?.length || 0, total: ultima.total || 0, online: ultima.online, verificadoEm: ultima.verificadoEm } : null;

// ---------------- executar a atualização ----------------

/**
 * ctx: { config, salvarConfig, instalarItem(id, {novaVersao}), baixarModeloTarefa, iniciar() }
 * escolha (opcional): { itens: ['conteudo:<id>', 'programa:', …], catalogo: true|false } — atualiza só
 * o que o usuário marcou. Sem escolha (atualização automática), atualiza tudo.
 */
export function atualizarProtocoloZero(ctx, escolha = null) {
  let baixou = 0;
  const marcados = Array.isArray(escolha?.itens) ? new Set(escolha.itens.map(String)) : null;
  const quer = (tipo, id = '') => !marcados || marcados.has(`${tipo}:${id}`);
  const NAO_ESCOLHIDO = { estado: 'pulado', mensagem: 'Não selecionado' };
  return executor.iniciar(
    async ({ rel, rodar, sinal }) => {
      const passo = (id) => rel.passos.find((p) => p.id === id);
      // Espera uma tarefa; se o usuário cancelar a atualização, cancela a tarefa também.
      const aguardarTarefa = async (t) => {
        if (!t) return null;
        const parar = () => cancelarTarefa(t.id);
        if (sinal.aborted) parar();
        sinal.addEventListener('abort', parar, { once: true });
        try {
          return await aguardarTarefaSo(t);
        } finally {
          sinal.removeEventListener('abort', parar);
        }
      };
      const aguardarVarias = async (p, tarefas, rotulo) => {
        const validas = tarefas.filter(Boolean);
        let feitas = 0;
        const msg = () => (p.mensagem = `${rotulo}: ${feitas} de ${validas.length}…`);
        msg();
        return Promise.all(validas.map(async (t) => {
          const r = await aguardarTarefa(t);
          feitas++;
          msg();
          return r;
        }));
      };
      const resultadoTarefas = (res, falhasCriacao, okMsg) => {
        if (sinal.aborted) return { estado: 'pulado', mensagem: 'Cancelado' };
        const erros = res.filter((r) => r && r.estado !== 'concluido');
        baixou += res.length - erros.length;
        const detalhes = [...erros.map((r) => `${r.titulo}: ${r.mensagem}`), ...falhasCriacao];
        if (!detalhes.length) return { mensagem: okMsg(res.length) };
        const total = res.length + falhasCriacao.length;
        return {
          estado: erros.length + falhasCriacao.length === total ? 'erro' : 'aviso',
          mensagem: `${total - erros.length - falhasCriacao.length} de ${total} concluído(s). ${explicarSemIA(detalhes[0])}`,
          detalhes,
        };
      };

      await rodar('conexao', async () => {
        if (!(await temInternet())) throw new Error('Sem conexão com a internet (fetch failed)');
        return { mensagem: 'Conectado' };
      });
      if (passo('conexao').estado === 'erro') return;

      // Novas fontes e links publicados: baixa só as novas do pacote que o usuário usa.
      await rodar('catalogo', async (p) => {
        if (marcados && !escolha.catalogo) return NAO_ESCOLHIDO;
        p.mensagem = 'Consultando o catálogo publicado…';
        const n = await ctx.baixarNovidades({ sinal });
        if (n.semFonte) return { estado: 'pulado', mensagem: 'Este Protocolo Zero não tem endereço de catálogo publicado' };
        baixou += n.baixados.length;
        if (!n.novos.length) return { mensagem: 'Nenhuma fonte nova' };
        const partes = [`${n.novos.length} fonte(s) nova(s) no catálogo`];
        if (n.baixados.length) partes.push(`${n.baixados.length} baixada(s) do pacote ${n.pacote?.nome || ''}`.trim());
        else if (!n.pacote) partes.push('escolha as que quiser em Instalar conteúdo (aparecem como "Novo")');
        if (n.semEspaco.length) partes.push(`${n.semEspaco.length} sem espaço no disco`);
        return { estado: n.falhas.length || n.semEspaco.length ? 'aviso' : 'ok', mensagem: `${partes.join(' · ')}.`, detalhes: n.falhas.length ? n.falhas : undefined };
      });

      const verif = await verificarAtualizacoes(ctx.config, { forcar: true });
      const de = (tipo) => verif.itens.filter((i) => i.tipo === tipo);

      await rodar('componentes', async (p) => {
        if (await vendorInstalado()) return { mensagem: 'Já estão prontos' };
        if (!quer('componentes')) return NAO_ESCOLHIDO;
        p.mensagem = 'Baixando componentes…';
        const t = await aguardarTarefa(criarTarefa({ tipo: 'ferramenta', titulo: 'Componentes de leitura de PDF e mapas', chave: 'ferramenta:vendor', fn: instalarVendor }));
        if (t.estado !== 'concluido') {
          if (sinal.aborted) return { estado: 'pulado', mensagem: 'Cancelado' };
          throw new Error(t.mensagem);
        }
        baixou++;
        return { mensagem: 'Baixados' };
      });

      await rodar('motor', async (p) => {
        if (await ollamaOnline()) return { mensagem: `Instalado (v${(await statusOllama()).versao})` };
        if (await ollamaInstalado()) {
          p.mensagem = 'Ligando o Ollama…';
          if (await ligarOllama(ollamaOnline)) return { mensagem: 'Instalado — foi ligado' };
          throw new Error('O Ollama está instalado, mas não respondeu ao ser ligado');
        }
        if (!quer('ollama')) return NAO_ESCOLHIDO;
        if (PLATAFORMA === 'linux') return { estado: 'aviso', mensagem: 'No Linux, instale uma vez pelo terminal: curl -fsSL https://ollama.com/install.sh | sh' };
        p.mensagem = 'Baixando e instalando o Ollama (instalador oficial)…';
        const t = await aguardarTarefa(criarTarefa({ tipo: 'ferramenta', titulo: 'Ollama (motor de IA)', chave: 'ferramenta:ollama', fn: (tf, s) => instalarOllama(tf, s, ollamaOnline) }));
        if (t.estado !== 'concluido') {
          if (sinal.aborted) return { estado: 'pulado', mensagem: 'Cancelado' };
          throw new Error(t.mensagem);
        }
        baixou++;
        return { mensagem: 'Instalado e rodando' };
      });

      await rodar('conteudo', async (p) => {
        const todos = de('conteudo');
        const lista = todos.filter((i) => quer('conteudo', i.id));
        if (!lista.length) return todos.length ? NAO_ESCOLHIDO : { mensagem: 'Tudo o que foi selecionado já está baixado' };
        const tarefas = [];
        const falhas = [];
        for (const i of lista) {
          try {
            // Arquivo danificado e sem cópia compactada: apaga o registro para baixar de novo.
            if (i.motivo === 'danificado') await bib.remover(i.id).catch(() => {});
            tarefas.push(await ctx.instalarItem(i.id));
          } catch (e) {
            falhas.push(`${i.titulo}: ${e.message}`);
          }
        }
        const res = await aguardarVarias(p, tarefas, 'Baixando e compactando');
        return resultadoTarefas(res, falhas, (n) => `${n} item(ns) baixado(s) e compactado(s)`);
      });

      await rodar('novidades', async (p) => {
        const todas = de('zim-nova');
        const lista = todas.filter((i) => quer('zim-nova', i.id));
        if (!lista.length) return todas.length ? NAO_ESCOLHIDO : { mensagem: 'As enciclopédias estão na versão mais recente' };
        const tarefas = [];
        const falhas = [];
        for (const i of lista) {
          try {
            tarefas.push(await ctx.instalarItem(i.id, { novaVersao: true }));
          } catch (e) {
            falhas.push(`${i.titulo}: ${e.message}`);
          }
        }
        const res = await aguardarVarias(p, tarefas, 'Baixando versões novas');
        return resultadoTarefas(res, falhas, (n) => `${n} versão(ões) nova(s) baixada(s) — o Iniciar troca as antigas`);
      });

      await rodar('modelos', async (p) => {
        if (!(await ollamaOnline())) return { estado: 'pulado', mensagem: 'Sem o motor de IA não é possível baixar modelos' };
        // Recalcula: o Ollama pode ter acabado de ser instalado.
        const st = await statusOllama();
        const tem = (n) => st.modelos.some((m) => semTag(m.nome) === semTag(n));
        const todosFaltam = [ctx.config.modeloChat, ctx.config.modeloEmbed].filter((n) => n && !tem(n));
        const faltam = todosFaltam.filter((n) => quer('modelo', n));
        if (!faltam.length) return todosFaltam.length ? NAO_ESCOLHIDO : { mensagem: 'Os modelos escolhidos já estão instalados' };
        const res = await aguardarVarias(p, faltam.map((n) => ctx.baixarModeloTarefa(n)), 'Baixando modelos');
        return resultadoTarefas(res, [], (n) => `${n} modelo(s) baixado(s)`);
      });

      await rodar('leitor', async (p) => {
        if (await existe(caminhoKiwixServe())) return { mensagem: 'Já está instalado' };
        const cat = await carregarCatalogo();
        const precisa =
          (await bib.listar()).some((i) => i.tipo === 'zim') ||
          (await pacotes.pendentes()).some((x) => x.registro.tipo === 'zim') ||
          (ctx.config.itens || []).some((id) => cat.itens.find((i) => i.id === id)?.tipo === 'zim');
        if (!precisa) return { estado: 'pulado', mensagem: 'Nenhuma enciclopédia selecionada' };
        if (!quer('kiwix')) return NAO_ESCOLHIDO;
        p.mensagem = 'Baixando o leitor Kiwix…';
        const t = await aguardarTarefa(criarTarefa({ tipo: 'ferramenta', titulo: 'Leitor Kiwix (Wikipédia offline)', chave: 'ferramenta:kiwix', fn: instalarKiwix }));
        if (t.estado !== 'concluido') {
          if (sinal.aborted) return { estado: 'pulado', mensagem: 'Cancelado' };
          throw new Error(t.mensagem);
        }
        baixou++;
        return { mensagem: 'Instalado' };
      });

      await rodar('programa', async (p) => {
        if (!quer('programa')) return NAO_ESCOLHIDO;
        const git = await estadoGit({ buscar: false }).catch((e) => ({ erro: e.message }));
        if (!git) {
          // Instalado pelo ZIP: baixa do GitHub só os arquivos que mudaram.
          if (reinicioPendente) return { estado: 'aviso', mensagem: 'A versão nova já foi instalada. Clique em "Reiniciar agora" para usar.' };
          p.mensagem = 'Procurando versão nova do programa…';
          const v = await programa.verificar(sinal);
          if (v.atualizado) return { mensagem: 'Na versão mais recente' };
          const r = await programa.atualizar({ sinal, aoProgresso: (x) => (p.mensagem = `Baixando a versão nova: arquivo ${x.n} de ${x.total}…`) });
          reinicioPendente = true;
          if (ultima?.remotas) ultima.remotas = ultima.remotas.filter((x) => x.tipo !== 'programa');
          return { estado: 'aviso', mensagem: `Versão nova instalada (${r.trocados + r.apagados} arquivo(s)). Clique em "Reiniciar agora" para usar.` };
        }
        if (git.erro) throw new Error(git.erro);
        if (!git.atras) return { mensagem: 'Na versão mais recente' };
        if (!git.limpo) return { estado: 'aviso', mensagem: `Há ${git.atras} melhoria(s), mas os arquivos do programa foram modificados neste computador; a atualização automática foi pulada para não perder suas mudanças.` };
        p.mensagem = 'Baixando a versão nova do programa…';
        await executarCmd('git', ['pull', '--ff-only', '--quiet'], { cwd: RAIZ, timeout: 180000 });
        reinicioPendente = true;
        if (ultima?.remotas) ultima.remotas = ultima.remotas.filter((r) => r.tipo !== 'programa');
        return { estado: 'aviso', mensagem: `${git.atras} melhoria(s) baixada(s). Clique em "Reiniciar agora" para usar a versão nova.` };
      });

      rel.baixou = baixou;
    },
    {
      aoTerminar: (rel) => {
        // Baixou algo? Já descompacta e configura (Iniciar), sem precisar de outro clique.
        if (rel.estado === 'concluido' && rel.baixou > 0) {
          try {
            ctx.iniciar();
          } catch (e) {
            registrarErro('atualizar/iniciar', e);
          }
        }
        verificarAtualizacoes(ctx.config, { semRede: true }).catch(() => {});
      },
    }
  );
}
