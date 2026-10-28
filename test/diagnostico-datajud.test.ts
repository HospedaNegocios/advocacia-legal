import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prepararBanco } from "./aplicar-migracoes";
import { definirTempoLimiteParaTeste } from "../src/server/rotas/diagnostico-datajud";
import { chamar, criarEscritorio, sessaoDeDono, sessaoDeUsuario } from "./ajuda";

prepararBanco();

const ROTA = "/api/plataforma/diagnostico/datajud";
const CHAVE = "chave-secreta-de-teste-123";
let chamadas: { url: string; init?: RequestInit | undefined }[] = [];
const envMutavel = env as unknown as { DATAJUD_CHAVE?: string };

function simularFetch(resposta: (url: string) => Promise<Response>) {
  const original = globalThis.fetch;
  vi.stubGlobal("fetch", (entrada: any, init?: RequestInit) => {
    const url = typeof entrada === "string" ? entrada : (entrada.url ?? String(entrada));
    if (!url.startsWith("https://api-publica.datajud.cnj.jus.br/")) return original(entrada, init);
    chamadas.push({ url, init });
    return resposta(url);
  });
}
const json = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });

beforeEach(async () => {
  chamadas = [];
  envMutavel.DATAJUD_CHAVE = CHAVE;
  await env.DB.prepare("DELETE FROM limites_taxa WHERE chave = 'diagnostico-datajud'").run();
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete envMutavel.DATAJUD_CHAVE;
});

describe("diagnóstico do DataJud", () => {
  it("sem chave: 409 em português e nenhuma chamada", async () => {
    envMutavel.DATAJUD_CHAVE = "  ";
    simularFetch(async () => json({}));
    const dono = await sessaoDeDono();
    const r = await chamar("POST", ROTA, { cookie: dono.cookie });
    expect(r.status).toBe(409);
    expect(r.json.erro).toBe("A chave do DataJud não está configurada neste ambiente.");
    expect(chamadas).toHaveLength(0);
  });

  it("3 resultados com sucesso, chamadas certas e auditoria", async () => {
    simularFetch(async (url) => (url.endsWith("/") ? new Response("ok", { status: 200, headers: { "content-type": "text/plain" } }) : json({ hits: { hits: [{ _source: { segredo: 1 } }] } })));
    const dono = await sessaoDeDono();
    const r = await chamar("POST", ROTA, { cookie: dono.cookie });
    expect(r.status).toBe(200);
    expect(r.json.resultados).toHaveLength(3);
    const [tjdft, tjsp, simples] = r.json.resultados;
    expect(tjdft).toMatchObject({ nome: "TJDFT", ok: true, status: 200, hits: 1, erro: null, trecho: null });
    expect(tjsp).toMatchObject({ nome: "TJSP", ok: true, hits: 1 });
    expect(simples).toMatchObject({ ok: true, status: 200, hits: null });
    expect(typeof tjdft.duracaoMs).toBe("number");
    const busca = chamadas.find((c) => c.url.endsWith("api_publica_tjdft/_search"))!;
    expect(busca.init?.method).toBe("POST");
    expect((busca.init?.headers as Record<string, string>)["Authorization"]).toBe(`APIKey ${CHAVE}`);
    expect(JSON.parse(busca.init!.body as string)).toEqual({ size: 1, query: { match_all: {} } });
    const raiz = chamadas.find((c) => c.url === "https://api-publica.datajud.cnj.jus.br/")!;
    expect(raiz.init?.method).toBe("GET");
    expect(JSON.stringify(raiz.init?.headers)).not.toContain("Authorization");
    expect(JSON.stringify(r.json)).not.toContain("segredo");
    const log = await env.DB.prepare("SELECT detalhes FROM audit_log WHERE acao = 'diagnostico_datajud' AND user_id = ?").bind(dono.id).first<{ detalhes: string }>();
    expect(log!.detalhes).not.toContain(CHAVE);
  });

  it("um alvo com falha não derruba os outros; a chave nunca aparece", async () => {
    simularFetch(async (url) => {
      if (url.includes("tjsp")) throw new Error(`falha com ${CHAVE} no meio`);
      if (url.includes("tjdft")) return new Response(`<html>negado ${CHAVE}</html>`, { status: 401, headers: { "content-type": "text/html" } });
      return new Response("ok", { status: 200 });
    });
    const dono = await sessaoDeDono();
    const r = await chamar("POST", ROTA, { cookie: dono.cookie });
    expect(r.status).toBe(200);
    const [tjdft, tjsp, simples] = r.json.resultados;
    expect(tjdft).toMatchObject({ ok: false, status: 401 });
    expect(tjdft.trecho.length).toBeLessThanOrEqual(200);
    expect(tjsp).toMatchObject({ ok: false, status: null });
    expect(tjsp.erro.length).toBeLessThanOrEqual(150);
    expect(simples.ok).toBe(true);
    expect(JSON.stringify(r.json)).not.toContain(CHAVE);
    expect(JSON.stringify(r.json)).toContain("***");
  });

  it("tempo esgotado em 20 s vira erro textual", async () => {
    definirTempoLimiteParaTeste(50);
    try {
      vi.stubGlobal("fetch", (entrada: any, init?: RequestInit) => {
        const url = typeof entrada === "string" ? entrada : String(entrada.url ?? entrada);
        if (!url.includes("api_publica_tjsp")) return Promise.resolve(json({ hits: { hits: [] } }));
        return new Promise<Response>((_, rejeitar) => init?.signal?.addEventListener("abort", () => rejeitar(new DOMException("aborted", "AbortError"))));
      });
      const dono = await sessaoDeDono();
      const r = await chamar("POST", ROTA, { cookie: dono.cookie });
      expect(r.status).toBe(200);
      expect(r.json.resultados[1]).toMatchObject({ nome: "TJSP", ok: false, status: null });
      expect(r.json.resultados[1].erro).toContain("Tempo esgotado");
      expect(r.json.resultados[0].ok).toBe(true);
    } finally {
      definirTempoLimiteParaTeste(20_000);
    }
  });

  it("limita a 1 teste a cada 10 segundos", async () => {
    simularFetch(async () => json({ hits: { hits: [] } }));
    const dono = await sessaoDeDono();
    expect((await chamar("POST", ROTA, { cookie: dono.cookie })).status).toBe(200);
    const segunda = await chamar("POST", ROTA, { cookie: dono.cookie });
    expect(segunda.status).toBe(429);
    expect(segunda.json.erro).toContain("Aguarde");
    expect(chamadas).toHaveLength(3);
  });

  it("só o dono: sem sessão 401, usuário de escritório 403, sem CSRF bloqueado", async () => {
    simularFetch(async () => json({}));
    expect((await chamar("POST", ROTA)).status).toBe(401);
    const usuario = await sessaoDeUsuario(await criarEscritorio());
    expect((await chamar("POST", ROTA, { cookie: usuario.cookie })).status).toBe(403);
    const dono = await sessaoDeDono();
    expect((await chamar("POST", ROTA, { cookie: dono.cookie, marca: null })).status).toBe(403);
    expect(chamadas).toHaveLength(0);
  });
});
