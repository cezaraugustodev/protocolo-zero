// Cálculos de nutrição por pessoa. Usado na tela "Saúde e nutrição" e no Estoque de emergência.
// Referências (fontes oficiais/científicas):
// - Gasto de energia em repouso: equações de Schofield adotadas pela FAO/OMS/UNU (1985, mantidas em 2001).
// - Nível de atividade física (PAL): FAO/OMS/UNU 2001.
// - Proteína, fibras, vitaminas e minerais: Ingestões Dietéticas de Referência (DRI/IOM, EUA/Canadá),
//   usadas também como referência pela Anvisa e pelo Ministério da Saúde.
// - IMC: classificação da OMS para adultos; para idosos (60+), pontos de corte do SISVAN/Ministério da Saúde.
// São médias para pessoas saudáveis: não servem para tratar doença. Não substituem nutricionista ou médico.

export const ATIVIDADES = [
  ['sedentario', 'Parado quase o dia todo (sentado, deitado)', 1.4],
  ['leve', 'Leve (anda um pouco, serviço de casa)', 1.55],
  ['moderado', 'Moderado (trabalho em pé, caminhadas longas)', 1.75],
  ['intenso', 'Pesado (roça, obra, carregar peso, muito exercício)', 2.0],
];

// Schofield (FAO/OMS/UNU): kcal/dia = a × peso(kg) + b, por sexo e faixa de idade.
const SCHOFIELD = {
  m: [[3, 59.512, -30.4], [10, 22.706, 504.3], [18, 17.686, 658.2], [30, 15.057, 692.2], [60, 11.472, 873.1], [Infinity, 11.711, 587.7]],
  f: [[3, 58.317, -31.1], [10, 20.315, 485.9], [18, 13.384, 692.6], [30, 14.818, 486.6], [60, 8.126, 845.6], [Infinity, 9.082, 658.5]],
};

// Proteína (g por kg de peso por dia) — DRI; idosos: 1,0 g/kg (recomendação para manter músculos).
function proteinaPorKg(idade, p) {
  if (p.gestante || p.lactante) return 1.1;
  if (idade < 1) return 1.5;
  if (idade < 4) return 1.05;
  if (idade < 14) return 0.95;
  if (idade < 19) return 0.85;
  if (idade >= 60) return 1.0;
  return 0.8;
}

// Vitaminas e minerais principais (DRI, adultos e adolescentes 14+). Unidades: mg ou µg.
export function micronutrientes(p) {
  const idade = +p.idade;
  if (!(idade >= 14)) return null;
  const f = p.sexo === 'f';
  const adulto = idade >= 19;
  const r = [
    ['Vitamina C', f ? (adulto ? 75 : 65) : (adulto ? 90 : 75), 'mg', 'Frutas cítricas, goiaba, acerola, caju, tomate, couve. A falta causa escorbuto (sangramento na gengiva) em poucos meses.'],
    ['Ferro', f ? (adulto && idade <= 50 ? 18 : adulto ? 8 : 15) : (adulto ? 8 : 11), 'mg', 'Feijão, carnes, fígado, folhas verde-escuras. A falta causa anemia (cansaço, palidez).'],
    ['Cálcio', idade < 19 ? 1300 : (idade > 70 || (f && idade > 50) ? 1200 : 1000), 'mg', 'Leite, queijo, iogurte, sardinha com espinha, couve.'],
    ['Vitamina A', f ? 700 : 900, 'µg', 'Cenoura, abóbora, manga, folhas verde-escuras, fígado, ovo.'],
    ['Vitamina D', idade > 70 ? 20 : 15, 'µg', 'Sol na pele (15 min por dia), peixes, ovo.'],
    ['Zinco', f ? (adulto ? 8 : 9) : 11, 'mg', 'Carnes, feijão, castanhas, sementes.'],
    ['Folato (ácido fólico)', 400, 'µg', 'Feijão, lentilha, folhas verdes. Gestantes precisam mais.'],
    ['Vitamina B12', 2.4, 'µg', 'Só em alimentos de origem animal (carne, ovo, leite).'],
    ['Iodo', 150, 'µg', 'Sal iodado (o sal comum no Brasil é iodado).'],
  ];
  if (p.gestante) {
    r.find((x) => x[0] === 'Ferro')[1] = 27;
    r.find((x) => x[0].startsWith('Folato'))[1] = 600;
    r.find((x) => x[0] === 'Iodo')[1] = 220;
    r.find((x) => x[0] === 'Vitamina C')[1] = 85;
  }
  if (p.lactante) {
    r.find((x) => x[0] === 'Ferro')[1] = 9;
    r.find((x) => x[0].startsWith('Folato'))[1] = 500;
    r.find((x) => x[0] === 'Iodo')[1] = 290;
    r.find((x) => x[0] === 'Vitamina C')[1] = 120;
  }
  return r.map(([nome, valor, unidade, fontes]) => ({ nome, valor, unidade, fontes }));
}

/** Classificação do IMC. Adultos: OMS. Idosos (60+): SISVAN/Ministério da Saúde. Menores de 20: curvas por idade. */
export function classificarImc(imc, idade, p = {}) {
  if (!Number.isFinite(imc)) return null;
  if (p.gestante) return { nome: 'Gestante: use a curva de ganho de peso da Caderneta da Gestante', nivel: 'info' };
  if (idade < 20) return { nome: 'Menores de 20 anos: veja o IMC na curva por idade da Caderneta da Criança ou do Adolescente', nivel: 'info' };
  if (idade >= 60) {
    if (imc <= 22) return { nome: 'Baixo peso (idoso)', nivel: 'alerta', dica: 'Risco de desnutrição: aumente a comida e procure a unidade de saúde.' };
    if (imc < 27) return { nome: 'Peso adequado (idoso)', nivel: 'ok' };
    return { nome: 'Sobrepeso (idoso)', nivel: 'alerta' };
  }
  const t = [
    [16, 'Magreza grave', 'perigo', 'Desnutrição grave: procure atendimento de saúde.'],
    [17, 'Magreza moderada', 'perigo', 'Desnutrição: aumente a comida e procure a unidade de saúde.'],
    [18.5, 'Magreza leve', 'alerta', 'Abaixo do peso: coma mais vezes ao dia e inclua alimentos com mais energia e proteína.'],
    [25, 'Peso adequado', 'ok', 'Peso dentro do esperado para a altura.'],
    [30, 'Sobrepeso', 'alerta', 'Acima do peso.'],
    [35, 'Obesidade grau I', 'alerta', 'Procure orientação na unidade de saúde.'],
    [40, 'Obesidade grau II', 'perigo', 'Procure orientação na unidade de saúde.'],
    [Infinity, 'Obesidade grau III', 'perigo', 'Procure orientação na unidade de saúde.'],
  ];
  const [, nome, nivel, dica] = t.find(([lim]) => imc < lim);
  return { nome, nivel, dica };
}

/** Necessidades diárias médias de uma pessoa. */
export function calcularPessoa(p) {
  const idade = +p.idade;
  const peso = +p.peso;
  const altura = +p.altura / 100;
  if (!(idade >= 0) || !(peso > 0)) return null;
  const faixa = SCHOFIELD[p.sexo === 'f' ? 'f' : 'm'].find(([lim]) => idade < lim);
  const repouso = Math.max(0, faixa[1] * peso + faixa[2]);
  const pal = idade < 3 ? 1.0 : (ATIVIDADES.find((a) => a[0] === p.atividade) || ATIVIDADES[1])[2];
  // Bebês e crianças pequenas: o repouso de Schofield já inclui o crescimento de forma aproximada.
  let kcal = idade < 3 ? repouso * 1.4 : repouso * pal;
  // Gestação (2º e 3º trimestres) e amamentação: energia extra (FAO/OMS/UNU 2001 e DRI).
  let extra = '';
  if (p.gestante === '2') { kcal += 340; extra = '+340 kcal (2º trimestre)'; }
  if (p.gestante === '3') { kcal += 452; extra = '+452 kcal (3º trimestre)'; }
  if (p.gestante === '1') extra = '1º trimestre: sem energia extra';
  if (p.lactante) { kcal += 330; extra = '+330 kcal (amamentando)'; }
  const proteina = proteinaPorKg(idade, p) * peso + (p.gestante === '2' || p.gestante === '3' ? 25 : 0);
  const imc = altura > 0.4 ? peso / (altura * altura) : NaN;
  return {
    repouso: Math.round(repouso),
    kcal: Math.round(kcal),
    extra,
    proteina: Math.round(proteina),
    carboidratos: [Math.round((kcal * 0.45) / 4), Math.round((kcal * 0.65) / 4)],
    gorduras: [Math.round((kcal * 0.2) / 9), Math.round((kcal * 0.35) / 9)],
    fibras: Math.round((kcal / 1000) * 14),
    agua: Math.round(peso * (idade < 19 ? 40 : idade >= 60 ? 30 : 35)) / 1000,
    imc: Number.isFinite(imc) ? Math.round(imc * 10) / 10 : null,
    classe: classificarImc(imc, idade, p),
    pesoSaudavel: altura > 0.4 && idade >= 20 && idade < 60 && !p.gestante ? [Math.round(18.5 * altura * altura), Math.round(24.9 * altura * altura)] : null,
    micros: micronutrientes(p),
  };
}

/** Variação de peso: perda > 5% em 1 mês ou > 10% em 6 meses é sinal de desnutrição (critério clínico usado no SUS). */
export function alertaPeso(historico = []) {
  const h = historico.filter((x) => x.data && +x.peso > 0).sort((a, b) => a.data.localeCompare(b.data));
  if (h.length < 2) return null;
  const ultimo = h.at(-1);
  const t = (s) => new Date(`${s}T00:00:00`).getTime();
  const mes = 30.44 * 86400000;
  for (const [meses, lim] of [[1, 5], [6, 10]]) {
    const antes = [...h].reverse().find((x) => t(ultimo.data) - t(x.data) >= mes * meses * 0.8 && t(ultimo.data) - t(x.data) <= mes * meses * 1.5);
    if (!antes) continue;
    const perda = ((+antes.peso - +ultimo.peso) / +antes.peso) * 100;
    if (perda > lim) return { perda: Math.round(perda * 10) / 10, meses, texto: `Perdeu ${(Math.round(perda * 10) / 10).toLocaleString("pt-BR")}% do peso em cerca de ${meses === 1 ? '1 mês' : '6 meses'}: sinal de desnutrição. Aumente a comida e procure a unidade de saúde.` };
  }
  return null;
}
