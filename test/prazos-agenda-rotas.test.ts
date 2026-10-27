import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FUSOS_ACEITOS, diferencaDias, fusoAceito, hojeEm, instanteLocal, lerIsoComFuso, limitesDoDia, partesLocais, somarDias } from "../src/comum/fuso";
import { prepararBanco } from "./aplicar-migracoes";
import { chamar, criarEscritorio, criarUsuario, entrar, sessaoDeUsuario } from "./ajuda";

prepararBanco();

const CNJ = "0000001-78.2020.8.26.0100";
const HOJE = () => hojeEm();

async function cenario() {
  const t = await criarEscritorio("banca");
  const socio = await sessaoDeUsuario(t, "socio");
  const advogado = await sessaoDeUsuario(t, "advogado");
  const advogado2 = await sessaoDeUsuario(t, "advogado");
  return { t, socio, advogado, advogado2 };
}

async function criarProcesso(cookie: string, numero = CNJ) {
  const r = await chamar("POST", "/api/processos", { cookie, corpo: { numero_cnj: numero, fase: "Conhecimento" } });
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  return r.json.processo.id as string;
}

const prazo = (responsavel_id: string, extra: object = {}) => ({ titulo: "Contestação", data_fatal: HOJE(), responsavel_id, ...extra });

async function criarPrazo(cookie: string, responsavel: string, extra: object = {}) {
  const r = await chamar("POST", "/api/prazos", { cookie, corpo: prazo(responsavel, extra) });
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  return r.json.prazo.id as string;
}

const evento = (extra: object = {}) => ({ titulo: "Audiência de instrução", tipo: "audiencia", inicio: "2026-11-10T14:00:00-03:00", fim: "2026-11-10T15:00:00-03:00", ...extra });

async function criarEvento(cookie: string, extra: object = {}) {
  const r = await chamar("POST", "/api/agenda", { cookie, corpo: evento(extra) });
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  return r.json.evento.id as string;
}

describe("datas e fusos (sem biblioteca externa)", () => {
  afterEach(() => vi.useRealTimers());

  it("calcula 'hoje' no fuso de São Paulo perto da meia-noite UTC", () => {
    // 02:30 UTC ainda é 23:30 do dia anterior em São Paulo (UTC-3).
    expect(hojeEm("America/Sao_Paulo", Date.parse("2026-11-03T02:30:00Z"))).toBe("2026-11-02");
    expect(hojeEm("America/Sao_Paulo", Date.parse("2026-11-03T02:59:59Z"))).toBe("2026-11-02");
    expect(hojeEm("America/Sao_Paulo", Date.parse("2026-11-03T03:00:00Z"))).toBe("2026-11-03");
    expect(hojeEm("America/Sao_Paulo", Date.parse("2026-11-03T23:59:00Z"))).toBe("2026-11-03");
    expect(hojeEm("America/Sao_Paulo", Date.parse("2026-11-04T00:00:00Z"))).toBe("2026-11-03");
    // Fim de ano: 01:00 UTC de 1º de janeiro ainda é 31 de dezembro em Brasília.
    expect(hojeEm("America/Sao_Paulo", Date.parse("2027-01-01T01:00:00Z"))).toBe("2026-12-31");
    // Manaus (UTC-4) fica um dia atrás por mais tempo.
    expect(hojeEm("America/Manaus", Date.parse("2026-11-03T03:30:00Z"))).toBe("2026-11-02");
  });

  it("soma dias e conta diferenças pelo calendário", () => {
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDias("2028-02-28", 1)).toBe("2028-02-29");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
    expect(diferencaDias("2026-11-02", "2026-11-09")).toBe(7);
    expect(diferencaDias("2026-11-09", "2026-11-02")).toBe(-7);
  });

  it("converte hora local para instante e delimita o dia local", () => {
    expect(new Date(instanteLocal("2026-11-10", "14:00", "America/Sao_Paulo")).toISOString()).toBe("2026-11-10T17:00:00.000Z");
    expect(new Date(instanteLocal("2026-11-10", "14:00", "America/Manaus")).toISOString()).toBe("2026-11-10T18:00:00.000Z");
    const dia = limitesDoDia("2026-11-10");
    expect(new Date(dia.inicio).toISOString()).toBe("2026-11-10T03:00:00.000Z");
    expect(new Date(dia.fim).toISOString()).toBe("2026-11-11T02:59:59.999Z");
    expect(partesLocais(Date.parse("2026-11-10T17:00:00Z"), "America/Sao_Paulo")).toMatchObject({ data: "2026-11-10", hora: "14:00" });
  });

  it("só aceita ISO 8601 com fuso e normaliza para UTC", () => {
    expect(lerIsoComFuso("2026-11-10T14:00:00-03:00")).toBe("2026-11-10T17:00:00.000Z");
    expect(lerIsoComFuso("2026-11-10T17:00:00Z")).toBe("2026-11-10T17:00:00.000Z");
    expect(lerIsoComFuso("2026-11-10T14:00-03:00")).toBe("2026-11-10T17:00:00.000Z");
    for (const ruim of ["2026-11-10T14:00:00", "2026-11-10", "10/11/2026 14:00", "2026-02-30T10:00:00Z", "2026-11-10T25:00:00Z", "2026-11-10T14:60:00Z", "", null, 5]) {
      expect(lerIsoComFuso(ruim), String(ruim)).toBeNull();
    }
  });

  it("aceita só fusos da lista fixa", () => {
    expect(fusoAceito("America/Sao_Paulo")).toBe(true);
    for (const f of FUSOS_ACEITOS) expect(() => new Intl.DateTimeFormat("pt-BR", { timeZone: f })).not.toThrow();
    for (const ruim of ["UTC", "Marte/Phobos", "America/New_York", "-03:00", "", null, 3]) expect(fusoAceito(ruim), String(ruim)).toBe(false);
  });

  it("o resumo da API usa o dia de São Paulo, não o do servidor (23:30 em SP, já é o dia seguinte em UTC)", async () => {
    // Cria a sessão com o relógio já ajustado, para ela não vencer.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-03T02:30:00Z"));
    const { socio } = await cenario();
    for (const data_fatal of ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-09", "2026-11-10"]) {
      await criarPrazo(socio.cookie, socio.id, { data_fatal, titulo: `Prazo ${data_fatal}` });
    }
    const antes = await chamar("GET", "/api/prazos/resumo", { cookie: socio.cookie });
    expect(antes.json.resumo).toMatchObject({ hoje: "2026-11-02", vencidos: 1, vencem_hoje: 1, proximos_7_dias: 2 });
    const lista = await chamar("GET", "/api/prazos", { cookie: socio.cookie });
    const por = Object.fromEntries(lista.json.prazos.map((p: any) => [p.data_fatal, p]));
    expect(por["2026-11-01"]).toMatchObject({ situacao: "vencido", dias_para_vencer: -1 });
    expect(por["2026-11-02"]).toMatchObject({ situacao: "hoje", dias_para_vencer: 0 });
    expect(por["2026-11-03"]).toMatchObject({ situacao: "futuro", dias_para_vencer: 1 });

    // Meia hora depois (03:00 UTC = 00:00 em SP) vira o dia: o de hoje passa a vencido.
    vi.setSystemTime(new Date("2026-11-03T03:00:00Z"));
    const depois = await chamar("GET", "/api/prazos/resumo", { cookie: socio.cookie });
    expect(depois.json.resumo).toMatchObject({ hoje: "2026-11-03", vencidos: 2, vencem_hoje: 1, proximos_7_dias: 2 });
    // Concluído nunca conta como vencido.
    const id = lista.json.prazos.find((p: any) => p.data_fatal === "2026-11-01").id;
    await chamar("POST", `/api/prazos/${id}/status`, { cookie: socio.cookie, corpo: { status: "concluido" } });
    const fim = await chamar("GET", "/api/prazos/resumo", { cookie: socio.cookie });
    expect(fim.json.resumo.vencidos).toBe(1);
    expect(fim.json.resumo.por_status.concluido).toBe(1);
  });
});

describe("prazos: cadastro e validação", () => {
  it("cria, lê, edita e lista com nomes de processo e responsável", async () => {
    const { socio, advogado } = await cenario();
    const proc = await criarProcesso(socio.cookie);
    const r = await chamar("POST", "/api/prazos", { cookie: advogado.cookie, corpo: prazo(socio.id, { processo_id: proc, hora: "17:30", descricao: "Prazo de 15 dias" }) });
    expect(r.status).toBe(201);
    expect(r.json.prazo).toMatchObject({ status: "a_fazer", hora: "17:30", processo_id: proc, processo_numero: "00000017820208260100", responsavel_nome: "Usuário Teste", concluido_em: null, situacao: "hoje" });
    const id = r.json.prazo.id as string;
    const lido = await chamar("GET", `/api/prazos/${id}`, { cookie: socio.cookie });
    expect(lido.json.prazo.titulo).toBe("Contestação");
    const ed = await chamar("PUT", `/api/prazos/${id}`, { cookie: advogado.cookie, corpo: prazo(advogado.id, { titulo: "Réplica", data_fatal: somarDias(HOJE(), 3), processo_id: null }) });
    expect(ed.status, JSON.stringify(ed.json)).toBe(200);
    expect(ed.json.prazo).toMatchObject({ titulo: "Réplica", processo_id: null, hora: null, responsavel_id: advogado.id, situacao: "futuro", dias_para_vencer: 3 });
  });

  it("recusa dados inválidos", async () => {
    const { socio } = await cenario();
    const ruins: object[] = [
      prazo(socio.id, { titulo: "" }),
      prazo(socio.id, { titulo: "x".repeat(201) }),
      prazo(socio.id, { data_fatal: "2026-02-30" }),
      prazo(socio.id, { data_fatal: "10/11/2026" }),
      prazo(socio.id, { data_fatal: undefined }),
      prazo(socio.id, { data_fatal: "1800-01-01" }),
      prazo(socio.id, { hora: "25:00" }),
      prazo(socio.id, { hora: "9h" }),
      prazo(socio.id, { status: "feito" }),
      prazo(socio.id, { descricao: "x".repeat(2001) }),
      prazo(socio.id, { responsavel_id: undefined }),
      prazo(socio.id, { processo_id: 5 }),
    ];
    for (const corpo of ruins) {
      const r = await chamar("POST", "/api/prazos", { cookie: socio.cookie, corpo });
      expect(r.status, JSON.stringify(corpo)).toBe(400);
    }
    expect((await chamar("GET", "/api/prazos?status=feito", { cookie: socio.cookie })).status).toBe(400);
    expect((await chamar("GET", "/api/prazos?de=2026-13-01", { cookie: socio.cookie })).status).toBe(400);
    expect((await chamar("GET", "/api/prazos?de=2026-11-10&ate=2026-11-01", { cookie: socio.cookie })).status).toBe(400);
  });

  it("exige sessão de escritório e o cabeçalho anti-CSRF", async () => {
    const { socio, t } = await cenario();
    expect((await chamar("GET", "/api/prazos")).status).toBe(401);
    expect((await chamar("GET", "/api/agenda?de=2026-11-01&ate=2026-11-30")).status).toBe(401);
    expect((await chamar("GET", "/api/inicio")).status).toBe(401);
    expect((await chamar("POST", "/api/prazos", { cookie: socio.cookie, corpo: prazo(socio.id), marca: null })).status).toBe(403);
    expect((await chamar("POST", "/api/prazos", { cookie: socio.cookie, corpo: prazo(socio.id), origem: "https://outro.test" })).status).toBe(403);
    expect((await chamar("POST", "/api/agenda", { cookie: socio.cookie, corpo: evento(), marca: null })).status).toBe(403);
    expect(t).toBeTruthy();
  });

  it("processo desativado não recebe prazo nem evento novo (409); o já existente continua editável", async () => {
    const { socio } = await cenario();
    const proc = await criarProcesso(socio.cookie);
    const existente = await criarPrazo(socio.cookie, socio.id, { processo_id: proc });
    const eventoExistente = await criarEvento(socio.cookie, { processo_id: proc });
    expect((await chamar("POST", `/api/processos/${proc}/situacao`, { cookie: socio.cookie, corpo: { ativo: false } })).status).toBe(200);
    expect((await chamar("POST", "/api/prazos", { cookie: socio.cookie, corpo: prazo(socio.id, { processo_id: proc }) })).status).toBe(409);
    expect((await chamar("POST", "/api/agenda", { cookie: socio.cookie, corpo: evento({ processo_id: proc }) })).status).toBe(409);
    // Trocar um prazo para um processo desativado também é recusado; manter o vínculo antigo não.
    const outro = await criarPrazo(socio.cookie, socio.id);
    expect((await chamar("PUT", `/api/prazos/${outro}`, { cookie: socio.cookie, corpo: prazo(socio.id, { processo_id: proc }) })).status).toBe(409);
    expect((await chamar("PUT", `/api/prazos/${existente}`, { cookie: socio.cookie, corpo: prazo(socio.id, { processo_id: proc, titulo: "Ajustado" }) })).status).toBe(200);
    expect((await chamar("PUT", `/api/agenda/${eventoExistente}`, { cookie: socio.cookie, corpo: evento({ processo_id: proc, titulo: "Ajustado" }) })).status).toBe(200);
  });

  it("responsável desativado não pode receber prazo (409)", async () => {
    const { socio, t } = await cenario();
    const inativo = await criarUsuario(t, "advogado");
    await env.DB.prepare("UPDATE users SET ativo = 0 WHERE id = ?").bind(inativo.id).run();
    expect((await chamar("POST", "/api/prazos", { cookie: socio.cookie, corpo: prazo(inativo.id) })).status).toBe(409);
  });
});

describe("prazos: isolamento entre escritórios", () => {
  it("não vincula processo, responsável nem cliente de outro escritório e não enxerga prazos dele", async () => {
    const a = await cenario();
    const b = await cenario();
    const procB = await criarProcesso(b.socio.cookie);
    const prazoB = await criarPrazo(b.socio.cookie, b.socio.id, { processo_id: procB });
    const eventoB = await criarEvento(b.socio.cookie);

    // A tenta usar processo e responsável do B.
    expect((await chamar("POST", "/api/prazos", { cookie: a.socio.cookie, corpo: prazo(a.socio.id, { processo_id: procB }) })).status).toBe(404);
    expect((await chamar("POST", "/api/prazos", { cookie: a.socio.cookie, corpo: prazo(b.socio.id) })).status).toBe(404);
    const proprio = await criarPrazo(a.socio.cookie, a.socio.id);
    expect((await chamar("PUT", `/api/prazos/${proprio}`, { cookie: a.socio.cookie, corpo: prazo(b.socio.id) })).status).toBe(404);
    expect((await chamar("PUT", `/api/prazos/${proprio}`, { cookie: a.socio.cookie, corpo: prazo(a.socio.id, { processo_id: procB }) })).status).toBe(404);

    // A não lê, edita, move nem apaga o prazo do B.
    expect((await chamar("GET", `/api/prazos/${prazoB}`, { cookie: a.socio.cookie })).status).toBe(404);
    expect((await chamar("PUT", `/api/prazos/${prazoB}`, { cookie: a.socio.cookie, corpo: prazo(a.socio.id) })).status).toBe(404);
    expect((await chamar("POST", `/api/prazos/${prazoB}/status`, { cookie: a.socio.cookie, corpo: { status: "concluido" } })).status).toBe(404);
    expect((await chamar("DELETE", `/api/prazos/${prazoB}`, { cookie: a.socio.cookie })).status).toBe(404);
    expect((await chamar("GET", `/api/processos/${procB}/prazos`, { cookie: a.socio.cookie })).status).toBe(404);
    expect((await chamar("GET", `/api/processos/${procB}/eventos`, { cookie: a.socio.cookie })).status).toBe(404);
    expect((await chamar("GET", `/api/agenda/${eventoB}`, { cookie: a.socio.cookie })).status).toBe(404);

    // Listas e resumos do A não trazem nada do B, mesmo filtrando pelo id do B.
    const lista = await chamar("GET", `/api/prazos?processo_id=${procB}&responsavel=${b.socio.id}`, { cookie: a.socio.cookie });
    expect(lista.json.prazos).toEqual([]);
    const todos = await chamar("GET", "/api/prazos?por_pagina=200", { cookie: a.socio.cookie });
    expect(todos.json.prazos.map((p: any) => p.id)).toEqual([proprio]);
    const resumo = await chamar("GET", `/api/prazos/resumo?responsavel=${b.socio.id}`, { cookie: a.socio.cookie });
    expect(resumo.json.resumo.por_status.a_fazer).toBe(0);
    const ag = await chamar("GET", "/api/agenda?de=2026-11-01&ate=2026-11-30", { cookie: a.socio.cookie });
    expect(ag.json.eventos).toEqual([]);

    // O prazo do B segue intacto.
    const intacto = await chamar("GET", `/api/prazos/${prazoB}`, { cookie: b.socio.cookie });
    expect(intacto.json.prazo).toMatchObject({ status: "a_fazer", titulo: "Contestação" });
  });

  it("o banco recusa vínculos entre escritórios mesmo sem passar pela API", async () => {
    const a = await cenario();
    const b = await cenario();
    const procB = await criarProcesso(b.socio.cookie);
    const ts = new Date().toISOString();
    const inserirPrazo = (tenant: string, proc: string | null, resp: string) =>
      env.DB.prepare("INSERT INTO prazos (id, tenant_id, titulo, data_fatal, processo_id, responsavel_id, status, criado_em, atualizado_em) VALUES (?, ?, 'x', '2026-11-10', ?, ?, 'a_fazer', ?, ?)")
        .bind(crypto.randomUUID(), tenant, proc, resp, ts, ts)
        .run();
    await expect(inserirPrazo(a.t, procB, a.socio.id)).rejects.toThrow();
    await expect(inserirPrazo(a.t, null, b.socio.id)).rejects.toThrow();
    await expect(inserirPrazo(a.t, null, a.socio.id)).resolves.toBeTruthy();
    // Status e conclusão têm de andar juntos.
    await expect(
      env.DB.prepare("INSERT INTO prazos (id, tenant_id, titulo, data_fatal, responsavel_id, status, criado_em, atualizado_em) VALUES ('p1', ?, 'x', '2026-11-10', ?, 'concluido', ?, ?)").bind(a.t, a.socio.id, ts, ts).run(),
    ).rejects.toThrow();
  });
});

describe("prazos: Kanban, filtros e resumo", () => {
  it("move entre os quatro status, grava e limpa a data de conclusão e audita", async () => {
    const { socio, advogado, t } = await cenario();
    const id = await criarPrazo(socio.cookie, socio.id);
    for (const status of ["em_andamento", "aguardando", "a_fazer"]) {
      const r = await chamar("POST", `/api/prazos/${id}/status`, { cookie: advogado.cookie, corpo: { status } });
      expect(r.status).toBe(200);
      expect(r.json.prazo).toMatchObject({ status, concluido_em: null });
    }
    const conc = await chamar("POST", `/api/prazos/${id}/status`, { cookie: advogado.cookie, corpo: { status: "concluido" } });
    expect(conc.json.prazo.status).toBe("concluido");
    expect(conc.json.prazo.situacao).toBe("concluido");
    expect(typeof conc.json.prazo.concluido_em).toBe("string");
    const primeiraConclusao = conc.json.prazo.concluido_em;
    // Repetir o mesmo status não muda nada.
    const repetido = await chamar("POST", `/api/prazos/${id}/status`, { cookie: advogado.cookie, corpo: { status: "concluido" } });
    expect(repetido.json.prazo.concluido_em).toBe(primeiraConclusao);
    const reaberto = await chamar("POST", `/api/prazos/${id}/status`, { cookie: advogado.cookie, corpo: { status: "em_andamento" } });
    expect(reaberto.json.prazo).toMatchObject({ status: "em_andamento", concluido_em: null });
    // Status inválido.
    for (const status of ["feito", "", null, 3, undefined]) {
      expect((await chamar("POST", `/api/prazos/${id}/status`, { cookie: advogado.cookie, corpo: { status } })).status, String(status)).toBe(400);
    }
    const log = await env.DB.prepare("SELECT acao, detalhes FROM audit_log WHERE tenant_id = ? AND entidade = 'prazos' AND acao = 'prazo_movido' ORDER BY criado_em, id").bind(t).all<{ detalhes: string }>();
    expect(log.results.length).toBe(5);
    expect(JSON.parse(log.results[0]!.detalhes)).toEqual({ de: "a_fazer", para: "em_andamento" });
  });

  it("filtra por status, responsável, processo e período e conta nos indicadores", async () => {
    const { socio, advogado } = await cenario();
    const proc = await criarProcesso(socio.cookie);
    const h = HOJE();
    const vencido = await criarPrazo(socio.cookie, socio.id, { data_fatal: somarDias(h, -3), titulo: "Vencido" });
    const hoje = await criarPrazo(socio.cookie, advogado.id, { data_fatal: h, titulo: "Hoje", processo_id: proc, hora: "09:00" });
    const prox = await criarPrazo(socio.cookie, advogado.id, { data_fatal: somarDias(h, 7), titulo: "Em sete dias" });
    const longe = await criarPrazo(socio.cookie, socio.id, { data_fatal: somarDias(h, 8), titulo: "Em oito dias" });
    await chamar("POST", `/api/prazos/${prox}/status`, { cookie: socio.cookie, corpo: { status: "aguardando" } });
    const feito = await criarPrazo(socio.cookie, socio.id, { data_fatal: somarDias(h, -10), titulo: "Feito" });
    await chamar("POST", `/api/prazos/${feito}/status`, { cookie: socio.cookie, corpo: { status: "concluido" } });

    const ids = async (q: string) => (await chamar("GET", `/api/prazos?${q}`, { cookie: socio.cookie })).json.prazos.map((p: any) => p.id);
    expect(await ids("")).toEqual([feito, vencido, hoje, prox, longe]);
    expect(await ids("status=aguardando")).toEqual([prox]);
    expect(await ids("abertos=1")).toEqual([vencido, hoje, prox, longe]);
    expect(await ids(`responsavel=${advogado.id}`)).toEqual([hoje, prox]);
    expect(await ids(`processo_id=${proc}`)).toEqual([hoje]);
    expect(await ids(`de=${h}&ate=${somarDias(h, 7)}`)).toEqual([hoje, prox]);
    expect(await ids(`ate=${somarDias(h, -1)}&abertos=1`)).toEqual([vencido]);
    expect(await ids("concluidos_dias=30")).toEqual([feito, vencido, hoje, prox, longe]);
    const vazia = await chamar("GET", `/api/prazos?por_pagina=2&pagina=2`, { cookie: socio.cookie });
    expect(vazia.json).toMatchObject({ total: 5, pagina: 2, por_pagina: 2 });
    expect(vazia.json.prazos).toHaveLength(2);

    const r = await chamar("GET", "/api/prazos/resumo", { cookie: socio.cookie });
    expect(r.json.resumo).toMatchObject({ hoje: h, vencidos: 1, vencem_hoje: 1, proximos_7_dias: 1, por_status: { a_fazer: 3, em_andamento: 0, aguardando: 1, concluido: 1 } });
    const meu = await chamar("GET", `/api/prazos/resumo?responsavel=${advogado.id}`, { cookie: socio.cookie });
    expect(meu.json.resumo).toMatchObject({ vencidos: 0, vencem_hoje: 1, proximos_7_dias: 1 });
    expect(longe).toBeTruthy();
  });

  it("só o sócio apaga prazo, e isso fica na auditoria sem dados pessoais", async () => {
    const { socio, advogado, t } = await cenario();
    const id = await criarPrazo(advogado.cookie, advogado.id, { titulo: "Prazo do cliente Fulano de Tal", descricao: "CPF 123" });
    expect((await chamar("DELETE", `/api/prazos/${id}`, { cookie: advogado.cookie })).status).toBe(403);
    expect((await chamar("GET", `/api/prazos/${id}`, { cookie: advogado.cookie })).status).toBe(200);
    expect((await chamar("DELETE", `/api/prazos/${id}`, { cookie: socio.cookie })).status).toBe(200);
    expect((await chamar("GET", `/api/prazos/${id}`, { cookie: socio.cookie })).status).toBe(404);
    expect((await chamar("DELETE", `/api/prazos/${id}`, { cookie: socio.cookie })).status).toBe(404);
    const log = await env.DB.prepare("SELECT acao, detalhes, user_id FROM audit_log WHERE tenant_id = ? AND entidade = 'prazos' ORDER BY criado_em, id").bind(t).all<{ acao: string; detalhes: string | null; user_id: string }>();
    expect(log.results.map((l) => l.acao)).toEqual(["prazo_criado", "prazo_excluido"]);
    expect(log.results[1]!.user_id).toBe(socio.id);
    for (const l of log.results) {
      expect(l.detalhes ?? "").not.toContain("Fulano");
      expect(l.detalhes ?? "").not.toContain("CPF");
    }
  });
});

describe("agenda: cadastro e validação", () => {
  it("cria o evento guardando o instante em UTC e o fuso IANA, com participantes", async () => {
    const { socio, advogado } = await cenario();
    const proc = await criarProcesso(socio.cookie);
    const cli = await chamar("POST", "/api/clientes", { cookie: socio.cookie, corpo: { tipo: "pf", nome: "Maria da Silva" } });
    const r = await chamar("POST", "/api/agenda", {
      cookie: advogado.cookie,
      corpo: evento({ local: "Fórum Central, sala 4", descricao: "Levar documentos", processo_id: proc, cliente_id: cli.json.cliente.id, participantes: [socio.id, advogado.id, socio.id], fuso: "America/Manaus" }),
    });
    expect(r.status, JSON.stringify(r.json)).toBe(201);
    expect(r.json.evento).toMatchObject({
      tipo: "audiencia",
      inicio: "2026-11-10T17:00:00.000Z",
      fim: "2026-11-10T18:00:00.000Z",
      fuso: "America/Manaus",
      dia_inteiro: false,
      local: "Fórum Central, sala 4",
      processo_numero: "00000017820208260100",
      cliente_nome: "Maria da Silva",
      criado_por: advogado.id,
      pode_alterar: true,
    });
    expect(r.json.evento.participantes.map((p: any) => p.user_id).sort()).toEqual([socio.id, advogado.id].sort());
    const padrao = await chamar("POST", "/api/agenda", { cookie: socio.cookie, corpo: evento({ dia_inteiro: true }) });
    expect(padrao.json.evento).toMatchObject({ fuso: "America/Sao_Paulo", dia_inteiro: true });
    // Reservados para o Google Agenda: nada é aceito do navegador.
    const colunas = await env.DB.prepare("SELECT id_externo, origem_externa FROM eventos_agenda WHERE id = ?").bind(padrao.json.evento.id).first<{ id_externo: string | null; origem_externa: string | null }>();
    expect(colunas).toEqual({ id_externo: null, origem_externa: null });
  });

  it("valida datas, fuso, tipo e tamanhos", async () => {
    const { socio } = await cenario();
    const ruins: object[] = [
      evento({ titulo: "" }),
      evento({ tipo: "festa" }),
      evento({ tipo: undefined }),
      evento({ inicio: "2026-11-10T14:00:00" }),
      evento({ inicio: "2026-11-10" }),
      evento({ inicio: "amanhã" }),
      evento({ fim: "2026-11-10T13:59:59-03:00" }),
      evento({ fim: undefined }),
      evento({ inicio: "2026-02-30T10:00:00-03:00" }),
      evento({ fuso: "Marte/Phobos" }),
      evento({ fuso: "UTC" }),
      evento({ fuso: "" }),
      evento({ dia_inteiro: "sim" }),
      evento({ local: "x".repeat(201) }),
      evento({ descricao: "x".repeat(2001) }),
      evento({ participantes: "todos" }),
      evento({ participantes: [1] }),
    ];
    for (const corpo of ruins) {
      const r = await chamar("POST", "/api/agenda", { cookie: socio.cookie, corpo });
      expect(r.status, JSON.stringify(corpo)).toBe(400);
    }
    // Fim igual ao início é aceito.
    const igual = await chamar("POST", "/api/agenda", { cookie: socio.cookie, corpo: evento({ fim: "2026-11-10T14:00:00-03:00" }) });
    expect(igual.status).toBe(201);
  });

  it("não vincula processo, cliente nem participante de outro escritório ou desativado", async () => {
    const a = await cenario();
    const b = await cenario();
    const procB = await criarProcesso(b.socio.cookie);
    const cliB = (await chamar("POST", "/api/clientes", { cookie: b.socio.cookie, corpo: { tipo: "pf", nome: "Cliente B" } })).json.cliente.id as string;
    expect((await chamar("POST", "/api/agenda", { cookie: a.socio.cookie, corpo: evento({ processo_id: procB }) })).status).toBe(404);
    expect((await chamar("POST", "/api/agenda", { cookie: a.socio.cookie, corpo: evento({ cliente_id: cliB }) })).status).toBe(404);
    expect((await chamar("POST", "/api/agenda", { cookie: a.socio.cookie, corpo: evento({ participantes: [a.socio.id, b.socio.id] }) })).status).toBe(404);

    const proprio = await criarEvento(a.socio.cookie);
    expect((await chamar("PUT", `/api/agenda/${proprio}`, { cookie: a.socio.cookie, corpo: evento({ processo_id: procB }) })).status).toBe(404);
    expect((await chamar("PUT", `/api/agenda/${proprio}`, { cookie: a.socio.cookie, corpo: evento({ cliente_id: cliB }) })).status).toBe(404);
    expect((await chamar("PUT", `/api/agenda/${proprio}`, { cookie: a.socio.cookie, corpo: evento({ participantes: [b.socio.id] }) })).status).toBe(404);
    // Nada foi gravado pela metade.
    const lido = await chamar("GET", `/api/agenda/${proprio}`, { cookie: a.socio.cookie });
    expect(lido.json.evento).toMatchObject({ processo_id: null, cliente_id: null, participantes: [] });

    // Cliente e participante desativados (do mesmo escritório) também são recusados.
    const cliInativo = (await chamar("POST", "/api/clientes", { cookie: a.socio.cookie, corpo: { tipo: "pf", nome: "Cliente Inativo" } })).json.cliente.id as string;
    await env.DB.prepare("UPDATE clientes SET ativo = 0 WHERE id = ?").bind(cliInativo).run();
    expect((await chamar("POST", "/api/agenda", { cookie: a.socio.cookie, corpo: evento({ cliente_id: cliInativo }) })).status).toBe(409);
    const userInativo = await criarUsuario(a.t, "advogado");
    await env.DB.prepare("UPDATE users SET ativo = 0 WHERE id = ?").bind(userInativo.id).run();
    expect((await chamar("POST", "/api/agenda", { cookie: a.socio.cookie, corpo: evento({ participantes: [userInativo.id] }) })).status).toBe(409);
  });

  it("o banco recusa participante de outro escritório e fim antes do início", async () => {
    const a = await cenario();
    const b = await cenario();
    const id = await criarEvento(a.socio.cookie);
    const ts = new Date().toISOString();
    await expect(env.DB.prepare("INSERT INTO eventos_participantes (id, tenant_id, evento_id, user_id, criado_em) VALUES ('pp1', ?, ?, ?, ?)").bind(a.t, id, b.socio.id, ts).run()).rejects.toThrow();
    await expect(env.DB.prepare("INSERT INTO eventos_participantes (id, tenant_id, evento_id, user_id, criado_em) VALUES ('pp2', ?, ?, ?, ?)").bind(b.t, id, b.socio.id, ts).run()).rejects.toThrow();
    await expect(
      env.DB.prepare("INSERT INTO eventos_agenda (id, tenant_id, titulo, tipo, inicio, fim, criado_em, atualizado_em) VALUES ('e9', ?, 'x', 'outro', '2026-11-10T10:00:00.000Z', '2026-11-10T09:00:00.000Z', ?, ?)").bind(a.t, ts, ts).run(),
    ).rejects.toThrow();
  });
});

describe("agenda: permissões", () => {
  it("todos veem todos os eventos; só o criador ou o sócio altera e apaga", async () => {
    const { socio, advogado, advogado2 } = await cenario();
    const id = await criarEvento(advogado.cookie, { participantes: [advogado.id] });

    // Todos veem, com a indicação de quem pode alterar.
    const vista = await chamar("GET", `/api/agenda?de=2026-11-01&ate=2026-11-30`, { cookie: advogado2.cookie });
    expect(vista.json.eventos).toHaveLength(1);
    expect(vista.json.eventos[0]).toMatchObject({ id, pode_alterar: false });
    expect((await chamar("GET", "/api/agenda?de=2026-11-01&ate=2026-11-30", { cookie: advogado.cookie })).json.eventos[0].pode_alterar).toBe(true);
    expect((await chamar("GET", "/api/agenda?de=2026-11-01&ate=2026-11-30", { cookie: socio.cookie })).json.eventos[0].pode_alterar).toBe(true);
    expect((await chamar("GET", `/api/agenda/${id}`, { cookie: advogado2.cookie })).status).toBe(200);

    // Outro advogado não altera nem apaga.
    expect((await chamar("PUT", `/api/agenda/${id}`, { cookie: advogado2.cookie, corpo: evento({ titulo: "Invadido" }) })).status).toBe(403);
    expect((await chamar("DELETE", `/api/agenda/${id}`, { cookie: advogado2.cookie })).status).toBe(403);
    expect((await chamar("GET", `/api/agenda/${id}`, { cookie: socio.cookie })).json.evento.titulo).toBe("Audiência de instrução");

    // O criador e o sócio alteram.
    expect((await chamar("PUT", `/api/agenda/${id}`, { cookie: advogado.cookie, corpo: evento({ titulo: "Pelo criador" }) })).json.evento.titulo).toBe("Pelo criador");
    expect((await chamar("PUT", `/api/agenda/${id}`, { cookie: socio.cookie, corpo: evento({ titulo: "Pelo sócio" }) })).json.evento.titulo).toBe("Pelo sócio");

    // Evento do sócio: o advogado não mexe.
    const doSocio = await criarEvento(socio.cookie);
    expect((await chamar("DELETE", `/api/agenda/${doSocio}`, { cookie: advogado.cookie })).status).toBe(403);
    // Criador apaga o próprio; sócio apaga o dos outros.
    const doAdv2 = await criarEvento(advogado2.cookie);
    expect((await chamar("DELETE", `/api/agenda/${doAdv2}`, { cookie: advogado2.cookie })).status).toBe(200);
    expect((await chamar("DELETE", `/api/agenda/${id}`, { cookie: socio.cookie })).status).toBe(200);
    expect((await chamar("GET", `/api/agenda/${id}`, { cookie: socio.cookie })).status).toBe(404);
    const resto = await env.DB.prepare("SELECT COUNT(*) AS n FROM eventos_participantes WHERE evento_id = ?").bind(id).first<{ n: number }>();
    expect(resto!.n).toBe(0);
  });

  it("troca a lista de participantes na edição e audita sem dados pessoais", async () => {
    const { socio, advogado, t } = await cenario();
    const id = await criarEvento(socio.cookie, { participantes: [socio.id], titulo: "Reunião com Maria da Silva", local: "Rua das Flores, 10" });
    const r = await chamar("PUT", `/api/agenda/${id}`, { cookie: socio.cookie, corpo: evento({ participantes: [advogado.id] }) });
    expect(r.json.evento.participantes.map((p: any) => p.user_id)).toEqual([advogado.id]);
    const log = await env.DB.prepare("SELECT acao, detalhes FROM audit_log WHERE tenant_id = ? AND entidade = 'eventos_agenda' ORDER BY criado_em, id").bind(t).all<{ acao: string; detalhes: string }>();
    expect(log.results.map((l) => l.acao)).toEqual(["evento_criado", "evento_alterado"]);
    for (const l of log.results) {
      expect(l.detalhes).not.toContain("Maria");
      expect(l.detalhes).not.toContain("Flores");
    }
  });
});

describe("agenda: consulta por intervalo", () => {
  it("limita a consulta a 62 dias e exige de/ate válidos", async () => {
    const { socio } = await cenario();
    const q = (de: string, ate: string) => chamar("GET", `/api/agenda?de=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}`, { cookie: socio.cookie });
    // 62 dias corridos (de 1º/11 a 2/01) passam; 63 não.
    expect((await q("2026-11-01", "2027-01-01")).status).toBe(200);
    expect((await q("2026-11-01", "2027-01-02")).status).toBe(400);
    expect((await q("2026-11-01", "2026-11-01")).status).toBe(200);
    // Em instantes: exatamente 62 dias passa; 1 segundo a mais não.
    expect((await q("2026-11-01T00:00:00-03:00", "2027-01-02T00:00:00-03:00")).status).toBe(200);
    expect((await q("2026-11-01T00:00:00-03:00", "2027-01-02T00:00:01-03:00")).status).toBe(400);
    expect((await q("2026-11-10", "2026-11-01")).status).toBe(400);
    expect((await q("2026-13-01", "2026-12-01")).status).toBe(400);
    expect((await q("ontem", "hoje")).status).toBe(400);
    expect((await chamar("GET", "/api/agenda", { cookie: socio.cookie })).status).toBe(400);
    expect((await chamar("GET", "/api/agenda?de=2026-11-01", { cookie: socio.cookie })).status).toBe(400);
    expect((await q("2026-11-01T00:00:00", "2026-11-30T00:00:00")).status).toBe(400);
  });

  it("devolve os eventos que tocam o intervalo, no dia local de São Paulo", async () => {
    const { socio } = await cenario();
    // 22:00 de 10/11 em SP = 01:00 UTC de 11/11: pertence ao dia 10 para o escritório.
    const noite = await criarEvento(socio.cookie, { titulo: "Noite", inicio: "2026-11-10T22:00:00-03:00", fim: "2026-11-10T23:00:00-03:00" });
    const manha11 = await criarEvento(socio.cookie, { titulo: "Manhã 11", inicio: "2026-11-11T09:00:00-03:00", fim: "2026-11-11T10:00:00-03:00" });
    const virada = await criarEvento(socio.cookie, { titulo: "Atravessa", inicio: "2026-11-09T23:00:00-03:00", fim: "2026-11-10T01:00:00-03:00" });
    const longo = await criarEvento(socio.cookie, { titulo: "Dia inteiro", dia_inteiro: true, inicio: "2026-11-05T00:00:00-03:00", fim: "2026-11-12T23:59:59-03:00" });
    const ids = async (de: string, ate: string) => (await chamar("GET", `/api/agenda?de=${de}&ate=${ate}`, { cookie: socio.cookie })).json.eventos.map((e: any) => e.id);
    expect(await ids("2026-11-10", "2026-11-10")).toEqual([longo, virada, noite]);
    expect(await ids("2026-11-11", "2026-11-11")).toEqual([longo, manha11]);
    expect(await ids("2026-11-13", "2026-11-20")).toEqual([]);
    expect(await ids("2026-11-01", "2026-11-04")).toEqual([]);
    expect(await ids("2026-11-09", "2026-11-09")).toEqual([longo, virada]);
    // Filtro por processo e cliente.
    const proc = await criarProcesso(socio.cookie);
    const comProc = await criarEvento(socio.cookie, { processo_id: proc });
    const so = await chamar("GET", `/api/agenda?de=2026-11-01&ate=2026-11-30&processo_id=${proc}`, { cookie: socio.cookie });
    expect(so.json.eventos.map((e: any) => e.id)).toEqual([comProc]);
    const porProcesso = await chamar("GET", `/api/processos/${proc}/eventos`, { cookie: socio.cookie });
    expect(porProcesso.json.eventos.map((e: any) => e.id)).toEqual([comProc]);
  });
});

describe("início", () => {
  it("resume prazos, compromissos, processos por fase e clientes do próprio escritório", async () => {
    const a = await cenario();
    const b = await cenario();
    const h = HOJE();
    await criarProcesso(a.socio.cookie);
    await criarProcesso(a.socio.cookie, "0001234-48.2021.5.02.0471");
    await chamar("POST", "/api/clientes", { cookie: a.socio.cookie, corpo: { tipo: "pf", nome: "Cliente A" } });
    await criarPrazo(a.socio.cookie, a.socio.id, { data_fatal: somarDias(h, -2), titulo: "Vencido" });
    await criarPrazo(a.socio.cookie, a.socio.id, { data_fatal: h, titulo: "Hoje" });
    await criarPrazo(a.socio.cookie, a.socio.id, { data_fatal: somarDias(h, 2), titulo: "Em dois dias" });
    await criarPrazo(a.socio.cookie, a.socio.id, { data_fatal: somarDias(h, 20), titulo: "Longe" });
    const concluido = await criarPrazo(a.socio.cookie, a.socio.id, { data_fatal: h, titulo: "Já feito" });
    await chamar("POST", `/api/prazos/${concluido}/status`, { cookie: a.socio.cookie, corpo: { status: "concluido" } });
    const futuro = new Date(Date.now() + 2 * 86400000);
    await criarEvento(a.socio.cookie, { titulo: "Próximo", inicio: futuro.toISOString(), fim: new Date(futuro.getTime() + 3600000).toISOString() });
    await criarEvento(a.socio.cookie, { titulo: "Já passou", inicio: "2020-01-01T10:00:00Z", fim: "2020-01-01T11:00:00Z" });
    // Dados do B não aparecem no A.
    await criarProcesso(b.socio.cookie);
    await criarPrazo(b.socio.cookie, b.socio.id, { data_fatal: h });

    const r = await chamar("GET", "/api/inicio", { cookie: a.advogado.cookie });
    expect(r.status).toBe(200);
    expect(r.json.hoje).toBe(h);
    expect(r.json.prazos).toMatchObject({ vencidos: 1, vencem_hoje: 1, proximos_7_dias: 1 });
    expect(r.json.prazos.lista_vencidos.map((p: any) => p.titulo)).toEqual(["Vencido"]);
    expect(r.json.prazos.lista_hoje.map((p: any) => p.titulo)).toEqual(["Hoje"]);
    expect(r.json.prazos.lista_proximos.map((p: any) => p.titulo)).toEqual(["Em dois dias"]);
    expect(r.json.eventos.map((e: any) => e.titulo)).toEqual(["Próximo"]);
    expect(r.json.processos).toMatchObject({ ativos: 2 });
    expect(r.json.processos.por_fase.Conhecimento).toBe(2);
    expect(r.json.clientes).toEqual({ ativos: 1 });
  });

  it("o dono da plataforma não usa as rotas do escritório", async () => {
    const { sessaoDeDono } = await import("./ajuda");
    const dono = await sessaoDeDono();
    for (const caminho of ["/api/inicio", "/api/prazos", "/api/agenda?de=2026-11-01&ate=2026-11-02"]) {
      expect((await chamar("GET", caminho, { cookie: dono.cookie })).status, caminho).toBe(403);
    }
    expect(entrar).toBeTruthy();
  });
});

describe("prazos do processo", () => {
  it("lista só os prazos do processo", async () => {
    const { socio } = await cenario();
    const p1 = await criarProcesso(socio.cookie);
    const p2 = await criarProcesso(socio.cookie, "0001234-48.2021.5.02.0471");
    const a = await criarPrazo(socio.cookie, socio.id, { processo_id: p1 });
    await criarPrazo(socio.cookie, socio.id, { processo_id: p2 });
    await criarPrazo(socio.cookie, socio.id);
    const r = await chamar("GET", `/api/processos/${p1}/prazos`, { cookie: socio.cookie });
    expect(r.json.prazos.map((p: any) => p.id)).toEqual([a]);
    expect(r.json.total).toBe(1);
  });
});
