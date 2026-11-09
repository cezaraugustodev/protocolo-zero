// Recorta mapas offline (PMTiles) do mapa mundial do Protomaps/OpenStreetMap usando a ferramenta pmtiles.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { PASTAS, existe, obterJSON } from './util.js';
import { caminhoPmtiles, instalarPmtiles } from './ferramentas.js';

let instalando = null;
export async function garantirPmtiles(tarefa, sinal) {
  if (await existe(caminhoPmtiles())) return;
  if (!instalando) {
    instalando = instalarPmtiles(tarefa, sinal).finally(() => (instalando = null));
  }
  await instalando;
}

let ultimaBuild = null;
export async function urlMapaMundial() {
  if (ultimaBuild && Date.now() - ultimaBuild.quando < 6 * 3600 * 1000) return ultimaBuild.url;
  const builds = await obterJSON('https://build-metadata.protomaps.dev/builds.json');
  const chave = builds.map((b) => b.key).filter((k) => /^\d{8}\.pmtiles$/.test(k)).sort().at(-1);
  if (!chave) throw new Error('Não foi possível encontrar o mapa mundial do Protomaps');
  ultimaBuild = { quando: Date.now(), url: `https://build.protomaps.com/${chave}` };
  return ultimaBuild.url;
}

function rodarPmtiles(args, { onLinha, sinal } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(caminhoPmtiles(), args, { windowsHide: true, signal: sinal });
    let saida = '';
    const ler = (d) => {
      const s = d.toString();
      saida = (saida + s).slice(-20000);
      for (const l of s.split(/[\r\n]+/)) if (l.trim()) onLinha?.(l.trim());
    };
    p.stdout.on('data', ler);
    p.stderr.on('data', ler);
    p.on('error', reject);
    p.on('close', (c) => (c === 0 ? resolve(saida) : reject(new Error(saida.trim().split('\n').at(-1) || `pmtiles saiu com código ${c}`))));
  });
}

const argsBbox = (bbox, maxzoom) => [`--bbox=${bbox.join(',')}`, `--maxzoom=${maxzoom}`];

/** Estima o tamanho do recorte sem baixar nada (pmtiles --dry-run). */
export async function estimarMapa({ bbox, maxzoom }) {
  const url = await urlMapaMundial();
  const saida = await rodarPmtiles(['extract', url, path.join(PASTAS.tmp, 'estimativa.pmtiles'), ...argsBbox(bbox, maxzoom), '--dry-run']);
  const m = /archive size of ([\d.]+)\s*([KMGT]?B)/i.exec(saida) || /([\d.]+)\s*([KMGT]i?B)/i.exec(saida);
  if (!m) return { bytes: null, saida };
  const mult = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, KIB: 1024, MIB: 1024 ** 2, GIB: 1024 ** 3, TIB: 1024 ** 4 }[m[2].toUpperCase()] || 1;
  return { bytes: Math.round(Number(m[1]) * mult) };
}

export async function extrairMapa({ bbox, maxzoom, destino, tarefa, sinal }) {
  await garantirPmtiles(tarefa, sinal);
  tarefa.mensagem = 'Localizando o mapa mundial mais recente…';
  const url = await urlMapaMundial();
  const parcial = `${destino}.parcial`;
  await fsp.rm(parcial, { force: true });
  tarefa.mensagem = 'Recortando o mapa (baixa só a região escolhida)…';
  await rodarPmtiles(['extract', url, parcial, ...argsBbox(bbox, maxzoom), '--download-threads=4'], {
    sinal,
    onLinha: (l) => {
      const pct = /(\d+)%/.exec(l);
      if (pct) {
        tarefa.total = 100;
        tarefa.baixado = Number(pct[1]);
        tarefa.unidade = '%';
      }
    },
  });
  await fsp.rename(parcial, destino);
  const { size } = await fsp.stat(destino);
  tarefa.mensagemFinal = 'Mapa pronto';
  return size;
}

export async function listarMapas() {
  try {
    const arqs = (await fsp.readdir(PASTAS.mapas)).filter((f) => f.endsWith('.pmtiles'));
    return Promise.all(arqs.map(async (f) => ({ arquivo: `mapas/${f}`, nome: f, tamanho: (await fsp.stat(path.join(PASTAS.mapas, f))).size })));
  } catch {
    return [];
  }
}
