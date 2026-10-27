// Máscaras de digitação. Guardamos e enviamos o texto formatado; o servidor normaliza para dígitos.

export function soDigitos(v: string): string {
  return v.replace(/\D/g, "");
}

/** CPF (até 11 dígitos) ou CNPJ (12 a 14): a máscara muda conforme o tamanho. */
export function mascaraDocumento(v: string): string {
  const d = soDigitos(v).slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
  }
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
}

export function mascaraCep(v: string): string {
  return soDigitos(v).slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");
}

/** (12) 3456-7890 ou (12) 99219-8038. */
export function mascaraTelefone(v: string): string {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  const ddd = `(${d.slice(0, 2)}) `;
  const resto = d.slice(2);
  if (resto.length <= 4) return ddd + resto;
  const corte = d.length === 11 ? 5 : 4;
  return `${ddd}${resto.slice(0, corte)}-${resto.slice(corte)}`;
}
