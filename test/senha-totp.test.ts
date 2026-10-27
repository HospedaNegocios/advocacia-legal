import { describe, expect, it } from "vitest";
import { hashSenha, validarSenhaNova, verificarSenha, SENHA_INUTILIZAVEL } from "../src/server/auth/senha";
import { base32Codificar, base32Decodificar, gerarCodigo, verificarCodigo, montarUriOtpauth } from "../src/server/auth/totp";
import { cifrar, criarDesafio, decifrar, verificarDesafio } from "../src/server/auth/cripto";
import { iguaisEmTempoConstante, textoParaBytes } from "../src/server/auth/codificacao";

const CHAVE = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=";

describe("senha (PBKDF2-SHA256)", () => {
  it("gera hash com 100000 iterações e sal de 16 bytes, e confere a senha certa", async () => {
    const { senha_hash, senha_salt } = await hashSenha("uma senha bem longa");
    expect(senha_hash.startsWith("pbkdf2-sha256$100000$")).toBe(true);
    expect(atob(senha_salt)).toHaveLength(16);
    expect(await verificarSenha("uma senha bem longa", senha_hash, senha_salt)).toBe(true);
    expect(await verificarSenha("uma senha bem longA", senha_hash, senha_salt)).toBe(false);
  });

  it("o mesmo texto gera hashes e sais diferentes", async () => {
    const a = await hashSenha("repetida-123456");
    const b = await hashSenha("repetida-123456");
    expect(a.senha_salt).not.toBe(b.senha_salt);
    expect(a.senha_hash).not.toBe(b.senha_hash);
  });

  it("hash inutilizável nunca confere", async () => {
    expect(await verificarSenha("", SENHA_INUTILIZAVEL.senha_hash, SENHA_INUTILIZAVEL.senha_salt)).toBe(false);
    expect(await verificarSenha("!", SENHA_INUTILIZAVEL.senha_hash, SENHA_INUTILIZAVEL.senha_salt)).toBe(false);
  });

  it("exige no mínimo 10 caracteres", () => {
    expect(validarSenhaNova("123456789")).toMatch(/pelo menos 10/);
    expect(validarSenhaNova("1234567890")).toBeNull();
    expect(validarSenhaNova(123)).not.toBeNull();
    expect(validarSenhaNova("x".repeat(201))).not.toBeNull();
  });

  it("comparação em tempo constante distingue tamanhos e conteúdo", () => {
    expect(iguaisEmTempoConstante(textoParaBytes("abc"), textoParaBytes("abc"))).toBe(true);
    expect(iguaisEmTempoConstante(textoParaBytes("abc"), textoParaBytes("abd"))).toBe(false);
    expect(iguaisEmTempoConstante(textoParaBytes("abc"), textoParaBytes("abcd"))).toBe(false);
  });
});

describe("TOTP (RFC 6238, SHA-1)", () => {
  const segredo = textoParaBytes("12345678901234567890");
  // Vetores do Apêndice B da RFC 6238 (8 dígitos, SHA-1).
  const vetores: [number, string][] = [
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ];
  for (const [segundos, esperado] of vetores) {
    it(`vetor da RFC em t=${segundos}`, async () => {
      expect(await gerarCodigo(segredo, Math.floor(segundos / 30), 8)).toBe(esperado);
      // Com 6 dígitos vale o final do mesmo número.
      expect(await gerarCodigo(segredo, Math.floor(segundos / 30), 6)).toBe(esperado.slice(2));
    });
  }

  it("aceita passo atual, anterior e seguinte, e recusa mais distantes", async () => {
    const agora = 1111111111 * 1000;
    const passo = Math.floor(agora / 30000);
    for (const d of [-1, 0, 1]) {
      expect(await verificarCodigo(segredo, await gerarCodigo(segredo, passo + d), agora)).toBe(passo + d);
    }
    expect(await verificarCodigo(segredo, await gerarCodigo(segredo, passo + 2), agora)).toBeNull();
    expect(await verificarCodigo(segredo, await gerarCodigo(segredo, passo - 2), agora)).toBeNull();
    expect(await verificarCodigo(segredo, "abc123", agora)).toBeNull();
    expect(await verificarCodigo(segredo, "12345", agora)).toBeNull();
  });

  it("base32 ida e volta e URI otpauth", () => {
    expect(base32Codificar(textoParaBytes("12345678901234567890"))).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect([...base32Decodificar("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ")]).toEqual([...textoParaBytes("12345678901234567890")]);
    const uri = montarUriOtpauth(segredo, "a@b.com");
    expect(uri).toContain("otpauth://totp/advocacia.legal%3Aa%40b.com?secret=GEZDGNBV");
    expect(uri).toContain("period=30");
    expect(uri).toContain("digits=6");
  });
});

describe("cifra AES-GCM e desafio assinado", () => {
  it("cifra e decifra; cada cifra é diferente e adulteração falha", async () => {
    const a = await cifrar("SEGREDO", CHAVE);
    const b = await cifrar("SEGREDO", CHAVE);
    expect(a).not.toBe(b);
    expect(a).not.toContain("SEGREDO");
    expect(await decifrar(a, CHAVE)).toBe("SEGREDO");
    const partes = a.split(".");
    partes[2] = partes[2]!.slice(0, -4) + (partes[2]!.endsWith("AAAA") ? "BBBB" : "AAAA");
    await expect(decifrar(partes.join("."), CHAVE)).rejects.toThrow();
    await expect(decifrar(a, btoa(String.fromCharCode(...new Uint8Array(32).fill(7))))).rejects.toThrow();
  });

  it("recusa chave ausente ou de tamanho errado", async () => {
    await expect(cifrar("x", undefined)).rejects.toThrow(/CHAVE_CRIPTO/);
    await expect(cifrar("x", btoa("curta"))).rejects.toThrow(/32 bytes/);
  });

  it("desafio vale 5 minutos e não aceita adulteração", async () => {
    const agora = Date.now();
    const d = await criarDesafio("user-1", CHAVE, agora);
    expect(await verificarDesafio(d, CHAVE, agora + 4 * 60 * 1000)).toBe("user-1");
    expect(await verificarDesafio(d, CHAVE, agora + 5 * 60 * 1000 + 1)).toBeNull();
    const [p, s] = d.split(".");
    const outro = await criarDesafio("user-2", CHAVE, agora);
    expect(await verificarDesafio(`${outro.split(".")[0]}.${s}`, CHAVE, agora)).toBeNull();
    expect(await verificarDesafio(`${p}.${s}x`, CHAVE, agora)).toBeNull();
    expect(await verificarDesafio("lixo", CHAVE, agora)).toBeNull();
  });
});
