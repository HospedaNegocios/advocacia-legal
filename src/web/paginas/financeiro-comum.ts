import { api } from "../api";
import type { NivelAcesso } from "../api";
import { cnjFormatado } from "./processos-comum";

// Tipos e formatação do Financeiro. Valores sempre em centavos (inteiro); só a exibição usa o formato de reais.

export type TipoLancamento = "receita" | "despesa";
export type StatusLancamento = "aberto" | "pago" | "cancelado";

export interface Lancamento {
  id: string;
  tipo: TipoLancamento;
  descricao: string;
  categoria: string | null;
  valor_centavos: number;
  vencimento: string;
  status: StatusLancamento;
  situacao: "vencido" | StatusLancamento;
  vencido: boolean;
  dias_atraso: number;
  pago_em: string | null;
  valor_pago_centavos: number | null;
  cliente_id: string | null;
  cliente_nome: string | null;
  processo_id: string | null;
  processo_numero: string | null;
  observacoes: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface ResumoFinanceiro {
  a_receber_centavos: number;
  a_receber_qtd: number;
  vencido_receber_centavos: number;
  vencido_receber_qtd: number;
  a_pagar_centavos: number;
  a_pagar_qtd: number;
  vencido_pagar_centavos: number;
  vencido_pagar_qtd: number;
  recebido_periodo_centavos: number;
  pago_periodo_centavos: number;
  saldo_periodo_centavos: number;
  saldo_acumulado_centavos: number;
}

export interface PontoMensal {
  mes: string;
  recebido_centavos: number;
  pago_centavos: number;
}

export interface RespostaResumo {
  hoje: string;
  periodo: { de: string; ate: string };
  resumo: ResumoFinanceiro;
  serie_mensal: PontoMensal[];
}

export interface RespostaLista {
  hoje: string;
  lancamentos: Lancamento[];
  total: number;
  pagina: number;
  por_pagina: number;
}

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** 123456 -> "R$ 1.234,56" (negativo: "-R$ 1.234,56"). */
export function formatarReais(centavos: number): string {
  // Dividir por 100 só para exibir: o valor guardado e enviado continua em centavos inteiros.
  return moeda.format(centavos / 100);
}

/** "2026-10-27" -> "27/10/2026" (sem passar por Date: não depende do fuso do navegador). */
export function formatarDataCivil(data: string | null): string {
  if (!data) return "—";
  const [a, m, d] = data.split("-");
  return a && m && d ? `${d}/${m}/${a}` : data;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "2026-10" -> "out/26" (rótulo curto de eixo). */
export function mesCurto(mes: string): string {
  const m = Number(mes.slice(5, 7));
  return `${MESES[m - 1] ?? mes}/${mes.slice(2, 4)}`;
}

/** "2026-10" -> "outubro de 2026". */
export function mesPorExtenso(mes: string): string {
  const nomes = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${nomes[Number(mes.slice(5, 7)) - 1] ?? mes} de ${mes.slice(0, 4)}`;
}

export function podeEditarFinanceiro(nivel: NivelAcesso | undefined): boolean {
  return nivel === "edicao";
}

export const ROTULO_TIPO: Record<TipoLancamento, string> = { receita: "Receita (a receber)", despesa: "Despesa (a pagar)" };

/** Texto do atraso: "Vencido há 1 dia" / "Vencido há 12 dias". */
export function textoAtraso(dias: number): string {
  return `Vencido há ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

export function rotuloProcesso(numero: string | null): string {
  return numero ? cnjFormatado(numero) : "";
}

/** Categorias já usadas no escritório (sugestões do formulário e do filtro). */
export async function carregarCategorias(): Promise<string[]> {
  try {
    return (await api<{ categorias: string[] }>("GET", "/api/financeiro/categorias")).categorias;
  } catch {
    return [];
  }
}
