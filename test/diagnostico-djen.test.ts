import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prepararBanco } from "./aplicar-migracoes";
import { chamar, criarEscritorio, sessaoDeDono, sessaoDeUsuario } from "./ajuda";

prepararBanco();

const ROTA = "/api/plataforma/diagnostico/djen";
let chamadas: { url: string; init?: RequestInit | undefined }[] = [];

function simularFetch(resposta: () => Promise<Response>) {
  const original = globalThis.fetch;
  vi.stubGlobal("fetch", (entrada: any, init?: RequestInit) => {
    const url = typeof entrada === "string" ? entrada : (entrada.url ?? String(entrada));
    if (!url.startsWith("https://comunicaapi.pje.jus.br/")) return original(entrada, init);
    chamadas.push({ url, init });
    return resposta();
  });
}
async function liberarLimite() {
  await env.DB.prepare("DELETE FROM limites_taxa WHERE chave = 'diagnostico-djen'").run();
}

beforeEach(async () => {
  chamadas = [];
  await liberarLimite();
});
afterEach(() => vi.unstubAllGlobals());

describe("diagnóstico do DJEN", () => {
  it("200 JSON: conta itens, faz uma só chamada com os parâmetros certos e audita", async () => {
    simularFetch(async () => new Response(JSON.stringify({ status: "success", count: 2, items: [{ a: 1 }, { a: 2 }] }), { status: 200, headers: { "content-type": "application/json" } }));
    const dono = await sessaoDeDono();
    const r = await chamar("POST", ROTA, { cookie: dono.cookie });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, status: 200, itens: 2, trecho: null, erro: null, contentType: "application/json" });
    expect(typeof r.json.duracaoMs).toBe("number");
    expect(chamadas).toHaveLength(1);
    const u = new URL(chamadas[0]!.url);
    expect(u.searchParams.get("siglaTribunal")).toBe("TJSP");
    expect(u.searchParams.get("dataDisponibilizacaoInicio")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(u.searchParams.get("dataDisponibilizacaoInicio")).toBe(u.searchParams.get("dataDisponibilizacaoFim"));
    expect(u.searchParams.get("pagina")).toBe("1");
    expect(u.searchParams.get("itensPorPagina")).toBe("5");
    const log = await env.DB.prepare("SELECT detalhes FROM audit_log WHERE acao = 'diagnostico_djen' AND user_id = ?").bind(dono.id).first<{ detalhes: string }>();
    expect(JSON.parse(log!.detalhes)).toMatchObject({ status: 200 });
  });

  it("200 com formato desconhecido: itens nulo", async () => {
    simularFetch(async () => new Response("não é json", { status: 200 }));
    const dono = await sessaoDeDono();
    const r = await chamar("POST", ROTA, { cookie: dono.cookie });
    expect(r.json).toMatchObject({ ok: true, itens: null, trecho: null });
  });

  it("403 HTML: devolve trecho limpo de até 300 caracteres", async () => {
    simularFetch(async () => new Response(`<html>\n  <body>${"Acesso   negado ".repeat(50)}</body></html>`, { status: 403, statusText: "Forbidden", headers: { "content-type": "text/html" } }));
    const dono = await sessaoDeDono();
    const r = await chamar("POST", ROTA, { cookie: dono.cookie });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: false, status: 403, itens: null, contentType: "text/html" });
    expect(r.json.trecho.length).toBeLessThanOrEqual(300);
    expect(r.json.trecho).not.toMatch(/\s{2}/);
    expect(r.json.trecho).toContain("Acesso negado");
  });

  it("tempo esgotado ou falha de rede: devolve erro", async () => {
    simularFetch(async () => {
      throw new DOMException("aborted", "AbortError");
    });
    const dono = await sessaoDeDono();
    const r = await chamar("POST", ROTA, { cookie: dono.cookie });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: false, status: null, itens: null });
    expect(r.json.erro).toContain("Falha de rede");
  });

  it("limita a 1 chamada a cada 10 segundos", async () => {
    simularFetch(async () => new Response("[]", { status: 200 }));
    const dono = await sessaoDeDono();
    expect((await chamar("POST", ROTA, { cookie: dono.cookie })).status).toBe(200);
    const segunda = await chamar("POST", ROTA, { cookie: dono.cookie });
    expect(segunda.status).toBe(429);
    expect(segunda.json.erro).toContain("Aguarde");
    expect(chamadas).toHaveLength(1);
  });

  it("só o dono: sem sessão 401, usuário de escritório 403, sem CSRF bloqueado", async () => {
    simularFetch(async () => new Response("[]", { status: 200 }));
    expect((await chamar("POST", ROTA)).status).toBe(401);
    const usuario = await sessaoDeUsuario(await criarEscritorio());
    expect((await chamar("POST", ROTA, { cookie: usuario.cookie })).status).toBe(403);
    const dono = await sessaoDeDono();
    expect((await chamar("POST", ROTA, { cookie: dono.cookie, marca: null })).status).toBe(403);
    expect((await chamar("POST", ROTA, { cookie: dono.cookie, origem: "https://outro.test" })).status).toBe(403);
    expect(chamadas).toHaveLength(0);
  });
});
