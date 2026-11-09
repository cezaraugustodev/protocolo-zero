// Detecta RAM, CPU, GPU e espaço em disco em Windows, macOS e Linux.
import os from 'node:os';
import fsp from 'node:fs/promises';
import { executar, PLATAFORMA, DADOS } from './util.js';

const GB = 1024 ** 3;
const lista = (x) => (Array.isArray(x) ? x : x ? [x] : []);

function classificarGpu(nome = '', vram = 0) {
  const n = nome.toLowerCase();
  if (/nvidia|geforce|rtx|gtx|quadro|tesla/.test(n)) return { fabricante: 'nvidia', dedicada: true };
  if (/apple/.test(n)) return { fabricante: 'apple', dedicada: false };
  if (/amd|radeon|ati /.test(n)) {
    const integrada = /graphics$|vega \d+ graphics|\d{3}m\b|radeon\(tm\) graphics/.test(n) || vram < 2 * GB;
    return { fabricante: 'amd', dedicada: !integrada };
  }
  if (/intel/.test(n)) return { fabricante: 'intel', dedicada: /\barc\b/.test(n) && !/graphics/.test(n) };
  if (/microsoft basic|virtual|vmware|parallels/.test(n)) return { fabricante: 'virtual', dedicada: false };
  return { fabricante: 'outra', dedicada: false };
}

async function detectarWindows() {
  const script = `
$ErrorActionPreference='SilentlyContinue'
$cs=Get-CimInstance Win32_ComputerSystem
$os=Get-CimInstance Win32_OperatingSystem
$cpu=@(Get-CimInstance Win32_Processor)
$ram=(Get-CimInstance Win32_PhysicalMemory | Measure-Object Capacity -Sum).Sum
$gpus=@(Get-CimInstance Win32_VideoController | ForEach-Object { @{nome=[string]$_.Name; vram=[double]$_.AdapterRAM; driver=[string]$_.DriverVersion} })
$reg=@(Get-ItemProperty 'HKLM:\\SYSTEM\\ControlSet001\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0*' | Where-Object { $_.'HardwareInformation.qwMemorySize' } | ForEach-Object { @{nome=[string]$_.DriverDesc; vram=[double]$_.'HardwareInformation.qwMemorySize'} })
@{ ramInstalada=[double]$ram; ramVisivel=[double]$cs.TotalPhysicalMemory; ramLivre=[double]$os.FreePhysicalMemory*1024; cpu=[string]$cpu[0].Name; nucleos=[int](($cpu|Measure-Object NumberOfCores -Sum).Sum); threads=[int](($cpu|Measure-Object NumberOfLogicalProcessors -Sum).Sum); gpus=$gpus; gpusReg=$reg; sistema=[string]$os.Caption } | ConvertTo-Json -Depth 4 -Compress`;
  const saida = await executar('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 30000 });
  const d = JSON.parse(saida);
  // O registro tem o valor real de VRAM (WMI limita a 4 GB).
  const reg = lista(d.gpusReg);
  const gpus = lista(d.gpus).map((g) => {
    const r = reg.find((x) => x.nome === g.nome);
    const vram = Math.max(Number(g.vram) || 0, Number(r?.vram) || 0);
    return { nome: g.nome, vram, driver: g.driver };
  });
  return {
    sistema: d.sistema || 'Windows',
    cpu: d.cpu,
    nucleos: d.nucleos,
    threads: d.threads,
    ramInstalada: d.ramInstalada || d.ramVisivel,
    ramTotal: d.ramVisivel,
    ramLivre: d.ramLivre,
    gpus,
  };
}

async function detectarLinux() {
  const gpus = [];
  try {
    const out = await executar('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], { timeout: 8000 });
    for (const linha of out.trim().split('\n')) {
      const [nome, mem] = linha.split(',').map((s) => s.trim());
      if (nome) gpus.push({ nome, vram: Number(mem) * 1024 * 1024 });
    }
  } catch {}
  if (!gpus.length) {
    try {
      const out = await executar('lspci', [], { timeout: 8000 });
      for (const linha of out.split('\n').filter((l) => /vga|3d controller|display/i.test(l))) {
        gpus.push({ nome: linha.split(': ').slice(1).join(': ').trim(), vram: 0 });
      }
    } catch {}
    // VRAM de placas AMD via sysfs.
    try {
      for (const card of await fsp.readdir('/sys/class/drm')) {
        if (!/^card\d+$/.test(card)) continue;
        const v = Number(await fsp.readFile(`/sys/class/drm/${card}/device/mem_info_vram_total`, 'utf8').catch(() => 0));
        const amd = gpus.find((g) => /amd|radeon|ati/i.test(g.nome) && !g.vram);
        if (v && amd) amd.vram = v;
      }
    } catch {}
  }
  let sistema = 'Linux';
  try {
    const rel = await fsp.readFile('/etc/os-release', 'utf8');
    sistema = /PRETTY_NAME="([^"]+)"/.exec(rel)?.[1] || sistema;
  } catch {}
  const cpus = os.cpus();
  let nucleos = cpus.length;
  try {
    const info = await fsp.readFile('/proc/cpuinfo', 'utf8');
    const ids = new Set(info.split('\n\n').map((b) => `${/physical id\s*:\s*(\d+)/.exec(b)?.[1]}-${/core id\s*:\s*(\d+)/.exec(b)?.[1]}`));
    if (ids.size > 1) nucleos = ids.size;
  } catch {}
  return { sistema, cpu: cpus[0]?.model?.trim(), nucleos, threads: cpus.length, ramInstalada: os.totalmem(), ramTotal: os.totalmem(), ramLivre: os.freemem(), gpus };
}

async function detectarMac() {
  const cpus = os.cpus();
  let cpu = cpus[0]?.model;
  let nucleos = cpus.length;
  try {
    cpu = (await executar('sysctl', ['-n', 'machdep.cpu.brand_string'])).trim() || cpu;
    nucleos = Number((await executar('sysctl', ['-n', 'hw.physicalcpu'])).trim()) || nucleos;
  } catch {}
  const gpus = [];
  try {
    const d = JSON.parse(await executar('system_profiler', ['SPDisplaysDataType', '-json'], { timeout: 20000 }));
    for (const g of d.SPDisplaysDataType || []) {
      const vramTxt = g.spdisplays_vram || g.spdisplays_vram_shared || '';
      const vram = /(\d+)\s*GB/i.test(vramTxt) ? Number(RegExp.$1) * GB : /(\d+)\s*MB/i.test(vramTxt) ? Number(RegExp.$1) * 1024 ** 2 : 0;
      gpus.push({ nome: g.sppci_model || g._name || 'GPU', vram });
    }
  } catch {}
  let versao = '';
  try {
    versao = (await executar('sw_vers', ['-productVersion'])).trim();
  } catch {}
  return { sistema: `macOS ${versao}`.trim(), cpu, nucleos, threads: cpus.length, ramInstalada: os.totalmem(), ramTotal: os.totalmem(), ramLivre: os.freemem(), gpus };
}

export async function espacoEmDisco(pasta = DADOS) {
  try {
    const s = await fsp.statfs(pasta);
    return { livre: s.bavail * s.bsize, total: s.blocks * s.bsize };
  } catch {
    return { livre: 0, total: 0 };
  }
}

let cache = null;
export async function detectarHardware({ forcar = false } = {}) {
  if (cache && !forcar && Date.now() - cache.quando < 60000) return cache.dados;
  let base;
  try {
    base = PLATAFORMA === 'win32' ? await detectarWindows() : PLATAFORMA === 'darwin' ? await detectarMac() : await detectarLinux();
  } catch (e) {
    const cpus = os.cpus();
    base = { sistema: os.type(), cpu: cpus[0]?.model, nucleos: cpus.length, threads: cpus.length, ramInstalada: os.totalmem(), ramTotal: os.totalmem(), ramLivre: os.freemem(), gpus: [], aviso: `Detecção parcial: ${e.message}` };
  }

  const appleSilicon = PLATAFORMA === 'darwin' && os.arch() === 'arm64';
  const gpus = base.gpus
    .map((g) => ({ ...g, ...classificarGpu(g.nome, g.vram) }))
    .filter((g) => g.fabricante !== 'virtual');

  // Aceleração que o Ollama realmente usa em cada caso.
  let aceleracao = { tipo: 'cpu', descricao: 'Somente CPU', memoria: 0 };
  const nvidia = gpus.filter((g) => g.fabricante === 'nvidia').sort((a, b) => b.vram - a.vram)[0];
  const amd = gpus.filter((g) => g.fabricante === 'amd' && g.dedicada).sort((a, b) => b.vram - a.vram)[0];
  if (appleSilicon) {
    aceleracao = { tipo: 'metal', descricao: 'GPU Apple (Metal) com memória unificada', memoria: base.ramTotal * 0.65 };
  } else if (nvidia && nvidia.vram >= 2 * GB) {
    aceleracao = { tipo: 'cuda', descricao: `NVIDIA CUDA — ${nvidia.nome}`, memoria: nvidia.vram };
  } else if (amd && amd.vram >= 4 * GB) {
    aceleracao = { tipo: 'rocm', descricao: `AMD ROCm (depende do modelo da placa) — ${amd.nome}`, memoria: amd.vram, incerto: true };
  }

  const disco = await espacoEmDisco();
  const dados = {
    plataforma: PLATAFORMA,
    arquitetura: os.arch(),
    ...base,
    gpus,
    aceleracao,
    disco,
    pastaDados: DADOS,
  };
  cache = { quando: Date.now(), dados };
  return dados;
}
