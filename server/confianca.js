// Nível de confiança de cada fonte da Biblioteca. O assistente consulta tudo, mas nesta ordem:
// 1. oficial      — governo e órgãos oficiais (Ministério da Saúde, Anvisa, Fiocruz, Embrapa, OMS, Cruz Vermelha, FEMA…)
// 2. cientifica   — universidades, institutos federais e editoras científicas/técnicas revisadas (UFV, USP, IFRN, Hesperian…)
// 3. comunidade   — não oficiais: Wikipédia, TED, fóruns, coleções da comunidade e arquivos do próprio usuário
// 4. nao-verificada — Internet Archive (qualquer pessoa envia; sem revisão)
// Quando as fontes discordam, vale a de nível mais alto.

export const NIVEIS = ['oficial', 'cientifica', 'comunidade', 'nao-verificada'];
export const ORDEM = Object.fromEntries(NIVEIS.map((n, i) => [n, i]));

export const ROTULO = {
  oficial: 'FONTE OFICIAL',
  cientifica: 'FONTE CIENTÍFICA',
  comunidade: 'FONTE NÃO OFICIAL',
  'nao-verificada': 'FONTE NÃO VERIFICADA — Internet Archive',
};

const OFICIAL = /minist[ée]rio|anvisa|fiocruz|funasa|secretaria (de|da)|defesa civil|embrapa|epamig|cresesb|cepel|ex[ée]rcito|for[çc]as armadas|army publishing|documentos oficiais|fema\b|departamento de agricultura|usda|organiza[çc][ãa]o mundial|\boms\b|ifrc|cruz vermelha|\bcdc\b|governo|dept\. de sa[úu]de|seed-pr|ibge|inpe|corpo de bombeiros|pol[íi]cia (militar|civil|federal|rodovi[áa]ria)|\bsamu\b|sanepar|sabesp|companhia de saneamento/i;
const CIENTIFICA = /universidade|\buf[a-z]{1,4}\b|\busp\b|unifal|unifesp|unicamp|unesp|instituto federal|e-tec|obmep|impa|gref|hesperian|ceatox|editora universit/i;

/** Classifica um item do catálogo ou da Biblioteca. */
export function confiancaDe(it) {
  if (!it) return 'comunidade';
  if (it.naoVerificado || it.origem === 'internet-archive' || String(it.id || '').startsWith('ia-')) return 'nao-verificada';
  if (NIVEIS.includes(it.confianca)) return it.confianca;
  if (it.oficialSaude) return 'oficial';
  const fonte = String(it.fonte || '');
  if (OFICIAL.test(fonte)) return 'oficial';
  if (CIENTIFICA.test(fonte) || /\bIF[A-Z]{2,4}\b/.test(fonte)) return 'cientifica'; // siglas de institutos federais: IFRN, IFMG…
  return 'comunidade';
}
