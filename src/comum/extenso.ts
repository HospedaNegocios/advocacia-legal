// Valor por extenso em português do Brasil (para o recibo). Entrada em centavos inteiros.

const UNIDADES = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

/** 1 a 999 por extenso. */
function ate999(n: number): string {
  if (n === 100) return "cem";
  const partes: string[] = [];
  const c = Math.floor(n / 100);
  const resto = n % 100;
  if (c > 0) partes.push(CENTENAS[c] as string);
  if (resto > 0) {
    if (resto < 20) partes.push(UNIDADES[resto] as string);
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      partes.push(u === 0 ? (DEZENAS[d] as string) : `${DEZENAS[d]} e ${UNIDADES[u]}`);
    }
  }
  return partes.join(" e ");
}

/** Inteiro de 0 a 999.999.999.999 por extenso ("mil e quinhentos", "um milhão e duzentos mil"). */
export function inteiroPorExtenso(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0 || n >= 1e12) throw new RangeError("Número fora do intervalo suportado.");
  if (n === 0) return "zero";
  const escalas: [number, string, string][] = [
    [1e9, "bilhão", "bilhões"],
    [1e6, "milhão", "milhões"],
    [1e3, "mil", "mil"],
  ];
  const grupos: { texto: string; quantidade: number }[] = [];
  let resto = n;
  for (const [base, singular, plural] of escalas) {
    const q = Math.floor(resto / base);
    resto %= base;
    if (q === 0) continue;
    // "mil" sozinho (1.000) não leva "um".
    const texto = base === 1e3 ? (q === 1 ? "mil" : `${ate999(q)} mil`) : `${ate999(q)} ${q === 1 ? singular : plural}`;
    grupos.push({ texto, quantidade: q });
  }
  if (resto > 0) grupos.push({ texto: ate999(resto), quantidade: resto });
  // "e" antes do último grupo quando a quantidade dele é menor que 100 ou centena exata
  // ("mil e cem", "um milhão e cinquenta", "um milhão e duzentos mil"); nos demais casos só espaço.
  let saida = grupos[0]?.texto ?? "";
  for (let i = 1; i < grupos.length; i++) {
    const g = grupos[i] as { texto: string; quantidade: number };
    const usaE = i === grupos.length - 1 && (g.quantidade < 100 || g.quantidade % 100 === 0);
    saida += usaE ? ` e ${g.texto}` : ` ${g.texto}`;
  }
  return saida;
}

/** 123456 -> "mil duzentos e trinta e quatro reais e cinquenta e seis centavos". Zero reais: só os centavos. */
export function valorPorExtenso(centavos: number): string {
  if (!Number.isSafeInteger(centavos) || centavos < 0) throw new RangeError("Valor inválido.");
  const reais = Math.floor(centavos / 100);
  const cents = centavos % 100;
  const partesReais = reais > 0 ? `${inteiroPorExtenso(reais)}${reais % 1_000_000 === 0 ? " de" : ""} ${reais === 1 ? "real" : "reais"}` : "";
  const partesCents = cents > 0 ? `${inteiroPorExtenso(cents)} ${cents === 1 ? "centavo" : "centavos"}` : "";
  if (partesReais && partesCents) return `${partesReais} e ${partesCents}`;
  return partesReais || partesCents || "zero reais";
}
