// Converte o HTML que o DJEN envia em texto simples (só texto: nada é interpretado nem executado).

const ENTIDADES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", ordm: "º", ordf: "ª", sect: "§",
};

function decodificar(t: string): string {
  return t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return ENTIDADES[e.toLowerCase()] ?? m;
  });
}

export function htmlParaTexto(html: string): string {
  if (!html.includes("<") && !html.includes("&")) return html;
  const t = html
    .replace(/<(script|style)[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table)\s*>/gi, "\n\n")
    .replace(/<\/(td|th)\s*>/gi, " ")
    .replace(/<[^>]*>?/g, "");
  return decodificar(t)
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
