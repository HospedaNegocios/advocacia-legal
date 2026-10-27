import { Hono } from "hono";
import type { Env } from "./env";
import type { Variaveis } from "./contexto";
import { cabecalhosDeSeguranca } from "./seguranca";
import { protecaoCsrf } from "./csrf";
import { rotasAuth } from "./rotas/auth";
import { rotasAcesso, rotasDoisFatores } from "./rotas/acesso";
import { rotasEu } from "./rotas/eu";
import { rotasPlataforma } from "./rotas/plataforma";
import { rotasEquipe } from "./rotas/equipe";
import { rotasEscritorio } from "./rotas/escritorio";

// REGRA DE SEGURANÇA: o escritório (tenant) vem SEMPRE da sessão do usuário (cookie validado
// no banco), nunca de parâmetro, corpo, cabeçalho ou cookie escolhido pelo navegador.
// Nenhuma rota pode aceitar `tenant_id`.
const app = new Hono<{ Bindings: Env; Variables: Variaveis }>();

app.use("*", cabecalhosDeSeguranca);

app.use("/api/*", async (c, next) => {
  await next();
  c.res.headers.set("Cache-Control", "no-store");
});
app.use("/api/*", protecaoCsrf);

app.get("/api/saude", (c) => c.json({ ok: true, ambiente: c.env.AMBIENTE }));

app.route("/api/auth", rotasAuth);
app.route("/api/acesso", rotasAcesso);
app.route("/api/2fa", rotasDoisFatores);
app.route("/api/eu", rotasEu);
app.route("/api/plataforma", rotasPlataforma);
app.route("/api/equipe", rotasEquipe);
app.route("/api/escritorio", rotasEscritorio);

app.notFound((c) => {
  // Rotas /api desconhecidas devolvem JSON; o restante é tratado pelos arquivos estáticos (SPA).
  if (new URL(c.req.url).pathname.startsWith("/api/")) {
    return c.json({ ok: false, erro: "Rota não encontrada." }, 404);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

app.onError((erro, c) => {
  // Nunca devolve detalhes internos nem registra corpo/cabeçalhos (podem ter senhas ou tokens).
  console.error("erro-interno", erro instanceof Error ? erro.name : "desconhecido");
  return c.json({ ok: false, erro: "Erro interno. Tente novamente." }, 500);
});

export default app;
