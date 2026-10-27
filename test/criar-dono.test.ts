import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { gerarToken, hashDoToken, montarComandos, montarLink, validarAmbiente, validarEmail } from "../scripts/criar-dono-lib.mjs";
import { sha256Hex } from "../src/server/auth/codificacao";
import { prepararBanco } from "./aplicar-migracoes";
import { chamar } from "./ajuda";

prepararBanco();

async function executar(email: string) {
  const token = gerarToken();
  // O wrangler recebe os comandos juntos, separados por ';'. Aqui rodamos um a um no mesmo banco.
  for (const sql of montarComandos({ email, tokenHash: await hashDoToken(token) })) await env.DB.prepare(sql).run();
  return token;
}

describe("script criar-dono", () => {
  it("valida e-mail e ambiente de forma estrita", () => {
    expect(validarEmail("  Guilherme@HospedaNegocios.com.br ")).toBe("guilherme@hospedanegocios.com.br");
    for (const ruim of ["a@b", "a b@c.com", "a@b.com'; DROP TABLE users;--", "a'b@c.com", "", "x@y.com;ls", "$(id)@a.com", "a@-.com", 5]) {
      expect(() => validarEmail(ruim)).toThrow();
    }
    expect(validarAmbiente("dev")).toBe("dev");
    expect(validarAmbiente("prod")).toBe("prod");
    expect(() => validarAmbiente("staging")).toThrow();
    expect(() => validarAmbiente("dev; ls")).toThrow();
  });

  it("monta o link com o host certo e o token no fragmento", () => {
    expect(montarLink("dev", "abc")).toBe("https://dev.app.advocacia.legal/primeiro-acesso#abc");
    expect(montarLink("prod", "abc")).toBe("https://app.advocacia.legal/primeiro-acesso#abc");
  });

  it("o hash gravado é o mesmo que a API calcula, e o token vale 24 h", async () => {
    const token = await executar("dono-script@teste.com");
    expect(await hashDoToken(token)).toBe(await sha256Hex(token));
    const linha = await env.DB.prepare("SELECT id, tipo, tenant_id, usado_em, expira_em FROM tokens_acesso").first<any>();
    expect(linha).toMatchObject({ id: await sha256Hex(token), tipo: "primeiro_acesso", tenant_id: null, usado_em: null });
    const horas = (new Date(linha.expira_em).getTime() - Date.now()) / 3600000;
    expect(horas).toBeGreaterThan(23.9);
    expect(horas).toBeLessThanOrEqual(24);
    const v = await chamar("POST", "/api/acesso/validar", { corpo: { token } });
    expect(v.json).toMatchObject({ tipo: "primeiro_acesso", email: "dono-script@teste.com" });
    const dono = await env.DB.prepare("SELECT papel_plataforma, tenant_id, senha_hash, senha_definida FROM users WHERE email = 'dono-script@teste.com'").first<any>();
    expect(dono).toEqual({ papel_plataforma: "dono", tenant_id: null, senha_hash: "!", senha_definida: 0 });
  });

  it("repetir para o mesmo e-mail não duplica o dono: só troca o token pendente", async () => {
    const t1 = await executar("repete@teste.com");
    const t2 = await executar("REPETE@teste.com".toLowerCase());
    const donos = await env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE email = 'repete@teste.com'").first<any>();
    expect(donos.n).toBe(1);
    expect((await chamar("POST", "/api/acesso/validar", { corpo: { token: t1 } })).status).toBe(400);
    expect((await chamar("POST", "/api/acesso/validar", { corpo: { token: t2 } })).status).toBe(200);
  });

  it("dono criado pelo script não consegue entrar com senha antes do primeiro acesso", async () => {
    await executar("semsenha@teste.com");
    for (const senha of ["!", "", "qualquer-coisa-123"]) {
      expect((await chamar("POST", "/api/auth/login", { corpo: { email: "semsenha@teste.com", senha } })).status).toBe(401);
    }
  });
});
