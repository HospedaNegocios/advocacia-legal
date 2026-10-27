// Cálculos do painel do dono. Tudo é derivado da lista real de escritórios (nenhum dado inventado).
import type { Plano, Status } from "./api";

export interface EscritorioResumo {
  id: string;
  nome: string;
  plano: Plano;
  status: Status;
  teste_ate: string | null;
  criado_em: string;
  usuarios: number;
}

const DIA = 24 * 3600 * 1000;

export function contarPorStatus(lista: EscritorioResumo[]): Record<Status, number> {
  const r: Record<Status, number> = { teste: 0, ativo: 0, suspenso: 0, cancelado: 0 };
  for (const e of lista) r[e.status] += 1;
  return r;
}

export function contarPorPlano(lista: EscritorioResumo[]): Record<Plano, number> {
  const r: Record<Plano, number> = { solo: 0, escritorio: 0, banca: 0 };
  for (const e of lista) r[e.plano] += 1;
  return r;
}

export function totalUsuarios(lista: EscritorioResumo[]): number {
  return lista.reduce((s, e) => s + e.usuarios, 0);
}

export function novosNosUltimosDias(lista: EscritorioResumo[], agora: Date, dias = 30): number {
  const limite = agora.getTime() - dias * DIA;
  return lista.filter((e) => new Date(e.criado_em).getTime() >= limite).length;
}

export interface Vencimento {
  escritorio: EscritorioResumo;
  /** Dias inteiros até o fim do teste. Negativo = já venceu e o escritório continua em teste. */
  dias: number;
}

/** Escritórios em teste que vencem em até `janelaDias` dias (inclui os que já passaram da data e seguem em teste). */
export function testesVencendo(lista: EscritorioResumo[], agora: Date, janelaDias = 7): Vencimento[] {
  const saida: Vencimento[] = [];
  for (const e of lista) {
    if (e.status !== "teste" || !e.teste_ate) continue;
    const dias = Math.ceil((new Date(e.teste_ate).getTime() - agora.getTime()) / DIA);
    if (dias <= janelaDias) saida.push({ escritorio: e, dias });
  }
  return saida.sort((a, b) => a.dias - b.dias);
}

export interface PontoMensal {
  /** "2026-10" */
  chave: string;
  /** "out" */
  curto: string;
  /** "outubro de 2026" */
  longo: string;
  criados: number;
  acumulado: number;
}

/** Série real dos últimos `meses` meses, a partir de `criado_em`: escritórios criados em cada mês e total acumulado até o fim dele. */
export function serieMensal(lista: EscritorioResumo[], agora: Date, meses = 12): PontoMensal[] {
  const fmtCurto = new Intl.DateTimeFormat("pt-BR", { month: "short" });
  const fmtLongo = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
  const datas = lista.map((e) => new Date(e.criado_em));
  const saida: PontoMensal[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const inicio = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    const fim = new Date(agora.getFullYear(), agora.getMonth() - i + 1, 1);
    saida.push({
      chave: `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, "0")}`,
      curto: fmtCurto.format(inicio).replace(".", ""),
      longo: fmtLongo.format(inicio),
      criados: datas.filter((d) => d >= inicio && d < fim).length,
      acumulado: datas.filter((d) => d < fim).length,
    });
  }
  return saida;
}
