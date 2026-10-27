export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0] ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1] ?? "") : "";
  return (primeira.charAt(0) + ultima.charAt(0)).toLocaleUpperCase("pt-BR");
}

export function Avatar({ nome, tamanho = "medio" }: { nome: string; tamanho?: "pequeno" | "medio" | "grande" }) {
  const t = tamanho === "pequeno" ? " avatar-pequeno" : tamanho === "grande" ? " avatar-grande" : "";
  return (
    <span className={`avatar${t}`} aria-hidden="true">
      {iniciais(nome)}
    </span>
  );
}
