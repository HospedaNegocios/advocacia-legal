import { describe, expect, it } from "vitest";
import { centavosParaMoeda, mascaraMoeda, moedaParaCentavos } from "../src/web/mascaras";
import { formatarDataCivil, formatarReais, mesCurto, textoAtraso } from "../src/web/paginas/financeiro-comum";

describe("formatação do financeiro (pt-BR)", () => {
  it("reais, datas e meses", () => {
    expect(formatarReais(123456).replace(/\s/g, " ")).toBe("R$ 1.234,56");
    expect(formatarReais(5).replace(/\s/g, " ")).toBe("R$ 0,05");
    expect(formatarReais(-1000).replace(/\s/g, " ")).toBe("-R$ 10,00");
    expect(formatarDataCivil("2026-10-27")).toBe("27/10/2026");
    expect(formatarDataCivil(null)).toBe("—");
    expect(mesCurto("2026-10")).toBe("out/26");
    expect(textoAtraso(1)).toBe("Vencido há 1 dia");
    expect(textoAtraso(12)).toBe("Vencido há 12 dias");
  });
  it("máscara de valor ida e volta em centavos", () => {
    expect(mascaraMoeda("123456")).toBe("1.234,56");
    expect(moedaParaCentavos("1.234,56")).toBe(123456);
    expect(centavosParaMoeda(5)).toBe("0,05");
    expect(moedaParaCentavos("")).toBeNull();
  });
});
