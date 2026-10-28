import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { executarAlertasDiarios } from "../src/server/alertas-email";
import { criarAcessoPlataforma, criarRepositorio } from "../src/server/db/repositorio";
import { ErroEnvioEmail, URL_RESEND, criarEnviadorResend } from "../src/server/email";
import { prepararBanco } from "./aplicar-migracoes";
import { chamar, criarEscritorio, criarUsuario, sessaoDeUsuario } from "./ajuda";

prepararBanco();

const CHAVE = "re_chave_secreta_de_teste_123";
const URL_APP = "https://dev.app.advocacia.legal";
const MANHA = Date.parse("2026-11-10T10:00:00Z");
const HOJE = "2026-11-10";
const sem_espera = async () => undefined;

interface Chamada {
  url: string;
  init: RequestInit;
  corpo: any;
}

/** Resend falso: nunca usa a rede. `respostas` define o resultado de cada chamada (padrão: sucesso). */
function resendFalso(respostas: ((c: Chamada) => Response)[] = []) {
  const chamadas: Chamada[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    const c: Chamada = { url, init, corpo: JSON.parse(String(init.body)) };
    chamadas.push(c);
    const fn = respostas.shift();
    return fn ? fn(c) : Response.json({ id: "id-falso" });
  }) as unknown as typeof fetch;
  return { chamadas, fetchFn };
}

const erro = (status: number, name: string, extra: Record<string, string> = {}) => () => Response.json({ name, message: "texto livre com a@b.com", statusCode: status }, { status, headers: extra });
const enviadorCom = (fetchFn: typeof fetch) => criarEnviadorResend({ chave: CHAVE, remetente: "alertas@advocacia.legal", fetchFn, esperar: sem_espera });
const msg = { para: "ana@exemplo.com", assunto: "Assunto", texto: "Texto", html: "<p>Texto</p>", idempotencia: "alerta-prazos/t/u/2026-11-10/abc" };

async function optante(t: string, perfil: "socio" | "advogado" = "advogado") {
  const u = await criarUsuario(t, perfil);
  await criarRepositorio(env.DB, t).preferencias.definirAlertaEmail(u.id, true);
  return u;
}
async function prazo(t: string, responsavel: string, titulo = "Contestação") {
  await criarRepositorio(env.DB, t).prazos.inserir({ titulo, data_fatal: HOJE, responsavel_id: responsavel, descricao: null, hora: null, processo_id: null, status: "a_fazer", criado_em: "2026-11-01T00:00:00.000Z", atualizado_em: "2026-11-01T00:00:00.000Z" } as never);
}

describe("enviador Resend (fetch falso)", () => {
  it("chama POST /emails com chave, remetente, idempotência e User-Agent", async () => {
    const f = resendFalso();
    await enviadorCom(f.fetchFn).enviar(msg);
    expect(f.chamadas).toHaveLength(1);
    const c = f.chamadas[0]!;
    expect(c.url).toBe(URL_RESEND);
    expect(c.init.method).toBe("POST");
    const h = c.init.headers as Record<string, string>;
    expect(h["Authorization"]).toBe(`Bearer ${CHAVE}`);
    expect(h["Idempotency-Key"]).toBe(msg.idempotencia);
    expect(h["User-Agent"]).toBeTruthy();
    expect(c.corpo).toMatchObject({ from: "advocacia.legal <alertas@advocacia.legal>", to: ["ana@exemplo.com"], subject: "Assunto", text: "Texto", html: "<p>Texto</p>" });
    expect(c.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("4xx e 5xx viram ErroEnvioEmail só com código; nada de e-mail, texto ou chave", async () => {
    for (const [status, nome, esperado] of [[422, "missing_required_field", "missing_required_field"], [403, "validation_error", "validation_error"], [500, "application_error", "application_error"], [503, "x".repeat(100), "http_503"]] as const) {
      const f = resendFalso([erro(status, nome)]);
      const e = await enviadorCom(f.fetchFn).enviar(msg).catch((x) => x);
      expect(e).toBeInstanceOf(ErroEnvioEmail);
      expect(e.codigo).toBe(esperado);
      expect(e.status).toBe(status);
      expect(e.interrompeTudo).toBe(false);
      expect(JSON.stringify([e.message, e.codigo, e.stack ?? ""])).not.toMatch(/a@b\.com|ana@exemplo|re_chave/);
    }
  });

  it("401 e cota esgotada interrompem o lote; chave de API ausente em corpo não vaza", async () => {
    const a = await enviadorCom(resendFalso([erro(401, "validation_error")]).fetchFn).enviar(msg).catch((x) => x);
    expect(a.interrompeTudo).toBe(true);
    const b = await enviadorCom(resendFalso([erro(429, "daily_quota_exceeded")]).fetchFn).enviar(msg).catch((x) => x);
    expect(b).toMatchObject({ codigo: "daily_quota_exceeded", status: 429, interrompeTudo: true });
  });

  it("429 rate_limit_exceeded espera o retry-after e tenta uma vez mais", async () => {
    const esperas: number[] = [];
    const f = resendFalso([erro(429, "rate_limit_exceeded", { "retry-after": "2" })]);
    await criarEnviadorResend({ chave: CHAVE, remetente: "a@b.c", fetchFn: f.fetchFn, esperar: async (ms) => void esperas.push(ms) }).enviar(msg);
    expect(f.chamadas).toHaveLength(2);
    expect(esperas).toEqual([2000]);
    // Persistindo o 429, falha sem interromper os demais.
    const g = resendFalso([erro(429, "rate_limit_exceeded"), erro(429, "rate_limit_exceeded")]);
    const e = await enviadorCom(g.fetchFn).enviar(msg).catch((x) => x);
    expect(e).toMatchObject({ codigo: "rate_limit_exceeded", status: 429, interrompeTudo: false });
  });

  it("falha de rede e tempo esgotado viram códigos sem a mensagem original", async () => {
    const rede = (async () => {
      throw new TypeError("falha em https://api.resend.com com Bearer " + CHAVE);
    }) as unknown as typeof fetch;
    const e = await enviadorCom(rede).enviar(msg).catch((x) => x);
    expect(e.codigo).toBe("rede");
    expect(JSON.stringify([e.message, e.stack])).not.toContain(CHAVE);
    const lento = ((_u: string, init: RequestInit) => new Promise((_ok, ruim) => init.signal!.addEventListener("abort", () => ruim(init.signal!.reason)))) as unknown as typeof fetch;
    const t = await criarEnviadorResend({ chave: CHAVE, remetente: "a@b.c", fetchFn: lento, timeoutMs: 20 }).enviar(msg).catch((x) => x);
    expect(t.codigo).toBe("tempo_esgotado");
  });
});

describe("Cron com Resend falso: só quem optou", () => {
  afterEach(() => vi.restoreAllMocks());

  it("envia só para quem ligou o aviso; quem não ligou fica de fora", async () => {
    const t = await criarEscritorio("banca");
    const sim = await optante(t);
    const nao = await criarUsuario(t, "advogado");
    await prazo(t, sim.id);
    await prazo(t, nao.id);
    const f = resendFalso();
    const r = await executarAlertasDiarios(env.DB, enviadorCom(f.fetchFn), URL_APP, MANHA);
    const para = f.chamadas.map((c) => c.corpo.to[0]);
    expect(para).toContain(sim.email);
    expect(para).not.toContain(nao.email);
    expect(r.enviados).toBeGreaterThanOrEqual(1);
    const c = f.chamadas.find((x) => x.corpo.to[0] === sim.email)!;
    expect(c.corpo.text).toContain(`${URL_APP}/minha-conta`);
    expect(c.corpo.text).toContain("Para parar de receber, desative em Minha conta");
    expect((c.init.headers as Record<string, string>)["Idempotency-Key"]).toMatch(/^alerta-prazos\/.+\/2026-11-10\/[0-9a-f]{16}$/);
  });

  it("desligar o aviso para de enviar; sem prazos não envia; escritório bloqueado, suspenso ou usuário inativo ficam de fora", async () => {
    const ok = await criarEscritorio();
    const bloq = await criarEscritorio();
    const susp = await criarEscritorio();
    const a = await optante(ok);
    const desligou = await optante(ok);
    const semPrazo = await optante(ok);
    const inativo = await optante(ok);
    const b = await optante(bloq);
    const s = await optante(susp);
    for (const [t, u] of [[ok, a], [ok, desligou], [ok, inativo], [bloq, b], [susp, s]] as const) await prazo(t, u.id);
    await criarRepositorio(env.DB, ok).preferencias.definirAlertaEmail(desligou.id, false);
    await criarRepositorio(env.DB, ok).users.atualizar(inativo.id, { ativo: 0 });
    const plat = criarAcessoPlataforma(env.DB);
    await plat.atualizarEscritorio(bloq, { status: "teste", teste_ate: "2026-10-01T23:59:59.999Z" });
    await plat.atualizarEscritorio(susp, { status: "suspenso" });
    const f = resendFalso();
    await executarAlertasDiarios(env.DB, enviadorCom(f.fetchFn), URL_APP, MANHA);
    const para = f.chamadas.map((c) => c.corpo.to[0]);
    expect(para).toContain(a.email);
    for (const u of [desligou, semPrazo, inativo, b, s]) expect(para).not.toContain(u.email);
  });

  it("erro 4xx em um usuário não derruba os outros; nenhum segredo, e-mail ou texto vai ao log ou à auditoria", async () => {
    const t = await criarEscritorio();
    const [a, b, c] = [await optante(t), await optante(t), await optante(t)];
    for (const u of [a, b, c]) await prazo(t, u.id, "Título secreto do prazo");
    const f = resendFalso([() => Response.json({ id: "1" }), erro(422, "missing_required_field"), () => Response.json({ id: "3" })]);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const r = await executarAlertasDiarios(env.DB, enviadorCom(f.fetchFn), URL_APP, MANHA);
    expect(r.enviados).toBe(2);
    expect(r.falhas).toBe(1);
    const visto = JSON.stringify([log.mock.calls, err.mock.calls, await criarRepositorio(env.DB, t).auditoria.listar({})]);
    for (const proibido of [CHAVE, a.email, b.email, c.email, "Título secreto", "a@b.com"]) expect(visto).not.toContain(proibido);
    expect(visto).toContain("missing_required_field");
  });

  it("chave inválida (401) interrompe o lote do dia, e quem ficou sem e-mail pode tentar de novo", async () => {
    const t = await criarEscritorio();
    const [a, b] = [await optante(t), await optante(t)];
    for (const u of [a, b]) await prazo(t, u.id);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ruim = resendFalso([erro(401, "validation_error"), erro(401, "validation_error")]);
    const r = await executarAlertasDiarios(env.DB, enviadorCom(ruim.fetchFn), URL_APP, MANHA);
    expect(ruim.chamadas.length).toBeLessThanOrEqual(2);
    expect(r.enviados).toBe(0);
    const boa = resendFalso();
    const r2 = await executarAlertasDiarios(env.DB, enviadorCom(boa.fetchFn), URL_APP, MANHA + 60_000);
    expect(r2.enviados).toBeGreaterThanOrEqual(2);
  });
});

describe("preferência: GET/PUT /api/eu/preferencias", () => {
  it("exige sessão; padrão desligado; o próprio usuário liga e desliga, com auditoria de/para", async () => {
    expect((await chamar("GET", "/api/eu/preferencias")).status).toBe(401);
    const t = await criarEscritorio();
    const eu = await sessaoDeUsuario(t, "advogado");
    const g = await chamar("GET", "/api/eu/preferencias", { cookie: eu.cookie });
    expect(g.json).toMatchObject({ ok: true, alerta_email: false, envio_habilitado: false });
    const p = await chamar("PUT", "/api/eu/preferencias", { cookie: eu.cookie, corpo: { alerta_email: true } });
    expect(p.status).toBe(200);
    expect((await chamar("GET", "/api/eu/preferencias", { cookie: eu.cookie })).json.alerta_email).toBe(true);
    await chamar("PUT", "/api/eu/preferencias", { cookie: eu.cookie, corpo: { alerta_email: false } });
    expect((await chamar("GET", "/api/eu/preferencias", { cookie: eu.cookie })).json.alerta_email).toBe(false);
    const aud = await criarRepositorio(env.DB, t).auditoria.listar({ acao: "preferencia_alterada" });
    expect(aud).toHaveLength(2);
    const texto = JSON.stringify(aud);
    expect(texto).not.toContain(eu.email);
    expect(texto).toContain(eu.id);
  });

  it("recusa corpo inválido e a tentativa de escolher outro usuário ou escritório", async () => {
    const a = await criarEscritorio();
    const b = await criarEscritorio();
    const ua = await sessaoDeUsuario(a);
    const ub = await criarUsuario(b);
    expect((await chamar("PUT", "/api/eu/preferencias", { cookie: ua.cookie, corpo: { alerta_email: "sim" } })).status).toBe(400);
    expect((await chamar("PUT", "/api/eu/preferencias", { cookie: ua.cookie, corpo: {} })).status).toBe(400);
    // Parâmetros extras (user_id, tenant_id) são ignorados: só o usuário da sessão muda.
    await chamar("PUT", "/api/eu/preferencias", { cookie: ua.cookie, corpo: { alerta_email: true, user_id: ub.id, tenant_id: b } });
    expect(await criarRepositorio(env.DB, b).preferencias.alertaEmail(ub.id)).toBe(false);
    expect(await criarRepositorio(env.DB, a).preferencias.alertaEmail(ua.id)).toBe(true);
  });

  it("isolamento: o repositório de outro escritório não lê nem altera a preferência", async () => {
    const a = await criarEscritorio();
    const b = await criarEscritorio();
    const ua = await criarUsuario(a);
    await criarRepositorio(env.DB, a).preferencias.definirAlertaEmail(ua.id, true);
    expect(await criarRepositorio(env.DB, b).preferencias.alertaEmail(ua.id)).toBe(false);
    expect(await criarRepositorio(env.DB, b).preferencias.definirAlertaEmail(ua.id, false)).toBe(false);
    expect(await criarRepositorio(env.DB, a).preferencias.alertaEmail(ua.id)).toBe(true);
  });

  it("escritório em somente leitura: pode desligar, mas não ligar (402)", async () => {
    const t = await criarEscritorio();
    const eu = await sessaoDeUsuario(t);
    await chamar("PUT", "/api/eu/preferencias", { cookie: eu.cookie, corpo: { alerta_email: true } });
    const doisDiasAtras = new Date(Date.now() - 2 * 24 * 3600_000).toISOString();
    await criarAcessoPlataforma(env.DB).atualizarEscritorio(t, { status: "teste", teste_ate: doisDiasAtras });
    const desligar = await chamar("PUT", "/api/eu/preferencias", { cookie: eu.cookie, corpo: { alerta_email: false } });
    expect(desligar.status).toBe(200);
    const ligar = await chamar("PUT", "/api/eu/preferencias", { cookie: eu.cookie, corpo: { alerta_email: true } });
    expect(ligar.status).toBe(402);
    expect(ligar.json.codigo).toBe("assinatura_somente_leitura");
  });

  it("chave geral desligada: a tela recebe envio_habilitado=false e nenhum e-mail sai", async () => {
    const eu = await sessaoDeUsuario(await criarEscritorio());
    const g = await chamar("GET", "/api/eu/preferencias", { cookie: eu.cookie });
    expect(g.json.envio_habilitado).toBe(false);
    expect(JSON.stringify(g.json)).not.toMatch(/resend|RESEND|chave/i);
    const { aoAgendar } = await import("../src/server/alertas-email");
    const chamadas = vi.spyOn(globalThis, "fetch");
    expect(await aoAgendar({ ...env, EMAIL_ALERTAS_ATIVO: "false", RESEND_API_KEY: CHAVE }, MANHA)).toBeNull();
    expect(chamadas).not.toHaveBeenCalled();
    chamadas.mockRestore();
  });
});
