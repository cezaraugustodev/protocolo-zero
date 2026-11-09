// "Energia sem rede elétrica": recomenda um kit solar portátil para manter o Protocolo Zero
// (e o essencial da casa) funcionando durante uma queda de energia longa.
import { h, icone } from './ui.js';
import { api } from './api.js';

const BATERIAS = [256, 300, 500, 700, 1000, 1500, 2000, 3000, 5000];
const PAINEIS = [60, 100, 120, 160, 200, 300, 400, 600, 800, 1200];
const ESSENCIAIS = { wh: 155, desc: '2 celulares, 3 lâmpadas LED por 5 h e um rádio' };
const PERDAS = 1.2; // inversor, cabos, bateria
const EFICIENCIA_PAINEL = 0.75; // calor, sujeira, ângulo

const proximo = (lista, v) => lista.find((x) => x >= v) || lista.at(-1);
const num = (n) => Math.round(n).toLocaleString('pt-BR');

export async function secaoEnergia() {
  let perfil;
  try {
    perfil = await api.get('/api/energia');
  } catch {
    return null;
  }
  // Manuais de energia (CRESESB, Embrapa…) já baixados? Senão, o botão leva à instalação.
  const temManuais = (await api.get('/api/biblioteca').catch(() => [])).some((i) => i.categoria === 'energia');
  let horas = 4;
  let comEssenciais = true;
  let preferirFixo = false;
  try {
    const p = JSON.parse(localStorage.getItem('pz-energia') || '{}');
    horas = p.horas || horas;
    comEssenciais = p.comEssenciais ?? comEssenciais;
  } catch {}

  const corpo = h('div');
  const raiz = h('section', { class: 'energia' },
    h('div', { class: 'linha entre', style: { marginBottom: '12px' } },
      h('div', {}, h('div', { class: 'sobretitulo' }, 'Autossuficiência'), h('h2', {}, 'Energia sem rede elétrica')),
      h('small', {}, 'Para manter o Protocolo Zero ligado num apagão longo.')),
    corpo);

  function calcular() {
    const { uso, ia } = perfil.watts;
    const hIA = Math.min(1, horas / 4); // ~1 h de perguntas ao assistente por dia
    const whPc = uso * (horas - hIA) + ia * hIA;
    const whDia = whPc + (comEssenciais ? ESSENCIAIS.wh : 0);
    const bateria = proximo(BATERIAS, whDia * PERDAS);
    const painel = proximo(PAINEIS, (whDia * PERDAS) / (perfil.horasSol * EFICIENCIA_PAINEL));
    const geracao = painel * perfil.horasSol * EFICIENCIA_PAINEL;
    preferirFixo = bateria >= 2000;
    return { hIA, whPc, whDia, bateria, painel, geracao };
  }

  function salvar() {
    try {
      localStorage.setItem('pz-energia', JSON.stringify({ horas, comEssenciais }));
    } catch {}
  }

  function desenhar() {
    const c = calcular();
    const seletorHoras = h('div', { class: 'segmentado' },
      [2, 4, 8].map((n) =>
        h('button', { class: n === horas ? 'ativo' : '', onclick: () => ((horas = n), salvar(), desenhar()) }, `${n} h/dia`)));
    const essenciais = h('label', { class: 'linha', style: { gap: '8px', fontSize: '13.5px' } },
      h('input', { type: 'checkbox', checked: comEssenciais, onchange: (e) => ((comEssenciais = e.target.checked), salvar(), desenhar()) }),
      `Incluir o essencial da casa (${ESSENCIAIS.desc})`);

    corpo.replaceChildren(
      h('div', { class: 'grade c3 energia-grade' },
        // 1. este computador
        h('article', { class: 'cartao pilha' },
          h('div', { class: 'titulo' }, h('span', { class: 'icone-bolha ceu' }, icone('computador', 18)), h('b', {}, 'Este computador')),
          h('div', { class: 'energia-numero' }, h('b', {}, `~${perfil.watts.uso} W`), h('span', {}, 'lendo e pesquisando')),
          h('div', { class: 'energia-numero' }, h('b', {}, `~${perfil.watts.ia} W`), h('span', {}, 'enquanto a IA responde')),
          h('small', { class: 'suave' }, `Detectado: ${perfil.tipo}${perfil.gpuDedicada ? ' com placa de vídeo dedicada' : ''}. Estimativa, não medição.`)),
        // 2. kit recomendado
        h('article', { class: 'cartao pilha energia-kit' },
          h('div', { class: 'titulo' }, h('span', { class: 'icone-bolha alerta' }, icone('sol', 18)), h('b', {}, preferirFixo ? 'Kit solar recomendado (fixo)' : 'Kit solar portátil recomendado')),
          h('div', { class: 'energia-item' }, h('b', {}, `Painel solar ${preferirFixo ? '' : 'dobrável '}de ${num(c.painel)} W ou mais`),
            h('span', {}, `Gera ~${num(c.geracao)} Wh por dia com ${String(perfil.horasSol).replace('.', ',')} h de sol`)),
          h('div', { class: 'energia-item' }, h('b', {}, preferirFixo ? `Bateria LiFePO4 de ${num(c.bateria)} Wh ou mais` : `Estação de energia portátil de ${num(c.bateria)} Wh ou mais`),
            h('span', {}, preferirFixo ? 'Com controlador de carga MPPT e inversor de onda senoidal pura' : 'Bateria LiFePO4 (dura 3.000+ ciclos), com tomada e USB-C')),
          h('small', { class: 'suave' }, `Consumo previsto: ~${num(c.whDia)} Wh/dia (computador ~${num(c.whPc)} Wh${comEssenciais ? ` + essenciais ${ESSENCIAIS.wh} Wh` : ''}). A bateria cobre 1 dia sem sol.`)),
        // 3. dicas
        h('article', { class: 'cartao pilha' },
          h('div', { class: 'titulo' }, h('span', { class: 'icone-bolha musgo' }, icone('ok', 18)), h('b', {}, 'Para a energia render mais')),
          h('ul', { class: 'energia-dicas' },
            perfil.portatil
              ? h('li', {}, 'Notebook gasta até 5× menos que computador de mesa. Carregue-o pelo USB-C (PD 65 W) direto da estação, sem o inversor.')
              : h('li', {}, 'Num apagão, prefira um notebook: gasta até 5× menos que um computador de mesa com monitor.'),
            h('li', {}, 'A IA é o que mais consome. Para consultas rápidas, use a busca da Biblioteca.'),
            h('li', {}, 'Carregue baterias e celulares nas horas de sol forte (10 h às 15 h).'),
            h('li', {}, 'Nobreak comum dura minutos, não horas: não substitui uma bateria solar.'),
            h('li', {}, h('b', {}, 'Gerador a combustão só ao ar livre: '), 'o monóxido de carbono mata em ambiente fechado.')))),
      h('div', { class: 'linha entre energia-controles' },
        h('div', { class: 'linha', style: { gap: '10px', flexWrap: 'wrap' } }, h('span', { class: 'suave' }, 'Uso do computador:'), seletorHoras, essenciais),
        temManuais
          ? h('a', { class: 'botao pequeno', href: '#/biblioteca/energia' }, icone('livro', 14), 'Manuais de energia solar')
          : h('a', { class: 'botao pequeno', href: '#/configurar' }, icone('baixar', 14), 'Baixar manuais de energia solar (CRESESB)')));
  }

  desenhar();
  return raiz;
}
