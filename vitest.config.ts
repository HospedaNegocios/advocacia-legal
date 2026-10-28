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
          r2Buckets: ["ARQUIVOS"],
          bindings: {
            AMBIENTE: "teste",
            MIGRACOES_TESTE: migrations,
            // Valor FIXO só para testes (bytes 0..31 em base64). Não é segredo real.
            CHAVE_CRIPTO: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
          },
          assets: { directory: "./test/ativos-vazios", binding: "ASSETS" },
        },
      }),
    ],
    // Testes com várias senhas PBKDF2 (portal, equipe) passam de 5 s em máquina lenta (CI).
    test: { include: ["test/**/*.test.ts"], testTimeout: 30_000 },
  };
});
