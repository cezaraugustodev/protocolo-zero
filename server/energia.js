// Estimativa de consumo deste computador e kit de energia (solar portátil / estação de energia)
// para manter o Protocolo Zero funcionando sem rede elétrica.
// Valores são estimativas conservadoras por tipo de máquina — não medição.
import fsp from 'node:fs/promises';
import { PLATAFORMA, executar } from './util.js';
import { detectarHardware } from './hardware.js';

let cache = null;

/** Notebook/portátil? (tem bateria) */
async function temBateria() {
  try {
    if (PLATAFORMA === 'win32') {
      const out = await executar('powershell', ['-NoProfile', '-Command', '[bool](Get-CimInstance Win32_Battery)'], { timeout: 15000 });
      return /true/i.test(out);
    }
    if (PLATAFORMA === 'darwin') return /InternalBattery/i.test(await executar('pmset', ['-g', 'batt'], { timeout: 8000 }));
    return (await fsp.readdir('/sys/class/power_supply')).some((n) => /^BAT/i.test(n));
  } catch {
    return null;
  }
}

/** Consumo estimado (W) lendo/navegando e enquanto a IA responde. */
export async function perfilEnergia() {
  if (cache) return cache;
  const [hw, bateria] = await Promise.all([detectarHardware(), temBateria()]);
  const portatil = bateria === true;
  const apple = hw.aceleracao?.tipo === 'metal';
  const gpuDedicada = ['cuda', 'rocm'].includes(hw.aceleracao?.tipo);
  const nucleos = hw.nucleos || 4;

  let uso;
  let ia;
  if (apple) {
    uso = portatil ? 10 : 15;
    ia = portatil ? 30 : 45;
  } else if (portatil) {
    uso = 18;
    ia = gpuDedicada ? 110 : nucleos >= 8 ? 55 : 40;
  } else {
    uso = 75; // gabinete + monitor
    ia = gpuDedicada ? 300 : nucleos >= 8 ? 170 : 140;
  }
  cache = {
    portatil,
    tipo: apple ? (portatil ? 'MacBook' : 'Mac de mesa') : portatil ? 'notebook' : 'computador de mesa',
    gpuDedicada,
    watts: { uso, ia },
    // Horas de sol pleno: 4,5 h/dia é conservador para o Brasil (Sul no inverno); Nordeste passa de 5,5.
    horasSol: 4.5,
  };
  return cache;
}
