// Novidades do catálogo: novas fontes e links publicados depois que o usuário instalou o Protocolo Zero.
//
// O administrador publica o catalogo.json atualizado (com "versao" maior) no endereço de
// "fonteAtualizacao" do catálogo (ou na variável PROTOCOLO_ZERO_CATALOGO_URL). A atualização:
//   1. baixa esse catálogo e guarda em dados/catalogo-atualizado.json (não mexe nos arquivos do programa);
//   2. descobre os itens NOVOS (ids que não existiam antes);
//   3. baixa só os novos que fazem parte do pacote que o usuário usa (Essencial, Padrão ou Completo).
// O que já foi baixado NUNCA é apagado, trocado ou baixado de novo — nem quando a fonte ou o link
// deixam de existir: itens que saíram do catálogo continuam nele marcados como "descontinuado",
// para a Biblioteca e o Instalar conteúdo seguirem mostrando o que o usuário já tem.
import { DADOS, lerJSON, gravarJSON, obterJSON } from './util.js';
import { carregarCatalogo, recarregarCatalogo, ARQ_CATALOGO_ATUALIZADO } from './catalogo.js';
import { espacoEmDisco } from './hardware.js';
import path from 'node:path';

const ARQ_NOVIDADES = path.join(DADOS, 'novidades.json');
const RESERVA_DISCO = 10 * 1024 ** 3; // não enche o disco: deixa pelo menos 10 GB livres
const COBERTURA_PACOTE = 0.8; // "usa o pacote" = já tem 80% dos itens dele

/** Endereço do catálogo publicado (vazio = atualização de catálogo desligada). */
export async function fonteCatalogo() {
  return process.env.PROTOCOLO_ZERO_CATALOGO_URL || (await carregarCatalogo()).fonteAtualizacao || '';
}

function validar(c) {
  if (!c || typeof c !== 'object' || !Number.isFinite(Number(c.versao))) throw new Error('catálogo publicado sem "versao"');
  if (!Array.isArray(c.itens) || !Array.isArray(c.pacotes) || !Array.isArray(c.categorias)) throw new Error('catálogo publicado incompleto');
  for (const i of c.itens) {
    if (!i?.id || !i.tipo || !i.titulo) throw new Error(`item inválido no catálogo publicado: ${i?.id || '?'}`);
    if (i.url && !/^https?:\/\//i.test(i.url)) throw new Error(`link inválido no catálogo publicado: ${i.id}`);
  }
}

/**
 * Baixa o catálogo publicado. Se for mais novo, passa a valer e devolve os itens novos.
 * Itens que existiam e sumiram continuam no catálogo como "descontinuado" (o usuário pode tê-los).
 */
export async function atualizarCatalogo({ sinal } = {}) {
  const url = await fonteCatalogo();
  if (!url) return { semFonte: true, novos: [] };
  const atual = await carregarCatalogo();
  const publicado = await obterJSON(url, { sinal });
  validar(publicado);
  if (Number(publicado.versao) <= Number(atual.versao)) return { versao: atual.versao, novos: [] };

  const idsNovos = new Set(publicado.itens.map((i) => i.id));
  const antigos = new Set(atual.itens.map((i) => i.id));
  const mantidos = atual.itens.filter((i) => !idsNovos.has(i.id)).map((i) => ({ ...i, descontinuado: true }));
  const final = {
    ...publicado,
    fonteAtualizacao: publicado.fonteAtualizacao || atual.fonteAtualizacao,
    itens: [...publicado.itens, ...mantidos],
  };
  // Categorias que só os itens mantidos usam continuam existindo.
  for (const c of atual.categorias) if (!final.categorias.some((x) => x.id === c.id)) final.categorias.push(c);
  await gravarJSON(ARQ_CATALOGO_ATUALIZADO, final);
  recarregarCatalogo();

  const novos = publicado.itens.filter((i) => !antigos.has(i.id));
  const reg = await lerJSON(ARQ_NOVIDADES, { itens: [] });
  const quando = Date.now();
  reg.itens = [...reg.itens.filter((n) => quando - n.desde < 60 * 864e5), ...novos.map((i) => ({ id: i.id, desde: quando }))];
  await gravarJSON(ARQ_NOVIDADES, reg);
  return { versao: final.versao, versaoAnterior: atual.versao, novos, descontinuados: mantidos.length };
}

/** Ids marcados como novidade nos últimos 60 dias (para o selo "Novo" no Instalar conteúdo). */
export async function idsNovidades() {
  const reg = await lerJSON(ARQ_NOVIDADES, { itens: [] });
  return new Set(reg.itens.filter((n) => Date.now() - n.desde < 60 * 864e5).map((n) => n.id));
}

/** Ids de um pacote, resolvendo herança, num catálogo qualquer. */
function idsDoPacote(c, id, vistos = new Set()) {
  const p = c.pacotes.find((x) => x.id === id);
  if (!p || vistos.has(id)) return [];
  vistos.add(id);
  let ids = p.herda ? idsDoPacote(c, p.herda, vistos) : [];
  if (p.remove) ids = ids.filter((x) => !p.remove.includes(x));
  for (const x of p.itens) if (!ids.includes(x)) ids.push(x);
  return ids;
}

/**
 * Dos itens novos, quais baixar: os do maior pacote que o usuário já usa
 * (tem pelo menos 80% dos itens antigos dele) e que cabem no disco.
 */
export async function escolherNovos(novos, config) {
  if (!novos.length) return { baixar: [], pacote: null, semEspaco: [] };
  const c = await carregarCatalogo();
  const tem = new Set(config.itens || []);
  const idsNovos = new Set(novos.map((i) => i.id));
  let pacote = null;
  for (const p of c.pacotes) {
    const antigos = idsDoPacote(c, p.id).filter((id) => !idsNovos.has(id));
    if (antigos.length && antigos.filter((id) => tem.has(id)).length / antigos.length >= COBERTURA_PACOTE) pacote = p; // pacotes vão do menor ao maior
  }
  if (!pacote) return { baixar: [], pacote: null, semEspaco: [] };
  const doPacote = new Set(idsDoPacote(c, pacote.id));
  const candidatos = novos.filter((i) => doPacote.has(i.id) && !tem.has(i.id));
  let livre = (await espacoEmDisco()).livre - RESERVA_DISCO;
  const baixar = [];
  const semEspaco = [];
  for (const i of candidatos) {
    if ((i.tamanho || 0) <= livre) {
      baixar.push(i);
      livre -= i.tamanho || 0;
    } else semEspaco.push(i);
  }
  return { baixar, pacote: { id: pacote.id, nome: pacote.nome }, semEspaco };
}
