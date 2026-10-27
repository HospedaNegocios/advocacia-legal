import { describe, expect, it } from "vitest";
import { assinaturaDosPrazos, deveAvisar, gravarDispensa, lerDispensa } from "../src/web/alertas-prazos";
import type { PrazoAlerta } from "../src/web/alertas-prazos";

const p = (id: string, extra: Partial<PrazoAlerta> = {}): PrazoAlerta => ({ id, titulo: "x", data_fatal: "2026-11-10", hora: null, processo_id: null, processo_numero: null, situacao: "hoje", dias_para_vencer: 0, atualizado_em: "2026-11-01T00:00:00.000Z", ...extra });

describe("popup de prazos: quando reaparece", () => {
  it("só avisa se há prazos e eles mudaram desde a dispensa", () => {
    const lista = [p("a"), p("b")];
    expect(deveAvisar([], null)).toBe(false);
    expect(deveAvisar(lista, null)).toBe(true);
    expect(deveAvisar(lista, assinaturaDosPrazos(lista))).toBe(false);
    // A ordem não importa.
    expect(deveAvisar([p("b"), p("a")], assinaturaDosPrazos(lista))).toBe(false);
    // Prazo novo, data alterada ou edição fazem o aviso voltar.
    expect(deveAvisar([...lista, p("c")], assinaturaDosPrazos(lista))).toBe(true);
    expect(deveAvisar([p("a", { data_fatal: "2026-11-11" }), p("b")], assinaturaDosPrazos(lista))).toBe(true);
    expect(deveAvisar([p("a", { atualizado_em: "2026-11-02T00:00:00.000Z" }), p("b")], assinaturaDosPrazos(lista))).toBe(true);
    // Um prazo que saiu (concluído) não faz o aviso reaparecer para quem já viu os demais.
    expect(deveAvisar([p("a")], assinaturaDosPrazos(lista))).toBe(false);
  });

  it("não quebra quando o navegador não permite guardar dados", () => {
    expect(() => gravarDispensa("u1", "2026-11-10", "x")).not.toThrow();
    expect(lerDispensa("u1", "2026-11-10")).toBeNull();
  });
});
