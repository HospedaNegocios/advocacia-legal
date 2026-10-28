import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { criarAcessoAgendado, criarAcessoPlataforma, criarRepositorio } from "../src/server/db/repositorio";
import type { Perfil, Plano } from "../src/server/db/repositorio";
import { hojeEm, instanteLocal, somarDias } from "../src/comum/fuso";
import { DIAS_SOMENTE_LEITURA, limiteDeBloqueioIso, resumoDaAssinatura, situacaoDaAssinatura, testeAteDoDia } from "../src/comum/assinatura";
import { prepararBanco } from "./aplicar-migracoes";
import { chamar, criarEscritorio, criarUsuario, entrar, sessaoDeDono, sessaoDeUsuario, unico } from "./ajuda";

prepararBanco();

const sp = (data: string, hora: string) => instanteLocal(data, hora, "America/Sao_Paulo");

describe("regra de datas da assinatura (fuso São Paulo)", () => {
  // Teste termina em 10/11/2026 (último dia); leitura de 11/11 a 20/11 (10 dias); bloqueio a partir de 21/11.
  const teste_ate = testeAteDoDia("2026-11-10");
  const em = (data: string, hora: string) => situacaoDaAssinatura({ status: "teste", teste_ate }, sp(data, hora));

  it("o último dia do teste inteiro ainda é normal", () => {
    expect(em("2026-11-10", "00:00")).toBe("normal");
    expect(em("2026-11-10", "23:59")).toBe("normal");
  });
  it("o dia seguinte começa a somente leitura (meia-noite de São Paulo)", () => {
    expect(em("2026-11-11", "00:00")).toBe("leitura");
    expect(situacaoDaAssinatura({ status: "teste", teste_ate }, sp("2026-11-11", "00:00") - 1000)).toBe("normal");
  });
  it("10 dias completos de leitura, depois bloqueio", () => {
    expect(em("2026-11-20", "23:59")).toBe("leitura");
    expect(em("2026-11-21", "00:00")).toBe("bloqueado");
    expect(situacaoDaAssinatura({ status: "teste", teste_ate }, sp("2026-11-21", "00:00") - 1000)).toBe("leitura");
    expect(DIAS_SOMENTE_LEITURA).toBe(10);
  });
  it("resumo traz as datas e as contagens", () => {
    const r = resumoDaAssinatura({ status: "teste", teste_ate }, sp("2026-11-18", "10:00"));
    expect(r).toMatchObject({ situacao: "leitura", ultimo_dia_teste: "2026-11-10", leitura_desde: "2026-11-11", bloqueio_desde: "2026-11-21", dias_para_bloqueio: 3 });
    expect(resumoDaAssinatura({ status: "teste", teste_ate }, sp("2026-11-08", "10:00"))).toMatchObject({ situacao: "normal", dias_para_fim_teste: 2 });
  });
  it("usa o dia de São Paulo, não o UTC (21h em SP já é o dia seguinte em UTC)", () => {
    // 2026-11-10T23:30 SP = 2026-11-11T02:30Z: ainda é o último dia do teste.
    expect(situacaoDaAssinatura({ status: "teste", teste_ate: "2026-11-11T02:30:00.000Z" }, sp("2026-11-10", "23:50"))).toBe("normal");
    expect(situacaoDaAssinatura({ status: "teste", teste_ate: "2026-11-11T02:30:00.000Z" }, sp("2026-11-11", "00:10"))).toBe("leitura");
  });
  it("só vale para status teste com data; ativo, suspenso e sem data não vencem sozinhos", () => {
    const longe = sp("2030-01-01", "10:00");
    expect(situacaoDaAssinatura({ status: "ativo", teste_ate }, longe)).toBe("normal");
    expect(situacaoDaAssinatura({ status: "teste", teste_ate: null }, longe)).toBe("normal");
    expect(situacaoDaAssinatura({ status: "suspenso", teste_ate }, longe)).toBe("normal");
  });
  it("limite do filtro SQL coincide com a regra", () => {
    const agora = sp("2026-11-21", "09:00");
    const limite = limiteDeBloqueioIso(agora);
    // teste_ate do dia 10 é anterior ao limite (bloqueado); do dia 11 não é (leitura).
    expect(testeAteDoDia("2026-11-10") < limite).toBe(true);
    expect(testeAteDoDia("2026-11-11") < limite).toBe(false);
  });
});

/** Coloca o último dia do teste `diasAtras` dias antes de hoje (São Paulo). */
async function terminarTesteHa(tenantId: string, diasAtras: number) {
  const dia = somarDias(hojeEm(), -diasAtras);
  await criarAcessoPlataforma(env.DB).atualizarEscritorio(tenantId, { teste_ate: testeAteDoDia(dia) });
}

async function cenario(plano: Plano = "escritorio") {
  const t = await criarEscritorio(plano);
  const socio = await sessaoDeUsuario(t, "socio");
  const adv = await sessaoDeUsuario(t, "advogado");
  return { t, socio, adv };
}

const ESCRITAS: [string, string][] = [
  ["POST", "/api/clientes"],
  ["POST", "/api/processos"],
  ["POST", "/api/prazos"],
  ["POST", "/api/agenda"],
  ["POST", "/api/financeiro"],
  ["PUT", "/api/escritorio/perfil"],
  ["POST", "/api/escritorio/oabs"],
  ["POST", "/api/calendario"],
  ["POST", "/api/intimacoes/lidas"],
  ["POST", "/api/intimacoes/buscar"],
  ["POST", "/api/equipe/convites"],
  ["PATCH", "/api/equipe/usuarios/x"],
  ["DELETE", "/api/equipe/convites/x"],
  ["DELETE", "/api/financeiro/x"],
  ["POST", "/api/portal-gestao/clientes/x/convites"],
];

describe("transição teste -> somente leitura -> bloqueado nas rotas", () => {
  it("dentro do teste (último dia hoje): tudo normal", async () => {
    const { t, adv } = await cenario();
    await terminarTesteHa(t, 0);
    expect((await chamar("GET", "/api/clientes", { cookie: adv.cookie })).status).toBe(200);
    const eu = await chamar("GET", "/api/eu", { cookie: adv.cookie });
    expect(eu.json.assinatura).toMatchObject({ situacao: "normal", dias_para_fim_teste: 0 });
    const r = await chamar("POST", "/api/clientes", { cookie: adv.cookie, corpo: {} });
    expect(r.status).toBe(400);
  });

  it("somente leitura (1 e 10 dias depois): leitura funciona, escrita recusada com 402 em várias rotas", async () => {
    for (const dias of [1, 10]) {
      const { t, socio } = await cenario();
      await terminarTesteHa(t, dias);
      for (const rota of ["/api/clientes", "/api/processos", "/api/prazos", "/api/inicio", "/api/financeiro", "/api/escritorio/perfil", "/api/equipe/usuarios", "/api/calendario"]) {
        const r = await chamar("GET", rota, { cookie: socio.cookie });
        expect(r.status, `${rota} (dia +${dias})`).toBe(200);
      }
      for (const [metodo, rota] of ESCRITAS) {
        const r = await chamar(metodo, rota, { cookie: socio.cookie, corpo: {} });
        expect(r.status, `${metodo} ${rota}`).toBe(402);
        expect(r.json).toMatchObject({ ok: false, codigo: "assinatura_somente_leitura" });
        expect(r.json.erro).toMatch(/teste/);
      }
      // cálculo de data não grava nada: continua disponível
      const calc = await chamar("POST", "/api/prazos/calcular", { cookie: socio.cookie, corpo: {} });
      expect(calc.status).not.toBe(402);
      const eu = await chamar("GET", "/api/eu", { cookie: socio.cookie });
      expect(eu.json.assinatura).toMatchObject({ situacao: "leitura", dias_para_bloqueio: 11 - dias });
      // sair continua funcionando
      expect((await chamar("POST", "/api/auth/logout", { cookie: socio.cookie })).status).toBe(200);
    }
  });

  it("bloqueado (11 dias depois): login entra, mas todas as rotas do escritório recusam e /api/eu não traz dados", async () => {
    const { t, socio } = await cenario();
    await terminarTesteHa(t, 11);
    const login = await entrar(socio.email);
    expect(login.status).toBe(200);
    for (const rota of ["/api/clientes", "/api/processos", "/api/inicio", "/api/escritorio/perfil", "/api/equipe/usuarios", "/api/financeiro", "/api/alertas/prazos"]) {
      const r = await chamar("GET", rota, { cookie: socio.cookie });
      expect(r.status, rota).toBe(402);
      expect(r.json.codigo).toBe("assinatura_bloqueada");
    }
    for (const [metodo, rota] of ESCRITAS) {
      expect((await chamar(metodo, rota, { cookie: socio.cookie, corpo: {} })).status, rota).toBe(402);
    }
    const eu = await chamar("GET", "/api/eu", { cookie: socio.cookie });
    expect(eu.status).toBe(200);
    expect(eu.json.assinatura.situacao).toBe("bloqueado");
    expect(eu.json.escritorio.nome).toBeNull();
    expect(eu.json.permissoes.financeiro).toBe("nenhum");
    expect((await chamar("POST", "/api/auth/logout", { cookie: socio.cookie })).status).toBe(200);
  });

  it("rotas sem sessão seguem devolvendo 401 (não 402)", async () => {
    expect((await chamar("POST", "/api/clientes", { corpo: {} })).status).toBe(401);
  });

  it("status ativo nunca vence sozinho, mesmo com teste_ate antigo", async () => {
    const { t, socio } = await cenario();
    await terminarTesteHa(t, 60);
    await criarAcessoPlataforma(env.DB).atualizarEscritorio(t, { status: "ativo" });
    expect((await chamar("GET", "/api/clientes", { cookie: socio.cookie })).status).toBe(200);
    expect((await chamar("POST", "/api/clientes", { cookie: socio.cookie, corpo: {} })).status).toBe(400);
  });

  it("suspenso continua como antes (sessão derrubada, 401)", async () => {
    const { t, socio } = await cenario();
    await criarAcessoPlataforma(env.DB).atualizarEscritorio(t, { status: "suspenso" });
    expect((await chamar("GET", "/api/clientes", { cookie: socio.cookie })).status).toBe(401);
  });

  it("um escritório vencido não afeta outro", async () => {
    const a = await cenario();
    const b = await cenario();
    await terminarTesteHa(a.t, 11);
    expect((await chamar("GET", "/api/clientes", { cookie: a.socio.cookie })).status).toBe(402);
    expect((await chamar("GET", "/api/clientes", { cookie: b.socio.cookie })).status).toBe(200);
  });
});

describe("dono da plataforma e extensão do teste", () => {
  it("dono não é afetado e estende o teste: acesso volta na hora, com auditoria", async () => {
    const { t, socio } = await cenario();
    await terminarTesteHa(t, 15);
    expect((await chamar("GET", "/api/clientes", { cookie: socio.cookie })).status).toBe(402);
    const dono = await sessaoDeDono();
    expect((await chamar("GET", "/api/plataforma/escritorios", { cookie: dono.cookie })).status).toBe(200);
    const lista = (await chamar("GET", "/api/plataforma/escritorios", { cookie: dono.cookie })).json.escritorios.find((e: any) => e.id === t);
    expect(lista.assinatura.situacao).toBe("bloqueado");
    const novoDia = somarDias(hojeEm(), 7);
    const r = await chamar("PATCH", `/api/plataforma/escritorios/${t}`, { cookie: dono.cookie, corpo: { teste_ultimo_dia: novoDia } });
    expect(r.status).toBe(200);
    expect(r.json.escritorio).toMatchObject({ teste_ultimo_dia: novoDia });
    expect(r.json.escritorio.assinatura.situacao).toBe("normal");
    expect((await chamar("GET", "/api/clientes", { cookie: socio.cookie })).status).toBe(200);
    expect((await chamar("POST", "/api/clientes", { cookie: socio.cookie, corpo: {} })).status).toBe(400);
    const aud = await env.DB.prepare("SELECT detalhes FROM audit_log WHERE tenant_id = ? AND acao = 'tenant_teste_alterado'").bind(t).first<any>();
    expect(JSON.parse(aud.detalhes)).toMatchObject({ para: novoDia });
  });

  it("validação da data e só o dono edita", async () => {
    const { t, socio } = await cenario();
    const dono = await sessaoDeDono();
    for (const v of ["2026-02-30", "amanhã", 123, "2026-11-1"]) {
      expect((await chamar("PATCH", `/api/plataforma/escritorios/${t}`, { cookie: dono.cookie, corpo: { teste_ultimo_dia: v } })).status).toBe(400);
    }
    expect((await chamar("PATCH", `/api/plataforma/escritorios/${t}`, { cookie: socio.cookie, corpo: { teste_ultimo_dia: "2030-01-01" } })).status).toBe(403);
  });

  it("o dono continua convidando sócio e vendo o painel com escritório bloqueado", async () => {
    const { t } = await cenario();
    await terminarTesteHa(t, 30);
    const dono = await sessaoDeDono();
    const r = await chamar("POST", `/api/plataforma/escritorios/${t}/convite-socio`, { cookie: dono.cookie, corpo: { email: `${unico("s")}@teste.com` } });
    expect(r.status).toBe(201);
  });
});

describe("cron e coleta do DJEN", () => {
  it("escritório bloqueado fica fora; somente leitura continua", async () => {
    const lido = await cenario();
    const bloq = await cenario();
    for (const x of [lido, bloq]) {
      await criarRepositorio(env.DB, x.t).oabs.inserir({ numero: "123456", uf: "SP", advogado_nome: "A", ativo: 1 });
    }
    await terminarTesteHa(lido.t, 5);
    await terminarTesteHa(bloq.t, 11);
    const alvos = (await criarAcessoAgendado(env.DB).oabsParaColetar(1000)).map((x) => x.tenant_id);
    expect(alvos).toContain(lido.t);
    expect(alvos).not.toContain(bloq.t);
    const emp = (await criarAcessoAgendado(env.DB).escritoriosEmOperacao(null, 1000)).map((x) => x.id);
    expect(emp).toContain(lido.t);
    expect(emp).not.toContain(bloq.t);
  });
});

describe("limite de usuários por plano", () => {
  const convidar = (cookie: string, email = `${unico("n")}@teste.com`, perfil: Perfil = "advogado") =>
    chamar("POST", "/api/equipe/convites", { cookie, corpo: { email, perfil } });

  it("Individual: 1 usuário; o convite é recusado com 409 e mensagem em português", async () => {
    const t = await criarEscritorio("solo");
    const socio = await sessaoDeUsuario(t, "socio");
    const r = await convidar(socio.cookie);
    expect(r.status).toBe(409);
    expect(r.json.erro).toMatch(/Limite de usuários do plano atingido/);
    const l = await chamar("GET", "/api/equipe/usuarios", { cookie: socio.cookie });
    expect(l.json.vagas).toMatchObject({ usados: 1, ativos: 1, convites_pendentes: 0, limite: 1 });
  });

  it("Equipe: 5 contando convites pendentes; excluir convite libera a vaga", async () => {
    const t = await criarEscritorio("escritorio");
    const socio = await sessaoDeUsuario(t, "socio");
    await criarUsuario(t, "advogado");
    await criarUsuario(t, "secretaria");
    const c1 = await convidar(socio.cookie);
    const c2 = await convidar(socio.cookie);
    expect(c1.status).toBe(201);
    expect(c2.status).toBe(201);
    const l = await chamar("GET", "/api/equipe/usuarios", { cookie: socio.cookie });
    expect(l.json.vagas).toMatchObject({ usados: 5, ativos: 3, convites_pendentes: 2, limite: 5 });
    expect((await convidar(socio.cookie)).status).toBe(409);
    const pendente = l.json.usuarios.find((u: any) => u.convite_pendente);
    expect((await chamar("DELETE", `/api/equipe/convites/${pendente.id}`, { cookie: socio.cookie })).status).toBe(200);
    expect((await convidar(socio.cookie)).status).toBe(201);
  });

  it("reconvidar o mesmo e-mail não ocupa duas vagas; convite expirado não conta", async () => {
    const t = await criarEscritorio("solo");
    await criarAcessoPlataforma(env.DB).atualizarEscritorio(t, { plano: "escritorio" });
    const socio = await sessaoDeUsuario(t, "socio");
    for (let i = 0; i < 3; i++) await criarUsuario(t, "advogado"); // 4 ativos
    const email = `${unico("r")}@teste.com`;
    expect((await convidar(socio.cookie, email)).status).toBe(201); // 5 (limite)
    expect((await convidar(socio.cookie, email)).status).toBe(201); // renova o mesmo, continua 5
    expect((await convidar(socio.cookie)).status).toBe(409);
    await env.DB.prepare("UPDATE tokens_acesso SET expira_em = '2000-01-01T00:00:00.000Z' WHERE tenant_id = ?").bind(t).run();
    expect((await chamar("GET", "/api/equipe/usuarios", { cookie: socio.cookie })).json.vagas).toMatchObject({ usados: 4, convites_pendentes: 0 });
    expect((await convidar(socio.cookie)).status).toBe(201);
  });

  it("Sociedade é ilimitada", async () => {
    const t = await criarEscritorio("banca");
    const socio = await sessaoDeUsuario(t, "socio");
    for (let i = 0; i < 7; i++) await criarUsuario(t, "advogado");
    expect((await convidar(socio.cookie)).status).toBe(201);
    expect((await chamar("GET", "/api/equipe/usuarios", { cookie: socio.cookie })).json.vagas.limite).toBeNull();
  });

  it("reativar usuário desativado respeita o limite", async () => {
    const t = await criarEscritorio("escritorio");
    const socio = await sessaoDeUsuario(t, "socio");
    const extras = [];
    for (let i = 0; i < 4; i++) extras.push(await criarUsuario(t, "advogado")); // 5 ativos
    expect((await chamar("POST", `/api/equipe/usuarios/${extras[0]!.id}/desativar`, { cookie: socio.cookie })).status).toBe(200);
    expect((await convidar(socio.cookie)).status).toBe(201); // ocupa a vaga liberada
    const r = await chamar("POST", `/api/equipe/usuarios/${extras[0]!.id}/reativar`, { cookie: socio.cookie });
    expect(r.status).toBe(409);
    expect(r.json.erro).toMatch(/Limite de usuários/);
    const ainda = await env.DB.prepare("SELECT ativo FROM users WHERE id = ?").bind(extras[0]!.id).first<any>();
    expect(ainda.ativo).toBe(0);
  });

  it("reativar com vaga funciona; reativar quem já está ativo é permitido", async () => {
    const t = await criarEscritorio("escritorio");
    const socio = await sessaoDeUsuario(t, "socio");
    const u = await criarUsuario(t, "advogado");
    await chamar("POST", `/api/equipe/usuarios/${u.id}/desativar`, { cookie: socio.cookie });
    expect((await chamar("POST", `/api/equipe/usuarios/${u.id}/reativar`, { cookie: socio.cookie })).status).toBe(200);
    expect((await chamar("POST", `/api/equipe/usuarios/${u.id}/reativar`, { cookie: socio.cookie })).status).toBe(200);
  });

  it("convite do dono ao primeiro sócio também respeita o limite", async () => {
    const t = await criarEscritorio("solo");
    await criarUsuario(t, "socio");
    const dono = await sessaoDeDono();
    const r = await chamar("POST", `/api/plataforma/escritorios/${t}/convite-socio`, { cookie: dono.cookie, corpo: { email: `${unico("s")}@teste.com` } });
    expect(r.status).toBe(409);
  });
});

describe("excluir convite pendente", () => {
  async function comConvite() {
    const t = await criarEscritorio("escritorio");
    const socio = await sessaoDeUsuario(t, "socio");
    const adv = await sessaoDeUsuario(t, "advogado");
    const email = `${unico("c")}@teste.com`;
    const r = await chamar("POST", "/api/equipe/convites", { cookie: socio.cookie, corpo: { email, perfil: "advogado" } });
    const linha = await env.DB.prepare("SELECT id FROM users WHERE tenant_id = ? AND email = ?").bind(t, email).first<any>();
    return { t, socio, adv, link: r.json.link as string, id: linha.id as string };
  }

  it("sócio exclui; o link deixa de funcionar e a vaga volta; auditoria só com ids", async () => {
    const { t, socio, link, id } = await comConvite();
    const token = link.split("#")[1]!;
    expect((await chamar("POST", "/api/acesso/validar", { corpo: { token } })).status).toBe(200);
    const r = await chamar("DELETE", `/api/equipe/convites/${id}`, { cookie: socio.cookie });
    expect(r.status).toBe(200);
    expect((await chamar("POST", "/api/acesso/validar", { corpo: { token } })).status).not.toBe(200);
    expect(await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(id).first()).toBeNull();
    expect(await env.DB.prepare("SELECT id FROM tokens_acesso WHERE user_id = ?").bind(id).first()).toBeNull();
    const aud = await env.DB.prepare("SELECT entidade_id, detalhes FROM audit_log WHERE tenant_id = ? AND acao = 'convite_excluido'").bind(t).first<any>();
    expect(aud.entidade_id).toBe(id);
    expect(aud.detalhes).toBeNull();
  });

  it("exclui também convite com permissão já atribuída", async () => {
    const { socio, id, t } = await comConvite();
    await criarRepositorio(env.DB, t).permissoes.definir(id, "financeiro", "leitura", (await env.DB.prepare("SELECT id FROM users WHERE tenant_id = ? AND perfil = 'socio'").bind(t).first<any>()).id);
    expect((await chamar("DELETE", `/api/equipe/convites/${id}`, { cookie: socio.cookie })).status).toBe(200);
  });

  it("só sócio exclui", async () => {
    const { adv, id } = await comConvite();
    expect((await chamar("DELETE", `/api/equipe/convites/${id}`, { cookie: adv.cookie })).status).toBe(403);
    expect((await chamar("DELETE", `/api/equipe/convites/${id}`)).status).toBe(401);
  });

  it("só convite pendente: usuário que já aceitou dá 409 e continua existindo", async () => {
    const { socio, adv } = await comConvite();
    const r = await chamar("DELETE", `/api/equipe/convites/${adv.id}`, { cookie: socio.cookie });
    expect(r.status).toBe(409);
    expect(await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(adv.id).first()).not.toBeNull();
  });

  it("convite de outro escritório e id inexistente dão 404 sem apagar nada", async () => {
    const a = await comConvite();
    const b = await comConvite();
    expect((await chamar("DELETE", `/api/equipe/convites/${b.id}`, { cookie: a.socio.cookie })).status).toBe(404);
    expect(await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(b.id).first()).not.toBeNull();
    expect((await chamar("DELETE", `/api/equipe/convites/nao-existe`, { cookie: a.socio.cookie })).status).toBe(404);
  });
});
