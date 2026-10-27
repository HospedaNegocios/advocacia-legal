import { bytesAleatorios, iguaisEmTempoConstante, textoParaBytes } from "./codificacao";

// TOTP (RFC 6238): HMAC-SHA1, 6 dígitos, passo de 30 s, janela de ±1 passo.
export const PERIODO_S = 30;
export const JANELA = 1;
const ALFABETO_BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Codificar(bytes: Uint8Array): string {
  let bits = 0;
  let valor = 0;
  let saida = "";
  for (const b of bytes) {
    valor = (valor << 8) | b;
    bits += 8;
    while (bits >= 5) {
      saida += ALFABETO_BASE32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) saida += ALFABETO_BASE32[(valor << (5 - bits)) & 31];
  return saida;
}

export function base32Decodificar(texto: string): Uint8Array {
  let bits = 0;
  let valor = 0;
  const saida: number[] = [];
  for (const c of texto.replace(/=+$/, "").toUpperCase()) {
    const i = ALFABETO_BASE32.indexOf(c);
    if (i < 0) throw new Error("Base32 inválido.");
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) {
      saida.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(saida);
}

/** Segredo novo de 20 bytes (160 bits), recomendado para HMAC-SHA1. */
export function gerarSegredoTotp(): Uint8Array {
  return bytesAleatorios(20);
}

export function passoDe(agoraMs: number): number {
  return Math.floor(agoraMs / 1000 / PERIODO_S);
}

export async function gerarCodigo(segredo: Uint8Array, passo: number, digitos = 6): Promise<string> {
  const contador = new Uint8Array(8);
  new DataView(contador.buffer).setBigUint64(0, BigInt(passo));
  const chave = await crypto.subtle.importKey("raw", segredo as Uint8Array<ArrayBuffer>, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", chave, contador));
  const deslocamento = (h[19] ?? 0) & 0x0f;
  const numero =
    (((h[deslocamento] ?? 0) & 0x7f) << 24) |
    ((h[deslocamento + 1] ?? 0) << 16) |
    ((h[deslocamento + 2] ?? 0) << 8) |
    (h[deslocamento + 3] ?? 0);
  return String(numero % 10 ** digitos).padStart(digitos, "0");
}

/**
 * Procura o passo cujo código confere, na janela ±1. Devolve o passo ou null.
 * Compara todos os passos da janela, sem parar no primeiro acerto.
 */
export async function verificarCodigo(segredo: Uint8Array, codigo: string, agoraMs: number): Promise<number | null> {
  if (!/^\d{6}$/.test(codigo)) return null;
  const centro = passoDe(agoraMs);
  let achado: number | null = null;
  for (let d = -JANELA; d <= JANELA; d++) {
    const esperado = await gerarCodigo(segredo, centro + d);
    if (iguaisEmTempoConstante(textoParaBytes(esperado), textoParaBytes(codigo))) achado = centro + d;
  }
  return achado;
}

export function montarUriOtpauth(segredo: Uint8Array, email: string): string {
  const emissor = "advocacia.legal";
  const rotulo = encodeURIComponent(`${emissor}:${email}`);
  return `otpauth://totp/${rotulo}?secret=${base32Codificar(segredo)}&issuer=${encodeURIComponent(emissor)}&algorithm=SHA1&digits=6&period=${PERIODO_S}`;
}

