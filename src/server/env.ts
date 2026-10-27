export type Ambiente = "dev" | "prod" | "teste";

export interface Env {
  DB: D1Database;
  ARQUIVOS: R2Bucket;
  ASSETS: Fetcher;
  AMBIENTE: Ambiente;
  /** Worker secret: 32 bytes em base64. Cifra os segredos TOTP e assina o desafio do 2FA. */
  CHAVE_CRIPTO: string;
  /** Endereço do app neste ambiente, sem barra no fim (vem do wrangler; usado nos links dos e-mails). */
  URL_APP?: string;
  /** "true" liga o e-mail diário de prazos. Qualquer outro valor (ou ausente) deixa desligado. */
  EMAIL_ALERTAS_ATIVO?: string;
  /** Endereço remetente dos alertas (precisa estar em domínio com Email Sending configurado na Cloudflare). */
  EMAIL_REMETENTE?: string;
  /** "false" desliga a busca diária no DJEN (ausente = ligada). */
  DJEN_COLETA_ATIVA?: string;
  /** Binding `send_email` do Cloudflare Email Service. */
  EMAIL?: SendEmail;
}
