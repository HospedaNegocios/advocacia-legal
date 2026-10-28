import { describe, expect, it } from "vitest";
import { calcularPrazo, feriadosNacionais, pascoa, sugestoesMoveis } from "../src/comum/prazos-uteis";
import type { EntradaCalculo } from "../src/comum/prazos-uteis";

// Cada resultado esperado foi derivado À MÃO das regras (CPC arts. 216, 219, 220, 224 e 231; feriados nacionais por lei),
// conferindo o dia da semana no calendário. A origem de cada caso está no comentário. Ver docs/PRAZOS.md.

function final(e: EntradaCalculo): string {
  const r = calcularPrazo(e);
  if (!r.ok) throw new Error(r.erro);
  return r.resultado.dataFinal;
}

describe("feriados nacionais por lei", () => {
  it("2025 tem 9 feriados fixos, incluindo 12/10 e 20/11; nada de Carnaval, Sexta-feira Santa ou Corpus Christi", () => {
    const datas = feriadosNacionais(2025).map((f) => f.data);
    expect(datas).toEqual(["2025-01-01", "2025-04-21", "2025-05-01", "2025-09-07", "2025-10-12", "2025-11-02", "2025-11-15", "2025-11-20", "2025-12-25"]);
  });
  it("20 de novembro só vale a partir de 2024 (Lei 14.759, de 21/12/2023)", () => {
    expect(feriadosNacionais(2023).map((f) => f.data)).not.toContain("2023-11-20");
    expect(feriadosNacionais(2024).map((f) => f.data)).toContain("2024-11-20");
  });
});

describe("Páscoa e dias móveis (só sugestões)", () => {
  it("Páscoa em anos conhecidos (a de 2020 confere com o calendário do TJSP/STF na página da AASP: Sexta-feira Santa 10/04/2020)", () => {
    expect(pascoa(2020)).toBe("2020-04-12");
    expect(pascoa(2024)).toBe("2024-03-31");
    expect(pascoa(2025)).toBe("2025-04-20");
    expect(pascoa(2026)).toBe("2026-04-05");
  });
  it("sugestões de 2020 coincidem com as datas publicadas pelos tribunais: Carnaval 24 e 25/02, Sexta-feira Santa 10/04, Corpus Christi 11/06", () => {
    const s = sugestoesMoveis(2020);
    const por = (t: string) => s.find((x) => x.descricao.includes(t))?.data;
    expect(por("Segunda-feira de Carnaval")).toBe("2020-02-24");
    expect(por("Terça-feira de Carnaval")).toBe("2020-02-25");
    expect(por("Sexta-feira Santa")).toBe("2020-04-10");
    expect(por("Corpus Christi")).toBe("2020-06-11");
  });
  it("as sugestões não alteram o cálculo", () => {
    // 2025: Carnaval foi 03 e 04/03. Sem cadastro, o dia 04/03 conta como útil.
    expect(final({ data: "2025-02-28", tipoInicio: "dia_do_comeco", dias: 3, contagem: "uteis" })).toBe("2025-03-05");
  });
});

describe("contagem em dias úteis", () => {
  it("15 dias úteis a partir da disponibilização na quinta 02/10/2025: publicação 03/10, começa 06/10, vence 24/10", () => {
    const r = calcularPrazo({ data: "2025-10-02", tipoInicio: "disponibilizacao", dias: 15, contagem: "uteis" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resultado.diaDoComeco).toBe("2025-10-03");
    expect(r.resultado.primeiroDiaContado).toBe("2025-10-06");
    expect(r.resultado.dataFinal).toBe("2025-10-24");
    expect(r.resultado.diasContados).toHaveLength(15);
    expect(r.resultado.passos.join(" ")).toContain("art. 224");
  });

  it("pula o feriado nacional de 20/11 (Consciência Negra): 20 dias úteis desde a disponibilização na segunda 27/10/2025 vencem em 26/11/2025", () => {
    const r = calcularPrazo({ data: "2025-10-27", tipoInicio: "disponibilizacao", dias: 20, contagem: "uteis" });
    expect(r.ok && r.resultado.dataFinal).toBe("2025-11-26");
    if (!r.ok) return;
    const motivos = r.resultado.pulados.map((p) => p.motivo);
    expect(motivos).toContain("feriado_nacional");
    expect(r.resultado.pulados.some((p) => p.de === "2025-11-20" && p.descricao.includes("Lei 14.759/2023"))).toBe(true);
  });

  it("o mesmo prazo em 2023 NÃO pula 20/11 (a lei é de dez/2023)", () => {
    // Publicação segunda 30/10/2023; começa 31/10 (terça). 2/11 (Finados, quinta) e 15/11 (quarta) são feriados.
    // 31/10(1), 1/11(2), [2/11], 3/11(3), 6(4),7(5),8(6),9(7),10(8), 13(9),14(10),[15],16(11),17(12), 20(13),21(14),22(15)
    expect(final({ data: "2023-10-30", tipoInicio: "publicacao", dias: 15, contagem: "uteis" })).toBe("2023-11-22");
  });

  it("suspensão de 20/12 a 20/01 (art. 220): 15 dias úteis desde a disponibilização na segunda 15/12/2025 vencem em 05/02/2026", () => {
    // pub. 16/12; começa qua 17/12: 17(1), 18(2), 19(3); suspenso 20/12 a 20/01; 21/01(4), 22(5), 23(6), 26..30(7..11), 02/02..05/02(12..15)
    const r = calcularPrazo({ data: "2025-12-15", tipoInicio: "disponibilizacao", dias: 15, contagem: "uteis" });
    expect(r.ok && r.resultado.dataFinal).toBe("2026-02-05");
    if (!r.ok) return;
    const susp = r.resultado.pulados.find((p) => p.motivo === "suspensao_cpc");
    expect(susp?.de).toBe("2025-12-20");
    expect(susp?.ate).toBe("2026-01-20");
    expect(susp?.dias).toBe(32);
  });

  it("sem a suspensão (opção desligada) conta os dias úteis normais, sem feriados que caiam em 25/12 e 01/01", () => {
    // 17(1), 18(2), 19(3), 22(4), 23(5), 24(6), [25], 26(7), 29(8), 30(9), 31(10), [01/01], 02/01(11), 05(12), 06(13), 07(14), 08(15)
    expect(final({ data: "2025-12-15", tipoInicio: "disponibilizacao", dias: 15, contagem: "uteis", aplicarSuspensao: false })).toBe("2026-01-08");
  });

  it("dia sem expediente cadastrado no calendário do escritório é pulado", () => {
    const base: EntradaCalculo = { data: "2025-10-02", tipoInicio: "disponibilizacao", dias: 15, contagem: "uteis" };
    expect(final({ ...base, calendario: [{ data: "2025-10-08", descricao: "Feriado municipal", tipo: "feriado_local" }] })).toBe("2025-10-27");
    // data de calendário com formato inválido é ignorada
    expect(final({ ...base, calendario: [{ data: "2025-13-45", descricao: "x", tipo: "outro" }] })).toBe("2025-10-24");
  });

  it("publicação na sexta: a contagem começa na segunda (Súmula 310 do STF e art. 224, § 3º)", () => {
    expect(final({ data: "2025-10-03", tipoInicio: "publicacao", dias: 5, contagem: "uteis" })).toBe("2025-10-10");
  });

  it("intimação eletrônica: dia do começo é o dia útil seguinte à consulta (art. 231, V)", () => {
    // consulta sexta 03/10 → começo seg 06/10 → conta a partir de ter 07/10: 7,8,9,10,13
    const r = calcularPrazo({ data: "2025-10-03", tipoInicio: "consulta_eletronica", dias: 5, contagem: "uteis" });
    expect(r.ok && r.resultado.diaDoComeco).toBe("2025-10-06");
    expect(r.ok && r.resultado.dataFinal).toBe("2025-10-13");
  });

  it("1 dia útil depois de uma sexta é a segunda", () => {
    expect(final({ data: "2025-10-03", tipoInicio: "dia_do_comeco", dias: 1, contagem: "uteis" })).toBe("2025-10-06");
  });
});

describe("contagem em dias corridos", () => {
  it("30 dias corridos contados do dia seguinte ao dia do começo (03/03/2025 → 02/04/2025)", () => {
    expect(final({ data: "2025-03-03", tipoInicio: "dia_do_comeco", dias: 30, contagem: "corridos" })).toBe("2025-04-02");
  });
  it("vencimento em sábado passa para a segunda (5 dias corridos desde 10/03/2025: 15/03 sábado → 17/03)", () => {
    const r = calcularPrazo({ data: "2025-03-10", tipoInicio: "dia_do_comeco", dias: 5, contagem: "corridos" });
    expect(r.ok && r.resultado.dataFinal).toBe("2025-03-17");
    if (r.ok) expect(r.resultado.passos.join(" ")).toContain("não é dia útil");
  });
  it("prorroga por cima de domingo e feriado nacional em sequência (10 dias desde 10/04/2025: 20/04 domingo, 21/04 Tiradentes → 22/04)", () => {
    expect(final({ data: "2025-04-10", tipoInicio: "dia_do_comeco", dias: 10, contagem: "corridos" })).toBe("2025-04-22");
  });
  it("os dias de suspensão não contam (10 dias corridos desde 15/12/2025)", () => {
    // começo 15/12 (dia do começo); início da conta ter 16/12: 16(1),17(2),18(3),19(4); suspenso até 20/01; 21(5),22(6),23(7),24(8),25(9),26(10)
    // 26/01/2026 é segunda; contados: 21/01..26/01 → 26/01 → segunda-feira (útil)
    expect(final({ data: "2025-12-15", tipoInicio: "dia_do_comeco", dias: 10, contagem: "corridos" })).toBe("2026-01-26");
  });
});

describe("validação", () => {
  const ok: EntradaCalculo = { data: "2025-10-02", tipoInicio: "publicacao", dias: 5, contagem: "uteis" };
  it("rejeita entradas inválidas", () => {
    for (const ruim of [
      { ...ok, data: "2025-02-30" },
      { ...ok, data: "2010-01-01" },
      { ...ok, dias: 0 },
      { ...ok, dias: 1.5 },
      { ...ok, dias: 366 },
      { ...ok, contagem: "x" as never },
      { ...ok, tipoInicio: "x" as never },
    ]) {
      expect(calcularPrazo(ruim).ok).toBe(false);
    }
    expect(calcularPrazo(ok).ok).toBe(true);
  });
  it("sempre traz o aviso de conferência", () => {
    const r = calcularPrazo(ok);
    expect(r.ok && r.resultado.avisos[0]).toBe("Confira o resultado com o calendário do seu tribunal; a responsabilidade pelo prazo é do advogado.");
  });
});
