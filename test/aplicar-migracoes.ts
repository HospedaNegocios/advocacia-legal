import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll } from "vitest";

// Aplica as migrações de /migrations no D1 local de teste (antes de cada arquivo de teste).
export function prepararBanco(): void {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, env.MIGRACOES_TESTE);
  });
}
