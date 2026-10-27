import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { criarAcessoPlataforma, criarRepositorio } from "../src/server/db/repositorio";
import type { Repositorio } from "../src/server/db/repositorio";
import { prepararBanco } from "./aplicar-migracoes";

prepararBanco();

const usuario = (email: string) => ({
  perfil: "advogado" as const,
  nome: "Fulano",
  email,
  senha_hash: "hash",
  senha_salt: "sal",
});

describe("isolamento entre escritórios", () => {
  let idA = "";
  let idB = "";
  let repoA: Repositorio;
  let repoB: Repositorio;
  let userB = "";

  beforeAll(async () => {
    const plataforma = criarAcessoPlataforma(env.DB);
    idA = await plataforma.criarEscritorio({ nome: "Escritório A", plano: "solo" });
    idB = await plataforma.criarEscritorio({ nome: "Escritório B", plano: "banca" });
    repoA = criarRepositorio(env.DB, idA);
    repoB = criarRepositorio(env.DB, idB);
    await repoA.users.inserir(usuario("a@a.test"));
    userB = await repoB.users.inserir(usuario("b@b.test"));
    await repoB.sessions.inserir({ user_id: userB, expira_em: "2999-01-01T00:00:00.000Z" });
    await repoB.auditoria.registrar({ userId: userB, acao: "teste", entidade: "users", entidadeId: userB });
  });

  it("A não consegue ler um registro de B pelo id", async () => {
    expect(await repoA.users.buscar(userB)).toBeNull();
    expect(await repoB.users.buscar(userB)).not.toBeNull();
  });

  it("A não enxerga registros de B nas listagens", async () => {
    const lista = await repoA.users.listar();
    expect(lista).toHaveLength(1);
    expect(lista.every((u) => u.tenant_id === idA)).toBe(true);
    expect(await repoA.users.listar({ email: "b@b.test" })).toHaveLength(0);
    expect(await repoA.sessions.listar()).toHaveLength(0);
    expect(await repoA.auditoria.listar()).toHaveLength(0);
    expect(await repoB.sessions.listar()).toHaveLength(1);
    expect(await repoB.auditoria.listar()).toHaveLength(1);
  });

  it("A não consegue atualizar registro de B", async () => {
    expect(await repoA.users.atualizar(userB, { nome: "Invadido" })).toBe(false);
    expect((await repoB.users.buscar(userB))?.nome).toBe("Fulano");
    expect(await repoB.users.atualizar(userB, { nome: "Novo Nome" })).toBe(true);
    expect((await repoB.users.buscar(userB))?.nome).toBe("Novo Nome");
  });

  it("A não consegue excluir registro de B", async () => {
    expect(await repoA.users.excluir(userB)).toBe(false);
    expect(await repoB.users.buscar(userB)).not.toBeNull();
  });

  it("tenant_id passado nos dados é ignorado na inserção", async () => {
    const id = await repoA.users.inserir({ ...usuario("c@a.test"), tenant_id: idB } as never);
    expect(await repoB.users.buscar(id)).toBeNull();
    expect((await repoA.users.buscar(id))?.tenant_id).toBe(idA);
  });

  it("tenant_id passado nos dados é ignorado na atualização", async () => {
    const id = await repoA.users.inserir(usuario("d@a.test"));
    await repoA.users.atualizar(id, { nome: "Mudou", tenant_id: idB } as never);
    expect((await repoA.users.buscar(id))?.tenant_id).toBe(idA);
    expect(await repoB.users.buscar(id)).toBeNull();
  });

  it("filtro por tenant_id na listagem é rejeitado", async () => {
    await expect(repoA.users.listar({ tenant_id: idB } as never)).rejects.toThrow(/não permitida/);
  });

  it("não permite criar dono da plataforma pelo repositório do escritório", async () => {
    await expect(
      repoA.users.inserir({ ...usuario("dono@a.test"), papel_plataforma: "dono" } as never),
    ).rejects.toThrow(/não permitida/);
  });

  it("rejeita nomes de coluna fora da lista permitida (sem injeção por identificador)", async () => {
    await expect(repoA.users.inserir({ "nome) VALUES ('x'); --": "x" } as never)).rejects.toThrow(/não permitida/);
    await expect(repoA.users.atualizar("x", { "nome = 'x' --": "x" } as never)).rejects.toThrow(/não permitida/);
  });

  it("auditoria é imutável e grava o tenant correto", async () => {
    const [registro] = await repoB.auditoria.listar();
    expect(registro?.tenant_id).toBe(idB);
    expect(registro?.acao).toBe("teste");
    // A tabela de auditoria não expõe atualizar/excluir no repositório.
    expect("atualizar" in repoB.auditoria).toBe(false);
    expect("excluir" in repoB.auditoria).toBe(false);
  });

  it("escritório só lê o próprio registro em tenants", async () => {
    expect((await repoA.buscarMeuEscritorio())?.nome).toBe("Escritório A");
    expect((await repoB.buscarMeuEscritorio())?.nome).toBe("Escritório B");
  });

  it("tenantId vazio ou inválido lança erro", () => {
    expect(() => criarRepositorio(env.DB, "")).toThrow(/tenantId/);
    expect(() => criarRepositorio(env.DB, "   ")).toThrow(/tenantId/);
    expect(() => criarRepositorio(env.DB, undefined as never)).toThrow(/tenantId/);
    expect(() => criarRepositorio(env.DB, null as never)).toThrow(/tenantId/);
  });

  it("e-mail é único por escritório, mas pode repetir entre escritórios", async () => {
    await expect(repoA.users.inserir(usuario("a@a.test"))).rejects.toThrow();
    await expect(repoB.users.inserir(usuario("a@a.test"))).resolves.toBeTypeOf("string");
  });
});

describe("acesso da plataforma e banco", () => {
  it("dono da plataforma é distinguível (tenant_id nulo + papel_plataforma)", async () => {
    await env.DB.prepare(
      "INSERT INTO users (id, tenant_id, papel_plataforma, perfil, nome, email, senha_hash, senha_salt, criado_em, atualizado_em) VALUES ('dono1', NULL, 'dono', NULL, 'Dono', 'dono@x.test', 'h', 's', 'agora', 'agora')",
    ).run();
    // Usuário sem tenant e sem papel de dono é inválido.
    await expect(
      env.DB.prepare(
        "INSERT INTO users (id, tenant_id, perfil, nome, email, senha_hash, senha_salt, criado_em, atualizado_em) VALUES ('x1', NULL, 'socio', 'X', 'x@x.test', 'h', 's', 'a', 'a')",
      ).run(),
    ).rejects.toThrow();
  });

  it("repositório de escritório nunca devolve o dono da plataforma", async () => {
    const plataforma = criarAcessoPlataforma(env.DB);
    const id = await plataforma.criarEscritorio({ nome: "C", plano: "escritorio" });
    expect(await criarRepositorio(env.DB, id).users.listar()).toHaveLength(0);
    expect(await criarRepositorio(env.DB, id).users.buscar("dono1")).toBeNull();
  });

  it("plano e status inválidos são recusados pelo banco", async () => {
    const plataforma = criarAcessoPlataforma(env.DB);
    await expect(plataforma.criarEscritorio({ nome: "Z", plano: "ouro" as never })).rejects.toThrow();
    const id = await plataforma.criarEscritorio({ nome: "S", plano: "solo" });
    await expect(plataforma.atualizarEscritorio(id, { status: "qualquer" as never })).rejects.toThrow();
    expect(await plataforma.atualizarEscritorio(id, { status: "suspenso" })).toBe(true);
    expect((await plataforma.buscarEscritorio(id))?.status).toBe("suspenso");
  });

  it("chave estrangeira impede usuário em escritório inexistente", async () => {
    const repo = criarRepositorio(env.DB, "inexistente");
    await expect(repo.users.inserir(usuario("f@f.test"))).rejects.toThrow();
  });

  it("registra auditoria da plataforma sem tenant", async () => {
    const plataforma = criarAcessoPlataforma(env.DB);
    const id = await plataforma.registrarAuditoria({ acao: "criar", entidade: "tenants", detalhes: { a: 1 } });
    const linha = await env.DB.prepare("SELECT tenant_id, detalhes FROM audit_log WHERE id = ?").bind(id).first();
    expect(linha).toEqual({ tenant_id: null, detalhes: '{"a":1}' });
  });
});
