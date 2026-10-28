import { criarAcessoAgendado, criarRepositorio } from "../db/repositorio";
import type { ProcessoParaDatajud, ResultadoDatajud } from "../db/repositorio";
import type { Relogio } from "../djen/coleta";
import type { ClienteDatajud, RespostaDatajud } from "./cliente";
import { lerHits } from "./formato";
import { aliasDoTribunal } from "./tribunal";

// Atualização das movimentações pelo DataJud. Regras (docs/DATAJUD.md): termos v1.2 do CNJ limitam a 120 requisições por minuto;
// aqui o máximo é 1 por segundo, a rodada para diante de bloqueio, 5xx/rede são repetidos com espera crescente
// e quem foi consultado há pouco não é consultado de novo.

export const INTERVALO_MINIMO_MS = 1000;
export const TENTATIVAS = 3;
export const TENTATIVAS_MANUAL = 1;
export const ESPERA_BASE_MS = 2000;
/** Quem foi consultado há menos que isto não é consultado de novo pelo Cron. */
export const RECENTE_CRON_MS = 20 * 3_600_000;
/** Intervalo mínimo entre duas atualizações manuais do mesmo processo. */
export const INTERVALO_MANUAL_MS = 10 * 60_000;
/** Limites de uma rodada do Cron (o resto fica para a próxima, começando pelos nunca consultados e pelos mais antigos). */
export const ORCAMENTO_CRON_MS = 10 * 60_000;
export const MAX_REQUISICOES_CRON = 300;

export interface DepsDatajud {
  db: D1Database;
  cliente: ClienteDatajud;
  relogio: Relogio;
}

export interface ResultadoAtualizacao {
  resultado: ResultadoDatajud;
  /** Movimentos que ainda não estavam guardados. */
  novos: number;
  status: number | null;
  /** Texto técnico curto, só em erro ou bloqueio. */
  motivo?: string;
}

export interface ResultadoRodadaDatajud {
  processos: number;
  ok: number;
  nao_encontrado: number;
  sem_tribunal: number;
  erro: number;
  bloqueado: boolean;
  /** Ficaram para a próxima rodada (orçamento esgotado ou rodada parada por bloqueio). */
  adiados: number;
  novos: number;
  requisicoes: number;
}

/** Garante, no mínimo, 1 s entre o início de duas requisições. */
class Limitador {
  private ultimo: number | null = null;
  constructor(private readonly relogio: Relogio) {}
  async esperar(): Promise<void> {
    if (this.ultimo !== null) {
      const falta = this.ultimo + INTERVALO_MINIMO_MS - this.relogio.agora();
      if (falta > 0) await this.relogio.dormir(falta);
    }
    this.ultimo = this.relogio.agora();
  }
}

const repetivel = (r: RespostaDatajud) => r.tipo === "erro" && (r.status === null || r.status >= 500);

export class RodadaDatajud {
  private readonly limitador: Limitador;
  requisicoes = 0;
  constructor(readonly deps: DepsDatajud) {
    this.limitador = new Limitador(deps.relogio);
  }

  /** Uma consulta: respeita o intervalo e repete com espera crescente (2 s, 4 s) só em 5xx/rede. */
  async consultar(alias: string, numeroCnj: string, tentativas: number): Promise<RespostaDatajud> {
    let ultima: RespostaDatajud = { tipo: "erro", status: null, motivo: "sem_tentativa" };
    for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
      await this.limitador.esperar();
      this.requisicoes += 1;
      ultima = await this.deps.cliente.consultar(alias, numeroCnj);
      if (ultima.tipo === "ok" || !repetivel(ultima) || tentativa === tentativas) return ultima;
      await this.deps.relogio.dormir(ESPERA_BASE_MS * 2 ** (tentativa - 1));
    }
    return ultima;
  }
}

/** Consulta o processo no DataJud e grava a situação e os movimentos novos. Só olha o escritório informado. */
export async function atualizarProcesso(rodada: RodadaDatajud, tenantId: string, processoId: string, numeroCnj: string, tentativas: number): Promise<ResultadoAtualizacao> {
  const { db, relogio } = rodada.deps;
  const repo = criarRepositorio(db, tenantId);
  const alias = aliasDoTribunal(numeroCnj);
  const registrar = (resultado: ResultadoDatajud, status: number | null, extra: { observacao?: string | null; ultima_atualizacao_fonte?: string | null; classe?: string | null; orgao?: string | null; grau?: string | null } = {}) =>
    repo.datajud.registrarConsulta(processoId, { consultado_em: new Date(relogio.agora()).toISOString(), resultado, status_http: status, alias, ...extra });

  if (!alias) {
    await registrar("sem_tribunal", null);
    return { resultado: "sem_tribunal", novos: 0, status: null };
  }
  const r = await rodada.consultar(alias, numeroCnj, tentativas);
  if (r.tipo === "bloqueado") {
    await registrar("bloqueado", r.status, { observacao: r.motivo.slice(0, 200) });
    return { resultado: "bloqueado", novos: 0, status: r.status, motivo: r.motivo };
  }
  if (r.tipo === "erro") {
    await registrar("erro", r.status, { observacao: r.motivo.slice(0, 200) });
    return { resultado: "erro", novos: 0, status: r.status, motivo: r.motivo };
  }
  const lido = await lerHits(r.hits, numeroCnj);
  if (lido.hits_lidos === 0) {
    // Lista vazia = o DataJud não tem o processo (ou ele é sigiloso). Hits que não deu para ler = formato inesperado.
    const vazio = r.hits.length === 0;
    if (vazio) {
      await registrar("nao_encontrado", r.status);
      return { resultado: "nao_encontrado", novos: 0, status: r.status };
    }
    await registrar("erro", r.status, { observacao: "hits_ilegiveis" });
    return { resultado: "erro", novos: 0, status: r.status, motivo: "hits_ilegiveis" };
  }
  const novos = await repo.datajud.inserirMovimentos(processoId, lido.movimentos);
  await registrar("ok", r.status, { ultima_atualizacao_fonte: lido.ultima_atualizacao_fonte, classe: lido.classe, orgao: lido.orgao, grau: lido.grau });
  return { resultado: "ok", novos, status: r.status };
}

/**
 * Percorre os processos recebidos, em ordem. Falha de um processo não derruba os outros; bloqueio (401, 403, 429, redirecionamento,
 * não-JSON) PARA a rodada inteira. Se o orçamento de tempo ou de requisições acabar, os restantes ficam para a próxima rodada.
 */
export async function executarRodadaDatajud(deps: DepsDatajud, alvos: ProcessoParaDatajud[], opcoes: { orcamentoMs: number; maxRequisicoes: number }): Promise<ResultadoRodadaDatajud> {
  const rodada = new RodadaDatajud(deps);
  const inicio = deps.relogio.agora();
  const r: ResultadoRodadaDatajud = { processos: alvos.length, ok: 0, nao_encontrado: 0, sem_tribunal: 0, erro: 0, bloqueado: false, adiados: 0, novos: 0, requisicoes: 0 };
  for (const alvo of alvos) {
    if (r.bloqueado || deps.relogio.agora() - inicio >= opcoes.orcamentoMs || rodada.requisicoes >= opcoes.maxRequisicoes) {
      r.adiados += 1;
      continue;
    }
    try {
      const d = await atualizarProcesso(rodada, alvo.tenant_id, alvo.processo_id, alvo.numero_cnj, TENTATIVAS);
      r.novos += d.novos;
      if (d.resultado === "bloqueado") r.bloqueado = true;
      else r[d.resultado] += 1;
    } catch (e) {
      // Falha ao falar com o banco (ex.: processo apagado no meio da rodada): registra e segue.
      r.erro += 1;
      console.error("datajud-atualizacao-falha", e instanceof Error ? e.name : "desconhecido");
    }
  }
  r.requisicoes = rodada.requisicoes;
  return r;
}

/** Cron: processos ativos de escritórios em operação, nunca consultados primeiro e depois os mais antigos (até o limite da rodada). */
export async function coletaDiariaDatajud(deps: DepsDatajud): Promise<ResultadoRodadaDatajud> {
  const agora = deps.relogio.agora();
  const lista = await criarAcessoAgendado(deps.db).processosParaDatajud(MAX_REQUISICOES_CRON, new Date(agora - RECENTE_CRON_MS).toISOString(), agora);
  const r = await executarRodadaDatajud(deps, lista, { orcamentoMs: ORCAMENTO_CRON_MS, maxRequisicoes: MAX_REQUISICOES_CRON });
  // Só números: nenhum número de processo nem dado de escritório no log.
  console.log("datajud-coleta", JSON.stringify(r));
  return r;
}

/** Atualização pedida por um usuário (um processo do escritório da sessão). */
export async function atualizarAgora(deps: DepsDatajud, tenantId: string, processoId: string, numeroCnj: string): Promise<ResultadoAtualizacao> {
  return atualizarProcesso(new RodadaDatajud(deps), tenantId, processoId, numeroCnj, TENTATIVAS_MANUAL);
}
