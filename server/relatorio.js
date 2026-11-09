// Executor de verificações passo a passo com relatório ao vivo (usado pelo "Iniciar" e pelo "Atualizar").
import { lerJSON, gravarJSON, registrarErro } from './util.js';

/**
 * explicar(msg): traduz um erro técnico em orientação simples.
 * Cada passo devolve { estado?, mensagem?, acao?, detalhes? } ou lança um erro.
 */
export function criarExecutor({ nome, arquivo, passos, explicar }) {
  let execucao = null;
  let ctrl = null;

  const atual = async () => execucao || (await lerJSON(arquivo, null));
  const rodando = () => execucao?.estado === 'rodando';
  const cancelar = () => ctrl?.abort();

  function iniciar(executar, { aoTerminar } = {}) {
    if (rodando()) return execucao;
    ctrl = new AbortController();
    const sinal = ctrl.signal;
    const rel = (execucao = {
      tipo: nome,
      estado: 'rodando',
      inicio: Date.now(),
      passos: passos.map(([id, titulo]) => ({ id, titulo, estado: 'pendente', mensagem: '' })),
    });

    const rodar = async (id, fn) => {
      if (sinal.aborted) return;
      const p = rel.passos.find((x) => x.id === id);
      p.estado = 'rodando';
      p.inicio = Date.now();
      try {
        const r = (await fn(p)) || {};
        p.estado = r.estado || 'ok';
        p.mensagem = r.mensagem ?? p.mensagem;
        if (r.acao) p.acao = r.acao;
        if (r.detalhes) p.detalhes = r.detalhes;
      } catch (e) {
        if (sinal.aborted) return;
        p.estado = 'erro';
        p.erroTecnico = e?.message || String(e);
        p.mensagem = explicar(p.erroTecnico);
        await registrarErro(`${nome}/${id}`, e);
      } finally {
        p.fim = Date.now();
      }
    };

    executar({ rel, rodar, sinal })
      .catch((e) => registrarErro(nome, e))
      .finally(async () => {
        rel.estado = sinal.aborted ? 'cancelado' : 'concluido';
        rel.fim = Date.now();
        for (const p of rel.passos) {
          if (p.estado === 'pendente' || p.estado === 'rodando') Object.assign(p, { estado: 'pulado', mensagem: sinal.aborted ? 'Cancelado' : p.mensagem });
        }
        rel.resumo = {
          ok: rel.passos.filter((p) => p.estado === 'ok').length,
          avisos: rel.passos.filter((p) => p.estado === 'aviso').length,
          erros: rel.passos.filter((p) => p.estado === 'erro').length,
        };
        // Chamado antes de liberar o relatório, para o próximo passo (ex.: Iniciar) já estar rodando
        // quando a página perceber que este terminou.
        try {
          aoTerminar?.(rel);
        } catch (e) {
          registrarErro(`${nome}/fim`, e);
        }
        await gravarJSON(arquivo, rel).catch(() => {});
        if (execucao === rel) execucao = null;
      });
    return rel;
  }

  /** Atualiza um passo do último relatório já concluído (ex.: o índice terminou de ler os PDFs depois). */
  async function atualizarPasso(id, campos) {
    if (rodando()) return;
    const rel = await atual();
    const p = rel?.passos?.find((x) => x.id === id);
    if (!p) return;
    Object.assign(p, campos);
    if (rel.resumo) {
      rel.resumo = {
        ok: rel.passos.filter((x) => x.estado === 'ok').length,
        avisos: rel.passos.filter((x) => x.estado === 'aviso').length,
        erros: rel.passos.filter((x) => x.estado === 'erro').length,
      };
    }
    await gravarJSON(arquivo, rel).catch(() => {});
  }

  return { iniciar, atual, rodando, cancelar, atualizarPasso };
}
