import { describe, expect, it } from "vitest";
import { centavosParaMoeda, mascaraCep, mascaraCnj, mascaraDocumento, mascaraMoeda, mascaraTelefone, moedaParaCentavos } from "../src/web/mascaras";

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
  it("número CNJ", () => {
    expect(mascaraCnj("00000017820208260100")).toBe("0000001-78.2020.8.26.0100");
    expect(mascaraCnj("0000001-78.2020.8.26.0100999")).toBe("0000001-78.2020.8.26.0100");
    expect(mascaraCnj("00000017")).toBe("0000001-7");
    expect(mascaraCnj("0000001782020")).toBe("0000001-78.2020");
    expect(mascaraCnj("")).toBe("");
  });
  it("moeda em reais e centavos", () => {
    expect(mascaraMoeda("1")).toBe("0,01");
    expect(mascaraMoeda("123456")).toBe("1.234,56");
    expect(mascaraMoeda("100000000")).toBe("1.000.000,00");
    expect(mascaraMoeda("")).toBe("");
    expect(moedaParaCentavos("1.234,56")).toBe(123456);
    expect(moedaParaCentavos("")).toBeNull();
    expect(centavosParaMoeda(123456)).toBe("1.234,56");
    expect(centavosParaMoeda(0)).toBe("0,00");
    expect(centavosParaMoeda(null)).toBe("");
  });
});
