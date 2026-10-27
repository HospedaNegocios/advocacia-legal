import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));
  return {
    plugins: [
      cloudflareTest({
        main: "./src/server/index.ts",
        miniflare: {
          compatibilityDate: "2026-08-01",
          d1Databases: ["DB"],
          bindings: { AMBIENTE: "teste", MIGRACOES_TESTE: migrations },
          assets: { directory: "./test/ativos-vazios", binding: "ASSETS" },
        },
      }),
    ],
    test: { include: ["test/**/*.test.ts"] },
  };
});
