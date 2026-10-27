import {
  base64ParaBytes,
  base64UrlParaBytes,
  bytesAleatorios,
  bytesParaBase64,
  bytesParaBase64Url,
  iguaisEmTempoConstante,
  textoParaBytes,
} from "./codificacao";

// A chave CHAVE_CRIPTO (Worker secret, base64 de 32 bytes) cifra o segredo TOTP (AES-GCM)
// e assina o desafio do 2FA (HMAC-SHA256, com subchave derivada). Girar a chave torna
// ilegíveis os segredos TOTP já gravados (ver CLAUDE.md).

function bytesDaChave(chaveBase64: string | undefined): Uint8Array<ArrayBuffer> {
  if (!chaveBase64) throw new Error("CHAVE_CRIPTO não configurada.");
  const bytes = base64ParaBytes(chaveBase64.trim());
  if (bytes.length !== 32) throw new Error("CHAVE_CRIPTO deve ter 32 bytes (base64).");
  return bytes;
}

const VERSAO = "v1";

export async function cifrar(texto: string, chaveBase64: string | undefined): Promise<string> {
  const chave = await crypto.subtle.importKey("raw", bytesDaChave(chaveBase64), "AES-GCM", false, ["encrypt"]);
  const iv = bytesAleatorios(12);
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, chave, textoParaBytes(texto)));
  return `${VERSAO}.${bytesParaBase64(iv)}.${bytesParaBase64(cifrado)}`;
}

export async function decifrar(valor: string, chaveBase64: string | undefined): Promise<string> {
  const [versao, iv, cifrado] = valor.split(".");
  if (versao !== VERSAO || !iv || !cifrado) throw new Error("Formato cifrado inválido.");
  const chave = await crypto.subtle.importKey("raw", bytesDaChave(chaveBase64), "AES-GCM", false, ["decrypt"]);
  const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ParaBytes(iv) }, chave, base64ParaBytes(cifrado));
  return new TextDecoder().decode(claro);
}

async function chaveDeAssinatura(chaveBase64: string | undefined, uso: KeyUsage, proposito = "advocacia.legal/desafio-2fa/v1"): Promise<CryptoKey> {
  const mestra = await crypto.subtle.importKey("raw", bytesDaChave(chaveBase64), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const subchave = await crypto.subtle.sign("HMAC", mestra, textoParaBytes(proposito));
  return crypto.subtle.importKey("raw", subchave, { name: "HMAC", hash: "SHA-256" }, false, [uso]);
}

export const VALIDADE_DESAFIO_MS = 5 * 60 * 1000;

/** Desafio de 2FA: `<payload base64url>.<assinatura>`; contém só o id do usuário e a expiração. */
export async function criarDesafio(userId: string, chaveBase64: string | undefined, agoraMs = Date.now()): Promise<string> {
  const payload = bytesParaBase64Url(textoParaBytes(JSON.stringify({ u: userId, e: agoraMs + VALIDADE_DESAFIO_MS, p: "2fa" })));
  const chave = await chaveDeAssinatura(chaveBase64, "sign");
  const assinatura = new Uint8Array(await crypto.subtle.sign("HMAC", chave, textoParaBytes(payload)));
  return `${payload}.${bytesParaBase64Url(assinatura)}`;
}

/** Devolve o id do usuário se o desafio for autêntico e estiver dentro da validade. */
export async function verificarDesafio(desafio: string, chaveBase64: string | undefined, agoraMs = Date.now()): Promise<string | null> {
  try {
    const [payload, assinatura] = desafio.split(".");
    if (!payload || !assinatura) return null;
    const chave = await chaveDeAssinatura(chaveBase64, "sign");
    const esperada = new Uint8Array(await crypto.subtle.sign("HMAC", chave, textoParaBytes(payload)));
    if (!iguaisEmTempoConstante(esperada, base64UrlParaBytes(assinatura))) return null;
    const dados = JSON.parse(new TextDecoder().decode(base64UrlParaBytes(payload))) as { u?: unknown; e?: unknown; p?: unknown };
    if (dados.p !== "2fa" || typeof dados.u !== "string" || typeof dados.e !== "number") return null;
    if (dados.e <= agoraMs) return null;
    return dados.u;
  } catch {
    return null;
  }
}

// ---------- Link temporário de download de anexo ----------
// Subchave própria (derivada da CHAVE_CRIPTO) só para este fim: um link de anexo nunca vale como desafio de 2FA.
const PROPOSITO_LINK_ANEXO = "advocacia.legal/link-anexo/v1";
export const VALIDADE_LINK_ANEXO_MS = 5 * 60 * 1000;

export async function criarLinkAnexo(tenantId: string, anexoId: string, chaveBase64: string | undefined, agoraMs = Date.now()): Promise<string> {
  const payload = bytesParaBase64Url(textoParaBytes(JSON.stringify({ t: tenantId, a: anexoId, e: agoraMs + VALIDADE_LINK_ANEXO_MS, p: "anexo" })));
  const chave = await chaveDeAssinatura(chaveBase64, "sign", PROPOSITO_LINK_ANEXO);
  const assinatura = new Uint8Array(await crypto.subtle.sign("HMAC", chave, textoParaBytes(payload)));
  return `${payload}.${bytesParaBase64Url(assinatura)}`;
}

/** Confere assinatura, validade, escritório e anexo. Verdadeiro só se tudo bater. */
export async function verificarLinkAnexo(token: string, tenantId: string, anexoId: string, chaveBase64: string | undefined, agoraMs = Date.now()): Promise<boolean> {
  try {
    const [payload, assinatura] = token.split(".");
    if (!payload || !assinatura) return false;
    const chave = await chaveDeAssinatura(chaveBase64, "sign", PROPOSITO_LINK_ANEXO);
    const esperada = new Uint8Array(await crypto.subtle.sign("HMAC", chave, textoParaBytes(payload)));
    if (!iguaisEmTempoConstante(esperada, base64UrlParaBytes(assinatura))) return false;
    const d = JSON.parse(new TextDecoder().decode(base64UrlParaBytes(payload))) as { t?: unknown; a?: unknown; e?: unknown; p?: unknown };
    return d.p === "anexo" && d.t === tenantId && d.a === anexoId && typeof d.e === "number" && d.e > agoraMs;
  } catch {
    return false;
  }
}
