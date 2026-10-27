// Períodos em meses para o financeiro (calendário civil, sem fuso). Usado pelo servidor e pela interface.

/** "AAAA-MM" de uma data AAAA-MM-DD. */
export function mesDe(data: string): string {
  return data.slice(0, 7);
}

/** Primeiro dia (AAAA-MM-01) do mês de uma data. */
export function primeiroDiaDoMes(data: string): string {
  return `${data.slice(0, 7)}-01`;
}

/** Último dia (AAAA-MM-DD) do mês de uma data. */
export function ultimoDiaDoMes(data: string): string {
  const a = Number(data.slice(0, 4));
  const m = Number(data.slice(5, 7));
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}

/** Os `quantidade` meses terminando no mês de `data`, do mais antigo ao mais recente ("AAAA-MM"). */
export function ultimosMeses(data: string, quantidade: number): string[] {
  const a = Number(data.slice(0, 4));
  const m = Number(data.slice(5, 7));
  const saida: string[] = [];
  for (let i = quantidade - 1; i >= 0; i--) {
    saida.push(new Date(Date.UTC(a, m - 1 - i, 1)).toISOString().slice(0, 7));
  }
  return saida;
}
