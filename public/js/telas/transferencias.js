import { h, icone, bytes, barra, tempo, cabecalho, toast } from '../ui.js';
import { api } from '../api.js';
import { aoAtualizar } from '../app.js';

const ICONES = { download: 'baixar', modelo: 'cerebro', mapa: 'mapa', ferramenta: 'chip', indice: 'busca' };
const ROTULO = { fila: ['Na fila', ''], ativo: ['Em andamento', 'brasa'], concluido: ['Concluído', 'musgo'], erro: ['Erro', 'perigo'], cancelado: ['Cancelado', 'alerta'] };

export async function render(raiz, { estado }) {
  raiz.append(cabecalho('Progresso', 'Transferências', 'Downloads, modelos de IA, mapas e preparação da busca. Pode fechar esta página: tudo continua no servidor local.',
    h('button', { class: 'botao', onclick: async () => { await api.post('/api/tarefas/limpar'); toast('Lista limpa.'); } }, 'Limpar concluídas')));
  const resumo = h('div', { style: { marginBottom: '14px' } });
  const lista = h('div', { class: 'cartao', style: { padding: 0 } });
  raiz.append(resumo, lista);

  const velocidades = new Map(); // id -> { baixado, quando, bps }

  function desenhar() {
    const t = estado.tarefas;
    const ativas = t.filter((x) => x.estado === 'ativo' || x.estado === 'fila');
    const totalFalta = ativas.reduce((a, x) => a + (x.unidade ? 0 : Math.max(0, (x.total || 0) - (x.baixado || 0))), 0);
    resumo.replaceChildren(
      ativas.length
        ? h('div', { class: 'linha' }, h('span', { class: 'ponto alerta pulsa' }), h('b', {}, `${ativas.length} tarefa(s) em andamento`), totalFalta ? h('span', { class: 'suave' }, `· faltam ${bytes(totalFalta)}`) : null)
        : t.length ? h('div', { class: 'linha' }, h('span', { class: 'ponto ok' }), h('b', {}, 'Tudo pronto.'), h('a', { href: '#/biblioteca' }, 'Abrir biblioteca')) : null
    );
    if (!t.length) {
      lista.replaceChildren(h('div', { class: 'vazio' }, icone('atualizar', 44), h('p', {}, 'Nenhuma transferência no momento.'), h('a', { class: 'botao primario', href: '#/configurar' }, 'Instalar conteúdo')));
      return;
    }
    lista.replaceChildren(
      ...t.map((x) => {
        const [rot, cor] = ROTULO[x.estado] || [x.estado, ''];
        const fracao = x.total ? Math.min(1, x.baixado / x.total) : x.estado === 'concluido' ? 1 : null;
        // velocidade média móvel
        let det = [];
        if (x.estado === 'ativo' && x.total && !x.unidade) {
          const v = velocidades.get(x.id);
          const agora = Date.now();
          if (v && agora > v.quando) {
            const inst = ((x.baixado - v.baixado) * 1000) / (agora - v.quando);
            v.bps = v.bps ? v.bps * 0.7 + inst * 0.3 : inst;
            v.baixado = x.baixado;
            v.quando = agora;
          } else if (!v) velocidades.set(x.id, { baixado: x.baixado, quando: agora, bps: 0 });
          const bps = velocidades.get(x.id).bps;
          det = [`${bytes(x.baixado)} de ${bytes(x.total)}`, bps > 0 ? `${bytes(bps)}/s` : null, bps > 0 ? `≈ ${tempo(((x.total - x.baixado) / bps) * 1000)} restantes` : null];
        } else if (x.estado === 'ativo' && x.unidade === '%') det = [`${x.baixado}%`];
        else if (x.estado === 'ativo' && x.total) det = [`${x.baixado} de ${x.total}`];
        if (x.fim && x.inicio) det.push(`levou ${tempo(x.fim - x.inicio)}`);
        return h('div', { class: 'tarefa' },
          h('span', { class: `icone-bolha ${cor === 'musgo' ? 'musgo' : cor === 'perigo' ? 'alerta' : ''}` }, icone(ICONES[x.tipo] || 'baixar', 18)),
          h('div', { class: 'info' },
            h('div', { class: 'linha' }, h('span', { class: 'titulo' }, x.titulo), h('span', { class: `etiqueta ${cor}` }, rot)),
            x.estado === 'ativo' || x.estado === 'fila' ? barra(x.estado === 'fila' ? 0 : fracao) : null,
            h('div', { class: 'det' }, h('span', {}, x.mensagem), ...det.filter(Boolean).map((d) => h('span', {}, d)))),
          x.estado === 'ativo' || x.estado === 'fila'
            ? h('button', { class: 'botao pequeno', onclick: () => api.post(`/api/tarefas/${x.id}/cancelar`) }, 'Cancelar')
            : x.estado === 'erro' || x.estado === 'cancelado'
              ? botaoRepetir(x)
              : h('span'));
      })
    );
  }

  // Tenta de novo só aquele arquivo, aqui mesmo (sem ir para Instalar conteúdo).
  function botaoRepetir(x) {
    const b = h('button', { class: 'botao pequeno', onclick: async () => {
      b.disabled = true;
      b.textContent = 'Tentando…';
      try {
        await api.post(`/api/tarefas/${x.id}/repetir`);
        velocidades.delete(x.id);
        toast(`Tentando de novo: ${x.titulo}`);
      } catch (e) {
        toast(e.message, 'erro');
        b.disabled = false;
        b.textContent = 'Tentar de novo';
      }
    } }, 'Tentar de novo');
    return b;
  }

  desenhar();
  return aoAtualizar((tipo) => tipo === 'tarefas' && desenhar());
}
