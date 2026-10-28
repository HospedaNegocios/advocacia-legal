import type { Context } from "hono";
import type { Env } from "./env";
import type { UsuarioComEscritorio } from "./db/repositorio";
import type { UsuarioPortalComContexto } from "./db/portal";

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

/** Sessão do PORTAL DO CLIENTE (cookie `__Host-portal`, tabela própria). Escritório e cliente vêm SOMENTE daqui. */
export interface ContextoSessaoPortal {
  sessaoId: string;
  usuario: UsuarioPortalComContexto;
  tenantId: string;
  clienteId: string;
}

export interface Variaveis {
  sessao: ContextoSessao;
  sessaoPortal: ContextoSessaoPortal;
}

export type Ctx = Context<{ Bindings: Env; Variables: Variaveis }>;
