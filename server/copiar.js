// "Copiar para pendrive ou HD": leva o Protocolo Zero (programa, conteúdo baixado e, se quiser, as IAs
// e o Node.js) para outro disco, pronto para abrir com um clique em outro computador ou direto do pendrive.
// A pasta padrão é <raiz do disco>/ProtocoloZero; se não der para gravar na raiz, usa Documentos/ProtocoloZero.
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { RAIZ, DADOS, PLATAFORMA, executar, existe, dentroDe } from './util.js';

const NOME_PASTA = 'ProtocoloZero';
// Arquivos do programa que vão na cópia (o resto da pasta do projeto fica de fora).
const PROGRAMA = ['server', 'public', 'catalogo', 'instalar', 'package.json', 'README.md', 'LICENSE',
  'Iniciar Protocolo Zero.bat', 'Iniciar Protocolo Zero.command', 'iniciar-protocolo-zero.sh'];
// Dentro de dados/: o que nunca vai (temporários, do servidor em execução, testes, cópias de segurança).
const IGNORAR_DADOS = new Set(['tmp', 'logs', 'servidor.json']);
const ignorarArquivoDados = (nome) => /\.anterior\.json$|\.teste-|\.tmp$|\.parcial$/i.test(nome);
const ANOTACOES = new Set(['estoque.json', 'nutricao.json', 'emergencia.json']);
const LIMITE_FAT32 = 4 * 1024 ** 3 - 1;

const pastaModelosOllama = () => process.env.OLLAMA_MODELS || path.join(os.homedir(), '.ollama', 'models');
const documentos = () => path.join(os.homedir(), 'Documents');

async function tamanhoDe(alvo, filtro = () => true) {
  let total = 0;
  let maior = 0;
  const visitar = async (p, rel) => {
    let st;
    try {
      st = await fsp.stat(p);
    } catch {
      return;
    }
    if (st.isDirectory()) {
      for (const n of await fsp.readdir(p).catch(() => [])) {
        const r = rel ? `${rel}/${n}` : n;
        if (filtro(r, n)) await visitar(path.join(p, n), r);
      }
    } else {
      total += st.size;
      maior = Math.max(maior, st.size);
    }
  };
  await visitar(alvo, '');
  return { total, maior };
}

/** Filtro de dados/: devolve false para o que não vai na cópia. */
function filtroDados(incluir) {
  return (rel, nome) => {
    const topo = rel.split('/')[0];
    if (IGNORAR_DADOS.has(topo) || ignorarArquivoDados(nome)) return false;
    if (topo === 'pacotes') return !!incluir.pacotes;
    if (topo === 'leitura') return !!incluir.anotacoes; // notas de leitura dos livros
    if (!rel.includes('/') && ANOTACOES.has(nome)) return !!incluir.anotacoes;
    return true;
  };
}

/** Tamanho de cada parte que pode ir na cópia. */
export async function tamanhos() {
  const prog = { total: 0, maior: 0 };
  for (const n of PROGRAMA) {
    const t = await tamanhoDe(path.join(RAIZ, n));
    prog.total += t.total;
  }
  const conteudo = await tamanhoDe(DADOS, filtroDados({ anotacoes: false, pacotes: false }));
  let anotacoes = 0;
  for (const n of ANOTACOES) anotacoes += (await fsp.stat(path.join(DADOS, n)).catch(() => ({ size: 0 }))).size;
  anotacoes += (await tamanhoDe(path.join(DADOS, 'leitura'))).total;
  const pacotes = await tamanhoDe(path.join(DADOS, 'pacotes'));
  const ias = await tamanhoDe(pastaModelosOllama());
  return {
    programa: prog.total,
    conteudo: conteudo.total,
    maiorArquivo: Math.max(conteudo.maior, ias.maior, pacotes.maior),
    anotacoes,
    pacotes: pacotes.total,
    ias: ias.total,
  };
}

/** Pode criar a pasta e gravar nela? */
async function gravavel(pasta) {
  try {
    await fsp.mkdir(pasta, { recursive: true });
    const teste = path.join(pasta, `.teste-gravacao-${process.pid}`);
    await fsp.writeFile(teste, 'ok');
    await fsp.rm(teste, { force: true });
    return true;
  } catch {
    return false;
  }
}
/** Testa sem deixar pasta nova para trás. */
async function testarGravacao(pasta) {
  const existia = await existe(pasta);
  const ok = await gravavel(pasta);
  if (ok && !existia) await fsp.rmdir(pasta).catch(() => {});
  return ok;
}

async function espaco(p) {
  try {
    const s = await fsp.statfs(p);
    return { livre: s.bavail * s.bsize, total: s.blocks * s.bsize };
  } catch {
    return { livre: 0, total: 0 };
  }
}

async function discosWindows() {
  const out = await executar('powershell', ['-NoProfile', '-Command',
    'Get-CimInstance Win32_LogicalDisk | Select-Object DeviceID,DriveType,FreeSpace,Size,VolumeName,FileSystem | ConvertTo-Json -Compress'], { timeout: 20000 }).catch(() => '');
  let lista = [];
  try {
    const j = JSON.parse(String(out?.stdout ?? out).trim() || '[]');
    lista = Array.isArray(j) ? j : [j];
  } catch {}
  // 2 = removível (pendrive), 3 = disco local (interno ou HD/SSD externo). CD e rede ficam de fora.
  const sistema = (process.env.SystemDrive || 'C:').toUpperCase();
  return lista.filter((d) => [2, 3].includes(d.DriveType) && d.Size).map((d) => ({
    raiz: `${d.DeviceID}\\`,
    nome: d.VolumeName || '',
    tipo: d.DriveType === 2 ? 'pendrive' : d.DeviceID.toUpperCase() === sistema ? 'sistema' : 'disco',
    sistemaArquivos: d.FileSystem || '',
    livre: Number(d.FreeSpace) || 0,
    total: Number(d.Size) || 0,
  }));
}

async function discosUnix() {
  const lista = [{ raiz: '/', nome: 'Este computador', tipo: 'sistema' }];
  const usuario = os.userInfo().username;
  const bases = PLATAFORMA === 'darwin' ? ['/Volumes'] : [`/media/${usuario}`, `/run/media/${usuario}`, '/media', '/mnt'];
  for (const b of bases) {
    for (const n of await fsp.readdir(b).catch(() => [])) {
      const p = path.join(b, n);
      if (n === usuario || lista.some((x) => x.raiz === p)) continue;
      const st = await fsp.lstat(p).catch(() => null);
      if (!st?.isDirectory()) continue; // em /Volumes o disco do sistema é um atalho
      lista.push({ raiz: p, nome: n, tipo: 'disco' });
    }
  }
  for (const d of lista) Object.assign(d, await espaco(d.raiz));
  return lista.filter((d) => d.total);
}

/** Discos onde dá para copiar, cada um com a pasta sugerida. */
export async function destinos() {
  const discos = PLATAFORMA === 'win32' ? await discosWindows() : await discosUnix();
  const r = [];
  for (const d of discos) {
    let pasta = path.join(d.raiz, NOME_PASTA);
    let ok = await testarGravacao(pasta);
    let nota = '';
    // Sem permissão na raiz do disco do sistema: usa Documentos.
    if (!ok && d.tipo === 'sistema') {
      pasta = path.join(documentos(), NOME_PASTA);
      ok = await testarGravacao(pasta);
      nota = 'Sem permissão na raiz do disco: vai para Documentos.';
    }
    if (d.tipo === 'sistema' && dentroDe(pasta, RAIZ)) ok = false;
    r.push({ ...d, pasta, gravavel: ok, nota, fat32: /^FAT(32)?$/i.test(d.sistemaArquivos || '') });
  }
  return r;
}

/** Recusa destinos perigosos (dentro do próprio projeto, pasta com outras coisas). */
async function validarDestino(pasta) {
  if (!pasta || !path.isAbsolute(pasta)) throw new Error('Escolha uma pasta completa (ex.: E:\\ProtocoloZero).');
  const alvo = path.resolve(pasta);
  if (dentroDe(RAIZ, alvo) || dentroDe(DADOS, alvo) || dentroDe(alvo, RAIZ) || dentroDe(alvo, DADOS)) {
    throw new Error('Essa pasta é a do próprio Protocolo Zero. Escolha outro disco ou pasta.');
  }
  const itens = await fsp.readdir(alvo).catch(() => []);
  if (itens.length) {
    const pkg = JSON.parse(await fsp.readFile(path.join(alvo, 'package.json'), 'utf8').catch(() => '{}'));
    if (pkg.name !== 'protocolo-zero') throw new Error('Essa pasta já tem outros arquivos. Escolha uma pasta vazia ou uma cópia anterior do Protocolo Zero.');
  }
  if (!(await gravavel(alvo))) throw new Error('Sem permissão para gravar nessa pasta. Tente outra (por exemplo, em Documentos).');
  return alvo;
}

/** Copia arquivo a arquivo, pulando os que já estão iguais (tamanho e data): copiar de novo só leva o que mudou. */
async function copiarArvore(origem, destino, filtro, t, sinal, rel = '') {
  const st = await fsp.stat(origem).catch(() => null);
  if (!st) return;
  if (st.isDirectory()) {
    await fsp.mkdir(destino, { recursive: true });
    for (const n of await fsp.readdir(origem)) {
      const r = rel ? `${rel}/${n}` : n;
      if (!filtro(r, n)) continue;
      await copiarArvore(path.join(origem, n), path.join(destino, n), filtro, t, sinal, r);
    }
    return;
  }
  if (sinal.aborted) throw new Error('Cancelado');
  const dst = await fsp.stat(destino).catch(() => null);
  if (!(dst && dst.size === st.size && Math.abs(dst.mtimeMs - st.mtimeMs) < 2000)) {
    t.mensagem = `Copiando ${path.basename(origem)}…`;
    await fsp.copyFile(origem, destino);
    await fsp.utimes(destino, st.atime, st.mtime).catch(() => {});
  }
  t.baixado += st.size;
}

const LEIA_ME = (incluir) => `PROTOCOLO ZERO — cópia para levar
=================================

Biblioteca offline de sobrevivência, saúde e autossuficiência, com assistente de IA que roda no computador.

COMO ABRIR (um clique)
----------------------
Windows ...... clique duas vezes em "Iniciar Protocolo Zero.bat"
macOS ........ clique duas vezes em "Iniciar Protocolo Zero.command"
               (se o Mac bloquear: clique com o botão direito > Abrir)
Linux ........ rode "./iniciar-protocolo-zero.sh" no terminal (ou clique duas vezes, se o sistema permitir)

O navegador abre sozinho. Para fechar, feche a janela preta do Protocolo Zero.

RODAR DIRETO DO PENDRIVE OU HD
------------------------------
Funciona: é só abrir o arquivo acima dentro desta pasta. Num pendrive comum fica mais lento; um HD ou SSD externo é bem melhor.
O Windows não deixa programas abrirem sozinhos quando o pendrive é conectado (proteção contra vírus): abra o arquivo com dois cliques.

INSTALAR EM OUTRO COMPUTADOR
----------------------------
1. Copie esta pasta inteira ("${NOME_PASTA}") para o disco do outro computador.
   Sugestão: na raiz do disco (ex.: C:\\${NOME_PASTA}) ou, se não tiver permissão, em Documentos.
2. Abra o arquivo "Iniciar Protocolo Zero" (veja acima).
3. Na tela inicial, clique em "Iniciar Protocolo Zero".

O QUE PRECISA NO OUTRO COMPUTADOR
---------------------------------
- Node.js: já vai junto nesta cópia (pasta instalar/node, para Windows, macOS e Linux). Não precisa instalar.
- Assistente de IA: precisa do Ollama instalado (https://ollama.com).${incluir.ias ? ' As IAs já vão nesta cópia (pasta ia-modelos): o Protocolo Zero usa essa pasta ao abrir. Se o Ollama já estiver aberto no computador, feche-o antes de abrir o Protocolo Zero.' : ' As IAs não foram copiadas: baixe pelo botão "Instalar conteúdo" quando tiver internet.'}
- A biblioteca, as enciclopédias e os mapas funcionam sem IA e sem internet.

Copiado em ${new Date().toLocaleString('pt-BR')}.
`;

/** Executa a cópia (dentro de uma tarefa, com progresso). */
export async function copiar({ pasta, incluir = {} }, t, sinal) {
  const alvo = await validarDestino(pasta);
  const tam = await tamanhos();
  const total = tam.programa + tam.conteudo + (incluir.anotacoes ? tam.anotacoes : 0) + (incluir.pacotes ? tam.pacotes : 0)
    + (incluir.ias ? tam.ias : 0);
  const { livre } = await espaco(alvo);
  // Só o que falta (copiar de novo para a mesma pasta reaproveita o que já está lá).
  const jaTem = (await tamanhoDe(alvo)).total;
  if (total - jaTem > livre) throw new Error(`Não cabe: precisa de cerca de ${(total / 1e9).toFixed(1)} GB e há ${(livre / 1e9).toFixed(1)} GB livres.`);
  t.total = total;
  t.baixado = 0;

  t.mensagem = 'Copiando o programa…';
  for (const n of PROGRAMA) await copiarArvore(path.join(RAIZ, n), path.join(alvo, n), () => true, t, sinal);
  t.mensagem = 'Copiando o conteúdo baixado…';
  await copiarArvore(DADOS, path.join(alvo, 'dados'), filtroDados(incluir), t, sinal);
  if (incluir.ias && (await existe(pastaModelosOllama()))) {
    t.mensagem = 'Copiando as IAs…';
    await copiarArvore(pastaModelosOllama(), path.join(alvo, 'ia-modelos'), () => true, t, sinal);
  }
  await fsp.writeFile(path.join(alvo, 'LEIA-ME.txt'), LEIA_ME(incluir).replace(/\n/g, PLATAFORMA === 'win32' ? '\r\n' : '\n'));
  // Atalhos de um clique precisam poder ser executados (em pendrive exFAT/FAT isso é ignorado, sem problema).
  for (const n of ['Iniciar Protocolo Zero.command', 'iniciar-protocolo-zero.sh', path.join('instalar', 'instalar-node.sh')]) {
    await fsp.chmod(path.join(alvo, n), 0o755).catch(() => {});
  }
  t.baixado = t.total;
  t.mensagemFinal = `Copiado para ${alvo}`;
  return { pasta: alvo };
}

/** Abre uma pasta no gerenciador de arquivos. */
export function abrirPasta(pasta) {
  const cmd = PLATAFORMA === 'win32' ? 'explorer' : PLATAFORMA === 'darwin' ? 'open' : 'xdg-open';
  spawn(cmd, [pasta], { detached: true, stdio: 'ignore' }).unref();
}

/**
 * Atalho "Protocolo Zero" neste computador, apontando para o iniciador de um clique.
 * onde: 'desktop' (Área de Trabalho) ou 'menu' (Menu Iniciar no Windows, menu de aplicativos no Linux,
 * pasta Aplicativos do usuário no macOS).
 */
export async function criarAtalho(onde = 'desktop') {
  const menu = onde === 'menu';
  if (PLATAFORMA === 'win32') {
    const alvo = path.join(RAIZ, 'Iniciar Protocolo Zero.bat');
    const esc = (s) => s.replace(/'/g, "''");
    const pasta = menu ? 'Programs' : 'Desktop'; // Programs = Menu Iniciar > Todos os aplicativos
    const script = `$d=[Environment]::GetFolderPath('${pasta}'); $s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $d 'Protocolo Zero.lnk')); `
      + `$s.TargetPath='${esc(alvo)}'; $s.WorkingDirectory='${esc(RAIZ)}'; $s.IconLocation='${esc(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'shell32.dll'))},13'; `
      + `$s.Description='Abrir o Protocolo Zero'; $s.Save(); Write-Output (Join-Path $d 'Protocolo Zero.lnk')`;
    const out = await executar('powershell', ['-NoProfile', '-Command', script], { timeout: 20000 });
    return { arquivo: String(out).trim() };
  }
  if (PLATAFORMA === 'linux') {
    const pasta = menu ? path.join(os.homedir(), '.local', 'share', 'applications') : path.join(os.homedir(), 'Desktop');
    const arq = path.join(pasta, 'protocolo-zero.desktop');
    await fsp.mkdir(pasta, { recursive: true });
    await fsp.writeFile(arq, `[Desktop Entry]\nType=Application\nName=Protocolo Zero\nComment=Abrir o Protocolo Zero\nExec="${path.join(RAIZ, 'iniciar-protocolo-zero.sh')}"\nPath=${RAIZ}\nTerminal=true\nIcon=help-browser\nCategories=Education;\n`);
    await fsp.chmod(arq, 0o755).catch(() => {});
    return { arquivo: arq };
  }
  // macOS: uma cópia do .command que entra na pasta do Protocolo Zero.
  const pasta = path.join(os.homedir(), menu ? 'Applications' : 'Desktop');
  await fsp.mkdir(pasta, { recursive: true });
  const arq = path.join(pasta, 'Protocolo Zero.command');
  const conteudo = (await fsp.readFile(path.join(RAIZ, 'Iniciar Protocolo Zero.command'), 'utf8'))
    .replace('cd "$(dirname "$0")"', `cd "${RAIZ.replace(/"/g, '\\"')}"`);
  await fsp.writeFile(arq, conteudo);
  await fsp.chmod(arq, 0o755).catch(() => {});
  return { arquivo: arq };
}

export const LIMITE_ARQUIVO_FAT32 = LIMITE_FAT32;
