// Catálogo de conteúdo: itens curados + resolução ao vivo dos ZIMs no catálogo OPDS do Kiwix.
import path from 'node:path';
import { RAIZ, DADOS, lerJSON, gravarJSON, obterTexto } from './util.js';

const ARQ_CATALOGO = path.join(RAIZ, 'catalogo', 'catalogo.json');
const ARQ_CACHE_KIWIX = path.join(DADOS, 'kiwix-cache.json');
const OPDS = 'https://library.kiwix.org/catalog/v2/entries';
const UM_DIA = 24 * 3600 * 1000;

// Catálogo publicado mais novo, baixado pela atualização (fica em dados/, fora dos arquivos do programa).
// Vale quando a versão dele é maior que a do catalogo/catalogo.json que veio com o programa.
export const ARQ_CATALOGO_ATUALIZADO = path.join(DADOS, 'catalogo-atualizado.json');

let catalogo = null;
export async function carregarCatalogo() {
  if (!catalogo) {
    const base = await lerJSON(ARQ_CATALOGO, null);
    const novo = await lerJSON(ARQ_CATALOGO_ATUALIZADO, null);
    catalogo = novo && base && Number(novo.versao) > Number(base.versao) ? novo : base;
  }
  if (!catalogo) throw new Error('catalogo/catalogo.json não encontrado ou inválido');
  return catalogo;
}
/** Esquece o catálogo em memória (depois de baixar um mais novo). */
export function recarregarCatalogo() {
  catalogo = null;
}

export async function item(id) {
  const c = await carregarCatalogo();
  return c.itens.find((i) => i.id === id);
}

/** Lista final de ids de um pacote, resolvendo herança. */
export async function itensDoPacote(id, visitados = new Set()) {
  const c = await carregarCatalogo();
  const p = c.pacotes.find((x) => x.id === id);
  if (!p || visitados.has(id)) return [];
  visitados.add(id);
  let ids = p.herda ? await itensDoPacote(p.herda, visitados) : [];
  if (p.remove) ids = ids.filter((x) => !p.remove.includes(x));
  for (const x of p.itens) if (!ids.includes(x)) ids.push(x);
  return ids;
}

function campo(xml, tag) {
  const m = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml);
  return m ? m[1] : '';
}

async function consultarKiwix(nome) {
  const xml = await obterTexto(`${OPDS}?name=${encodeURIComponent(nome)}&count=20`);
  return xml
    .split('<entry>')
    .slice(1)
    .map((e) => {
      const link = /rel="http:\/\/opds-spec\.org\/acquisition\/open-access"[^>]*href="([^"]+)"[^>]*length="(\d+)"/.exec(e);
      return {
        nome,
        flavour: campo(e, 'flavour'),
        titulo: campo(e, 'title'),
        data: campo(e, 'updated').slice(0, 10),
        url: link ? link[1].replace(/\.meta4$/, '') : null,
        tamanho: link ? Number(link[2]) : 0,
      };
    })
    .filter((e) => e.url);
}

/** Resolve URL e tamanho atuais de um item ZIM (com cache de 24 h; usa o cache antigo se estiver offline). */
let cacheKiwix = null;
export async function resolverZim(it, { forcar = false } = {}) {
  if (!cacheKiwix) cacheKiwix = await lerJSON(ARQ_CACHE_KIWIX, {});
  const cache = cacheKiwix;
  const chave = it.kiwix;
  let entradas = cache[chave]?.entradas;
  if (forcar || !entradas || Date.now() - (cache[chave]?.quando || 0) > UM_DIA) {
    try {
      entradas = await consultarKiwix(chave);
      cache[chave] = { quando: Date.now(), entradas };
      await gravarJSON(ARQ_CACHE_KIWIX, cache);
    } catch (e) {
      if (!entradas) throw new Error(`Não foi possível consultar o catálogo do Kiwix: ${e.message}`);
    }
  }
  const escolhida =
    entradas.find((e) => (e.flavour || '') === (it.flavour || '')) ||
    entradas.find((e) => !it.flavour || e.flavour.includes(it.flavour)) ||
    entradas[0];
  if (!escolhida) throw new Error(`ZIM ${chave} não encontrado no catálogo do Kiwix`);
  return escolhida;
}

/** Atualiza os tamanhos dos ZIMs a partir do catálogo do Kiwix (melhor esforço, em paralelo). */
export async function catalogoAtualizado() {
  const c = await carregarCatalogo();
  const zims = c.itens.filter((i) => i.tipo === 'zim');
  await Promise.all(
    zims.map(async (z) => {
      try {
        const r = await resolverZim(z);
        z.tamanho = r.tamanho || z.tamanho;
        z.versao = r.data;
      } catch {}
    })
  );
  return c;
}
