// Sugere modelo de IA e pacote de conteúdo de acordo com o hardware e o espaço livre.
import { carregarCatalogo, itensDoPacote } from './catalogo.js';
import { escolherModelo } from './inteligencia.js';

export { escolherModelo };

const GB = 1024 ** 3;

export async function tamanhoPacote(id, catalogo) {
  const ids = await itensDoPacote(id);
  const itens = ids.map((x) => catalogo.itens.find((i) => i.id === x)).filter(Boolean);
  return { ids, bytes: itens.reduce((s, i) => s + (i.tamanho || 5e6), 0) };
}

export async function recomendar(hw, catalogo = null) {
  const c = catalogo || (await carregarCatalogo());
  const modelo = await escolherModelo(hw, c.modelos);
  const reservaModelos = modelo.chat.tamanho + modelo.embed.tamanho;
  const livre = hw.disco.livre;
  // Deixa pelo menos 15% do disco livre (mínimo 10 GB) para o sistema continuar saudável.
  const margem = Math.max(10 * GB, hw.disco.total * 0.15);
  const orcamento = Math.max(0, livre - margem - reservaModelos);

  const pacotes = [];
  for (const p of c.pacotes) {
    const t = await tamanhoPacote(p.id, c);
    pacotes.push({ id: p.id, nome: p.nome, descricao: p.descricao, itens: t.ids, bytes: t.bytes, cabe: t.bytes <= orcamento });
  }
  const sugerido = [...pacotes].reverse().find((p) => p.cabe) || pacotes[0];
  return {
    modelo,
    pacotes,
    pacoteSugerido: sugerido.id,
    disco: { livre, margem, orcamento, reservaModelos },
    aviso: !pacotes.some((p) => p.cabe) ? 'Pouco espaço livre: até o pacote Essencial pode não caber. Libere espaço ou use um HD externo.' : null,
  };
}
