// Descobre o "apelido" do tribunal na API Pública do DataJud a partir do número CNJ (20 dígitos):
// NNNNNNN DD AAAA J TR OOOO, onde J (14º dígito) é o ramo da Justiça e TR (15º e 16º) o tribunal.

/** Estados na ordem do campo TR (01 a 27) nas Justiças Estadual e Eleitoral. */
const UFS_POR_TR = ["ac", "al", "ap", "am", "ba", "ce", "df", "es", "go", "ma", "mt", "ms", "mg", "pa", "pb", "pr", "pe", "pi", "rj", "rn", "rs", "ro", "rr", "sc", "se", "sp", "to"] as const;

const MILITARES_ESTADUAIS: Readonly<Record<number, string>> = { 13: "tjmmg", 21: "tjmrs", 26: "tjmsp" };

/** Apelido do tribunal (ex.: "tjsp", "trf3", "trt2", "tre-ac"), ou null se o número é inválido ou o tribunal não é coberto. */
export function aliasDoTribunal(numeroCnj: string): string | null {
  if (!/^\d{20}$/.test(numeroCnj)) return null;
  const j = Number(numeroCnj[13]);
  const tr = Number(numeroCnj.slice(14, 16));
  switch (j) {
    case 3:
      return tr === 0 ? "stj" : null;
    case 4:
      return tr >= 1 && tr <= 6 ? `trf${tr}` : null;
    case 5:
      if (tr === 0) return "tst";
      return tr <= 24 ? `trt${tr}` : null;
    case 6: {
      if (tr === 0) return "tse";
      const uf = UFS_POR_TR[tr - 1];
      return uf ? `tre-${uf}` : null;
    }
    case 7:
      return tr === 0 ? "stm" : null;
    case 8: {
      const uf = UFS_POR_TR[tr - 1];
      return uf ? (uf === "df" ? "tjdft" : `tj${uf}`) : null;
    }
    case 9:
      return MILITARES_ESTADUAIS[tr] ?? null;
    default:
      // 1 = STF, 2 = CNJ, 0 e outros: fora da API pública.
      return null;
  }
}
