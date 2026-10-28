import type { Env } from "../env";
import { relogioReal } from "../djen/coleta";
import { criarClienteHttp } from "./cliente";
import type { DepsDatajud } from "./atualizacao";

// Dependências reais do DataJud (rede e relógio). Os testes trocam por simuladas: a rede nunca é chamada nos testes.
// O recurso só liga com DATAJUD_ATIVO="true" E a chave (Worker secret DATAJUD_CHAVE). Em prod fica desligado (docs/DATAJUD.md).
let sobrescrita: Pick<DepsDatajud, "cliente" | "relogio"> | null = null;

/** SOMENTE para testes. Com valor, o recurso conta como ligado; com null, vale a configuração do ambiente. */
export function definirDepsDatajudParaTeste(d: Pick<DepsDatajud, "cliente" | "relogio"> | null): void {
  sobrescrita = d;
}

export function datajudAtivo(env: Pick<Env, "DATAJUD_ATIVO" | "DATAJUD_CHAVE">): boolean {
  if (sobrescrita) return true;
  return env.DATAJUD_ATIVO === "true" && typeof env.DATAJUD_CHAVE === "string" && env.DATAJUD_CHAVE.trim() !== "";
}

/** Nulo se o recurso está desligado. */
export function depsDatajud(env: Pick<Env, "DB" | "DATAJUD_ATIVO" | "DATAJUD_CHAVE">): DepsDatajud | null {
  if (!datajudAtivo(env)) return null;
  return { db: env.DB, cliente: sobrescrita?.cliente ?? criarClienteHttp((env.DATAJUD_CHAVE as string).trim()), relogio: sobrescrita?.relogio ?? relogioReal };
}
