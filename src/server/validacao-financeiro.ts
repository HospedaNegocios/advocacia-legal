import { TIPOS_LANCAMENTO } from "./db/repositorio";
import type { DadosLancamento, TipoLancamento } from "./db/repositorio";
import { textoOpcional } from "./validacao";
import { dataCivilAceita } from "./validacao-agenda";

/** Teto técnico de um lançamento: R$ 999.999.999,99 (em centavos). Evita estouro nas somas e erro de digitação. */
export const VALOR_MAXIMO_CENTAVOS = 99_999_999_999;

export function ehTipoLancamento(v: unknown): v is TipoLancamento {
  return typeof v === "string" && (TIPOS_LANCAMENTO as readonly string[]).includes(v);
}

/** Valor em centavos: inteiro maior que zero (nunca ponto flutuante nem texto). */
export function centavosValidos(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v > 0 && v <= VALOR_MAXIMO_CENTAVOS;
}

function idOpcional(v: unknown): string | null | false {
  if (v === undefined || v === null || v === "") return null;
  return typeof v === "string" && v.length <= 64 ? v : false;
}

export type ResultadoLancamento = { ok: true; dados: DadosLancamento; tipo: TipoLancamento | null } | { ok: false; erro: string };

/** Lançamento novo ou editado. `tipo` só é lido na criação (`exigirTipo`); na edição o tipo não muda. */
export function validarLancamento(corpo: Record<string, unknown>, exigirTipo: boolean): ResultadoLancamento {
  let tipo: TipoLancamento | null = null;
  if (exigirTipo) {
    if (!ehTipoLancamento(corpo.tipo)) return { ok: false, erro: "Escolha se é uma receita (a receber) ou uma despesa (a pagar)." };
    tipo = corpo.tipo;
  }
  const descricao = textoOpcional(corpo.descricao, 200);
  if (descricao === false) return { ok: false, erro: "A descrição pode ter no máximo 200 caracteres." };
  if (descricao === null) return { ok: false, erro: "Informe a descrição do lançamento." };
  const categoria = textoOpcional(corpo.categoria, 60);
  if (categoria === false) return { ok: false, erro: "A categoria pode ter no máximo 60 caracteres." };
  if (!centavosValidos(corpo.valor_centavos)) return { ok: false, erro: "Informe um valor maior que zero, em reais e centavos." };
  if (!dataCivilAceita(corpo.vencimento)) return { ok: false, erro: "Informe a data de vencimento." };
  const cliente = idOpcional(corpo.cliente_id);
  const processo = idOpcional(corpo.processo_id);
  if (cliente === false || processo === false) return { ok: false, erro: "Cliente ou processo inválido." };
  let observacoes: string | null = null;
  if (corpo.observacoes !== undefined && corpo.observacoes !== null) {
    if (typeof corpo.observacoes !== "string" || corpo.observacoes.trim().length > 2000) return { ok: false, erro: "As observações podem ter no máximo 2000 caracteres." };
    observacoes = corpo.observacoes.trim() || null;
  }
  return {
    ok: true,
    tipo,
    dados: { descricao, categoria, valor_centavos: corpo.valor_centavos, vencimento: corpo.vencimento, cliente_id: cliente, processo_id: processo, observacoes },
  };
}

export type ResultadoPagamento = { ok: true; pago_em: string; valor_pago_centavos: number | null } | { ok: false; erro: string };

/** Pagamento: data obrigatória, não pode ser futura (`hoje` no fuso do escritório); valor pago opcional (padrão = valor do lançamento). */
export function validarPagamento(corpo: Record<string, unknown>, hoje: string): ResultadoPagamento {
  if (!dataCivilAceita(corpo.pago_em)) return { ok: false, erro: "Informe a data do pagamento." };
  if (corpo.pago_em > hoje) return { ok: false, erro: "A data do pagamento não pode ser no futuro." };
  let valor: number | null = null;
  if (corpo.valor_pago_centavos !== undefined && corpo.valor_pago_centavos !== null) {
    if (!centavosValidos(corpo.valor_pago_centavos)) return { ok: false, erro: "Informe um valor pago maior que zero, em reais e centavos." };
    valor = corpo.valor_pago_centavos;
  }
  return { ok: true, pago_em: corpo.pago_em, valor_pago_centavos: valor };
}
