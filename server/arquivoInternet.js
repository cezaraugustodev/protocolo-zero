// Internet Archive (archive.org): busca e download item por item, só com o clique do usuário.
// O acervo inteiro passa de 100 petabytes, por isso não há "baixar tudo".
// Tudo que vem daqui é marcado como NÃO VERIFICADO: qualquer pessoa pode enviar arquivos ao Internet Archive.
import path from 'node:path';
import fsp from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DADOS, baixar } from './util.js';
import * as bib from './biblioteca.js';

const BASE = 'https://archive.org';
const ID_OK = /^[A-Za-z0-9._-]{1,120}$/;
// Só livros/textos e vídeos-aula. Música e entretenimento ficam de fora: não ajudam numa emergência
// e o usuário já pode guardar isso na própria pasta do computador.
const FORMATOS = /\.(pdf|epub|mp4|webm|txt)$/i;
const TIPOS_MIDIA = { textos: 'texts', videos: 'movies' };
const SEM_ENTRETENIMENTO = '-collection:(feature_films OR moviesandfilms OR animationandcartoons OR television OR tvnews OR classic_tv OR silent_films OR film_noir OR sci-fi_horror OR comedy_films OR music_videos OR etree OR audio_music OR gamevideos OR video_game_trailers)';
const LIVRE = '(licenseurl:*creativecommons* OR licenseurl:*publicdomain* OR rights:"domínio público" OR rights:"public domain")';

/** Temas úteis para o Protocolo Zero (contagens em PT com licença livre, nov/2026: de dezenas a milhares por tema). */
export const TEMAS = [
  { id: 'sobrevivencia', en: '"survival manual" OR "survival guide" OR "field manual" OR bushcraft OR "emergency preparedness" OR FEMA', nome: 'Manuais de sobrevivência', icone: 'bussola', q: '(sobrevivência OR "manual de campanha" OR "defesa civil" OR "preparação para emergências")' },
  { id: 'agricultura', en: 'agriculture OR gardening OR "vegetable growing" OR permaculture', nome: 'Agricultura e horta', icone: 'folha', q: '(agricultura OR horta OR hortaliças OR agroecologia OR fruticultura OR plantio)' },
  { id: 'animais', en: 'livestock OR poultry OR beekeeping OR "animal husbandry"', nome: 'Criação de animais', icone: 'folha', q: '(zootecnia OR pecuária OR galinhas OR avicultura OR apicultura OR piscicultura)' },
  { id: 'saude', en: '"first aid" OR "where there is no doctor" OR nursing OR "emergency medicine"', nome: 'Saúde e primeiros socorros', icone: 'cruz', q: '("primeiros socorros" OR enfermagem OR saúde)' },
  { id: 'ervas', en: '"medicinal plants" OR herbal', nome: 'Plantas medicinais', icone: 'folha', q: '("plantas medicinais" OR fitoterapia)' },
  { id: 'eletricidade', en: 'electricity OR electronics OR "electrical wiring"', nome: 'Eletricidade e eletrônica', icone: 'sol', q: '(eletricidade OR eletrônica OR eletrotécnica OR "instalações elétricas")' },
  { id: 'construcao', en: 'carpentry OR masonry OR "building construction" OR woodworking', nome: 'Construção e marcenaria', icone: 'chave', q: '(alvenaria OR marcenaria OR carpintaria OR bioconstrução OR "construção civil")' },
  { id: 'mecanica', en: 'mechanics OR "engine repair" OR "small engines"', nome: 'Mecânica e consertos', icone: 'chave', q: '(mecânica OR motores OR conserto OR manutenção)' },
  { id: 'alimentos', en: 'cooking OR canning OR "food preservation"', nome: 'Culinária e conservação', icone: 'pacote', q: '(culinária OR receitas OR conservas OR "conservação de alimentos")' },
  { id: 'matematica', en: 'mathematics OR algebra OR geometry', nome: 'Matemática', icone: 'livro', q: '(matemática OR álgebra OR geometria)' },
  { id: 'ciencias', en: 'physics OR chemistry OR biology OR botany', nome: 'Física, química e biologia', icone: 'livro', q: '(física OR química OR biologia OR botânica)' },
  { id: 'historia', en: 'history OR geography', nome: 'História e geografia', icone: 'globo', q: '(história OR geografia)' },
  { id: 'literatura', en: 'literature OR novels OR poetry', nome: 'Livros clássicos (domínio público)', icone: 'livro', q: '(literatura OR romance OR contos OR poesia)', soTextos: true },
  { id: 'idiomas', en: 'dictionary OR grammar', nome: 'Dicionários e idiomas', icone: 'livro', q: '(dicionário OR gramática OR "língua portuguesa" OR inglês OR espanhol)' },
];
// Outros idiomas são permitidos: o assistente (IA local) traduz o texto dentro do leitor.
const IDIOMAS = {
  pt: 'language:(por OR portuguese OR Portuguese OR "Português" OR pt OR "pt-BR" OR pt-br)',
  en: 'language:(eng OR english OR English OR en)',
  es: 'language:(spa OR spanish OR Spanish OR "Español" OR es)',
  fr: 'language:(fre OR fra OR french OR French OR fr)',
};

const texto = (v) => (Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v));
const limpar = (html) => texto(html).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

async function pegarJSON(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'ProtocoloZero/1.0 (biblioteca offline)' }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`O Internet Archive respondeu com erro ${r.status}. Tente de novo mais tarde.`);
  return r.json();
}

export function licencaSimples(url) {
  const u = texto(url).toLowerCase();
  if (!u) return { nome: 'Licença não informada', livre: false };
  if (u.includes('publicdomain') || u.includes('/zero/')) return { nome: 'Domínio público', livre: true };
  const m = u.match(/licenses\/([a-z-]+)\//);
  if (m) return { nome: `Creative Commons ${m[1].toUpperCase()}`, livre: true };
  return { nome: 'Outra licença', livre: false };
}

export async function buscar({ q = '', tema = '', tipo = 'textos', idioma = 'pt', livre = true, pagina = 1 }) {
  const termos = String(q).trim().slice(0, 200);
  const t = TEMAS.find((x) => x.id === tema);
  if (!termos && !t) return { total: 0, itens: [] };
  const partes = [`mediatype:${TIPOS_MIDIA[tipo] || 'texts'}`, '-access-restricted-item:true', SEM_ENTRETENIMENTO];
  if (t) {
    // Só no título ou assunto: evita itens que citam a palavra de passagem na descrição.
    const termosTema = idioma === 'pt' ? t.q : `(${t.q.slice(1, -1)} OR ${t.en})`;
    partes.unshift(`(title:${termosTema} OR subject:${termosTema})`);
  }
  if (termos) partes.unshift(`(${termos})`);
  if (IDIOMAS[idioma]) partes.push(IDIOMAS[idioma]);
  if (livre) partes.push(LIVRE);
  const campos = ['identifier', 'title', 'creator', 'year', 'licenseurl', 'downloads', 'item_size', 'description'];
  const url = `${BASE}/advancedsearch.php?q=${encodeURIComponent(partes.join(' AND '))}${campos.map((c) => `&fl[]=${c}`).join('')}&rows=30&page=${Math.max(1, Number(pagina) || 1)}&sort[]=downloads+desc&output=json`;
  const j = await pegarJSON(url);
  return {
    total: j.response?.numFound || 0,
    itens: (j.response?.docs || []).map((d) => ({
      id: d.identifier,
      titulo: limpar(d.title) || d.identifier,
      autor: limpar(d.creator),
      ano: texto(d.year),
      licenca: licencaSimples(d.licenseurl),
      downloads: d.downloads || 0,
      tamanho: d.item_size || 0,
      resumo: limpar(d.description).slice(0, 220),
    })),
  };
}

export async function detalhes(id) {
  if (!ID_OK.test(id)) throw new Error('Identificador inválido');
  const j = await pegarJSON(`${BASE}/metadata/${encodeURIComponent(id)}`);
  const m = j.metadata || {};
  if (!m.identifier) throw new Error('Item não encontrado no Internet Archive.');
  const restrito = String(m['access-restricted-item']) === 'true';
  const arquivos = restrito ? [] : (j.files || [])
    .filter((f) => FORMATOS.test(f.name) && !/(_meta|_files|_djvu)\.|\/history\//i.test(f.name) && !f.private)
    .map((f) => ({ nome: f.name, tamanho: Number(f.size) || 0, formato: f.format || path.extname(f.name).slice(1), tipo: bib.tipoPorNome(f.name) }))
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .slice(0, 300);
  return {
    id, restrito,
    titulo: limpar(m.title) || id,
    autor: limpar(m.creator),
    ano: texto(m.year || m.date),
    idioma: texto(m.language),
    licenca: licencaSimples(m.licenseurl),
    direitos: limpar(m.rights).slice(0, 300),
    resumo: limpar(m.description).slice(0, 1200),
    pagina: `${BASE}/details/${id}`,
    arquivos,
  };
}

/** Baixa um arquivo de um item e registra na Biblioteca como "não verificado". */
export async function baixarArquivo({ id, nome, tarefa, sinal, onProgresso, aoTerminar }) {
  const d = await detalhes(id);
  const f = d.arquivos.find((x) => x.nome === nome);
  if (!f) throw new Error('Este arquivo não está disponível para baixar.');
  const seguro = path.basename(nome).replace(/[^\w.\- ()À-ú]/g, '_').slice(0, 150);
  const pasta = path.join(DADOS, 'internet-archive', id);
  await fsp.mkdir(pasta, { recursive: true });
  const destino = path.join(pasta, seguro);
  const url = `${BASE}/download/${encodeURIComponent(id)}/${nome.split('/').map(encodeURIComponent).join('/')}`;
  if (tarefa) tarefa.mensagem = 'Baixando do Internet Archive…';
  const r = await baixar(url, destino, { sinal, onProgresso });
  const idBib = `ia-${createHash('sha1').update(`${id}/${nome}`).digest('hex').slice(0, 12)}`;
  const tipo = bib.tipoPorNome(seguro);
  const it = await bib.registrar({
    id: idBib,
    tipo: tipo === 'outro' ? 'texto' : tipo,
    titulo: d.arquivos.length > 1 ? `${d.titulo} — ${path.basename(nome, path.extname(nome))}` : d.titulo,
    categoria: 'internet-archive',
    fonte: `Internet Archive${d.autor ? ` — ${d.autor}` : ''} (não verificado)`,
    descricao: d.resumo.slice(0, 300),
    origem: 'internet-archive',
    naoVerificado: true,
    licenca: d.licenca.nome,
    pagina: d.pagina,
    arquivo: path.relative(DADOS, destino).split(path.sep).join('/'),
    tamanho: r.tamanho,
    indexado: false,
  });
  await aoTerminar?.(it);
  return it;
}
