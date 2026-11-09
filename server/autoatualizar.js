// Atualização automática ao ligar o computador (opcional; o usuário liga em Ajustes).
//
// Quando ligada, o sistema abre o Protocolo Zero escondido logo depois do login
// (`node server/index.js --atualizar-sozinho`):
//   1. espera a internet (até 10 min — a rede demora a subir depois do boot);
//   2. baixa o catálogo publicado (server/novidades.js) e baixa só as fontes NOVAS do pacote que o usuário usa;
//   3. se o usuário permitiu, troca para um modelo de IA melhor quando o computador aguenta;
//   4. descompacta (Iniciar) e se fecha sozinho quando ninguém estiver usando.
// Só acrescenta: nada do que já foi baixado é apagado, trocado ou baixado de novo — nem quando a fonte
// ou o link deixa de existir. Nunca mexe nos arquivos do usuário, nas anotações nem nas conversas.
//
// Onde fica o registro de "abrir ao ligar":
//   Windows: atalho na pasta Inicializar do usuário (shell:startup) — sem precisar de administrador;
//   macOS:   ~/Library/LaunchAgents/br.protocolozero.atualizar.plist;
//   Linux:   ~/.config/autostart/protocolo-zero-atualizar.desktop.
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { RAIZ, DADOS, PLATAFORMA, executar, existe, lerJSON, gravarJSON } from './util.js';

// Duas entradas independentes ao ligar o computador:
//   atualizar — abre escondido, procura fontes novas e fecha sozinho (--atualizar-sozinho);
//   abrir     — abre o Protocolo Zero normalmente (com a janela e o navegador).
const TIPOS = {
  atualizar: {
    win: 'Protocolo Zero - atualizar.lnk', plist: 'br.protocolozero.atualizar', desktop: 'protocolo-zero-atualizar.desktop',
    nome: 'Protocolo Zero (atualizar)', descricao: 'Protocolo Zero: procurar fontes novas ao ligar o computador', args: ['--atualizar-sozinho'], escondido: true,
  },
  abrir: {
    win: 'Protocolo Zero.lnk', plist: 'br.protocolozero.abrir', desktop: 'protocolo-zero-abrir.desktop',
    nome: 'Protocolo Zero', descricao: 'Abrir o Protocolo Zero ao ligar o computador', args: [], escondido: false,
  },
};
export const TIPOS_INICIO = Object.keys(TIPOS);
const ARQ_RESULTADO = path.join(DADOS, 'atualizacao-automatica.json');
export const INTERVALO_MINIMO = 20 * 3600 * 1000; // no máximo uma vez por dia

/** Node a usar: o que veio junto (pasta runtime/) ou o que está rodando agora. */
async function caminhoNode() {
  // No Windows é sempre o x64 (o Windows ARM roda programas x64).
  const arq = PLATAFORMA !== 'win32' && process.arch === 'arm64' ? 'arm64' : 'x64';
  const so = PLATAFORMA === 'win32' ? 'win' : PLATAFORMA;
  const junto = path.join(RAIZ, 'runtime', `${so}-${arq}`, PLATAFORMA === 'win32' ? 'node.exe' : 'node');
  return (await existe(junto)) ? junto : process.execPath;
}

let pastaInicializarWin = null;
async function caminhoRegistro(tipo = 'atualizar') {
  const t = TIPOS[tipo];
  if (!t) throw new Error(`Tipo de inicialização desconhecido: ${tipo}`);
  if (PLATAFORMA === 'win32') {
    pastaInicializarWin ??= String(await executar('powershell', ['-NoProfile', '-Command', "[Environment]::GetFolderPath('Startup')"], { timeout: 15000 })).trim();
    return path.join(pastaInicializarWin, t.win);
  }
  if (PLATAFORMA === 'darwin') return path.join(os.homedir(), 'Library', 'LaunchAgents', `${t.plist}.plist`);
  return path.join(os.homedir(), '.config', 'autostart', t.desktop);
}

/** O sistema está configurado para abrir isto ao ligar? */
export async function registrado(tipo = 'atualizar') {
  try {
    return await existe(await caminhoRegistro(tipo));
  } catch {
    return false;
  }
}

/**
 * Script PowerShell que cria o atalho do Windows. O atalho abre um PowerShell escondido que abre o Node
 * (escondido para "atualizar"; minimizado para "abrir", que mostra a janela do servidor na barra de tarefas).
 * Atalhos não têm modo "oculto"; WindowStyle 7 = minimizado, para não piscar.
 */
export function scriptAtalhoWindows({ arq, node, script, dados, raiz = RAIZ, tipo = 'atualizar' }) {
  const t = TIPOS[tipo];
  const esc = (s) => s.replace(/'/g, "''");
  const env = dados ? `$env:PROTOCOLO_ZERO_DADOS='${esc(dados)}'; ` : '';
  const argumentos = [`"${esc(script)}"`, ...t.args].join(' ');
  const comando = `${env}Start-Process -WindowStyle ${t.escondido ? 'Hidden' : 'Minimized'} -FilePath '${esc(node)}' -ArgumentList '${argumentos}' -WorkingDirectory '${esc(raiz)}'`;
  return `$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${esc(arq)}'); `
    + "$s.TargetPath=(Join-Path $env:SystemRoot 'System32\\WindowsPowerShell\\v1.0\\powershell.exe'); "
    + `$s.Arguments='-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "${esc(comando).replace(/"/g, '\\"')}"'; `
    + `$s.WorkingDirectory='${esc(raiz)}'; $s.WindowStyle=7; $s.Description='${esc(t.descricao)}'; `
    + `$s.IconLocation=(Join-Path $env:SystemRoot 'System32\\shell32.dll') + ',${t.escondido ? 238 : 13}'; $s.Save()`;
}

/** Liga ou desliga uma das entradas de "ao ligar o computador" (tipo: atualizar | abrir). */
export async function registrar(ligar, tipo = 'atualizar') {
  const t = TIPOS[tipo];
  const arq = await caminhoRegistro(tipo);
  if (!ligar) {
    await fsp.rm(arq, { force: true });
    return { arquivo: arq, ligado: false };
  }
  const node = await caminhoNode();
  const script = path.join(RAIZ, 'server', 'index.js');
  const dadosProprio = process.env.PROTOCOLO_ZERO_DADOS; // pasta de dados fora do padrão (pendrive/HD)
  await fsp.mkdir(path.dirname(arq), { recursive: true });

  if (PLATAFORMA === 'win32') {
    await executar('powershell', ['-NoProfile', '-Command', scriptAtalhoWindows({ arq, node, script, dados: dadosProprio, tipo })], { timeout: 20000 });
  } else if (PLATAFORMA === 'darwin') {
    const x = (v) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    await fsp.writeFile(arq, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${t.plist}</string>
  <key>ProgramArguments</key><array>${[node, script, ...t.args].map((a) => `<string>${x(a)}</string>`).join('')}</array>
  <key>WorkingDirectory</key><string>${x(RAIZ)}</string>
  ${dadosProprio ? `<key>EnvironmentVariables</key><dict><key>PROTOCOLO_ZERO_DADOS</key><string>${x(dadosProprio)}</string></dict>` : ''}
  <key>RunAtLoad</key><true/>
  <key>ProcessType</key><string>${t.escondido ? 'Background' : 'Interactive'}</string>
</dict></plist>
`);
  } else {
    const q = (v) => `"${v.replace(/(["\\$`])/g, '\\$1')}"`;
    const exec = `${dadosProprio ? `env PROTOCOLO_ZERO_DADOS=${q(dadosProprio)} ` : ''}${[node, script].map(q).join(' ')}${t.args.length ? ` ${t.args.join(' ')}` : ''}`;
    await fsp.writeFile(arq, `[Desktop Entry]\nType=Application\nName=${t.nome}\nComment=${t.descricao}\nExec=${exec}\nPath=${RAIZ}\nTerminal=false\nNoDisplay=${t.escondido}\nX-GNOME-Autostart-enabled=true\nX-GNOME-Autostart-Delay=${t.escondido ? 60 : 10}\n`);
  }
  return { arquivo: arq, ligado: true };
}

/** O Protocolo Zero está rodando de um pendrive/HD externo? (aí o registro pode apontar para um disco ausente) */
export async function emDiscoRemovivel() {
  if (PLATAFORMA !== 'win32') return /^\/(media|mnt|Volumes|run\/media)\//.test(RAIZ);
  try {
    const letra = RAIZ.slice(0, 2);
    const out = await executar('powershell', ['-NoProfile', '-Command', `(Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='${letra}'").DriveType`], { timeout: 15000 });
    return String(out).trim() === '2';
  } catch {
    return false;
  }
}

export const ultimoResultado = () => lerJSON(ARQ_RESULTADO, null);
export const guardarResultado = (r) => gravarJSON(ARQ_RESULTADO, r);

/** Já atualizou há pouco? (evita repetir a cada login no mesmo dia) */
export async function podeRodar() {
  const r = await ultimoResultado();
  return !r?.fim || r.estado === 'sem-internet' || Date.now() - r.fim > INTERVALO_MINIMO;
}
