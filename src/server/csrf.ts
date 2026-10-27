import { createMiddleware } from "hono/factory";
import type { Env } from "./env";

/**
 * Proteção CSRF para toda requisição que altera dados em /api:
 *  - cabeçalho Origin igual à origem do próprio servidor;
 *  - cabeçalho X-Requested-With: advocacia (um formulário de outro site não consegue enviar).
 * Somado ao cookie SameSite=Strict.
 */
export const protecaoCsrf = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const metodo = c.req.method;
  if (metodo !== "GET" && metodo !== "HEAD" && metodo !== "OPTIONS") {
    const origemPropria = new URL(c.req.url).origin;
    const origem = c.req.header("Origin");
    const marca = c.req.header("X-Requested-With");
    if (origem !== origemPropria || marca !== "advocacia") {
      return c.json({ ok: false, erro: "Requisição bloqueada por segurança." }, 403);
    }
  }
  await next();
});
