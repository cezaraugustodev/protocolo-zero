// "Iniciar Protocolo Zero": descompacta os pacotes baixados e deixa tudo pronto para uso — SEM internet.
// Downloads e atualizações ficam no "Atualizar" (atualizar.js). Quando algo só pode ser resolvido com
// internet, o passo vira um aviso com o botão "Atualizar pela internet".
// Cada passo só executa ações de uma lista fixa (descompactar, restaurar cópia, ligar serviço…).
// Nada aqui executa comandos vindos da IA ou de conteúdo baixado.
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { DADOS, PASTAS, PLATAFORMA, garantirPastas, existe, errosRecentes, registrarErro } from './util.js';
import { espacoEmDisco, detectarHardware } from './hardware.js';
import { carregarCatalogo } from './catalogo.js';
import { vendorInstalado, caminhoKiwixServe, ligarOllama, ollamaInstalado } from './ferramentas.js';
import { statusOllama, ollamaOnline, medirVelocidade, conversar } from './ollama.js';
import { iniciarKiwix, pararKiwix, kiwixAtivo, livrosKiwix } from './kiwix.js';
import { estatisticasIndice, documentosIndexados } from './indice.js';
import { avaliarIA, registrarVelocidade, velocidade, escolherModelo, semTag } from './inteligencia.js';
import * as bib from './biblioteca.js';
import * as pacotes from './pacotes.js';
import { criarExecutor } from './relatorio.js';

const ARQ_RELATORIO = path.join(DADOS, 'relatorio-inicio.json');
const GB = 1024 ** 3;

const PASSOS = [
  ['pastas', 'Pastas e espaço em disco'],
  ['pacotes', 'Descompactar pacotes baixados'],
  ['conteudo', 'Conferir arquivos'],
  ['componentes', 'Componentes de leitura (PDF e mapas)'],
  ['ollama', 'Motor de IA (Ollama)'],
  ['modelos', 'Modelos de IA'],
  ['enciclopedias', 'Enciclopédias offline (Kiwix)'],
  ['busca', 'Índice de busca'],
  ['teste', 'Teste final do assistente'],
];

const executor = criarExecutor({ nome: 'iniciar', arquivo: ARQ_RELATORIO, passos: PASSOS, explicar: (m) => explicarSemIA(m) });
export const relatorioAtual = executor.atual;
export const iniciando = executor.rodando;
export const cancelarInicio = executor.cancelar;

/** Mensagem do passo "Índice de busca", calculada com o estado atual (PDFs lidos pelo navegador). */
async function situacaoBusca() {
  const itens = await bib.listar();
  const pdfsPendentes = itens.filter((i) => i.tipo === 'pdf' && !i.indexado && !i.falhaIndexacao).length;
  const e = await estatisticasIndice();
  const msg = `${e.documentos} documento(s), ${e.trechos.toLocaleString('pt-BR')} trechos`;
  if (pdfsPendentes) return { estado: 'aviso', mensagem: `${msg}. ${pdfsPendentes} PDF(s) ainda serão lidos — mantenha esta página aberta por alguns minutos.` };
  return { estado: 'ok', mensagem: `${msg}. Todos os PDFs foram lidos; a busca inteligente continua sendo preparada em segundo plano.` };
}

/** Chamado quando o navegador termina (ou desiste) de ler um PDF: o aviso do Iniciar não fica parado no passado. */
export async function atualizarPassoBusca() {
  const rel = await executor.atual();
  const p = rel?.passos?.find((x) => x.id === 'busca');
  if (!p || p.estado !== 'aviso') return;
  await executor.atualizarPasso('busca', await situacaoBusca());
}

const ACAO_ATUALIZAR = { tipo: 'atualizar', rotulo: 'Atualizar pela internet' };
/** Resultado de passo para algo que só se resolve baixando (o Iniciar nunca usa a internet). */
const precisaInternet = (mensagem, detalhes) => ({ estado: 'aviso', mensagem, acao: ACAO_ATUALIZAR, ...(detalhes ? { detalhes } : {}) });

/** Traduz erros técnicos em explicações simples (funciona mesmo sem IA). */
export function explicarSemIA(msg = '') {
  const m = String(msg);
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo|fetch failed|ECONNRESET|ECONNREFUSED|network|socket hang up/i.test(m))
    return 'Parece que a internet caiu ou está instável. O que já foi baixado fica guardado: conecte-se e clique em "Atualizar" de novo para continuar de onde parou.';
  if (/travado|ETIMEDOUT|timeout|Tempo esgotado/i.test(m))
    return 'A conexão ficou parada por muito tempo. Pode ser internet lenta ou o servidor de origem sobrecarregado. Tente de novo mais tarde; o download continua de onde parou.';
  if (/ENOSPC|no space/i.test(m)) return 'O disco está cheio. Libere espaço (ou escolha menos conteúdo) e tente de novo.';
  if (/corrompido|Z_DATA_ERROR|incompleto/i.test(m)) return 'Um pacote baixado está danificado. Use "Atualizar" para baixá-lo de novo; o resto continua funcionando.';
  if (/EACCES|EPERM|EBUSY|operation not permitted|access is denied/i.test(m))
    return 'O sistema bloqueou o acesso a um arquivo. Feche programas que possam estar usando a pasta "dados" e verifique se o antivírus não está bloqueando o Protocolo Zero.';
  if (/HTTP 404|HTTP 410|página em vez do arquivo|link pode ter mudado/i.test(m))
    return 'O arquivo mudou de endereço na internet. Tente "Atualizar" mais tarde ou remova este item da seleção.';
  if (/HTTP 5\d\d|HTTP 429/i.test(m)) return 'O site de origem está com problemas no momento. Tente de novo mais tarde.';
  if (/Ollama/i.test(m)) return 'O motor de IA (Ollama) não está respondendo. Abra o aplicativo Ollama; se ele não estiver instalado, use "Atualizar" para instalar.';
  return 'Ocorreu um erro inesperado. Clique em "Pedir ajuda à IA" para uma explicação, ou tente de novo.';
}

/**
 * Executa o Iniciar (sem internet). `ctx` traz funções do servidor principal:
 * { config, salvarConfig, indexarNoServidor, agendarVetorizacao }
 */
export function iniciarProtocoloZero(ctx) {
  return executor.iniciar(({ rodar, sinal }) => executar(rodar, ctx, sinal));
}

async function executar(rodar, ctx, sinal) {
  // 1. pastas e disco (inclui o espaço necessário para descompactar)
  await rodar('pastas', async () => {
    await garantirPastas();
    const teste = path.join(PASTAS.tmp, `.teste-${Date.now()}`);
    await fsp.writeFile(teste, 'ok');
    await fsp.rm(teste, { force: true });
    const d = await espacoEmDisco();
    const precisa = (await pacotes.pendentes()).filter((p) => p.formato === 'gz').reduce((a, p) => a + (p.tamanho || 0), 0);
    if (d.livre < precisa + 0.5 * GB) {
      return { estado: 'erro', mensagem: `Falta espaço para descompactar: libere mais ${((precisa + 0.5 * GB - d.livre) / GB).toFixed(1)} GB no disco e clique em Iniciar de novo.` };
    }
    if (d.livre < 5 * GB) return { estado: 'aviso', mensagem: `Pouco espaço: ${(d.livre / GB).toFixed(1)} GB livres.` };
    return { mensagem: `${(d.livre / GB).toFixed(0)} GB livres em ${DADOS}` };
  });

  // 2. descompacta os pacotes baixados pelo "Atualizar" (e .zip/.tar.gz colocados na pasta de pacotes)
  await rodar('pacotes', async (p) => {
    const detalhes = [];
    const imp = await pacotes.importarPacotesDeArquivos({ onPacote: (n) => (p.mensagem = `Abrindo o pacote ${n}…`) });
    detalhes.push(...imp.falhas);
    const lista = await pacotes.pendentes();
    const extra = imp.arquivos ? ` · ${imp.arquivos} arquivo(s) importado(s) de ${imp.pacotes} pacote(s) .zip/.tar.gz` : '';
    if (!lista.length) {
      if (imp.falhas.length) return { estado: 'aviso', mensagem: `Não foi possível abrir ${imp.falhas.length} pacote(s).${extra}`, detalhes };
      if (imp.arquivos) return { mensagem: extra.slice(3) };
      const r = await pacotes.resumoPacotes();
      return { mensagem: `Nenhum pacote novo${r.guardados ? ` · ${r.guardados} cópia(s) compactada(s) guardada(s) para reparo` : ''}` };
    }
    // No Windows o leitor mantém os ZIMs abertos: fecha antes de trocar (o passo "Enciclopédias" reabre).
    if (lista.some((x) => x.registro.tipo === 'zim')) await pararKiwix().catch(() => {});
    const total = lista.reduce((a, x) => a + (x.tamanho || 0), 0);
    let feitos = 0;
    let bytesFeitos = 0;
    let falhas = 0;
    for (const pk of lista) {
      if (sinal.aborted) return;
      const nome = pk.registro.titulo;
      p.mensagem = `Descompactando ${feitos + 1} de ${lista.length}: ${nome}`;
      try {
        await pacotes.instalar(pk, { sinal, onBytes: (n) => (p.progresso = total ? Math.min(1, (bytesFeitos + n) / total) : null) });
      } catch (e) {
        if (sinal.aborted) return;
        falhas++;
        detalhes.push(`${nome}: ${e.message}`);
        await registrarErro('iniciar/pacotes', e);
      }
      bytesFeitos += pk.tamanho || 0;
      feitos++;
      p.progresso = total ? bytesFeitos / total : null;
    }
    delete p.progresso;
    const txt = `${lista.length - falhas} de ${lista.length} pacote(s) descompactado(s) e instalado(s)${extra}`;
    if (falhas || imp.falhas.length) {
      return {
        estado: falhas === lista.length ? 'erro' : 'aviso',
        mensagem: `${txt}. ${explicarSemIA(detalhes[0])}`,
        detalhes,
        ...(detalhes.some((d) => /corromp|incompleto|danific/i.test(d)) ? { acao: ACAO_ATUALIZAR } : {}),
      };
    }
    return { mensagem: txt };
  });

  // 3. confere cada arquivo; restaura da cópia compactada o que sumiu ou corrompeu
  await rodar('conteudo', async (p) => {
    const itens = await bib.listar();
    const restaurados = [];
    const faltando = [];
    const seusSumidos = [];
    let copias = 0;
    for (const it of itens) {
      if (sinal.aborted) return;
      if (await arquivoIntegro(it)) {
        try {
          p.mensagem = `Conferindo ${it.titulo}…`;
          if (await pacotes.criarCopia(it, sinal)) copias++;
        } catch (e) {
          await registrarErro('iniciar/copia', e);
        }
        continue;
      }
      p.mensagem = `Restaurando ${it.titulo} da cópia compactada…`;
      try {
        if (await pacotes.restaurar(it, { sinal })) {
          restaurados.push(it.titulo);
          continue;
        }
      } catch (e) {
        await registrarErro('iniciar/restaurar', e);
      }
      (it.origem === 'catalogo' ? faltando : seusSumidos).push(it.titulo);
    }
    const instalados = new Set(itens.map((i) => i.id));
    const aguardando = new Set((await pacotes.pendentes()).map((x) => x.id));
    const naoBaixados = (ctx.config.itens || []).filter((id) => !instalados.has(id) && !aguardando.has(id));

    const partes = [`${itens.length} arquivo(s) conferido(s)`];
    if (restaurados.length) partes.push(`${restaurados.length} restaurado(s) da cópia compactada`);
    if (copias) partes.push(`${copias} cópia(s) de segurança compactada(s) criada(s)`);
    const detalhes = [
      ...faltando.map((t) => `Danificado ou ausente, sem cópia: ${t}`),
      ...seusSumidos.map((t) => `Seu arquivo não foi encontrado: ${t}`),
      ...(naoBaixados.length ? [`${naoBaixados.length} item(ns) selecionado(s) ainda não baixado(s): ${naoBaixados.slice(0, 8).join(', ')}`] : []),
    ];
    if (faltando.length || naoBaixados.length) {
      const n = faltando.length + naoBaixados.length;
      return precisaInternet(`${partes.join(' · ')}. ${n} item(ns) ainda precisam ser baixados — use "Atualizar" quando houver internet.`, detalhes);
    }
    if (seusSumidos.length) {
      return { estado: 'aviso', mensagem: `${partes.join(' · ')}. ${seusSumidos.length} arquivo(s) seu(s) não foram encontrados: ${seusSumidos.slice(0, 3).join(', ')}`, detalhes };
    }
    return { mensagem: partes.join(' · ') };
  });

  // 4. componentes do navegador (leitor de PDF e de mapas)
  await rodar('componentes', async () => {
    if (await vendorInstalado()) return { mensagem: 'Prontos' };
    return precisaInternet('Os componentes que mostram PDFs e mapas ainda não foram baixados. O resto funciona normalmente.');
  });

  // 5. Ollama: liga se estiver desligado (instalar exige internet → Atualizar)
  await rodar('ollama', async (p) => {
    if (await ollamaOnline()) return { mensagem: `Rodando (v${(await statusOllama()).versao})` };
    if (await ollamaInstalado()) {
      p.mensagem = 'Ligando o Ollama…';
      if (await ligarOllama(ollamaOnline)) return { mensagem: 'Estava desligado — foi ligado automaticamente' };
      throw new Error('O Ollama está instalado, mas não respondeu ao ser ligado');
    }
    if (PLATAFORMA === 'linux') {
      return { estado: 'aviso', mensagem: 'O Ollama não está instalado. Com internet, rode no terminal: curl -fsSL https://ollama.com/install.sh | sh — e clique em Iniciar de novo.' };
    }
    return precisaInternet('O motor de IA ainda não está instalado. A biblioteca funciona sem ele; o assistente precisa dele.');
  });

  // 6. modelos: usa os instalados, mede a velocidade e avalia se vale trocar
  await rodar('modelos', async (p) => {
    if (!(await ollamaOnline())) return { estado: 'pulado', mensagem: 'Sem o Ollama não é possível verificar os modelos' };
    const [hw, catalogo, st] = await Promise.all([detectarHardware(), carregarCatalogo(), statusOllama()]);
    const tem = (n) => !!n && st.modelos.some((m) => semTag(m.nome) === semTag(n));
    const chats = st.modelos.filter((m) => !/embed/i.test(m.nome));
    const embeds = st.modelos.filter((m) => /embed/i.test(m.nome));
    if (!ctx.config.modeloChat || !ctx.config.modeloEmbed) {
      const rec = await escolherModelo(hw, catalogo.modelos);
      if (!ctx.config.modeloChat) await ctx.salvarConfig({ modeloChat: chats[0]?.nome || rec.chat.tag });
      if (!ctx.config.modeloEmbed) await ctx.salvarConfig({ modeloEmbed: embeds[0]?.nome || rec.embed.tag });
    }
    if (!chats.length) return precisaInternet(`Nenhum modelo de conversa instalado. O "Atualizar" baixa o ${semTag(ctx.config.modeloChat)}.`);
    // O escolhido ainda não foi baixado? O assistente usa o que já existe enquanto isso.
    const emUso = tem(ctx.config.modeloChat) ? ctx.config.modeloChat : chats[0].nome;
    const faltam = [ctx.config.modeloChat, ctx.config.modeloEmbed].filter((n) => !tem(n));

    if ((await velocidade(emUso)) == null) {
      p.mensagem = `Medindo a velocidade de ${semTag(emUso)} neste computador…`;
      const stats = await medirVelocidade(emUso, AbortSignal.any([sinal, AbortSignal.timeout(180000)])).catch(() => null);
      await registrarVelocidade(emUso, stats);
    }
    const av = await avaliarIA({ hw, catalogo, status: st, config: { ...ctx.config, modeloChat: emUso } });
    const tps = av.atual?.velocidade;
    const base = `${semTag(emUso)} (${av.atual?.nivel || '?'})${tps ? ` · ${tps.toFixed(1)} palavras/s` : ''}`;
    if (faltam.length) {
      const enquanto = emUso !== ctx.config.modeloChat ? ` Enquanto isso, o assistente usa ${semTag(emUso)}.` : '';
      return precisaInternet(`${base}. Ainda falta baixar: ${faltam.map(semTag).join(', ')}.${enquanto}`);
    }
    if (av.sugestao) {
      return {
        estado: 'aviso',
        mensagem: `${base}. ${av.sugestao.titulo}. ${av.sugestao.texto}`,
        acao: { tipo: 'usar-recomendado', tag: av.sugestao.tag, rotulo: av.sugestao.baixar ? `Baixar e usar ${av.sugestao.nome}` : `Usar ${av.sugestao.nome}`, tamanho: av.sugestao.baixar ? av.sugestao.tamanho : 0 },
      };
    }
    return { mensagem: `${base} — o melhor para este computador` };
  });

  // 7. Kiwix
  await rodar('enciclopedias', async (p) => {
    const zims = (await bib.listar()).filter((i) => i.tipo === 'zim');
    if (!zims.length) return { estado: 'pulado', mensagem: 'Nenhuma enciclopédia instalada' };
    if (!(await existe(caminhoKiwixServe()))) return precisaInternet(`${zims.length} enciclopédia(s) prontas, mas o leitor Kiwix ainda não foi baixado.`);
    p.mensagem = 'Abrindo as enciclopédias…';
    await iniciarKiwix();
    if (!kiwixAtivo()) throw new Error('O leitor Kiwix não iniciou');
    return { mensagem: `${livrosKiwix().length} de ${zims.length} enciclopédia(s) abertas` };
  });

  // 8. índice de busca
  await rodar('busca', async () => {
    const itens = await bib.listar();
    const idx = await documentosIndexados();
    for (const it of itens) if (['texto', 'epub'].includes(it.tipo) && (!idx.has(it.id) || !it.indexado)) await ctx.indexarNoServidor(it.id);
    ctx.agendarVetorizacao();
    return situacaoBusca();
  });

  // 9. teste final
  await rodar('teste', async () => {
    if (!(await ollamaOnline())) return { estado: 'pulado', mensagem: 'Assistente indisponível (sem o motor de IA)' };
    const st = await statusOllama();
    const chats = st.modelos.filter((m) => !/embed/i.test(m.nome));
    const modelo = chats.find((m) => semTag(m.nome) === semTag(ctx.config.modeloChat || ''))?.nome || chats[0]?.nome;
    if (!modelo) return { estado: 'pulado', mensagem: 'Nenhum modelo de conversa instalado' };
    const t0 = Date.now();
    let texto = '';
    const stats = await conversar({
      modelo,
      mensagens: [{ role: 'user', content: 'Responda apenas: OK' }],
      onTexto: (x) => (texto += x),
      opcoes: { num_predict: 8, num_ctx: 1024 },
      sinal: AbortSignal.any([sinal, AbortSignal.timeout(120000)]),
    });
    await registrarVelocidade(modelo, stats);
    if (!texto.trim()) throw new Error('O assistente não respondeu (Ollama)');
    return { mensagem: `O assistente respondeu em ${((Date.now() - t0) / 1000).toFixed(1)} s` };
  });
}

/** Confere se o arquivo registrado existe e tem o tamanho esperado. */
async function arquivoIntegro(it) {
  try {
    const st = await fsp.stat(bib.caminhoAbsoluto(it));
    if (!st.isFile() || st.size === 0) return false;
    if (it.tamanho && Math.abs(st.size - it.tamanho) > Math.max(1024, it.tamanho * 0.001)) return false;
    return true;
  } catch {
    return false;
  }
}

/** Monta o texto que a IA local usa para explicar os problemas encontrados. */
export async function contextoDiagnostico(rel) {
  const d = await espacoEmDisco().catch(() => ({}));
  const problemas = (rel?.passos || []).filter((p) => ['erro', 'aviso'].includes(p.estado));
  const erros = await errosRecentes(12);
  return [
    `Sistema: ${PLATAFORMA} ${os.release()} (${os.arch()}), Node ${process.versions.node}, RAM ${(os.totalmem() / GB).toFixed(1)} GB, disco livre ${d.livre ? (d.livre / GB).toFixed(1) : '?'} GB.`,
    '',
    'Problemas da última verificação:',
    ...(problemas.length ? problemas.map((p) => `- ${p.titulo} [${p.estado}]: ${p.erroTecnico || p.mensagem}${p.detalhes ? ` | ${p.detalhes.slice(0, 5).join(' | ')}` : ''}`) : ['- nenhum']),
    '',
    'Erros recentes no registro:',
    ...(erros.length ? erros.map((e) => `- ${e.quando} ${e.contexto}: ${e.mensagem}`) : ['- nenhum']),
  ].join('\n');
}
