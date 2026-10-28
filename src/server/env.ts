export type Ambiente = "dev" | "prod" | "teste";

/** Parte do binding Workers AI que usamos (o tipo completo exige o nome do modelo na compilação). */
export interface BindingIa {
  run(modelo: string, entrada: Record<string, unknown>): Promise<unknown>;
}

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
  /** Endereço remetente dos alertas (precisa ser de um domínio verificado no Resend). */
  EMAIL_REMETENTE?: string;
  /** "false" desliga a busca diária no DJEN (ausente = ligada). */
  DJEN_COLETA_ATIVA?: string;
  /** Worker secret: chave de API do Resend (gravada pelo workflow `configurar-resend`). Nunca em código nem em log. */
  RESEND_API_KEY?: string;
  /** Binding Workers AI (resumo das intimações). Ausente = recurso indisponível. */
  AI?: BindingIa;
}
