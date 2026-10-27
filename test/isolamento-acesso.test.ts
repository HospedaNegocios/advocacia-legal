import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { criarAcessoAutenticacao, criarAcessoPlataforma, criarRepositorio } from "../src/server/db/repositorio";
import type { Repositorio } from "../src/server/db/repositorio";
import { prepararBanco } from "./aplicar-migracoes";

prepararBanco();

const usuario = (email: string) => ({ perfil: "advogado" as const, nome: "F", email, senha_hash: "h", senha_salt: "s" });
const FUTURO = "2999-01-01T00:00:00.000Z";

describe("isolamento: tokens_acesso, sessões, auditoria de acessos e configuração", () => {
  let idA = "";
  let idB = "";
  let repoA: Repositorio;
  let repoB: Repositorio;
  let userA = "";
  let userB = "";
  let tokenB = "";

  beforeAll(async () => {
    const plataforma = criarAcessoPlataforma(env.DB);
    idA = await plataforma.criarEscritorio({ nome: "A", plano: "solo" });
    idB = await plataforma.criarEscritorio({ nome: "B", plano: "solo" });
    repoA = criarRepositorio(env.DB, idA);
    repoB = criarRepositorio(env.DB, idB);
    userA = await repoA.users.inserir(usuario("a@a.test"));
    userB = await repoB.users.inserir(usuario("b@b.test"));
    tokenB = await repoB.tokens.inserir({ id: "hash-b", tipo: "convite", user_id: userB, expira_em: FUTURO });
    await repoA.tokens.inserir({ id: "hash-a", tipo: "convite", user_id: userA, expira_em: FUTURO });
    await repoB.sessions.inserir({ user_id: userB, expira_em: FUTURO });
    await repoB.auditoria.registrar({ userId: userB, acao: "login_sucesso", entidade: "sessao" });
    await repoB.auditoria.registrar({ userId: userB, acao: "usuario_desativado", entidade: "users" });
  });

  it("A não lê, lista, altera nem exclui tokens de B", async () => {
    expect(await repoA.tokens.buscar(tokenB)).toBeNull();
    expect((await repoA.tokens.listar()).map((t) => t.id)).toEqual(["hash-a"]);
    expect(await repoA.tokens.listar({ user_id: userB })).toHaveLength(0);
    expect(await repoA.tokens.atualizar(tokenB, { usado_em: "agora" })).toBe(false);
    expect(await repoA.tokens.excluir(tokenB)).toBe(false);
    expect(await repoA.tokens.excluirPor({ user_id: userB })).toBe(0);
    expect((await repoB.tokens.buscar(tokenB))?.usado_em).toBeNull();
  });

  it("tenant_id nos dados do token é ignorado e o escritório não cria token de primeiro acesso", async () => {
    const id = await repoA.tokens.inserir({ id: "hash-a2", tipo: "convite", user_id: userA, expira_em: FUTURO, tenant_id: idB } as never);
    expect((await repoA.tokens.buscar(id))?.tenant_id).toBe(idA);
    expect(await repoB.tokens.buscar(id)).toBeNull();
    await expect(
      repoA.tokens.inserir({ id: "hash-a3", tipo: "primeiro_acesso", user_id: userA, expira_em: FUTURO }),
    ).rejects.toThrow();
  });

  it("colunas de token fora da lista são recusadas (inclusive tenant_id em filtros)", async () => {
    await expect(repoA.tokens.listar({ tenant_id: idB } as never)).rejects.toThrow(/não permitida/);
    await expect(repoA.tokens.excluirPor({ expira_em: FUTURO } as never)).rejects.toThrow(/não permitida/);
    await expect(repoA.tokens.atualizar("hash-a", { user_id: userB } as never)).rejects.toThrow(/não permitida/);
  });

  it("excluirPor sem filtros é recusado (não apaga o escritório inteiro)", async () => {
    await expect(repoA.sessions.excluirPor({})).rejects.toThrow(/ao menos um filtro/);
    await expect(repoA.tokens.excluirPor({ user_id: undefined } as never)).rejects.toThrow(/ao menos um filtro/);
    expect((await repoA.tokens.listar()).length).toBeGreaterThan(0);
  });

  it("excluirPor em sessões só atinge o próprio escritório", async () => {
    expect(await repoA.sessions.excluirPor({ user_id: userB })).toBe(0);
    expect(await repoB.sessions.listar()).toHaveLength(1);
    expect(await repoB.sessions.excluirPor({ user_id: userB })).toBe(1);
    expect(await repoB.sessions.listar()).toHaveLength(0);
  });

  it("log de acessos de A não mostra nada de B e só traz login/logout", async () => {
    expect(await repoA.auditoria.listarAcessos()).toHaveLength(0);
    const deB = await repoB.auditoria.listarAcessos();
    expect(deB).toHaveLength(1);
    expect(deB[0]).toMatchObject({ acao: "login_sucesso", usuario_email: "b@b.test" });
  });

  it("A não altera a exigência de 2FA de B", async () => {
    expect(await repoA.definirExigir2fa(true)).toBe(true);
    expect((await repoA.buscarMeuEscritorio())?.exigir_2fa).toBe(1);
    expect((await repoB.buscarMeuEscritorio())?.exigir_2fa).toBe(0);
  });

  it("dono: contagem de usuários ativos por escritório e encerramento de sessões por escritório", async () => {
    const plataforma = criarAcessoPlataforma(env.DB);
    await repoA.users.inserir(usuario("a2@a.test"));
    await repoA.users.atualizar(await repoA.users.inserir(usuario("a3@a.test")), { ativo: 0 });
    const contagem = await plataforma.contarUsuariosPorEscritorio();
    expect(contagem[idA]).toBe(2);
    expect(contagem[idB]).toBe(1);
    await repoA.sessions.inserir({ user_id: userA, expira_em: FUTURO });
    await repoB.sessions.inserir({ user_id: userB, expira_em: FUTURO });
    expect(await plataforma.encerrarSessoesDoEscritorio(idA)).toBe(1);
    expect(await repoA.sessions.listar()).toHaveLength(0);
    expect(await repoB.sessions.listar()).toHaveLength(1);
  });
});

describe("acesso de autenticação", () => {
  it("consumirToken é de uso único e respeita a validade", async () => {
    const plataforma = criarAcessoPlataforma(env.DB);
    const id = await plataforma.criarEscritorio({ nome: "T", plano: "solo" });
    const repo = criarRepositorio(env.DB, id);
    const u = await repo.users.inserir(usuario("t@t.test"));
    await repo.tokens.inserir({ id: "k-ok", tipo: "convite", user_id: u, expira_em: FUTURO });
    await repo.tokens.inserir({ id: "k-velho", tipo: "convite", user_id: u, expira_em: "2000-01-01T00:00:00.000Z" });
    const acesso = criarAcessoAutenticacao(env.DB);
    const agora = new Date().toISOString();
    expect(await acesso.consumirToken("k-velho", agora)).toBe(false);
    expect(await acesso.consumirToken("k-ok", agora)).toBe(true);
    expect(await acesso.consumirToken("k-ok", agora)).toBe(false);
    expect(await acesso.consumirToken("nao-existe", agora)).toBe(false);
  });

  it("consumirPassoTotp aceita cada passo uma vez e nunca um passo menor", async () => {
    const plataforma = criarAcessoPlataforma(env.DB);
    const id = await plataforma.criarEscritorio({ nome: "P", plano: "solo" });
    const u = await criarRepositorio(env.DB, id).users.inserir(usuario("p@p.test"));
    const acesso = criarAcessoAutenticacao(env.DB);
    expect(await acesso.consumirPassoTotp(u, 100)).toBe(true);
    expect(await acesso.consumirPassoTotp(u, 100)).toBe(false);
    expect(await acesso.consumirPassoTotp(u, 99)).toBe(false);
    expect(await acesso.consumirPassoTotp(u, 101)).toBe(true);
  });

  it("contarTentativa conta dentro da janela e reinicia depois dela", async () => {
    const acesso = criarAcessoAutenticacao(env.DB);
    expect(await acesso.contarTentativa("teste:a", 60_000)).toBe(1);
    expect(await acesso.contarTentativa("teste:a", 60_000)).toBe(2);
    expect(await acesso.contarTentativa("teste:b", 60_000)).toBe(1);
    await env.DB.prepare("UPDATE limites_taxa SET janela_inicio = ? WHERE chave = 'teste:a'")
      .bind(new Date(Date.now() - 120_000).toISOString())
      .run();
    expect(await acesso.contarTentativa("teste:a", 60_000)).toBe(1);
  });

  it("registrarFalha bloqueia ao atingir o máximo e zera o contador", async () => {
    const plataforma = criarAcessoPlataforma(env.DB);
    const id = await plataforma.criarEscritorio({ nome: "F", plano: "solo" });
    const repo = criarRepositorio(env.DB, id);
    const u = await repo.users.inserir(usuario("f@f.test"));
    const acesso = criarAcessoAutenticacao(env.DB);
    for (let i = 0; i < 4; i++) await acesso.registrarFalha(u, 5, FUTURO);
    expect((await repo.users.buscar(u))?.bloqueado_ate).toBeNull();
    await acesso.registrarFalha(u, 5, FUTURO);
    const l = await repo.users.buscar(u);
    expect(l?.bloqueado_ate).toBe(FUTURO);
    expect(l?.tentativas_falhas).toBe(0);
  });
});
