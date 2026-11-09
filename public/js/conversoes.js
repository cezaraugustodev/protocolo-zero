// Conversão de medidas usadas fora do Brasil (EUA/Reino Unido) para o sistema métrico.
// O texto original não é alterado: a medida fica sublinhada e, ao clicar, um balão mostra o valor
// original, o fator oficial (Sistema Internacional, adotado no Brasil pelo Inmetro) e a conta.
// A conversão é feita aqui, com fatores fixos — não pela IA, que pode errar contas.
import { h } from './ui.js';

const fmt = (n, casas = 2) => n.toLocaleString('pt-BR', { maximumFractionDigits: n >= 100 ? 0 : n >= 10 ? 1 : casas });

// [padrão da unidade, nome, unidade de destino, fator, fator escrito]
const UNIDADES = [
  ['fl\\.?\\s?oz|fluid ounces?|onças? fluidas?', 'onça fluida (EUA)', 'ml', 29.5735, '1 fl oz = 29,57 ml'],
  ['oz|ounces?|onças?', 'onça (EUA)', 'g', 28.3495, '1 oz = 28,35 g'],
  ['lbs?|pounds?|libras?', 'libra (EUA)', 'kg', 0.453592, '1 lb = 0,4536 kg'],
  ['gal(?:lons?)?|galão|galões', 'galão americano', 'L', 3.78541, '1 galão = 3,785 litros'],
  ['qt|quarts?', 'quarto (EUA)', 'L', 0.946353, '1 quart = 0,946 litro'],
  ['pints?|quartilhos?', 'pint (EUA)', 'ml', 473.176, '1 pint = 473 ml'],
  ['cups?|xícaras? americanas?', 'xícara americana', 'ml', 240, '1 cup = 240 ml (a xícara de medida brasileira também tem 240 ml)'],
  ['tbsp|tablespoons?', 'colher de sopa (EUA)', 'ml', 14.787, '1 tbsp = 14,8 ml (≈ 1 colher de sopa de medida)'],
  ['tsp|teaspoons?', 'colher de chá (EUA)', 'ml', 4.929, '1 tsp = 4,9 ml (≈ 1 colher de chá de medida)'],
  ['grains?', 'grain (medida antiga de farmácia)', 'mg', 64.79891, '1 grain = 64,8 mg'],
  ['sq\\.?\\s?ft|square feet|pés quadrados', 'pé quadrado', 'm²', 0.092903, '1 pé² = 0,0929 m²'],
  ['acres?', 'acre', 'ha', 0.404686, '1 acre = 0,4047 hectare'],
  ['inch(?:es)?|polegadas?', 'polegada', 'cm', 2.54, '1 polegada = 2,54 cm'],
  ['ft|feet|foot|pés(?! de)', 'pé', 'm', 0.3048, '1 pé = 0,3048 m'],
  ['yds?|yards?|jardas?', 'jarda', 'm', 0.9144, '1 jarda = 0,9144 m'],
  ['mph|milhas por hora|miles per hour', 'milha por hora', 'km/h', 1.60934, '1 mph = 1,609 km/h'],
  ['mi|miles?|milhas?', 'milha terrestre', 'km', 1.60934, '1 milha = 1,609 km'],
  ['psi', 'libra por polegada quadrada', 'bar', 0.0689476, '1 psi = 0,0689 bar'],
];
const FAHRENHEIT = '°\\s?F|ºF|graus Fahrenheit|degrees Fahrenheit|Fahrenheit';

const NUM = '(\\d+(?:[.,]\\d+)*(?:\\s\\d+\\/\\d+)?|\\d+\\/\\d+|[½¼¾])';
const PADRAO = new RegExp(
  `${NUM}(?:\\s?(?:-|–|a|to|ou|or)\\s?${NUM})?\\s?(${[FAHRENHEIT, ...UNIDADES.map((u) => u[0])].join('|')})(?![\\p{L}\\d])`,
  'giu',
);

/** Lê números como "2,5", "1,000", "1.5", "1 1/2", "½". */
export function lerNumero(s) {
  s = String(s).trim();
  const fracoes = { '½': 0.5, '¼': 0.25, '¾': 0.75 };
  if (fracoes[s]) return fracoes[s];
  const misto = /^(\d+)\s(\d+)\/(\d+)$/.exec(s);
  if (misto) return Number(misto[1]) + Number(misto[2]) / Number(misto[3]);
  const fr = /^(\d+)\/(\d+)$/.exec(s);
  if (fr) return Number(fr[1]) / Number(fr[2]);
  const temVirgula = s.includes(',');
  const temPonto = s.includes('.');
  if (temVirgula && temPonto) {
    // O último separador é o decimal: "1.234,5" ou "1,234.5".
    const dec = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
    return Number(s.replaceAll(dec === ',' ? '.' : ',', '').replace(dec, '.'));
  }
  const sep = temVirgula ? ',' : temPonto ? '.' : null;
  if (!sep) return Number(s);
  const [int, dec] = s.split(sep);
  // "2,000" ou "1.000" com inteiro diferente de zero = milhar; "2,5" ou "0.125" = decimal.
  if (s.split(sep).length > 2 || (dec.length === 3 && int !== '0')) return Number(s.replaceAll(sep, ''));
  return Number(`${int}.${dec}`);
}

function converter(valores, unidadeTexto) {
  if (new RegExp(`^(${FAHRENHEIT})$`, 'i').test(unidadeTexto)) {
    const c = valores.map((f) => ((f - 32) * 5) / 9);
    return {
      nome: 'grau Fahrenheit (EUA)',
      resultado: c.map((x) => `${fmt(x, 1)} °C`).join(' a '),
      conta: valores.map((f, i) => `(${fmt(f)} − 32) × 5 ÷ 9 = ${fmt(c[i], 1)} °C`).join('; '),
      fator: '°C = (°F − 32) × 5 ÷ 9',
    };
  }
  const u = UNIDADES.find(([p]) => new RegExp(`^(${p})$`, 'iu').test(unidadeTexto));
  if (!u) return null;
  const [, nome, destino, fator, fatorTexto] = u;
  const r = valores.map((v) => v * fator);
  return {
    nome,
    resultado: r.map((x) => `≈ ${fmt(x)} ${destino}`).join(' a '),
    conta: valores.map((v, i) => `${fmt(v, 3)} × ${fator.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} = ${fmt(r[i])} ${destino}`).join('; '),
    fator: fatorTexto,
  };
}

let balao = null;
function fecharBalao() {
  balao?.remove();
  balao = null;
}
document.addEventListener('click', (e) => {
  if (balao && !balao.contains(e.target) && !e.target.closest?.('.conv')) fecharBalao();
});
document.addEventListener('keydown', (e) => e.key === 'Escape' && fecharBalao());

function abrirBalao(alvo) {
  fecharBalao();
  const d = alvo.dataset;
  balao = h('div', { class: 'conv-balao', role: 'dialog', 'aria-label': 'Conversão de medida' },
    h('b', {}, 'Conversão para as medidas do Brasil'),
    h('div', {}, h('small', { class: 'suave' }, 'No original: '), h('span', {}, `${d.original} — ${d.nome}`)),
    h('div', { class: 'conv-resultado' }, d.resultado),
    h('div', {}, h('small', { class: 'suave' }, 'Conta: '), h('span', {}, d.conta)),
    h('small', { class: 'suave' }, `Fator oficial: ${d.fator} (Sistema Internacional de Unidades, adotado no Brasil pelo Inmetro).`),
    h('small', { class: 'conv-alerta' }, 'Valor arredondado. Em remédios, siga sempre a dose da bula, da receita ou do profissional de saúde.'));
  document.body.append(balao);
  const r = alvo.getBoundingClientRect();
  const largura = Math.min(340, innerWidth - 16);
  balao.style.width = `${largura}px`;
  balao.style.left = `${Math.max(8, Math.min(r.left + scrollX, scrollX + innerWidth - largura - 8))}px`;
  const embaixo = r.bottom + 8 + balao.offsetHeight < innerHeight;
  balao.style.top = `${(embaixo ? r.bottom + 8 : r.top - balao.offsetHeight - 8) + scrollY}px`;
}

/** Sublinha as medidas estrangeiras dentro de um elemento; clique abre o balão com a conversão. */
export function marcarConversoes(raiz) {
  const nos = [];
  const andar = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest('code, pre, .conv, button, a') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  while (andar.nextNode()) nos.push(andar.currentNode);
  let total = 0;
  for (const no of nos) {
    const texto = no.nodeValue;
    PADRAO.lastIndex = 0;
    if (!PADRAO.test(texto)) continue;
    PADRAO.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let pos = 0;
    for (const m of texto.matchAll(PADRAO)) {
      const valores = [m[1], m[2]].filter(Boolean).map(lerNumero).filter((n) => Number.isFinite(n));
      const c = valores.length ? converter(valores, m[3].trim()) : null;
      if (!c) continue;
      frag.append(texto.slice(pos, m.index));
      const b = h('button', { type: 'button', class: 'conv', title: `${c.resultado} — clique para ver a conversão` }, m[0]);
      Object.assign(b.dataset, { original: m[0], ...c });
      b.addEventListener('click', (e) => { e.stopPropagation(); abrirBalao(b); });
      frag.append(b);
      pos = m.index + m[0].length;
      total++;
    }
    if (pos === 0) continue;
    frag.append(texto.slice(pos));
    no.replaceWith(frag);
  }
  return total;
}
