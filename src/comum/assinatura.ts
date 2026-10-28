// Situação da assinatura de um escritório em teste grátis. Módulo puro (servidor e interface), só Intl via fuso.ts.
//
// REGRA (decisão do usuário em 2026-10-28; detalhes em docs/ASSINATURA.md):
//  - "Último dia do teste" = dia civil de `teste_ate` em America/Sao_Paulo (o dia inteiro conta).
//  - Do dia seguinte ao último dia do teste, por 10 dias completos: SOMENTE LEITURA.
//  - A partir do 11º dia depois do último dia do teste: BLOQUEADO.
//  - Só vale para status "teste" com `teste_ate` preenchida. Status "ativo" nunca vence sozinho (ativação é manual).
import { FUSO_PADRAO, hojeEm, instanteLocal, limitesDoDia, partesLocais, somarDias } from "./fuso";

export const DIAS_SOMENTE_LEITURA = 10;

export type SituacaoAssinatura = "normal" | "leitura" | "bloqueado";

export interface DadosAssinatura {
  status: string | null | undefined;
  teste_ate: string | null | undefined;
}

export interface ResumoAssinatura {
  situacao: SituacaoAssinatura;
  /** Último dia do teste (AAAA-MM-DD, São Paulo) ou null se não há data. */
  ultimo_dia_teste: string | null;
  /** Primeiro dia de somente leitura (dia seguinte ao último do teste). */
  leitura_desde: string | null;
  /** Primeiro dia de bloqueio (10 dias depois do início da leitura, ou seja, ultimo_dia + 11). */
  bloqueio_desde: string | null;
  /** Dias que faltam para o fim do teste (0 = o último dia é hoje); null se não está em teste ou já passou. */
  dias_para_fim_teste: number | null;
  /** Dias que faltam para o bloqueio, quando está em somente leitura (1 = bloqueia amanhã). */
  dias_para_bloqueio: number | null;
}

/** Dia civil (São Paulo) do último dia do teste, ou null. */
export function ultimoDiaDoTeste(testeAte: string | null | undefined): string | null {
  if (!testeAte) return null;
  const ms = Date.parse(testeAte);
  if (Number.isNaN(ms)) return null;
  return partesLocais(ms, FUSO_PADRAO).data;
}

export function resumoDaAssinatura(d: DadosAssinatura, agora: Date | number = Date.now()): ResumoAssinatura {
  const vazio: ResumoAssinatura = { situacao: "normal", ultimo_dia_teste: null, leitura_desde: null, bloqueio_desde: null, dias_para_fim_teste: null, dias_para_bloqueio: null };
  if (d.status !== "teste") return vazio;
  const ultimo = ultimoDiaDoTeste(d.teste_ate);
  if (!ultimo) return vazio;
  const leituraDesde = somarDias(ultimo, 1);
  const bloqueioDesde = somarDias(ultimo, DIAS_SOMENTE_LEITURA + 1);
  const hoje = hojeEm(FUSO_PADRAO, agora);
  const dif = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  let situacao: SituacaoAssinatura = "normal";
  if (hoje >= bloqueioDesde) situacao = "bloqueado";
  else if (hoje >= leituraDesde) situacao = "leitura";
  return {
    situacao,
    ultimo_dia_teste: ultimo,
    leitura_desde: leituraDesde,
    bloqueio_desde: bloqueioDesde,
    dias_para_fim_teste: situacao === "normal" ? dif(hoje, ultimo) : null,
    dias_para_bloqueio: situacao === "leitura" ? dif(hoje, bloqueioDesde) : null,
  };
}

export function situacaoDaAssinatura(d: DadosAssinatura, agora: Date | number = Date.now()): SituacaoAssinatura {
  return resumoDaAssinatura(d, agora).situacao;
}

/**
 * Para filtros SQL (Cron): escritório em teste com `teste_ate` ANTERIOR a este instante está bloqueado.
 * Bloqueado hoje <=> ultimo_dia <= hoje - 11 <=> teste_ate < início do dia (hoje - 10) em São Paulo.
 */
export function limiteDeBloqueioIso(agora: Date | number = Date.now()): string {
  const dia = somarDias(hojeEm(FUSO_PADRAO, agora), -DIAS_SOMENTE_LEITURA);
  return new Date(limitesDoDia(dia, FUSO_PADRAO).inicio).toISOString();
}

/** Valor a gravar em `teste_ate` quando o dono escolhe o último dia do teste: o fim desse dia em São Paulo (23:59:59.999). */
export function testeAteDoDia(dia: string): string {
  return new Date(instanteLocal(dia, "23:59", FUSO_PADRAO, 59, 999)).toISOString();
}

export const MENSAGEM_SOMENTE_LEITURA =
  "O período de teste do seu escritório terminou. Você pode consultar tudo e baixar documentos, mas não pode criar nem alterar nada. Fale com o suporte para ativar a assinatura.";
export const MENSAGEM_BLOQUEADO = "Assinatura vencida. Fale com o suporte para reativar o acesso do seu escritório.";
