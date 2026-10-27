export type Ambiente = "dev" | "prod" | "teste";

export interface Env {
  DB: D1Database;
  ARQUIVOS: R2Bucket;
  ASSETS: Fetcher;
  AMBIENTE: Ambiente;
}
