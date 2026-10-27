import { describe, expect, it } from "vitest";

// Garante a regra do CLAUDE.md: SQL só dentro de src/server/db/.
const fontes = import.meta.glob("/src/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<
  string,
  string
>;

describe("SQL somente na camada de dados", () => {
  it("encontra os arquivos-fonte", () => {
    expect(Object.keys(fontes).length).toBeGreaterThan(3);
  });

  it("nenhum arquivo fora de src/server/db usa .prepare( ou .exec( ou .batch(", () => {
    const infratores = Object.entries(fontes)
      .filter(([caminho]) => !caminho.startsWith("/src/server/db/"))
      .filter(([, texto]) => /\.(prepare|exec|batch)\s*\(/.test(texto))
      .map(([caminho]) => caminho);
    expect(infratores).toEqual([]);
  });
});
