// Parcelamento e recorrência mensal do financeiro. Funções puras (sem fuso, sem banco), usadas pelo servidor e pela tela.
// Datas são civis (AAAA-MM-DD). Valores sempre em centavos inteiros.

/** Mínimo e máximo de parcelas (ou de ocorrências mensais) por lançamento. Limite técnico/prático, decidido sem regra de negócio externa. */
export const PARCELAS_MINIMO = 2;
export const PARCELAS_MAXIMO = 60;

/** Texto " (12/12)" acrescentado à descrição; por isso a descrição-base de um grupo tem no máximo 200 − 8 = 192 caracteres. */
export const SOBRA_DESCRICAO_GRUPO = 8;
export const DESCRICAO_MAXIMA_GRUPO = 200 - SOBRA_DESCRICAO_GRUPO;

export function quantidadeValida(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= PARCELAS_MINIMO && n <= PARCELAS_MAXIMO;
}

/**
 * Divide `totalCentavos` em `n` parcelas inteiras: todas iguais a floor(total / n) e a **última** recebe a diferença
 * (de 0 a n−1 centavos a mais). A soma é sempre exatamente o total. Exige total ≥ n (cada parcela com ao menos 1 centavo).
 */
export function dividirEmParcelas(totalCentavos: number, n: number): number[] {
  if (!Number.isSafeInteger(totalCentavos) || totalCentavos < n || !Number.isInteger(n) || n < 1) throw new RangeError("Valor total pequeno demais para o número de parcelas.");
  const base = Math.floor(totalCentavos / n);
  const parcelas = Array<number>(n).fill(base);
  parcelas[n - 1] = totalCentavos - base * (n - 1);
  return parcelas;
}

function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/**
 * Soma `meses` meses à data mantendo o dia do mês da data ORIGINAL; se o mês não tem esse dia, usa o último dia do mês.
 * Ex.: 31/01 +1 → 28/02 (29/02 em ano bissexto); 31/01 +2 → 31/03 (o dia 31 volta, pois sempre se parte da data original).
 */
export function somarMeses(data: string, meses: number): string {
  const ano = Number(data.slice(0, 4));
  const mes = Number(data.slice(5, 7));
  const dia = Number(data.slice(8, 10));
  const indice = ano * 12 + (mes - 1) + meses;
  const novoAno = Math.floor(indice / 12);
  const novoMes = (indice % 12) + 1;
  const novoDia = Math.min(dia, diasNoMes(novoAno, novoMes));
  return `${String(novoAno).padStart(4, "0")}-${String(novoMes).padStart(2, "0")}-${String(novoDia).padStart(2, "0")}`;
}

export interface ItemDeGrupo {
  /** 1 a n. */
  numero: number;
  vencimento: string;
  valor_centavos: number;
  descricao: string;
}

/** Descrição de um item de grupo: "Honorários (3/12)". */
export function descricaoDoItem(base: string, numero: number, total: number): string {
  return `${base} (${numero}/${total})`;
}

/** Parcelamento: o valor informado é o TOTAL, dividido em `n` parcelas mensais (ver `dividirEmParcelas`). */
export function gerarParcelamento(descricao: string, totalCentavos: number, primeiroVencimento: string, n: number): ItemDeGrupo[] {
  return dividirEmParcelas(totalCentavos, n).map((valor, i) => ({ numero: i + 1, vencimento: somarMeses(primeiroVencimento, i), valor_centavos: valor, descricao: descricaoDoItem(descricao, i + 1, n) }));
}

/** Recorrência: o valor informado é o de CADA ocorrência; `n` ocorrências mensais, a primeira no vencimento informado. */
export function gerarRecorrencia(descricao: string, valorCentavos: number, primeiroVencimento: string, n: number): ItemDeGrupo[] {
  return Array.from({ length: n }, (_, i) => ({ numero: i + 1, vencimento: somarMeses(primeiroVencimento, i), valor_centavos: valorCentavos, descricao: descricaoDoItem(descricao, i + 1, n) }));
}
