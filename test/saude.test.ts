import { SELF } from "cloudflare:test";
import texto from "../public/_headers?raw";
import { CSP } from "../src/server/seguranca";
import { describe, expect, it } from "vitest";

describe("GET /api/saude", () => {
  it("responde 200 com { ok: true, ambiente }", async () => {
    const r = await SELF.fetch("https://exemplo.test/api/saude");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("application/json");
    expect(await r.json()).toEqual({ ok: true, ambiente: "teste" });
  });

  it("envia os cabeçalhos de segurança", async () => {
    const r = await SELF.fetch("https://exemplo.test/api/saude");
    expect(r.headers.get("strict-transport-security")).toContain("max-age=");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    const csp = r.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("rota /api desconhecida devolve 404 em JSON", async () => {
    const r = await SELF.fetch("https://exemplo.test/api/nao-existe");
    expect(r.status).toBe(404);
    expect(r.headers.get("strict-transport-security")).toBeTruthy();
  });
});

describe("cabeçalhos dos arquivos estáticos (public/_headers)", () => {
  it("usam a mesma CSP e demais cabeçalhos do middleware", async () => {
    expect(texto).toContain(`Content-Security-Policy: ${CSP}`);
    expect(texto).toContain("Strict-Transport-Security: max-age=31536000; includeSubDomains");
    expect(texto).toContain("X-Content-Type-Options: nosniff");
    expect(texto).toContain("Referrer-Policy: strict-origin-when-cross-origin");
  });
});
