export type Ambiente = "dev" | "prod" | "teste";

export interface Env {
  DB: D1Database;
  ARQUIVOS: R2Bucket;
  ASSETS: Fetcher;
  AMBIENTE: Ambiente;
  /** Worker secret: 32 bytes em base64. Cifra os segredos TOTP e assina o desafio do 2FA. */
  CHAVE_CRIPTO: string;
}
