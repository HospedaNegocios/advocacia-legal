import { FUSO_PADRAO, hojeEm, somarDias } from "../../comum/fuso";
import { criarAcessoAgendado, criarRepositorio } from "../db/repositorio";
import type { NovaIntimacao, OabParaColetar, ResultadoDjen } from "../db/repositorio";
import type { ClienteDjen, RespostaDjen } from "./cliente";
import { normalizarItem } from "./formato";

// Coleta das publicações do DJEN. Regras (docs/DJEN.md): no máximo 1 requisição por segundo, parar diante de bloqueio,
// nunca pedir o mesmo dado duas vezes, itensPorPagina <= 50, repetir com espera crescente só em erro 5xx/rede.

export const INTERVALO_MINIMO_MS = 1000;
export const ITENS_POR_PAGINA = 50;
export const MAX_PAGINAS_POR_OAB = 40;
export const DIAS_PRIMEIRA_VEZ = 3;
export const DIAS_MAXIMO_JANELA = 30;
export const TENTATIVAS = 3;
export const ESPERA_BASE_MS = 2000;
/** Uma OAB com coleta concluída há menos que isto não é buscada de novo pelo Cron (proteção contra disparo duplo). */
export const RECENTE_MS = 30 * 60_000;
/** Limites de uma rodada do Cron (o resto fica para a próxima, começando pelas OABs coletadas há mais tempo). */
export const ORCAMENTO_CRON_MS = 10 * 60_000;
export const MAX_REQUISICOES_CRON = 300;
export const MAX_OABS_CRON = 500;
/** "Buscar agora" responde dentro da requisição do usuário: orçamento menor. */
export const ORCAMENTO_MANUAL_MS = 40_000;
export const MAX_REQUISICOES_MANUAL = 40;

export interface Relogio {
  agora(): number;
  dormir(ms: number): Promise<void>;
}

export const relogioReal: Relogio = {
  agora: () => Date.now(),
  dormir: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export interface DepsColeta {
  db: D1Database;
  cliente: ClienteDjen;
  relogio: Relogio;
}

export interface AlvoColeta {
  tenant_id: string;
  oab_id: string;
  numero: string;
  uf: string;
}

export interface OpcoesColeta {
  origem: "cron" | "manual";
  orcamentoMs: number;
  maxRequisicoes: number;
}

export interface ResultadoColeta {
  oabs: number;
  sucesso: number;
  erro: number;
  bloqueado: boolean;
  /** Já coletadas há pouco (só no Cron). */
  puladas: number;
  /** Ficaram para a próxima rodada (orçamento esgotado ou coleta parada por bloqueio). */
  adiadas: number;
  novas: number;
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

const repetivel = (r: RespostaDjen) => r.tipo === "erro" && (r.status === null || r.status >= 500);

/** Janela de datas (AAAA-MM-DD) a consultar: da última coleta bem-sucedida (repete o dia, pois publicações chegam depois) até hoje. */
export function janelaDeBusca(hoje: string, ultimaDataFim: string | null): { inicio: string; fim: string } {
  const minimo = somarDias(hoje, -DIAS_MAXIMO_JANELA);
  const padrao = somarDias(hoje, -DIAS_PRIMEIRA_VEZ);
  let inicio = ultimaDataFim && /^\d{4}-\d{2}-\d{2}$/.test(ultimaDataFim) ? ultimaDataFim : padrao;
  if (inicio < minimo) inicio = minimo;
  if (inicio > hoje) inicio = hoje;
  return { inicio, fim: hoje };
}

class Rodada {
  readonly limitador: Limitador;
  readonly cache = new Map<string, RespostaDjen>();
  requisicoes = 0;
  constructor(readonly deps: DepsColeta) {
    this.limitador = new Limitador(deps.relogio);
  }

  /** Uma consulta: respeita o intervalo, repete com espera crescente em 5xx/rede e não repete pedido já feito nesta rodada. */
  async consultar(p: Parameters<ClienteDjen["consultar"]>[0]): Promise<RespostaDjen> {
    const chave = JSON.stringify(p);
    const guardada = this.cache.get(chave);
    if (guardada) return guardada;
    let ultima: RespostaDjen = { tipo: "erro", status: null, motivo: "sem_tentativa" };
    for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
      await this.limitador.esperar();
      this.requisicoes += 1;
      ultima = await this.deps.cliente.consultar(p);
      if (ultima.tipo === "ok") {
        this.cache.set(chave, ultima);
        return ultima;
      }
      if (!repetivel(ultima) || tentativa === TENTATIVAS) return ultima;
      await this.deps.relogio.dormir(ESPERA_BASE_MS * 2 ** (tentativa - 1));
    }
    return ultima;
  }
}

type DesfechoOab = { resultado: ResultadoDjen; novas: number } | "pulada";

async function coletarOab(rodada: Rodada, alvo: AlvoColeta, opcoes: OpcoesColeta, hoje: string): Promise<DesfechoOab> {
  const { db, relogio } = rodada.deps;
  const repo = criarRepositorio(db, alvo.tenant_id);
  const ultima = await repo.djen.ultimaSucesso(alvo.oab_id);
  if (opcoes.origem === "cron" && ultima && relogio.agora() - Date.parse(ultima.concluida_em) < RECENTE_MS) return "pulada";

  const janela = janelaDeBusca(hoje, ultima?.data_fim ?? null);
  const execucao = await repo.djen.iniciar({ oab_id: alvo.oab_id, origem: opcoes.origem, data_inicio: janela.inicio, data_fim: janela.fim, iniciada_em: new Date(relogio.agora()).toISOString() });
  const contagem = { paginas: 0, lidos: 0, novos: 0 };
  let resultado: ResultadoDjen = "sucesso";
  let status: number | null = null;
  let observacao: string | null = null;
  try {
    let pagina = 1;
    for (;;) {
      const r = await rodada.consultar({ numeroOab: alvo.numero, ufOab: alvo.uf, dataInicio: janela.inicio, dataFim: janela.fim, pagina, itensPorPagina: ITENS_POR_PAGINA });
      if (r.tipo === "bloqueado") {
        resultado = "bloqueado";
        status = r.status;
        observacao = r.motivo;
        break;
      }
      if (r.tipo === "erro") {
        resultado = "erro";
        status = r.status;
        observacao = r.motivo;
        break;
      }
      status = r.status;
      contagem.paginas += 1;
      contagem.lidos += r.itens.length;
      const novos: NovaIntimacao[] = [];
      for (const bruto of r.itens) {
        const item = normalizarItem(bruto);
        if (item) novos.push(item);
      }
      contagem.novos += await repo.intimacoes.inserirDaColeta(alvo.oab_id, novos);
      const acabou = r.itens.length < ITENS_POR_PAGINA || (r.total !== null && contagem.lidos >= r.total);
      if (r.itens.length === 0 && r.total !== null && r.total > 0 && contagem.lidos < r.total) {
        resultado = "erro";
        observacao = "pagina_vazia_com_total";
        break;
      }
      if (acabou) break;
      if (pagina >= MAX_PAGINAS_POR_OAB) {
        observacao = "limite_paginas";
        break;
      }
      pagina += 1;
    }
  } catch (e) {
    resultado = "erro";
    observacao = `excecao_${e instanceof Error ? e.name : "desconhecida"}`.slice(0, 60);
  }
  await repo.djen
    .concluir(execucao, {
      resultado,
      http_status: status,
      paginas: contagem.paginas,
      itens_lidos: contagem.lidos,
      itens_novos: contagem.novos,
      observacao,
      concluida_em: new Date(relogio.agora()).toISOString(),
    })
    .catch(() => undefined);
  return { resultado, novas: contagem.novos };
}

/**
 * Coleta as OABs recebidas, em ordem. Falha de uma OAB não derruba as outras; bloqueio (403, 429, login, não-JSON) PARA tudo.
 * Se o orçamento de tempo ou de requisições acabar, as OABs restantes ficam para a próxima rodada.
 */
export async function executarColeta(deps: DepsColeta, alvos: AlvoColeta[], opcoes: OpcoesColeta): Promise<ResultadoColeta> {
  const rodada = new Rodada(deps);
  const inicio = deps.relogio.agora();
  const hoje = hojeEm(FUSO_PADRAO, inicio);
  const r: ResultadoColeta = { oabs: alvos.length, sucesso: 0, erro: 0, bloqueado: false, puladas: 0, adiadas: 0, novas: 0, requisicoes: 0 };
  for (const alvo of alvos) {
    if (r.bloqueado || deps.relogio.agora() - inicio >= opcoes.orcamentoMs || rodada.requisicoes >= opcoes.maxRequisicoes) {
      r.adiadas += 1;
      continue;
    }
    try {
      const d = await coletarOab(rodada, alvo, opcoes, hoje);
      if (d === "pulada") r.puladas += 1;
      else {
        r.novas += d.novas;
        if (d.resultado === "sucesso") r.sucesso += 1;
        else if (d.resultado === "erro") r.erro += 1;
        else r.bloqueado = true;
      }
    } catch (e) {
      // Falha ao falar com o banco (ex.: OAB removida): registra e segue para a próxima.
      r.erro += 1;
      console.error("djen-coleta-falha", e instanceof Error ? e.name : "desconhecido");
    }
  }
  r.requisicoes = rodada.requisicoes;
  return r;
}

/** Cron: todas as OABs ativas de escritórios em operação (até o limite da rodada). */
export async function coletaDiaria(deps: DepsColeta): Promise<ResultadoColeta> {
  const lista: OabParaColetar[] = await criarAcessoAgendado(deps.db).oabsParaColetar(MAX_OABS_CRON);
  const r = await executarColeta(deps, lista, { origem: "cron", orcamentoMs: ORCAMENTO_CRON_MS, maxRequisicoes: MAX_REQUISICOES_CRON });
  await vincularOrfasDosEscritorios(deps.db, lista);
  // Só números: nenhum texto de publicação nem dado de escritório no log.
  console.log("djen-coleta", JSON.stringify(r));
  return r;
}

/** Depois da coleta, liga ao processo as intimações órfãs dos escritórios tocados (cobre processos cadastrados entre uma rodada e outra). */
async function vincularOrfasDosEscritorios(db: D1Database, lista: OabParaColetar[]): Promise<void> {
  for (const tenantId of new Set(lista.map((x) => x.tenant_id))) {
    try {
      await criarRepositorio(db, tenantId).intimacoes.vincularOrfas();
    } catch {
      /* não derruba os outros escritórios */
    }
  }
}

/** "Buscar agora" de um escritório: só as OABs ativas dele. */
export async function buscarDoEscritorio(deps: DepsColeta, tenantId: string): Promise<ResultadoColeta & { semOabs: boolean }> {
  const repo = criarRepositorio(deps.db, tenantId);
  const oabs = await repo.oabs.listar({ ativo: 1 }, { limite: 200 });
  const alvos: AlvoColeta[] = oabs.map((o) => ({ tenant_id: tenantId, oab_id: o.id, numero: o.numero, uf: o.uf }));
  const r = await executarColeta(deps, alvos, { origem: "manual", orcamentoMs: ORCAMENTO_MANUAL_MS, maxRequisicoes: MAX_REQUISICOES_MANUAL });
  await repo.intimacoes.vincularOrfas().catch(() => 0);
  return { ...r, semOabs: alvos.length === 0 };
}
