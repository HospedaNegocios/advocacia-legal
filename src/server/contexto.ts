import type { Context } from "hono";
import type { Env } from "./env";
import type { UsuarioComEscritorio } from "./db/repositorio";

/** Dados da sessão autenticada. O escritório vem SOMENTE daqui. */
export interface ContextoSessao {
  sessaoId: string;
  /** Sessão que só pode configurar o 2FA. */
  pendente2fa: boolean;
  /** Registro interno (contém hash de senha e segredo TOTP): nunca devolver em respostas. */
  usuario: UsuarioComEscritorio;
  /** Escritório da sessão (NULL só para o dono da plataforma). */
  tenantId: string | null;
}

export interface Variaveis {
  sessao: ContextoSessao;
}

export type Ctx = Context<{ Bindings: Env; Variables: Variaveis }>;
