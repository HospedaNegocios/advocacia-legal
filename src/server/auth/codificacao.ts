// Utilidades de codificação e comparação (WebCrypto, sem dependências).

const enc = new TextEncoder();

export function textoParaBytes(texto: string): Uint8Array<ArrayBuffer> {
  return enc.encode(texto);
}

export function bytesParaBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function base64ParaBytes(texto: string): Uint8Array<ArrayBuffer> {
  const s = atob(texto);
  const saida = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) saida[i] = s.charCodeAt(i);
  return saida;
}

export function bytesParaBase64Url(bytes: Uint8Array): string {
  return bytesParaBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function base64UrlParaBytes(texto: string): Uint8Array<ArrayBuffer> {
  const b64 = texto.replaceAll("-", "+").replaceAll("_", "/");
  return base64ParaBytes(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
}

export function bytesParaHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function bytesAleatorios(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n));
}

export async function sha256Hex(texto: string): Promise<string> {
  return bytesParaHex(new Uint8Array(await crypto.subtle.digest("SHA-256", textoParaBytes(texto))));
}

/** Token aleatório de 32 bytes (256 bits) em base64url (43 caracteres). */
export function gerarToken(): string {
  return bytesParaBase64Url(bytesAleatorios(32));
}

export const FORMATO_TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** Comparação em tempo constante (não sai no primeiro byte diferente). */
export function iguaisEmTempoConstante(a: Uint8Array, b: Uint8Array): boolean {
  let diferenca = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diferenca |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diferenca === 0;
}

export function textosIguaisEmTempoConstante(a: string, b: string): boolean {
  return iguaisEmTempoConstante(textoParaBytes(a), textoParaBytes(b));
}
