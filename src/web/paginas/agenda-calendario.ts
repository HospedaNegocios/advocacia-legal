import { somarDias } from "../../comum/fuso";

// Cálculos do calendário da Agenda sobre dias civis (AAAA-MM-DD), sem fuso: o dia de hoje vem de `hojeEm`.

export type VisaoAgenda = "dia" | "semana" | "mes";

const partes = (d: string) => d.split("-").map(Number) as [number, number, number];

/** 0 = domingo ... 6 = sábado. */
export function diaDaSemana(d: string): number {
  const [a, m, dia] = partes(d);
  return new Date(Date.UTC(a, m - 1, dia)).getUTCDay();
}

/** Domingo da semana que contém o dia. */
export function inicioDaSemana(d: string): string {
  return somarDias(d, -diaDaSemana(d));
}

export function primeiroDoMes(d: string): string {
  return `${d.slice(0, 7)}-01`;
}

export function diasNoMes(d: string): number {
  const [a, m] = partes(d);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

export function somarMeses(d: string, n: number): string {
  const [a, m] = partes(d);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`;
}

/** Dias exibidos pela visão (inclusive), na ordem. O mês completa as semanas (domingo a sábado). */
export function diasDaVisao(visao: VisaoAgenda, ancora: string): string[] {
  if (visao === "dia") return [ancora];
  if (visao === "semana") {
    const ini = inicioDaSemana(ancora);
    return Array.from({ length: 7 }, (_, i) => somarDias(ini, i));
  }
  const primeiro = primeiroDoMes(ancora);
  const deslocamento = diaDaSemana(primeiro);
  const semanas = Math.ceil((deslocamento + diasNoMes(ancora)) / 7);
  const ini = somarDias(primeiro, -deslocamento);
  return Array.from({ length: semanas * 7 }, (_, i) => somarDias(ini, i));
}

/** Intervalo a consultar na API (sempre dentro do limite de 62 dias). */
export function janelaDaVisao(visao: VisaoAgenda, ancora: string): { de: string; ate: string } {
  const dias = diasDaVisao(visao, ancora);
  return { de: dias[0] as string, ate: dias[dias.length - 1] as string };
}

export function deslocarAncora(visao: VisaoAgenda, ancora: string, sentido: 1 | -1): string {
  if (visao === "dia") return somarDias(ancora, sentido);
  if (visao === "semana") return somarDias(ancora, 7 * sentido);
  return somarMeses(ancora, sentido);
}

const NOMES_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const DIAS_SEMANA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
export const DIAS_SEMANA_LONGO = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"] as const;

/** "terça-feira, 10 de novembro de 2026" */
export function diaPorExtenso(d: string): string {
  const [a, m, dia] = partes(d);
  return `${DIAS_SEMANA_LONGO[diaDaSemana(d)]}, ${dia} de ${NOMES_MES[m - 1]} de ${a}`;
}

/** Título da visão: o dia por extenso, o intervalo da semana ou o mês e o ano. */
export function tituloDaVisao(visao: VisaoAgenda, ancora: string): string {
  if (visao === "dia") return diaPorExtenso(ancora);
  if (visao === "mes") {
    const [a, m] = partes(ancora);
    return `${NOMES_MES[m - 1]} de ${a}`;
  }
  const dias = diasDaVisao("semana", ancora);
  const [a1, m1, d1] = partes(dias[0] as string);
  const [a2, m2, d2] = partes(dias[6] as string);
  if (m1 === m2) return `${d1} a ${d2} de ${NOMES_MES[m2 - 1]} de ${a2}`;
  return `${d1} de ${NOMES_MES[m1 - 1]}${a1 !== a2 ? ` de ${a1}` : ""} a ${d2} de ${NOMES_MES[m2 - 1]} de ${a2}`;
}

export function numeroDoDia(d: string): number {
  return partes(d)[2];
}
