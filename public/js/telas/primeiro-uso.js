// "Configurando o Protocolo Zero": tela cheia do primeiro uso. O servidor faz tudo sozinho
// (detecta o computador, escolhe e baixa a IA, baixa a biblioteca essencial e prepara);
// esta tela só mostra cada passo com um carregador até terminar.
import { h, icone, barra } from '../ui.js';
import { api } from '../api.js';
import { navegar } from '../app.js';

const ICONE_ESTADO = { ok: 'ok', aviso: 'alerta', erro: 'alerta', pulado: 'info' };

export async function render(raiz) {
  raiz.classList.add('pu-raiz');
  const caixa = h('div', { class: 'pu-caixa' });
  raiz.append(caixa);

  let estado = await api.get('/api/primeiro-uso');
  if (estado.estado === 'parado') {
    if (estado.configurado) return navegar('inicio');
    estado = await api.post('/api/primeiro-uso');
  }

  function desenhar(pu) {
    const atual = pu.etapas?.find((e) => e.estado === 'rodando');
    const feitas = pu.etapas?.filter((e) => !['pendente', 'rodando'].includes(e.estado)).length || 0;
    const total = pu.etapas?.length || 1;
    const terminou = pu.estado === 'concluido' || pu.estado === 'erro';
    const avisos = (pu.etapas || []).filter((e) => ['aviso', 'erro'].includes(e.estado));

    caixa.replaceChildren(
      h('img', { src: '/icone.svg', alt: '', class: 'pu-logo' }),
      h('h1', {}, terminou ? (pu.estado === 'erro' && !avisos.length ? 'Algo deu errado' : 'Tudo pronto!') : 'Configurando o Protocolo Zero'),
      h('p', { class: 'suave' }, terminou
        ? 'O Protocolo Zero já funciona sem internet. Você pode baixar mais livros, enciclopédias e mapas quando quiser em "Instalar conteúdo".'
        : 'Pode levar bastante tempo, conforme a sua internet. Você pode usar outras telas enquanto isso: os downloads continuam e aparecem em "Transferências".'),

      !terminou
        ? h('div', { class: 'pu-atual' },
            h('div', { class: 'pu-loader', 'aria-hidden': 'true' }),
            h('div', { class: 'pu-atual-texto' },
              h('b', {}, atual?.titulo || 'Começando…'),
              h('small', { class: 'suave' }, atual?.mensagem || '')),
            barra(atual?.fracao ?? null),
            h('small', { class: 'suave pu-contador' }, `Passo ${Math.min(feitas + 1, total)} de ${total}`))
        : null,

      h('ol', { class: 'pu-etapas' },
        (pu.etapas || []).map((e) =>
          h('li', { class: `pu-etapa ${e.estado}` },
            h('span', { class: 'pu-marca' }, e.estado === 'rodando' ? h('span', { class: 'pu-mini-loader' }) : ICONE_ESTADO[e.estado] ? icone(ICONE_ESTADO[e.estado], 16) : h('span', { class: 'pu-ponto' })),
            h('div', {}, h('div', {}, e.titulo), e.mensagem && e.estado !== 'rodando' ? h('small', { class: 'suave' }, e.mensagem) : null)))),

      pu.erro ? h('div', { class: 'aviso erro' }, icone('alerta'), h('div', {}, pu.erro)) : null,

      terminou
        ? h('div', { class: 'linha', style: { justifyContent: 'center', flexWrap: 'wrap' } },
            pu.etapas?.some((e) => e.estado === 'erro') || pu.erro
              ? h('button', { class: 'botao', onclick: async () => desenhar(await api.post('/api/primeiro-uso')) }, icone('atualizar', 16), 'Tentar de novo')
              : null,
            h('button', { class: 'botao primario grande', onclick: () => navegar('inicio') }, 'Começar a usar'))
        : h('a', { class: 'pu-link suave', href: '#/configurar' }, 'Prefiro escolher o que baixar'));
  }

  desenhar(estado);
  let parado = false;
  const ciclo = async () => {
    if (parado) return;
    try {
      const pu = await api.get('/api/primeiro-uso');
      desenhar(pu);
      if (pu.estado !== 'rodando') return;
    } catch {}
    setTimeout(ciclo, 1000);
  };
  setTimeout(ciclo, 1000);
  return () => { parado = true; };
}
