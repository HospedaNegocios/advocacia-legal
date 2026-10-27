import { describe, expect, it } from "vitest";
import { contarPorPlano, contarPorStatus, novosNosUltimosDias, serieMensal, testesVencendo, totalUsuarios } from "../src/web/painel";
import type { EscritorioResumo } from "../src/web/painel";

const agora = new Date(2026, 9, 27, 12, 0, 0); // 27/10/2026
const dias = (n: number) => new Date(agora.getTime() + n * 24 * 3600 * 1000).toISOString();

function esc(p: Partial<EscritorioResumo> & { id: string }): EscritorioResumo {
  return { nome: p.id, plano: "solo", status: "ativo", teste_ate: null, criado_em: dias(-1), usuarios: 1, ...p };
}

describe("cálculos do painel do dono", () => {
  const lista = [
    esc({ id: "a", plano: "banca", usuarios: 4 }),
    esc({ id: "b", status: "teste", teste_ate: dias(3), criado_em: dias(-11) }),
    esc({ id: "c", status: "teste", teste_ate: dias(20), criado_em: dias(-60) }),
    esc({ id: "d", status: "teste", teste_ate: dias(-2), criado_em: dias(-16) }),
    esc({ id: "e", status: "suspenso", plano: "escritorio", usuarios: 0, criado_em: dias(-100) }),
  ];

  it("conta por situação, por plano e usuários", () => {
    expect(contarPorStatus(lista)).toEqual({ teste: 3, ativo: 1, suspenso: 1, cancelado: 0 });
    expect(contarPorPlano(lista)).toEqual({ solo: 3, escritorio: 1, banca: 1 });
    expect(totalUsuarios(lista)).toBe(7);
  });

  it("lista só testes que vencem em até 7 dias, incluindo os já vencidos, em ordem", () => {
    const v = testesVencendo(lista, agora);
    expect(v.map((x) => x.escritorio.id)).toEqual(["d", "b"]);
    expect(v[0]?.dias).toBeLessThan(0);
  });

  it("conta novos escritórios nos últimos 30 dias", () => {
    expect(novosNosUltimosDias(lista, agora)).toBe(3);
  });

  it("monta série mensal real com acumulado", () => {
    const s = serieMensal(lista, agora, 6);
    expect(s).toHaveLength(6);
    expect(s[5]?.chave).toBe("2026-10");
    expect(s[5]?.acumulado).toBe(5);
    expect(s.reduce((t, p) => t + p.criados, 0)).toBeLessThanOrEqual(5);
    expect(s[0]?.acumulado).toBeLessThanOrEqual(s[5]?.acumulado ?? 0);
  });

  it("lista vazia não quebra", () => {
    expect(serieMensal([], agora, 3).every((p) => p.criados === 0 && p.acumulado === 0)).toBe(true);
    expect(testesVencendo([], agora)).toEqual([]);
  });
});
