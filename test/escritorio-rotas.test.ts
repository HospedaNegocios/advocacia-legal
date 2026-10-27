import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { criarAcessoPlataforma, criarRepositorio } from "../src/server/db/repositorio";
import type { Plano } from "../src/server/db/repositorio";
import { prepararBanco } from "./aplicar-migracoes";
import { chamar, criarEscritorio, sessaoDeUsuario } from "./ajuda";

prepararBanco();

const oab = (numero: string, extra: object = {}) => ({ numero, sufixo: "", uf: "SP", advogado_nome: "Ana Lima", ...extra });

async function cenario(plano: Plano = "escritorio") {
  const t = await criarEscritorio(plano);
  return { t, socio: await sessaoDeUsuario(t, "socio") };
}

describe("perfil do escritório", () => {
  it("sócio grava; qualquer perfil lê; dados validados e auditados", async () => {
    const { t, socio } = await cenario();
    const vazio = await chamar("GET", "/api/escritorio/perfil", { cookie: socio.cookie });
    expect(vazio.json.perfil.documento).toBeNull();
    expect(vazio.json.plano).toBe("escritorio");
    const r = await chamar("PUT", "/api/escritorio/perfil", { cookie: socio.cookie, corpo: { razao_social: "Silva Ltda", documento: "11.222.333/0001-81", telefone: "(12) 3456-7890", cep: "12345-678", uf: "SP" } });
    expect(r.status).toBe(200);
    expect(r.json.perfil).toMatchObject({ documento: "11222333000181", telefone: "1234567890", cep: "12345678" });
    for (const perfil of ["advogado", "estagiario", "secretaria"] as const) {
      const u = await sessaoDeUsuario(t, perfil);
      const g = await chamar("GET", "/api/escritorio/perfil", { cookie: u.cookie });
      expect(g.status).toBe(200);
      expect(g.json.perfil.razao_social).toBe("Silva Ltda");
      expect((await chamar("PUT", "/api/escritorio/perfil", { cookie: u.cookie, corpo: { razao_social: "X" } })).status).toBe(403);
    }
    const log = await env.DB.prepare("SELECT detalhes FROM audit_log WHERE tenant_id = ? AND acao = 'escritorio_perfil_alterado'").bind(t).all<{ detalhes: string }>();
    expect(log.results).toHaveLength(1);
    expect(log.results[0]!.detalhes).not.toContain("Silva");
    expect(log.results[0]!.detalhes).toContain("razao_social");
  });

  it("recusa dados inválidos com 400", async () => {
    const { socio } = await cenario();
    for (const corpo of [{ documento: "111.111.111-11" }, { cep: "123" }, { telefone: "12" }, { email_contato: "x" }, { uf: "ZZ" }]) {
      expect((await chamar("PUT", "/api/escritorio/perfil", { cookie: socio.cookie, corpo })).status).toBe(400);
    }
  });

  it("exige login e outro escritório não vê os dados", async () => {
    const a = await cenario();
    const b = await cenario();
    expect((await chamar("GET", "/api/escritorio/perfil")).status).toBe(401);
    await chamar("PUT", "/api/escritorio/perfil", { cookie: a.socio.cookie, corpo: { razao_social: "Só do A" } });
    const visto = await chamar("GET", "/api/escritorio/perfil", { cookie: b.socio.cookie });
    expect(visto.json.perfil.razao_social).toBeNull();
  });

  it("CSRF continua valendo", async () => {
    const { socio } = await cenario();
    expect((await chamar("PUT", "/api/escritorio/perfil", { cookie: socio.cookie, corpo: {}, marca: null })).status).toBe(403);
  });
});

describe("OABs", () => {
  it("sócio cria, edita, desativa e reativa; auditoria registrada", async () => {
    const { t, socio } = await cenario();
    const c = await chamar("POST", "/api/escritorio/oabs", { cookie: socio.cookie, corpo: oab("012345", { sufixo: "a" }) });
    expect(c.status).toBe(201);
    expect(c.json.oab).toMatchObject({ numero: "12345", sufixo: "A", uf: "SP", ativo: true });
    const id = c.json.oab.id;
    const e = await chamar("PUT", `/api/escritorio/oabs/${id}`, { cookie: socio.cookie, corpo: oab("12345", { sufixo: "A", advogado_nome: "Ana Maria", user_id: socio.id }) });
    expect(e.status).toBe(200);
    expect(e.json.oab).toMatchObject({ advogado_nome: "Ana Maria", user_id: socio.id });
    expect((await chamar("DELETE", `/api/escritorio/oabs/${id}`, { cookie: socio.cookie })).status).toBe(200);
    let lista = await chamar("GET", "/api/escritorio/oabs", { cookie: socio.cookie });
    expect(lista.json.oabs[0].ativo).toBe(false);
    expect(lista.json.uso).toEqual({ plano: "escritorio", ativas: 0, limite: 3 });
    const r = await chamar("PUT", `/api/escritorio/oabs/${id}`, { cookie: socio.cookie, corpo: oab("12345", { sufixo: "A", ativo: true }) });
    expect(r.json.oab.ativo).toBe(true);
    lista = await chamar("GET", "/api/escritorio/oabs", { cookie: socio.cookie });
    expect(lista.json.uso.ativas).toBe(1);
    const acoes = await env.DB.prepare("SELECT acao FROM audit_log WHERE tenant_id = ? AND entidade = 'oabs' ORDER BY criado_em, id").bind(t).all<{ acao: string }>();
    expect(acoes.results.map((a) => a.acao)).toEqual(["oab_criada", "oab_alterada", "oab_desativada", "oab_reativada"]);
  });

  it("valida entradas e duplicidade", async () => {
    const { socio } = await cenario("banca");
    const post = (corpo: object) => chamar("POST", "/api/escritorio/oabs", { cookie: socio.cookie, corpo });
    expect((await post(oab("abc"))).status).toBe(400);
    expect((await post(oab("1", { uf: "XX" }))).status).toBe(400);
    expect((await post(oab("1", { advogado_nome: "" }))).status).toBe(400);
    expect((await post(oab("1", { user_id: "inexistente" }))).status).toBe(400);
    expect((await post(oab("500"))).status).toBe(201);
    const dup = await post(oab("0500"));
    expect(dup.status).toBe(409);
    expect(dup.json.erro).toContain("já está cadastrada");
    expect((await post(oab("500", { uf: "RJ" }))).status).toBe(201);
  });

  it("não vincula a usuário de outro escritório", async () => {
    const a = await cenario();
    const b = await cenario();
    const r = await chamar("POST", "/api/escritorio/oabs", { cookie: a.socio.cookie, corpo: oab("1", { user_id: b.socio.id }) });
    expect(r.status).toBe(400);
  });

  it("aplica o limite do plano (409 citando o plano) em criar e reativar", async () => {
    for (const [plano, limite] of [["solo", 1], ["escritorio", 3]] as const) {
      const { socio } = await cenario(plano);
      const ids: string[] = [];
      for (let i = 1; i <= limite; i++) {
        const r = await chamar("POST", "/api/escritorio/oabs", { cookie: socio.cookie, corpo: oab(String(i)) });
        expect(r.status).toBe(201);
        ids.push(r.json.oab.id);
      }
      const estouro = await chamar("POST", "/api/escritorio/oabs", { cookie: socio.cookie, corpo: oab("99") });
      expect(estouro.status).toBe(409);
      expect(estouro.json.erro).toContain(plano === "solo" ? "plano Solo" : "plano Escritório");
      await chamar("DELETE", `/api/escritorio/oabs/${ids[0]}`, { cookie: socio.cookie });
      expect((await chamar("POST", "/api/escritorio/oabs", { cookie: socio.cookie, corpo: oab("99") })).status).toBe(201);
      const reativar = await chamar("PUT", `/api/escritorio/oabs/${ids[0]}`, { cookie: socio.cookie, corpo: oab("1", { ativo: true }) });
      expect(reativar.status).toBe(409);
      expect((await chamar("GET", "/api/escritorio/oabs", { cookie: socio.cookie })).json.oabs.find((o: any) => o.id === ids[0]).ativo).toBe(false);
    }
  });

  it("banca não tem limite", async () => {
    const { socio } = await cenario("banca");
    for (let i = 1; i <= 6; i++) expect((await chamar("POST", "/api/escritorio/oabs", { cookie: socio.cookie, corpo: oab(String(i)) })).status).toBe(201);
    expect((await chamar("GET", "/api/escritorio/oabs", { cookie: socio.cookie })).json.uso.limite).toBeNull();
  });

  it("rebaixar de plano bloqueia novas, mas não apaga nem desativa as existentes", async () => {
    const { t, socio } = await cenario("banca");
    for (let i = 1; i <= 4; i++) await chamar("POST", "/api/escritorio/oabs", { cookie: socio.cookie, corpo: oab(String(i)) });
    await criarAcessoPlataforma(env.DB).atualizarEscritorio(t, { plano: "escritorio" });
    const lista = await chamar("GET", "/api/escritorio/oabs", { cookie: socio.cookie });
    expect(lista.json.oabs.filter((o: any) => o.ativo)).toHaveLength(4);
    expect(lista.json.uso).toEqual({ plano: "escritorio", ativas: 4, limite: 3 });
    expect((await chamar("POST", "/api/escritorio/oabs", { cookie: socio.cookie, corpo: oab("50") })).status).toBe(409);
    // editar uma ativa continua permitido
    const id = lista.json.oabs[0].id;
    expect((await chamar("PUT", `/api/escritorio/oabs/${id}`, { cookie: socio.cookie, corpo: oab("1", { advogado_nome: "Novo Nome" }) })).status).toBe(200);
  });

  it("outros perfis leem mas não escrevem; outro escritório não vê nem altera", async () => {
    const a = await cenario();
    const b = await cenario();
    const criada = await chamar("POST", "/api/escritorio/oabs", { cookie: a.socio.cookie, corpo: oab("10") });
    const id = criada.json.oab.id;
    for (const perfil of ["advogado", "estagiario", "secretaria"] as const) {
      const u = await sessaoDeUsuario(a.t, perfil);
      expect((await chamar("GET", "/api/escritorio/oabs", { cookie: u.cookie })).json.oabs).toHaveLength(1);
      expect((await chamar("POST", "/api/escritorio/oabs", { cookie: u.cookie, corpo: oab("11") })).status).toBe(403);
      expect((await chamar("PUT", `/api/escritorio/oabs/${id}`, { cookie: u.cookie, corpo: oab("10") })).status).toBe(403);
      expect((await chamar("DELETE", `/api/escritorio/oabs/${id}`, { cookie: u.cookie })).status).toBe(403);
    }
    expect((await chamar("GET", "/api/escritorio/oabs", { cookie: b.socio.cookie })).json.oabs).toHaveLength(0);
    expect((await chamar("PUT", `/api/escritorio/oabs/${id}`, { cookie: b.socio.cookie, corpo: oab("10", { advogado_nome: "Invasor" }) })).status).toBe(404);
    expect((await chamar("DELETE", `/api/escritorio/oabs/${id}`, { cookie: b.socio.cookie })).status).toBe(404);
    const intacta = await criarRepositorio(env.DB, a.t).oabs.buscar(id);
    expect(intacta).toMatchObject({ advogado_nome: "Ana Lima", ativo: 1 });
  });

  it("DELETE em OAB inexistente dá 404 e sem login dá 401", async () => {
    const { socio } = await cenario();
    expect((await chamar("DELETE", "/api/escritorio/oabs/nao-existe", { cookie: socio.cookie })).status).toBe(404);
    expect((await chamar("GET", "/api/escritorio/oabs")).status).toBe(401);
  });
});
