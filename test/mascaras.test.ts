import { describe, expect, it } from "vitest";
import { mascaraCep, mascaraDocumento, mascaraTelefone } from "../src/web/mascaras";

describe("máscaras", () => {
  it("documento: CPF e CNPJ", () => {
    expect(mascaraDocumento("52998224725")).toBe("529.982.247-25");
    expect(mascaraDocumento("5299")).toBe("529.9");
    expect(mascaraDocumento("11222333000181")).toBe("11.222.333/0001-81");
    expect(mascaraDocumento("112223330001819999")).toBe("11.222.333/0001-81");
  });
  it("cep", () => {
    expect(mascaraCep("12345678")).toBe("12345-678");
    expect(mascaraCep("123")).toBe("123");
  });
  it("telefone fixo e celular", () => {
    expect(mascaraTelefone("1234567890")).toBe("(12) 3456-7890");
    expect(mascaraTelefone("12992198038")).toBe("(12) 99219-8038");
    expect(mascaraTelefone("")).toBe("");
    expect(mascaraTelefone("12")).toBe("(12");
  });
});
