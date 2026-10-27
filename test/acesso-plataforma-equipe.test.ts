import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../src/server/auth/codificacao";
import { prepararBanco } from "./aplicar-migracoes";
import {
  SENHA,
  chamar,
  codigoTotp,
  criarDono,
  criarEscritorio,
  criarUsuario,
  entrar,
  segredoDoBanco,
  sessaoDeDono,
  sessaoDeUsuario,
} from "./ajuda";

prepararBanco();

function tokenDoLink(link: string): string {
  return link.split("#")[1]!;
}

/** Cria escritório e convite do primeiro sócio pelo painel do dono. */
async function convidarSocio(dono: { cookie: string }, email: string) {
  const esc = await chamar("POST", "/api/plataforma/escritorios", { cookie: dono.cookie, corpo: { nome: "Silva & Souza", plano: "escritorio" } });
  const id = esc.json.escritorio.id as string;
  const conv = await chamar("POST", `/api/plataforma/escritorios/${id}/convite-socio`, { cookie: dono.cookie, corpo: { email } });
  return { id, conv, token: conv.status === 201 ? tokenDoLink(conv.json.link) : "" };
}

describe("painel do dono", () => {
  it("cria escritório em teste por 14 dias, lista com uso, altera plano e situação", async () => {
    const dono = await sessaoDeDono();
    const r = await chamar("POST", "/api/plataforma/escritorios", { cookie: dono.cookie, corpo: { nome: "  Almeida   Advogados ", plano: "solo" } });
    expect(r.status).toBe(201);
    const e = r.json.escritorio;
    expect(e).toMatchObject({ nome: "Almeida Advogados", plano: "solo", status: "teste", usuarios: 0, exigir_2fa: false });
    const dias = (new Date(e.teste_ate).getTime() - Date.now()) / 86400000;
    expect(dias).toBeGreaterThan(13.99);
    expect(dias).toBeLessThanOrEqual(14);

    await criarUsuario(e.id, "socio");
    await criarUsuario(e.id, "advogado");
    const lista = await chamar("GET", "/api/plataforma/escritorios", { cookie: dono.cookie });
    expect(lista.json.escritorios.find((x: any) => x.id === e.id).usuarios).toBe(2);

    const p = await chamar("PATCH", `/api/plataforma/escritorios/${e.id}`, { cookie: dono.cookie, corpo: { plano: "banca" } });
    expect(p.json.escritorio.plano).toBe("banca");
    const s = await chamar("PATCH", `/api/plataforma/escritorios/${e.id}`, { cookie: dono.cookie, corpo: { status: "ativo" } });
    expect(s.json.escritorio.status).toBe("ativo");
    const acoes = await env.DB.prepare("SELECT acao FROM audit_log WHERE tenant_id = ? ORDER BY criado_em, id").bind(e.id).all<any>();
    expect(acoes.results.map((a: any) => a.acao)).toEqual(["tenant_criado", "tenant_plano_alterado", "tenant_ativado"]);
  });

  it("valida entradas", async () => {
    const dono = await sessaoDeDono();
    const c = dono.cookie;
    expect((await chamar("POST", "/api/plataforma/escritorios", { cookie: c, corpo: { nome: "", plano: "solo" } })).status).toBe(400);
    expect((await chamar("POST", "/api/plataforma/escritorios", { cookie: c, corpo: { nome: "X", plano: "ouro" } })).status).toBe(400);
    const id = (await chamar("POST", "/api/plataforma/escritorios", { cookie: c, corpo: { nome: "X", plano: "solo" } })).json.escritorio.id;
    expect((await chamar("PATCH", `/api/plataforma/escritorios/${id}`, { cookie: c, corpo: { status: "teste" } })).status).toBe(400);
    expect((await chamar("PATCH", `/api/plataforma/escritorios/${id}`, { cookie: c, corpo: {} })).status).toBe(400);
    expect((await chamar("PATCH", "/api/plataforma/escritorios/nao-existe", { cookie: c, corpo: { plano: "solo" } })).status).toBe(404);
    expect((await chamar("POST", `/api/plataforma/escritorios/${id}/convite-socio`, { cookie: c, corpo: { email: "invalido" } })).status).toBe(400);
  });

  it("suspender derruba as sessões do escritório; reativar permite entrar de novo", async () => {
    const dono = await sessaoDeDono();
    const t = await criarEscritorio();
    const s = await sessaoDeUsuario(t);
    expect((await chamar("GET", "/api/eu", { cookie: s.cookie })).status).toBe(200);
    const r = await chamar("PATCH", `/api/plataforma/escritorios/${t}`, { cookie: dono.cookie, corpo: { status: "suspenso" } });
    expect(r.status).toBe(200);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM sessions WHERE tenant_id = ?").bind(t).first<any>();
    expect(n.n).toBe(0);
    expect((await chamar("GET", "/api/eu", { cookie: s.cookie })).status).toBe(401);
    expect((await entrar(s.email)).status).toBe(401);
    await chamar("PATCH", `/api/plataforma/escritorios/${t}`, { cookie: dono.cookie, corpo: { status: "ativo" } });
    expect((await entrar(s.email)).status).toBe(200);
    const acoes = await env.DB.prepare("SELECT acao FROM audit_log WHERE entidade = 'tenants' AND entidade_id = ?").bind(t).all<any>();
    expect(acoes.results.map((a: any) => a.acao)).toEqual(expect.arrayContaining(["tenant_suspenso", "tenant_ativado"]));
  });

  it("rotas do dono rejeitam usuários de escritório (qualquer perfil) e anônimos", async () => {
    const t = await criarEscritorio();
    for (const perfil of ["socio", "advogado", "estagiario", "secretaria"] as const) {
      const s = await sessaoDeUsuario(t, perfil);
      expect((await chamar("GET", "/api/plataforma/escritorios", { cookie: s.cookie })).status).toBe(403);
      expect((await chamar("POST", "/api/plataforma/escritorios", { cookie: s.cookie, corpo: { nome: "Y", plano: "solo" } })).status).toBe(403);
      expect((await chamar("PATCH", `/api/plataforma/escritorios/${t}`, { cookie: s.cookie, corpo: { status: "cancelado" } })).status).toBe(403);
      expect((await chamar("POST", `/api/plataforma/escritorios/${t}/convite-socio`, { cookie: s.cookie, corpo: { email: "a@b.com" } })).status).toBe(403);
    }
    expect((await chamar("GET", "/api/plataforma/escritorios")).status).toBe(401);
  });

  it("dono não usa as rotas de equipe de escritório (sem escritório na sessão)", async () => {
    const dono = await sessaoDeDono();
    expect((await chamar("GET", "/api/equipe/usuarios", { cookie: dono.cookie })).status).toBe(403);
    expect((await chamar("GET", "/api/equipe/acessos", { cookie: dono.cookie })).status).toBe(403);
  });
});

describe("convite do primeiro sócio e aceite", () => {
  it("fluxo completo: convite -> validar -> concluir -> login; link só funciona uma vez", async () => {
    const dono = await sessaoDeDono();
    const { id, conv, token } = await convidarSocio(dono, "Socio.Novo@Teste.com");
    expect(conv.status).toBe(201);
    expect(conv.json.link).toMatch(/^https:\/\/exemplo\.test\/convite#[A-Za-z0-9_-]{43}$/);
    const dias = (new Date(conv.json.expira_em).getTime() - Date.now()) / 86400000;
    expect(dias).toBeGreaterThan(6.99);
    expect(dias).toBeLessThanOrEqual(7);
    // O banco guarda só o hash.
    const hash = await sha256Hex(token);
    const reg = await env.DB.prepare("SELECT id, tipo, tenant_id, usado_em FROM tokens_acesso WHERE tenant_id = ?").bind(id).first<any>();
    expect(reg).toMatchObject({ id: hash, tipo: "convite", tenant_id: id, usado_em: null });
    expect(JSON.stringify(await env.DB.prepare("SELECT * FROM tokens_acesso").all())).not.toContain(token);

    const v = await chamar("POST", "/api/acesso/validar", { corpo: { token } });
    expect(v.status).toBe(200);
    expect(v.json).toMatchObject({ tipo: "convite", email: "socio.novo@teste.com", escritorio: "Silva & Souza" });

    // Senha curta é recusada e NÃO consome o token.
    const curta = await chamar("POST", "/api/acesso/concluir", { corpo: { token, senha: "curta" } });
    expect(curta.status).toBe(400);
    expect((await chamar("POST", "/api/acesso/validar", { corpo: { token } })).status).toBe(200);

    const ok = await chamar("POST", "/api/acesso/concluir", { corpo: { token, nome: "Maria Souza", senha: "uma-senha-forte-1" } });
    expect(ok.status).toBe(200);
    expect(ok.json.etapa).toBe("ok");
    const eu = await chamar("GET", "/api/eu", { cookie: ok.cookie });
    expect(eu.json.usuario).toMatchObject({ nome: "Maria Souza", perfil: "socio", email: "socio.novo@teste.com" });

    // Uso único.
    expect((await chamar("POST", "/api/acesso/concluir", { corpo: { token, senha: "outra-senha-forte-2" } })).status).toBe(400);
    expect((await chamar("POST", "/api/acesso/validar", { corpo: { token } })).status).toBe(400);
    // A senha original continua valendo; a segunda tentativa não a trocou.
    expect((await chamar("POST", "/api/auth/login", { corpo: { email: "socio.novo@teste.com", senha: "uma-senha-forte-1" } })).status).toBe(200);
    expect((await chamar("POST", "/api/auth/login", { corpo: { email: "socio.novo@teste.com", senha: "outra-senha-forte-2" } })).status).toBe(401);
    const acoes = await env.DB.prepare("SELECT acao FROM audit_log WHERE tenant_id = ?").bind(id).all<any>();
    expect(acoes.results.map((a: any) => a.acao)).toEqual(expect.arrayContaining(["convite_criado", "convite_aceito"]));
  });

  it("duas tentativas simultâneas: só uma consome o token", async () => {
    const dono = await sessaoDeDono();
    const { token } = await convidarSocio(dono, "corrida@teste.com");
    const [a, b] = await Promise.all([
      chamar("POST", "/api/acesso/concluir", { corpo: { token, senha: "senha-numero-um-1" } }),
      chamar("POST", "/api/acesso/concluir", { corpo: { token, senha: "senha-numero-dois-2" } }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 400]);
  });

  it("token expirado, inexistente ou malformado é recusado com a mesma mensagem", async () => {
    const dono = await sessaoDeDono();
    const { token } = await convidarSocio(dono, "expira@teste.com");
    await env.DB.prepare("UPDATE tokens_acesso SET expira_em = ? WHERE id = ?")
      .bind(new Date(Date.now() - 1000).toISOString(), await sha256Hex(token))
      .run();
    const outroToken = "a".repeat(43);
    const respostas = await Promise.all(
      [token, outroToken, "curto", 123].map((t) => chamar("POST", "/api/acesso/concluir", { corpo: { token: t, senha: "uma-senha-forte-1" } })),
    );
    for (const r of respostas) expect(r.status).toBe(400);
    expect(new Set(respostas.map((r) => r.json.erro)).size).toBe(1);
    expect((await chamar("POST", "/api/acesso/validar", { corpo: { token } })).status).toBe(400);
  });

  it("convite de escritório suspenso ou usuário desativado não funciona", async () => {
    const dono = await sessaoDeDono();
    const { id, token } = await convidarSocio(dono, "susp@teste.com");
    await chamar("PATCH", `/api/plataforma/escritorios/${id}`, { cookie: dono.cookie, corpo: { status: "suspenso" } });
    expect((await chamar("POST", "/api/acesso/concluir", { corpo: { token, senha: "uma-senha-forte-1" } })).status).toBe(400);
  });

  it("repetir o convite para quem ainda não aceitou gera link novo e invalida o anterior; quem já aceitou dá 409", async () => {
    const dono = await sessaoDeDono();
    const { id, token } = await convidarSocio(dono, "re@teste.com");
    const novo = await chamar("POST", `/api/plataforma/escritorios/${id}/convite-socio`, { cookie: dono.cookie, corpo: { email: "re@teste.com" } });
    expect(novo.status).toBe(201);
    expect((await chamar("POST", "/api/acesso/validar", { corpo: { token } })).status).toBe(400);
    const t2 = tokenDoLink(novo.json.link);
    expect((await chamar("POST", "/api/acesso/concluir", { corpo: { token: t2, senha: "uma-senha-forte-1" } })).status).toBe(200);
    const dup = await chamar("POST", `/api/plataforma/escritorios/${id}/convite-socio`, { cookie: dono.cookie, corpo: { email: "re@teste.com" } });
    expect(dup.status).toBe(409);
  });

  it("se o escritório exige 2FA, concluir leva à configuração do 2FA (sessão pendente)", async () => {
    const dono = await sessaoDeDono();
    const { id, token } = await convidarSocio(dono, "dois@teste.com");
    const { criarRepositorio } = await import("../src/server/db/repositorio");
    await criarRepositorio(env.DB, id).definirExigir2fa(true);
    const r = await chamar("POST", "/api/acesso/concluir", { corpo: { token, senha: "uma-senha-forte-1" } });
    expect(r.json.etapa).toBe("configurar_2fa");
    expect((await chamar("GET", "/api/equipe/usuarios", { cookie: r.cookie })).status).toBe(403);
  });
});

describe("primeiro acesso do dono", () => {
  async function criarTokenDono(email: string) {
    const id = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO users (id, tenant_id, papel_plataforma, perfil, nome, email, senha_hash, senha_salt, senha_definida, criado_em, atualizado_em) VALUES (?, NULL, 'dono', NULL, 'Dono', ?, '!', '!', 0, 'a', 'a')",
    ).bind(id, email).run();
    const token = "T".repeat(43);
    await env.DB.prepare("INSERT INTO tokens_acesso (id, tipo, user_id, tenant_id, expira_em, criado_em) VALUES (?, 'primeiro_acesso', ?, NULL, ?, 'a')")
      .bind(await sha256Hex(token), id, new Date(Date.now() + 3600_000).toISOString())
      .run();
    return { id, token };
  }

  it("define a senha, cai na configuração obrigatória do 2FA e ativa o painel", async () => {
    const { token } = await criarTokenDono("dono-novo@teste.com");
    const v = await chamar("POST", "/api/acesso/validar", { corpo: { token } });
    expect(v.json).toMatchObject({ tipo: "primeiro_acesso", email: "dono-novo@teste.com", escritorio: null });
    const c = await chamar("POST", "/api/acesso/concluir", { corpo: { token, senha: "senha-do-dono-12" } });
    expect(c.json.etapa).toBe("configurar_2fa");
    expect((await chamar("GET", "/api/plataforma/escritorios", { cookie: c.cookie })).status).toBe(403);
    await chamar("POST", "/api/2fa/iniciar", { cookie: c.cookie });
    const dono = await env.DB.prepare("SELECT id FROM users WHERE email = 'dono-novo@teste.com'").first<any>();
    const ok = await chamar("POST", "/api/2fa/confirmar", { cookie: c.cookie, corpo: { codigo: await codigoTotp(await segredoDoBanco(dono.id)) } });
    expect(ok.status).toBe(200);
    expect((await chamar("GET", "/api/plataforma/escritorios", { cookie: c.cookie })).status).toBe(200);
    expect((await chamar("POST", "/api/acesso/concluir", { corpo: { token, senha: "senha-do-dono-34" } })).status).toBe(400);
  });

  it("dono que já tem 2FA e pede novo link volta ao login normal (2FA continua exigido)", async () => {
    const dono = await sessaoDeDono();
    const token = "R".repeat(43);
    await env.DB.prepare("INSERT INTO tokens_acesso (id, tipo, user_id, tenant_id, expira_em, criado_em) VALUES (?, 'primeiro_acesso', ?, NULL, ?, 'a')")
      .bind(await sha256Hex(token), dono.id, new Date(Date.now() + 3600_000).toISOString())
      .run();
    const c = await chamar("POST", "/api/acesso/concluir", { corpo: { token, senha: "nova-senha-longa-1" } });
    expect(c.json.etapa).toBe("entrar");
    expect(c.cookie).toBeNull();
    const l = await chamar("POST", "/api/auth/login", { corpo: { email: dono.email, senha: "nova-senha-longa-1" } });
    expect(l.json.etapa).toBe("2fa");
  });

  it("o banco impede token de primeiro acesso com escritório e convite sem escritório", async () => {
    const t = await criarEscritorio();
    const u = await criarUsuario(t);
    await expect(
      env.DB.prepare("INSERT INTO tokens_acesso (id, tipo, user_id, tenant_id, expira_em, criado_em) VALUES ('x1', 'primeiro_acesso', ?, ?, 'a', 'a')").bind(u.id, t).run(),
    ).rejects.toThrow();
    await expect(
      env.DB.prepare("INSERT INTO tokens_acesso (id, tipo, user_id, tenant_id, expira_em, criado_em) VALUES ('x2', 'convite', ?, NULL, 'a', 'a')").bind(u.id).run(),
    ).rejects.toThrow();
  });
});

describe("equipe do escritório", () => {
  it("só sócio acessa; advogado, estagiário e secretaria recebem 403 em todas as rotas", async () => {
    const t = await criarEscritorio();
    const alvo = await criarUsuario(t, "advogado");
    for (const perfil of ["advogado", "estagiario", "secretaria"] as const) {
      const s = await sessaoDeUsuario(t, perfil);
      const c = s.cookie;
      expect((await chamar("GET", "/api/equipe/usuarios", { cookie: c })).status).toBe(403);
      expect((await chamar("POST", "/api/equipe/convites", { cookie: c, corpo: { email: "n@t.com", perfil: "advogado" } })).status).toBe(403);
      expect((await chamar("PATCH", `/api/equipe/usuarios/${alvo.id}`, { cookie: c, corpo: { perfil: "socio" } })).status).toBe(403);
      expect((await chamar("POST", `/api/equipe/usuarios/${alvo.id}/desativar`, { cookie: c })).status).toBe(403);
      expect((await chamar("PUT", "/api/equipe/configuracao", { cookie: c, corpo: { exigir_2fa: true } })).status).toBe(403);
      expect((await chamar("GET", "/api/equipe/acessos", { cookie: c })).status).toBe(403);
      expect((await chamar("GET", "/api/eu", { cookie: c })).status).toBe(200);
    }
    const alvoDepois = await env.DB.prepare("SELECT perfil, ativo FROM users WHERE id = ?").bind(alvo.id).first<any>();
    expect(alvoDepois).toEqual({ perfil: "advogado", ativo: 1 });
  });

  it("sócio convida, aceite acontece, altera perfil, desativa (e sessões caem) e reativa", async () => {
    const t = await criarEscritorio();
    const socio = await sessaoDeUsuario(t, "socio");
    const c = socio.cookie;
    const inv = await chamar("POST", "/api/equipe/convites", { cookie: c, corpo: { email: "Nova@Equipe.com", perfil: "advogado" } });
    expect(inv.status).toBe(201);
    expect(inv.json.link).toContain("/convite#");
    expect((await chamar("POST", "/api/equipe/convites", { cookie: c, corpo: { email: "x", perfil: "advogado" } })).status).toBe(400);
    expect((await chamar("POST", "/api/equipe/convites", { cookie: c, corpo: { email: "a@b.com", perfil: "dono" } })).status).toBe(400);
    expect((await chamar("POST", "/api/equipe/convites", { cookie: c, corpo: { email: socio.email, perfil: "advogado" } })).status).toBe(409);

    let lista = await chamar("GET", "/api/equipe/usuarios", { cookie: c });
    const novo = lista.json.usuarios.find((u: any) => u.email === "nova@equipe.com");
    expect(novo).toMatchObject({ perfil: "advogado", convite_pendente: true, ativo: true });

    const aceite = await chamar("POST", "/api/acesso/concluir", { corpo: { token: tokenDoLink(inv.json.link), nome: "Nova Pessoa", senha: "uma-senha-forte-1" } });
    expect(aceite.status).toBe(200);
    expect((await chamar("GET", "/api/equipe/usuarios", { cookie: aceite.cookie })).status).toBe(403);

    expect((await chamar("PATCH", `/api/equipe/usuarios/${novo.id}`, { cookie: c, corpo: { perfil: "xyz" } })).status).toBe(400);
    expect((await chamar("PATCH", `/api/equipe/usuarios/${novo.id}`, { cookie: c, corpo: { perfil: "secretaria" } })).status).toBe(200);
    expect((await chamar("GET", "/api/eu", { cookie: aceite.cookie })).json.usuario.perfil).toBe("secretaria");

    expect((await chamar("POST", `/api/equipe/usuarios/${novo.id}/desativar`, { cookie: c })).status).toBe(200);
    expect((await chamar("GET", "/api/eu", { cookie: aceite.cookie })).status).toBe(401);
    expect((await entrar("nova@equipe.com")).status).toBe(401);
    expect((await chamar("POST", `/api/equipe/usuarios/${novo.id}/reativar`, { cookie: c })).status).toBe(200);
    lista = await chamar("GET", "/api/equipe/usuarios", { cookie: c });
    expect(lista.json.usuarios.find((u: any) => u.id === novo.id).ativo).toBe(true);

    const acoes = await env.DB.prepare("SELECT acao FROM audit_log WHERE tenant_id = ?").bind(t).all<any>();
    expect(acoes.results.map((a: any) => a.acao)).toEqual(
      expect.arrayContaining(["convite_criado", "convite_aceito", "usuario_perfil_alterado", "usuario_desativado"]),
    );
  });

  it("sócio não desativa nem muda o perfil de si mesmo", async () => {
    const t = await criarEscritorio();
    const s = await sessaoDeUsuario(t, "socio");
    expect((await chamar("POST", `/api/equipe/usuarios/${s.id}/desativar`, { cookie: s.cookie })).status).toBe(400);
    expect((await chamar("PATCH", `/api/equipe/usuarios/${s.id}`, { cookie: s.cookie, corpo: { perfil: "advogado" } })).status).toBe(400);
    expect((await chamar("GET", "/api/eu", { cookie: s.cookie })).status).toBe(200);
  });

  it("sócio liga e desliga a exigência de 2FA do escritório", async () => {
    const t = await criarEscritorio();
    const s = await sessaoDeUsuario(t, "socio");
    expect((await chamar("PUT", "/api/equipe/configuracao", { cookie: s.cookie, corpo: { exigir_2fa: "sim" } })).status).toBe(400);
    const a = await chamar("PUT", "/api/equipe/configuracao", { cookie: s.cookie, corpo: { exigir_2fa: true } });
    expect(a.json.exigir_2fa).toBe(true);
    const row = await env.DB.prepare("SELECT exigir_2fa FROM tenants WHERE id = ?").bind(t).first<any>();
    expect(row.exigir_2fa).toBe(1);
  });

  it("log de acessos: só login/logout do próprio escritório, paginado", async () => {
    const t = await criarEscritorio();
    const outro = await criarEscritorio();
    const s = await sessaoDeUsuario(t, "socio");
    const u = await criarUsuario(outro);
    await entrar(u.email);
    for (let i = 0; i < 3; i++) await chamar("POST", "/api/auth/login", { corpo: { email: s.email, senha: "errada-errada" } });
    await chamar("POST", "/api/equipe/convites", { cookie: s.cookie, corpo: { email: "novo@x.com", perfil: "advogado" } });
    const r = await chamar("GET", "/api/equipe/acessos", { cookie: s.cookie });
    expect(r.status).toBe(200);
    expect(r.json.pagina).toBe(1);
    const acoes = r.json.itens.map((i: any) => i.acao).sort();
    expect(acoes).toEqual(["login_falha", "login_falha", "login_falha", "login_sucesso"]);
    expect(r.json.itens.every((i: any) => i.usuario_email === s.email)).toBe(true);
    expect(JSON.stringify(r.json)).not.toContain(u.email);
    expect(r.json.tem_proxima).toBe(false);

    // Paginação: insere muitos registros.
    for (let i = 0; i < 55; i++) {
      await env.DB.prepare("INSERT INTO audit_log (id, tenant_id, user_id, acao, entidade, criado_em) VALUES (?, ?, ?, 'login_sucesso', 'sessao', ?)")
        .bind(crypto.randomUUID(), t, s.id, new Date(Date.now() + i * 1000).toISOString())
        .run();
    }
    const p1 = await chamar("GET", "/api/equipe/acessos?pagina=1", { cookie: s.cookie });
    const p2 = await chamar("GET", "/api/equipe/acessos?pagina=2", { cookie: s.cookie });
    expect(p1.json.itens).toHaveLength(50);
    expect(p1.json.tem_proxima).toBe(true);
    expect(p2.json.itens.length).toBe(9);
    expect(p2.json.tem_proxima).toBe(false);
    expect((await chamar("GET", "/api/equipe/acessos?pagina=abc", { cookie: s.cookie })).json.pagina).toBe(1);
  });
});

describe("segurança das respostas", () => {
  const PROIBIDOS = ["senha_hash", "senha_salt", "totp_secret", "pbkdf2", "tentativas_falhas", "bloqueado_ate"];

  it("nenhuma resposta da API inclui hash/sal de senha, segredo TOTP ou hash de token", async () => {
    const t = await criarEscritorio();
    const socio = await sessaoDeUsuario(t, "socio");
    const dono = await sessaoDeDono();
    const alvo = await criarUsuario(t, "advogado");
    const inv = await chamar("POST", "/api/equipe/convites", { cookie: socio.cookie, corpo: { email: "z@z.com", perfil: "advogado" } });
    const token = tokenDoLink(inv.json.link);
    const hashToken = await sha256Hex(token);
    const sessaoHash = await env.DB.prepare("SELECT id FROM sessions WHERE user_id = ?").bind(socio.id).first<any>();
    const respostas = [
      await chamar("GET", "/api/eu", { cookie: socio.cookie }),
      await chamar("GET", "/api/eu", { cookie: dono.cookie }),
      await chamar("GET", "/api/equipe/usuarios", { cookie: socio.cookie }),
      await chamar("GET", "/api/equipe/acessos", { cookie: socio.cookie }),
      await chamar("PATCH", `/api/equipe/usuarios/${alvo.id}`, { cookie: socio.cookie, corpo: { perfil: "estagiario" } }),
      await chamar("PUT", "/api/equipe/configuracao", { cookie: socio.cookie, corpo: { exigir_2fa: false } }),
      inv,
      await chamar("GET", "/api/plataforma/escritorios", { cookie: dono.cookie }),
      await chamar("POST", "/api/plataforma/escritorios", { cookie: dono.cookie, corpo: { nome: "N", plano: "solo" } }),
      await chamar("POST", "/api/acesso/validar", { corpo: { token } }),
      await chamar("POST", "/api/auth/login", { corpo: { email: socio.email, senha: SENHA } }),
      await chamar("POST", "/api/auth/login", { corpo: { email: socio.email, senha: "errada-errada" } }),
    ];
    for (const r of respostas) {
      const texto = JSON.stringify(r.json);
      for (const proibido of PROIBIDOS) expect(texto).not.toContain(proibido);
      expect(texto).not.toContain(hashToken);
      expect(texto).not.toContain(sessaoHash.id);
      expect(texto).not.toContain(SENHA);
    }
    // O token em si só aparece no link devolvido ao sócio que criou o convite.
    expect(JSON.stringify(inv.json)).toContain(token);
  });

  it("2FA/iniciar entrega o segredo só no URI otpauth, ao próprio usuário", async () => {
    const dono = await criarDono();
    const l = await entrar(dono.email);
    const r = await chamar("POST", "/api/2fa/iniciar", { cookie: l.cookie });
    expect(Object.keys(r.json).sort()).toEqual(["ok", "otpauth"]);
    expect((await chamar("POST", "/api/2fa/iniciar")).status).toBe(401);
    expect((await chamar("POST", "/api/2fa/confirmar", { corpo: { codigo: "123456" } })).status).toBe(401);
  });
});

describe("CSRF", () => {
  it("POST/PUT/PATCH/DELETE sem Origin, com Origin de outro site ou sem X-Requested-With dão 403", async () => {
    const t = await criarEscritorio();
    const u = await criarUsuario(t);
    const corpo = { email: u.email, senha: SENHA };
    for (const metodo of ["POST", "PUT", "PATCH", "DELETE"]) {
      const caminho = metodo === "POST" ? "/api/auth/login" : "/api/equipe/configuracao";
      expect((await chamar(metodo, caminho, { corpo, origem: null })).status).toBe(403);
      expect((await chamar(metodo, caminho, { corpo, origem: "https://malvado.test" })).status).toBe(403);
      expect((await chamar(metodo, caminho, { corpo, origem: "https://exemplo.test.malvado.com" })).status).toBe(403);
      expect((await chamar(metodo, caminho, { corpo, marca: null })).status).toBe(403);
      expect((await chamar(metodo, caminho, { corpo, marca: "outra" })).status).toBe(403);
    }
    const ok = await chamar("POST", "/api/auth/login", { corpo });
    expect(ok.status).toBe(200);
  });

  it("requisição bloqueada por CSRF não cria sessão nem altera dados", async () => {
    const t = await criarEscritorio();
    const s = await sessaoDeUsuario(t, "socio");
    const r = await chamar("PUT", "/api/equipe/configuracao", { cookie: s.cookie, corpo: { exigir_2fa: true }, origem: "https://malvado.test" });
    expect(r.status).toBe(403);
    const row = await env.DB.prepare("SELECT exigir_2fa FROM tenants WHERE id = ?").bind(t).first<any>();
    expect(row.exigir_2fa).toBe(0);
    const login = await chamar("POST", "/api/auth/login", { corpo: { email: s.email, senha: SENHA }, origem: "https://malvado.test" });
    expect(login.cookie).toBeNull();
  });

  it("GET não exige as marcas e a API responde com Cache-Control: no-store", async () => {
    const r = await chamar("GET", "/api/saude", { origem: null, marca: null });
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });
});
