import { describe, expect, it } from "vitest";
import { cnpjValido, cpfValido, validarOab, validarPerfil } from "../src/server/validacao";
import { limiteDeOabs, mensagemLimiteDeOabs } from "../src/server/planos";

describe("CPF e CNPJ", () => {
  it("aceita números válidos, com ou sem máscara", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("52998224725")).toBe(true);
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("20888978000149")).toBe(true);
  });
  it("recusa dígito errado, repetidos e tamanho errado", () => {
    expect(cpfValido("529.982.247-24")).toBe(false);
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cpfValido("1234")).toBe(false);
    expect(cnpjValido("11.222.333/0001-80")).toBe(false);
    expect(cnpjValido("00000000000000")).toBe(false);
  });
});

describe("validarPerfil", () => {
  it("vazio vira NULL e dígitos são normalizados", () => {
    const r = validarPerfil({ documento: "529.982.247-25", telefone: "(12) 99219-8038", cep: "12.345-678", email_contato: " A@B.com ", uf: "SP", cidade: "  São   Paulo " });
    expect(r).toMatchObject({ ok: true, dados: { documento: "52998224725", telefone: "12992198038", cep: "12345678", email_contato: "a@b.com", uf: "SP", cidade: "São Paulo", razao_social: null } });
    expect(validarPerfil({})).toMatchObject({ ok: true });
  });
  it("recusa valores inválidos", () => {
    for (const corpo of [{ documento: "123" }, { telefone: "123456789" }, { telefone: "123456789012" }, { cep: "1234567" }, { email_contato: "x" }, { uf: "XX" }, { razao_social: 5 }]) {
      expect(validarPerfil(corpo as never).ok).toBe(false);
    }
  });
});

describe("validarOab", () => {
  it("normaliza número, sufixo e nome", () => {
    expect(validarOab({ numero: " 012.345 ", sufixo: "a", uf: "RJ", advogado_nome: " Ana  Lima " })).toEqual({ ok: true, dados: { numero: "12345", sufixo: "A", uf: "RJ", advogado_nome: "Ana Lima" } });
    expect(validarOab({ numero: 99, uf: "SP", advogado_nome: "X" })).toMatchObject({ ok: true, dados: { sufixo: null } });
  });
  it("recusa entradas inválidas", () => {
    const base = { numero: "1", uf: "SP", advogado_nome: "X" };
    for (const mudanca of [{ numero: "abc" }, { numero: "0" }, { numero: "12345678901" }, { sufixo: "1" }, { sufixo: "ABCDEF" }, { uf: "ZZ" }, { advogado_nome: " " }]) {
      expect(validarOab({ ...base, ...mudanca }).ok).toBe(false);
    }
  });
});

describe("limites de OABs por plano", () => {
  it("solo 1, escritório 3, banca ilimitado", () => {
    expect(limiteDeOabs("solo")).toBe(1);
    expect(limiteDeOabs("escritorio")).toBe(3);
    expect(limiteDeOabs("banca")).toBeNull();
    expect(mensagemLimiteDeOabs("solo")).toContain("plano Individual");
  });
});
