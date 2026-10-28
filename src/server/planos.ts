import type { Plano } from "./db/repositorio";

/** Limite de OABs ativas por plano (CLAUDE.md, planos aprovados). `null` = ilimitado. */
export function limiteDeOabs(plano: Plano): number | null {
  if (plano === "solo") return 1;
  if (plano === "escritorio") return 3;
  return null;
}

/** Limite de usuários por plano (CLAUDE.md, planos aprovados): Individual 1, Equipe 5, Sociedade ilimitado. `null` = ilimitado. Conta usuários ativos + convites pendentes. */
export const LIMITE_USUARIOS: Record<Plano, number | null> = { solo: 1, escritorio: 5, banca: null };

export function limiteDeUsuarios(plano: Plano): number | null {
  return LIMITE_USUARIOS[plano];
}

export function mensagemLimiteDeUsuarios(plano: Plano): string {
  const limite = limiteDeUsuarios(plano);
  return `Limite de usuários do plano atingido. O plano ${NOME_PLANO[plano]} permite ${limite} usuário${limite === 1 ? "" : "s"} (contando convites pendentes). Desative um usuário, exclua um convite pendente ou peça a troca de plano.`;
}

const NOME_PLANO: Record<Plano, string> = { solo: "Individual", escritorio: "Equipe", banca: "Sociedade" };

export function mensagemLimiteDeOabs(plano: Plano): string {
  const limite = limiteDeOabs(plano);
  return `O plano ${NOME_PLANO[plano]} permite ${limite} OAB${limite === 1 ? "" : "s"} ativa${limite === 1 ? "" : "s"}. Desative uma OAB ou peça a troca de plano para adicionar outra.`;
}

/**
 * COTA DIÁRIA DE RESUMOS POR IA, POR ESCRITÓRIO. VALORES PROVISÓRIOS (definidos em 2026-10-27 só para poder lançar;
 * o usuário vai decidir os números finais). Para mudar, altere SÓ esta tabela. 0 = o plano não inclui IA.
 * O dia conta em America/Sao_Paulo. Custo e franquia: ver docs/IA.md.
 */
export const COTA_IA_DIARIA_PROVISORIA: Record<Plano, number> = { solo: 0, escritorio: 20, banca: 60 };

export function cotaDeIa(plano: Plano): number {
  return COTA_IA_DIARIA_PROVISORIA[plano];
}

export const mensagemPlanoSemIa = (plano: Plano) => `O plano ${NOME_PLANO[plano]} não inclui resumos por IA. Peça a troca de plano para usar este recurso.`;

export const mensagemCotaDeIaEsgotada = (limite: number) =>
  `Você já usou os ${limite} resumos por IA de hoje. A cota volta amanhã, à meia-noite (horário de Brasília). Você ainda pode escrever o resumo à mão.`;
