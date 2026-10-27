import type { Plano } from "./db/repositorio";

/** Limite de OABs ativas por plano (CLAUDE.md, planos aprovados). `null` = ilimitado. */
export function limiteDeOabs(plano: Plano): number | null {
  if (plano === "solo") return 1;
  if (plano === "escritorio") return 3;
  return null;
}

const NOME_PLANO: Record<Plano, string> = { solo: "Solo", escritorio: "Escritório", banca: "Banca" };

export function mensagemLimiteDeOabs(plano: Plano): string {
  const limite = limiteDeOabs(plano);
  return `O plano ${NOME_PLANO[plano]} permite ${limite} OAB${limite === 1 ? "" : "s"} ativa${limite === 1 ? "" : "s"}. Desative uma OAB ou peça a troca de plano para adicionar outra.`;
}
