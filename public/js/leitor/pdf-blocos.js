// Blocos de texto de uma página de PDF (para a tradução aparecer no lugar do original) e cores tiradas da página.

/** Impressão curta do texto original: a tradução guardada só vale para o mesmo trecho. */
export function impressao(texto) {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) h1 = Math.imul(h1 ^ texto.charCodeAt(i), 16777619);
  return (h1 >>> 0).toString(36) + texto.length.toString(36);
}

/**
 * Junta os pedaços de texto de uma página de PDF (pdf.js) em blocos (parágrafos, títulos, legendas),
 * guardando onde cada bloco fica na página, para a tradução aparecer no mesmo lugar do original.
 */
export function blocosDaPaginaPdf(conteudo, vp, Util) {
  const linhas = [];
  let linha = null;
  for (const item of conteudo.items) {
    if (typeof item.str !== 'string') continue;
    const t = Util.transform(vp.transform, item.transform);
    const tam = Math.hypot(t[2], t[3]);
    const horizontal = tam > 0 && Math.abs(t[1]) < tam * 0.05 && Math.abs(t[2]) < tam * 0.05;
    if (!item.str.trim() || !horizontal) {
      if (linha) linha.espaco = true;
      if (item.hasEOL && linha) linha.fim = true;
      continue;
    }
    const x = t[4];
    const base = t[5];
    const larg = item.width * vp.scale;
    const nova = !linha || linha.fim || Math.abs(base - linha.base) > tam * 0.5
      || x < linha.dir - tam * 0.5 || x - linha.dir > tam * 2.5;
    if (nova) {
      linha = { esq: x, dir: x + larg, base, tam, texto: item.str };
      linhas.push(linha);
    } else {
      const separa = (linha.espaco || x - linha.dir > tam * 0.15) && !/\s$/.test(linha.texto) && !/^\s/.test(item.str);
      linha.texto += (separa ? ' ' : '') + item.str;
      linha.dir = Math.max(linha.dir, x + larg);
      linha.tam = Math.max(linha.tam, tam);
    }
    linha.espaco = false;
    if (item.hasEOL) linha.fim = true;
  }

  const blocos = [];
  let b = null;
  for (const l of linhas) {
    const texto = l.texto.replace(/\s+/g, ' ').trim();
    if (!texto) continue;
    const topo = l.base - l.tam * 0.92;
    const fundo = l.base + l.tam * 0.28;
    const ultima = b?.linhas[b.linhas.length - 1];
    const junta = b && Math.abs(l.tam - b.tam) <= b.tam * 0.2 && topo > ultima.topo
      && topo - ultima.fundo < b.tam * 0.8 && l.esq < b.dir + b.tam && l.dir > b.esq - b.tam && b.texto.length < 1500;
    if (!junta) {
      b = { linhas: [], esq: l.esq, dir: l.dir, topo, fundo, tam: l.tam, texto: '' };
      blocos.push(b);
    }
    // Palavra quebrada com hífen no fim da linha volta a ficar inteira; item de lista começa em linha nova.
    b.texto = !b.texto ? texto
      : /^([•●▪◦■□➢►✓✔–—−-]|\d{1,2}[.)]|[a-z][.)])\s/u.test(texto) ? `${b.texto}\n${texto}`
        : /\p{L}-$/u.test(b.texto) && /^\p{Ll}/u.test(texto) ? b.texto.slice(0, -1) + texto : `${b.texto} ${texto}`;
    b.linhas.push({ topo, fundo });
    b.esq = Math.min(b.esq, l.esq);
    b.dir = Math.max(b.dir, l.dir);
    b.topo = Math.min(b.topo, topo);
    b.fundo = Math.max(b.fundo, fundo);
  }

  const lim = (v) => Math.min(1, Math.max(0, v));
  return blocos.filter((x) => /\p{L}/u.test(x.texto)).map((x) => {
    const m = x.tam * 0.12;
    const esq = lim((x.esq - m) / vp.width);
    const topo = lim((x.topo - m) / vp.height);
    return {
      tipo: 'paragrafo',
      texto: x.texto,
      chave: impressao(x.texto),
      fonte: x.tam / vp.height,
      caixa: { x: esq, y: topo, w: lim((x.dir + m) / vp.width) - esq, h: lim((x.fundo + m) / vp.height) - topo },
    };
  });
}

/** Cor do fundo em volta do bloco (mediana da borda) e uma cor de letra que dê para ler sobre ela. */
export function coresDoBloco(ctx, largura, altura, caixa) {
  const x0 = Math.max(0, Math.floor(caixa.x * largura));
  const y0 = Math.max(0, Math.floor(caixa.y * altura));
  const w = Math.max(1, Math.min(largura, Math.ceil((caixa.x + caixa.w) * largura)) - x0);
  const hh = Math.max(1, Math.min(altura, Math.ceil((caixa.y + caixa.h) * altura)) - y0);
  let px;
  try {
    px = ctx.getImageData(x0, y0, w, hh).data;
  } catch {
    return { fundo: '#fff', letra: '#111' };
  }
  const canais = [[], [], []];
  const pegar = (x, y) => {
    const i = (y * w + x) * 4;
    canais[0].push(px[i]);
    canais[1].push(px[i + 1]);
    canais[2].push(px[i + 2]);
  };
  const passo = Math.max(1, Math.floor((w + hh) / 200));
  for (let x = 0; x < w; x += passo) { pegar(x, 0); pegar(x, hh - 1); }
  for (let y = 0; y < hh; y += passo) { pegar(0, y); pegar(w - 1, y); }
  const [r, g, bl] = canais.map((c) => c.sort((a, z) => a - z)[c.length >> 1] ?? 255);
  const luz = (cr, cg, cb) => 0.2126 * cr + 0.7152 * cg + 0.0722 * cb;
  // Cor da letra: média dos pontos de dentro do bloco mais diferentes do fundo (as letras do original).
  const dentro = [];
  const passoD = Math.max(1, Math.floor(Math.sqrt((w * hh) / 6000)));
  for (let y = 0; y < hh; y += passoD) {
    for (let x = 0; x < w; x += passoD) {
      const i = (y * w + x) * 4;
      const d = Math.abs(px[i] - r) + Math.abs(px[i + 1] - g) + Math.abs(px[i + 2] - bl);
      if (d > 120) dentro.push([d, px[i], px[i + 1], px[i + 2]]);
    }
  }
  let letra = luz(r, g, bl) > 140 ? '#111' : '#f5f5f5';
  if (dentro.length >= 5) {
    dentro.sort((a, z) => z[0] - a[0]);
    const topo = dentro.slice(0, Math.max(5, Math.floor(dentro.length * 0.3)));
    const m = [1, 2, 3].map((k) => Math.round(topo.reduce((s, p) => s + p[k], 0) / topo.length));
    if (Math.abs(luz(...m) - luz(r, g, bl)) > 90) letra = `rgb(${m[0]}, ${m[1]}, ${m[2]})`;
  }
  return { fundo: `rgb(${r}, ${g}, ${bl})`, letra };
}
