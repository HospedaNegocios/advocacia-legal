import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { executarAlertasDiarios, aoAgendar, montarEmailAlerta, enviadorDoAmbiente } from "../src/server/alertas-email";
import { criarAcessoPlataforma, criarRepositorio } from "../src/server/db/repositorio";
import type { StatusEscritorio } from "../src/server/db/repositorio";
import type { EnviadorEmail, MensagemEmail } from "../src/server/email";
import { prepararBanco } from "./aplicar-migracoes";
import { chamar, criarEscritorio, criarUsuario, sessaoDeUsuario } from "./ajuda";

prepararBanco();

const URL_APP = "https://dev.app.advocacia.legal";
// 10:00 UTC = 07:00 em São Paulo.
const MANHA = Date.parse("2026-11-10T10:00:00Z");
const HOJE = "2026-11-10";

class EnviadorFalso implements EnviadorEmail {
  enviadas: MensagemEmail[] = [];
  falharPara = new Set<string>();
  async enviar(m: MensagemEmail) {
    if (this.falharPara.has(m.para)) throw new Error("falha simulada");
    this.enviadas.push(m);
  }
  para(email: string) {
    return this.enviadas.filter((m) => m.para === email);
  }
}

async function novoPrazo(t: string, responsavel: string, data_fatal: string, extra: object = {}) {
  const repo = criarRepositorio(env.DB, t);
  const id = await repo.prazos.inserir({ titulo: "Contestação", data_fatal, responsavel_id: responsavel, descricao: null, hora: null, processo_id: null, status: "a_fazer", criado_em: "2026-11-01T00:00:00.000Z", atualizado_em: "2026-11-01T00:00:00.000Z", ...extra } as never);
  return id;
}

async function mudarStatusEscritorio(t: string, status: StatusEscritorio) {
  await criarAcessoPlataforma(env.DB).atualizarEscritorio(t, { status });
}

describe("popup: GET /api/alertas/prazos", () => {
  afterEach(() => vi.useRealTimers());

  it("exige sessão", async () => {
    const r = await chamar("GET", "/api/alertas/prazos");
    expect(r.status).toBe(401);
  });

  it("devolve só prazos abertos do próprio usuário, vencidos, de hoje ou de amanhã", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-10T15:00:00Z"));
    const t = await criarEscritorio("banca");
    const eu = await sessaoDeUsuario(t, "advogado");
    const outro = await criarUsuario(t, "advogado");
    await novoPrazo(t, eu.id, "2026-11-08", { titulo: "Vencido" });
    await novoPrazo(t, eu.id, HOJE, { titulo: "Hoje" });
    await novoPrazo(t, eu.id, "2026-11-11", { titulo: "Amanhã" });
    await novoPrazo(t, eu.id, "2026-11-12", { titulo: "Depois de amanhã" });
    await novoPrazo(t, eu.id, "2026-11-05", { titulo: "Concluído", status: "concluido", concluido_em: "2026-11-06T00:00:00.000Z" });
    await novoPrazo(t, outro.id, HOJE, { titulo: "De outra pessoa" });
    const r = await chamar("GET", "/api/alertas/prazos", { cookie: eu.cookie });
    expect(r.status).toBe(200);
    expect(r.json.hoje).toBe(HOJE);
    expect(r.json.total).toBe(3);
    expect(r.json.prazos.map((p: any) => p.titulo)).toEqual(["Vencido", "Hoje", "Amanhã"]);
    expect(r.json.prazos.map((p: any) => p.situacao)).toEqual(["vencido", "hoje", "futuro"]);
    expect(r.json.prazos[0]).not.toHaveProperty("responsavel_id");
  });

  it("não mostra prazos de outro escritório (isolamento)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-10T15:00:00Z"));
    const a = await criarEscritorio();
    const b = await criarEscritorio();
    const ua = await sessaoDeUsuario(a);
    const ub = await sessaoDeUsuario(b);
    await novoPrazo(a, ua.id, HOJE, { titulo: "Do escritório A" });
    await novoPrazo(b, ub.id, HOJE, { titulo: "Do escritório B" });
    const r = await chamar("GET", "/api/alertas/prazos", { cookie: ub.cookie });
    expect(r.json.prazos.map((p: any) => p.titulo)).toEqual(["Do escritório B"]);
  });

  it("usa o dia de São Paulo perto da meia-noite UTC", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-11T02:30:00Z")); // 23:30 do dia 10 em SP
    const t = await criarEscritorio();
    const eu = await sessaoDeUsuario(t);
    await novoPrazo(t, eu.id, "2026-11-10", { titulo: "Dia 10" });
    await novoPrazo(t, eu.id, "2026-11-11", { titulo: "Dia 11" });
    await novoPrazo(t, eu.id, "2026-11-12", { titulo: "Dia 12" });
    const antes = await chamar("GET", "/api/alertas/prazos", { cookie: eu.cookie });
    expect(antes.json.hoje).toBe("2026-11-10");
    expect(antes.json.prazos.map((p: any) => p.titulo)).toEqual(["Dia 10", "Dia 11"]);
    vi.setSystemTime(new Date("2026-11-11T03:00:00Z")); // meia-noite em SP
    const depois = await chamar("GET", "/api/alertas/prazos", { cookie: eu.cookie });
    expect(depois.json.hoje).toBe("2026-11-11");
    expect(depois.json.prazos.map((p: any) => p.titulo)).toEqual(["Dia 10", "Dia 11", "Dia 12"]);
    expect(depois.json.prazos[0].situacao).toBe("vencido");
  });
});

describe("e-mail diário de prazos", () => {
  it("manda um e-mail por usuário, com o link do app e só os prazos dele", async () => {
    const t = await criarEscritorio("banca");
    const ana = await criarUsuario(t, "advogado");
    const beto = await criarUsuario(t, "advogado");
    const sem = await criarUsuario(t, "advogado");
    await novoPrazo(t, ana.id, "2026-11-09", { titulo: "Prazo vencido da Ana" });
    await novoPrazo(t, ana.id, HOJE, { titulo: "Prazo de hoje da Ana" });
    await novoPrazo(t, ana.id, "2026-11-13", { titulo: "Daqui a 3 dias" });
    await novoPrazo(t, ana.id, "2026-11-14", { titulo: "Daqui a 4 dias (fora)" });
    await novoPrazo(t, beto.id, HOJE, { titulo: "Prazo do Beto" });
    await novoPrazo(t, sem.id, "2026-12-30", { titulo: "Longe" });
    const f = new EnviadorFalso();
    await executarAlertasDiarios(env.DB, f, URL_APP, MANHA);
    expect(f.para(ana.email)).toHaveLength(1);
    expect(f.para(beto.email)).toHaveLength(1);
    expect(f.para(sem.email)).toHaveLength(0);
    const m = f.para(ana.email)[0]!;
    expect(m.texto).toContain("Prazo vencido da Ana");
    expect(m.texto).toContain("Prazo de hoje da Ana");
    expect(m.texto).toContain("Daqui a 3 dias");
    expect(m.texto).not.toContain("fora");
    expect(m.texto).not.toContain("Prazo do Beto");
    expect(m.texto).toContain(`${URL_APP}/prazos`);
    expect(m.html).toContain(`href="${URL_APP}/prazos"`);
    expect(m.assunto).toBe("Prazos: 3 prazos precisam da sua atenção");
  });

  it("não manda e-mail quando não há prazos nem para prazos concluídos", async () => {
    const t = await criarEscritorio();
    const u = await criarUsuario(t);
    await novoPrazo(t, u.id, "2026-11-01", { status: "concluido", concluido_em: "2026-11-02T00:00:00.000Z" });
    const f = new EnviadorFalso();
    await executarAlertasDiarios(env.DB, f, URL_APP, MANHA);
    expect(f.para(u.email)).toHaveLength(0);
  });

  it("não repete o envio se o cron rodar duas vezes no mesmo dia, mas envia no dia seguinte", async () => {
    const t = await criarEscritorio();
    const u = await criarUsuario(t);
    await novoPrazo(t, u.id, HOJE);
    const f = new EnviadorFalso();
    await executarAlertasDiarios(env.DB, f, URL_APP, MANHA);
    const segunda = await executarAlertasDiarios(env.DB, f, URL_APP, MANHA + 60_000);
    expect(f.para(u.email)).toHaveLength(1);
    expect(segunda.jaEnviados).toBeGreaterThanOrEqual(1);
    await executarAlertasDiarios(env.DB, f, URL_APP, MANHA + 24 * 3600_000);
    expect(f.para(u.email)).toHaveLength(2);
  });

  it("ignora escritório suspenso ou cancelado e usuário inativo ou sem senha definida", async () => {
    const susp = await criarEscritorio();
    const canc = await criarEscritorio();
    const ok = await criarEscritorio();
    const us = await criarUsuario(susp);
    const uc = await criarUsuario(canc);
    const inativo = await criarUsuario(ok);
    const ativo = await criarUsuario(ok);
    const semSenha = await criarUsuario(ok);
    for (const [t, u] of [[susp, us], [canc, uc], [ok, inativo], [ok, ativo], [ok, semSenha]] as const) await novoPrazo(t, u.id, HOJE);
    await mudarStatusEscritorio(susp, "suspenso");
    await mudarStatusEscritorio(canc, "cancelado");
    await criarRepositorio(env.DB, ok).users.atualizar(inativo.id, { ativo: 0 });
    await env.DB.prepare("UPDATE users SET senha_definida = 0 WHERE id = ?").bind(semSenha.id).run();
    const f = new EnviadorFalso();
    await executarAlertasDiarios(env.DB, f, URL_APP, MANHA);
    expect(f.enviadas.some((m) => [us.email, uc.email, inativo.email, semSenha.email].includes(m.para))).toBe(false);
    expect(f.para(ativo.email)).toHaveLength(1);
  });

  it("escritório em teste recebe; a falha de um envio não derruba os outros e pode ser repetida", async () => {
    const t = await criarEscritorio();
    const a = await criarUsuario(t);
    const b = await criarUsuario(t);
    const c = await criarUsuario(t);
    for (const u of [a, b, c]) await novoPrazo(t, u.id, HOJE);
    const f = new EnviadorFalso();
    f.falharPara.add(b.email);
    const erro = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const r = await executarAlertasDiarios(env.DB, f, URL_APP, MANHA);
    expect(r.falhas).toBeGreaterThanOrEqual(1);
    expect(f.para(a.email)).toHaveLength(1);
    expect(f.para(c.email)).toHaveLength(1);
    expect(f.para(b.email)).toHaveLength(0);
    // O log não carrega e-mail nem texto do prazo.
    expect(JSON.stringify(erro.mock.calls)).not.toContain(b.email);
    erro.mockRestore();
    const auditoria = await criarRepositorio(env.DB, t).auditoria.listar({ acao: "alerta_email_falha" });
    expect(auditoria).toHaveLength(1);
    expect(auditoria[0]!.detalhes ?? "").not.toContain(b.email);
    // A reserva foi desfeita: uma nova execução do mesmo dia tenta de novo só para quem falhou.
    f.falharPara.clear();
    await executarAlertasDiarios(env.DB, f, URL_APP, MANHA + 60_000);
    expect(f.para(b.email)).toHaveLength(1);
    expect(f.para(a.email)).toHaveLength(1);
  });

  it("o conteúdo traz só dados do próprio escritório", async () => {
    const a = await criarEscritorio();
    const b = await criarEscritorio();
    const ua = await criarUsuario(a);
    const ub = await criarUsuario(b);
    await novoPrazo(a, ua.id, HOJE, { titulo: "Segredo do escritório A" });
    await novoPrazo(b, ub.id, HOJE, { titulo: "Segredo do escritório B" });
    const f = new EnviadorFalso();
    await executarAlertasDiarios(env.DB, f, URL_APP, MANHA);
    expect(f.para(ua.email)[0]!.texto).toContain("escritório A");
    expect(f.para(ua.email)[0]!.texto + f.para(ua.email)[0]!.html).not.toContain("escritório B");
    expect(f.para(ub.email)[0]!.texto + f.para(ub.email)[0]!.html).not.toContain("escritório A");
  });

  it("usa o dia de São Paulo (10:00 UTC é 07:00 lá) e escapa HTML no título", () => {
    const m = montarEmailAlerta({ nome: "Maria Silva", prazos: [{ titulo: "<b>x</b>", data_fatal: HOJE, hora: "14:30", processo_numero: "00000017820208260100" }], total: 1, hoje: HOJE, urlApp: URL_APP });
    expect(m.html).not.toContain("<b>x</b>");
    expect(m.html).toContain("&lt;b&gt;");
    expect(m.texto).toContain("Olá, Maria.");
    expect(m.texto).toContain("10/11/2026 às 14:30");
    expect(m.texto).toContain("0000001-78.2020.8.26.0100");
  });

  it("limita a lista e avisa quantos faltam", () => {
    const prazos = Array.from({ length: 3 }, (_, i) => ({ titulo: `P${i}`, data_fatal: HOJE, hora: null, processo_numero: null }));
    const m = montarEmailAlerta({ nome: "A", prazos, total: 10, hoje: HOJE, urlApp: URL_APP });
    expect(m.texto).toContain("E mais 7 prazos.");
  });

  it("São Paulo fica em UTC-3 o ano todo: 10:00 UTC é sempre 07:00", async () => {
    const { partesLocais } = await import("../src/comum/fuso");
    for (const d of ["2026-01-15", "2026-07-15", "2026-11-10", "2027-02-10"]) {
      expect(partesLocais(Date.parse(`${d}T10:00:00Z`), "America/Sao_Paulo").hora).toBe("07:00");
    }
  });
});

describe("envio desligado por padrão", () => {
  it("não envia nada e não quebra se estiver desligado ou mal configurado", async () => {
    const base = { ...env } as typeof env;
    expect(enviadorDoAmbiente({ ...base, EMAIL_ALERTAS_ATIVO: "false" })).toEqual({ motivo: "desligado" });
    expect(enviadorDoAmbiente({ ...base })).toEqual({ motivo: "desligado" });
    expect("motivo" in enviadorDoAmbiente({ ...base, EMAIL_ALERTAS_ATIVO: "true" })).toBe(true);
    expect("motivo" in enviadorDoAmbiente({ ...base, EMAIL_ALERTAS_ATIVO: "true", URL_APP: "http://x", EMAIL_REMETENTE: "a@b.c", EMAIL: { send: async () => ({ messageId: "1" }) } })).toBe(true);
    const ok = enviadorDoAmbiente({ ...base, EMAIL_ALERTAS_ATIVO: "true", URL_APP: "https://dev.app.advocacia.legal/", EMAIL_REMETENTE: "a@b.c", EMAIL: { send: async () => ({ messageId: "1" }) } });
    expect("enviador" in ok && ok.urlApp).toBe("https://dev.app.advocacia.legal");
    expect(await aoAgendar({ ...base, EMAIL_ALERTAS_ATIVO: "false" }, MANHA)).toBeNull();
  });
});
