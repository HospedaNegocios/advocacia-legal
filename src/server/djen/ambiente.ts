import { criarClienteHttp } from "./cliente";
import { relogioReal } from "./coleta";
import type { DepsColeta } from "./coleta";

// Dependências reais da coleta (rede e relógio). Os testes trocam por simuladas: a rede nunca é chamada nos testes.
let sobrescrita: Pick<DepsColeta, "cliente" | "relogio"> | null = null;

/** SOMENTE para testes. */
export function definirDepsDjenParaTeste(d: Pick<DepsColeta, "cliente" | "relogio"> | null): void {
  sobrescrita = d;
}

export function depsDjen(db: D1Database): DepsColeta {
  return { db, cliente: sobrescrita?.cliente ?? criarClienteHttp(), relogio: sobrescrita?.relogio ?? relogioReal };
}
