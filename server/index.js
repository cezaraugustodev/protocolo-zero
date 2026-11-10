// Protocolo Zero — servidor local. Inicie com:  npm start
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { RAIZ, DADOS, PASTAS, PLATAFORMA, garantirPastas, lerJSON, gravarJSON, existe, dentroDe, baixar, progressoDe } from './util.js';
import { detectarHardware, espacoEmDisco } from './hardware.js';
import { carregarCatalogo, catalogoAtualizado, item as itemCatalogo, resolverZim, itensDoPacote } from './catalogo.js';
import { recomendar } from './recomendar.js';
import { criarTarefa, cancelarTarefa, repetirTarefa, listarTarefas, limparConcluidas, aguardarTarefa, haTarefasAtivas } from './tarefas.js';
import { instalarKiwix, instalarVendor, vendorInstalado, instalarOllama, caminhoKiwixServe, caminhoPmtiles, ollamaInstalado, ligarOllama } from './ferramentas.js';
import { statusOllama, ollamaOnline, baixarModelo, removerModelo, conversar, medirVelocidade } from './ollama.js';
import { iniciarKiwix, pararKiwix, kiwixAtivo, livrosKiwix, urlKiwix, buscarNosZims, definirOrigensApp } from './kiwix.js';
import * as bib from './biblioteca.js';
import { confiancaDe, ORDEM as ORDEM_CONFIANCA, ROTULO as ROTULO_CONFIANCA } from './confianca.js';
import * as arquivoInternet from './arquivoInternet.js';
import { indexarDocumento, vetorizarPendentes, pendentesVetorizacao, estatisticasIndice, documentosIndexados, buscar, textoDoDocumento } from './indice.js';
import { estimarMapa, extrairMapa, listarMapas } from './mapas.js';
import { iniciarProtocoloZero, relatorioAtual, cancelarInicio, iniciando, contextoDiagnostico, explicarSemIA, atualizarPassoBusca, AVISO_ANTIVIRUS_INICIALIZACAO } from './iniciar.js';
import { avaliarIA, registrarVelocidade, parametrosB, PARAMS_CONFIAVEL, perfisIA, suportaRaciocinio, semTag } from './inteligencia.js';
import { errosRecentes, registrarErro } from './util.js';
import * as pacotes from './pacotes.js';
import * as traducao from './traducao.js';
import * as leitura from './leitura.js';
import { obterTile, estimarArea, baixarArea, validarArea, usoSatelite, SATELITE } from './satelite.js';
import { PORTA_KIWIX } from './kiwix.js';
import { perfilEnergia } from './energia.js';
import { verificarAtualizacoes, resumoAtualizacoes, atualizarProtocoloZero, relatorioAtualizacao, cancelarAtualizacao, atualizando, temInternet, precisaReiniciar } from './atualizar.js';
import * as auto from './autoatualizar.js';
import { atualizarCatalogo, escolherNovos, idsNovidades, fonteCatalogo } from './novidades.js';
import { emergenciaPorId } from '../public/js/emergencias-dados.js';
import { destinos as destinosCopia, tamanhos as tamanhosCopia, copiar as copiarPZ, abrirPasta, criarAtalho } from './copiar.js';

const PORTA_PADRAO = Number(process.env.PROTOCOLO_ZERO_PORTA || 4321);
const PUBLICO = path.join(RAIZ, 'public');
const ARQ_CONFIG = path.join(DADOS, 'config.json');
const ARQ_ESTOQUE = path.join(DADOS, 'estoque.json');
const CABECALHO_SEGURANCA = 'x-protocolo-zero';

let porta = PORTA_PADRAO;
let config = { configurado: false, modeloChat: null, modeloEmbed: null, pacote: null };

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.pdf': 'application/pdf', '.epub': 'application/epub+zip', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.csv': 'text/plain; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg', '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.wav': 'audio/wav',
  '.m4a': 'audio/mp4', '.flac': 'audio/flac', '.pbf': 'application/x-protobuf', '.pmtiles': 'application/octet-stream',
  '.woff2': 'font/woff2',
};

// ---------------- utilidades HTTP ----------------
function json(res, status, dados) {
  const corpo = JSON.stringify(dados);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(corpo);
}
const erro = (res, status, mensagem) => json(res, status, { erro: mensagem });

async function lerCorpo(req, limite = 150 * 1024 * 1024) {
  const pedacos = [];
  let total = 0;
  for await (const p of req) {
    total += p.length;
    if (total > limite) throw Object.assign(new Error('Requisição grande demais'), { status: 413 });
    pedacos.push(p);
  }
  const txt = Buffer.concat(pedacos).toString('utf8');
  return txt ? JSON.parse(txt) : {};
}

async function servirArquivo(req, res, abs, { cache = false } = {}) {
  let st;
  try {
    st = await fsp.stat(abs);
    if (!st.isFile()) throw new Error();
  } catch {
    return erro(res, 404, 'Arquivo não encontrado');
  }
  const tipo = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream';
  const base = {
    'Content-Type': tipo,
    'Accept-Ranges': 'bytes',
    'Cache-Control': cache ? 'public, max-age=86400' : 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  };
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let inicio = m && m[1] ? Number(m[1]) : 0;
    let fim = m && m[2] ? Number(m[2]) : st.size - 1;
    if (m && !m[1] && m[2]) {
      inicio = Math.max(0, st.size - Number(m[2]));
      fim = st.size - 1;
    }
    if (inicio >= st.size || fim >= st.size || inicio > fim) {
      res.writeHead(416, { 'Content-Range': `bytes */${st.size}` });
      return res.end();
    }
    res.writeHead(206, { ...base, 'Content-Range': `bytes ${inicio}-${fim}/${st.size}`, 'Content-Length': fim - inicio + 1 });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(abs, { start: inicio, end: fim }).pipe(res);
  }
  res.writeHead(200, { ...base, 'Content-Length': st.size });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(abs).pipe(res);
}

// Bloqueia sites externos de usarem o servidor local (DNS rebinding e CSRF).
function requisicaoConfiavel(req) {
  const host = (req.headers.host || '').toLowerCase();
  const hostsOk = [`localhost:${porta}`, `127.0.0.1:${porta}`, `[::1]:${porta}`];
  if (!hostsOk.includes(host)) return false;
  const origem = req.headers.origin;
  if (origem && !hostsOk.some((h) => origem === `http://${h}`)) return false;
  if (!['GET', 'HEAD'].includes(req.method) && req.headers[CABECALHO_SEGURANCA] !== '1') return false;
  return true;
}

// ---------------- configuração ----------------
async function carregarConfig() {
  config = { ...config, ...(await lerJSON(ARQ_CONFIG, {})) };
}
async function salvarConfig(campos) {
  Object.assign(config, campos);
  await gravarJSON(ARQ_CONFIG, config);
}

// ---------------- instalação de itens ----------------
let reinicioKiwix = null;
function agendarReinicioKiwix() {
  clearTimeout(reinicioKiwix);
  reinicioKiwix = setTimeout(() => iniciarKiwix().catch((e) => console.error('[kiwix]', e.message)), 2000);
}

const progresso = progressoDe;

async function garantirKiwix() {
  if (await existe(caminhoKiwixServe())) return;
  criarTarefa({ tipo: 'ferramenta', titulo: 'Leitor Kiwix (Wikipédia offline)', chave: 'ferramenta:kiwix', fn: async (t, s) => {
    await instalarKiwix(t, s);
    agendarReinicioKiwix();
  } });
}

async function garantirVendor() {
  if (await vendorInstalado()) return;
  criarTarefa({ tipo: 'ferramenta', titulo: 'Componentes de leitura de PDF e mapas', chave: 'ferramenta:vendor', fn: instalarVendor });
}

function agendarVetorizacao() {
  const modelo = config.modeloEmbed;
  if (!modelo) return;
  criarTarefa({
    tipo: 'indice',
    titulo: 'Preparando a busca inteligente do assistente',
    chave: 'vetorizar',
    fn: async (t, s) => {
      const st = await statusOllama();
      if (!st.online) throw new Error('Ollama não está rodando');
      if (!st.modelos.some((m) => m.nome.split(':')[0] === modelo.split(':')[0])) throw new Error(`Modelo ${modelo} ainda não foi baixado`);
      if (!(await pendentesVetorizacao(modelo))) {
        t.mensagemFinal = 'Nada novo para preparar';
        return;
      }
      await vetorizarPendentes(modelo, t, s);
    },
  });
}

async function indexarNoServidor(id) {
  const it = await bib.obter(id);
  if (!it || !['texto', 'epub'].includes(it.tipo)) return;
  criarTarefa({
    tipo: 'indice', titulo: `Lendo “${it.titulo}”`, chave: `indexar:${id}`, itemId: id,
    fn: async (t) => {
      const partes = await bib.extrairTexto(it);
      const r = await indexarDocumento({ docId: id, titulo: it.titulo, partes });
      await bib.atualizar(id, { indexado: true, trechos: r.trechos });
      t.mensagemFinal = `${r.trechos} trechos indexados`;
      agendarVetorizacao();
    },
  });
}

// Tudo que vem da internet vai primeiro para o armazém de pacotes (compactado).
// O "Iniciar Protocolo Zero" descompacta e instala, sem internet.
const MSG_INICIAR = 'clique em "Iniciar Protocolo Zero" para instalar';
async function instalarItem(id, { novaVersao = false } = {}) {
  const it = await itemCatalogo(id);
  if (!it) throw new Error(`Item desconhecido: ${id}`);
  if (it.descontinuado) throw new Error(`"${it.titulo}" saiu do catálogo (a fonte ou o link deixou de funcionar). Quem já tem continua com ele.`);
  if (!novaVersao) {
    const ja = await bib.obter(id);
    if (ja && (await existe(bib.caminhoAbsoluto(ja)))) return null;
    if (await pacotes.aguardandoInstalacao(id)) return null;
  }
  const guardar = (t, s, origem, destino, extra = {}) =>
    pacotes.guardar({ origem, destino, registro: { ...publico(it), origem: 'catalogo', ...extra }, sinal: s, tarefa: t });

  if (it.tipo === 'pdf') {
    return criarTarefa({
      tipo: 'download', titulo: it.titulo, chave: `item:${id}`, itemId: id,
      fn: async (t, s) => {
        const temp = path.join(PASTAS.tmp, `${id}.pdf`);
        await baixar(it.url, temp, { sinal: s, onProgresso: progresso(t) });
        const pk = await guardar(t, s, temp, `pdf/${it.categoria}/${id}.pdf`);
        t.mensagemFinal = `Baixado e compactado (${Math.round((pk.tamanhoPacote / pk.tamanho) * 100)}% do tamanho) — ${MSG_INICIAR}`;
      },
    });
  }
  if (it.tipo === 'zim') {
    await garantirKiwix();
    return criarTarefa({
      tipo: 'download', titulo: novaVersao ? `${it.titulo} (versão nova)` : it.titulo, chave: `item:${id}`, itemId: id,
      fn: async (t, s) => {
        t.mensagem = 'Consultando o catálogo do Kiwix…';
        const z = await resolverZim(it, { forcar: novaVersao });
        const destino = `zim/${path.basename(new URL(z.url).pathname)}`;
        // ZIM já é um formato compactado: baixa direto no armazém, sem cópia extra.
        const caminho = pacotes.caminhoNoArmazem(destino);
        await fsp.mkdir(path.dirname(caminho), { recursive: true });
        await baixar(z.url, caminho, { sinal: s, onProgresso: progresso(t) });
        await guardar(t, s, caminho, destino, { versao: z.data });
        t.mensagemFinal = `Baixado (ZIM já é compactado) — ${MSG_INICIAR}`;
      },
    });
  }
  if (it.tipo === 'mapa') {
    return criarTarefa({
      tipo: 'mapa', titulo: it.titulo, chave: `item:${id}`, itemId: id,
      fn: async (t, s) => {
        const destino = `mapas/${id}.pmtiles`;
        const caminho = pacotes.caminhoNoArmazem(destino);
        await fsp.mkdir(path.dirname(caminho), { recursive: true });
        await extrairMapa({ bbox: it.bbox, maxzoom: it.maxzoom, destino: caminho, tarefa: t, sinal: s });
        await guardar(t, s, caminho, destino);
        t.mensagemFinal = `Baixado (PMTiles já é compactado) — ${MSG_INICIAR}`;
      },
    });
  }
  throw new Error(`Tipo não suportado: ${it.tipo}`);
}

const publico = (it) => ({ id: it.id, tipo: it.tipo, titulo: it.titulo, categoria: it.categoria, fonte: it.fonte, descricao: it.descricao });

function baixarModeloTarefa(nome) {
  return criarTarefa({
    tipo: 'modelo', titulo: `Modelo de IA ${nome}`, chave: `modelo:${nome}`,
    fn: async (t, s) => {
      if (!(await ollamaOnline())) throw new Error('O Ollama não está rodando. Instale ou abra o Ollama primeiro.');
      await baixarModelo(nome, t, s);
      if (nome === config.modeloEmbed) agendarVetorizacao();
      // Mede a velocidade real no computador (usada para recomendar o melhor modelo).
      if (!/embed/i.test(nome)) {
        t.mensagem = 'Medindo a velocidade neste computador…';
        const stats = await medirVelocidade(nome, s).catch(() => null);
        await registrarVelocidade(nome, stats);
        if (stats?.tps) t.mensagemFinal = `Modelo ${nome} pronto · ${stats.tps.toFixed(1)} palavras/s neste PC`;
      }
    },
  });
}

// ---------------- assistente ----------------
// Emergência marcada pelo usuário: a IA prioriza segurança imediata, mas responde sobre qualquer assunto.
async function textoEmergencia() {
  const { ativas = [] } = await lerJSON(path.join(DADOS, 'emergencia.json'), { ativas: [] });
  const nomes = ativas.map((id) => emergenciaPorId(id)?.nome).filter(Boolean);
  if (!nomes.length) return '';
  return `

SITUAÇÃO ATUAL DO USUÁRIO: ele marcou que está em emergência: ${nomes.join(', ')}.
Quando a pergunta tiver relação com isso, comece pelo que fazer AGORA para ficar seguro, em passos curtos, e lembre dos números (SAMU 192, Bombeiros 193, Defesa Civil 199) quando couber.
Siga as orientações oficiais (Defesa Civil, Ministério da Saúde) das FONTES. Se a pergunta for sobre outro assunto, responda normalmente.`;
}
const SISTEMA = `Você é o assistente do Protocolo Zero, uma biblioteca offline de sobrevivência, saúde e autossuficiência.
Responda SEMPRE em português do Brasil, de forma clara, prática e em passos quando fizer sentido.
Use as FONTES fornecidas como base principal. Cite-as no texto com [1], [2] etc. conforme a numeração.
Cada fonte vem marcada com o nível de confiança. A ordem de prioridade é SEMPRE:
1) [FONTE OFICIAL] (governo e órgãos oficiais: Ministério da Saúde, Anvisa, Fiocruz, Funasa, Embrapa, Defesa Civil do país, dos estados e das cidades, OMS, Cruz Vermelha…);
2) [FONTE CIENTÍFICA] (universidades, institutos federais, editoras científicas);
3) [FONTE NÃO OFICIAL] (Wikipédia, TED, fóruns, coleções da comunidade, arquivos do usuário);
4) [FONTE NÃO VERIFICADA — Internet Archive] (enviada por qualquer pessoa, sem revisão).
Use todas como apoio, mas as oficiais e científicas prevalecem: se uma fonte de nível mais baixo disser algo diferente, siga a de nível mais alto e avise da diferença.
Em saúde, doses, água, alimentos e intoxicações, siga a fonte oficial (ou, na falta dela, a científica).
Fontes não oficiais servem de complemento; diga quando a informação veio só delas. Fontes não verificadas: avise para ter cautela e nunca as use para doses, remédios ou emergências.
Algumas fontes podem estar em inglês, espanhol ou outro idioma: use-as normalmente, mas responda sempre em português do Brasil, traduzindo com fidelidade. Medidas que não se usam no Brasil (oz, lb, °F, galão, polegada, pé, milha…): escreva o valor original exatamente como na fonte e ensine a converter para o sistema métrico, mostrando a conta (ex.: 8 oz × 28,35 = 227 g).
Se as fontes não cobrirem a pergunta, diga isso claramente e responda com conhecimento geral, avisando que não veio da biblioteca.
Nunca invente doses de medicamentos, plantas ou produtos químicos: só informe doses que estejam nas fontes.
Antes de usar uma dose, confira PARA QUE ela serve na fonte: dose para limpar chão, casa, lama ou caixa d'água NÃO serve para água de beber, alimentos ou pessoas.
Se nenhuma fonte trouxer a dose para o uso exato perguntado, diga isso e não adapte doses de outro uso.
Nunca afirme que uma planta, fruto, cogumelo ou semente silvestre é comestível sem fonte que a identifique; avise sobre espécies tóxicas parecidas e, na dúvida, diga para não comer.
Em emergências médicas, oriente os primeiros socorros e lembre de buscar atendimento (SAMU 192, Bombeiros 193) assim que possível.
Formate com Markdown: títulos curtos, listas, **negrito**, tabelas quando comparar coisas e blocos de código com a linguagem (\`\`\`bash) para comandos ou código.`;

const SISTEMA_LIVRE = `Você é o assistente do Protocolo Zero, rodando 100% offline no computador do usuário.
Responda SEMPRE em português do Brasil, de forma clara e prática.
Neste modo você NÃO está consultando a biblioteca: responda com seu conhecimento geral e, em temas de saúde, deixe claro que convém confirmar em uma fonte confiável.
Nunca invente doses de medicamentos, plantas ou produtos químicos. Em emergências, lembre do SAMU 192 e Bombeiros 193.
Formate com Markdown: títulos curtos, listas, **negrito**, tabelas quando comparar coisas e blocos de código com a linguagem (\`\`\`bash) para comandos ou código.`;

const SISTEMA_PENSAR = `

MODO PENSAMENTO PROFUNDO: antes da resposta final, escreva uma seção "#### Raciocínio" analisando o problema passo a passo
(o que se sabe, o que falta, alternativas, riscos). Depois escreva "#### Resposta" com a conclusão clara e prática.`;

const LIMITE_PENSAR_MS = 4 * 60 * 1000;
const LIMITE_PENSAR_CHARS = 9000; // ~2.500 tokens de raciocínio
const RESPONDER_DIRETO = `Responda agora, direto, em português do Brasil, usando as FONTES acima (oficiais e científicas prevalecem sobre as não oficiais).
Se for dose, copie a dose da fonte oficial para o uso exato perguntado e mostre a conta passo a passo.`;

// Tudo que está na Biblioteca é consultado. Entre os 12 trechos mais relevantes, a ordem segue o nível de
// confiança (server/confianca.js): oficial > científica > não oficial > não verificada (Internet Archive).
// Dentro de cada nível, mantém a ordem de relevância. Oficiais: até 4; total: até 6.
const porConfianca = (lista) => lista.map((f, i) => ({ f, i }))
  .sort((a, b) => ORDEM_CONFIANCA[a.f.confianca] - ORDEM_CONFIANCA[b.f.confianca] || a.i - b.i)
  .map(({ f }) => f);

async function buscarPorConfianca(pergunta) {
  const [achados, cat] = await Promise.all([
    buscar(pergunta, { modeloEmbed: config.modeloEmbed, limite: 12 }),
    carregarCatalogo(),
  ]);
  const porId = new Map(cat.itens.map((i) => [i.id, i]));
  for (const t of achados) {
    const it = porId.get(t.docId) || (await bib.obter(t.docId));
    t.confianca = confiancaDe(it || { id: t.docId });
    t.orgao = it?.fonte;
  }
  const ordenados = porConfianca(achados);
  const oficiais = ordenados.filter((t) => t.confianca === 'oficial').slice(0, 4);
  return [...oficiais, ...ordenados.filter((t) => t.confianca !== 'oficial')].slice(0, 6);
}

// Artigos das enciclopédias (Kiwix): confiança pelo item do catálogo (ex.: Wikipédia = não oficial, CDC = oficial).
async function confiancaDoZim(livroNome) {
  const cat = await carregarCatalogo();
  const it = cat.itens.find((i) => i.kiwix && (livroNome === i.kiwix || String(livroNome || '').startsWith(`${i.kiwix}_`)));
  return { confianca: confiancaDe(it || { fonte: 'Kiwix' }), orgao: it?.fonte };
}

// Escolhe um modelo instalado que não seja "só raciocínio" para escrever a resposta final.
async function modeloRedator(atual) {
  const cat = await carregarCatalogo();
  const soPensa = new Set((cat.modelos?.chat || []).filter((m) => m.soRaciocinio).map((m) => semTag(m.tag)));
  if (!soPensa.has(semTag(atual))) return atual;
  const st = await statusOllama().catch(() => null);
  const chats = (st?.modelos || []).map((m) => m.nome).filter((n) => !/embed/i.test(n) && !soPensa.has(semTag(n)));
  const preferido = chats.find((n) => semTag(n) === semTag(config.modeloChat || ''));
  return preferido || chats[0] || null;
}

// Remove raciocínio que vaza no texto ("...</think>"): segura o texto até saber se há </think>.
function filtroPensamento(saida) {
  let buffer = '';
  let liberado = false;
  return {
    texto(t) {
      if (liberado) return saida(t);
      buffer += t;
      const i = buffer.indexOf('</think>');
      if (i >= 0) {
        liberado = true;
        const resto = buffer.slice(i + 8).replace(/^\s+/, '');
        if (resto) saida(resto);
      } else if (!/^\s*(<think>|okay|ok,|let me|alright|first,|hmm)/i.test(buffer.slice(0, 40)) && buffer.length > 40) {
        liberado = true; // começou direto na resposta
        saida(buffer);
      }
    },
    fim() {
      if (!liberado && buffer) saida(buffer.replace(/^[\s\S]*<\/think>/, '').trim());
    },
  };
}

async function rotaChat(req, res) {
  const { pergunta, historico = [], usarBiblioteca = true, usarWikipedia = true, modelo, anexo, pensar = false } = await lerCorpo(req, 4e6);
  if (!pergunta?.trim()) return erro(res, 400, 'Pergunta vazia');
  // Funciona mesmo sem configuração: usa o modelo pedido, o configurado ou o primeiro instalado.
  let modeloChat = modelo || config.modeloChat;
  if (!modeloChat) {
    const st = await statusOllama();
    if (!st.online) return erro(res, 503, 'O Ollama não está rodando');
    modeloChat = st.modelos.find((m) => !/embed/i.test(m.nome))?.nome;
  }
  if (!modeloChat) return erro(res, 400, 'Nenhum modelo de IA instalado');

  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' });
  const enviar = (o) => res.write(JSON.stringify(o) + '\n');
  const ctrl = new AbortController();
  res.on('close', () => !res.writableFinished && ctrl.abort());

  try {
    enviar({ tipo: 'modelo', modelo: modeloChat });
    // A consulta só acontece com o que já está pronto (índice e Kiwix ativos); o resto é ignorado sem erro.
    const st = await estatisticasIndice().catch(() => ({ trechos: 0 }));
    const consultarBib = usarBiblioteca && st.trechos > 0;
    const consultarWiki = usarWikipedia && kiwixAtivo() && livrosKiwix().length > 0;
    let trechos = [];
    let artigos = [];
    if (consultarBib || consultarWiki) {
      enviar({ tipo: 'status', texto: 'Consultando os arquivos do Protocolo Zero…' });
      [trechos, artigos] = await Promise.all([
        consultarBib ? buscarPorConfianca(pergunta).catch(() => []) : [],
        consultarWiki ? buscarNosZims(pergunta, { limite: 3 }).catch(() => []) : [],
      ]);
    }
    const livre = !consultarBib && !consultarWiki;
    if (livre && (usarBiblioteca || usarWikipedia)) {
      enviar({ tipo: 'aviso', texto: 'Os dados ainda não estão prontos (use "Iniciar Protocolo Zero"). Respondendo só com o conhecimento do modelo.' });
    }
    for (const a of artigos) Object.assign(a, await confiancaDoZim(a.livroNome));
    // Documentos e artigos juntos, ordenados pelo nível de confiança (oficial primeiro).
    const fontes = porConfianca([
      ...trechos.map((t) => ({ tipo: 'doc', docId: t.docId, titulo: t.titulo, pagina: t.pagina, texto: t.texto, confianca: t.confianca, orgao: t.orgao })),
      ...artigos.map((a) => ({ tipo: 'zim', titulo: `${a.titulo} — ${a.livro}`, link: a.link, texto: a.texto, confianca: a.confianca, orgao: a.orgao })),
    ]).map((f) => ({ ...f, oficial: f.confianca === 'oficial' || undefined, naoVerificado: f.confianca === 'nao-verificada' || undefined }));
    const itens = await bib.listar();
    for (const f of fontes) {
      if (f.tipo === 'doc') f.arquivo = itens.find((i) => i.id === f.docId)?.arquivo;
    }
    enviar({ tipo: 'fontes', fontes: fontes.map(({ texto, ...f }, i) => ({ n: i + 1, ...f, trecho: texto.slice(0, 280) })) });

    const contexto = fontes.length
      ? fontes.map((f, i) => `[${i + 1}] [${ROTULO_CONFIANCA[f.confianca] || ROTULO_CONFIANCA.comunidade}${f.orgao && !f.naoVerificado ? ` — ${f.orgao}` : ''}] ${f.titulo}${f.pagina ? ` (p. ${f.pagina})` : ''}\n${f.texto}`).join('\n\n')
      : '(nenhuma fonte encontrada na biblioteca para esta pergunta)';
    const textoAnexo = anexo?.texto
      ? `ARQUIVO ANEXADO PELO USUÁRIO ("${String(anexo.nome || 'arquivo').slice(0, 120)}"):\n${String(anexo.texto).slice(0, 12000)}\n\n`
      : '';
    // Pensamento profundo: nativo nos modelos que raciocinam (qwen3…); nos outros, pedimos a análise
    // passo a passo no próprio texto (funciona, mas com menos qualidade).
    const nativo = suportaRaciocinio(modeloChat);
    const sistema = (livre ? SISTEMA_LIVRE : SISTEMA) + (pensar && !nativo ? SISTEMA_PENSAR : '') + (await textoEmergencia());
    const mensagens = [
      { role: 'system', content: sistema },
      ...historico.slice(-6).map((m) => ({ role: m.papel === 'usuario' ? 'user' : 'assistant', content: String(m.texto).slice(0, 4000) })),
      { role: 'user', content: livre ? `${textoAnexo}${pergunta}` : `FONTES:\n${contexto}\n\n${textoAnexo}PERGUNTA: ${pergunta}` },
    ];
    enviar({ tipo: 'status', texto: pensar ? 'Pensando com calma…' : 'Pensando…' });
    const t0 = Date.now();
    let pensou = 0;
    let raciocinio = '';
    let cortado = false;
    let redatorUsado = null;
    // Limite do raciocínio: modelos como o Qwen 3 às vezes "pensam" por muitos minutos (ou em círculos).
    // Passou do limite, o raciocínio é interrompido e a IA responde com base no que já pensou.
    const limite = new AbortController();
    const prazo = setTimeout(() => limite.abort(), LIMITE_PENSAR_MS);
    let stats;
    try {
      stats = await conversar({
        modelo: modeloChat, mensagens, sinal: AbortSignal.any([ctrl.signal, limite.signal]), pensar: pensar && nativo,
        opcoes: pensar ? { num_ctx: 12288 } : {},
        onPensamento: (t) => {
          pensou = Date.now() - t0;
          raciocinio += t;
          enviar({ tipo: 'pensamento', texto: t });
          if (raciocinio.length > LIMITE_PENSAR_CHARS) limite.abort();
        },
        onTexto: (t) => {
          clearTimeout(prazo); // começou a responder: não corta mais
          enviar({ tipo: 'texto', texto: t });
        },
      });
    } catch (e) {
      if (ctrl.signal.aborted || !limite.signal.aborted) throw e;
      cortado = true;
    } finally {
      clearTimeout(prazo);
    }
    if (cortado) {
      // Modelos "só raciocínio" (ex.: qwen3:4b) ignoram think:false e voltam a pensar dentro do texto.
      // Por isso a resposta final é escrita por um modelo comum instalado, se houver, direto das
      // FONTES (oficiais primeiro). O raciocínio bruto não é reaproveitado: em modelos pequenos ele
      // costuma ter contas erradas e vem em inglês.
      const redator = (await modeloRedator(modeloChat)) || modeloChat;
      redatorUsado = redator !== modeloChat ? redator : null;
      enviar({ tipo: 'status', texto: `Raciocínio longo demais — escrevendo a resposta direto das fontes…` });
      const filtro = filtroPensamento((t) => enviar({ tipo: 'texto', texto: t }));
      stats = await conversar({
        modelo: redator, sinal: ctrl.signal, pensar: false, opcoes: { num_ctx: 12288 },
        mensagens: [...mensagens.slice(0, -1), { ...mensagens.at(-1), content: `${mensagens.at(-1).content}\n\n${RESPONDER_DIRETO}` }],
        onTexto: filtro.texto,
      });
      filtro.fim();
    }
    await registrarVelocidade(modeloChat, stats);
    enviar({ tipo: 'fim', velocidade: stats?.tps || null, pensouSeg: pensou ? Math.round(pensou / 1000) : null, pensamento: pensar ? (nativo ? 'nativo' : 'simulado') : null, raciocinioCortado: cortado, redator: redatorUsado });
  } catch (e) {
    if (!ctrl.signal.aborted) enviar({ tipo: 'erro', texto: e.message });
  }
  res.end();
}

// ---------------- rotas ----------------
const rotas = [];
const rota = (metodo, padrao, fn) => rotas.push({ metodo, padrao, fn });

let cachePacotes = { quando: 0, valor: null };
async function resumoPacotesCache() {
  if (Date.now() - cachePacotes.quando > 10000) cachePacotes = { quando: Date.now(), valor: await pacotes.resumoPacotes().catch(() => null) };
  return cachePacotes.valor;
}

rota('GET', /^\/api\/energia$/, async (req, res) => json(res, 200, await perfilEnergia()));
// Internet Archive: busca e download item por item (usa internet, só com o clique do usuário).
rota('GET', /^\/api\/arquivo-internet\/buscar$/, async (req, res, url) => {
  const p = url.searchParams;
  json(res, 200, await arquivoInternet.buscar({ q: p.get('q') || '', tema: p.get('tema') || '', tipo: p.get('tipo') || 'textos', idioma: p.get('idioma') || 'pt', livre: p.get('livre') !== '0', pagina: p.get('pagina') }));
});
rota('GET', /^\/api\/arquivo-internet\/temas$/, async (req, res) => json(res, 200, arquivoInternet.TEMAS.map(({ id, nome, icone, soTextos }) => ({ id, nome, icone, soTextos: !!soTextos }))));
rota('GET', /^\/api\/arquivo-internet\/item\/([A-Za-z0-9._-]+)$/, async (req, res, url, m) => json(res, 200, await arquivoInternet.detalhes(m[1])));
rota('POST', /^\/api\/arquivo-internet\/baixar$/, async (req, res) => {
  const { id, nome, titulo } = await lerCorpo(req, 1e4);
  if (!id || !nome) return erro(res, 400, 'Escolha um arquivo');
  const t = criarTarefa({
    tipo: 'download', titulo: `Internet Archive: ${String(titulo || nome).slice(0, 80)}`, chave: `ia:${id}/${nome}`,
    fn: async (tarefa, sinal) => {
      const it = await arquivoInternet.baixarArquivo({
        id, nome, tarefa, sinal, onProgresso: progresso(tarefa),
        aoTerminar: async (item) => { if (['texto', 'epub'].includes(item.tipo)) await indexarNoServidor(item.id).catch(() => {}); },
      });
      tarefa.mensagemFinal = `Na Biblioteca, em "Internet Archive (não verificado)": ${it.titulo}`;
    },
  });
  json(res, 200, { tarefa: t.id });
});

// Guarda a versão anterior (no máximo uma cópia por hora) para o usuário poder recuperar algo apagado sem querer.
const ultimaCopia = new Map();
async function guardarAnterior(arquivo) {
  if (Date.now() - (ultimaCopia.get(arquivo) || 0) < 3600e3) return;
  ultimaCopia.set(arquivo, Date.now());
  await fsp.copyFile(arquivo, arquivo.replace(/\.json$/, '.anterior.json')).catch(() => {});
}

// Estoque de emergência (fica só neste computador, em dados/estoque.json)
rota('GET', /^\/api\/estoque$/, async (req, res) => json(res, 200, await lerJSON(ARQ_ESTOQUE, null)));
rota('PUT', /^\/api\/estoque$/, async (req, res) => {
  const e = await lerCorpo(req, 2e6);
  if (!e || typeof e !== 'object' || !Array.isArray(e.itens)) return erro(res, 400, 'Estoque inválido');
  await guardarAnterior(ARQ_ESTOQUE);
  await gravarJSON(ARQ_ESTOQUE, { ...e, salvo: Date.now() });
  json(res, 200, { ok: true });
});
// Saúde e nutrição: pessoas da família, medidas e histórico de peso (só neste computador, dados/nutricao.json)
const ARQ_NUTRICAO = path.join(DADOS, 'nutricao.json');
rota('GET', /^\/api\/nutricao$/, async (req, res) => json(res, 200, await lerJSON(ARQ_NUTRICAO, { pessoas: [] })));
rota('PUT', /^\/api\/nutricao$/, async (req, res) => {
  const d = await lerCorpo(req, 1e6);
  if (!d || typeof d !== 'object' || !Array.isArray(d.pessoas)) return erro(res, 400, 'Dados inválidos');
  await guardarAnterior(ARQ_NUTRICAO);
  await gravarJSON(ARQ_NUTRICAO, { pessoas: d.pessoas.slice(0, 50), salvo: Date.now() });
  json(res, 200, { ok: true });
});
// Emergência atual (escolhida ao clicar em "Iniciar" ou na tela "Emergência agora"). O assistente usa isso
// para priorizar segurança imediata. Fica só neste computador (dados/emergencia.json).
const ARQ_EMERGENCIA = path.join(DADOS, 'emergencia.json');
const emergenciaAtual = () => lerJSON(ARQ_EMERGENCIA, { ativas: [] });
rota('GET', /^\/api\/emergencia$/, async (req, res) => json(res, 200, await emergenciaAtual()));
rota('PUT', /^\/api\/emergencia$/, async (req, res) => {
  const d = await lerCorpo(req, 1e4);
  const ativas = [...new Set((Array.isArray(d?.ativas) ? d.ativas : []).filter((id) => emergenciaPorId(id)))];
  const antes = await emergenciaAtual();
  const desde = ativas.length ? (antes.ativas?.length ? antes.desde : Date.now()) : null;
  await gravarJSON(ARQ_EMERGENCIA, { ativas, desde });
  json(res, 200, { ativas, desde });
});

rota('GET', /^\/api\/ping$/, async (req, res) => json(res, 200, { app: 'protocolo-zero', pid: process.pid, dados: DADOS }));

rota('GET', /^\/api\/estado$/, async (req, res) => {
  const [ollama, disco, indice, mapas, vendor, kiwixBin, pmtilesBin] = await Promise.all([
    statusOllama(), espacoEmDisco(), estatisticasIndice(), listarMapas(), vendorInstalado(), existe(caminhoKiwixServe()), existe(caminhoPmtiles()),
  ]);
  json(res, 200, {
    config, ollama, disco, indice, mapas, plataforma: PLATAFORMA, pastaDados: DADOS,
    kiwix: { instalado: kiwixBin, ativo: kiwixAtivo(), url: urlKiwix(), livros: livrosKiwix() },
    atualizacoes: resumoAtualizacoes(),
    reiniciar: precisaReiniciar(),
    pacotes: await resumoPacotesCache(),
    ferramentas: { vendor, kiwix: kiwixBin, pmtiles: pmtilesBin },
  });
});

rota('GET', /^\/api\/hardware$/, async (req, res, url) => {
  const hw = await detectarHardware({ forcar: url.searchParams.has('forcar') });
  const c = await catalogoAtualizado();
  json(res, 200, { hardware: hw, recomendacao: await recomendar(hw, c) });
});

rota('GET', /^\/api\/catalogo$/, async (req, res) => {
  const c = await catalogoAtualizado();
  const instalados = new Map((await bib.listar()).map((i) => [i.id, i]));
  const compactados = new Set((await pacotes.pendentes()).map((p) => p.id));
  const novidades = await idsNovidades();
  json(res, 200, {
    ...c,
    itens: c.itens
      .map((i) => ({ ...i, url: undefined, instalado: instalados.has(i.id) || compactados.has(i.id), compactado: compactados.has(i.id), novo: novidades.has(i.id) || undefined }))
      // Saiu do catálogo (link ou fonte acabou): continua aparecendo só para quem já tem.
      .filter((i) => !i.descontinuado || i.instalado),
  });
});

rota('POST', /^\/api\/config$/, async (req, res) => {
  const corpo = await lerCorpo(req, 1e5);
  const permitido = ['modeloChat', 'modeloEmbed', 'pacote', 'configurado', 'tema'];
  const campos = Object.fromEntries(Object.entries(corpo).filter(([k]) => permitido.includes(k)));
  const mudouEmbed = campos.modeloEmbed && campos.modeloEmbed !== config.modeloEmbed;
  await salvarConfig(campos);
  if (mudouEmbed) agendarVetorizacao();
  json(res, 200, config);
});

rota('POST', /^\/api\/instalar$/, async (req, res) => {
  const { itens = [], modeloChat, modelosChat = [], modeloEmbed, instalarOllama: querOllama } = await lerCorpo(req, 1e5);
  const criadas = [];
  const falhas = [];
  await garantirVendor();
  if (querOllama && !(await ollamaOnline())) {
    criadas.push(criarTarefa({ tipo: 'ferramenta', titulo: 'Ollama (motor de IA)', chave: 'ferramenta:ollama', fn: (t, s) => instalarOllama(t, s, ollamaOnline) }));
  }
  for (const id of itens) {
    try {
      const t = await instalarItem(id);
      if (t) criadas.push(t);
    } catch (e) {
      falhas.push({ id, erro: e.message });
    }
  }
  const st = await statusOllama();
  const tem = (n) => st.modelos.some((m) => m.nome === n || m.nome === `${n}:latest`);
  // Pode baixar várias IAs (ex.: uma rápida e uma mais inteligente); só as do catálogo.
  const doCatalogo = new Set((await carregarCatalogo()).modelos.chat.map((m) => m.tag));
  const ias = [...new Set([modeloChat, ...(Array.isArray(modelosChat) ? modelosChat : [])])].filter((t) => t && (t === modeloChat || doCatalogo.has(t)));
  for (const tag of ias) if (!tem(tag)) criadas.push(baixarModeloTarefa(tag));
  if (modeloEmbed && !tem(modeloEmbed)) criadas.push(baixarModeloTarefa(modeloEmbed));
  await salvarConfig({
    configurado: true,
    itens: [...new Set([...(config.itens || []), ...itens])],
    ...(modeloChat ? { modeloChat } : {}),
    ...(modeloEmbed ? { modeloEmbed } : {}),
  });
  json(res, 200, { criadas: criadas.length, falhas });
});

// Remove conteúdos e IAs já instalados ("Instalar conteúdo" no modo de gerenciar).
// Apaga o arquivo, a cópia compactada e tira da lista escolhida (senão o "Atualizar" baixaria de novo).
rota('POST', /^\/api\/remover$/, async (req, res) => {
  const { itens = [], modelos = [] } = await lerCorpo(req, 1e5);
  const removidos = [];
  const falhas = [];
  let tinhaZim = false;
  for (const id of Array.isArray(itens) ? itens : []) {
    if (!/^[\w.-]+$/.test(String(id))) continue;
    try {
      const it = await bib.remover(id);
      await pacotes.descartar(id);
      if (it?.tipo === 'zim') tinhaZim = true;
      removidos.push(id);
    } catch (e) {
      falhas.push({ id, erro: e.message });
    }
  }
  const tirar = new Set(removidos);
  const campos = { itens: (config.itens || []).filter((id) => !tirar.has(id)) };
  if (Array.isArray(modelos) && modelos.length) {
    const st = await statusOllama();
    const semLatest = (n) => String(n).replace(/:latest$/, '');
    const existentes = new Set(st.modelos.map((m) => semLatest(m.nome)));
    for (const nome of modelos) {
      const n = semLatest(nome);
      // A IA de busca é pequena e necessária para a busca pelo sentido: não é removida por aqui.
      if (!existentes.has(n) || n === semLatest(config.modeloEmbed || '')) continue;
      try {
        await removerModelo(n);
        existentes.delete(n);
        removidos.push(`modelo:${n}`);
      } catch (e) {
        falhas.push({ id: n, erro: e.message });
      }
    }
    // Se a IA padrão do chat foi removida, passa a usar outra que ficou.
    if (config.modeloChat && !existentes.has(semLatest(config.modeloChat))) {
      const doCatalogo = (await carregarCatalogo()).modelos.chat.map((m) => m.tag);
      campos.modeloChat = doCatalogo.find((t) => existentes.has(t)) || null;
    }
  }
  await salvarConfig(campos);
  if (tinhaZim) agendarReinicioKiwix();
  json(res, 200, { removidos, falhas, modeloChat: config.modeloChat });
});

// ---------- Iniciar Protocolo Zero (verificação e reparo) ----------
const contextoInicio = () => ({
  get config() {
    return config;
  },
  salvarConfig,
  indexarNoServidor,
  agendarVetorizacao,
});
const contextoAtualizar = () => ({
  get config() {
    return config;
  },
  salvarConfig,
  instalarItem,
  baixarModeloTarefa,
  baixarNovidades: baixarNovidadesCatalogo,
  iniciar: () => iniciarProtocoloZero(contextoInicio()),
});
rota('POST', /^\/api\/iniciar$/, async (req, res) => json(res, 200, iniciarProtocoloZero(contextoInicio())));
rota('GET', /^\/api\/iniciar$/, async (req, res) => json(res, 200, await relatorioAtual()));
rota('POST', /^\/api\/iniciar\/cancelar$/, async (req, res) => {
  cancelarInicio();
  json(res, 200, { ok: true });
});
// ---------- Atualizar (tudo que usa internet) ----------
rota('GET', /^\/api\/atualizacoes$/, async (req, res, url) =>
  json(res, 200, await verificarAtualizacoes(config, { forcar: url.searchParams.has('forcar') })));
// Reinicia o programa (depois de instalar uma versão nova). O primeiro processo continua aberto,
// só esperando o novo terminar.
// Fecha o Protocolo Zero (ele roda sem janela: este é o jeito de sair).
rota('POST', /^\/api\/sair$/, async (req, res) => {
  json(res, 200, { ok: true });
  setTimeout(async () => {
    console.log('\n  Protocolo Zero fechado pelo usuário.');
    await pararKiwix().catch(() => {});
    process.exit(0);
  }, 300);
});

rota('POST', /^\/api\/programa\/reiniciar$/, async (req, res) => {
  if (haTarefasAtivas() || atualizando() || iniciando()) return erro(res, 409, 'Espere os downloads e a preparação terminarem antes de reiniciar.');
  json(res, 200, { ok: true, pid: process.pid });
  setTimeout(() => reiniciarProcesso().catch((e) => registrarErro('reiniciar', e)), 300);
});

// Atualizar: com { itens, catalogo }, só o que o usuário marcou; sem corpo, tudo.
rota('POST', /^\/api\/atualizar$/, async (req, res) => {
  const corpo = await lerCorpo(req, 1e5).catch(() => null);
  const escolha = Array.isArray(corpo?.itens) ? { itens: corpo.itens.slice(0, 2000).map(String), catalogo: !!corpo.catalogo } : null;
  json(res, 200, atualizarProtocoloZero(contextoAtualizar(), escolha));
});
// "Não baixar": tira um item da lista de atualizações.
//  - conteúdo novo: sai da seleção (dá para marcar de novo em "Instalar conteúdo");
//  - versão nova de enciclopédia: esta versão não é mais oferecida (a atual continua).
rota('POST', /^\/api\/atualizacoes\/ignorar$/, async (req, res) => {
  const { tipo, id, versao } = await lerCorpo(req, 1e4);
  if (tipo === 'conteudo' && typeof id === 'string') {
    await salvarConfig({ itens: (config.itens || []).filter((x) => x !== id) });
  } else if (tipo === 'zim-nova' && typeof id === 'string' && typeof versao === 'string') {
    await salvarConfig({ versoesIgnoradas: { ...(config.versoesIgnoradas || {}), [id]: versao } });
  } else return erro(res, 400, 'Este item não pode ser tirado da lista');
  json(res, 200, await verificarAtualizacoes(config, { semRede: true }));
});
rota('GET', /^\/api\/atualizar$/, async (req, res) => json(res, 200, await relatorioAtualizacao()));
rota('POST', /^\/api\/atualizar\/cancelar$/, async (req, res) => {
  cancelarAtualizacao();
  json(res, 200, { ok: true });
});
// ---------- Atualização automática ao ligar o computador (server/autoatualizar.js) ----------
rota('GET', /^\/api\/auto$/, async (req, res) => {
  const [registrado, abrirRegistrado, ultimo, removivel, fonte] = await Promise.all([
    auto.registrado('atualizar'), auto.registrado('abrir'), auto.ultimoResultado(), auto.emDiscoRemovivel(), fonteCatalogo().catch(() => ''),
  ]);
  json(res, 200, {
    ...(config.autoAtualizar || { ativo: false, modelos: false }), registrado, ultimo, removivel, rodando: !!execucaoAuto, fonte: !!fonte,
    abrirAoLigar: !!config.abrirAoLigar, abrirRegistrado,
  });
});
rota('PUT', /^\/api\/auto$/, async (req, res) => {
  const { ativo, modelos, abrirAoLigar } = await lerCorpo(req, 1e4);
  const atual = config.autoAtualizar || { ativo: false, modelos: false };
  const novo = { ativo: ativo ?? atual.ativo, modelos: modelos ?? atual.modelos };
  try {
    if (ativo !== undefined) await auto.registrar(!!novo.ativo, 'atualizar');
    if (abrirAoLigar !== undefined) await auto.registrar(!!abrirAoLigar, 'abrir');
  } catch (e) {
    registrarErro('auto/registrar', e);
    // Só fala em antivírus quando o erro é de permissão/bloqueio; nos outros casos mostra o motivo.
    const bloqueio = ['EPERM', 'EACCES', 'EBUSY'].includes(e.code) || /negad|denied|bloque|blocked|unauthorized|vírus|virus/i.test(e.message);
    if (PLATAFORMA === 'win32' && bloqueio) return erro(res, 500, `Não foi possível criar o atalho que abre o Protocolo Zero ao ligar o computador. ${AVISO_ANTIVIRUS_INICIALIZACAO}`);
    if (PLATAFORMA === 'win32') return erro(res, 500, `Não foi possível criar o atalho que abre o Protocolo Zero ao ligar o computador. Detalhe técnico: ${e.message}`);
    return erro(res, 500, `Não foi possível mudar o que acontece ao ligar o computador: ${e.message}`);
  }
  // O atalho foi criado, mas sumiu logo em seguida: o antivírus apagou.
  if (PLATAFORMA === 'win32' && ((ativo && !(await auto.registrado('atualizar'))) || (abrirAoLigar && !(await auto.registrado('abrir'))))) {
    return erro(res, 500, `O atalho que abre o Protocolo Zero ao ligar o computador foi apagado logo depois de criado. ${AVISO_ANTIVIRUS_INICIALIZACAO}`);
  }
  await salvarConfig({
    autoAtualizar: { ativo: !!novo.ativo, modelos: !!novo.modelos },
    ...(abrirAoLigar !== undefined ? { abrirAoLigar: !!abrirAoLigar } : {}),
  });
  json(res, 200, { ...config.autoAtualizar, abrirAoLigar: !!config.abrirAoLigar, registrado: await auto.registrado('atualizar'), abrirRegistrado: await auto.registrado('abrir') });
});
rota('POST', /^\/api\/auto\/rodar$/, async (req, res) => {
  rodarAutomatico({ forcar: true }).catch((e) => console.error('[auto]', e.message));
  json(res, 200, { ok: true });
});
rota('POST', /^\/api\/auto\/visto$/, async (req, res) => {
  const u = await auto.ultimoResultado();
  if (u) await auto.guardarResultado({ ...u, visto: true });
  json(res, 200, { ok: true });
});

rota('GET', /^\/api\/erros$/, async (req, res) => json(res, 200, await errosRecentes(50)));

// Explicação dos problemas em linguagem simples.
// 1) SEMPRE vem primeiro a orientação por regras fixas (testada e segura).
// 2) A IA local só complementa se o modelo for confiável (>= PARAMS_CONFIAVEL), e recebe as
//    orientações fixas como limite. Modelos pequenos inventam passos (ex.: "desative o antivírus").
// A IA só EXPLICA: nada do que ela escreve é executado.
const SISTEMA_SUPORTE = `Você é o técnico de suporte do Protocolo Zero, um programa offline que roda no computador do usuário.
O usuário NÃO é técnico. Reescreva as ORIENTAÇÕES OFICIAIS abaixo de forma mais clara e acolhedora, em português do Brasil, em no máximo 8 linhas.
REGRAS: use SOMENTE as orientações oficiais; não acrescente passos novos; não cite programas, menus ou botões que não estejam nelas;
nunca sugira apagar arquivos ou rodar comandos; só fale do antivírus se as orientações oficiais falarem dele, e do mesmo jeito (inclusive religar depois). Se algo não estiver claro, diga para clicar em "Verificar de novo".`;

function orientacaoFixa(problemas) {
  if (!problemas.length) return 'Nenhum problema encontrado na última verificação. Está tudo pronto para usar.';
  return problemas.map((p) => {
    let t = `### ${p.titulo}\n`;
    if (p.estado === 'erro') t += explicarSemIA(p.erroTecnico || p.mensagem);
    else t += p.mensagem;
    if (p.acao?.tipo === 'atualizar') t += `\n\n**O que fazer:** isto precisa de internet. Quando estiver conectado, clique em **Atualizar**; no fim, o Protocolo Zero descompacta e instala sozinho.`;
    if (p.acao?.tipo === 'usar-recomendado') t += `\n\n**O que fazer:** clique em **${p.acao.rotulo}** no passo "${p.titulo}". O download continua sozinho e o assistente passa a usar o novo modelo quando terminar.`;
    return t;
  }).join('\n\n');
}

rota('POST', /^\/api\/iniciar\/explicar$/, async (req, res, url) => {
  const rel = url.searchParams.get('de') === 'atualizar' ? await relatorioAtualizacao() : await relatorioAtual();
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' });
  const enviar = (o) => res.write(JSON.stringify(o) + '\n');
  const ctrl = new AbortController();
  res.on('close', () => !res.writableFinished && ctrl.abort());
  const problemas = (rel?.passos || []).filter((p) => ['erro', 'aviso'].includes(p.estado));
  const base = orientacaoFixa(problemas);
  enviar({ tipo: 'texto', texto: base });

  const st = await statusOllama();
  const chats = st.modelos.filter((m) => !/embed/i.test(m.nome));
  const m = chats.find((x) => x.nome.replace(/:latest$/, '') === (config.modeloChat || '').replace(/:latest$/, '')) || chats[0];
  const confiavel = m && (parametrosB(m) ?? 0) >= PARAMS_CONFIAVEL;
  if (!st.online || !m || !problemas.length) {
    if (problemas.length) enviar({ tipo: 'texto', texto: '\n\n_(Orientação automática — o assistente de IA não está disponível agora.)_' });
    enviar({ tipo: 'fim' });
    return res.end();
  }
  if (!confiavel) {
    enviar({ tipo: 'texto', texto: `\n\n_(Orientação automática. O modelo em uso, ${m.nome}, é pequeno demais para analisar erros com segurança; com o modelo recomendado o assistente também comenta o diagnóstico.)_` });
    enviar({ tipo: 'fim' });
    return res.end();
  }
  try {
    enviar({ tipo: 'texto', texto: '\n\n---\n\n#### Comentário do assistente\n\n' });
    const contexto = await contextoDiagnostico(rel);
    await conversar({
      modelo: m.nome,
      mensagens: [
        { role: 'system', content: SISTEMA_SUPORTE },
        { role: 'user', content: `ORIENTAÇÕES OFICIAIS:\n${base}\n\nDADOS TÉCNICOS (só para contexto):\n${contexto}` },
      ],
      opcoes: { temperature: 0.1 },
      sinal: ctrl.signal,
      onTexto: (t) => enviar({ tipo: 'texto', texto: t }),
    });
    enviar({ tipo: 'fim' });
  } catch (e) {
    if (!ctrl.signal.aborted) enviar({ tipo: 'erro', texto: e.message });
  }
  res.end();
});

// ---------- inteligência de modelo ----------
let cacheIA = { quando: 0, dados: null };
async function avaliacaoIA(forcar = false) {
  if (!forcar && cacheIA.dados && Date.now() - cacheIA.quando < 20000) return cacheIA.dados;
  const [hw, catalogo, status] = await Promise.all([detectarHardware(), catalogoAtualizado(), statusOllama()]);
  const dados = { online: status.online, ...(await avaliarIA({ hw, catalogo, status, config })) };
  cacheIA = { quando: Date.now(), dados };
  return dados;
}
rota('GET', /^\/api\/ia\/perfis$/, async (req, res) => {
  const [hw, catalogo, status] = await Promise.all([detectarHardware(), carregarCatalogo(), statusOllama()]);
  json(res, 200, { ...(await perfisIA({ hw, catalogo, status })), online: status.online, modeloChat: config.modeloChat });
});
rota('GET', /^\/api\/ia$/, async (req, res, url) => json(res, 200, await avaliacaoIA(url.searchParams.has('forcar'))));
/** Passa a usar o modelo recomendado (baixa antes, se faltar). Devolve { modelo, baixando, tarefa? }. */
async function usarRecomendado() {
  const av = await avaliacaoIA(true);
  const tag = av.sugestao?.tag || av.recomendado.tag;
  if (av.recomendado.instalado || (await statusOllama()).modelos.some((m) => m.nome.replace(/:latest$/, '') === tag)) {
    await salvarConfig({ modeloChat: tag });
    cacheIA.dados = null;
    return { modelo: tag, baixando: false };
  }
  // Baixa e, quando terminar, passa a usar automaticamente.
  const t = criarTarefa({
    tipo: 'modelo', titulo: `Modelo recomendado ${tag}`, chave: `modelo:${tag}`,
    fn: async (tf, s) => {
      if (!(await ollamaOnline())) throw new Error('O Ollama não está rodando.');
      await baixarModelo(tag, tf, s);
      tf.mensagem = 'Medindo a velocidade neste computador…';
      await registrarVelocidade(tag, await medirVelocidade(tag, s).catch(() => null));
      await salvarConfig({ modeloChat: tag });
      cacheIA.dados = null;
      tf.mensagemFinal = `Pronto — o assistente agora usa ${tag}`;
    },
  });
  return { modelo: tag, baixando: true, tarefa: t };
}
rota('POST', /^\/api\/ia\/usar-recomendado$/, async (req, res) => {
  const r = await usarRecomendado();
  json(res, 200, { ok: true, modelo: r.modelo, baixando: r.baixando, ...(r.tarefa ? { tarefa: r.tarefa.id } : {}) });
});

rota('POST', /^\/api\/ollama\/instalar$/, async (req, res) => {
  const t = criarTarefa({ tipo: 'ferramenta', titulo: 'Ollama (motor de IA)', chave: 'ferramenta:ollama', fn: (t, s) => instalarOllama(t, s, ollamaOnline) });
  json(res, 200, { tarefa: t.id });
});
rota('POST', /^\/api\/ollama\/modelo$/, async (req, res) => {
  const { nome } = await lerCorpo(req, 1e4);
  if (!/^[\w.\-/:]+$/.test(nome || '')) return erro(res, 400, 'Nome de modelo inválido');
  json(res, 200, { tarefa: baixarModeloTarefa(nome).id });
});
rota('DELETE', /^\/api\/ollama\/modelo$/, async (req, res) => {
  const { nome } = await lerCorpo(req, 1e4);
  await removerModelo(nome);
  json(res, 200, { ok: true });
});

rota('GET', /^\/api\/tarefas$/, async (req, res) => json(res, 200, listarTarefas()));
rota('POST', /^\/api\/tarefas\/limpar$/, async (req, res) => {
  limparConcluidas();
  json(res, 200, { ok: true });
});
rota('POST', /^\/api\/tarefas\/([\w-]+)\/cancelar$/, async (req, res, url, m) => json(res, 200, { ok: cancelarTarefa(m[1]) }));
rota('POST', /^\/api\/tarefas\/([\w-]+)\/repetir$/, async (req, res, url, m) => {
  const t = repetirTarefa(m[1]);
  if (!t) return erro(res, 404, 'Esta transferência não pode ser repetida. Selecione o item de novo em Instalar conteúdo.');
  json(res, 200, { ok: true, tarefa: t.id });
});

rota('GET', /^\/api\/biblioteca$/, async (req, res) => {
  const idx = await documentosIndexados();
  const cat = await carregarCatalogo();
  const porId = new Map(cat.itens.map((i) => [i.id, i]));
  const itens = (await bib.listar()).map((i) => ({ ...i, trechos: idx.get(i.id) || 0, indexavel: bib.indexavel(i.tipo), confianca: confiancaDe(porId.get(i.id) || i) }));
  json(res, 200, itens);
});
// Texto já lido de um documento, por página (PDF escaneado sem texto devolve lista vazia).
rota('GET', /^\/api\/biblioteca\/([\w.-]+)\/texto$/, async (req, res, url, m) => json(res, 200, await textoDoDocumento(m[1])));

// Leitor do app: páginas/capítulos de EPUB e texto (PDFs são lidos no navegador com pdf.js).
rota('GET', /^\/api\/biblioteca\/([\w.-]+)\/leitura$/, async (req, res, url, m) => {
  const it = await bib.obter(m[1]);
  if (!it) return erro(res, 404, 'Documento não encontrado');
  if (it.tipo === 'pdf') return json(res, 200, { tipo: 'pdf', titulo: it.titulo });
  if (!['epub', 'texto'].includes(it.tipo)) return erro(res, 400, 'Este arquivo não tem texto para ler no leitor');
  try {
    json(res, 200, { tipo: it.tipo, titulo: it.titulo, partes: await bib.partesDeLeitura(it) });
  } catch (e) {
    erro(res, 500, e.message || 'Não foi possível abrir o texto deste arquivo');
  }
});

// Imagens de dentro do EPUB (ilustrações, capas).
rota('GET', /^\/api\/biblioteca\/([\w.-]+)\/epub\/(.+)$/, async (req, res, url, m) => {
  const it = await bib.obter(m[1]);
  if (!it) return erro(res, 404, 'Documento não encontrado');
  const arq = await bib.entradaEpub(it, m[2]);
  if (!arq) return erro(res, 404, 'Imagem não encontrada no livro');
  res.writeHead(200, { 'Content-Type': arq.mime, 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
  res.end(arq.dados);
});

// Notas de leitura (realces, notas, marcadores e última página lida), por documento.
rota('GET', /^\/api\/leitura$/, async (req, res) => {
  const docs = [];
  for (const d of await leitura.todas()) {
    const it = await bib.obter(d.id);
    docs.push({ ...d, titulo: it?.titulo || 'Arquivo removido da biblioteca', tipo: it?.tipo || null, categoria: it?.categoria || null, existe: !!it });
  }
  docs.sort((a, b) => (b.atualizado || 0) - (a.atualizado || 0));
  json(res, 200, { documentos: docs });
});
rota('GET', /^\/api\/biblioteca\/([\w.-]+)\/notas$/, async (req, res, url, m) => json(res, 200, await leitura.obter(m[1])));
rota('PUT', /^\/api\/biblioteca\/([\w.-]+)\/notas$/, async (req, res, url, m) => {
  const it = await bib.obter(m[1]);
  if (!it) return erro(res, 404, 'Documento não encontrado');
  json(res, 200, await leitura.gravar(m[1], await lerCorpo(req, 4e6)));
});

// Traduções prontas do leitor (ficam guardadas no computador).
rota('GET', /^\/api\/biblioteca\/([\w.-]+)\/traducao$/, async (req, res, url, m) => json(res, 200, await traducao.obter(m[1])));
rota('PUT', /^\/api\/biblioteca\/([\w.-]+)\/traducao$/, async (req, res, url, m) => {
  const it = await bib.obter(m[1]);
  if (!it) return erro(res, 404, 'Documento não encontrado');
  const { indice, bloco, texto, chave } = await lerCorpo(req, 1e5);
  if (indice == null || bloco == null || typeof texto !== 'string') return erro(res, 400, 'Informe a página, o parágrafo e o texto traduzido');
  await traducao.gravarBloco(m[1], indice, bloco, { texto, chave });
  json(res, 200, { ok: true });
});
rota('PUT', /^\/api\/biblioteca\/([\w.-]+)\/traducao\/estado$/, async (req, res, url, m) => {
  const it = await bib.obter(m[1]);
  if (!it) return erro(res, 404, 'Documento não encontrado');
  json(res, 200, await traducao.gravarEstado(m[1], await lerCorpo(req, 1e4)));
});
rota('GET', /^\/api\/traducoes$/, async (req, res) => json(res, 200, await traducao.resumos()));
rota('DELETE', /^\/api\/biblioteca\/([\w.-]+)\/traducao$/, async (req, res, url, m) => {
  await traducao.remover(m[1]);
  json(res, 200, { ok: true });
});

rota('GET', /^\/api\/biblioteca\/([\w.-]+)$/, async (req, res, url, m) => {
  const it = await bib.obter(m[1]);
  if (!it) return erro(res, 404, 'Documento não encontrado');
  const idx = await documentosIndexados();
  const cat = await carregarCatalogo();
  const doCatalogo = cat.itens.find((x) => x.id === it.id);
  json(res, 200, { ...it, trechos: idx.get(it.id) || 0, indexavel: bib.indexavel(it.tipo), confianca: confiancaDe(doCatalogo || it) });
});

// Arquivos compactados que ainda não foram descompactados. A Biblioteca lista cada um para
// o usuário abrir só o que quer consultar agora, sem rodar o "Iniciar Protocolo Zero".
rota('GET', /^\/api\/compactados$/, async (req, res) => json(res, 200, await pacotes.listarCompactados()));
rota('POST', /^\/api\/compactados\/descompactar$/, async (req, res) => {
  const { id } = await lerCorpo(req, 1e4);
  if (!id || typeof id !== 'string') return erro(res, 400, 'Escolha um arquivo compactado');
  cachePacotes = { quando: 0, valor: null };
  if (id.startsWith('arquivo:')) {
    const abs = path.join(PASTAS.pacotes, path.basename(id.slice('arquivo:'.length)));
    if (!dentroDe(PASTAS.pacotes, abs) || !(await existe(abs))) return erro(res, 404, 'Arquivo compactado não encontrado');
    const r = await pacotes.importarPacotesDeArquivos({ somente: [abs] });
    if (r.falhas.length) return erro(res, 400, explicarSemIA(r.falhas[0]));
    return json(res, 200, { ok: true, arquivos: r.arquivos });
  }
  const p = await pacotes.obterPacote(id);
  if (!p) return erro(res, 404, 'Arquivo compactado não encontrado');
  // No Windows o leitor mantém os ZIMs abertos: fecha antes de mover e reabre depois.
  if (p.registro?.tipo === 'zim') await pararKiwix().catch(() => {});
  try {
    const it = await pacotes.descompactar(id);
    if (['texto', 'epub'].includes(it.registro?.tipo)) await indexarNoServidor(id).catch(() => {});
    if (it.registro?.tipo === 'zim') agendarReinicioKiwix();
  } catch (e) {
    cachePacotes = { quando: 0, valor: null };
    return erro(res, 400, explicarSemIA(e.message));
  }
  json(res, 200, { ok: true });
});

// Tradução com a IA do computador (sem internet). Divide o texto em partes e devolve aos poucos (NDJSON).
rota('POST', /^\/api\/traduzir$/, async (req, res) => {
  const { texto, modelo } = await lerCorpo(req, 4e5);
  const entrada = String(texto || '').trim().slice(0, 60000);
  if (!entrada) return erro(res, 400, 'Nada para traduzir');
  let m = modelo || config.modeloChat;
  if (!m) {
    const st = await statusOllama();
    if (!st.online) return erro(res, 503, 'A IA (Ollama) não está ligada');
    m = st.modelos.find((x) => !/embed/i.test(x.nome))?.nome;
  }
  if (!m) return erro(res, 400, 'Nenhuma IA instalada para traduzir');
  // Partes de ~2.500 caracteres, cortadas em fim de parágrafo ou frase.
  const partes = [];
  let resto = entrada;
  while (resto.length) {
    if (resto.length <= 2500) { partes.push(resto); break; }
    let corte = resto.lastIndexOf('\n', 2500);
    if (corte < 1200) corte = resto.lastIndexOf('. ', 2500) + 1;
    if (corte < 1200) corte = 2500;
    partes.push(resto.slice(0, corte));
    resto = resto.slice(corte).trimStart();
  }
  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' });
  const enviar = (o) => res.write(JSON.stringify(o) + '\n');
  const ctrl = new AbortController();
  res.on('close', () => !res.writableFinished && ctrl.abort());
  try {
    for (const [i, parte] of partes.entries()) {
      enviar({ tipo: 'parte', n: i + 1, total: partes.length });
      await conversar({
        modelo: m, sinal: ctrl.signal, opcoes: { temperature: 0.1 },
        mensagens: [
          { role: 'system', content: 'Você é um tradutor. Traduza o texto do usuário para o português do Brasil, fiel ao original, com linguagem simples. Mantenha números, medidas, unidades (oz, lb, °F, gal, inch…), doses e nomes exatamente como estão no original, sem converter: o aplicativo mostra a conversão ao lado. Não resuma, não comente, não acrescente nada: responda só com a tradução. Se o texto já estiver em português, devolva-o igual.' },
          { role: 'user', content: parte },
        ],
        onTexto: (t) => enviar({ tipo: 'texto', texto: t }),
      });
      enviar({ tipo: 'texto', texto: '\n\n' });
    }
    enviar({ tipo: 'fim' });
  } catch (e) {
    if (!ctrl.signal.aborted) enviar({ tipo: 'erro', erro: e.message });
  }
  res.end();
});

rota('DELETE', /^\/api\/biblioteca\/([\w.-]+)$/, async (req, res, url, m) => {
  const it = await bib.remover(m[1]);
  if (!it) return erro(res, 404, 'Item não encontrado');
  await pacotes.descartar(m[1]); // remove também a cópia compactada
  // Tira da lista escolhida, senão o "Atualizar" baixaria de novo.
  if ((config.itens || []).includes(m[1])) await salvarConfig({ itens: config.itens.filter((id) => id !== m[1]) });
  if (it.tipo === 'zim') agendarReinicioKiwix();
  json(res, 200, { ok: true });
});
rota('PATCH', /^\/api\/biblioteca\/([\w.-]+)$/, async (req, res, url, m) => {
  const { titulo, categoria } = await lerCorpo(req, 1e4);
  json(res, 200, await bib.atualizar(m[1], { ...(titulo ? { titulo } : {}), ...(categoria ? { categoria } : {}) }));
});

rota('PUT', /^\/api\/upload$/, async (req, res, url) => {
  const nome = url.searchParams.get('nome');
  if (!nome) return erro(res, 400, 'Informe o nome do arquivo');
  const it = await bib.receberUpload(req, {
    nome,
    categoria: url.searchParams.get('categoria') || 'meus',
    titulo: url.searchParams.get('titulo') || undefined,
  });
  if (it.tipo === 'zim') {
    await garantirKiwix();
    agendarReinicioKiwix();
  }
  if (['texto', 'epub'].includes(it.tipo)) await indexarNoServidor(it.id);
  json(res, 200, it);
});

// Indexação de PDFs: o navegador extrai o texto com pdf.js e envia para cá.
rota('GET', /^\/api\/indexacao\/pendentes$/, async (req, res) => {
  const idx = await documentosIndexados();
  const pend = (await bib.listar()).filter((i) => i.tipo === 'pdf' && !i.indexado && !idx.has(i.id) && !i.falhaIndexacao);
  if (!pend.length) atualizarPassoBusca().catch(() => {}); // corrige aviso antigo de "PDFs ainda serão lidos"
  json(res, 200, pend);
});
rota('POST', /^\/api\/indexacao\/([\w.-]+)$/, async (req, res, url, m) => {
  const it = await bib.obter(m[1]);
  if (!it) return erro(res, 404, 'Item não encontrado');
  const { partes, falha } = await lerCorpo(req);
  if (falha) {
    await bib.atualizar(it.id, { falhaIndexacao: String(falha).slice(0, 300) });
    atualizarPassoBusca().catch(() => {});
    return json(res, 200, { ok: true });
  }
  const r = await indexarDocumento({ docId: it.id, titulo: it.titulo, partes: Array.isArray(partes) ? partes : [] });
  await bib.atualizar(it.id, { indexado: true, trechos: r.trechos, semTexto: r.trechos === 0 });
  agendarVetorizacao();
  atualizarPassoBusca().catch(() => {});
  json(res, 200, r);
});
rota('POST', /^\/api\/indexacao\/([\w.-]+)\/refazer$/, async (req, res, url, m) => {
  const it = await bib.obter(m[1]);
  if (!it) return erro(res, 404, 'Item não encontrado');
  await bib.atualizar(it.id, { indexado: false, falhaIndexacao: null });
  if (['texto', 'epub'].includes(it.tipo)) await indexarNoServidor(it.id);
  json(res, 200, { ok: true });
});

rota('GET', /^\/api\/buscar$/, async (req, res, url) => {
  const q = url.searchParams.get('q') || '';
  if (!q.trim()) return json(res, 200, { trechos: [], artigos: [] });
  const [trechos, artigos] = await Promise.all([
    buscar(q, { modeloEmbed: config.modeloEmbed, limite: 12 }),
    buscarNosZims(q, { limite: 6 }).catch(() => []),
  ]);
  const itens = await bib.listar();
  for (const t of trechos) t.arquivo = itens.find((i) => i.id === t.docId)?.arquivo;
  json(res, 200, { trechos, artigos: artigos.map((a) => ({ ...a, texto: a.texto.slice(0, 300) })) });
});

rota('POST', /^\/api\/chat$/, rotaChat);

rota('POST', /^\/api\/mapas\/estimar$/, async (req, res) => {
  const { bbox, maxzoom } = await lerCorpo(req, 1e4);
  if (!(await existe(caminhoPmtiles()))) return json(res, 200, { bytes: null, motivo: 'ferramenta pmtiles ainda não instalada' });
  json(res, 200, await estimarMapa({ bbox, maxzoom }));
});
rota('POST', /^\/api\/mapas\/extrair$/, async (req, res) => {
  const { titulo, bbox, maxzoom } = await lerCorpo(req, 1e4);
  if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some((n) => typeof n !== 'number')) return erro(res, 400, 'Região inválida');
  const z = Math.max(0, Math.min(15, Number(maxzoom) || 10));
  const id = `mapa-${String(titulo || 'regiao').normalize('NFD').replace(/[^\w]+/g, '-').toLowerCase().slice(0, 40)}-z${z}`;
  await garantirVendor();
  const t = criarTarefa({
    tipo: 'mapa', titulo: titulo || 'Mapa', chave: `item:${id}`, itemId: id,
    fn: async (tf, s) => {
      const destino = path.join(PASTAS.mapas, `${id}.pmtiles`);
      const tamanho = await extrairMapa({ bbox, maxzoom: z, destino, tarefa: tf, sinal: s });
      await bib.registrar({ id, tipo: 'mapa', titulo: titulo || 'Mapa', categoria: 'mapas', fonte: 'Protomaps / OpenStreetMap', arquivo: `mapas/${id}.pmtiles`, tamanho, origem: 'usuario', bbox, maxzoom: z });
    },
  });
  json(res, 200, { tarefa: t.id });
});

// ---------- satélite ----------
rota('GET', /^\/api\/satelite$/, async (req, res) => json(res, 200, { ...(await usoSatelite()), fonte: SATELITE.nome, atribuicao: SATELITE.atribuicao, maxzoom: SATELITE.maxzoom }));
rota('POST', /^\/api\/satelite\/estimar$/, async (req, res) => {
  const corpo = await lerCorpo(req, 1e4);
  const { bbox, maxzoom } = validarArea(corpo.bbox, corpo.maxzoom);
  json(res, 200, estimarArea(bbox, maxzoom));
});
rota('POST', /^\/api\/satelite\/baixar$/, async (req, res) => {
  const corpo = await lerCorpo(req, 1e4);
  const area = validarArea(corpo.bbox, corpo.maxzoom);
  const est = estimarArea(area.bbox, area.maxzoom);
  if (!est.permitido) return erro(res, 400, `Área grande demais (${est.tiles} blocos; limite ${est.limite}). Aproxime o mapa ou escolha menos detalhe.`);
  const t = criarTarefa({
    tipo: 'mapa', titulo: `Satélite: ${String(corpo.titulo || 'área escolhida').slice(0, 80)}`, chave: `satelite:${area.bbox.join(',')}:${area.maxzoom}`,
    fn: (tf, s) => baixarArea(area, tf, s),
  });
  json(res, 200, { tarefa: t.id, ...est });
});

// Copiar o Protocolo Zero para pendrive/HD e atalho na Área de Trabalho (server/copiar.js).
rota('GET', /^\/api\/copiar$/, async (req, res) => {
  const [destinos, tamanhos] = await Promise.all([destinosCopia(), tamanhosCopia()]);
  json(res, 200, { destinos, tamanhos });
});
rota('POST', /^\/api\/copiar$/, async (req, res) => {
  const { pasta, incluir = {} } = await lerCorpo(req, 1e4);
  const t = criarTarefa({ tipo: 'copia', titulo: `Copiar Protocolo Zero para ${String(pasta || '').slice(0, 80)}`, chave: 'copia', fn: (tf, s) => copiarPZ({ pasta, incluir }, tf, s) });
  json(res, 200, { tarefa: t.id });
});
rota('POST', /^\/api\/copiar\/abrir$/, async (req, res) => {
  const { pasta } = await lerCorpo(req, 1e4);
  if (!pasta || !path.isAbsolute(pasta) || !(await existe(pasta))) return erro(res, 400, 'Pasta não encontrada');
  abrirPasta(pasta);
  json(res, 200, { ok: true });
});
rota('POST', /^\/api\/atalho$/, async (req, res) => {
  const { onde } = await lerCorpo(req, 1e3);
  json(res, 200, await criarAtalho(onde === 'menu' ? 'menu' : 'desktop'));
});

rota('POST', /^\/api\/abrir-pasta$/, async (req, res) => {
  const cmd = PLATAFORMA === 'win32' ? 'explorer' : PLATAFORMA === 'darwin' ? 'open' : 'xdg-open';
  spawn(cmd, [DADOS], { detached: true, stdio: 'ignore' }).unref();
  json(res, 200, { ok: true });
});

// ---------------- servidor ----------------
async function tratar(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (!requisicaoConfiavel(req)) return erro(res, 403, 'Requisição bloqueada por segurança');
  const caminho = decodeURIComponent(url.pathname);
  if (caminho !== '/api/ping') marcarAtividade();

  if (caminho.startsWith('/api/')) {
    for (const r of rotas) {
      if (r.metodo !== req.method) continue;
      const m = r.padrao.exec(caminho);
      if (m) return r.fn(req, res, url, m);
    }
    return erro(res, 404, 'Rota não encontrada');
  }

  if (!['GET', 'HEAD'].includes(req.method)) return erro(res, 405, 'Método não permitido');

  if (caminho.startsWith('/arquivos/')) {
    const abs = path.join(DADOS, caminho.slice('/arquivos/'.length));
    const permitidas = [PASTAS.pdf, PASTAS.meus, PASTAS.mapas, path.join(DADOS, 'internet-archive')];
    if (!permitidas.some((p) => dentroDe(p, abs))) return erro(res, 403, 'Acesso negado');
    return servirArquivo(req, res, abs);
  }
  // Satélite: do disco, ou da internet (e guarda para usar offline).
  const mt = /^\/satelite\/(\d+)\/(\d+)\/(\d+)\.jpg$/.exec(caminho);
  if (mt) {
    const buf = await obterTile(Number(mt[1]), Number(mt[2]), Number(mt[3]));
    if (!buf) {
      res.writeHead(404, { 'Cache-Control': 'no-store' });
      return res.end();
    }
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400' });
    return res.end(buf);
  }
  if (caminho.startsWith('/vendor/')) {
    const abs = path.join(PASTAS.vendor, caminho.slice('/vendor/'.length));
    if (!dentroDe(PASTAS.vendor, abs)) return erro(res, 403, 'Acesso negado');
    return servirArquivo(req, res, abs, { cache: true });
  }
  const rel = caminho === '/' ? 'index.html' : caminho.slice(1);
  const abs = path.join(PUBLICO, rel);
  if (!dentroDe(PUBLICO, abs)) return erro(res, 403, 'Acesso negado');
  if (!(await existe(abs)) && !path.extname(rel)) return servirArquivo(req, res, path.join(PUBLICO, 'index.html'));
  return servirArquivo(req, res, abs);
}

function abrirNavegador(url) {
  if (process.argv.includes('--sem-navegador') || process.env.PROTOCOLO_ZERO_SEM_NAVEGADOR) return;
  const [cmd, args] =
    PLATAFORMA === 'win32' ? ['cmd', ['/c', 'start', '', url]] :
    PLATAFORMA === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } catch {}
}

function escutar(servidor, p) {
  return new Promise((resolve, reject) => {
    servidor.once('error', reject);
    servidor.listen(p, '127.0.0.1', () => {
      servidor.off('error', reject);
      resolve(p);
    });
  });
}

// ---------- uma instância só ----------
// Abrir o Protocolo Zero duas vezes criava vários servidores (4321, 4323, 4324…) disputando os mesmos
// dados e a porta das enciclopédias; quando um fechava, a página dele mostrava "Failed to fetch".
const ARQ_INSTANCIA = path.join(DADOS, 'servidor.json');
async function instanciaAberta() {
  const anterior = await lerJSON(ARQ_INSTANCIA, null);
  const portas = [anterior?.porta, ...Array.from({ length: 10 }, (_, i) => PORTA_PADRAO + i)].filter((p, i, a) => p && p !== PORTA_KIWIX && a.indexOf(p) === i);
  for (const p of portas) {
    try {
      const r = await fetch(`http://127.0.0.1:${p}/api/ping`, { signal: AbortSignal.timeout(1500) });
      const j = await r.json();
      if (j.app === 'protocolo-zero' && path.resolve(j.dados) === path.resolve(DADOS)) return p;
    } catch {}
  }
  return null;
}

// ---------- primeiro uso: configura tudo sozinho, com uma tela de "Configurando" ----------
// Detecta o computador, escolhe a IA, instala o motor de IA, baixa a IA e o pacote Essencial e prepara
// tudo para usar sem internet. Pode ser interrompido: na próxima vez continua do que falta.
const ETAPAS_PRIMEIRO_USO = [
  ['hardware', 'Detectando as configurações do seu computador'],
  ['modelo', 'Escolhendo o melhor modelo de IA para ele'],
  ['motor', 'Instalando o motor de IA'],
  ['ia', 'Baixando o modelo de IA'],
  ['conteudo', 'Baixando a biblioteca essencial'],
  ['preparar', 'Preparando tudo para funcionar sem internet'],
];
const PACOTE_PRIMEIRO_USO = 'essencial';
let primeiroUso = null; // { estado: 'rodando'|'concluido'|'erro', etapas, inicio, fim }
const GB_ = 1024 ** 3;
const fmtGB = (b) => `${(b / GB_).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB`;

/** Progresso somado de várias tarefas (baixado/total). */
function fracaoDe(tarefas) {
  const vivas = tarefas.filter(Boolean);
  const total = vivas.reduce((a, t) => a + (t.total || 0), 0);
  if (!total) return null;
  return Math.min(1, vivas.reduce((a, t) => a + (t.estado === 'concluido' ? t.total || 0 : t.baixado || 0), 0) / total);
}
async function esperarTarefas(tarefas, etapa, rotulo) {
  const vivas = tarefas.filter(Boolean);
  const relogio = setInterval(() => {
    etapa.fracao = fracaoDe(vivas);
    const feitas = vivas.filter((t) => ['concluido', 'erro', 'cancelado'].includes(t.estado)).length;
    if (rotulo) etapa.mensagem = `${rotulo}: ${feitas} de ${vivas.length}`;
  }, 700);
  try {
    return await Promise.all(vivas.map((t) => aguardarTarefa(t)));
  } finally {
    clearInterval(relogio);
    etapa.fracao = 1;
  }
}

function iniciarPrimeiroUso() {
  if (primeiroUso?.estado === 'rodando') return primeiroUso;
  const pu = (primeiroUso = {
    estado: 'rodando', inicio: Date.now(),
    etapas: ETAPAS_PRIMEIRO_USO.map(([id, titulo]) => ({ id, titulo, estado: 'pendente', mensagem: '', fracao: null })),
  });
  const etapa = (id) => pu.etapas.find((e) => e.id === id);
  const passo = async (id, fn) => {
    const e = etapa(id);
    e.estado = 'rodando';
    try {
      const r = (await fn(e)) || {};
      e.estado = r.estado || 'ok';
      if (r.mensagem != null) e.mensagem = r.mensagem;
    } catch (er) {
      e.estado = 'erro';
      e.mensagem = explicarSemIA(er?.message || String(er));
      registrarErro(`primeiro-uso/${id}`, er);
    }
    e.fracao = null;
    return e.estado;
  };

  (async () => {
    let hw;
    let rec;
    await passo('hardware', async (e) => {
      e.mensagem = 'Memória, processador, placa de vídeo e espaço livre…';
      hw = await detectarHardware({ forcar: true });
      const gpu = hw.gpus?.find((g) => g.dedicada);
      return { mensagem: `${fmtGB(hw.ramInstalada || hw.ramTotal)} de memória · ${gpu ? `placa de vídeo ${gpu.nome}` : 'sem placa de vídeo dedicada'} · ${fmtGB(hw.disco.livre)} livres` };
    });
    if (!hw) throw new Error('Não foi possível analisar o computador.');

    await passo('modelo', async (e) => {
      e.mensagem = 'Comparando as IAs com a memória e a velocidade deste computador…';
      rec = await recomendar(hw, await catalogoAtualizado());
      const tam = rec.modelo.chat.tamanho + rec.modelo.embed.tamanho;
      return { mensagem: `Escolhida a IA que melhor roda aqui (${fmtGB(tam)} para baixar).` };
    });
    if (!rec) throw new Error('Não foi possível escolher a IA.');

    const motor = await passo('motor', async (e) => {
      if (await ollamaOnline()) return { mensagem: 'Já estava instalado.' };
      if (await ollamaInstalado()) {
        e.mensagem = 'Ligando o motor de IA…';
        if (await ligarOllama(ollamaOnline)) return { mensagem: 'Já estava instalado. Foi ligado.' };
        throw new Error('O Ollama está instalado, mas não respondeu ao ser ligado.');
      }
      if (PLATAFORMA === 'linux') return { estado: 'aviso', mensagem: 'No Linux, instale uma vez pelo terminal: curl -fsSL https://ollama.com/install.sh | sh — depois abra o Protocolo Zero de novo.' };
      e.mensagem = 'Baixando o instalador oficial do Ollama…';
      const t = criarTarefa({ tipo: 'ferramenta', titulo: 'Ollama (motor de IA)', chave: 'ferramenta:ollama', fn: (tf, sg) => instalarOllama(tf, sg, ollamaOnline) });
      const [fim] = await esperarTarefas([t], e);
      if (fim.estado !== 'concluido') throw new Error(fim.mensagem);
      return { mensagem: 'Instalado e ligado.' };
    });

    await passo('ia', async (e) => {
      if (motor !== 'ok' || !(await ollamaOnline())) return { estado: 'pulado', mensagem: 'Sem o motor de IA. O resto do Protocolo Zero funciona normalmente.' };
      const st = await statusOllama();
      const tem = (n) => st.modelos.some((m) => semTag(m.nome) === semTag(n));
      const faltam = [rec.modelo.chat.tag, rec.modelo.embed.tag].filter((n) => !tem(n));
      await salvarConfig({ modeloChat: rec.modelo.chat.tag, modeloEmbed: rec.modelo.embed.tag });
      if (!faltam.length) return { mensagem: 'Já estava baixado.' };
      e.mensagem = 'Baixando…';
      const fins = await esperarTarefas(faltam.map((n) => baixarModeloTarefa(n)), e);
      const falha = fins.find((f) => f.estado !== 'concluido');
      if (falha) throw new Error(falha.mensagem);
      return { mensagem: 'Pronto.' };
    });

    await passo('conteudo', async (e) => {
      const ids = await itensDoPacote(PACOTE_PRIMEIRO_USO);
      const c = await carregarCatalogo();
      const bytesPacote = ids.reduce((a, id) => a + (c.itens.find((i) => i.id === id)?.tamanho || 0), 0);
      const livre = (await espacoEmDisco()).livre;
      if (livre < bytesPacote * 1.2) return { estado: 'aviso', mensagem: `Falta espaço: a biblioteca essencial precisa de ${fmtGB(bytesPacote)} e há ${fmtGB(livre)} livres. Libere espaço e escolha o conteúdo em "Instalar conteúdo".` };
      await salvarConfig({ pacote: PACOTE_PRIMEIRO_USO, itens: [...new Set([...(config.itens || []), ...ids])] });
      e.mensagem = 'Componentes de leitura de PDF e mapas…';
      const vendor = (await vendorInstalado()) ? null : criarTarefa({ tipo: 'ferramenta', titulo: 'Componentes de leitura de PDF e mapas', chave: 'ferramenta:vendor', fn: instalarVendor });
      if (vendor) await aguardarTarefa(vendor);
      const tarefas = [];
      const falhas = [];
      for (const id of ids) {
        try {
          const t = await instalarItem(id);
          if (t) tarefas.push(t);
        } catch (er) {
          falhas.push(er.message);
        }
      }
      if (ids.some((id) => c.itens.find((i) => i.id === id)?.tipo === 'zim')) await garantirKiwix();
      const fins = tarefas.length ? await esperarTarefas(tarefas, e, `Livros e manuais (${fmtGB(bytesPacote)})`) : [];
      const erros = fins.filter((f) => f.estado !== 'concluido').length + falhas.length;
      if (erros) return { estado: 'aviso', mensagem: `${ids.length - erros} de ${ids.length} baixados. ${erros} deram erro: em "Transferências", clique em "Tentar de novo".` };
      return { mensagem: `${ids.length} livros e manuais baixados.` };
    });

    await passo('preparar', async (e) => {
      e.mensagem = 'Descompactando, conferindo e preparando a busca…';
      while (iniciando()) await esperar(2000);
      iniciarProtocoloZero(contextoInicio());
      await esperar(1500);
      while (iniciando()) await esperar(2000);
      return { mensagem: 'Pronto para usar sem internet.' };
    });

    await salvarConfig({ configurado: true });
    pu.estado = pu.etapas.some((e) => e.estado === 'erro') ? 'erro' : 'concluido';
  })()
    .catch((e) => {
      pu.estado = 'erro';
      pu.erro = e.message;
      registrarErro('primeiro-uso', e);
    })
    .finally(() => (pu.fim = Date.now()));
  return pu;
}

rota('GET', /^\/api\/primeiro-uso$/, async (req, res) => json(res, 200, primeiroUso || { estado: 'parado', configurado: !!config.configurado }));
rota('POST', /^\/api\/primeiro-uso$/, async (req, res) => json(res, 200, iniciarPrimeiroUso()));

// ---------- novidades do catálogo ----------
/**
 * Baixa o catálogo publicado e, dos itens NOVOS, baixa os do pacote que o usuário usa.
 * Não apaga, troca nem baixa de novo nada do que o usuário já tem (nem se a fonte acabou).
 */
async function baixarNovidadesCatalogo({ sinal } = {}) {
  const r = await atualizarCatalogo({ sinal });
  if (r.semFonte) return { semFonte: true, novos: [], baixados: [], falhas: [], semEspaco: [] };
  cacheIA.dados = null;
  const { baixar, pacote, semEspaco } = await escolherNovos(r.novos, config);
  const tarefas = [];
  const falhas = [];
  for (const it of baixar) {
    try {
      const t = await instalarItem(it.id);
      if (t) tarefas.push([it, t]);
    } catch (e) {
      falhas.push(`${it.titulo}: ${e.message}`);
    }
  }
  if (baixar.length) await salvarConfig({ itens: [...new Set([...(config.itens || []), ...baixar.map((i) => i.id)])] });
  if (baixar.some((i) => i.tipo === 'zim')) await garantirKiwix();
  const baixados = [];
  for (const [it, t] of tarefas) {
    const fim = await aguardarTarefa(t);
    if (fim.estado === 'concluido') baixados.push(it.titulo);
    else falhas.push(`${it.titulo}: ${fim.mensagem}`);
  }
  if (baixados.length) {
    if (baixar.some((i) => i.tipo === 'zim')) agendarReinicioKiwix();
    try {
      iniciarProtocoloZero(contextoInicio()); // descompacta e prepara a busca, sem internet
    } catch {}
  }
  return {
    versao: r.versao, novos: r.novos.map((i) => i.titulo), pacote, baixados, falhas,
    semEspaco: semEspaco.map((i) => i.titulo), descontinuados: r.descontinuados || 0,
  };
}

// ---------- atualização automática ----------
const MODO_AUTO = process.argv.includes('--atualizar-sozinho');
let ultimaAtividade = 0; // última vez que alguém usou a página
let kiwixLigado = !MODO_AUTO;
function marcarAtividade() {
  ultimaAtividade = Date.now();
  if (!kiwixLigado) {
    kiwixLigado = true;
    iniciarKiwix().catch((e) => console.error('[kiwix]', e.message));
  }
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
let execucaoAuto = null;

/** Faz o mesmo que o botão "Atualizar", sem ninguém clicar. Só itens do catálogo e o programa; nunca os arquivos do usuário. */
function rodarAutomatico({ forcar = false } = {}) {
  execucaoAuto ??= (async () => {
    const inicio = Date.now();
    if (!forcar && !(await auto.podeRodar())) return null;
    // A rede costuma demorar a subir logo depois de ligar o computador.
    let online = false;
    for (let i = 0; i < 20 && !(online = await temInternet()); i++) await esperar(30000);
    if (!online) {
      const r = { inicio, fim: Date.now(), estado: 'sem-internet', mensagem: 'Sem internet ao ligar o computador. Tenta de novo na próxima vez.' };
      await auto.guardarResultado(r);
      return r;
    }
    while (atualizando() || iniciando()) await esperar(5000);
    let nov;
    try {
      nov = await baixarNovidadesCatalogo();
    } catch (e) {
      nov = { erro: `Não foi possível consultar o catálogo publicado: ${e.message}`, novos: [], baixados: [], falhas: [], semEspaco: [] };
    }
    let modelo = null;
    if (config.autoAtualizar?.modelos && (await ollamaOnline())) {
      const av = await avaliacaoIA(true).catch(() => null);
      if (av?.sugestao?.tipo === 'melhorar') {
        try {
          const u = await usarRecomendado();
          if (u.tarefa) {
            const t = await aguardarTarefa(u.tarefa);
            modelo = t.estado === 'concluido' ? `Assistente passou a usar ${u.modelo}` : `Não foi possível baixar ${u.modelo}: ${t.mensagem}`;
          } else modelo = `Assistente passou a usar ${u.modelo}`;
        } catch (e) {
          modelo = `Não foi possível trocar o modelo de IA: ${e.message}`;
        }
      }
    }
    while (iniciando() || haTarefasAtivas()) await esperar(5000); // descompactar e preparar a busca
    const r = {
      inicio, fim: Date.now(), visto: false,
      estado: nov.erro || (nov.falhas.length && !nov.baixados.length) ? 'erro' : nov.falhas.length || nov.semEspaco.length ? 'aviso' : 'ok',
      semFonte: !!nov.semFonte, erro: nov.erro || null, versao: nov.versao || null,
      novos: nov.novos, baixados: nov.baixados, falhas: nov.falhas, semEspaco: nov.semEspaco,
      pacote: nov.pacote?.nome || null, baixou: nov.baixados.length, modelo,
    };
    await auto.guardarResultado(r);
    return r;
  })().finally(() => (execucaoAuto = null));
  return execucaoAuto;
}

/** Modo --atualizar-sozinho: atualiza e fecha quando ninguém estiver usando (se alguém abrir, continua aberto). */
async function cicloAutomatico() {
  await rodarAutomatico().catch((e) => console.error('[auto]', e.message));
  const OCIOSO = 5 * 60 * 1000;
  for (;;) {
    if (!haTarefasAtivas() && !iniciando() && !atualizando() && Date.now() - ultimaAtividade > OCIOSO) {
      await pararKiwix().catch(() => {});
      process.exit(0);
    }
    await esperar(60000);
  }
}

let servidorHttp = null;
const relogiosProcura = [];

/**
 * Troca este processo por um novo, com a versão do programa que acabou de ser instalada.
 * O primeiro processo (o que o "Iniciar Protocolo Zero" abriu) fica só cuidando dos reinícios: inicia
 * o novo processo e, se ele pedir para reiniciar de novo (código 75), inicia outro.
 * Assim nunca se acumulam processos parados.
 */
const CODIGO_REINICIAR = 75;
async function reiniciarProcesso() {
  console.log('\n  Reiniciando o Protocolo Zero com a versão nova…\n');
  for (const r of relogiosProcura) clearTimeout(r);
  await pararKiwix().catch(() => {});
  await new Promise((r) => {
    servidorHttp.close(() => r());
    servidorHttp.closeAllConnections?.();
  });
  fs.rmSync(ARQ_INSTANCIA, { force: true });
  // Já é um processo reiniciado: o primeiro processo inicia o próximo.
  if (process.env.PZ_REINICIADO === '1') process.exit(CODIGO_REINICIAR);
  const args = [...process.execArgv, ...process.argv.slice(1).filter((a) => a !== '--sem-navegador'), '--sem-navegador'];
  const iniciar = () => {
    const filho = spawn(process.execPath, args, { cwd: RAIZ, stdio: 'inherit', env: { ...process.env, PZ_REINICIADO: '1' } });
    filho.on('exit', (codigo) => (codigo === CODIGO_REINICIAR ? iniciar() : process.exit(codigo ?? 0)));
    filho.on('error', (e) => {
      console.error('  Não foi possível reiniciar:', e.message);
      process.exit(1);
    });
  };
  iniciar();
}

async function principal() {
  const [maior] = process.versions.node.split('.').map(Number);
  if (maior < 20) {
    console.error(`O Protocolo Zero precisa do Node.js 20 ou mais novo (você tem ${process.versions.node}).`);
    process.exit(1);
  }
  await garantirPastas();
  const aberta = await instanciaAberta();
  if (MODO_AUTO) {
    // Ao ligar o computador: só segue se o usuário ligou a opção e não atualizou nas últimas horas.
    await carregarConfig();
    if (!config.autoAtualizar?.ativo || !(await auto.podeRodar())) return;
    if (aberta) {
      // Já está aberto: pede para a janela aberta atualizar e sai.
      await fetch(`http://127.0.0.1:${aberta}/api/auto/rodar`, { method: 'POST', headers: { 'x-protocolo-zero': '1' } }).catch(() => {});
      return;
    }
  }
  if (aberta) {
    const url = `http://localhost:${aberta}`;
    console.log(`\n  O Protocolo Zero já está aberto em ${url} — abrindo o navegador.`);
    console.log('  (Para reiniciar, feche a outra janela do Protocolo Zero e rode "npm start" de novo.)\n');
    abrirNavegador(url);
    return;
  }
  await carregarConfig();
  await carregarCatalogo();

  const servidor = (servidorHttp = http.createServer((req, res) => {
    tratar(req, res).catch((e) => {
      console.error('[erro]', req.method, req.url, e);
      if (!res.headersSent) erro(res, e.status || 500, e.message || 'Erro interno');
      else res.end();
    });
  }));
  const candidatas = Array.from({ length: 11 }, (_, i) => PORTA_PADRAO + i).filter((p) => p !== PORTA_KIWIX);
  for (const [i, p] of candidatas.entries()) {
    try {
      porta = await escutar(servidor, p);
      definirOrigensApp(porta);
      break;
    } catch (e) {
      if (e.code !== 'EADDRINUSE' || i === candidatas.length - 1) throw e;
    }
  }
  await gravarJSON(ARQ_INSTANCIA, { porta, pid: process.pid, inicio: Date.now() }).catch(() => {});
  process.on('exit', () => {
    try {
      fs.rmSync(ARQ_INSTANCIA, { force: true });
    } catch {}
  });
  const url = `http://localhost:${porta}`;
  console.log(`\n  Protocolo Zero rodando em ${url}`);
  console.log(`  Dados em: ${DADOS}`);
  console.log('  Para encerrar, use "Fechar o Protocolo Zero" no menu do programa (ou Ctrl+C no terminal).\n');
  if (kiwixLigado) iniciarKiwix().catch((e) => console.error('[kiwix]', e.message));
  if (MODO_AUTO) {
    console.log('  Modo atualização automática: atualiza e fecha sozinho quando ninguém estiver usando.');
    cicloAutomatico();
  } else abrirNavegador(url);

  // Procura atualizações sozinho (só avisa; baixar depende do clique em "Atualizar").
  const procurar = () => verificarAtualizacoes(config).catch((e) => console.error('[atualizações]', e.message));
  relogiosProcura.push(setTimeout(procurar, 20000), setInterval(procurar, 6 * 3600 * 1000).unref());

  const encerrar = async () => {
    console.log('\n  Encerrando o Protocolo Zero…');
    await pararKiwix().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);
}

principal().catch((e) => {
  console.error('Falha ao iniciar:', e);
  // Sem janela preta: o "Iniciar Protocolo Zero" abre a tela "Configurando", que explica o problema.
  try {
    fs.mkdirSync(path.join(RAIZ, 'runtime'), { recursive: true });
    fs.writeFileSync(path.join(RAIZ, 'runtime', 'estado.js'), "window.PZ_ESTADO = { etapa: 'servidor' };\n");
  } catch {}
  process.exit(1);
});
