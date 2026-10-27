import { describe, expect, it } from "vitest";
import { MAX_DIAS_CONSULTA } from "../src/server/rotas/agenda";
import { deslocarAncora, diasDaVisao, diaPorExtenso, inicioDaSemana, janelaDaVisao, tituloDaVisao } from "../src/web/paginas/agenda-calendario";
import { diferencaDias } from "../src/comum/fuso";

describe("calendário da agenda", () => {
  it("semana vai de domingo a sábado", () => {
    expect(inicioDaSemana("2026-11-10")).toBe("2026-11-08");
    expect(inicioDaSemana("2026-11-08")).toBe("2026-11-08");
    expect(janelaDaVisao("semana", "2026-11-14")).toEqual({ de: "2026-11-08", ate: "2026-11-14" });
  });

  it("mês completa as semanas e nunca passa do limite de consulta", () => {
    const dias = diasDaVisao("mes", "2026-11-15");
    expect(dias[0]).toBe("2026-11-01");
    expect(dias.length % 7).toBe(0);
    for (const ancora of ["2026-02-10", "2026-03-31", "2026-08-01", "2027-05-31", "2028-02-29", "2026-12-25"]) {
      const j = janelaDaVisao("mes", ancora);
      expect(diferencaDias(j.de, j.ate) + 1).toBeLessThanOrEqual(42);
      expect(diferencaDias(j.de, j.ate) + 1).toBeLessThanOrEqual(MAX_DIAS_CONSULTA);
    }
    // Agosto de 2026 começa num sábado: 6 semanas.
    expect(diasDaVisao("mes", "2026-08-10")).toHaveLength(42);
    expect(diasDaVisao("mes", "2026-02-10")).toHaveLength(28);
  });

  it("navega entre períodos, inclusive virada de ano e mês curto", () => {
    expect(deslocarAncora("dia", "2026-12-31", 1)).toBe("2027-01-01");
    expect(deslocarAncora("semana", "2026-11-10", -1)).toBe("2026-11-03");
    expect(deslocarAncora("mes", "2026-12-31", 1)).toBe("2027-01-01");
    expect(deslocarAncora("mes", "2027-01-31", -1)).toBe("2026-12-01");
    expect(deslocarAncora("mes", "2026-01-31", 1)).toBe("2026-02-01");
  });

  it("escreve os títulos em português", () => {
    expect(diaPorExtenso("2026-11-10")).toBe("terça-feira, 10 de novembro de 2026");
    expect(tituloDaVisao("mes", "2026-11-10")).toBe("novembro de 2026");
    expect(tituloDaVisao("semana", "2026-11-10")).toBe("8 a 14 de novembro de 2026");
    expect(tituloDaVisao("semana", "2026-12-30")).toBe("27 de dezembro de 2026 a 2 de janeiro de 2027");
  });
});
