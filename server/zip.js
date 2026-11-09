// Leitor mínimo de ZIP (usado para extrair o texto de EPUBs). Suporta "stored" e "deflate".
import fsp from 'node:fs/promises';
import zlib from 'node:zlib';

export async function lerZip(arquivo) {
  const buf = await fsp.readFile(arquivo);
  // Procura o "End of Central Directory" nos últimos 64 KB.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Arquivo ZIP/EPUB inválido');
  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entradas = new Map();
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const metodo = buf.readUInt16LE(p + 10);
    const tamComp = buf.readUInt32LE(p + 20);
    const lenNome = buf.readUInt16LE(p + 28);
    const lenExtra = buf.readUInt16LE(p + 30);
    const lenCom = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nome = buf.toString('utf8', p + 46, p + 46 + lenNome);
    entradas.set(nome, { metodo, tamComp, local });
    p += 46 + lenNome + lenExtra + lenCom;
  }
  return {
    nomes: [...entradas.keys()],
    ler(nome) {
      const e = entradas.get(nome);
      if (!e) return null;
      const inicio = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28);
      const dados = buf.subarray(inicio, inicio + e.tamComp);
      return e.metodo === 0 ? dados : zlib.inflateRawSync(dados);
    },
  };
}
