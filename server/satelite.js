// Imagens de satélite (Sentinel-2 cloudless 2024, 10 m de resolução — mostra rios, matas, lavouras, áreas urbanas).
// É a melhor imagem gratuita que pode ser guardada offline: Google, Bing e Esri proíbem isso nos termos de uso.
// Os blocos (tiles) passam por este servidor e ficam guardados em dados/satelite:
// - com internet, cada área vista fica salva e passa a funcionar offline;
// - "Salvar satélite da área" baixa uma região inteira de uma vez (com limite de tamanho).
import fsp from 'node:fs/promises';
import path from 'node:path';
import { DADOS, USER_AGENT, existe } from './util.js';

export const PASTA_SATELITE = path.join(DADOS, 'satelite');
export const SATELITE = {
  nome: 'Sentinel-2 cloudless 2024 (EOX)',
  ano: 2024,
  maxzoom: 15,
  atribuicao:
    '<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless – s2maps.eu</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024) · CC BY-NC-SA 4.0',
  url: (z, x, y) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/${z}/${y}/${x}.jpg`,
};
export const MAX_TILES_POR_AREA = 30000;
const BYTES_MEDIO_TILE = 16000;

let semRedeAte = 0; // depois de uma falha de rede, evita esperar o tempo esgotar em cada bloco
const arquivoTile = (z, x, y) => path.join(PASTA_SATELITE, String(SATELITE.ano), String(z), String(x), `${y}.jpg`);
// Blocos da versão anterior (2020), guardados na raiz da pasta: usados offline enquanto não houver o de 2024.
const arquivoAntigo = (z, x, y) => path.join(PASTA_SATELITE, String(z), String(x), `${y}.jpg`);
const valido = (z, x, y) =>
  [z, x, y].every(Number.isInteger) && z >= 0 && z <= SATELITE.maxzoom && x >= 0 && y >= 0 && x < 2 ** z && y < 2 ** z;

async function buscarNaRede(z, x, y, sinal) {
  const r = await fetch(SATELITE.url(z, x, y), {
    headers: { 'User-Agent': USER_AGENT },
    signal: sinal ? AbortSignal.any([sinal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(15000),
  });
  if (!r.ok || !/^image\//.test(r.headers.get('content-type') || '')) return null;
  return Buffer.from(await r.arrayBuffer());
}

async function gravar(z, x, y, buf) {
  const arq = arquivoTile(z, x, y);
  await fsp.mkdir(path.dirname(arq), { recursive: true });
  await fsp.writeFile(`${arq}.tmp`, buf);
  await fsp.rename(`${arq}.tmp`, arq);
}

/** Um bloco: do disco, ou da internet (e guarda). null se não houver. */
export async function obterTile(z, x, y) {
  if (!valido(z, x, y)) return null;
  try {
    return await fsp.readFile(arquivoTile(z, x, y));
  } catch {}
  const antigo = () => fsp.readFile(arquivoAntigo(z, x, y)).catch(() => null);
  if (Date.now() < semRedeAte) return antigo();
  try {
    const buf = await buscarNaRede(z, x, y);
    if (buf) await gravar(z, x, y, buf).catch(() => {});
    return buf || antigo();
  } catch {
    semRedeAte = Date.now() + 30000;
    return antigo();
  }
}

const lon2x = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2y = (lat, z) => {
  const r = (Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

function* blocos(bbox, maxzoom) {
  const [oeste, sul, leste, norte] = bbox;
  for (let z = 0; z <= maxzoom; z++) {
    const lim = 2 ** z - 1;
    const x0 = Math.max(0, lon2x(oeste, z));
    const x1 = Math.min(lim, lon2x(leste, z));
    const y0 = Math.max(0, lat2y(norte, z));
    const y1 = Math.min(lim, lat2y(sul, z));
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) yield [z, x, y];
  }
}

export function validarArea(bbox, maxzoom) {
  if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some((n) => typeof n !== 'number' || !Number.isFinite(n))) throw new Error('Região inválida');
  const z = Math.max(0, Math.min(SATELITE.maxzoom, Math.round(Number(maxzoom) || 12)));
  return { bbox, maxzoom: z };
}

export function estimarArea(bbox, maxzoom) {
  let tiles = 0;
  for (const _ of blocos(bbox, maxzoom)) tiles++;
  return { tiles, bytes: tiles * BYTES_MEDIO_TILE, limite: MAX_TILES_POR_AREA, permitido: tiles <= MAX_TILES_POR_AREA };
}

/** Baixa todos os blocos de uma área (pula os já guardados). */
export async function baixarArea({ bbox, maxzoom }, tarefa, sinal) {
  const { tiles } = estimarArea(bbox, maxzoom);
  if (tiles > MAX_TILES_POR_AREA) throw new Error(`Área grande demais (${tiles} blocos; limite ${MAX_TILES_POR_AREA}). Aproxime o mapa ou escolha menos detalhe.`);
  tarefa.total = tiles;
  tarefa.baixado = 0;
  let falhas = 0;
  const fila = blocos(bbox, maxzoom);
  const trabalhador = async () => {
    for (let prox = fila.next(); !prox.done; prox = fila.next()) {
      if (sinal.aborted) throw new Error('Cancelado');
      const [z, x, y] = prox.value;
      if (!(await existe(arquivoTile(z, x, y)))) {
        let buf = null;
        for (let t = 0; t < 3 && !buf; t++) buf = await buscarNaRede(z, x, y, sinal).catch(() => null);
        if (buf) await gravar(z, x, y, buf);
        else falhas++;
      }
      tarefa.baixado++;
      tarefa.mensagem = `${tarefa.baixado.toLocaleString('pt-BR')} de ${tiles.toLocaleString('pt-BR')} blocos`;
    }
  };
  await Promise.all(Array.from({ length: 4 }, trabalhador)); // poucas conexões: não sobrecarrega o servidor de origem
  if (falhas > tiles * 0.2) throw new Error(`${falhas} blocos não puderam ser baixados (internet instável?). Tente de novo: os já salvos são mantidos.`);
  tarefa.mensagemFinal = `Satélite salvo para uso offline${falhas ? ` (${falhas} blocos faltando)` : ''}`;
}

let cacheUso = { quando: 0, valor: null };
/** Quanto de satélite está guardado (contagem com cache de 1 min). */
export async function usoSatelite() {
  if (Date.now() - cacheUso.quando < 60000 && cacheUso.valor) return cacheUso.valor;
  let tiles = 0;
  let bytes = 0;
  const andar = async (p) => {
    let ents = [];
    try {
      ents = await fsp.readdir(p, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      const f = path.join(p, e.name);
      if (e.isDirectory()) await andar(f);
      else if (e.name.endsWith('.jpg')) {
        tiles++;
        bytes += (await fsp.stat(f)).size;
      }
    }
  };
  await andar(PASTA_SATELITE);
  cacheUso = { quando: Date.now(), valor: { tiles, bytes } };
  return cacheUso.valor;
}
