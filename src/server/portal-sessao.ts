import { createMiddleware } from "hono/factory";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Env } from "./env";
import type { Ctx, Variaveis } from "./contexto";
import { criarAcessoPortal } from "./db/portal";
import type { UsuarioPortalComContexto } from "./db/portal";
import { FORMATO_TOKEN, gerarToken, sha256Hex } from "./auth/codificacao";
import { auditar } from "./auditoria";
import { ipDe } from "./sessao";
import { respostaErro } from "./validacao";

// Sessão do portal do cliente: cookie, tabela e middleware PRÓPRIOS. Não aceita (nem gera) sessão do escritório.
export const NOME_COOKIE_PORTAL = "__Host-portal";
export const DURACAO_SESSAO_PORTAL_MS = 8 * 60 * 60 * 1000;

/**
 * Conta do portal pode entrar: acesso ativo e com senha definida, escritório em teste/ativo, cliente ativo
 * e com consentimento LGPD (regra provisória, ver docs/PORTAL.md).
 */
export function acessoHabilitado(u: UsuarioPortalComContexto): boolean {
  if (u.ativo !== 1 || u.senha_definida !== 1) return false;
  if (u.tenant_status !== "teste" && u.tenant_status !== "ativo") return false;
  return u.cliente_ativo === 1 && u.consentimento_ativo === 1;
}

export function estaBloqueado(u: UsuarioPortalComContexto, agoraIso = new Date().toISOString()): boolean {
  return u.bloqueado_ate !== null && u.bloqueado_ate > agoraIso;
}

export async function abrirSessaoPortal(c: Ctx, u: UsuarioPortalComContexto): Promise<void> {
  const token = gerarToken();
  const acesso = criarAcessoPortal(c.env.DB);
  await acesso.criarSessao({
    id: await sha256Hex(token),
    tenant_id: u.tenant_id,
    portal_usuario_id: u.id,
    expira_em: new Date(Date.now() + DURACAO_SESSAO_PORTAL_MS).toISOString(),
    ip: ipDe(c),
    user_agent: (c.req.header("User-Agent") ?? "").slice(0, 200) || null,
  });
  setCookie(c, NOME_COOKIE_PORTAL, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/",
    maxAge: Math.floor(DURACAO_SESSAO_PORTAL_MS / 1000),
  });
  await acesso.registrarAcesso(u.id, new Date().toISOString());
  await acesso.limparSessoesExpiradas();
}

export function limparCookiePortal(c: Ctx): void {
  deleteCookie(c, NOME_COOKIE_PORTAL, { path: "/", secure: true });
}

/** Lê o cookie do portal e valida no banco. Devolve null se ausente, inválida, expirada ou acesso inabilitado. */
export async function lerSessaoPortal(c: Ctx) {
  const token = getCookie(c, NOME_COOKIE_PORTAL);
  if (!token || !FORMATO_TOKEN.test(token)) return null;
  const acesso = criarAcessoPortal(c.env.DB);
  const id = await sha256Hex(token);
  const linha = await acesso.buscarSessao(id);
  if (!linha) return null;
  if (linha.expira_em <= new Date().toISOString()) {
    await acesso.excluirSessao(id);
    return null;
  }
  // O escritório e o acesso vêm do registro da sessão; o acesso é conferido de novo a cada requisição.
  const usuario = await acesso.usuario(linha.portal_usuario_id, linha.tenant_id);
  if (!usuario || !acessoHabilitado(usuario)) {
    await acesso.excluirSessao(id);
    return null;
  }
  return { sessaoId: id, usuario, tenantId: usuario.tenant_id, clienteId: usuario.cliente_id };
}

export const exigirSessaoPortal = createMiddleware<{ Bindings: Env; Variables: Variaveis }>(async (c, next) => {
  const sessao = await lerSessaoPortal(c);
  if (!sessao) {
    limparCookiePortal(c);
    return respostaErro(c, 401, "Sessão ausente ou expirada. Entre novamente.");
  }
  c.set("sessaoPortal", sessao);
  await next();
});

/** Auditoria do portal: sem dados pessoais nem texto. Só ids; o autor é o acesso do portal (não existe em `users`). */
export async function auditarPortal(c: Ctx, tenantId: string, acao: string, portalUsuarioId: string | null, detalhes?: Record<string, string | number | boolean | null>) {
  await auditar(c.env.DB, {
    tenantId,
    userId: null,
    acao,
    entidade: "portal_usuarios",
    entidadeId: portalUsuarioId,
    ...(detalhes ? { detalhes } : {}),
    ip: ipDe(c),
  });
}
