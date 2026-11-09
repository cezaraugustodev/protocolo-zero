// Shell da aplicação: navegação, estado global e atualização periódica.
import { h, icone, toast } from './ui.js';
import { api, servidorFechado } from './api.js';
import { iniciarIndexador, statusIndexador } from './indexador.js';
import * as inicio from './telas/inicio.js';
import * as configurar from './telas/configurar.js';
import * as primeiroUso from './telas/primeiro-uso.js';
import * as biblioteca from './telas/biblioteca.js';
import * as leitor from './telas/leitor.js';
import * as documento from './telas/documento.js';
import * as assistente from './telas/assistente.js';
import * as alimentar from './telas/alimentar.js';
import * as mapas from './telas/mapas.js';
import * as estoque from './telas/estoque.js';
import * as nutricao from './telas/nutricao.js';
import * as arquivo from './telas/arquivo.js';
import * as transferencias from './telas/transferencias.js';
import * as ajustes from './telas/ajustes.js';
import * as emergencia from './telas/emergencia.js';
import * as copiar from './telas/copiar.js';

export const estado = { servidor: null, tarefas: [], ouvintes: new Set() };

const TELAS = {
  inicio: { tela: inicio, nome: 'Início', icone: 'inicio' },
  emergencia: { tela: emergencia, nome: 'Iniciar Protocolo Zero', icone: 'play', emergencia: true },
  configurar: { tela: configurar, nome: 'Instalar conteúdo', icone: 'baixar', destaque: true },
  biblioteca: { tela: biblioteca, nome: 'Biblioteca', icone: 'livro' },
  ler: { tela: documento, nome: 'Leitor', icone: 'livro', oculta: true },
  'primeiro-uso': { tela: primeiroUso, nome: 'Configurando', icone: 'ajustes', oculta: true, cheia: true },
  assistente: { tela: assistente, nome: 'Assistente', icone: 'chat' },
  enciclopedia: { tela: leitor, nome: 'Enciclopédias', icone: 'globo' },
  mapas: { tela: mapas, nome: 'Mapas', icone: 'mapa' },
  estoque: { tela: estoque, nome: 'Estoque de emergência', icone: 'pacote' },
  nutricao: { tela: nutricao, nome: 'Saúde e nutrição', icone: 'coracao' },
  arquivo: { tela: arquivo, nome: 'Internet Archive', icone: 'nuvem', grupo: 'Gerenciar' },
  alimentar: { tela: alimentar, nome: 'Alimentar biblioteca', icone: 'enviar', grupo: 'Gerenciar' },
  copiar: { tela: copiar, nome: 'Copiar para outro disco', icone: 'copiar', grupo: 'Gerenciar' },
  transferencias: { tela: transferencias, nome: 'Transferências', icone: 'atualizar', grupo: 'Gerenciar' },
  ajustes: { tela: ajustes, nome: 'Ajustes', icone: 'ajustes', grupo: 'Gerenciar' },
};

let telaAtual = null;
let limparTela = null;

export const navegar = (rota) => (location.hash = `#/${rota}`);
export const aoAtualizar = (fn) => {
  estado.ouvintes.add(fn);
  return () => estado.ouvintes.delete(fn);
};

function renderizarNav() {
  const nav = document.getElementById('nav');
  nav.replaceChildren();
  const ativas = estado.tarefas.filter((t) => t.estado === 'ativo' || t.estado === 'fila').length;
  let grupo = null;
  for (const [id, t] of Object.entries(TELAS)) {
    if (t.oculta) continue;
    if (t.grupo && t.grupo !== grupo) {
      grupo = t.grupo;
      nav.append(h('div', { class: 'nav-titulo' }, grupo));
    }
    nav.append(
      h('a', { href: `#/${id}`, class: `${telaAtual === id ? 'ativo' : ''} ${t.destaque ? 'destaque' : ''} ${t.emergencia ? 'nav-emergencia' : ''}`, title: t.nome },
        icone(t.icone, 19), h('span', { class: 'nav-nome' }, t.nome),
        id === 'transferencias' && ativas ? h('span', { class: 'contador' }, ativas) : null)
    );
  }
}

function renderizarRodape() {
  const s = estado.servidor;
  const el = document.getElementById('lateral-rodape');
  if (!s) return;
  const idx = statusIndexador();
  el.replaceChildren(...[
    h('div', { class: 'pilula-status' }, h('i', { class: `ponto ${s.ollama.online ? 'ok' : 'erro'}` }), s.ollama.online ? 'IA ligada (sem internet)' : 'IA desligada'),
    h('div', { class: 'pilula-status' }, h('i', { class: `ponto ${s.kiwix.ativo ? 'ok' : ''}` }), s.kiwix.ativo ? `${s.kiwix.livros.length} enciclopédia(s) abertas` : 'Enciclopédias: nenhuma'),
    idx.ativo ? h('div', { class: 'pilula-status' }, h('i', { class: 'ponto alerta pulsa' }), `Lendo PDF: ${idx.titulo}`) : null,
    s.pacotes?.pendentes
      ? h('a', { class: 'pilula-status link', href: '#/inicio' }, h('i', { class: 'ponto alerta pulsa' }), `${s.pacotes.pendentes} pacote(s) para descompactar — Iniciar`)
      : null,
    s.atualizacoes?.quantidade
      ? h('a', { class: 'pilula-status link', href: '#/inicio/atualizar' }, h('i', { class: 'ponto ceu' }), `${s.atualizacoes.quantidade} atualização(ões) disponível(is)`)
      : null,
    h('div', { class: 'pilula-status' }, h('i', { class: 'ponto' }), `Livre no disco: ${(s.disco.livre / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} GB`),
  ].filter(Boolean));
}

let telaComErroDeServidor = false;
async function atualizarEstado() {
  try {
    estado.servidor = await api.get('/api/estado');
    // O servidor voltou: recarrega a tela que tinha falhado.
    if (telaComErroDeServidor) {
      telaComErroDeServidor = false;
      mostrar();
    }
    renderizarRodape();
    estado.ouvintes.forEach((f) => f('estado'));
  } catch {
    document.getElementById('lateral-rodape').replaceChildren(
      h('div', { class: 'pilula-status' }, h('i', { class: 'ponto erro' }), 'Servidor fechado — rode npm start')
    );
  }
}

async function atualizarTarefas() {
  try {
    estado.tarefas = await api.get('/api/tarefas');
    renderizarNav();
    estado.ouvintes.forEach((f) => f('tarefas'));
  } catch {}
}

let geracaoTela = 0;
async function mostrar() {
  const [rota, ...resto] = (location.hash.replace(/^#\/?/, '') || 'inicio').split('/');
  const id = TELAS[rota] ? rota : 'inicio';
  if (limparTela) limparTela();
  limparTela = null;
  // No Assistente o menu recolhe sozinho (mais espaço para a conversa); nas outras telas volta à preferência.
  if (id !== telaAtual) definirMenuRecolhido(id === 'assistente' ? true : menuPreferido(), false);
  telaAtual = id;
  // Tela cheia (primeiro uso): sem menu lateral.
  document.querySelector('.app').classList.toggle('tela-cheia', !!TELAS[id].cheia);
  renderizarNav();
  document.getElementById('lateral').classList.remove('aberta');
  const principal = document.getElementById('principal');
  principal.replaceChildren();
  const conteudo = h('div', { class: 'conteudo' });
  principal.append(conteudo);
  const geracao = ++geracaoTela;
  try {
    const r = await TELAS[id].tela.render(conteudo, { args: resto.map(decodeURIComponent), estado });
    // Se outra tela foi aberta enquanto esta carregava, descarta esta (evita timers órfãos).
    if (geracao !== geracaoTela) {
      if (typeof r === 'function') r();
      return;
    }
    if (typeof r === 'function') limparTela = r;
  } catch (e) {
    console.error(e);
    if (geracao !== geracaoTela) return;
    if (servidorFechado(e)) {
      telaComErroDeServidor = true;
      conteudo.append(h('div', { class: 'aviso erro' }, icone('alerta'),
        h('div', {}, h('b', {}, 'O servidor do Protocolo Zero está fechado. '),
          'Abra o terminal na pasta do projeto e rode ', h('code', {}, 'npm start'), '. Esta tela recarrega sozinha quando ele voltar. ',
          h('button', { class: 'botao pequeno', onclick: mostrar }, 'Tentar de novo'))));
    } else conteudo.append(h('div', { class: 'aviso erro' }, `Erro ao abrir esta tela: ${e.message}`));
  }
  document.title = `${TELAS[id].nome} · Protocolo Zero`;
  principal.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function aplicarTema() {
  let tema = null;
  try {
    tema = localStorage.getItem('pz-tema');
  } catch {}
  if (tema) document.documentElement.dataset.tema = tema;
}

// Menu lateral recolhido (só ícones) ou expandido. A escolha do botão fica guardada neste navegador.
function menuPreferido() {
  try {
    return localStorage.getItem('pz-menu') === 'recolhido';
  } catch {
    return false;
  }
}
function definirMenuRecolhido(recolhido, guardar) {
  document.querySelector('.app').classList.toggle('menu-recolhido', recolhido);
  const b = document.getElementById('recolher-menu');
  const rotulo = recolhido ? 'Expandir menu' : 'Recolher menu';
  b.setAttribute('aria-label', rotulo);
  b.setAttribute('title', rotulo);
  b.setAttribute('aria-expanded', String(!recolhido));
  // No Assistente o recolher é automático: o botão vale só para esta visita.
  if (guardar && telaAtual !== 'assistente') {
    try {
      localStorage.setItem('pz-menu', recolhido ? 'recolhido' : 'expandido');
    } catch {}
  }
}

async function iniciar() {
  aplicarTema();
  definirMenuRecolhido(menuPreferido(), false);
  document.getElementById('recolher-menu').addEventListener('click', () =>
    definirMenuRecolhido(!document.querySelector('.app').classList.contains('menu-recolhido'), true));
  document.getElementById('abrir-menu').addEventListener('click', () => document.getElementById('lateral').classList.toggle('aberta'));
  await atualizarEstado();
  await atualizarTarefas();
  // Primeira vez: configura tudo sozinho, com a tela "Configurando o Protocolo Zero".
  if ((!location.hash || location.hash === '#/inicio') && estado.servidor && !estado.servidor.config.configurado) location.hash = '#/primeiro-uso';
  window.addEventListener('hashchange', mostrar);
  await mostrar();
  setInterval(atualizarEstado, 6000);
  // Tarefas: rápido quando há algo rodando, devagar quando não.
  const ciclo = async () => {
    await atualizarTarefas();
    const ativo = estado.tarefas.some((t) => t.estado === 'ativo' || t.estado === 'fila');
    setTimeout(ciclo, ativo ? 1200 : 5000);
  };
  setTimeout(ciclo, 1200);
  iniciarIndexador({ aoMudar: renderizarRodape });
  avisarAtualizacaoAutomatica();
}

// Conta uma vez o que a atualização automática (ao ligar o computador) fez.
async function avisarAtualizacaoAutomatica() {
  try {
    const { ultimo: u } = await api.get('/api/auto');
    if (!u || u.visto !== false || u.estado === 'sem-internet') return;
    await api.post('/api/auto/visto');
    if (!u.baixou && !u.novos?.length && !u.modelo && u.estado === 'ok') return;
    const quando = new Date(u.fim).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    toast(u.estado === 'erro' ? `A atualização automática de ${quando} teve problemas. Veja em Ajustes.` : `Atualizado sozinho em ${quando}${u.baixou ? `: ${u.baixou} fonte(s) nova(s) na biblioteca` : u.novos?.length ? `: ${u.novos.length} fonte(s) nova(s) em Instalar conteúdo` : ''}${u.modelo ? `. ${u.modelo}` : ''}.`, u.estado === 'erro' ? 'erro' : undefined);
  } catch {}
}

iniciar();
