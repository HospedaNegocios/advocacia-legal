import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { prepararBanco } from "./aplicar-migracoes";
import { chamar, criarEscritorio, sessaoDeUsuario } from "./ajuda";

prepararBanco();

async function cenario() {
  const t = await criarEscritorio("escritorio");
  const socio = await sessaoDeUsuario(t, "socio");
  const advogado = await sessaoDeUsuario(t, "advogado");
  const estagiario = await sessaoDeUsuario(t, "estagiario");
  const secretaria = await sessaoDeUsuario(t, "secretaria");
  return { t, socio, advogado, estagiario, secretaria };
}

const dia = (extra: object = {}) => ({ data: "2025-10-08", descricao: "Feriado municipal (teste)", tipo: "feriado_local", ...extra });
const CALC = { data: "2025-10-02", tipo_inicio: "disponibilizacao", dias: 15, contagem: "uteis" };

describe("calendário do escritório", () => {
  it("sócio e advogado criam e apagam; estagiário e secretária só leem", async () => {
    const { socio, advogado, estagiario, secretaria } = await cenario();
    const a = await chamar("POST", "/api/calendario", { cookie: socio.cookie, corpo: dia() });
    expect(a.status, JSON.stringify(a.json)).toBe(201);
    const b = await chamar("POST", "/api/calendario", { cookie: advogado.cookie, corpo: dia({ data: "2025-10-09" }) });
    expect(b.status).toBe(201);
    for (const u of [estagiario, secretaria]) {
      expect((await chamar("POST", "/api/calendario", { cookie: u.cookie, corpo: dia({ data: "2025-10-10" }) })).status).toBe(403);
      expect((await chamar("DELETE", `/api/calendario/${a.json.dia.id}`, { cookie: u.cookie })).status).toBe(403);
      const l = await chamar("GET", "/api/calendario?ano=2025", { cookie: u.cookie });
      expect(l.status).toBe(200);
      expect(l.json.dias.map((x: any) => x.data)).toEqual(["2025-10-08", "2025-10-09"]);
    }
    expect((await chamar("DELETE", `/api/calendario/${b.json.dia.id}`, { cookie: advogado.cookie })).status).toBe(200);
    expect((await chamar("DELETE", `/api/calendario/${b.json.dia.id}`, { cookie: advogado.cookie })).status).toBe(404);
  });

  it("sem sessão é 401 e a lista traz feriados nacionais e sugestões do ano", async () => {
    const { socio } = await cenario();
    expect((await chamar("GET", "/api/calendario")).status).toBe(401);
    const r = await chamar("GET", "/api/calendario?ano=2025", { cookie: socio.cookie });
    expect(r.json.nacionais).toHaveLength(9);
    expect(r.json.sugestoes.map((s: any) => s.data)).toContain("2025-04-18"); // Sexta-feira Santa 2025
    expect(r.json.dias).toEqual([]);
  });

  it("valida os campos e não repete a mesma data", async () => {
    const { socio } = await cenario();
    const c = socio.cookie;
    for (const ruim of [dia({ data: "2025-02-30" }), dia({ data: "2010-01-01" }), dia({ descricao: "  " }), dia({ descricao: "x".repeat(201) }), dia({ tipo: "feriado_nacional" }), dia({ data: undefined })]) {
      expect((await chamar("POST", "/api/calendario", { cookie: c, corpo: ruim })).status).toBe(400);
    }
    expect((await chamar("GET", "/api/calendario?ano=1999", { cookie: c })).status).toBe(400);
    expect((await chamar("POST", "/api/calendario", { cookie: c, corpo: dia() })).status).toBe(201);
    expect((await chamar("POST", "/api/calendario", { cookie: c, corpo: dia({ descricao: "Outra" }) })).status).toBe(409);
  });

  it("auditoria não guarda o texto livre da descrição", async () => {
    const { t, socio } = await cenario();
    const r = await chamar("POST", "/api/calendario", { cookie: socio.cookie, corpo: dia({ descricao: "SEGREDO-NA-DESCRICAO" }) });
    await chamar("DELETE", `/api/calendario/${r.json.dia.id}`, { cookie: socio.cookie });
    const linhas = await env.DB.prepare("SELECT acao, detalhes FROM audit_log WHERE tenant_id = ? AND entidade = 'calendario_dias'").bind(t).all<{ acao: string; detalhes: string | null }>();
    expect(linhas.results.map((l) => l.acao).sort()).toEqual(["calendario_dia_criado", "calendario_dia_removido"]);
    expect(JSON.stringify(linhas.results)).not.toContain("SEGREDO");
  });

  it("isolamento: um escritório não vê, não apaga e não sofre efeito do calendário do outro", async () => {
    const A = await cenario();
    const B = await cenario();
    const criado = await chamar("POST", "/api/calendario", { cookie: A.socio.cookie, corpo: dia() });
    const id = criado.json.dia.id as string;
    // B não vê
    expect((await chamar("GET", "/api/calendario?ano=2025", { cookie: B.socio.cookie })).json.dias).toEqual([]);
    // B não apaga (404, nada acontece)
    expect((await chamar("DELETE", `/api/calendario/${id}`, { cookie: B.socio.cookie })).status).toBe(404);
    expect((await chamar("GET", "/api/calendario?ano=2025", { cookie: A.socio.cookie })).json.dias).toHaveLength(1);
    // B pode ter a MESMA data (a unicidade é por escritório)
    expect((await chamar("POST", "/api/calendario", { cookie: B.socio.cookie, corpo: dia() })).status).toBe(201);
    // O cálculo de B ignora o dia de A, e o de A usa o seu
    const novoB = await cenario();
    const rb = await chamar("POST", "/api/prazos/calcular", { cookie: novoB.socio.cookie, corpo: CALC });
    expect(rb.json.resultado.data_final).toBe("2025-10-24");
    const ra = await chamar("POST", "/api/prazos/calcular", { cookie: A.socio.cookie, corpo: CALC });
    expect(ra.json.resultado.data_final).toBe("2025-10-27");
  });

  it("o escritório vem da sessão: tenant_id no corpo é ignorado", async () => {
    const A = await cenario();
    const B = await cenario();
    const r = await chamar("POST", "/api/calendario", { cookie: A.socio.cookie, corpo: { ...dia(), tenant_id: B.t } });
    expect(r.status).toBe(201);
    const l = await env.DB.prepare("SELECT tenant_id FROM calendario_dias WHERE id = ?").bind(r.json.dia.id).first<{ tenant_id: string }>();
    expect(l!.tenant_id).toBe(A.t);
  });
});

describe("POST /api/prazos/calcular", () => {
  it("qualquer perfil calcula, e a rota não grava nada", async () => {
    const { t, socio, secretaria } = await cenario();
    for (const u of [socio, secretaria]) {
      const r = await chamar("POST", "/api/prazos/calcular", { cookie: u.cookie, corpo: CALC });
      expect(r.status, JSON.stringify(r.json)).toBe(200);
      expect(r.json.resultado.data_final).toBe("2025-10-24");
      expect(r.json.resultado.dia_do_comeco).toBe("2025-10-03");
      expect(r.json.resultado.passos.length).toBeGreaterThan(3);
      expect(r.json.resultado.avisos[0]).toContain("responsabilidade pelo prazo é do advogado");
    }
    const n = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM prazos WHERE tenant_id = ?) AS p, (SELECT COUNT(*) FROM calendario_dias WHERE tenant_id = ?) AS c").bind(t, t).first<{ p: number; c: number }>();
    expect(n).toEqual({ p: 0, c: 0 });
  });

  it("exige sessão, rejeita entradas inválidas e aplica a suspensão do CPC", async () => {
    const { socio } = await cenario();
    expect((await chamar("POST", "/api/prazos/calcular", { corpo: CALC })).status).toBe(401);
    for (const ruim of [{ ...CALC, data: "2025-02-30" }, { ...CALC, dias: 0 }, { ...CALC, dias: "15" }, { ...CALC, dias: 400 }, { ...CALC, contagem: "x" }, { ...CALC, tipo_inicio: "x" }, { ...CALC, aplicar_suspensao: "sim" }, {}]) {
      expect((await chamar("POST", "/api/prazos/calcular", { cookie: socio.cookie, corpo: ruim })).status).toBe(400);
    }
    const r = await chamar("POST", "/api/prazos/calcular", { cookie: socio.cookie, corpo: { ...CALC, data: "2025-12-15" } });
    expect(r.json.resultado.data_final).toBe("2026-02-05");
    const sem = await chamar("POST", "/api/prazos/calcular", { cookie: socio.cookie, corpo: { ...CALC, data: "2025-12-15", aplicar_suspensao: false } });
    expect(sem.json.resultado.data_final).toBe("2026-01-08");
  });

  it("não muda o comportamento dos prazos existentes (data_fatal continua sendo só uma data)", async () => {
    const { socio } = await cenario();
    const r = await chamar("POST", "/api/prazos", { cookie: socio.cookie, corpo: { titulo: "Contestação", data_fatal: "2025-10-24", responsavel_id: socio.id } });
    expect(r.status).toBe(201);
    expect(r.json.prazo.data_fatal).toBe("2025-10-24");
  });
});
