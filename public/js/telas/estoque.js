// Estoque de emergência: inventário de água, comida, objetos e remédios, com simulador de quantos dias dura.
// Fica salvo só neste computador (dados/estoque.json). Nada vai para a internet.
import { h, icone, cabecalho, aviso, toast, confirmar, modal } from '../ui.js';
import { api } from '../api.js';
import { calcularPessoa } from '../nutricao-calc.js';

// Consumo diário usado no simulador (referências: Defesa Civil — 2 L/pessoa/dia só para beber;
// Guia Alimentar / necessidades médias de energia).
const AGUA = { beber: { litros: 2, nome: 'Só beber (mínimo)' }, completo: { litros: 4, nome: 'Beber + cozinhar + higiene' } };
const KCAL = { adultos: 2000, criancas: 1400, idosos: 1800 };
const PESSOAS = [
  ['adultos', 'Adultos'], ['criancas', 'Crianças (4 a 12 anos)'], ['idosos', 'Idosos'], ['pets', 'Animais (cão/gato)'],
];
const METAS = [[3, '72 horas'], [14, '2 semanas'], [30, '1 mês'], [90, '3 meses'], [180, '6 meses'], [365, '1 ano'], [730, '2 anos'], [1825, '5 anos']];
// Simulação de até 25 anos (catástrofes longas: guerra nuclear, pandemia, colapso de abastecimento).
const MAX_DIAS = 365 * 25;

// Água da torneira (ou filtrada) guardada em casa: troca a cada 6 meses.
// Referência: FEMA/Ready.gov e Cruz Vermelha — água armazenada em casa deve ser renovada a cada 6 meses.
const MESES_TORNEIRA = 6;
const MOTIVO_TORNEIRA = 'Água da torneira guardada em casa não é envasada de forma estéril como a água mineral: o cloro que a protege se perde com o tempo e bactérias e algas podem crescer (mais rápido no calor, na luz e em garrafas reaproveitadas). Por isso a validade é de no máximo 6 meses a partir do dia em que foi guardada. Troque a água a cada 6 meses; na dúvida, trate antes de beber (dose oficial na Biblioteca).';

const TIPOS = {
  agua: { nome: 'Água', icone: 'gota', unidade: 'garrafas' },
  alimento: { nome: 'Alimentos', icone: 'folha', unidade: 'pacotes' },
  pet: { nome: 'Ração dos animais', icone: 'coracao', unidade: 'kg' },
  objeto: { nome: 'Objetos e utensílios', icone: 'pacote', unidade: 'unidades' },
  remedio: { nome: 'Remédios', icone: 'cruz', unidade: 'comprimidos' },
};

// Atalhos para adicionar. Calorias aproximadas (Tabela TACO / rótulos comuns): confira no rótulo do seu produto.
const ATALHOS = {
  agua: [
    { nome: 'Garrafa de água 1,5 L', unidade: 'garrafas', litros: 1.5 },
    { nome: 'Galão de água 5 L', unidade: 'galões', litros: 5 },
    { nome: 'Galão de água 20 L', unidade: 'galões', litros: 20 },
    { nome: 'Água da torneira guardada (2 L)', unidade: 'garrafas', litros: 2, torneira: true },
    { nome: 'Água da torneira guardada (galão 20 L)', unidade: 'galões', litros: 20, torneira: true },
  ],
  alimento: [
    { nome: 'Arroz 1 kg', unidade: 'pacotes', kcal: 3580 },
    { nome: 'Feijão 1 kg', unidade: 'pacotes', kcal: 3290 },
    { nome: 'Macarrão 500 g', unidade: 'pacotes', kcal: 1850 },
    { nome: 'Farinha de mandioca 1 kg', unidade: 'pacotes', kcal: 3610 },
    { nome: 'Aveia 500 g', unidade: 'pacotes', kcal: 1970 },
    { nome: 'Leite em pó 400 g', unidade: 'latas', kcal: 1990 },
    { nome: 'Açúcar 1 kg', unidade: 'pacotes', kcal: 3870 },
    { nome: 'Óleo 900 ml', unidade: 'garrafas', kcal: 7200 },
    { nome: 'Sardinha em lata 125 g', unidade: 'latas', kcal: 250 },
    { nome: 'Atum em lata 170 g', unidade: 'latas', kcal: 180 },
    { nome: 'Milho/ervilha em lata', unidade: 'latas', kcal: 150 },
    { nome: 'Biscoito tipo cream cracker 400 g', unidade: 'pacotes', kcal: 1730 },
    { nome: 'Amendoim 500 g', unidade: 'pacotes', kcal: 2900 },
    { nome: 'Mel 500 g', unidade: 'potes', kcal: 1550 },
  ],
  pet: [{ nome: 'Ração (kg)', unidade: 'kg' }],
  objeto: [
    { nome: 'Lanterna', unidade: 'unidades', kit: 'lanterna' },
    { nome: 'Pilhas', unidade: 'pilhas', consumo: 0.5, kit: 'pilhas' },
    { nome: 'Rádio a pilha ou a manivela', unidade: 'unidades', kit: 'radio' },
    { nome: 'Fósforos (caixa)', unidade: 'caixas', consumo: 0.1, kit: 'fogo' },
    { nome: 'Isqueiro', unidade: 'unidades', consumo: 0.03, kit: 'fogo' },
    { nome: 'Velas', unidade: 'velas', consumo: 1, kit: 'velas' },
    { nome: 'Gás de cozinha (botijão 13 kg)', unidade: 'botijões', consumo: 0.025 },
    { nome: 'Água sanitária / hipoclorito 2,5%', unidade: 'frascos', kit: 'hipoclorito' },
    { nome: 'Abridor de latas', unidade: 'unidades', kit: 'abridor' },
    { nome: 'Kit de primeiros socorros', unidade: 'kits', kit: 'socorros' },
    { nome: 'Papel higiênico', unidade: 'rolos', consumo: 1, kit: 'higiene' },
    { nome: 'Sabonete', unidade: 'unidades', consumo: 0.15, kit: 'higiene' },
    { nome: 'Sacos de lixo', unidade: 'sacos', consumo: 1, kit: 'lixo' },
    { nome: 'Carregador portátil (power bank)', unidade: 'unidades', kit: 'carregador' },
    { nome: 'Apito', unidade: 'unidades', kit: 'apito' },
    { nome: 'Cobertor / manta térmica', unidade: 'unidades', kit: 'cobertor' },
    { nome: 'Documentos em saco plástico', unidade: 'pastas', kit: 'documentos' },
    { nome: 'Dinheiro em espécie', unidade: 'reais', kit: 'dinheiro' },
  ],
  remedio: [
    { nome: 'Remédio de uso contínuo', unidade: 'comprimidos', consumo: 1, kit: 'continuo' },
    { nome: 'Analgésico/antitérmico', unidade: 'comprimidos', kit: 'analgesico' },
    { nome: 'Sais de reidratação oral (soro)', unidade: 'envelopes', kit: 'sro' },
    { nome: 'Antisséptico (clorexidina ou iodopovidona)', unidade: 'frascos', kit: 'antisseptico' },
    { nome: 'Soro fisiológico', unidade: 'frascos', kit: 'socorros' },
    { nome: 'Insulina', unidade: 'frascos/canetas', consumo: 0, kit: 'continuo' },
  ],
};

// Lista recomendada (Defesa Civil, Ministério da Saúde e listas oficiais de kit de emergência).
const KIT = [
  ['lanterna', 'Lanterna', 'Mais segura que vela. Uma por pessoa, se possível.'],
  ['pilhas', 'Pilhas extras', 'Para lanterna e rádio. Guarde fora do aparelho.'],
  ['radio', 'Rádio a pilha ou a manivela', 'Para ouvir avisos da Defesa Civil sem internet.'],
  ['fogo', 'Fósforos ou isqueiro', 'Em saco plástico fechado, longe da umidade.'],
  ['hipoclorito', 'Hipoclorito de sódio 2,5% (ou água sanitária sem perfume)', 'Para tratar água: veja a dose oficial na Biblioteca.'],
  ['abridor', 'Abridor de latas manual', 'Sem ele, a comida enlatada não serve.'],
  ['socorros', 'Kit de primeiros socorros', 'Gaze, esparadrapo, atadura, luvas, tesoura, termômetro, soro fisiológico.'],
  ['continuo', 'Remédios de uso contínuo', 'Reserva de pelo menos 30 dias e cópia da receita.'],
  ['sro', 'Sais de reidratação oral', 'Para diarreia e vômito. Grátis nas unidades do SUS.'],
  ['higiene', 'Higiene', 'Sabonete, papel higiênico, escova e pasta, absorventes, fraldas.'],
  ['lixo', 'Sacos de lixo resistentes', 'Para lixo, banheiro de emergência e proteger objetos da chuva.'],
  ['documentos', 'Documentos e receitas', 'RG, CPF, cartão do SUS, receitas. Em saco plástico ou cópia.'],
  ['dinheiro', 'Dinheiro em espécie', 'Cartão e Pix param quando cai a energia.'],
  ['carregador', 'Carregador portátil', 'Mantenha carregado. Anote os telefones importantes em papel.'],
  ['apito', 'Apito', 'Para pedir socorro sem gastar a voz.'],
  ['cobertor', 'Cobertor ou manta térmica', 'Uma por pessoa.'],
];

// Documentos da Biblioteca ligados ao estoque (abrem offline, se baixados).
const DOCUMENTOS = [
  'pdf-ms-enchentes-como-agir', 'pdf-sesgo-enchentes', 'pdf-sessp-hipoclorito-agua', 'pdf-sesgo-cuidados-agua',
  'pdf-mass-kit-emergencia', 'pdf-fiocruz-primeiros-socorros', 'pdf-ms-rename-2024', 'pdf-ms-guia-alimentar',
  'pdf-embrapa-secagem-alimentos', 'pdf-embrapa-conservas-frutas',
];

const PADRAO = () => ({
  pessoas: { adultos: 2, criancas: 0, idosos: 0, pets: 0 },
  agua: 'beber', aguaPet: 0.5, racaoPet: 0.2, meta: 14, itens: [],
  ultimaConferencia: null, historico: [],
});

const DIA = 86400000;
const hoje = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const dataDe = (s) => (s ? new Date(`${s}T00:00:00`).getTime() : null);
const iso = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const num = (v) => (Number.isFinite(+v) && +v > 0 ? +v : 0);
const fmt = (n, c = 0) => n.toLocaleString('pt-BR', { maximumFractionDigits: c });
const plural = (n, s, p) => `${fmt(n)} ${n === 1 ? s : p}`;
/** Duração legível: dias até 2 meses; depois meses; a partir de 1 ano, anos e meses. */
const dias = (d) => {
  if (!Number.isFinite(d) || d >= MAX_DIAS) return d >= MAX_DIAS && Number.isFinite(d) ? 'mais de 25 anos' : 'sem prazo';
  if (d < 1) return 'menos de 1 dia';
  const n = Math.floor(d);
  if (n < 60) return plural(n, 'dia', 'dias');
  if (n < 365) { const m = Math.floor(n / 30.44); const r = Math.round(n - m * 30.44); return r >= 1 ? `${plural(m, 'mês', 'meses')} e ${plural(r, 'dia', 'dias')}` : plural(m, 'mês', 'meses'); }
  const a = Math.floor(n / 365); const m = Math.floor((n - a * 365) / 30.44);
  return m ? `${plural(a, 'ano', 'anos')} e ${plural(m, 'mês', 'meses')}` : plural(a, 'ano', 'anos');
};
const quando = (ms) => new Date(ms).toLocaleDateString('pt-BR');
const novoId = () => Math.random().toString(36).slice(2, 10);

/** Água da torneira: validade máxima = data em que foi guardada + 6 meses. */
export function limiteTorneira(i) {
  const d = new Date(dataDe(i.guardadaEm) ?? hoje());
  d.setMonth(d.getMonth() + MESES_TORNEIRA);
  return d.getTime();
}
const ehTorneira = (i) => i.tipo === 'agua' && (i.torneira || /torneira|filtrad|da pia|do po[çc]o/i.test(i.nome || ''));
/** Garante a regra da água da torneira. Devolve true se precisou corrigir a validade. */
export function corrigirTorneira(i) {
  if (!ehTorneira(i)) return false;
  i.torneira = true;
  if (!i.guardadaEm || dataDe(i.guardadaEm) > hoje()) i.guardadaEm = iso(hoje());
  const limite = limiteTorneira(i);
  const v = dataDe(i.validade);
  if (v == null || v > limite) { i.validade = iso(limite); return v != null || true; }
  return false;
}
/** Quantidade usada na simulação: a atual ou, no modo "planejado", o que a pessoa quer ter. */
const qtdDe = (i, planejado) => (planejado && num(i.planejado) ? num(i.planejado) : num(i.qtd));

// ---------------- simulação ----------------
// Pessoas cadastradas em "Saúde e nutrição" (energia calculada para cada uma).
let perfis = [];
export function definirPerfis(lista) { perfis = lista; }

export function necessidades(e) {
  const p = e.pessoas;
  const animais = num(p.pets) * num(e.aguaPet);
  if (e.usarPerfis && perfis.length) {
    // Comida: soma do que cada pessoa precisa. Água de beber: no mínimo o valor da Defesa Civil.
    const gente = perfis.length;
    return {
      gente, porPerfil: true,
      agua: perfis.reduce((a, c) => a + Math.max(c.agua, AGUA[e.agua].litros), 0) + animais,
      kcal: perfis.reduce((a, c) => a + c.kcal, 0),
      racao: num(p.pets) * num(e.racaoPet),
    };
  }
  const gente = num(p.adultos) + num(p.criancas) + num(p.idosos);
  return {
    gente,
    agua: gente * AGUA[e.agua].litros + animais,
    kcal: num(p.adultos) * KCAL.adultos + num(p.criancas) * KCAL.criancas + num(p.idosos) * KCAL.idosos,
    racao: num(p.pets) * num(e.racaoPet),
  };
}

/**
 * Consome um "estoque comum" (água, comida ou ração) dia a dia, usando primeiro o que vence primeiro.
 * O que vence antes de ser usado é perdido. Devolve quantos dias dura e o que vai se perder.
 */
export function simularConjunto(itens, valorUnidade, porDia, inicio = hoje(), planejado = false) {
  // Sem validade informada = validade indeterminada (nunca vence na simulação).
  const lotes = itens
    .map((i) => ({ i, resto: qtdDe(i, planejado) * valorUnidade(i), vence: dataDe(i.validade) }))
    .filter((l) => l.resto > 0)
    .sort((a, b) => (a.vence ?? Infinity) - (b.vence ?? Infinity));
  const total = lotes.reduce((a, l) => a + l.resto, 0);
  const perdas = [];
  if (!porDia) return { dias: total > 0 ? Infinity : 0, total, perdas };
  for (let d = 0; d < MAX_DIAS; d++) {
    const data = inicio + d * DIA;
    for (const l of lotes) if (l.resto > 0 && l.vence != null && l.vence < data) { perdas.push({ item: l.i, quantidade: l.resto, dia: d }); l.resto = 0; }
    // Sem mais nada para vencer: o resto acaba numa conta só (rápido mesmo para simulações de anos).
    if (!lotes.some((l) => l.resto > 0 && l.vence != null)) {
      const resto = lotes.reduce((a, l) => a + l.resto, 0);
      return { dias: Math.min(MAX_DIAS, d + resto / porDia), total, perdas };
    }
    let falta = porDia;
    for (const l of lotes) {
      if (!falta) break;
      const usa = Math.min(l.resto, falta);
      l.resto -= usa; falta -= usa;
    }
    if (falta > 1e-9) return { dias: d + (porDia - falta) / porDia, total, perdas };
  }
  return { dias: MAX_DIAS, total, perdas };
}

/** Objetos e remédios: cada item dura quantidade ÷ consumo diário, limitado pela validade. */
export function duracaoItem(i, inicio = hoje(), planejado = false) {
  const vence = dataDe(i.validade);
  const ateVencer = vence != null ? Math.max(0, (vence - inicio) / DIA) : Infinity;
  const consumo = num(i.consumo);
  const porUso = consumo ? qtdDe(i, planejado) / consumo : Infinity;
  return { dias: Math.min(porUso, ateVencer), limitadoPor: ateVencer < porUso ? 'validade' : consumo ? 'uso' : null, ateVencer };
}

export function simular(e, inicio = hoje(), planejado = false) {
  const n = necessidades(e);
  const de = (t) => e.itens.filter((i) => i.tipo === t);
  const agua = simularConjunto(de('agua'), (i) => num(i.litros), n.agua, inicio, planejado);
  const comida = simularConjunto(de('alimento'), (i) => num(i.kcal), n.kcal, inicio, planejado);
  const racao = simularConjunto(de('pet'), () => 1, n.racao, inicio, planejado);
  const outros = [...de('objeto'), ...de('remedio')].map((i) => ({ i, ...duracaoItem(i, inicio, planejado) }));
  const limites = [['água', agua.dias], ['comida', comida.dias]];
  if (num(e.pessoas.pets)) limites.push(['ração', racao.dias]);
  const [gargalo, total] = limites.reduce((m, x) => (x[1] < m[1] ? x : m));
  return { n, agua, comida, racao, outros, total, gargalo };
}

// ---------------- tela ----------------
export async function render(raiz) {
  let e = PADRAO();
  try {
    const salvo = await api.get('/api/estoque');
    if (salvo?.itens) e = { ...PADRAO(), ...salvo, pessoas: { ...PADRAO().pessoas, ...salvo.pessoas } };
  } catch (err) { toast(err.message, 'erro'); }
  // Regra da água da torneira também para o que já estava salvo.
  if (e.itens.map(corrigirTorneira).some(Boolean)) api.put('/api/estoque', e).catch(() => {});
  let conferindo = false;
  // Família cadastrada em "Saúde e nutrição".
  let pessoasNutri = [];
  try {
    pessoasNutri = ((await api.get('/api/nutricao')).pessoas || []).map((p) => ({ p, c: calcularPessoa(p) })).filter((x) => x.c);
  } catch {}
  definirPerfis(pessoasNutri.map((x) => x.c));
  let biblioteca = [];
  api.get('/api/biblioteca').then((b) => { biblioteca = b; desenharDocs(); }).catch(() => {});

  let timer = null;
  const gravar = () => { timer = null; api.put('/api/estoque', e).catch((err) => toast(`Não salvou: ${err.message}`, 'erro')); };
  const salvar = () => { clearTimeout(timer); timer = setTimeout(gravar, 400); };
  const mudou = () => { salvar(); desenhar(); };

  raiz.append(cabecalho('Preparação', 'Estoque de emergência',
    'Anote o que você tem guardado e veja quantos dias dura para a sua família. Fica salvo só neste computador.'));

  const resumo = h('div');
  const pessoas = h('div', { class: 'cartao' });
  const listas = h('div', { class: 'pilha' });
  const kit = h('div', { class: 'cartao' });
  const saude = h('div', { class: 'cartao' });
  const dicas = h('div', { class: 'cartao' });
  const docs = h('div', { class: 'cartao' });
  const historico = h('div', { class: 'cartao' });
  const longo = h('details', { class: 'cartao estoque-longo' });
  raiz.append(resumo, h('div', { class: 'grade c2 estoque-topo' }, pessoas, kit), listas, longo, historico, h('div', { class: 'grade c2' }, saude, dicas), docs);

  // Histórico das conferências: como o estoque evoluiu.
  function desenharHistorico() {
    const hist = (e.historico || []).slice().reverse();
    historico.hidden = !hist.length;
    historico.replaceChildren(
      h('h3', {}, icone('atualizar', 18), ' Histórico das conferências'),
      h('div', { class: 'tabela-rolagem' }, h('table', { class: 'estoque-historico' },
        h('tr', {}, h('th', {}, 'Data'), h('th', {}, 'Pessoas'), h('th', {}, 'Durava'), h('th', {}, 'Água'), h('th', {}, 'Comida'), h('th', {}, 'Itens')),
        ...hist.slice(0, 24).map((r) => h('tr', {},
          h('td', {}, quando(dataDe(r.data))), h('td', {}, fmt(r.pessoas)), h('td', {}, r.dias == null ? 'sem prazo' : dias(r.dias)),
          h('td', {}, `${fmt(r.agua)} L`), h('td', {}, `${fmt(r.kcal)} kcal`),
          h('td', {}, `${fmt(r.itens)}${r.naoConferidos ? ` (${r.naoConferidos} sem conferir)` : ''}`))))));
  }

  // Catástrofes longas: guerra nuclear, pandemia, colapso de abastecimento (meses ou anos).
  function desenharLongo() {
    const n = necessidades(e);
    const ano = (v) => fmt(v * 365);
    longo.open = e.meta >= 180;
    longo.replaceChildren(
      h('summary', {}, icone('alerta', 18), h('b', {}, 'Catástrofes longas (meses ou anos): guerra nuclear, pandemia, colapso de abastecimento')),
      h('p', {}, `Para ${n.gente || 0} pessoa(s), 1 ano precisa de cerca de `, h('b', {}, `${ano(n.agua)} L de água`), ' e ', h('b', {}, `${ano(n.kcal)} kcal`),
        ` (≈ ${fmt(Math.ceil((n.kcal * 365) / 3580))} kg de arroz ou equivalente). Guardar tudo isso é difícil: estoque longo precisa de fonte de água e produção de comida.`),
      h('ul', { class: 'energia-dicas' },
        h('li', {}, h('b', {}, 'Água: '), 'estocar água para anos é inviável. Tenha como captar (cisterna de chuva, poço) e tratar (filtro, fervura, hipoclorito — dose oficial na Biblioteca). Garrafas e galões lacrados ou bem tampados ficam protegidos da poeira.'),
        h('li', {}, h('b', {}, 'Comida que dura anos: '), 'grãos secos e bem fechados (arroz branco, feijão, milho, trigo, aveia), açúcar, sal e mel guardados em local fresco, seco e escuro. Arroz integral, farinhas, castanhas e óleo ficam rançosos antes: gire no consumo.'),
        h('li', {}, h('b', {}, 'Só calorias não bastam: '), 'em meses, falta de proteína, gordura e vitaminas causa doenças (a falta de vitamina C leva ao escorbuto). Inclua feijão, leite em pó, enlatados de peixe e carne, e plante hortaliças e frutas.'),
        h('li', {}, h('b', {}, 'Produzir comida: '), 'guarde sementes não híbridas (feijão, milho, abóbora, hortaliças) e manivas de mandioca. Veja a Biblioteca em ', h('a', { href: '#/biblioteca/agricultura' }, 'Alimentação: cultivo, criação e pesca'), '.'),
        h('li', {}, h('b', {}, 'Explosão ou acidente nuclear: '), 'a orientação oficial (Defesa Civil, FEMA) é entrar no prédio mais sólido, ficar no centro ou no subsolo, longe de janelas, por pelo menos 24 horas, e acompanhar o rádio. Tire a roupa de fora e lave o corpo. Comida e água em embalagens fechadas podem ser usadas depois de limpar a embalagem.'),
        h('li', {}, h('b', {}, 'Remédios de uso contínuo: '), 'converse com o médico sobre reserva maior e guarde cópia das receitas. Remédios vencidos podem perder efeito.'),
        h('li', {}, h('b', {}, 'Energia, higiene e saneamento: '), 'veja a seção de energia na página inicial e os manuais de saneamento da Biblioteca (Funasa).')));
  }

  // Pessoas e metas
  function desenharPessoas() {
    const campo = (k, rot) => h('label', { class: 'estoque-campo' }, h('span', {}, rot),
      h('input', { type: 'number', min: 0, step: 1, value: e.pessoas[k], oninput: (ev) => { e.pessoas[k] = num(ev.target.value); salvar(); desenharResumo(); desenharListas(); } }));
    pessoas.replaceChildren(
      h('h3', {}, 'Quem vai usar o estoque'),
      pessoasNutri.length
        ? h('label', { class: 'alternar' }, h('input', { type: 'checkbox', checked: !!e.usarPerfis, onchange: (ev) => { e.usarPerfis = ev.target.checked; desenharTudo(); salvar(); } }),
            `Usar as ${pessoasNutri.length} pessoa(s) de "Saúde e nutrição" (energia calculada para cada uma)`)
        : h('small', { class: 'suave' }, 'Dica: cadastre a família em ', h('a', { href: '#/nutricao' }, 'Saúde e nutrição'), ' para calcular a comida pela idade, peso e atividade de cada pessoa.'),
      e.usarPerfis && pessoasNutri.length
        ? h('ul', { class: 'estoque-perfis' }, ...pessoasNutri.map(({ p, c }) => h('li', {}, h('b', {}, p.nome || 'Sem nome'), ` — ${fmt(c.kcal)} kcal e ${fmt(Math.max(c.agua, AGUA[e.agua].litros), 1)} L de água por dia`)))
        : h('div', { class: 'estoque-pessoas' }, ...PESSOAS.filter(([k]) => k !== 'pets').map(([k, r]) => campo(k, r))),
      h('div', { class: 'estoque-pessoas' }, campo('pets', 'Animais (cão/gato)')),
      h('div', { class: 'estoque-campo' }, h('span', {}, 'Água por pessoa'),
        h('div', { class: 'segmentado' }, ...Object.entries(AGUA).map(([k, a]) =>
          h('button', { class: e.agua === k ? 'ativo' : '', onclick: () => { e.agua = k; mudou(); } }, `${a.nome} · ${a.litros} L/dia`)))),
      h('div', { class: 'estoque-campo' }, h('span', {}, 'Meta de preparo (por quanto tempo o estoque deve durar)'),
        h('div', { class: 'segmentado estoque-metas' }, ...METAS.map(([d, r]) =>
          h('button', { class: e.meta === d ? 'ativo' : '', onclick: () => { e.meta = d; desenharTudo(); salvar(); } }, r))),
        h('div', { class: 'linha', style: { gap: '6px', marginTop: '6px', flexWrap: 'wrap' } },
          h('small', {}, 'Outra:'),
          (() => {
            const ehAnos = e.meta >= 365 && !METAS.some(([d]) => d === e.meta);
            const valor = h('input', { type: 'number', min: 1, max: 25, step: 1, style: { width: '80px' }, value: ehAnos ? Math.round(e.meta / 365) : '' , 'aria-label': 'Quantidade' });
            const unidade = h('select', { 'aria-label': 'Unidade' }, h('option', { value: 1 }, 'dias'), h('option', { value: 30 }, 'meses'), h('option', { value: 365, selected: true }, 'anos'));
            const aplicar = () => { const d = Math.min(MAX_DIAS, Math.round(num(valor.value) * +unidade.value)); if (d) { e.meta = d; desenharTudo(); salvar(); } };
            valor.addEventListener('change', aplicar);
            unidade.addEventListener('change', aplicar);
            return h('span', { class: 'linha', style: { gap: '6px' } }, valor, unidade);
          })(),
          h('small', { class: 'suave' }, `meta atual: ${dias(e.meta)} (até 25 anos)`))),
      num(e.pessoas.pets) ? h('div', { class: 'estoque-pessoas' },
        h('label', { class: 'estoque-campo' }, h('span', {}, 'Água por animal (L/dia)'),
          h('input', { type: 'number', min: 0, step: 0.1, value: e.aguaPet, oninput: (ev) => { e.aguaPet = num(ev.target.value); salvar(); desenharResumo(); } })),
        h('label', { class: 'estoque-campo' }, h('span', {}, 'Ração por animal (kg/dia)'),
          h('input', { type: 'number', min: 0, step: 0.05, value: e.racaoPet, oninput: (ev) => { e.racaoPet = num(ev.target.value); salvar(); desenharResumo(); } }))) : null,
      h('p', { class: 'suave pequeno' }, `Cálculo: ${AGUA[e.agua].litros} L de água por pessoa por dia (Defesa Civil: mínimo de 2 L só para beber). Comida: ${fmt(KCAL.adultos)} kcal por adulto, ${fmt(KCAL.criancas)} por criança e ${fmt(KCAL.idosos)} por idoso por dia (médias).`),
    );
  }

  // Resumo + simulador de dias
  let diaSim = 0;
  function desenharResumo() {
    const s = simular(e);
    const meta = e.meta;
    const cor = (d) => (d >= meta ? 'ok' : d >= meta / 2 ? 'alerta' : 'perigo');
    const faltaAgua = Math.max(0, s.n.agua * meta - s.agua.total);
    const faltaKcal = Math.max(0, s.n.kcal * meta - s.comida.total);
    const vazio = !e.itens.length;
    const bloco = (rot, d, extra) => h('div', { class: `numero estoque-num ${cor(d)}` }, h('b', {}, dias(d)), h('span', {}, rot), extra && h('small', {}, extra));
    const sim = simular(e, hoje() + diaSim * DIA);
    const restoAgua = Math.max(0, s.agua.total - s.n.agua * diaSim);
    // Com o estoque planejado ("quero ter"): para comparar com o que existe hoje.
    const temPlano = e.itens.some((i) => num(i.planejado));
    const sp = temPlano ? simular(e, hoje(), true) : null;
    const maxSim = Math.min(MAX_DIAS, Math.max(30, Math.ceil(Math.max(e.meta, Number.isFinite(s.total) ? s.total : 90) * 1.2)));
    if (diaSim > maxSim) diaSim = maxSim;
    const diasConf = e.ultimaConferencia ? Math.floor((hoje() - dataDe(e.ultimaConferencia)) / DIA) : null;
    resumo.replaceChildren(h('div', { class: 'cartao estoque-resumo' },
      vazio
        ? aviso('info', h('b', {}, 'Comece adicionando o que você tem. '), 'Use os atalhos em cada lista abaixo (água, alimentos, objetos e remédios).')
        : h('div', { class: 'estoque-total' },
          h('div', {}, h('div', { class: 'sobretitulo' }, 'Seu estoque dura'), h('div', { class: `estoque-dias ${cor(s.total)}` }, dias(s.total)),
            h('div', { class: 'suave' }, s.n.gente ? `para ${s.n.gente} pessoa(s)${num(e.pessoas.pets) ? ` e ${e.pessoas.pets} animal(is)` : ''} · o que acaba primeiro: ${s.gargalo}` : 'Informe quantas pessoas vão usar o estoque.')),
          h('div', { class: 'estoque-meta' }, s.total >= meta
            ? h('span', { class: 'etiqueta musgo' }, icone('ok', 14), `Meta de ${dias(meta)} atingida`)
            : h('span', { class: 'etiqueta alerta' }, `Faltam ${dias(meta - s.total)} para a meta`))),
      sp ? h('p', { class: 'estoque-plano' }, icone('pacote', 16),
        h('span', {}, h('b', {}, 'Com tudo o que você planejou ter: '), `dura ${dias(sp.total)} (água ${dias(sp.agua.dias)}, comida ${dias(sp.comida.dias)}). `,
          sp.total >= meta ? 'O plano atinge a meta.' : `O plano ainda fica ${dias(meta - sp.total)} abaixo da meta.`)) : null,
      !vazio ? h('div', { class: `estoque-conferencia ${diasConf == null || diasConf > 90 ? 'alerta' : ''}` },
        icone('ok', 16),
        h('span', {}, diasConf == null ? 'Você ainda não conferiu o estoque com o que existe de verdade na despensa.'
          : `Última conferência: ${quando(dataDe(e.ultimaConferencia))} (${diasConf ? `há ${dias(diasConf)}` : 'hoje'}).${diasConf > 90 ? ' Recomendado conferir a cada 3 meses.' : ''}`),
        h('button', { class: `botao pequeno ${conferindo ? 'primario' : ''}`, onclick: () => (conferindo ? concluirConferencia() : iniciarConferencia()) },
          conferindo ? 'Terminar conferência' : 'Conferir estoque agora')) : null,
      conferindo ? aviso('info', h('b', {}, 'Modo conferência: '), 'vá até a despensa e, item por item, ajuste a quantidade que existe de verdade e clique em "Confere". Ao terminar, o resultado fica salvo no histórico.') : null,
      h('div', { class: 'numeros' },
        bloco('Água', s.agua.dias, `${fmt(s.agua.total, 1)} L · ${fmt(s.n.agua, 1)} L/dia`),
        bloco('Comida', s.comida.dias, `${fmt(s.comida.total)} kcal · ${fmt(s.n.kcal)}/dia`),
        num(e.pessoas.pets) ? bloco('Ração', s.racao.dias, `${fmt(s.racao.total, 1)} kg`) : null),
      (faltaAgua || faltaKcal) && s.n.gente ? h('p', { class: 'estoque-falta' }, icone('alerta', 16),
        `Para ${dias(meta)}: ${faltaAgua ? `faltam ${fmt(faltaAgua, 1)} L de água (≈ ${fmt(Math.ceil(faltaAgua / 5))} galões de 5 L)` : 'água ok'}; ${faltaKcal ? `faltam ${fmt(faltaKcal)} kcal de comida (≈ ${fmt(Math.ceil(faltaKcal / 3580))} kg de arroz ou equivalente)` : 'comida ok'}.`) : null,
      ...[...s.agua.perdas, ...s.comida.perdas].slice(0, 4).map((p) =>
        h('p', { class: 'estoque-falta perigo' }, icone('alerta', 16), `"${p.item.nome}" vence ${p.dia ? `em ${p.dia} dia(s)` : 'antes de hoje'}, antes de ser usado. Use ou troque logo (primeiro que vence, primeiro que sai).`)),
      !vazio ? h('div', { class: 'estoque-sim' },
        h('label', {}, h('b', {}, 'Simular: '), diaSim ? `daqui a ${dias(diaSim)} (${quando(hoje() + diaSim * DIA)})` : 'hoje'),
        h('input', { type: 'range', min: 0, max: maxSim, step: maxSim > 730 ? 7 : 1, value: diaSim,
          oninput: (ev) => { diaSim = +ev.target.value; desenharResumo(); } }),
        h('div', { class: 'estoque-sim-lista' },
          h('span', {}, `Água restante: ${fmt(restoAgua, 1)} L`),
          h('span', {}, `Comida restante: ${fmt(Math.max(0, s.comida.total - s.n.kcal * diaSim))} kcal`),
          ...sim.outros.filter((o) => o.ateVencer === 0 && dataDe(o.i.validade) != null).slice(0, 3).map((o) => h('span', { class: 'perigo' }, `${o.i.nome}: vencido`)),
          ...s.outros.filter((o) => num(o.i.consumo) && o.dias < diaSim).slice(0, 5).map((o) => h('span', { class: 'perigo' }, `${o.i.nome}: acabou no dia ${Math.floor(o.dias)}`)))) : null,
    ));
  }

  // Listas por tipo
  function linhaItem(i) {
    const t = TIPOS[i.tipo];
    const d = i.tipo === 'objeto' || i.tipo === 'remedio' ? duracaoItem(i) : null;
    const vence = dataDe(i.validade);
    const diasVence = vence != null ? Math.round((vence - hoje()) / DIA) : null;
    const etiq = diasVence == null ? null
      : diasVence < 0 ? h('span', { class: 'etiqueta perigo' }, 'Vencido')
      : diasVence <= 60 ? h('span', { class: 'etiqueta alerta' }, `Vence em ${diasVence} dia(s)`)
      : null;
    const campo = (k, props, rot) => h('label', { class: 'estoque-campo mini' }, h('span', {}, rot),
      h('input', { ...props, value: i[k] ?? '', onchange: (ev) => { i[k] = props.type === 'number' ? num(ev.target.value) : ev.target.value; mudou(); } }));
    const torneira = ehTorneira(i);
    // Validade: vazia = indeterminada. Água da torneira: no máximo 6 meses depois de guardada.
    const campoValidade = h('label', { class: 'estoque-campo mini' },
      h('span', {}, torneira ? 'Validade (máx. 6 meses)' : 'Validade'),
      h('input', {
        type: 'date', value: i.validade || '', ...(torneira ? { max: iso(limiteTorneira(i)) } : {}),
        onchange: (ev) => {
          i.validade = ev.target.value;
          if (torneira && corrigirTorneira(i)) avisoTorneira();
          mudou();
        },
      }),
      !i.validade ? h('small', { class: 'suave' }, 'Indeterminada') : null);
    const planejado = num(i.planejado);
    const atual = num(i.qtd);
    const conferido = conferindo && i.conferidoEm === iso(hoje());
    return h('div', { class: `estoque-item ${conferindo ? (conferido ? 'conferido' : 'a-conferir') : ''}` },
      h('div', { class: 'estoque-item-topo' },
        h('input', { type: 'text', class: 'estoque-nome', value: i.nome, 'aria-label': 'Nome', onchange: (ev) => { i.nome = ev.target.value; if (corrigirTorneira(i)) avisoTorneira(); mudou(); } }),
        etiq,
        !i.validade && !torneira ? h('span', { class: 'etiqueta', title: 'Sem validade informada: o simulador considera que não vence.' }, 'Validade indeterminada') : null,
        d && num(i.consumo) ? h('span', { class: `etiqueta ${d.dias >= e.meta ? 'musgo' : 'alerta'}` }, `dura ${dias(d.dias)}${d.limitadoPor === 'validade' ? ' (validade)' : ''}`) : null,
        planejado ? h('span', { class: `etiqueta ${atual >= planejado ? 'musgo' : 'alerta'}` }, atual >= planejado ? 'Plano completo' : `Faltam ${fmt(planejado - atual, 2)} ${i.unidade || t.unidade}`) : null,
        conferindo ? h('button', { class: `botao pequeno ${conferido ? '' : 'primario'}`, onclick: () => { i.conferidoEm = iso(hoje()); mudou(); } }, icone('ok', 14), conferido ? 'Conferido' : 'Confere') : null,
        h('button', { class: 'botao-icone', title: 'Remover', onclick: () => { e.itens = e.itens.filter((x) => x !== i); mudou(); } }, icone('lixo', 16))),
      h('div', { class: 'estoque-item-campos' },
        campo('qtd', { type: 'number', min: 0, step: 'any' }, `Tenho agora (${i.unidade || t.unidade})`),
        campo('planejado', { type: 'number', min: 0, step: 'any' }, 'Quero ter (plano)'),
        i.tipo === 'agua' ? campo('litros', { type: 'number', min: 0, step: 'any' }, 'Litros por unidade') : null,
        i.tipo === 'alimento' ? campo('kcal', { type: 'number', min: 0, step: 'any' }, 'kcal por unidade (rótulo)') : null,
        i.tipo === 'objeto' || i.tipo === 'remedio' ? campo('consumo', { type: 'number', min: 0, step: 'any' }, i.tipo === 'remedio' ? 'Doses por dia (da receita)' : 'Uso por dia (opcional)') : null,
        i.tipo === 'remedio' ? campo('pessoa', { type: 'text' }, 'Para quem') : null,
        torneira ? h('label', { class: 'estoque-campo mini' }, h('span', {}, 'Guardada em'),
          h('input', { type: 'date', value: i.guardadaEm || '', max: iso(hoje()), onchange: (ev) => { const d = dataDe(ev.target.value); i.guardadaEm = d != null && d <= hoje() ? ev.target.value : iso(hoje()); i.validade = iso(limiteTorneira(i)); mudou(); } })) : null,
        campoValidade),
      i.tipo === 'agua' ? h('label', { class: 'alternar estoque-torneira' },
        h('input', { type: 'checkbox', checked: torneira, disabled: torneira && /torneira|filtrad|da pia|do po[çc]o/i.test(i.nome || ''),
          onchange: (ev) => { i.torneira = ev.target.checked; if (i.torneira) { corrigirTorneira(i); avisoTorneira(); } mudou(); } }),
        'Água da torneira, filtrada ou de poço guardada em casa') : null,
      torneira ? h('small', { class: 'estoque-aviso-torneira' }, icone('alerta', 13), ` Validade máxima: ${quando(limiteTorneira(i))} (6 meses depois de guardada). `,
        h('button', { type: 'button', class: 'link', onclick: avisoTorneira }, 'Por quê?')) : null);
  }

  function avisoTorneira() {
    modal(h('div', { class: 'pilha' },
      h('h3', { style: { margin: 0 } }, icone('gota', 18), ' Validade da água da torneira guardada'),
      h('p', {}, MOTIVO_TORNEIRA),
      h('p', { class: 'suave pequeno' }, 'Por isso não é possível pôr validade maior que 6 meses nem deixar indeterminada. Água mineral lacrada segue a validade do rótulo.')), { largura: 520 });
  }

  function iniciarConferencia() {
    conferindo = true;
    for (const tipo of Object.keys(TIPOS)) abertos.add(tipo);
    desenhar();
  }
  function concluirConferencia() {
    conferindo = false;
    const faltando = e.itens.filter((i) => i.conferidoEm !== iso(hoje())).length;
    e.ultimaConferencia = iso(hoje());
    const s = simular(e);
    e.historico = [...(e.historico || []), {
      data: e.ultimaConferencia, pessoas: s.n.gente, dias: Number.isFinite(s.total) ? Math.round(s.total) : null,
      agua: Math.round(s.agua.total), kcal: Math.round(s.comida.total), itens: e.itens.length, naoConferidos: faltando,
    }].slice(-60);
    toast(faltando ? `Conferência salva. ${faltando} item(ns) ficaram sem conferir.` : 'Conferência salva no histórico.');
    mudou();
    desenharHistorico();
  }

  const abertos = new Set(['agua', 'alimento']);
  function desenharListas() {
    listas.replaceChildren(...Object.entries(TIPOS).map(([tipo, t]) => {
      if (tipo === 'pet' && !num(e.pessoas.pets) && !e.itens.some((i) => i.tipo === 'pet')) return null;
      const itens = e.itens.filter((i) => i.tipo === tipo);
      const adicionar = (base) => {
        const novo = { id: novoId(), tipo, qtd: 1, unidade: t.unidade, ...base };
        e.itens.push(novo);
        if (corrigirTorneira(novo)) toast('Água da torneira: validade de 6 meses a partir de hoje. Clique em "Por quê?" no item para saber o motivo.');
        abertos.add(tipo);
        mudou();
      };
      const sel = h('select', { onchange: (ev) => { const a = ATALHOS[tipo][+ev.target.value]; if (a) adicionar({ ...a }); ev.target.value = ''; } },
        h('option', { value: '' }, 'Adicionar…'), ...ATALHOS[tipo].map((a, n) => h('option', { value: n }, a.nome)));
      const det = h('details', { class: 'cartao estoque-lista', open: abertos.has(tipo), ontoggle: (ev) => (ev.target.open ? abertos.add(tipo) : abertos.delete(tipo)) },
        h('summary', {}, icone(t.icone, 18), h('b', {}, t.nome), h('span', { class: 'suave' }, `${itens.length} item(ns)`)),
        h('div', { class: 'linha estoque-adicionar' }, sel,
          h('button', { class: 'botao', onclick: () => adicionar({ nome: tipo === 'remedio' ? 'Nome do remédio' : 'Novo item' }) }, icone('mais', 16), 'Outro')),
        tipo === 'remedio' ? aviso('', 'Anote a dose que está na ', h('b', {}, 'receita ou na bula'), '. O Protocolo Zero não indica doses: ele só conta quantos dias o remédio dura.') : null,
        tipo === 'alimento' ? h('p', { class: 'suave pequeno' }, 'As calorias dos atalhos são aproximadas (Tabela TACO). Prefira o valor do rótulo: kcal por porção × porções da embalagem.') : null,
        itens.length ? h('div', { class: 'pilha' }, ...itens.map(linhaItem)) : h('p', { class: 'suave' }, 'Nada anotado ainda.'));
      return det;
    }));
  }

  // Lista recomendada (o que já tem é marcado sozinho)
  function desenharKit() {
    const tem = new Set(e.itens.filter((i) => num(i.qtd)).map((i) => i.kit).filter(Boolean));
    const feitos = new Set(e.kitManual || []);
    const ok = KIT.filter(([k]) => tem.has(k) || feitos.has(k)).length;
    kit.replaceChildren(
      h('h3', {}, `Lista recomendada · ${ok} de ${KIT.length}`),
      h('ul', { class: 'estoque-kit' }, ...KIT.map(([k, nome, porque]) => {
        const marcado = tem.has(k) || feitos.has(k);
        return h('li', { class: marcado ? 'feito' : '' },
          h('label', {}, h('input', { type: 'checkbox', checked: marcado, disabled: tem.has(k),
            onchange: (ev) => { const s = new Set(e.kitManual || []); ev.target.checked ? s.add(k) : s.delete(k); e.kitManual = [...s]; mudou(); } }),
          h('span', {}, h('b', {}, nome), h('small', {}, porque))));
      })));
  }

  function desenharSaude() {
    saude.replaceChildren(
      h('h3', {}, icone('cruz', 18), ' Remédios em caso de doença'),
      aviso('erro', h('b', {}, 'Sem doses aqui de propósito. '), 'Siga a receita, a bula e o médico. Em emergência: SAMU 192.'),
      h('h4', {}, 'Doenças crônicas: não deixe faltar'),
      h('ul', { class: 'energia-dicas' },
        h('li', {}, h('b', {}, 'Pressão alta, coração, epilepsia, tireoide, anticoagulante, saúde mental: '), 'nunca pare por conta própria. Tenha reserva de pelo menos 30 dias e cópia da receita.'),
        h('li', {}, h('b', {}, 'Diabetes: '), 'insulina fechada fica na geladeira (2 a 8 °C). A que está em uso pode ficar fora pelo tempo da bula. Tenha glicosímetro, tiras, lancetas e açúcar ou sachês para hipoglicemia.'),
        h('li', {}, h('b', {}, 'Asma e bronquite: '), 'bombinha de alívio com espaçador e uma de reserva.'),
        h('li', {}, h('b', {}, 'Bebês e gestantes: '), 'fórmula infantil, fraldas, e os suplementos receitados no pré-natal.')),
      h('h4', {}, 'Doenças comuns depois de enchentes e desastres'),
      h('ul', { class: 'energia-dicas' },
        h('li', {}, h('b', {}, 'Diarreia e vômito: '), 'sais de reidratação oral (soro do SUS) e só água tratada. Procure atendimento se houver sangue, febre alta ou sinais de desidratação.'),
        h('li', {}, h('b', {}, 'Suspeita de dengue: '), 'o Ministério da Saúde orienta não usar AAS nem anti-inflamatórios (como ibuprofeno e diclofenaco). Hidrate e procure atendimento.'),
        h('li', {}, h('b', {}, 'Leptospirose: '), 'febre, dor de cabeça e dor na batata da perna após contato com água de enchente. Procure atendimento: não tome remédio por conta própria.'),
        h('li', {}, h('b', {}, 'Ferimento em água suja: '), 'lave com água tratada e sabão, cubra e verifique a vacina antitetânica.')),
      h('p', { class: 'suave pequeno' }, 'Remédios essenciais do SUS: consulte a RENAME na Biblioteca. Remédios molhados pela enchente devem ser descartados (Ministério da Saúde).'),
    );
  }

  function desenharDicas() {
    dicas.replaceChildren(
      h('h3', {}, icone('pacote', 18), ' Como guardar e manter o estoque'),
      h('ul', { class: 'energia-dicas' },
        h('li', {}, h('b', {}, 'Primeiro que vence, primeiro que sai: '), 'coloque o mais novo atrás e use o mais antigo no dia a dia. Assim o estoque nunca vence.'),
        h('li', {}, h('b', {}, 'Lugar: '), 'fresco, seco, escuro e longe do chão (em prateleira ou estrado), fora do alcance de enchente, ratos e insetos.'),
        h('li', {}, h('b', {}, 'Água: '), 'em garrafas próprias para alimento, bem fechadas, longe do sol e de produtos químicos. A água da torneira guardada deve ser trocada a cada 6 meses. Na dúvida, trate antes de beber (dose oficial na Biblioteca).'),
        h('li', {}, h('b', {}, 'Comida: '), 'prefira o que não precisa de geladeira e pouco cozimento: enlatados, arroz, feijão, macarrão, aveia, leite em pó, castanhas, mel. Guarde em potes fechados.'),
        h('li', {}, h('b', {}, 'Coma o que você já come: '), 'o estoque gira no uso diário e ninguém estranha a comida na emergência.'),
        h('li', {}, h('b', {}, 'Revise a cada 6 meses: '), 'validades, pilhas, remédios, roupas das crianças e documentos.'),
        h('li', {}, h('b', {}, 'Depois de enchente: '), 'descarte alimentos e remédios que tiveram contato com a água. Latas intactas podem ser lavadas e desinfetadas (veja o guia oficial).'),
        h('li', {}, h('b', {}, 'Fogo com segurança: '), 'prefira lanterna a vela. Nunca use fogareiro, braseiro ou gerador dentro de casa (risco de intoxicação por monóxido de carbono).')),
      h('div', { class: 'linha', style: { marginTop: '12px', flexWrap: 'wrap' } },
        h('button', { class: 'botao', onclick: () => imprimir() }, icone('texto', 16), 'Imprimir lista'),
        h('button', { class: 'botao', onclick: async () => { if (await confirmar('Apagar todo o estoque anotado? Isso não pode ser desfeito.', { botao: 'Apagar', perigo: true })) { e = PADRAO(); desenharTudo(); salvar(); } } }, icone('lixo', 16), 'Apagar tudo')),
    );
  }

  function desenharDocs() {
    const porId = new Map(biblioteca.map((b) => [b.id, b]));
    const tem = DOCUMENTOS.map((id) => porId.get(id)).filter((b) => b?.arquivo);
    docs.replaceChildren(
      h('h3', {}, icone('livro', 18), ' Leia na Biblioteca (offline)'),
      tem.length
        ? h('div', { class: 'estoque-docs' }, ...tem.map((b) => h('a', { class: 'fonte-chip', href: `/arquivos/${b.arquivo}`, target: '_blank', rel: 'noopener' }, icone('texto', 14), b.titulo)))
        : null,
      tem.length < DOCUMENTOS.length
        ? h('p', { class: 'suave pequeno' }, `${DOCUMENTOS.length - tem.length} guia(s) oficial(is) sobre estoque, enchentes e água ainda não estão baixados. `, h('a', { href: '#/configurar' }, 'Instalar conteúdo'), ' (categoria "Alimentos, nutrição e estoque").')
        : null);
  }

  function imprimir() {
    const s = simular(e);
    const w = window.open('', '_blank');
    if (!w) return toast('O navegador bloqueou a janela de impressão.', 'erro');
    const linhas = e.itens.map((i) => `<tr><td>${TIPOS[i.tipo].nome}</td><td>${esc(i.nome)}</td><td>${fmt(num(i.qtd), 2)} ${esc(i.unidade || '')}</td><td>${num(i.planejado) ? `${fmt(num(i.planejado), 2)} ${esc(i.unidade || '')}` : ''}</td><td>${i.validade ? quando(dataDe(i.validade)) : 'indeterminada'}</td><td>${esc(i.pessoa || '')}</td><td></td></tr>`).join('');
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Estoque de emergência</title><style>body{font:14px sans-serif;margin:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:4px 6px;text-align:left}</style>
<h1>Estoque de emergência</h1><p>${quando(Date.now())} · dura ${dias(s.total)} (água ${dias(s.agua.dias)}, comida ${dias(s.comida.dias)}) para ${s.n.gente} pessoa(s).</p>
<table><tr><th>Tipo</th><th>Item</th><th>Tenho</th><th>Quero ter</th><th>Validade</th><th>Para quem</th><th>Conferido ✓</th></tr>${linhas}</table>
<p>Emergência: SAMU 192 · Bombeiros 193 · Defesa Civil 199</p>`);
    w.document.close();
    w.print();
  }
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  function desenhar() { desenharResumo(); desenharListas(); desenharKit(); desenharLongo(); }
  function desenharTudo() { desenharPessoas(); desenhar(); }
  desenharTudo(); desenharSaude(); desenharDicas(); desenharDocs(); desenharHistorico();
  return () => { if (timer) { clearTimeout(timer); gravar(); } };
}
