// Contexto do usuário para o assistente: o que está acontecendo com ele agora, montado a cada pergunta
// só com dados deste computador (nada sai daqui).
//
// Não é "treinamento" da IA (isso exigiria placa de vídeo forte, horas de processamento e um modelo
// novo a cada arquivo). Em vez disso, a cada pergunta o assistente recebe:
//   1. a situação do usuário (emergência marcada, família, estoque, onde mora, o que está lendo);
//   2. uma busca nas fontes guiada por essa situação (ex.: "enchente" puxa as orientações da Defesa Civil).
// O usuário vê e escolhe o que entra (tela Assistente → "O assistente está considerando").
import fsp from 'node:fs/promises';
import path from 'node:path';
import { DADOS, lerJSON } from './util.js';
import { EMERGENCIAS, emergenciaPorId } from '../public/js/emergencias-dados.js';

export const OPCOES_PADRAO = { emergencia: true, familia: true, estoque: true, local: true, lendo: true };

export const ESTADOS = [
  ['AC', 'Acre'], ['AL', 'Alagoas'], ['AP', 'Amapá'], ['AM', 'Amazonas'], ['BA', 'Bahia'], ['CE', 'Ceará'],
  ['DF', 'Distrito Federal'], ['ES', 'Espírito Santo'], ['GO', 'Goiás'], ['MA', 'Maranhão'], ['MT', 'Mato Grosso'],
  ['MS', 'Mato Grosso do Sul'], ['MG', 'Minas Gerais'], ['PA', 'Pará'], ['PB', 'Paraíba'], ['PR', 'Paraná'],
  ['PE', 'Pernambuco'], ['PI', 'Piauí'], ['RJ', 'Rio de Janeiro'], ['RN', 'Rio Grande do Norte'],
  ['RS', 'Rio Grande do Sul'], ['RO', 'Rondônia'], ['RR', 'Roraima'], ['SC', 'Santa Catarina'], ['SP', 'São Paulo'],
  ['SE', 'Sergipe'], ['TO', 'Tocantins'],
];
const NOME_UF = Object.fromEntries(ESTADOS);

const normalizar = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const palavras = (s) => normalizar(s).split(/[^a-z0-9]+/).filter((t) => t.length > 2);

// Palavras comuns demais para dizer de qual emergência a pergunta trata.
const GENERICAS = new Set(['agua', 'limpeza', 'desinfeccao', 'defesa', 'civil', 'desastre', 'emergencia', 'sobrevivencia',
  'primeiros', 'socorros', 'energia', 'comida', 'saude', 'casa', 'area', 'risco', 'para', 'com', 'falta']);

/** Emergências de que a pergunta parece tratar (mesmo sem nenhuma marcada). */
export function emergenciasDaPergunta(pergunta) {
  const p = new Set(palavras(pergunta));
  const achadas = [];
  for (const e of EMERGENCIAS) {
    const gatilhos = new Set([...palavras(e.nome), ...(e.termos || []).flatMap(palavras)].filter((t) => !GENERICAS.has(t)));
    let n = 0;
    for (const t of gatilhos) if (p.has(t)) n++;
    if (n) achadas.push([n, e]);
  }
  return achadas.sort((a, b) => b[0] - a[0]).slice(0, 2).map(([, e]) => e);
}

const data = (ms) => new Date(ms).toLocaleDateString('pt-BR');

async function familia(arqEstoque) {
  const nutri = await lerJSON(path.join(DADOS, 'nutricao.json'), { pessoas: [] });
  const pessoas = Array.isArray(nutri.pessoas) ? nutri.pessoas : [];
  if (pessoas.length) {
    const idades = pessoas.map((p) => Number(p.idade)).filter((n) => Number.isFinite(n) && n >= 0);
    const partes = [];
    const criancas = idades.filter((n) => n < 12);
    const idosos = idades.filter((n) => n >= 60);
    if (criancas.length) partes.push(`${criancas.length} criança(s) (${criancas.map((n) => (n < 1 ? 'bebê' : `${n} anos`)).join(', ')})`);
    if (idosos.length) partes.push(`${idosos.length} idoso(s) (${idosos.map((n) => `${n} anos`).join(', ')})`);
    const gestantes = pessoas.filter((p) => p.gestante).length;
    const amamentando = pessoas.filter((p) => p.lactante).length;
    if (gestantes) partes.push(`${gestantes} gestante(s)`);
    if (amamentando) partes.push(`${amamentando} amamentando`);
    return `${pessoas.length} pessoa(s) em casa${partes.length ? `: ${partes.join(', ')}` : ''}.`;
  }
  // Sem cadastro em "Saúde e nutrição": usa as pessoas do estoque.
  const e = await lerJSON(arqEstoque, null);
  const q = e?.pessoas;
  if (!q) return null;
  const n = (v) => Math.max(0, Number(v) || 0);
  const total = n(q.adultos) + n(q.criancas) + n(q.idosos);
  if (!total && !n(q.pets)) return null;
  const partes = [n(q.adultos) && `${n(q.adultos)} adulto(s)`, n(q.criancas) && `${n(q.criancas)} criança(s)`,
    n(q.idosos) && `${n(q.idosos)} idoso(s)`, n(q.pets) && `${n(q.pets)} animal(is) de estimação`].filter(Boolean);
  return `${partes.join(', ')} em casa.`;
}

async function estoque(arqEstoque) {
  const e = await lerJSON(arqEstoque, null);
  const ult = Array.isArray(e?.historico) ? e.historico[e.historico.length - 1] : null;
  if (!ult || !Number.isFinite(Number(ult.dias))) return null;
  const quando = ult.data ? ` (conferido em ${new Date(`${ult.data}T12:00:00`).toLocaleDateString('pt-BR')})` : '';
  const agua = Number(ult.agua) ? `; ${Math.round(ult.agua)} litros de água guardados` : '';
  return `o estoque de emergência dá para cerca de ${Math.round(ult.dias)} dia(s) para ${ult.pessoas || '?'} pessoa(s)${agua}${quando}.`;
}

/** Documento lido nos últimos 3 dias (dados/leitura guarda a última página de cada um). */
async function lendo(obterItem) {
  const pasta = path.join(DADOS, 'leitura');
  let nomes = [];
  try {
    nomes = await fsp.readdir(pasta);
  } catch {
    return null;
  }
  let melhor = null;
  for (const nome of nomes) {
    const m = /^([\w.-]+)\.json$/.exec(nome);
    if (!m) continue;
    const d = await lerJSON(path.join(pasta, nome), null);
    if (d?.atualizado && (!melhor || d.atualizado > melhor.atualizado)) melhor = { id: m[1], ...d };
  }
  if (!melhor || Date.now() - melhor.atualizado > 3 * 864e5) return null;
  const it = await obterItem(melhor.id);
  if (!it) return null;
  const notas = (melhor.notas || []).slice(-3).map((n) => (n.nota || n.trecho || '').replace(/\s+/g, ' ').slice(0, 200)).filter(Boolean);
  return {
    id: melhor.id,
    texto: `“${it.titulo}”${melhor.ultima > 1 ? ` (parou na página ${melhor.ultima})` : ''}, aberto em ${data(melhor.atualizado)}.`
      + (notas.length ? ` Notas recentes dele: ${notas.map((n) => `“${n}”`).join('; ')}.` : ''),
  };
}

/**
 * Monta o contexto. Devolve:
 *  itens       — [{ id, rotulo, texto }] o que vai para a IA (só os ligados e disponíveis);
 *  todos       — [{ id, rotulo, texto|null, ligado }] para a tela mostrar;
 *  termos      — palavras extras para guiar a busca nas fontes;
 *  consulta    — frase extra para a busca por significado;
 *  docLendo    — id do documento aberto (a busca dá preferência a ele);
 *  local       — { uf, nomeUf, cidade } (a busca dá preferência à Defesa Civil daqui);
 *  emergencia  — há emergência marcada ou detectada na pergunta (prioriza orientações da Defesa Civil).
 */
export async function montarContexto({ config, pergunta = '', arqEstoque, arqEmergencia, obterItem }) {
  const op = { ...OPCOES_PADRAO, ...(config.contexto || {}) };
  const todos = [];
  const termos = [];
  const consulta = [];

  const { ativas = [] } = await lerJSON(arqEmergencia, { ativas: [] });
  const marcadas = ativas.map(emergenciaPorId).filter(Boolean);
  todos.push({ id: 'emergencia', rotulo: 'Emergência marcada', ligado: op.emergencia, texto: marcadas.length ? marcadas.map((e) => e.nome).join(', ') : null });
  const daPergunta = emergenciasDaPergunta(pergunta);
  // A emergência marcada só guia a busca quando a pergunta não for claramente sobre outra.
  const guias = daPergunta.length ? daPergunta : op.emergencia ? marcadas : [];
  for (const e of guias) {
    termos.push(...(e.termos || []));
    consulta.push(e.nome);
  }

  const fam = await familia(arqEstoque).catch(() => null);
  todos.push({ id: 'familia', rotulo: 'Família', ligado: op.familia, texto: fam });

  const est = await estoque(arqEstoque).catch(() => null);
  todos.push({ id: 'estoque', rotulo: 'Estoque', ligado: op.estoque, texto: est });

  const uf = NOME_UF[config.local?.uf] ? config.local.uf : '';
  const cidade = String(config.local?.cidade || '').trim().slice(0, 80);
  const local = uf || cidade ? { uf, nomeUf: NOME_UF[uf] || '', cidade } : null;
  todos.push({ id: 'local', rotulo: 'Onde mora', ligado: op.local, texto: local ? [cidade, uf].filter(Boolean).join(' – ') : null });

  const doc = await lendo(obterItem).catch(() => null);
  todos.push({ id: 'lendo', rotulo: 'Lendo agora', ligado: op.lendo, texto: doc?.texto || null });

  const itens = todos.filter((t) => t.ligado && t.texto);
  return {
    itens,
    todos,
    termos: [...new Set(termos)],
    consulta: consulta.join(', '),
    docLendo: op.lendo ? doc?.id || null : null,
    local: op.local ? local : null,
    emergencia: guias.length > 0,
    guias: guias.slice(0, 2).map((e) => ({ nome: e.nome, agora: e.agora || [], depois: e.depois || [] })),
    marcadas: op.emergencia ? marcadas : [],
  };
}

/** Texto para o assistente (vai junto com as instruções). Vazio se não houver nada. */
export function textoContexto(ctx) {
  const linhas = [];
  if (ctx.marcadas.length) {
    linhas.push(`- Emergência marcada agora: ${ctx.marcadas.map((e) => e.nome).join(', ')}.`);
  }
  for (const it of ctx.itens) {
    if (it.id === 'emergencia') continue;
    if (it.id === 'familia') linhas.push(`- Família: ${it.texto}`);
    if (it.id === 'estoque') linhas.push(`- Estoque: ${it.texto}`);
    if (it.id === 'local') linhas.push(`- Mora em: ${it.texto}.`);
    if (it.id === 'lendo') linhas.push(`- Está lendo: ${it.texto}`);
  }
  // Passos já revisados do Protocolo Zero (Defesa Civil / saúde) para a emergência do assunto:
  // um modelo pequeno segue melhor uma lista curta do que trechos soltos das fontes.
  const guias = (ctx.guias || []).map((g) => `
ORIENTAÇÃO OFICIAL PARA "${g.nome.toUpperCase()}" (resumo revisado da Defesa Civil e da saúde; siga esta ordem e nunca diga o contrário):
O que fazer agora:
${g.agora.map((p) => `- ${p}`).join('\n')}${g.depois.length ? `
Depois:
${g.depois.map((p) => `- ${p}`).join('\n')}` : ''}
Comece a resposta por estes passos, com as suas palavras, e complete com as FONTES. Não invente passos arriscados (subir na encosta, entrar na água, mexer em fios).`).join('\n');
  if (!linhas.length) return guias;
  let t = `

SITUAÇÃO DO USUÁRIO (ele mesmo informou no Protocolo Zero; use para adaptar a resposta, sem repetir estes dados à toa):
${linhas.join('\n')}
Leve isso em conta quando fizer diferença: cuidados com crianças, idosos, gestantes e animais; quanto tempo o estoque dura; orientações da Defesa Civil do estado e da cidade dele (quando houver nas FONTES).`;
  if (ctx.marcadas.length) {
    t += `
Como há emergência marcada: quando a pergunta tiver relação com ela, comece pelo que fazer AGORA para ficar seguro, em passos curtos, e lembre dos números (SAMU 192, Bombeiros 193, Defesa Civil 199) quando couber.
Siga as orientações oficiais (Defesa Civil, Ministério da Saúde) das FONTES. Se a pergunta for sobre outro assunto, responda normalmente.`;
  }
  return t + guias;
}
