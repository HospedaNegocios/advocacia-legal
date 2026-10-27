import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { criarRepositorio } from "../src/server/db/repositorio";
import type { RespostaDjen } from "../src/server/djen/cliente";
import { coletaDiaria, executarColeta, janelaDeBusca, ORCAMENTO_MANUAL_MS } from "../src/server/djen/coleta";
import { normalizarItem } from "../src/server/djen/formato";
import { prepararBanco } from "./aplicar-migracoes";
import { chamar, criarEscritorio, sessaoDeUsuario } from "./ajuda";
import { HOJE, alvo, clienteSimulado, criarOab, item, ok, relogioFalso } from "./djen-ajuda";
import { criarAcessoPlataforma } from "../src/server/db/repositorio";

prepararBanco();

const manual = { origem: "manual", orcamentoMs: ORCAMENTO_MANUAL_MS, maxRequisicoes: 100 } as const;
const contar = async (t: string) => (await criarRepositorio(env.DB, t).intimacoes.pesquisar({ limite: 1 })).total;

async function cenario() {
  const t = await criarEscritorio("escritorio");
  const oab = await criarOab(t);
  return { t, oab, relogio: relogioFalso() };
}

describe("coleta: paginação, idempotência e janela", () => {
  it("pagina com 50 itens por página até o total e não duplica ao repetir", async () => {
    const { t, oab, relogio } = await cenario();
    const paginas: Record<number, unknown[]> = {
      1: Array.from({ length: 50 }, (_, i) => item(1000 + i)),
      2: Array.from({ length: 50 }, (_, i) => item(2000 + i)),
      3: Array.from({ length: 7 }, (_, i) => item(3000 + i)),
    };
    const cliente = clienteSimulado(relogio, (p) => ok(paginas[p.pagina] ?? [], 107));
    const deps = { db: env.DB, cliente, relogio };
    const r = await executarColeta(deps, [alvo(t, oab)], manual);
    expect(r).toMatchObject({ sucesso: 1, erro: 0, bloqueado: false, novas: 107, requisicoes: 3 });
    expect(cliente.chamadas.map((c) => c.p.pagina)).toEqual([1, 2, 3]);
    expect(cliente.chamadas.every((c) => c.p.itensPorPagina === 50 && c.p.numeroOab === oab.numero && c.p.ufOab === "SP")).toBe(true);
    expect(await contar(t)).toBe(107);

    // Segunda rodada: nada novo, nada duplicado.
    const r2 = await executarColeta(deps, [alvo(t, oab)], manual);
    expect(r2.novas).toBe(0);
    expect(await contar(t)).toBe(107);
  });

  it("não passa de 1 requisição por segundo, mesmo com repetições", async () => {
    const { t, oab, relogio } = await cenario();
    let n = 0;
    const cliente = clienteSimulado(relogio, (p) => {
      n += 1;
      if (n === 1) return { tipo: "erro", status: 500, motivo: "servidor" };
      return ok(p.pagina === 1 ? Array.from({ length: 50 }, (_, i) => item(i)) : [item(99)], 51);
    });
    await executarColeta({ db: env.DB, cliente, relogio }, [alvo(t, oab)], manual);
    expect(cliente.chamadas.length).toBe(3);
    for (let i = 1; i < cliente.chamadas.length; i++) expect(cliente.chamadas[i]!.em - cliente.chamadas[i - 1]!.em).toBeGreaterThanOrEqual(1000);
  });

  it("repete 5xx com espera crescente e desiste depois de 3 tentativas sem derrubar a próxima OAB", async () => {
    const t = await criarEscritorio("banca");
    const a = await criarOab(t);
    const b = await criarOab(t, { uf: "RJ" });
    const relogio = relogioFalso();
    const cliente = clienteSimulado(relogio, (p) => (p.numeroOab === a.numero ? { tipo: "erro", status: 503, motivo: "servidor" } : ok([item(7)])));
    const r = await executarColeta({ db: env.DB, cliente, relogio }, [alvo(t, a), alvo(t, b)], manual);
    expect(cliente.chamadas.filter((c) => c.p.numeroOab === a.numero)).toHaveLength(3);
    expect(relogio.dormidos.filter((ms) => ms >= 2000)).toEqual(expect.arrayContaining([2000, 4000]));
    expect(r).toMatchObject({ erro: 1, sucesso: 1, bloqueado: false, novas: 1 });
    const exec = await env.DB.prepare("SELECT resultado, http_status FROM djen_execucoes WHERE oab_id = ?").bind(a.id).first<{ resultado: string; http_status: number }>();
    expect(exec).toEqual({ resultado: "erro", http_status: 503 });
  });

  it("erro que não é de servidor (400) não é repetido", async () => {
    const { t, oab, relogio } = await cenario();
    const cliente = clienteSimulado(relogio, () => ({ tipo: "erro", status: 400, motivo: "recusada" }));
    await executarColeta({ db: env.DB, cliente, relogio }, [alvo(t, oab)], manual);
    expect(cliente.chamadas).toHaveLength(1);
  });

  it("janela: primeira vez = últimos 3 dias; depois, a partir do último dia coletado; no máximo 30 dias", async () => {
    const { t, oab, relogio } = await cenario();
    const cliente = clienteSimulado(relogio, () => ok([]));
    const deps = { db: env.DB, cliente, relogio };
    await executarColeta(deps, [alvo(t, oab)], manual);
    expect(cliente.chamadas[0]!.p).toMatchObject({ dataInicio: "2026-10-24", dataFim: HOJE });
    await relogio.dormir(24 * 3600_000);
    await executarColeta(deps, [alvo(t, oab)], manual);
    expect(cliente.chamadas[1]!.p).toMatchObject({ dataInicio: HOJE, dataFim: "2026-10-28" });
    expect(janelaDeBusca("2026-10-27", "2026-01-01").inicio).toBe("2026-09-27");
    expect(janelaDeBusca("2026-10-27", "2026-12-01").inicio).toBe("2026-10-27");
  });

  it("repetir a mesma OAB de dois escritórios na mesma rodada pede cada página uma só vez, e os dados ficam separados", async () => {
    const ta = await criarEscritorio("solo");
    const tb = await criarEscritorio("solo");
    const repoA = criarRepositorio(env.DB, ta);
    const repoB = criarRepositorio(env.DB, tb);
    const numero = "777001";
    const oa = await repoA.oabs.inserir({ numero, uf: "SP", advogado_nome: "A", ativo: 1 });
    const ob = await repoB.oabs.inserir({ numero, uf: "SP", advogado_nome: "B", ativo: 1 });
    const relogio = relogioFalso();
    const cliente = clienteSimulado(relogio, () => ok([item(555)]));
    const r = await executarColeta({ db: env.DB, cliente, relogio }, [alvo(ta, { id: oa, numero, uf: "SP" }), alvo(tb, { id: ob, numero, uf: "SP" })], manual);
    expect(cliente.chamadas).toHaveLength(1);
    expect(r.novas).toBe(2);
    const a = await repoA.intimacoes.pesquisar({});
    const b = await repoB.intimacoes.pesquisar({});
    expect(a.total).toBe(1);
    expect(b.total).toBe(1);
    expect(a.itens[0]!.id).not.toBe(b.itens[0]!.id);
    expect(a.itens[0]!.tenant_id).toBe(ta);
    expect(b.itens[0]!.tenant_id).toBe(tb);
  });

  it("a mesma publicação achada por duas OABs do escritório fica numa linha só, ligada às duas", async () => {
    const t = await criarEscritorio("banca");
    const a = await criarOab(t);
    const b = await criarOab(t, { uf: "MG" });
    const relogio = relogioFalso();
    const cliente = clienteSimulado(relogio, () => ok([item(4242)]));
    const r = await executarColeta({ db: env.DB, cliente, relogio }, [alvo(t, a), alvo(t, b)], manual);
    expect(r.novas).toBe(1);
    const repo = criarRepositorio(env.DB, t);
    const { itens } = await repo.intimacoes.pesquisar({});
    expect(itens).toHaveLength(1);
    expect((await repo.intimacoes.oabsDe([itens[0]!.id])).map((o) => o.oab_id).sort()).toEqual([a.id, b.id].sort());
    expect((await repo.intimacoes.pesquisar({ oab_id: b.id })).total).toBe(1);
  });

  it("respeita o orçamento de requisições: o resto fica para a próxima rodada", async () => {
    const t = await criarEscritorio("banca");
    const oabs = [await criarOab(t), await criarOab(t, { uf: "RJ" }), await criarOab(t, { uf: "MG" })];
    const relogio = relogioFalso();
    const cliente = clienteSimulado(relogio, () => ok([]));
    const r = await executarColeta({ db: env.DB, cliente, relogio }, oabs.map((o) => alvo(t, o)), { ...manual, maxRequisicoes: 1 });
    expect(r).toMatchObject({ sucesso: 1, adiadas: 2 });
  });
});

describe("coleta: bloqueio", () => {
  const bloqueios: [string, RespostaDjen][] = [
    ["403", { tipo: "bloqueado", status: 403, motivo: "recusado" }],
    ["429", { tipo: "bloqueado", status: 429, motivo: "recusado" }],
    ["HTML/CAPTCHA", { tipo: "bloqueado", status: 200, motivo: "resposta_nao_json" }],
  ];
  for (const [nome, resposta] of bloqueios) {
    it(`${nome} interrompe a coleta inteira e registra "bloqueado"`, async () => {
      const t = await criarEscritorio("banca");
      const t2 = await criarEscritorio("solo");
      const a = await criarOab(t);
      const b = await criarOab(t, { uf: "RJ" });
      const c = await criarOab(t2);
      const relogio = relogioFalso();
      const cliente = clienteSimulado(relogio, (p) => (p.numeroOab === b.numero ? resposta : ok([item(1)])));
      const r = await executarColeta({ db: env.DB, cliente, relogio }, [alvo(t, a), alvo(t, b), alvo(t2, c)], manual);
      expect(r).toMatchObject({ bloqueado: true, sucesso: 1, adiadas: 1 });
      expect(cliente.chamadas.map((x) => x.p.numeroOab)).toEqual([a.numero, b.numero]);
      const exec = await env.DB.prepare("SELECT resultado, http_status, observacao FROM djen_execucoes WHERE oab_id = ?").bind(b.id).first<any>();
      expect(exec).toMatchObject({ resultado: "bloqueado", http_status: resposta.tipo === "bloqueado" ? resposta.status : null });
      // A OAB que nem chegou a ser consultada não tem execução registrada.
      expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM djen_execucoes WHERE oab_id = ?").bind(c.id).first<{ n: number }>()).toEqual({ n: 0 });
    });
  }
});

describe("coleta diária (Cron)", () => {
  it("ignora escritório suspenso e OAB inativa; coleta as demais", async () => {
    const ativo = await criarEscritorio("escritorio");
    const suspenso = await criarEscritorio("escritorio");
    const cancelado = await criarEscritorio("escritorio");
    const oabAtiva = await criarOab(ativo);
    const oabInativa = await criarOab(ativo, { ativo: 0, uf: "RJ" });
    const oabSusp = await criarOab(suspenso);
    const oabCanc = await criarOab(cancelado);
    const plataforma = criarAcessoPlataforma(env.DB);
    await plataforma.atualizarEscritorio(suspenso, { status: "suspenso" });
    await plataforma.atualizarEscritorio(cancelado, { status: "cancelado" });
    const relogio = relogioFalso();
    const cliente = clienteSimulado(relogio, () => ok([]));
    await coletaDiaria({ db: env.DB, cliente, relogio });
    const pedidas = cliente.chamadas.map((c) => c.p.numeroOab);
    expect(pedidas).toContain(oabAtiva.numero);
    expect(pedidas).not.toContain(oabInativa.numero);
    expect(pedidas).not.toContain(oabSusp.numero);
    expect(pedidas).not.toContain(oabCanc.numero);
  });

  it("não repete a OAB coletada há pouco (disparo duplo do Cron)", async () => {
    const t = await criarEscritorio("solo");
    const oab = await criarOab(t);
    const relogio = relogioFalso();
    const cliente = clienteSimulado(relogio, () => ok([]));
    await coletaDiaria({ db: env.DB, cliente, relogio });
    const antes = cliente.chamadas.filter((c) => c.p.numeroOab === oab.numero).length;
    expect(antes).toBe(1);
    await coletaDiaria({ db: env.DB, cliente, relogio });
    expect(cliente.chamadas.filter((c) => c.p.numeroOab === oab.numero)).toHaveLength(1);
  });
});

describe("vinculação pelo número CNJ", () => {
  it("liga com e sem máscara; o que não bate fica sem processo; cadastrar o processo depois liga as órfãs", async () => {
    const t = await criarEscritorio("escritorio");
    const socio = await sessaoDeUsuario(t, "socio");
    const oab = await criarOab(t);
    const repo = criarRepositorio(env.DB, t);
    const criado = await chamar("POST", "/api/processos", { cookie: socio.cookie, corpo: { numero_cnj: "0000001-78.2020.8.26.0100", fase: "Conhecimento" } });
    expect(criado.status).toBe(201);
    const relogio = relogioFalso();
    const cliente = clienteSimulado(relogio, () =>
      ok([
        item(1, { numero_processo: "00000017820208260100", numeroprocessocommascara: undefined }),
        item(2, { numero_processo: undefined, numeroprocessocommascara: "0000001-78.2020.8.26.0100" }),
        item(3, { numero_processo: "1234567-53.2023.8.26.0001", numeroprocessocommascara: undefined }),
        item(4, { numero_processo: undefined, numeroprocessocommascara: undefined }),
      ]),
    );
    await executarColeta({ db: env.DB, cliente, relogio }, [alvo(t, oab)], manual);
    const por = async (id: string) => (await repo.intimacoes.pesquisar({ busca: `XXXX da publicação ${id}` })).itens[0]!;
    expect(await por("1")).toMatchObject({ processo_id: criado.json.processo.id, vinculo: "cnj", numero_processo: "00000017820208260100" });
    expect(await por("2")).toMatchObject({ processo_id: criado.json.processo.id, vinculo: "cnj" });
    expect(await por("3")).toMatchObject({ processo_id: null, vinculo: null, numero_processo: "12345675320238260001" });
    expect(await por("4")).toMatchObject({ processo_id: null, numero_processo: null });

    const novo = await chamar("POST", "/api/processos", { cookie: socio.cookie, corpo: { numero_cnj: "1234567-53.2023.8.26.0001", fase: "Recursal" } });
    expect(novo.status).toBe(201);
    expect(await por("3")).toMatchObject({ processo_id: novo.json.processo.id, vinculo: "cnj" });
    expect((await por("4")).processo_id).toBeNull();
  });
});

describe("registros operacionais", () => {
  it("a execução guarda contagens e códigos, nunca texto de publicação", async () => {
    const { t, oab, relogio } = await cenario();
    const cliente = clienteSimulado(relogio, () => ok([item(1, { texto: "SEGREDO-DA-PUBLICACAO" })]));
    await executarColeta({ db: env.DB, cliente, relogio }, [alvo(t, oab)], manual);
    const colunas = (await env.DB.prepare("PRAGMA table_info(djen_execucoes)").all<{ name: string }>()).results.map((c) => c.name);
    expect(colunas.some((c) => /texto|conteudo/i.test(c))).toBe(false);
    const linha = await env.DB.prepare("SELECT * FROM djen_execucoes WHERE oab_id = ?").bind(oab.id).first<any>();
    expect(JSON.stringify(linha)).not.toContain("SEGREDO");
    expect(linha).toMatchObject({ resultado: "sucesso", itens_lidos: 1, itens_novos: 1, paginas: 1, http_status: 200, origem: "manual" });
  });
});

describe("leitura dos itens da API", () => {
  it("usa o hash quando falta o id e descarta item sem nenhum dos dois", () => {
    expect(normalizarItem({ hash: "abc", texto: "t" })).toMatchObject({ comunicacao_id: "abc", hash: "abc" });
    expect(normalizarItem({ texto: "t" })).toBeNull();
    expect(normalizarItem(null)).toBeNull();
    expect(normalizarItem({ id: 77 })).toMatchObject({ comunicacao_id: "77", texto: "", link: null, numero_processo: null });
  });
  it("aceita as duas grafias de data e só links http(s)", () => {
    expect(normalizarItem({ id: 1, data_disponibilizacao: "27/10/2026" })?.data_disponibilizacao).toBe("2026-10-27");
    expect(normalizarItem({ id: 1, datadisponibilizacao: "2026-10-27T03:00:00.000Z" })?.data_disponibilizacao).toBe("2026-10-27");
    expect(normalizarItem({ id: 1, data_disponibilizacao: "ontem" })?.data_disponibilizacao).toBeNull();
    expect(normalizarItem({ id: 1, link: "javascript:alert(1)" })?.link).toBeNull();
    expect(normalizarItem({ id: 1, link: "https://exemplo.test/x" })?.link).toBe("https://exemplo.test/x");
  });
  it("número com máscara vira 20 dígitos; outro formato fica como veio", () => {
    expect(normalizarItem({ id: 1, numero_processo: "0000001-78.2020.8.26.0100" })?.numero_processo).toBe("00000017820208260100");
    expect(normalizarItem({ id: 1, numero_processo: "ABC-123" })?.numero_processo).toBe("ABC-123");
  });
});
