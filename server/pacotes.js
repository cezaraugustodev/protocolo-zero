// Armazém de pacotes compactados (dados/pacotes).
//
// Tudo que vem da internet ("Atualizar") é guardado aqui primeiro, compactado.
// O botão "Iniciar Protocolo Zero" descompacta e instala, sem precisar de internet.
//
// - PDF, EPUB e textos: compactados com gzip (.gz). A cópia compactada continua guardada
//   depois de instalada, para o Iniciar restaurar o arquivo se ele sumir ou corromper.
// - ZIM (enciclopédias) e PMTiles (mapas) já são formatos compactados: ficam como estão
//   e são movidos para o lugar certo na instalação (sem cópia extra, para não dobrar o espaço).
//
// O manifesto (pacotes.json) fica dentro da própria pasta: copiar "dados/pacotes" para um
// pendrive e colar em outro computador permite instalar tudo lá sem internet.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { DADOS, PASTAS, lerJSON, gravarJSON, existe, dentroDe, extrair, arquivoLivre, nomeSeguro } from './util.js';
import * as bib from './biblioteca.js';

const ARQ = path.join(PASTAS.pacotes, 'pacotes.json');
const COMPACTAVEIS = new Set(['pdf', 'epub', 'texto']);
const PACOTE_DE_ARQUIVOS = /\.(zip|tar|tgz|tar\.gz)$/i;

let man = null;
async function manifesto() {
  if (!man) man = await lerJSON(ARQ, { versao: 1, pacotes: {} });
  return man;
}
const salvar = () => gravarJSON(ARQ, man);
const absDados = (rel) => path.join(DADOS, ...rel.split('/'));
const absPacote = (rel) => path.join(PASTAS.pacotes, ...rel.split('/'));
const relDe = (base, abs) => path.relative(base, abs).split(path.sep).join('/');

/** Conta os bytes que passam (para mostrar o progresso). */
function contador(onBytes) {
  let n = 0;
  return new Transform({
    transform(pedaco, _c, cb) {
      n += pedaco.length;
      onBytes?.(n);
      cb(null, pedaco);
    },
  });
}

async function mover(origem, destino) {
  await fsp.mkdir(path.dirname(destino), { recursive: true });
  try {
    await fsp.rename(origem, destino);
  } catch (e) {
    if (e.code !== 'EXDEV') throw e;
    // Outro disco (ex.: pacotes num pendrive): copia e apaga.
    await fsp.copyFile(origem, `${destino}.copiando`);
    await fsp.rename(`${destino}.copiando`, destino);
    await fsp.rm(origem, { force: true });
  }
}

async function gzip(origem, destino, sinal) {
  await fsp.mkdir(path.dirname(destino), { recursive: true });
  const parcial = `${destino}.compactando`;
  try {
    await pipeline(fs.createReadStream(origem), zlib.createGzip({ level: 6 }), fs.createWriteStream(parcial), { signal: sinal });
    await fsp.rename(parcial, destino);
  } catch (e) {
    await fsp.rm(parcial, { force: true });
    throw e;
  }
  return (await fsp.stat(destino)).size;
}

async function gunzip(origem, destino, { sinal, onBytes, esperado } = {}) {
  await fsp.mkdir(path.dirname(destino), { recursive: true });
  const parcial = `${destino}.descompactando`;
  try {
    await pipeline(fs.createReadStream(origem), zlib.createGunzip(), contador(onBytes), fs.createWriteStream(parcial), { signal: sinal });
    const { size } = await fsp.stat(parcial);
    if (esperado && size !== esperado) throw new Error(`Pacote incompleto ou corrompido (${size} de ${esperado} bytes)`);
    await fsp.rename(parcial, destino);
    return size;
  } catch (e) {
    await fsp.rm(parcial, { force: true });
    if (e.code === 'Z_DATA_ERROR' || e.code === 'Z_BUF_ERROR') throw new Error('Pacote corrompido — precisa ser baixado de novo (Atualizar)');
    throw e;
  }
}

/**
 * Guarda no armazém um arquivo recém-baixado.
 * `origem`: arquivo baixado; `destino`: caminho final relativo a dados/ (ex.: "pdf/saude/x.pdf");
 * `registro`: dados do item para a biblioteca (id, tipo, titulo…).
 */
export async function guardar({ origem, destino, registro, sinal, tarefa }) {
  await manifesto();
  const { size: tamanho } = await fsp.stat(origem);
  let arquivo;
  let formato;
  let tamanhoPacote = tamanho;
  if (COMPACTAVEIS.has(registro.tipo)) {
    formato = 'gz';
    arquivo = `${destino}.gz`;
    if (tarefa) tarefa.mensagem = 'Compactando…';
    tamanhoPacote = await gzip(origem, absPacote(arquivo), sinal);
    await fsp.rm(origem, { force: true });
  } else {
    formato = 'bruto';
    arquivo = destino;
    if (path.resolve(origem) !== path.resolve(absPacote(arquivo))) await mover(origem, absPacote(arquivo));
  }
  man.pacotes[registro.id] = { id: registro.id, registro, destino, arquivo, formato, tamanho, tamanhoPacote, guardado: Date.now() };
  await salvar();
  return man.pacotes[registro.id];
}

/** Caminho onde um arquivo "bruto" (ZIM, mapa) deve ser baixado diretamente, sem cópia extra. */
export const caminhoNoArmazem = (destinoRel) => absPacote(destinoRel);

async function pacoteExiste(p) {
  return p && (await existe(absPacote(p.arquivo)));
}

/** Este pacote ainda precisa ser descompactado (ou movido) neste computador? */
async function precisaInstalar(p) {
  if (!(await pacoteExiste(p))) return false;
  const it = await bib.obter(p.id);
  const instalado = it && it.arquivo && (await existe(bib.caminhoAbsoluto(it)));
  const versaoNova = it && p.registro.versao && it.versao !== p.registro.versao;
  return !instalado || versaoNova || (p.formato === 'bruto' && p.arquivo);
}

/** Pacotes ainda não instalados neste computador (ou mais novos que o instalado). */
export async function pendentes() {
  await manifesto();
  const lista = [];
  for (const p of Object.values(man.pacotes)) if (await precisaInstalar(p)) lista.push(p);
  return lista;
}

export async function obterPacote(id) {
  await manifesto();
  return man.pacotes[id] || null;
}

/** Está baixado (compactado) mas ainda não instalado? */
export async function aguardandoInstalacao(id) {
  return (await pendentes()).some((p) => p.id === id);
}

/** Descompacta um pacote específico, sem rodar o Iniciar Protocolo Zero inteiro. */
export async function descompactar(id, { sinal, onBytes } = {}) {
  await manifesto();
  const p = man.pacotes[id];
  if (!p) throw new Error('Arquivo compactado não encontrado');
  if (!(await pacoteExiste(p))) throw new Error('O arquivo compactado não está mais na pasta de pacotes');
  const tamanho = await instalar(p, { sinal, onBytes });
  return { ...p, tamanho };
}

/** Descompacta (ou move) um pacote para o lugar final e registra na biblioteca. */
export async function instalar(p, { sinal, onBytes } = {}) {
  await manifesto();
  const destino = absDados(p.destino);
  if (!dentroDe(DADOS, destino)) throw new Error('Destino inválido no pacote');
  const antigo = await bib.obter(p.id);
  let tamanho;
  if (p.formato === 'gz') {
    tamanho = await gunzip(absPacote(p.arquivo), destino, { sinal, onBytes, esperado: p.tamanho });
  } else {
    await mover(absPacote(p.arquivo), destino);
    tamanho = (await fsp.stat(destino)).size;
  }
  // Versão nova num caminho diferente (ex.: ZIM com data no nome): apaga a antiga.
  if (antigo?.arquivo && antigo.arquivo !== p.destino) {
    const velho = bib.caminhoAbsoluto(antigo);
    if (dentroDe(DADOS, velho)) await fsp.rm(velho, { force: true });
  }
  const mudou = !antigo || antigo.versao !== p.registro.versao || antigo.arquivo !== p.destino;
  await bib.registrar({
    ...p.registro,
    arquivo: p.destino,
    tamanho,
    ...(bib.indexavel(p.registro.tipo) && mudou ? { indexado: false } : {}),
  });
  p.instalado = Date.now();
  if (p.formato === 'bruto') p.arquivo = null; // o arquivo foi movido: não há cópia no armazém
  await salvar();
  return tamanho;
}

/** Restaura um arquivo instalado que sumiu ou corrompeu, a partir da cópia compactada. */
export async function restaurar(it, opcoes) {
  const p = await obterPacote(it.id);
  if (!p || p.formato !== 'gz' || !(await pacoteExiste(p))) return false;
  await instalar(p, opcoes);
  return true;
}

/** Cria a cópia compactada de um item já instalado que ainda não tem uma (só PDF/EPUB/texto). */
export async function criarCopia(it, sinal) {
  if (!COMPACTAVEIS.has(it.tipo) || it.origem !== 'catalogo') return false;
  const p = await obterPacote(it.id);
  if (p && (await pacoteExiste(p))) return false;
  const arquivo = `${it.arquivo}.gz`;
  const { arquivo: _a, tamanho, adicionado, indexado, trechos, falhaIndexacao, ...registro } = it;
  const tamanhoPacote = await gzip(bib.caminhoAbsoluto(it), absPacote(arquivo), sinal);
  man.pacotes[it.id] = { id: it.id, registro, destino: it.arquivo, arquivo, formato: 'gz', tamanho: it.tamanho, tamanhoPacote, guardado: Date.now(), instalado: Date.now() };
  await salvar();
  return true;
}

/** Remove o pacote de um item (quando o usuário exclui o item da biblioteca). */
export async function descartar(id) {
  await manifesto();
  const p = man.pacotes[id];
  if (!p) return;
  if (p.arquivo) {
    const abs = absPacote(p.arquivo);
    if (dentroDe(PASTAS.pacotes, abs)) await fsp.rm(abs, { force: true });
  }
  delete man.pacotes[id];
  await salvar();
}

/** Resumo para a interface. */
export async function resumoPacotes() {
  await manifesto();
  const pend = await pendentes();
  const avulsos = await pacotesDeArquivos();
  return {
    pendentes: pend.length + avulsos.length,
    tamanhoPendente: pend.reduce((a, p) => a + (p.tamanhoPacote || 0), 0),
    // Espaço a mais ao descompactar: só os .gz geram cópia (ZIM e mapas são apenas movidos).
    espacoNecessario: pend.filter((p) => p.formato === 'gz').reduce((a, p) => a + (p.tamanho || 0), 0),
    tamanhoFinal: pend.reduce((a, p) => a + (p.tamanho || 0), 0),
    tipos: [...new Set(pend.map((p) => p.registro.tipo))],
    guardados: Object.values(man.pacotes).filter((p) => p.formato === 'gz').length,
    pasta: PASTAS.pacotes,
  };
}

/**
 * Lista os arquivos compactados que ainda precisam ser descompactados, para a Biblioteca
 * mostrar cada um e deixar o usuário abrir só o que quer consultar agora — sem rodar o
 * Iniciar Protocolo Zero inteiro.
 */
export async function listarCompactados() {
  await manifesto();
  const lista = [];
  for (const p of Object.values(man.pacotes)) {
    if (!(await precisaInstalar(p))) continue;
    lista.push({
      id: p.id,
      titulo: p.registro?.titulo || p.id,
      tipo: p.registro?.tipo || 'outro',
      categoria: p.registro?.categoria || null,
      fonte: p.registro?.fonte || null,
      formato: p.formato,
      tamanho: p.tamanho || null,
      tamanhoPacote: p.tamanhoPacote || null,
    });
  }
  for (const arq of await pacotesDeArquivos()) {
    const nome = path.basename(arq);
    const st = await fsp.stat(arq).catch(() => null);
    if (!st) continue;
    lista.push({
      id: `arquivo:${nome}`,
      titulo: nome,
      tipo: 'pacote',
      formato: (nome.match(/\.(tar\.gz|tgz|zip|tar)$/i)?.[1] || 'compactado').toLowerCase(),
      tamanhoPacote: st.size,
    });
  }
  return lista.sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
}

/** Arquivos .zip / .tar.gz colocados pelo usuário na pasta de pacotes (ex.: vindos de um pendrive). */
async function pacotesDeArquivos() {
  try {
    return (await fsp.readdir(PASTAS.pacotes, { withFileTypes: true }))
      .filter((e) => e.isFile() && PACOTE_DE_ARQUIVOS.test(e.name))
      .map((e) => path.join(PASTAS.pacotes, e.name));
  } catch {
    return [];
  }
}

async function* arquivosEm(pasta) {
  for (const e of await fsp.readdir(pasta, { withFileTypes: true })) {
    const p = path.join(pasta, e.name);
    if (e.isDirectory()) yield* arquivosEm(p);
    else if (e.isFile()) yield p;
  }
}

/**
 * Importa os .zip/.tar.gz avulsos: extrai, coloca cada arquivo na pasta certa e registra na biblioteca.
 * Usa o `tar` que já vem no Windows 10+, macOS e Linux. O pacote original vai para "pacotes/importados".
 */
export async function importarPacotesDeArquivos({ onPacote, somente } = {}) {
  const lista = somente ? somente.filter(Boolean) : await pacotesDeArquivos();
  const resultado = { pacotes: 0, arquivos: 0, falhas: [] };
  for (const arq of lista) {
    const nome = path.basename(arq).replace(PACOTE_DE_ARQUIVOS, '');
    onPacote?.(nome);
    const temp = path.join(PASTAS.tmp, `importar-${Date.now()}`);
    try {
      await extrair(arq, temp);
      for await (const f of arquivosEm(temp)) {
        const tipo = bib.tipoPorNome(f);
        if (tipo === 'outro') continue;
        const pasta = tipo === 'zim' ? PASTAS.zim : tipo === 'mapa' ? PASTAS.mapas : path.join(PASTAS.meus, nomeSeguro(nome));
        const destino = await arquivoLivre(pasta, nomeSeguro(path.basename(f)));
        await mover(f, destino);
        const { size } = await fsp.stat(destino);
        await bib.registrar({
          id: `pac-${nomeSeguro(nome).slice(0, 20)}-${Math.random().toString(36).slice(2, 8)}`,
          tipo,
          titulo: path.basename(destino, path.extname(destino)),
          categoria: tipo === 'mapa' ? 'mapas' : tipo === 'zim' ? 'enciclopedia' : nome,
          fonte: `Pacote ${path.basename(arq)}`,
          origem: 'usuario',
          arquivo: relDe(DADOS, destino),
          tamanho: size,
          indexado: false,
        });
        resultado.arquivos++;
      }
      await mover(arq, path.join(PASTAS.pacotes, 'importados', path.basename(arq)));
      resultado.pacotes++;
    } catch (e) {
      resultado.falhas.push(`${path.basename(arq)}: ${e.message}`);
    } finally {
      await fsp.rm(temp, { recursive: true, force: true }).catch(() => {});
    }
  }
  return resultado;
}

/** Existe uma cópia compactada (gz) guardada para este item? (permite reparo sem internet) */
export async function temCopia(id) {
  const p = await obterPacote(id);
  return !!p && p.formato === 'gz' && (await pacoteExiste(p));
}
