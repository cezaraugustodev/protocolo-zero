// Saúde e nutrição: quanto cada pessoa da família precisa comer por dia, IMC e acompanhamento do peso.
// Fica salvo só neste computador (dados/nutricao.json). O Estoque de emergência pode usar estas pessoas.
import { h, icone, cabecalho, aviso, toast, confirmar } from '../ui.js';
import { api } from '../api.js';
import { ATIVIDADES, calcularPessoa, alertaPeso } from '../nutricao-calc.js';

const fmt = (n, c = 0) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: c });
const hojeIso = () => new Date().toISOString().slice(0, 10);
const novoId = () => Math.random().toString(36).slice(2, 10);
const NOVA = () => ({ id: novoId(), nome: '', sexo: 'f', idade: '', peso: '', altura: '', atividade: 'leve', gestante: '', lactante: false, pesos: [] });

export async function render(raiz) {
  let dados = { pessoas: [] };
  try { dados = await api.get('/api/nutricao'); } catch (e) { toast(e.message, 'erro'); }
  if (!Array.isArray(dados.pessoas)) dados.pessoas = [];
  let timer = null;
  const gravar = () => { timer = null; api.put('/api/nutricao', dados).catch((e) => toast(`Não salvou: ${e.message}`, 'erro')); };
  const salvar = () => { clearTimeout(timer); timer = setTimeout(gravar, 400); };

  raiz.append(
    cabecalho('Saúde', 'Saúde e nutrição',
      'Quanto cada pessoa precisa comer e beber por dia, o IMC e o acompanhamento do peso. Fica salvo só neste computador.'),
    aviso('', icone('alerta', 16), h('b', {}, 'Valores médios para pessoas saudáveis. '),
      'Não servem para tratar doenças, dietas especiais, bebês prematuros ou atletas. Em caso de doença, perda de peso sem motivo ou dúvida, procure a unidade de saúde ou um nutricionista.'),
  );
  const familia = h('div', { class: 'cartao nutri-familia' });
  const lista = h('div', { class: 'pilha' });
  const guia = h('div', { class: 'grade c2' });
  raiz.append(familia, lista, guia);

  function desenharFamilia() {
    const calc = dados.pessoas.map(calcularPessoa).filter(Boolean);
    const soma = (k) => calc.reduce((a, c) => a + c[k], 0);
    familia.replaceChildren(
      h('div', { class: 'linha entre', style: { flexWrap: 'wrap', gap: '8px' } },
        h('div', {}, h('h3', { style: { margin: 0 } }, 'Família'),
          h('small', { class: 'suave' }, calc.length ? `${calc.length} pessoa(s) com dados completos` : 'Adicione cada pessoa da casa.')),
        h('div', { class: 'linha', style: { gap: '8px' } },
          h('button', { class: 'botao primario', onclick: () => { dados.pessoas.push(NOVA()); salvar(); desenhar(); } }, icone('mais', 16), 'Adicionar pessoa'),
          h('a', { class: 'botao', href: '#/estoque' }, icone('pacote', 16), 'Estoque de emergência'))),
      calc.length ? h('div', { class: 'numeros', style: { marginTop: '12px' } },
        h('div', { class: 'numero' }, h('b', {}, `${fmt(soma('kcal'))} kcal`), h('span', {}, 'energia por dia (todos)')),
        h('div', { class: 'numero' }, h('b', {}, `${fmt(soma('proteina'))} g`), h('span', {}, 'proteína por dia')),
        h('div', { class: 'numero' }, h('b', {}, `${fmt(soma('agua'), 1)} L`), h('span', {}, 'água para beber por dia')),
        h('div', { class: 'numero' }, h('b', {}, `${fmt(soma('kcal') * 30 / 3580, 1)} kg`), h('span', {}, 'de arroz por mês, se fosse só arroz (comparação)'))) : null,
      calc.length ? h('p', { class: 'suave pequeno' }, 'O Estoque de emergência pode usar estas pessoas para calcular quanto tempo a comida dura (opção no cartão "Quem vai usar o estoque").') : null);
  }

  function cartaoPessoa(p) {
    const c = calcularPessoa(p);
    const mudar = (k, v) => { p[k] = v; salvar(); desenhar(); };
    const campo = (k, rot, props = {}) => h('label', { class: 'estoque-campo mini' }, h('span', {}, rot),
      h('input', { value: p[k] ?? '', ...props, onchange: (ev) => mudar(k, ev.target.value) }));
    const alerta = alertaPeso(p.pesos);
    const novoPeso = h('input', { type: 'number', min: 1, step: 0.1, placeholder: 'kg', style: { width: '90px' }, 'aria-label': 'Peso de hoje' });
    return h('div', { class: 'cartao nutri-pessoa' },
      h('div', { class: 'linha entre', style: { gap: '8px' } },
        h('input', { type: 'text', class: 'estoque-nome', placeholder: 'Nome (ex.: Maria)', value: p.nome, onchange: (ev) => mudar('nome', ev.target.value) }),
        h('button', { class: 'botao-icone', title: 'Remover pessoa', onclick: async () => {
          if (!(await confirmar(`Remover ${p.nome || 'esta pessoa'} e o histórico de peso?`, { botao: 'Remover', perigo: true }))) return;
          dados.pessoas = dados.pessoas.filter((x) => x !== p); salvar(); desenhar();
        } }, icone('lixo', 16))),
      h('div', { class: 'estoque-item-campos' },
        h('label', { class: 'estoque-campo mini' }, h('span', {}, 'Sexo'),
          h('select', { onchange: (ev) => mudar('sexo', ev.target.value) },
            h('option', { value: 'f', selected: p.sexo === 'f' }, 'Feminino'), h('option', { value: 'm', selected: p.sexo === 'm' }, 'Masculino'))),
        campo('idade', 'Idade (anos)', { type: 'number', min: 0, max: 120, step: 1 }),
        campo('peso', 'Peso (kg)', { type: 'number', min: 1, max: 400, step: 0.1 }),
        campo('altura', 'Altura (cm)', { type: 'number', min: 30, max: 250, step: 1 }),
        h('label', { class: 'estoque-campo mini' }, h('span', {}, 'Atividade no dia a dia'),
          h('select', { onchange: (ev) => mudar('atividade', ev.target.value) }, ATIVIDADES.map(([id, nome]) => h('option', { value: id, selected: p.atividade === id }, nome)))),
        p.sexo === 'f' && +p.idade >= 12 && +p.idade <= 55 ? h('label', { class: 'estoque-campo mini' }, h('span', {}, 'Gestação ou amamentação'),
          h('select', { onchange: (ev) => { const v = ev.target.value; p.gestante = ['1', '2', '3'].includes(v) ? v : ''; p.lactante = v === 'amamentando'; salvar(); desenhar(); } },
            h('option', { value: '' }, 'Não'),
            h('option', { value: '1', selected: p.gestante === '1' }, 'Gestante — 1º trimestre'),
            h('option', { value: '2', selected: p.gestante === '2' }, 'Gestante — 2º trimestre'),
            h('option', { value: '3', selected: p.gestante === '3' }, 'Gestante — 3º trimestre'),
            h('option', { value: 'amamentando', selected: !!p.lactante }, 'Amamentando'))) : null),
      !c ? h('p', { class: 'suave' }, 'Preencha idade e peso para ver as necessidades.') : h('div', { class: 'pilha' },
        h('div', { class: 'numeros' },
          h('div', { class: 'numero' }, h('b', {}, `${fmt(c.kcal)} kcal`), h('span', {}, 'energia por dia'), c.extra ? h('small', {}, c.extra) : null),
          h('div', { class: 'numero' }, h('b', {}, `${fmt(c.proteina)} g`), h('span', {}, 'proteína por dia')),
          h('div', { class: 'numero' }, h('b', {}, `${fmt(c.agua, 1)} L`), h('span', {}, 'água para beber por dia')),
          c.imc ? h('div', { class: `numero nutri-imc ${c.classe?.nivel || ''}` }, h('b', {}, `IMC ${fmt(c.imc, 1)}`), h('span', {}, c.classe?.nome || '')) : null),
        c.classe?.dica ? h('p', { class: `estoque-falta ${c.classe.nivel === 'perigo' ? 'perigo' : ''}` }, icone(c.classe.nivel === 'ok' ? 'ok' : 'alerta', 16), c.classe.dica) : null,
        c.pesoSaudavel ? h('small', { class: 'suave' }, `Peso adequado para esta altura (IMC 18,5 a 24,9): de ${c.pesoSaudavel[0]} a ${c.pesoSaudavel[1]} kg.`) : null,
        h('details', { class: 'nutri-detalhes' },
          h('summary', {}, 'Ver nutrientes do dia (carboidratos, gorduras, fibras, vitaminas e minerais)'),
          h('table', { class: 'estoque-historico' },
            h('tr', {}, h('th', {}, 'Nutriente'), h('th', {}, 'Por dia'), h('th', {}, 'Onde encontrar')),
            h('tr', {}, h('td', {}, 'Carboidratos'), h('td', {}, `${c.carboidratos[0]} a ${c.carboidratos[1]} g`), h('td', {}, 'Arroz, feijão, mandioca, milho, pão, frutas (45 a 65% da energia).')),
            h('tr', {}, h('td', {}, 'Gorduras'), h('td', {}, `${c.gorduras[0]} a ${c.gorduras[1]} g`), h('td', {}, 'Óleo, castanhas, carnes, leite (20 a 35% da energia).')),
            h('tr', {}, h('td', {}, 'Fibras'), h('td', {}, `≈ ${c.fibras} g`), h('td', {}, 'Feijão, verduras, frutas, aveia, integrais.')),
            ...(c.micros || []).map((m) => h('tr', {}, h('td', {}, m.nome), h('td', {}, `${fmt(m.valor, 1)} ${m.unidade}`), h('td', {}, m.fontes)))),
          !c.micros ? h('p', { class: 'suave pequeno' }, 'Para crianças, as vitaminas e minerais variam com a idade: siga a Caderneta da Criança.') : null,
          h('p', { class: 'suave pequeno' }, `Energia: gasto em repouso ${fmt(c.repouso)} kcal (equação da FAO/OMS) × nível de atividade. Proteína, fibras, vitaminas e minerais: valores de referência (DRI) usados pela Anvisa.`))),
      h('div', { class: 'nutri-peso' },
        h('b', {}, 'Acompanhar o peso'),
        h('div', { class: 'linha', style: { gap: '6px', flexWrap: 'wrap' } },
          novoPeso,
          h('button', { class: 'botao pequeno', onclick: () => {
            const v = +novoPeso.value;
            if (!(v > 0)) return novoPeso.focus();
            p.pesos = [...(p.pesos || []).filter((x) => x.data !== hojeIso()), { data: hojeIso(), peso: v }].slice(-120);
            p.peso = v; salvar(); desenhar();
          } }, 'Anotar peso de hoje'),
          (p.pesos || []).length ? h('small', { class: 'suave' }, (p.pesos || []).slice(-6).map((x) => `${new Date(`${x.data}T00:00:00`).toLocaleDateString('pt-BR')}: ${fmt(x.peso, 1)} kg`).join(' · ')) : h('small', { class: 'suave' }, 'Pese a cada 2 a 4 semanas, de manhã, na mesma balança.')),
        alerta ? h('p', { class: 'estoque-falta perigo' }, icone('alerta', 16), alerta.texto) : null));
  }

  function desenharLista() {
    lista.replaceChildren(...dados.pessoas.map(cartaoPessoa));
    if (!dados.pessoas.length) lista.append(h('div', { class: 'cartao vazio' }, icone('coracao', 40), h('h3', {}, 'Nenhuma pessoa ainda'), h('p', {}, 'Clique em "Adicionar pessoa" e preencha idade, peso e altura.')));
  }

  function desenharGuia() {
    guia.replaceChildren(
      h('div', { class: 'cartao' },
        h('h3', {}, icone('folha', 18), ' Alimentação está boa?'),
        h('ul', { class: 'energia-dicas' },
          h('li', {}, h('b', {}, 'Base: '), 'comida de verdade, como no Guia Alimentar do Ministério da Saúde: arroz e feijão, legumes, verduras, frutas, ovos, leite, carnes ou peixe.'),
          h('li', {}, h('b', {}, 'Todo dia: '), 'uma fonte de proteína (feijão, ovo, carne, peixe, leite), uma fruta ou verdura com vitamina C e água tratada.'),
          h('li', {}, h('b', {}, 'Em racionamento: '), 'divida a comida pela necessidade de cada um. Crianças, gestantes, quem amamenta e idosos não devem ficar com menos que o necessário.'),
          h('li', {}, h('b', {}, 'Sinais de desnutrição: '), 'perda de peso, cansaço, roupas folgadas, inchaço nas pernas, feridas que não saram, sangramento na gengiva, cabelo que cai, criança que para de crescer ou fica apática.'),
          h('li', {}, h('b', {}, 'Criança com diarreia: '), 'continue dando comida e líquidos e use o soro de reidratação oral. Procure atendimento se houver sinais de desidratação.'))),
      h('div', { class: 'cartao' },
        h('h3', {}, icone('livro', 18), ' Leia na Biblioteca (offline)'),
        h('ul', { class: 'energia-dicas' },
          h('li', {}, h('a', { href: '#/biblioteca/alimentos' }, 'Guia Alimentar para a População Brasileira'), ' (Ministério da Saúde)'),
          h('li', {}, h('a', { href: '#/biblioteca/saude' }, 'Onde não há médico'), ' — capítulos de nutrição (Hesperian)'),
          h('li', {}, h('a', { href: '#/assistente' }, 'Pergunte ao assistente'), ': "o que comer com pouco dinheiro", "alimentação de bebê de 6 meses"…'))));
  }

  function desenhar() { desenharFamilia(); desenharLista(); }
  desenhar(); desenharGuia();
  return () => { if (timer) { clearTimeout(timer); gravar(); } };
}
