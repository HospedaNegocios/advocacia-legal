import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import { criarRepositorio } from "../src/server/db/repositorio";
import type { NovaIntimacao } from "../src/server/db/repositorio";
import { definirDepsDjenParaTeste } from "../src/server/djen/ambiente";
import { normalizarItem } from "../src/server/djen/formato";
import { prepararBanco } from "./aplicar-migracoes";
import { chamar, criarEscritorio, sessaoDeUsuario } from "./ajuda";
import { clienteSimulado, criarOab, item, ok, relogioFalso } from "./djen-ajuda";

prepararBanco();
afterEach(() => definirDepsDjenParaTeste(null));

const nova = (id: number, extra: Record<string, unknown> = {}): NovaIntimacao => normalizarItem(item(id, extra))!;

async function cenario(plano: "solo" | "escritorio" | "banca" = "escritorio") {
  const t = await criarEscritorio(plano);
  const oab = await criarOab(t);
  const repo = criarRepositorio(env.DB, t);
  return { t, oab, repo, socio: await sessaoDeUsuario(t, "socio") };
}

async function idDe(repo: ReturnType<typeof criarRepositorio>, busca: string) {
  return (await repo.intimacoes.pesquisar({ busca })).itens[0]!.id;
}

describe("leitura e marcação: todos os perfis", () => {
  for (const perfil of ["advogado", "estagiario", "secretaria"] as const) {
    it(`${perfil} lista, abre, marca como lida, desmarca e marca em lote`, async () => {
      const { t, oab, repo } = await cenario();
      await repo.intimacoes.inserirDaColeta(oab.id, [nova(1), nova(2), nova(3)]);
      const u = await sessaoDeUsuario(t, perfil);
      const lista = await chamar("GET", "/api/intimacoes", { cookie: u.cookie });
      expect(lista.status).toBe(200);
      expect(lista.json.total).toBe(3);
      const id = lista.json.intimacoes[0].id;
      expect(lista.json.intimacoes[0].texto).toBeUndefined();
      expect(lista.json.intimacoes[0].previa).toContain("XXXX");
      const um = await chamar("GET", `/api/intimacoes/${id}`, { cookie: u.cookie });
      expect(um.json.intimacao.texto).toContain("Texto XXXX");
      expect((await chamar("POST", `/api/intimacoes/${id}/lida`, { cookie: u.cookie })).json.intimacao).toMatchObject({ lida: true, lida_por: u.id });
      expect((await chamar("GET", "/api/intimacoes", { cookie: u.cookie })).json.total).toBe(2);
      expect((await chamar("POST", `/api/intimacoes/${id}/nao-lida`, { cookie: u.cookie })).json.intimacao.lida).toBe(false);
      const ids = lista.json.intimacoes.map((i: any) => i.id);
      const lote = await chamar("POST", "/api/intimacoes/lidas", { cookie: u.cookie, corpo: { ids } });
      expect(lote.json.marcadas).toBe(3);
      expect((await chamar("GET", "/api/intimacoes?situacao=lidas", { cookie: u.cookie })).json.total).toBe(3);
    });
  }

  it("ninguém apaga intimação", async () => {
    const { oab, repo, socio } = await cenario();
    await repo.intimacoes.inserirDaColeta(oab.id, [nova(1)]);
    const id = await idDe(repo, "XXXX");
    const r = await chamar("DELETE", `/api/intimacoes/${id}`, { cookie: socio.cookie });
    expect(r.status).toBe(404);
    expect((await chamar("GET", `/api/intimacoes/${id}`, { cookie: socio.cookie })).status).toBe(200);
  });

  it("exige login", async () => {
    expect((await chamar("GET", "/api/intimacoes")).status).toBe(401);
  });
});

describe("filtros e resumo", () => {
  it("filtra por situação, tribunal, vínculo, OAB, período e busca (número e texto)", async () => {
    const { t, oab, repo, socio } = await cenario();
    const outra = await criarOab(t, { uf: "RJ" });
    await repo.intimacoes.inserirDaColeta(oab.id, [
      nova(1, { siglaTribunal: "TJSP", data_disponibilizacao: "2026-10-27" }),
      nova(2, { siglaTribunal: "TJRJ", data_disponibilizacao: "2026-10-20", numero_processo: "9999999-99.2022.8.19.0001", numeroprocessocommascara: undefined, texto: "Citação de ZEBRA" }),
    ]);
    await repo.intimacoes.inserirDaColeta(outra.id, [nova(3, { data_disponibilizacao: "2026-10-26" })]);
    const g = (q: string) => chamar("GET", `/api/intimacoes?situacao=todas&${q}`, { cookie: socio.cookie });
    expect((await g("tribunal=TJRJ")).json.total).toBe(1);
    expect((await g("oab_id=" + outra.id)).json.total).toBe(1);
    expect((await g("vinculo=sem")).json.total).toBe(3);
    expect((await g("vinculo=com")).json.total).toBe(0);
    expect((await g("de=2026-10-26&ate=2026-10-27")).json.total).toBe(2);
    expect((await g("busca=zebra")).json.total).toBe(1);
    expect((await g("busca=" + encodeURIComponent("9999999-99.2022.8.19.0001"))).json.total).toBe(1);
    expect((await g("busca=100%25")).json.total).toBe(0);
    expect((await g("de=2026-13-45")).status).toBe(400);
    expect((await g("vinculo=talvez")).status).toBe(400);
    await chamar("POST", `/api/intimacoes/${await idDe(repo, "ZEBRA")}/lida`, { cookie: socio.cookie });
    expect((await chamar("GET", "/api/intimacoes", { cookie: socio.cookie })).json.total).toBe(2);
  });

  it("resumo e Início trazem as contagens", async () => {
    const { oab, repo, socio } = await cenario();
    const hoje = (await chamar("GET", "/api/intimacoes/resumo", { cookie: socio.cookie })).json.hoje as string;
    await repo.intimacoes.inserirDaColeta(oab.id, [nova(1, { data_disponibilizacao: hoje }), nova(2, { data_disponibilizacao: "2000-01-01" })]);
    const r = await chamar("GET", "/api/intimacoes/resumo", { cookie: socio.cookie });
    expect(r.json.resumo).toEqual({ total: 2, nao_lidas: 2, hoje: 1, ultimos_7_dias: 1, sem_processo: 2 });
    expect(r.json.tribunais).toEqual(["TJSP"]);
    expect(r.json.oabs[0].id).toBe(oab.id);
    expect((await chamar("GET", "/api/inicio", { cookie: socio.cookie })).json.intimacoes).toEqual({ nao_lidas: 2, sem_processo: 2 });
  });
});

describe("vínculo manual", () => {
  it("vincula a um processo ativo do escritório; recusa se já vinculada, inativo ou de outro escritório", async () => {
    const { t, oab, repo, socio } = await cenario();
    const proc = await chamar("POST", "/api/processos", { cookie: socio.cookie, corpo: { numero_cnj: "0000001-78.2020.8.26.0100", fase: "Conhecimento" } });
    const outroProc = await chamar("POST", "/api/processos", { cookie: socio.cookie, corpo: { numero_cnj: "1234567-53.2023.8.26.0001", fase: "Conhecimento" } });
    await repo.intimacoes.inserirDaColeta(oab.id, [nova(1, { numero_processo: "ABC", numeroprocessocommascara: undefined }), nova(2)]);
    const orfa = await idDe(repo, "publicação 1");
    const jaLigada = await idDe(repo, "publicação 2");
    expect(jaLigada).toBeTruthy();
    const ok1 = await chamar("POST", `/api/intimacoes/${orfa}/processo`, { cookie: socio.cookie, corpo: { processo_id: proc.json.processo.id } });
    expect(ok1.status).toBe(200);
    expect(ok1.json.intimacao).toMatchObject({ vinculo: "manual", processo_id: proc.json.processo.id, processo_cnj: "00000017820208260100" });
    expect((await chamar("POST", `/api/intimacoes/${orfa}/processo`, { cookie: socio.cookie, corpo: { processo_id: outroProc.json.processo.id } })).status).toBe(409);
    expect((await chamar("POST", `/api/intimacoes/${jaLigada}/processo`, { cookie: socio.cookie, corpo: { processo_id: outroProc.json.processo.id } })).status).toBe(409);
    expect((await chamar("GET", `/api/intimacoes?processo_id=${proc.json.processo.id}&situacao=todas`, { cookie: socio.cookie })).json.total).toBe(2);

    await repo.intimacoes.inserirDaColeta(oab.id, [nova(5, { numero_processo: "XYZ", numeroprocessocommascara: undefined })]);
    const id5 = await idDe(repo, "publicação 5");
    await chamar("POST", `/api/processos/${outroProc.json.processo.id}/situacao`, { cookie: socio.cookie, corpo: { ativo: false } });
    expect((await chamar("POST", `/api/intimacoes/${id5}/processo`, { cookie: socio.cookie, corpo: { processo_id: outroProc.json.processo.id } })).status).toBe(409);
    expect((await chamar("POST", `/api/intimacoes/${id5}/processo`, { cookie: socio.cookie, corpo: {} })).status).toBe(400);

    const b = await sessaoDeUsuario(await criarEscritorio("solo"), "socio");
    const procB = await chamar("POST", "/api/processos", { cookie: b.cookie, corpo: { numero_cnj: "0700001-15.2024.4.03.6100", fase: "Conhecimento" } });
    expect((await chamar("POST", `/api/intimacoes/${id5}/processo`, { cookie: socio.cookie, corpo: { processo_id: procB.json.processo.id } })).status).toBe(404);
    void t;
  });
});

describe("isolamento entre escritórios", () => {
  it("o escritório B não vê, não abre, não marca e não vincula intimações do A", async () => {
    const a = await cenario();
    await a.repo.intimacoes.inserirDaColeta(a.oab.id, [nova(1, { texto: "SEGREDO-DO-A" })]);
    const idA = await idDe(a.repo, "SEGREDO-DO-A");
    const bT = await criarEscritorio("escritorio");
    const b = await sessaoDeUsuario(bT, "socio");
    const procB = await chamar("POST", "/api/processos", { cookie: b.cookie, corpo: { numero_cnj: "0700001-15.2024.4.03.6100", fase: "Conhecimento" } });
    expect((await chamar("GET", "/api/intimacoes?situacao=todas", { cookie: b.cookie })).json.total).toBe(0);
    expect((await chamar("GET", `/api/intimacoes/${idA}`, { cookie: b.cookie })).status).toBe(404);
    expect((await chamar("POST", `/api/intimacoes/${idA}/lida`, { cookie: b.cookie })).status).toBe(404);
    expect((await chamar("POST", `/api/intimacoes/${idA}/nao-lida`, { cookie: b.cookie })).status).toBe(404);
    expect((await chamar("POST", `/api/intimacoes/${idA}/processo`, { cookie: b.cookie, corpo: { processo_id: procB.json.processo.id } })).status).toBe(404);
    expect((await chamar("POST", "/api/intimacoes/lidas", { cookie: b.cookie, corpo: { ids: [idA] } })).json.marcadas).toBe(0);
    expect((await chamar("GET", `/api/intimacoes?oab_id=${a.oab.id}&situacao=todas`, { cookie: b.cookie })).json.total).toBe(0);
    expect((await chamar("GET", "/api/intimacoes/resumo", { cookie: b.cookie })).json.resumo.total).toBe(0);
    expect((await chamar("GET", "/api/intimacoes?situacao=nao_lidas", { cookie: a.socio.cookie })).json.total).toBe(1);
  });
});

describe("Buscar agora", () => {
  it("só o sócio, uma vez a cada 10 minutos, e usa a mesma coleta do Cron", async () => {
    const { t, oab, repo, socio } = await cenario();
    const relogio = relogioFalso();
    const cliente = clienteSimulado(relogio, () => ok([item(1), item(2)]));
    definirDepsDjenParaTeste({ cliente, relogio });
    const adv = await sessaoDeUsuario(t, "advogado");
    expect((await chamar("POST", "/api/intimacoes/buscar", { cookie: adv.cookie })).status).toBe(403);
    expect(cliente.chamadas).toHaveLength(0);

    const r = await chamar("POST", "/api/intimacoes/buscar", { cookie: socio.cookie });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json.resultado).toMatchObject({ oabs: 1, sucesso: 1, novas: 2, bloqueado: false });
    expect(cliente.chamadas).toHaveLength(1);
    expect(cliente.chamadas[0]!.p.numeroOab).toBe(oab.numero);
    expect((await repo.intimacoes.pesquisar({})).total).toBe(2);

    const de_novo = await chamar("POST", "/api/intimacoes/buscar", { cookie: socio.cookie });
    expect(de_novo.status).toBe(429);
    expect(cliente.chamadas).toHaveLength(1);

    const resumo = await chamar("GET", "/api/intimacoes/resumo", { cookie: adv.cookie });
    expect(resumo.json.busca.ultima).toMatchObject({ resultado: "sucesso", origem: "manual" });
    expect(resumo.json.busca.ultima_sucesso_em).toBeTruthy();
  });

  it("sem OAB ativa: avisa e não consome o limite; bloqueio é informado", async () => {
    const t = await criarEscritorio("escritorio");
    const socio = await sessaoDeUsuario(t, "socio");
    const sem = await chamar("POST", "/api/intimacoes/buscar", { cookie: socio.cookie });
    expect(sem.status).toBe(409);
    await criarOab(t);
    const relogio = relogioFalso();
    definirDepsDjenParaTeste({ cliente: clienteSimulado(relogio, () => ({ tipo: "bloqueado", status: 403, motivo: "recusado" })), relogio });
    const r = await chamar("POST", "/api/intimacoes/buscar", { cookie: socio.cookie });
    expect(r.status).toBe(200);
    expect(r.json.resultado).toMatchObject({ bloqueado: true, novas: 0 });
  });

  it("outro escritório tem o próprio limite de 10 minutos", async () => {
    const a = await cenario();
    const b = await cenario();
    const relogio = relogioFalso();
    definirDepsDjenParaTeste({ cliente: clienteSimulado(relogio, () => ok([])), relogio });
    expect((await chamar("POST", "/api/intimacoes/buscar", { cookie: a.socio.cookie })).status).toBe(200);
    expect((await chamar("POST", "/api/intimacoes/buscar", { cookie: b.socio.cookie })).status).toBe(200);
  });
});

describe("auditoria", () => {
  it("registra a leitura em lote e a busca sem nenhum texto de publicação", async () => {
    const { t, oab, repo, socio } = await cenario();
    await repo.intimacoes.inserirDaColeta(oab.id, [nova(1, { texto: "CONTEUDO-SIGILOSO-123" }), nova(2, { texto: "CONTEUDO-SIGILOSO-123 b" })]);
    const ids = (await repo.intimacoes.pesquisar({})).itens.map((i) => i.id);
    await chamar("POST", "/api/intimacoes/lidas", { cookie: socio.cookie, corpo: { ids } });
    await chamar("POST", `/api/intimacoes/${ids[0]}/nao-lida`, { cookie: socio.cookie });
    const relogio = relogioFalso();
    definirDepsDjenParaTeste({ cliente: clienteSimulado(relogio, () => ok([item(9, { texto: "CONTEUDO-SIGILOSO-123 c" })])), relogio });
    await chamar("POST", "/api/intimacoes/buscar", { cookie: socio.cookie });
    const { results } = await env.DB.prepare("SELECT acao, entidade_id, detalhes FROM audit_log WHERE tenant_id = ?").bind(t).all<{ acao: string; entidade_id: string | null; detalhes: string | null }>();
    const acoes = results.map((x) => x.acao);
    expect(acoes).toEqual(expect.arrayContaining(["intimacoes_lidas_em_lote", "intimacao_nao_lida", "intimacoes_busca_manual"]));
    expect(JSON.stringify(results)).not.toContain("SIGILOSO");
    const lote = results.find((x) => x.acao === "intimacoes_lidas_em_lote")!;
    expect(JSON.parse(lote.detalhes!)).toEqual({ quantidade: 2 });
    const execs = await env.DB.prepare("SELECT * FROM djen_execucoes WHERE tenant_id = ?").bind(t).all();
    expect(JSON.stringify(execs.results)).not.toContain("SIGILOSO");
  });

  it("lote inválido", async () => {
    const { socio } = await cenario();
    expect((await chamar("POST", "/api/intimacoes/lidas", { cookie: socio.cookie, corpo: { ids: [] } })).status).toBe(400);
    expect((await chamar("POST", "/api/intimacoes/lidas", { cookie: socio.cookie, corpo: { ids: Array.from({ length: 201 }, (_, i) => `x${i}`) } })).status).toBe(400);
  });
});
