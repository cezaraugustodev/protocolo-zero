// "Inteligência" de escolha do modelo de IA: compara o que está instalado com o que este
// computador aguenta, mede a velocidade real e sugere trocas (mais preciso ou mais rápido).
import path from 'node:path';
import { DADOS, lerJSON, gravarJSON } from './util.js';

const ARQ = path.join(DADOS, 'desempenho.json');
const GB = 1024 ** 3;

// Abaixo disso a resposta fica lenta demais para conversar (tokens/segundo).
export const TPS_MINIMO = 3;
// Modelos menores que isso costumam errar fatos, números e doses.
export const PARAMS_CONFIAVEL = 2.5;

let cache = null;
async function desempenho() {
  if (!cache) cache = await lerJSON(ARQ, {});
  return cache;
}

/** Guarda a velocidade medida (média móvel) para o modelo. */
export async function registrarVelocidade(modelo, stats) {
  if (!modelo || !stats?.tps || stats.tokens < 8) return;
  const d = await desempenho();
  const chave = semTag(modelo);
  const ant = d[chave];
  d[chave] = {
    tps: ant ? ant.tps * 0.7 + stats.tps * 0.3 : stats.tps,
    amostras: (ant?.amostras || 0) + 1,
    atualizado: Date.now(),
  };
  await gravarJSON(ARQ, d);
}

export async function velocidade(modelo) {
  return (await desempenho())[semTag(modelo)]?.tps ?? null;
}

export const semTag = (n = '') => n.replace(/:latest$/, '');
const igual = (a, b) => !!a && !!b && semTag(a) === semTag(b);

/** Tamanho do modelo em bilhões de parâmetros, pelo que o Ollama informa ou pelo nome (":3b"). */
export function parametrosB(m) {
  const txt = m?.parametros || '';
  let r = /([\d.]+)\s*([BM])/i.exec(txt);
  if (r) return Number(r[1]) / (r[2].toUpperCase() === 'M' ? 1000 : 1);
  r = /[:-]([\d.]+)b\b/i.exec(m?.nome || m?.tag || '');
  return r ? Number(r[1]) : null;
}

export function nivel(p) {
  if (p == null) return { rotulo: 'desconhecido', nota: 0 };
  if (p < 1) return { rotulo: 'muito básico', nota: 1 };
  if (p < PARAMS_CONFIAVEL) return { rotulo: 'básico', nota: 2 };
  if (p < 5) return { rotulo: 'bom', nota: 3 };
  if (p < 10) return { rotulo: 'muito bom', nota: 4 };
  return { rotulo: 'excelente', nota: 5 };
}

/** Escolhe o maior modelo do catálogo que cabe na memória e roda em velocidade aceitável. */
export async function escolherModelo(hw, modelos) {
  const acelerada = hw.aceleracao.tipo !== 'cpu';
  // Memória para o modelo: VRAM/unificada se houver aceleração; senão ~60% da RAM.
  const memoria = acelerada ? hw.aceleracao.memoria : hw.ramTotal * 0.6;
  const memGB = memoria / GB;
  // Só CPU: acima de ~8B fica lento demais para conversar.
  const limite = acelerada ? Infinity : hw.ramTotal / GB >= 24 ? 8 : 6;
  // Os modelos só de raciocínio (pensamento profundo) não entram na escada principal.
  let candidatos = modelos.chat.filter((m) => !m.soRaciocinio && m.memoria <= memGB && m.memoria <= limite);
  if (!candidatos.length) candidatos = [modelos.chat.find((m) => !m.soRaciocinio)];

  // Ajuste pela velocidade REAL medida neste PC: se o escolhido ficou lento, desce um degrau.
  let chat = candidatos.at(-1);
  let medido = null;
  for (let i = candidatos.length - 1; i >= 0; i--) {
    const tps = await velocidade(candidatos[i].tag);
    chat = candidatos[i];
    medido = tps;
    if (tps == null || tps >= TPS_MINIMO) break;
  }

  const embed = modelos.embed[0];
  let motivo = acelerada
    ? `Aceleração por ${hw.aceleracao.descricao} com ${memGB.toFixed(1)} GB disponíveis para o modelo.`
    : `Sem GPU compatível: a IA roda na CPU usando a RAM (${(hw.ramTotal / GB).toFixed(1)} GB). Escolhemos o modelo mais preciso que ainda responde em velocidade aceitável.`;
  if (medido != null) motivo += ` Velocidade medida neste computador: ${medido.toFixed(1)} palavras/s.`;
  return { chat, embed, memoriaGB: Number(memGB.toFixed(1)), acelerada, motivo, velocidadeMedida: medido };
}

/**
 * Avalia o modelo em uso e diz se vale trocar.
 * Retorna { recomendado, atual, sugestao, avisoQualidade }.
 */
export async function avaliarIA({ hw, catalogo, status, config }) {
  const rec = await escolherModelo(hw, catalogo.modelos);
  const chats = (status.modelos || []).filter((m) => !/embed/i.test(m.nome));
  const emUso = chats.find((m) => igual(m.nome, config.modeloChat)) || chats[0] || null;
  const recInstalado = chats.find((m) => igual(m.nome, rec.chat.tag));
  const pRec = parametrosB({ tag: rec.chat.tag });

  const recomendado = {
    tag: rec.chat.tag, nome: rec.chat.nome, tamanho: rec.chat.tamanho, parametrosB: pRec,
    nivel: nivel(pRec).rotulo, instalado: !!recInstalado, motivo: rec.motivo,
    velocidade: await velocidade(rec.chat.tag),
  };
  const embedOk = (status.modelos || []).some((m) => igual(m.nome, config.modeloEmbed || rec.embed.tag));

  if (!emUso) {
    return {
      recomendado, atual: null, embedOk,
      sugestao: status.online ? { tipo: 'instalar', tag: rec.chat.tag, nome: rec.chat.nome, tamanho: rec.chat.tamanho, baixar: true, titulo: 'Nenhum modelo de IA instalado', texto: `Para este computador, o indicado é ${rec.chat.nome}.` } : null,
      avisoQualidade: null,
    };
  }

  const pAtual = parametrosB(emUso);
  const tpsAtual = await velocidade(emUso.nome);
  const atual = { nome: emUso.nome, parametrosB: pAtual, nivel: nivel(pAtual).rotulo, velocidade: tpsAtual, recomendado: igual(emUso.nome, rec.chat.tag) };

  let sugestao = null;
  if (!atual.recomendado) {
    const maisFraco = pAtual != null && pRec != null && pAtual < pRec * 0.85;
    const lento = tpsAtual != null && tpsAtual < TPS_MINIMO && pAtual != null && pRec != null && pRec < pAtual;
    if (maisFraco) {
      sugestao = {
        tipo: 'melhorar', tag: rec.chat.tag, nome: rec.chat.nome, tamanho: rec.chat.tamanho, baixar: !recInstalado,
        titulo: `Seu computador aguenta um modelo mais preciso: ${rec.chat.nome}`,
        texto: `O modelo em uso (${semTag(emUso.nome)}, ${pAtual} bi de parâmetros) é ${nivel(pAtual).rotulo} e pode errar fatos, números e doses. ` +
          `O ${rec.chat.nome} (${pRec} bi) responde com bem mais precisão${recomendado.velocidade ? ` e roda a ~${recomendado.velocidade.toFixed(1)} palavras/s aqui` : ''}.`,
      };
    } else if (lento) {
      sugestao = {
        tipo: 'mais-rapido', tag: rec.chat.tag, nome: rec.chat.nome, tamanho: rec.chat.tamanho, baixar: !recInstalado,
        titulo: `O modelo atual está lento neste computador (${tpsAtual.toFixed(1)} palavras/s)`,
        texto: `Sugerimos ${rec.chat.nome}, que cabe melhor na memória disponível e responde mais rápido.`,
      };
    }
  }
  const avisoQualidade = pAtual != null && pAtual < PARAMS_CONFIAVEL
    ? `O modelo ${semTag(emUso.nome)} é pequeno e pode errar fatos e doses. Confira sempre nas fontes.`
    : null;
  return { recomendado, atual, sugestao, avisoQualidade, embedOk };
}

// ---------------- perfis: Rápido / Recomendado / Detalhado + Pensamento profundo ----------------

/** O modelo sabe "pensar antes de responder" (raciocínio nativo do Ollama)? */
export const suportaRaciocinio = (nome = '') => /^(qwen3|deepseek-r1|gpt-oss|magistral|phi4-reasoning)/i.test(semTag(nome));

const PALAVRAS_RESPOSTA = 330; // ~250 palavras em português ≈ 330 tokens

/**
 * Monta as opções que o usuário pode baixar e alternar no chat, com explicação simples e
 * velocidade medida (ou estimada a partir de outro modelo já medido neste PC).
 */
export async function perfisIA({ hw, catalogo, status }) {
  const rec = await escolherModelo(hw, catalogo.modelos);
  const escada = catalogo.modelos.chat.filter((m) => !m.soRaciocinio);
  const acelerada = hw.aceleracao.tipo !== 'cpu';
  // Para quem aceita esperar: até ~85% da RAM (ou toda a memória da placa, se for maior), sem o limite de velocidade.
  const memMax = Math.max(acelerada ? hw.aceleracao.memoria || 0 : 0, hw.ramTotal * 0.85) / GB;
  const instalados = (status.modelos || []).filter((m) => !/embed/i.test(m.nome));
  const instalado = (tag) => instalados.find((m) => igual(m.nome, tag));

  // Referência de velocidade: o modelo mais medido neste PC (a velocidade cai ~ na proporção do tamanho).
  const d = await desempenho();
  const medidos = Object.entries(d).map(([tag, v]) => ({ tag, tps: v.tps, p: parametrosB({ tag }) })).filter((x) => x.p && x.tps);
  async function veloc(tag) {
    const real = await velocidade(tag);
    if (real != null) return { tps: real, estimado: false };
    const p = parametrosB({ tag });
    if (!p || !medidos.length) return { tps: null, estimado: true };
    const ref = medidos.sort((a, b) => Math.abs(a.p - p) - Math.abs(b.p - p))[0];
    return { tps: ref.tps * (ref.p / p) * 0.9, estimado: true };
  }

  const iRec = escada.findIndex((m) => m.tag === rec.chat.tag);
  const rapido = escada.slice(0, Math.max(iRec, 0)).filter((m) => (parametrosB({ tag: m.tag }) ?? 0) >= 1.5).at(-1) || escada[Math.max(iRec - 1, 0)];
  const detalhado = escada.filter((m) => m.memoria <= memMax).at(-1);
  const pensadores = catalogo.modelos.chat.filter((m) => m.raciocinio && m.memoria <= memMax);
  // Pensamento profundo: o maior que pensa e ainda cabe; se já houver um instalado, usa ele.
  const pensador = pensadores.find((m) => instalado(m.tag) && m.memoria >= (pensadores.at(-1)?.memoria || 0) * 0.6) || pensadores.at(-1);

  const montar = async (id, m, extra) => {
    if (!m) return null;
    const v = await veloc(m.tag);
    const p = parametrosB({ tag: m.tag });
    return {
      id, tag: m.tag, nome: m.nome, tamanho: m.tamanho, nota: m.nota,
      parametrosB: p, nivel: nivel(p).rotulo,
      instalado: !!instalado(m.tag), nomeInstalado: instalado(m.tag)?.nome || null,
      tps: v.tps, estimado: v.estimado,
      esperaSeg: v.tps ? Math.round(PALAVRAS_RESPOSTA / v.tps) : null,
      raciocinio: suportaRaciocinio(m.tag),
      ...extra,
    };
  };

  const perfis = (await Promise.all([
    rapido && rapido.tag !== rec.chat.tag
      ? montar('rapido', rapido, { rotulo: 'Rápido', explicacao: 'Responde quase na hora. Bom para perguntas simples, mas erra mais.' })
      : null,
    montar('recomendado', rec.chat, { rotulo: 'Moderado', explicacao: 'Recomendado para este computador: bom equilíbrio entre rapidez e qualidade.' }),
    detalhado && detalhado.tag !== rec.chat.tag
      ? montar('detalhado', detalhado, { rotulo: 'Lento', explicacao: 'Respostas mais completas e caprichadas, mas demora. Use quando puder esperar.' })
      : null,
  ])).filter(Boolean);

  const profundo = await montar('profundo', pensador, {
    rotulo: 'Pensamento profundo',
    explicacao: 'A IA raciocina passo a passo antes de responder. Bem mais lento; melhor para problemas difíceis: cálculos, diagnósticos, planejamento.',
  });
  // Modelos instalados que não estão em nenhum perfil (o usuário pode ter baixado outros).
  const usados = new Set([...perfis, profundo].filter(Boolean).map((p) => semTag(p.tag)));
  const outros = await Promise.all(instalados.filter((m) => !usados.has(semTag(m.nome))).map(async (m) => ({
    tag: m.nome, nome: semTag(m.nome), parametrosB: parametrosB(m), nivel: nivel(parametrosB(m)).rotulo,
    instalado: true, nomeInstalado: m.nome, raciocinio: suportaRaciocinio(m.nome), ...(await veloc(m.nome)),
  })));
  return { perfis, profundo, outros, memoriaMaxGB: Number(memMax.toFixed(1)) };
}
