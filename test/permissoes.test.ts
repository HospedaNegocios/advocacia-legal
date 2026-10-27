import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { Env } from "../src/server/env";
import type { Variaveis } from "../src/server/contexto";
import { exigirPermissao, exigirSessao } from "../src/server/sessao";
import { prepararBanco } from "./aplicar-migracoes";
import { chamar, criarEscritorio, criarUsuario, entrar, sessaoDeDono, sessaoDeUsuario } from "./ajuda";

prepararBanco();

const nivelDe = async (cookie: string) => (await chamar("GET", "/api/eu", { cookie })).json.permissoes.financeiro;
const definir = (cookie: string, id: string, nivel: unknown) =>
  chamar("PUT", `/api/equipe/${id}/permissoes/financeiro`, { cookie, corpo: { nivel } });

async function cenario() {
  const t = await criarEscritorio();
  const socio = await sessaoDeUsuario(t, "socio");
  const adv = await sessaoDeUsuario(t, "advogado");
  return { t, socio, adv };
}

describe("API de permissões do financeiro", () => {
  it("padrão é sem acesso; sócio é sempre edição", async () => {
    const { socio, adv } = await cenario();
    expect(await nivelDe(adv.cookie)).toBe("nenhum");
    expect(await nivelDe(socio.cookie)).toBe("edicao");
    const l = await chamar("GET", "/api/equipe/permissoes", { cookie: socio.cookie });
    expect(l.status).toBe(200);
    const porId = Object.fromEntries(l.json.usuarios.map((u: any) => [u.id, u]));
    expect(porId[adv.id]).toMatchObject({ financeiro: "nenhum", fixo: false });
    expect(porId[socio.id]).toMatchObject({ financeiro: "edicao", fixo: true });
    expect(JSON.stringify(l.json)).not.toMatch(/senha|totp/i);
  });

  it("sócio define leitura, edição e remove; vale na requisição seguinte", async () => {
    const { socio, adv } = await cenario();
    expect((await definir(socio.cookie, adv.id, "leitura")).status).toBe(200);
    expect(await nivelDe(adv.cookie)).toBe("leitura");
    expect((await definir(socio.cookie, adv.id, "edicao")).status).toBe(200);
    expect(await nivelDe(adv.cookie)).toBe("edicao");
    const r = await definir(socio.cookie, adv.id, "nenhum");
    expect(r.json).toMatchObject({ ok: true, financeiro: "nenhum" });
    expect(await nivelDe(adv.cookie)).toBe("nenhum");
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM permissoes_usuario WHERE usuario_id = ?").bind(adv.id).first<any>();
    expect(n.n).toBe(0);
  });

  it("só sócio consulta e altera; ninguém altera a si mesmo para ganhar acesso", async () => {
    const { adv, socio } = await cenario();
    expect((await chamar("GET", "/api/equipe/permissoes", { cookie: adv.cookie })).status).toBe(403);
    expect((await definir(adv.cookie, adv.id, "edicao")).status).toBe(403);
    expect(await nivelDe(adv.cookie)).toBe("nenhum");
    const sec = await sessaoDeUsuario((await env.DB.prepare("SELECT tenant_id FROM users WHERE id = ?").bind(socio.id).first<any>()).tenant_id, "secretaria");
    expect((await definir(sec.cookie, sec.id, "edicao")).status).toBe(403);
    expect((await chamar("GET", "/api/equipe/permissoes")).status).toBe(401);
  });

  it("sócio não pode ser rebaixado (409) e dono da plataforma não é alvo", async () => {
    const { t, socio } = await cenario();
    const outroSocio = await criarUsuario(t, "socio");
    for (const id of [socio.id, outroSocio.id]) {
      const r = await definir(socio.cookie, id, "nenhum");
      expect(r.status).toBe(409);
      expect(r.json.erro).toMatch(/acesso total/);
    }
    expect(await nivelDe(socio.cookie)).toBe("edicao");
    const dono = await sessaoDeDono();
    expect((await definir(socio.cookie, dono.id, "edicao")).status).toBe(404);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM permissoes_usuario WHERE usuario_id IN (?, ?, ?)").bind(socio.id, outroSocio.id, dono.id).first<any>();
    expect(n.n).toBe(0);
  });

  it("recusa usuário inativo e valores inválidos", async () => {
    const { socio, adv } = await cenario();
    await chamar("POST", `/api/equipe/usuarios/${adv.id}/desativar`, { cookie: socio.cookie });
    const r = await definir(socio.cookie, adv.id, "leitura");
    expect(r.status).toBe(409);
    const l = await chamar("GET", "/api/equipe/permissoes", { cookie: socio.cookie });
    expect(l.json.usuarios.some((u: any) => u.id === adv.id)).toBe(false);
    const outro = await criarUsuario((await env.DB.prepare("SELECT tenant_id FROM users WHERE id = ?").bind(socio.id).first<any>()).tenant_id, "advogado");
    for (const ruim of ["total", "", null, 1, "EDICAO"]) {
      expect((await definir(socio.cookie, outro.id, ruim)).status).toBe(400);
    }
  });

  it("isolamento: sócio do escritório A não vê nem altera usuário do B", async () => {
    const a = await cenario();
    const b = await cenario();
    await definir(b.socio.cookie, b.adv.id, "leitura");
    const lista = await chamar("GET", "/api/equipe/permissoes", { cookie: a.socio.cookie });
    const ids = lista.json.usuarios.map((u: any) => u.id);
    expect(ids).toContain(a.adv.id);
    expect(ids).not.toContain(b.adv.id);
    expect(ids).not.toContain(b.socio.id);
    const r = await definir(a.socio.cookie, b.adv.id, "edicao");
    expect(r.status).toBe(404);
    expect(await nivelDe(b.adv.cookie)).toBe("leitura");
    // O mesmo id de usuário no mesmo nome de escritório B não ganha nada pelo A.
    const auditoriaB = await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE tenant_id = ? AND acao = 'permissao_alterada'").bind(b.t).first<any>();
    expect(auditoriaB.n).toBe(1);
  });

  it("o banco recusa permissão cruzada entre escritórios", async () => {
    const a = await cenario();
    const b = await cenario();
    await expect(
      env.DB.prepare("INSERT INTO permissoes_usuario (id, tenant_id, usuario_id, modulo, nivel, atualizado_por, atualizado_em) VALUES (?, ?, ?, 'financeiro', 'leitura', ?, 'x')")
        .bind(crypto.randomUUID(), a.t, b.adv.id, a.socio.id)
        .run(),
    ).rejects.toThrow();
  });

  it("audita cada mudança (ids, de e para), sem repetir quando nada mudou", async () => {
    const { t, socio, adv } = await cenario();
    await definir(socio.cookie, adv.id, "leitura");
    await definir(socio.cookie, adv.id, "leitura");
    await definir(socio.cookie, adv.id, "edicao");
    await definir(socio.cookie, adv.id, "nenhum");
    const { results } = await env.DB.prepare("SELECT user_id, entidade_id, detalhes FROM audit_log WHERE tenant_id = ? AND acao = 'permissao_alterada' ORDER BY criado_em, rowid").bind(t).all<any>();
    expect(results.map((r) => JSON.parse(r.detalhes))).toEqual([
      { modulo: "financeiro", de: "nenhum", para: "leitura" },
      { modulo: "financeiro", de: "leitura", para: "edicao" },
      { modulo: "financeiro", de: "edicao", para: "nenhum" },
    ]);
    expect(results.every((r) => r.user_id === socio.id && r.entidade_id === adv.id)).toBe(true);
    expect(JSON.stringify(results)).not.toMatch(/@/);
  });
});

describe("exigirPermissao", () => {
  const app = new Hono<{ Bindings: Env; Variables: Variaveis }>();
  app.use("*", exigirSessao({ papel: "escritorio" }));
  app.get("/ler", exigirPermissao("financeiro", "leitura"), (c) => c.json({ ok: true }));
  app.get("/editar", exigirPermissao("financeiro", "edicao"), (c) => c.json({ ok: true }));
  const semSessao = new Hono<{ Bindings: Env; Variables: Variaveis }>();
  semSessao.get("/ler", exigirPermissao("financeiro", "leitura"), (c) => c.json({ ok: true }));
  const status = async (rota: string, cookie: string) => (await app.request(rota, { headers: { Cookie: cookie } }, env)).status;

  it("matriz nenhum/leitura/edição x exigir leitura/edição", async () => {
    const { socio, adv } = await cenario();
    expect([await status("/ler", adv.cookie), await status("/editar", adv.cookie)]).toEqual([403, 403]);
    await definir(socio.cookie, adv.id, "leitura");
    expect([await status("/ler", adv.cookie), await status("/editar", adv.cookie)]).toEqual([200, 403]);
    await definir(socio.cookie, adv.id, "edicao");
    expect([await status("/ler", adv.cookie), await status("/editar", adv.cookie)]).toEqual([200, 200]);
    await definir(socio.cookie, adv.id, "nenhum");
    expect([await status("/ler", adv.cookie), await status("/editar", adv.cookie)]).toEqual([403, 403]);
  });

  it("sócio sempre passa; mensagem em português simples", async () => {
    const { socio, adv } = await cenario();
    expect([await status("/ler", socio.cookie), await status("/editar", socio.cookie)]).toEqual([200, 200]);
    const r = await app.request("/ler", { headers: { Cookie: adv.cookie } }, env);
    expect((await r.json<any>()).erro).toMatch(/não tem acesso/);
  });

  it("dono da plataforma e requisição sem sessão são recusados", async () => {
    const dono = await sessaoDeDono();
    expect(await status("/ler", dono.cookie)).toBe(403);
    expect((await app.request("/ler", {}, env)).status).toBe(401);
    expect((await semSessao.request("/ler", {}, env)).status).toBe(401);
  });

  it("usuário desativado perde o acesso mesmo com permissão gravada", async () => {
    const { socio, adv } = await cenario();
    await definir(socio.cookie, adv.id, "edicao");
    await chamar("POST", `/api/equipe/usuarios/${adv.id}/desativar`, { cookie: socio.cookie });
    expect(await status("/ler", adv.cookie)).toBe(401);
    await chamar("POST", `/api/equipe/usuarios/${adv.id}/reativar`, { cookie: socio.cookie });
    const e = await entrar(adv.email);
    expect(await status("/editar", e.cookie!)).toBe(200);
  });
});
