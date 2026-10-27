import { Hono } from "hono";
import type { Env } from "./env";
import { cabecalhosDeSeguranca } from "./seguranca";

// REGRA DE SEGURANÇA: o escritório (tenant) vem SEMPRE da sessão do usuário
// (a ser implementada na próxima parte da Fase 0), nunca de parâmetro, corpo,
// cabeçalho ou cookie escolhido pelo navegador. Nenhuma rota pode aceitar `tenant_id`.
const app = new Hono<{ Bindings: Env }>();

app.use("*", cabecalhosDeSeguranca);

app.get("/api/saude", (c) => c.json({ ok: true, ambiente: c.env.AMBIENTE }));

app.notFound((c) => {
  // Rotas /api desconhecidas devolvem JSON; o restante é tratado pelos arquivos estáticos (SPA).
  if (new URL(c.req.url).pathname.startsWith("/api/")) {
    return c.json({ ok: false, erro: "Rota não encontrada." }, 404);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
