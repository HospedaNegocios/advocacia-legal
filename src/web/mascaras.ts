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

/** Número CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO (até 20 dígitos). */
export function mascaraCnj(v: string): string {
  const d = soDigitos(v).slice(0, 20);
  const partes = [d.slice(0, 7), d.slice(7, 9), d.slice(9, 13), d.slice(13, 14), d.slice(14, 16), d.slice(16, 20)];
  let saida = partes[0] ?? "";
  if (partes[1]) saida += `-${partes[1]}`;
  if (partes[2]) saida += `.${partes[2]}`;
  if (partes[3]) saida += `.${partes[3]}`;
  if (partes[4]) saida += `.${partes[4]}`;
  if (partes[5]) saida += `.${partes[5]}`;
  return saida;
}

/** Valor em reais enquanto digita: só dígitos viram centavos ("123456" -> "1.234,56"). */
export function mascaraMoeda(v: string): string {
  const d = soDigitos(v).replace(/^0+(?=\d)/, "").slice(0, 15);
  if (d === "") return "";
  const centavos = d.padStart(3, "0");
  const inteiro = centavos.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${inteiro},${centavos.slice(-2)}`;
}

/** "1.234,56" -> 123456 (centavos), ou null se vazio. */
export function moedaParaCentavos(v: string): number | null {
  const d = soDigitos(v);
  return d === "" ? null : Number(d);
}

/** 123456 -> "1.234,56" (sem o símbolo da moeda). */
export function centavosParaMoeda(c: number | null): string {
  return c === null ? "" : mascaraMoeda(String(c));
}
