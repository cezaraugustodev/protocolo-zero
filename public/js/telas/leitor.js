// Leitor das enciclopédias offline (Wikipédia, iFixit, TED…) servidas pelo kiwix-serve.
import { h, icone, aviso, cabecalho } from '../ui.js';
import { caixaTraducao } from '../traduzir.js';

export async function render(raiz, { args, estado }) {
  const k = estado.servidor?.kiwix;
  if (!k?.ativo || !k.livros.length) {
    raiz.append(
      cabecalho('Leitor', 'Enciclopédias', 'Wikipédia, guias de reparo iFixit, livros e vídeos com legendas, tudo offline.'),
      h('div', { class: 'vazio cartao' }, icone('globo', 48),
        h('h3', {}, k?.instalado ? 'Nenhuma enciclopédia baixada ainda' : 'O leitor ainda não está instalado'),
        h('p', {}, 'Escolha a Wikipédia e outros acervos na instalação de conteúdo.'),
        h('a', { class: 'botao primario', href: '#/configurar' }, 'Instalar conteúdo'))
    );
    return;
  }

  const base = k.url;
  let destino = `${base}/`;
  const [primeiro] = args;
  if (primeiro?.startsWith('link/')) destino = base + primeiro.slice(4);
  else if (primeiro) destino = `${base}/content/${encodeURIComponent(primeiro)}`;
  let caminhoAtual = destino.slice(base.length) || '/';

  const quadro = h('iframe', { src: destino, title: 'Leitor de enciclopédias', referrerpolicy: 'no-referrer' });
  const seletor = h('select', { style: { width: 'auto', minWidth: '240px' }, onchange: (e) => (quadro.src = e.target.value ? `${base}/content/${e.target.value}` : `${base}/`) },
    h('option', { value: '' }, 'Todas as enciclopédias'),
    k.livros.map((l) => h('option', { value: l.nome, selected: l.nome === primeiro }, l.titulo)));

  const trad = caixaTraducao();
  const painel = h('aside', { class: 'cartao leitor-traducao', hidden: true });
  raiz.style.maxWidth = 'none';
  raiz.append(
    h('div', { class: 'leitor' },
      h('div', { class: 'linha entre' },
        h('div', { class: 'linha' }, h('h2', { style: { margin: 0 } }, 'Enciclopédias'), seletor),
        h('div', { class: 'linha' },
          h('button', { class: 'botao pequeno primario', title: 'Traduzir esta página para o português com a IA do computador', onclick: traduzirPagina }, 'Traduzir'),
          h('a', { class: 'botao pequeno', href: quadro.src, target: '_blank', rel: 'noopener', onclick: (e) => (e.currentTarget.href = base + caminhoAtual) }, icone('abrir', 14), 'Abrir em nova aba'))),
      h('div', { class: 'leitor-corpo' }, quadro, painel))
  );

  // A página da enciclopédia roda isolada (outra porta). A "ponte" do servidor entrega só o texto dela.
  const origemKiwix = new URL(base, location.href).origin;
  let esperando = null;
  const aoMensagem = (e) => {
    if (e.origin !== origemKiwix || e.source !== quadro.contentWindow) return;
    if (e.data?.pz === 'pagina') caminhoAtual = e.data.caminho;
    if (e.data?.pz === 'texto' && esperando) { esperando(e.data); esperando = null; }
  };
  window.addEventListener('message', aoMensagem);

  function traduzirPagina() {
    painel.hidden = false;
    painel.replaceChildren(
      h('div', { class: 'linha entre' }, h('b', {}, 'Tradução'), h('button', { class: 'botao botao-icone fantasma', 'aria-label': 'Fechar tradução', onclick: () => { trad.parar(); painel.hidden = true; } }, icone('x'))),
      trad.elemento);
    const tempo = setTimeout(() => { esperando = null; trad.traduzir(''); }, 4000);
    esperando = (d) => { clearTimeout(tempo); trad.traduzir(d.texto); };
    quadro.contentWindow?.postMessage({ pz: 'pedirTexto' }, origemKiwix);
  }
  if (!navigator.onLine) raiz.prepend(aviso('info', 'Você está sem internet — e tudo aqui continua funcionando.'));
  return () => { trad.parar(); window.removeEventListener('message', aoMensagem); };
}
