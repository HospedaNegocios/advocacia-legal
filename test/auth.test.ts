import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { criarAcessoPlataforma } from "../src/server/db/repositorio";
import { sha256Hex } from "../src/server/auth/codificacao";
import { prepararBanco } from "./aplicar-migracoes";
import {
  SENHA,
  ativarTotpNoBanco,
  chamar,
  codigoTotp,
  criarDono,
  criarEscritorio,
  criarUsuario,
  entrar,
  liberarPassoTotp,
  novoIp,
  segredoDoBanco,
  sessaoDeUsuario,
} from "./ajuda";

prepararBanco();

const ERRO_GENERICO = "E-mail ou senha inválidos";

describe("login e sessão", () => {
  it("entra com senha correta e define cookie __Host-sessao seguro; o banco guarda só o hash", async () => {
    const t = await criarEscritorio();
    const u = await criarUsuario(t, "advogado");
    const r = await entrar(u.email);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, etapa: "ok" });
    const setCookie = r.headers.get("set-cookie")!;
    expect(setCookie).toMatch(/^__Host-sessao=[A-Za-z0-9_-]{43};/);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("Max-Age=43200");
    expect(setCookie).not.toContain("Domain");
    const token = r.cookie!.split("=")[1]!;
    const hash = await sha256Hex(token);
    const linha = await env.DB.prepare("SELECT id, user_id, tenant_id, expira_em FROM sessions WHERE id = ?").bind(hash).first<any>();
    expect(linha.user_id).toBe(u.id);
    expect(linha.tenant_id).toBe(t);
    const duracao = new Date(linha.expira_em).getTime() - Date.now();
    expect(duracao).toBeGreaterThan(11.9 * 3600 * 1000);
    expect(duracao).toBeLessThanOrEqual(12 * 3600 * 1000);
    const bruto = await env.DB.prepare("SELECT COUNT(*) AS n FROM sessions WHERE id = ?").bind(token).first<any>();
    expect(bruto.n).toBe(0);
  });

  it("/api/eu devolve o usuário e o escritório da sessão", async () => {
    const t = await criarEscritorio();
    const s = await sessaoDeUsuario(t, "secretaria");
    const r = await chamar("GET", "/api/eu", { cookie: s.cookie });
    expect(r.status).toBe(200);
    expect(r.json.usuario).toMatchObject({ email: s.email, perfil: "secretaria", dono_plataforma: false });
    expect(r.json.escritorio.status).toBe("teste");
    expect(r.json.pendente_2fa).toBe(false);
  });

  it("sem cookie, /api/eu devolve 401", async () => {
    expect((await chamar("GET", "/api/eu")).status).toBe(401);
    expect((await chamar("GET", "/api/eu", { cookie: "__Host-sessao=abc" })).status).toBe(401);
    expect((await chamar("GET", "/api/eu", { cookie: `__Host-sessao=${"a".repeat(43)}` })).status).toBe(401);
  });

  it("logout apaga a sessão no banco e o cookie deixa de valer", async () => {
    const t = await criarEscritorio();
    const s = await sessaoDeUsuario(t);
    const r = await chamar("POST", "/api/auth/logout", { cookie: s.cookie });
    expect(r.status).toBe(200);
    expect((await chamar("GET", "/api/eu", { cookie: s.cookie })).status).toBe(401);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?").bind(s.id).first<any>();
    expect(n.n).toBe(0);
  });

  it("sessão expira em 12 horas (expirada no banco = rejeitada)", async () => {
    const t = await criarEscritorio();
    const s = await sessaoDeUsuario(t);
    await env.DB.prepare("UPDATE sessions SET expira_em = ? WHERE user_id = ?")
      .bind(new Date(Date.now() - 1000).toISOString(), s.id)
      .run();
    expect((await chamar("GET", "/api/eu", { cookie: s.cookie })).status).toBe(401);
  });

  it("registra login_sucesso, login_falha e logout na auditoria", async () => {
    const t = await criarEscritorio();
    const u = await criarUsuario(t);
    await chamar("POST", "/api/auth/login", { corpo: { email: u.email, senha: "errada-errada" } });
    const r = await entrar(u.email);
    await chamar("POST", "/api/auth/logout", { cookie: r.cookie });
    const { results } = await env.DB.prepare("SELECT acao, detalhes FROM audit_log WHERE tenant_id = ? ORDER BY criado_em, id").bind(t).all<any>();
    expect(results.map((l: any) => l.acao).sort()).toEqual(["login_falha", "login_sucesso", "logout"]);
    // Nada de senha nem token na auditoria.
    expect(JSON.stringify(results)).not.toContain(SENHA);
    expect(JSON.stringify(results)).not.toContain(r.cookie!.split("=")[1]!);
  });
});

describe("credenciais inválidas, bloqueio e limite por IP", () => {
  it("mensagem é igual para e-mail inexistente e senha errada", async () => {
    const t = await criarEscritorio();
    const u = await criarUsuario(t);
    const a = await chamar("POST", "/api/auth/login", { corpo: { email: u.email, senha: "senha-errada-1" } });
    const b = await chamar("POST", "/api/auth/login", { corpo: { email: "nao-existe@teste.com", senha: "senha-errada-1" } });
    const c = await chamar("POST", "/api/auth/login", { corpo: { email: 5, senha: null } });
    for (const r of [a, b, c]) {
      expect(r.status).toBe(401);
      expect(r.json.erro).toContain(ERRO_GENERICO);
      expect(r.cookie).toBeNull();
    }
    expect(a.json).toEqual(b.json);
  });

  it("bloqueia a conta por 15 minutos após 5 senhas erradas, mesmo com a senha certa depois", async () => {
    const t = await criarEscritorio();
    const u = await criarUsuario(t);
    for (let i = 0; i < 5; i++) {
      const r = await chamar("POST", "/api/auth/login", { corpo: { email: u.email, senha: "errada-errada" } });
      expect(r.status).toBe(401);
    }
    const linha = await env.DB.prepare("SELECT bloqueado_ate FROM users WHERE id = ?").bind(u.id).first<any>();
    const resta = new Date(linha.bloqueado_ate).getTime() - Date.now();
    expect(resta).toBeGreaterThan(14 * 60 * 1000);
    expect(resta).toBeLessThanOrEqual(15 * 60 * 1000);
    const bloqueada = await entrar(u.email);
    expect(bloqueada.status).toBe(401);
    expect(bloqueada.json.erro).toContain(ERRO_GENERICO); // não revela o bloqueio
    // Passado o prazo, a senha certa entra de novo.
    await env.DB.prepare("UPDATE users SET bloqueado_ate = ? WHERE id = ?").bind(new Date(Date.now() - 1000).toISOString(), u.id).run();
    expect((await entrar(u.email)).status).toBe(200);
  });

  it("senha certa zera o contador de falhas", async () => {
    const t = await criarEscritorio();
    const u = await criarUsuario(t);
    for (let i = 0; i < 4; i++) await chamar("POST", "/api/auth/login", { corpo: { email: u.email, senha: "errada-errada" } });
    expect((await entrar(u.email)).status).toBe(200);
    const linha = await env.DB.prepare("SELECT tentativas_falhas FROM users WHERE id = ?").bind(u.id).first<any>();
    expect(linha.tentativas_falhas).toBe(0);
  });

  it("limita 20 tentativas de login por IP em 15 minutos (429)", async () => {
    const ip = novoIp();
    for (let i = 0; i < 20; i++) {
      const r = await chamar("POST", "/api/auth/login", { corpo: { email: "x@teste.com", senha: "qualquer" }, ip });
      expect(r.status).toBe(401);
    }
    const r = await chamar("POST", "/api/auth/login", { corpo: { email: "x@teste.com", senha: "qualquer" }, ip });
    expect(r.status).toBe(429);
    // Outro IP não é afetado.
    expect((await chamar("POST", "/api/auth/login", { corpo: { email: "x@teste.com", senha: "qualquer" } })).status).toBe(401);
  });
});

describe("limite por IP conta só os erros", () => {
  it("muitos logins corretos do mesmo IP (escritório atrás de um só IP) não são bloqueados", async () => {
    const t = await criarEscritorio();
    const u = await criarUsuario(t);
    const ip = novoIp();
    for (let i = 0; i < 25; i++) expect((await entrar(u.email, { ip })).status).toBe(200);
  });

  it("links inválidos repetidos do mesmo IP também levam a 429", async () => {
    const ip = novoIp();
    for (let i = 0; i < 20; i++) {
      expect((await chamar("POST", "/api/acesso/validar", { corpo: { token: "x" }, ip })).status).toBe(400);
    }
    expect((await chamar("POST", "/api/acesso/validar", { corpo: { token: "x" }, ip })).status).toBe(429);
  });
});

describe("escritório suspenso e usuário inativo", () => {
  it("escritório suspenso ou cancelado não consegue entrar", async () => {
    for (const status of ["suspenso", "cancelado"] as const) {
      const t = await criarEscritorio();
      const u = await criarUsuario(t);
      await criarAcessoPlataforma(env.DB).atualizarEscritorio(t, { status });
      const r = await entrar(u.email);
      expect(r.status).toBe(401);
      expect(r.json.erro).toContain(ERRO_GENERICO);
    }
  });

  it("sessão existente é rejeitada quando o escritório é suspenso (mesmo sem apagar a sessão)", async () => {
    const t = await criarEscritorio();
    const s = await sessaoDeUsuario(t);
    expect((await chamar("GET", "/api/eu", { cookie: s.cookie })).status).toBe(200);
    await criarAcessoPlataforma(env.DB).atualizarEscritorio(t, { status: "suspenso" });
    expect((await chamar("GET", "/api/eu", { cookie: s.cookie })).status).toBe(401);
  });

  it("usuário inativo não entra e sessão dele deixa de valer", async () => {
    const t = await criarEscritorio();
    const s = await sessaoDeUsuario(t);
    await env.DB.prepare("UPDATE users SET ativo = 0 WHERE id = ?").bind(s.id).run();
    expect((await chamar("GET", "/api/eu", { cookie: s.cookie })).status).toBe(401);
    expect((await entrar(s.email)).status).toBe(401);
  });

  it("convite pendente (sem senha) não entra nem com senha vazia", async () => {
    const t = await criarEscritorio();
    const { criarRepositorio } = await import("../src/server/db/repositorio");
    await criarRepositorio(env.DB, t).users.inserir({
      perfil: "socio", nome: "P", email: "pendente@teste.com", senha_hash: "!", senha_salt: "!", senha_definida: 0,
    });
    for (const senha of ["!", "", "qualquer-coisa-123"]) {
      const r = await chamar("POST", "/api/auth/login", { corpo: { email: "pendente@teste.com", senha } });
      expect(r.status).toBe(401);
    }
  });
});

describe("2FA", () => {
  it("usuário com TOTP ativo recebe desafio e só ganha sessão com o código certo", async () => {
    const t = await criarEscritorio();
    const u = await criarUsuario(t);
    const segredo = await ativarTotpNoBanco(u.id);
    const l = await entrar(u.email);
    expect(l.json).toMatchObject({ ok: true, etapa: "2fa" });
    expect(typeof l.json.desafio).toBe("string");
    expect(l.cookie).toBeNull(); // ainda sem sessão
    const ruim = await chamar("POST", "/api/auth/2fa", { corpo: { desafio: l.json.desafio, codigo: "000000" } });
    expect(ruim.status).toBe(401);
    expect(ruim.cookie).toBeNull();
    const bom = await chamar("POST", "/api/auth/2fa", { corpo: { desafio: l.json.desafio, codigo: await codigoTotp(segredo) } });
    expect(bom.status).toBe(200);
    expect(bom.json.etapa).toBe("ok");
    expect((await chamar("GET", "/api/eu", { cookie: bom.cookie })).status).toBe(200);
  });

  it("o mesmo código TOTP não vale duas vezes", async () => {
    const t = await criarEscritorio();
    const u = await criarUsuario(t);
    const segredo = await ativarTotpNoBanco(u.id);
    const codigo = await codigoTotp(segredo);
    const l1 = await entrar(u.email);
    expect((await chamar("POST", "/api/auth/2fa", { corpo: { desafio: l1.json.desafio, codigo } })).status).toBe(200);
    const l2 = await entrar(u.email);
    expect((await chamar("POST", "/api/auth/2fa", { corpo: { desafio: l2.json.desafio, codigo } })).status).toBe(401);
  });

  it("desafio inválido, adulterado ou de outro usuário é recusado", async () => {
    const t = await criarEscritorio();
    const u = await criarUsuario(t);
    const segredo = await ativarTotpNoBanco(u.id);
    const l = await entrar(u.email);
    const codigo = await codigoTotp(segredo);
    for (const desafio of ["lixo", `${l.json.desafio}x`, "", 5]) {
      const r = await chamar("POST", "/api/auth/2fa", { corpo: { desafio, codigo } });
      expect(r.status).toBe(401);
    }
  });

  it("erros de código contam para o bloqueio da conta", async () => {
    const t = await criarEscritorio();
    const u = await criarUsuario(t);
    const segredo = await ativarTotpNoBanco(u.id);
    const l = await entrar(u.email);
    for (let i = 0; i < 5; i++) {
      await chamar("POST", "/api/auth/2fa", { corpo: { desafio: l.json.desafio, codigo: "111111" } });
    }
    // Conta bloqueada: nem o código certo passa.
    const r = await chamar("POST", "/api/auth/2fa", { corpo: { desafio: l.json.desafio, codigo: await codigoTotp(segredo) } });
    expect(r.status).toBe(401);
  });

  it("dono sem 2FA recebe sessão pendente: só pode configurar o 2FA", async () => {
    const dono = await criarDono();
    const l = await entrar(dono.email);
    expect(l.json.etapa).toBe("configurar_2fa");
    const eu = await chamar("GET", "/api/eu", { cookie: l.cookie });
    expect(eu.json.pendente_2fa).toBe(true);
    expect((await chamar("GET", "/api/plataforma/escritorios", { cookie: l.cookie })).status).toBe(403);
    expect((await chamar("POST", "/api/plataforma/escritorios", { cookie: l.cookie, corpo: { nome: "X", plano: "solo" } })).status).toBe(403);
    // Configuração: iniciar -> confirmar.
    const ini = await chamar("POST", "/api/2fa/iniciar", { cookie: l.cookie });
    expect(ini.status).toBe(200);
    expect(ini.json.otpauth).toMatch(/^otpauth:\/\/totp\//);
    const ruim = await chamar("POST", "/api/2fa/confirmar", { cookie: l.cookie, corpo: { codigo: "000000" } });
    expect(ruim.status).toBe(400);
    const segredo = await segredoDoBanco(dono.id);
    const ok = await chamar("POST", "/api/2fa/confirmar", { cookie: l.cookie, corpo: { codigo: await codigoTotp(segredo) } });
    expect(ok.status).toBe(200);
    expect((await chamar("GET", "/api/plataforma/escritorios", { cookie: l.cookie })).status).toBe(200);
    // Segundo "iniciar" com 2FA ativo é recusado (não permite trocar o segredo sem o código).
    expect((await chamar("POST", "/api/2fa/iniciar", { cookie: l.cookie })).status).toBe(409);
    const auditoria = await env.DB.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE acao = '2fa_ativado' AND user_id = ?").bind(dono.id).first<any>();
    expect(auditoria.n).toBe(1);
  });

  it("segredo TOTP fica cifrado no banco (não é o Base32 puro)", async () => {
    const dono = await criarDono();
    const l = await entrar(dono.email);
    const ini = await chamar("POST", "/api/2fa/iniciar", { cookie: l.cookie });
    const base32 = /secret=([A-Z2-7]+)/.exec(ini.json.otpauth)![1]!;
    const linha = await env.DB.prepare("SELECT totp_secret, totp_ativo FROM users WHERE id = ?").bind(dono.id).first<any>();
    expect(linha.totp_ativo).toBe(0);
    expect(linha.totp_secret.startsWith("v1.")).toBe(true);
    expect(linha.totp_secret).not.toContain(base32);
  });

  it("escritório que exige 2FA: usuário sem 2FA recebe sessão pendente; sem a exigência, não", async () => {
    const exige = await criarEscritorio("escritorio", true);
    const livre = await criarEscritorio();
    const a = await criarUsuario(exige, "advogado");
    const b = await criarUsuario(livre, "advogado");
    const ra = await entrar(a.email);
    const rb = await entrar(b.email);
    expect(ra.json.etapa).toBe("configurar_2fa");
    expect(rb.json.etapa).toBe("ok");
    expect((await chamar("GET", "/api/eu", { cookie: ra.cookie })).json.pendente_2fa).toBe(true);
  });

  it("ligar a exigência depois também prende sessões já abertas sem 2FA", async () => {
    const t = await criarEscritorio();
    const s = await sessaoDeUsuario(t, "socio");
    const antes = await chamar("GET", "/api/equipe/usuarios", { cookie: s.cookie });
    expect(antes.status).toBe(200);
    const r = await chamar("PUT", "/api/equipe/configuracao", { cookie: s.cookie, corpo: { exigir_2fa: true } });
    expect(r.status).toBe(200);
    expect((await chamar("GET", "/api/equipe/usuarios", { cookie: s.cookie })).status).toBe(403);
    expect((await chamar("GET", "/api/eu", { cookie: s.cookie })).json.pendente_2fa).toBe(true);
  });
});

describe("mesmo e-mail em vários escritórios", () => {
  it("lista os escritórios cuja senha confere e exige escolher; a escolha é só um seletor", async () => {
    const t1 = await criarEscritorio();
    const t2 = await criarEscritorio();
    const t3 = await criarEscritorio(); // senha diferente neste
    const email = "mesmo@teste.com";
    await criarUsuario(t1, "socio", email);
    await criarUsuario(t2, "advogado", email);
    const u3 = await criarUsuario(t3, "advogado", email);
    await env.DB.prepare("UPDATE users SET senha_hash = 'pbkdf2-sha256$1000$AAAA', senha_salt = 'AAAA' WHERE id = ?").bind(u3.id).run();

    const l = await entrar(email);
    expect(l.status).toBe(200);
    expect(l.json.etapa).toBe("escolher_escritorio");
    expect(l.cookie).toBeNull();
    expect(l.json.escritorios.map((e: any) => e.id).sort()).toEqual([t1, t2].sort());
    expect(l.json.escritorios[0]).toHaveProperty("nome");
    // O t3 não aparece (senha não conferiu) e não pode ser escolhido.
    const forcado = await chamar("POST", "/api/auth/login", { corpo: { email, senha: SENHA, escritorio_id: t3 } });
    expect(forcado.status).toBe(401);
    expect(forcado.cookie).toBeNull();
    const inexistente = await chamar("POST", "/api/auth/login", { corpo: { email, senha: SENHA, escritorio_id: "nao-existe" } });
    expect(inexistente.status).toBe(401);
    // Senha errada com seletor válido: falha.
    const errada = await chamar("POST", "/api/auth/login", { corpo: { email, senha: "errada-errada", escritorio_id: t1 } });
    expect(errada.status).toBe(401);
    const ok = await chamar("POST", "/api/auth/login", { corpo: { email, senha: SENHA, escritorio_id: t2 } });
    expect(ok.status).toBe(200);
    const eu = await chamar("GET", "/api/eu", { cookie: ok.cookie });
    expect(eu.json.usuario.perfil).toBe("advogado");
    const sessao = await env.DB.prepare("SELECT tenant_id FROM sessions WHERE user_id IN (SELECT id FROM users WHERE tenant_id = ?)").bind(t2).first<any>();
    expect(sessao.tenant_id).toBe(t2);
  });

  it("acertar a senha em um escritório não conta falha nos outros; errar em todos conta em todos", async () => {
    const t1 = await criarEscritorio();
    const t2 = await criarEscritorio();
    const email = "dois@teste.com";
    const u1 = await criarUsuario(t1, "socio", email);
    const u2 = await criarUsuario(t2, "socio", email);
    await env.DB.prepare("UPDATE users SET senha_hash = 'pbkdf2-sha256$1000$AAAA', senha_salt = 'AAAA' WHERE id = ?").bind(u2.id).run();
    expect((await entrar(email)).status).toBe(200);
    const antes = await env.DB.prepare("SELECT tentativas_falhas AS n FROM users WHERE id = ?").bind(u2.id).first<any>();
    expect(antes.n).toBe(0);
    await chamar("POST", "/api/auth/login", { corpo: { email, senha: "errada-errada" } });
    for (const id of [u1.id, u2.id]) {
      const l = await env.DB.prepare("SELECT tentativas_falhas AS n FROM users WHERE id = ?").bind(id).first<any>();
      expect(l.n).toBe(1);
    }
  });

  it("dono e usuário de escritório com o mesmo e-mail e senha: escolher plataforma ou escritório", async () => {
    const t = await criarEscritorio();
    const email = "guilherme@teste.com";
    await criarUsuario(t, "socio", email);
    const dono = await criarDono(email);
    await ativarTotpNoBanco(dono.id);
    const l = await entrar(email);
    expect(l.json.etapa).toBe("escolher_escritorio");
    expect(l.json.escritorios.map((e: any) => e.id).sort()).toEqual([t, "plataforma"].sort());
    const d = await chamar("POST", "/api/auth/login", { corpo: { email, senha: SENHA, escritorio_id: "plataforma" } });
    expect(d.json.etapa).toBe("2fa");
  });
});

describe("a sessão é a única fonte do escritório", () => {
  it("parâmetros, corpo e cabeçalhos com tenant_id/escritório alheio são ignorados", async () => {
    const tA = await criarEscritorio();
    const tB = await criarEscritorio();
    const a = await sessaoDeUsuario(tA, "socio");
    const b = await criarUsuario(tB, "socio");
    const r = await chamar("GET", `/api/equipe/usuarios?tenant_id=${tB}&escritorio_id=${tB}`, { cookie: a.cookie });
    expect(r.status).toBe(200);
    expect(r.json.usuarios.map((u: any) => u.email)).toEqual([a.email]);
    expect(JSON.stringify(r.json)).not.toContain(b.email);
    // Usuário de B não pode ser alterado/desativado por A, mesmo sabendo o id.
    const des = await chamar("POST", `/api/equipe/usuarios/${b.id}/desativar`, { cookie: a.cookie, corpo: { tenant_id: tB } });
    expect(des.status).toBe(404);
    const per = await chamar("PATCH", `/api/equipe/usuarios/${b.id}`, { cookie: a.cookie, corpo: { perfil: "estagiario", tenant_id: tB } });
    expect(per.status).toBe(404);
    const linha = await env.DB.prepare("SELECT ativo, perfil FROM users WHERE id = ?").bind(b.id).first<any>();
    expect(linha).toEqual({ ativo: 1, perfil: "socio" });
  });

  it("a sessão de um escritório não é aceita com cookie de outra pessoa adulterado", async () => {
    const tA = await criarEscritorio();
    const a = await sessaoDeUsuario(tA, "socio");
    const adulterado = a.cookie.slice(0, -1) + (a.cookie.endsWith("A") ? "B" : "A");
    expect((await chamar("GET", "/api/eu", { cookie: adulterado })).status).toBe(401);
  });

  it("sessão cujo escritório difere do escritório do usuário é rejeitada", async () => {
    const tA = await criarEscritorio();
    const tB = await criarEscritorio();
    const a = await sessaoDeUsuario(tA, "socio");
    await env.DB.prepare("UPDATE sessions SET tenant_id = ? WHERE user_id = ?").bind(tB, a.id).run();
    expect((await chamar("GET", "/api/eu", { cookie: a.cookie })).status).toBe(401);
  });
});

describe("liberação de passo TOTP para testes", () => {
  it("helper permite novo login com o mesmo código", async () => {
    const t = await criarEscritorio();
    const u = await criarUsuario(t);
    const segredo = await ativarTotpNoBanco(u.id);
    for (let i = 0; i < 2; i++) {
      await liberarPassoTotp(u.id);
      const l = await entrar(u.email);
      const r = await chamar("POST", "/api/auth/2fa", { corpo: { desafio: l.json.desafio, codigo: await codigoTotp(segredo) } });
      expect(r.status).toBe(200);
    }
  });
});
