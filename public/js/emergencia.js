// Escolha da emergência atual (pode marcar várias). Usado no "Iniciar Protocolo Zero" e na tela "Emergência agora".
import { h, icone, modal } from './ui.js';
import { api } from './api.js';
import { EMERGENCIAS, GRUPOS_EMERGENCIA } from './emergencias-dados.js';

export const lerEmergencia = () => api.get('/api/emergencia').catch(() => ({ ativas: [] }));
export const salvarEmergencia = (ativas) => api.put('/api/emergencia', { ativas });

/** Grade de botões para marcar emergências. `marcadas` é um Set que é alterado no lugar. */
export function gradeEmergencias(marcadas, aoMudar = () => {}) {
  const grade = h('div', { class: 'pilha' });
  const desenhar = () => grade.replaceChildren(...GRUPOS_EMERGENCIA.map(([g, nome]) =>
    h('div', {},
      h('div', { class: 'sobretitulo', style: { marginBottom: '6px' } }, nome),
      h('div', { class: 'emerg-opcoes' },
        EMERGENCIAS.filter((e) => e.grupo === g).map((e) => {
          const on = marcadas.has(e.id);
          return h('button', {
            type: 'button', class: `emerg-opcao ${on ? 'marcada' : ''}`, 'aria-pressed': String(on), title: e.resumo,
            onclick: () => { on ? marcadas.delete(e.id) : marcadas.add(e.id); desenhar(); aoMudar(); },
          }, icone(e.icone, 18), h('span', {}, e.nome), on ? icone('ok', 14) : null);
        })))));
  desenhar();
  return grade;
}

/**
 * Pergunta qual é a emergência agora. Resolve com { ativas } (pode ser lista vazia = nenhuma)
 * ou null se o usuário fechou sem escolher.
 */
export async function perguntarEmergencia({ titulo = 'Qual é a emergência agora?', confirmar = 'Ver o que fazer' } = {}) {
  const atual = await lerEmergencia();
  const marcadas = new Set(atual.ativas || []);
  return new Promise((resolve) => {
    let respondeu = false;
    const responder = (v) => {
      respondeu = true;
      fechar();
      resolve(v);
    };
    const botaoOk = h('button', { class: 'botao primario', onclick: () => responder({ ativas: [...marcadas] }) });
    const atualizarBotao = () => {
      botaoOk.replaceChildren(icone('sirene', 16), marcadas.size ? `${confirmar} (${marcadas.size})` : 'Continuar sem emergência');
    };
    atualizarBotao();
    const fechar0 = modal(
      h('div', { class: 'pilha' },
        h('div', {},
          h('h2', { style: { margin: 0 } }, titulo),
          h('p', { class: 'suave' }, 'Marque uma ou mais. O Protocolo Zero mostra na hora o que fazer e os livros e cartilhas já baixados para cada situação. Você continua podendo consultar qualquer outro assunto.')),
        gradeEmergencias(marcadas, atualizarBotao),
        h('div', { class: 'linha entre', style: { flexWrap: 'wrap', gap: '8px' } },
          h('button', { class: 'botao fantasma', onclick: () => responder({ ativas: [] }) }, 'Nenhuma emergência'),
          botaoOk)),
      { largura: 860 });
    // Fechou no X, Esc ou clicando fora: não muda nada.
    const obs = new MutationObserver(() => {
      if (!document.body.contains(document.querySelector('.emerg-opcoes'))) {
        obs.disconnect();
        if (!respondeu) resolve(null);
      }
    });
    obs.observe(document.body, { childList: true });
    const fechar = () => { obs.disconnect(); fechar0(); };
  });
}
