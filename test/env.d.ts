import type { D1Migration } from "cloudflare:test";
import type { Env as EnvApp } from "../src/server/env";

declare global {
  namespace Cloudflare {
    interface Env extends EnvApp {
      MIGRACOES_TESTE: D1Migration[];
    }
  }
}
