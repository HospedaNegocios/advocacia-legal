import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { inteiroPorExtenso, valorPorExtenso } from "../src/comum/extenso";
import { dividirEmParcelas, gerarParcelamento, gerarRecorrencia, somarMeses } from "../src/comum/parcelas";
import { prepararBanco } from "./aplicar-migracoes";
import { chamar, criarEscritorio, sessaoDeUsuario } from "./ajuda";

prepararBanco();

const NUMERO_CNJ = "0000001-78.2020.8.26.0100";
const lanc = (extra: object = {}) => ({ tipo: "receita", descricao: "Honorários", categoria: "Honorário", valor_centavos: 10000, vencimento: "2030-01-31", ...extra });

async function cenario() {
  const t = await criarEscritorio("escritorio");
  const socio = await sessaoDeUsuario(t, "socio");
  const adv = await sessaoDeUsuario(t, "advogado");
  return { t, socio, adv };
}
const liberar = (socioCookie: string, id: string, nivel: string) => chamar("PUT", `/api/equipe/${id}/permissoes/financeiro`, { cookie: socioCookie, corpo: { nivel } });
async function criarCliente(cookie: string, nome = "Maria da Silva") {
  const r = await chamar("POST", "/api/clientes", { cookie, corpo: { tipo: "pf", nome } });
  expect(r.status).toBe(201);
  return r.json.cliente.id as string;
}
async function criarGrupo(cookie: string, extra: object = {}) {
  const r = await chamar("POST", "/api/financeiro", { cookie, corpo: lanc(extra) });
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  return r.json as { grupo_id: string; lancamento: { id: string }; lancamentos: { id: string; descricao: string; valor_centavos: number; vencimento: string; status: string; numero_no_grupo: number; grupo_total: number; grupo_tipo: string }[] };
}
const pagar = (cookie: string, id: string, pago_em = "2020-01-10") => chamar("POST", `/api/financeiro/${id}/pagar`, { cookie, corpo: { pago_em } });

describe("divisão em parcelas e datas (funções puras)", () => {
  it("a soma das parcelas é sempre o total; a diferença vai na última", () => {
    expect(dividirEmParcelas(10000, 3)).toEqual([3333, 3333, 3334]);
    expect(dividirEmParcelas(10000, 4)).toEqual([2500, 2500, 2500, 2500]);
    expect(dividirEmParcelas(5, 5)).toEqual([1, 1, 1, 1, 1]);
    expect(dividirEmParcelas(100, 7)).toEqual([14, 14, 14, 14, 14, 14, 16]);
    for (const [total, n] of [[99_999_999_999, 60], [1234567, 11], [60, 60], [61, 60], [100, 2], [999, 13]] as const) {
      const p = dividirEmParcelas(total, n);
      expect(p).toHaveLength(n);
      expect(p.reduce((a, b) => a + b, 0)).toBe(total);
      expect(p.every((v) => Number.isInteger(v) && v >= 1)).toBe(true);
    }
    expect(() => dividirEmParcelas(5, 6)).toThrow();
  });

  it("meses curtos: dia 31 vai para o último dia e volta a 31 quando o mês tem", () => {
    expect(somarMeses("2030-01-31", 1)).toBe("2030-02-28");
    expect(somarMeses("2028-01-31", 1)).toBe("2028-02-29"); // ano bissexto
    expect(somarMeses("2030-01-31", 2)).toBe("2030-03-31");
    expect(somarMeses("2030-01-31", 3)).toBe("2030-04-30");
    expect(somarMeses("2030-01-30", 1)).toBe("2030-02-28");
    expect(somarMeses("2030-01-29", 1)).toBe("2030-02-28");
    expect(somarMeses("2030-11-15", 2)).toBe("2031-01-15"); // vira o ano
    expect(somarMeses("2030-12-31", 12)).toBe("2031-12-31");
    expect(somarMeses("2030-12-31", 14)).toBe("2032-02-29");
  });

  it("gera descrição (n/N), vencimentos mensais e valores", () => {
    const p = gerarParcelamento("Honorários", 10000, "2030-01-31", 3);
    expect(p.map((i) => i.descricao)).toEqual(["Honorários (1/3)", "Honorários (2/3)", "Honorários (3/3)"]);
    expect(p.map((i) => i.vencimento)).toEqual(["2030-01-31", "2030-02-28", "2030-03-31"]);
    expect(p.map((i) => i.valor_centavos)).toEqual([3333, 3333, 3334]);
    const r = gerarRecorrencia("Aluguel", 150000, "2030-05-10", 3);
    expect(r.map((i) => i.valor_centavos)).toEqual([150000, 150000, 150000]);
    expect(r.map((i) => i.vencimento)).toEqual(["2030-05-10", "2030-06-10", "2030-07-10"]);
  });
});

describe("valor por extenso", () => {
  it.each([
    [0, "zero reais"],
    [1, "um centavo"],
    [50, "cinquenta centavos"],
    [100, "um real"],
    [101, "um real e um centavo"],
    [200, "dois reais"],
    [1000, "dez reais"],
    [1500, "quinze reais"],
    [10000, "cem reais"],
    [10150, "cento e um reais e cinquenta centavos"],
    [12345, "cento e vinte e três reais e quarenta e cinco centavos"],
    [100000, "mil reais"],
    [110000, "mil e cem reais"],
    [100100, "mil e um reais"],
    [123456, "mil duzentos e trinta e quatro reais e cinquenta e seis centavos"],
    [150000, "mil e quinhentos reais"],
    [200000, "dois mil reais"],
    [2100000, "vinte e um mil reais"],
    [10000000, "cem mil reais"],
    [10050000, "cem mil e quinhentos reais"],
    [100000000, "um milhão de reais"],
    [100005000, "um milhão e cinquenta reais"],
    [120000000, "um milhão e duzentos mil reais"],
    [123456789, "um milhão duzentos e trinta e quatro mil quinhentos e sessenta e sete reais e oitenta e nove centavos"],
    [200000000, "dois milhões de reais"],
    [200000001, "dois milhões de reais e um centavo"],
    [250000000, "dois milhões e quinhentos mil reais"],
    [100000000000, "um bilhão de reais"],
    [99999999999, "novecentos e noventa e nove milhões novecentos e noventa e nove mil novecentos e noventa e nove reais e noventa e nove centavos"],
  ])("%i centavos", (centavos, texto) => {
    expect(valorPorExtenso(centavos)).toBe(texto);
  });
  it("recusa valores inválidos", () => {
    expect(() => valorPorExtenso(-1)).toThrow();
    expect(() => valorPorExtenso(1.5)).toThrow();
    expect(inteiroPorExtenso(21)).toBe("vinte e um");
  });
});

describe("parcelamento pela API", () => {
  it("cria N lançamentos independentes em aberto, soma exata, datas de meses curtos, (n/N) e grupo", async () => {
    const { socio } = await cenario();
    const r = await criarGrupo(socio.cookie, { parcelas: 3 });
    expect(r.lancamentos).toHaveLength(3);
    expect(r.lancamentos.map((l) => l.valor_centavos)).toEqual([3333, 3333, 3334]);
    expect(r.lancamentos.reduce((a, l) => a + l.valor_centavos, 0)).toBe(10000);
    expect(r.lancamentos.map((l) => l.vencimento)).toEqual(["2030-01-31", "2030-02-28", "2030-03-31"]);
    expect(r.lancamentos.map((l) => l.descricao)).toEqual(["Honorários (1/3)", "Honorários (2/3)", "Honorários (3/3)"]);
    expect(r.lancamentos.every((l) => l.status === "aberto" && l.grupo_total === 3 && l.grupo_tipo === "parcelamento")).toBe(true);
    expect(r.lancamentos.map((l) => l.numero_no_grupo)).toEqual([1, 2, 3]);
    expect(r.lancamento.id).toBe(r.lancamentos[0]?.id);
    const g = await chamar("GET", `/api/financeiro/grupos/${r.grupo_id}`, { cookie: socio.cookie });
    expect(g.json.grupo).toMatchObject({ tipo: "parcelamento", total_itens: 3 });
    expect(g.json.lancamentos).toHaveLength(3);
    const lista = await chamar("GET", `/api/financeiro?grupo_id=${r.grupo_id}`, { cookie: socio.cookie });
    expect(lista.json.total).toBe(3);
  });

  it("editar, pagar ou cancelar uma parcela não altera as outras", async () => {
    const { socio } = await cenario();
    const r = await criarGrupo(socio.cookie, { parcelas: 3 });
    const [p1, p2, p3] = r.lancamentos as unknown as [{ id: string }, { id: string }, { id: string }];
    expect((await pagar(socio.cookie, p1.id)).status).toBe(200);
    const ed = await chamar("PUT", `/api/financeiro/${p2.id}`, { cookie: socio.cookie, corpo: lanc({ descricao: "Parcela 2 renegociada", valor_centavos: 4000, vencimento: "2030-03-05" }) });
    expect(ed.status).toBe(200);
    const g = await chamar("GET", `/api/financeiro/grupos/${r.grupo_id}`, { cookie: socio.cookie });
    const [a, b, c] = g.json.lancamentos;
    expect(a).toMatchObject({ status: "pago", valor_pago_centavos: 3333 });
    expect(b).toMatchObject({ status: "aberto", descricao: "Parcela 2 renegociada", valor_centavos: 4000, grupo_id: r.grupo_id, numero_no_grupo: 2 });
    expect(c).toMatchObject({ id: p3.id, status: "aberto", valor_centavos: 3334, descricao: "Honorários (3/3)", vencimento: "2030-03-31" });
  });

  it("'Cancelar parcelas em aberto': cancela só as abertas; pagas ficam; sem abertas dá 409", async () => {
    const { socio } = await cenario();
    const r = await criarGrupo(socio.cookie, { parcelas: 4 });
    const ids = r.lancamentos.map((l) => l.id);
    await pagar(socio.cookie, ids[0] as string);
    await chamar("POST", `/api/financeiro/${ids[1]}/cancelar`, { cookie: socio.cookie });
    const c = await chamar("POST", `/api/financeiro/grupos/${r.grupo_id}/cancelar-abertas`, { cookie: socio.cookie });
    expect(c.status, JSON.stringify(c.json)).toBe(200);
    expect(c.json.canceladas).toBe(2);
    const g = await chamar("GET", `/api/financeiro/grupos/${r.grupo_id}`, { cookie: socio.cookie });
    expect(g.json.lancamentos.map((l: { status: string }) => l.status)).toEqual(["pago", "cancelado", "cancelado", "cancelado"]);
    const de_novo = await chamar("POST", `/api/financeiro/grupos/${r.grupo_id}/cancelar-abertas`, { cookie: socio.cookie });
    expect(de_novo.status).toBe(409);
    expect((await chamar("POST", "/api/financeiro/grupos/inexistente/cancelar-abertas", { cookie: socio.cookie })).status).toBe(404);
    // uma parcela cancelada pode ser reaberta isoladamente
    expect((await chamar("POST", `/api/financeiro/${ids[2]}/reabrir`, { cookie: socio.cookie })).status).toBe(200);
  });

  it("valida quantidade, descrição longa, total pequeno, parcelas + repetição e valor da parcela", async () => {
    const { socio } = await cenario();
    for (const parcelas of [0, 1, 61, 2.5, "3", -2]) {
      expect((await chamar("POST", "/api/financeiro", { cookie: socio.cookie, corpo: lanc({ parcelas }) })).status, String(parcelas)).toBe(400);
    }
    expect((await chamar("POST", "/api/financeiro", { cookie: socio.cookie, corpo: lanc({ parcelas: 2, repetir_meses: 2 }) })).status).toBe(400);
    expect((await chamar("POST", "/api/financeiro", { cookie: socio.cookie, corpo: lanc({ parcelas: 3, valor_centavos: 2 }) })).status).toBe(400);
    expect((await chamar("POST", "/api/financeiro", { cookie: socio.cookie, corpo: lanc({ parcelas: 2, descricao: "x".repeat(193) }) })).status).toBe(400);
    expect((await chamar("POST", "/api/financeiro", { cookie: socio.cookie, corpo: lanc({ parcelas: 2, descricao: "x".repeat(192) }) })).status).toBe(201);
    // limites aceitos: 2 e 60
    expect((await criarGrupo(socio.cookie, { parcelas: 2 })).lancamentos).toHaveLength(2);
    const sessenta = await criarGrupo(socio.cookie, { parcelas: 60, valor_centavos: 100001 });
    expect(sessenta.lancamentos).toHaveLength(60);
    expect(sessenta.lancamentos.reduce((a, l) => a + l.valor_centavos, 0)).toBe(100001);
    expect(sessenta.lancamentos[59]?.descricao).toBe("Honorários (60/60)");
    // nada foi gravado pelos pedidos recusados
    const total = (await chamar("GET", "/api/financeiro?por_pagina=100", { cookie: socio.cookie })).json.total;
    expect(total).toBe(2 + 2 + 60);
  });
});

describe("recorrência mensal pela API", () => {
  it("cria N ocorrências mensais com o mesmo valor, em aberto, no mesmo mecanismo de grupo", async () => {
    const { socio } = await cenario();
    const r = await criarGrupo(socio.cookie, { tipo: "despesa", descricao: "Aluguel da sala", valor_centavos: 250000, vencimento: "2030-11-30", repetir_meses: 4 });
    expect(r.lancamentos.map((l) => l.valor_centavos)).toEqual([250000, 250000, 250000, 250000]);
    expect(r.lancamentos.map((l) => l.vencimento)).toEqual(["2030-11-30", "2030-12-30", "2031-01-30", "2031-02-28"]);
    expect(r.lancamentos.every((l) => l.grupo_tipo === "recorrencia" && l.status === "aberto")).toBe(true);
    expect(r.lancamentos[0]?.descricao).toBe("Aluguel da sala (1/4)");
    expect((await chamar("POST", "/api/financeiro", { cookie: socio.cookie, corpo: lanc({ repetir_meses: 61 }) })).status).toBe(400);
    expect((await chamar("POST", "/api/financeiro", { cookie: socio.cookie, corpo: lanc({ repetir_meses: 1 }) })).status).toBe(400);
    // cancelar o restante funciona igual
    const c = await chamar("POST", `/api/financeiro/grupos/${r.grupo_id}/cancelar-abertas`, { cookie: socio.cookie });
    expect(c.json.canceladas).toBe(4);
  });
});

describe("grupos: permissões, vínculos, isolamento e auditoria", () => {
  it("permissões: leitura vê o grupo mas não cria nem cancela; sem acesso não vê nada; edição cancela", async () => {
    const { socio, adv } = await cenario();
    const r = await criarGrupo(socio.cookie, { parcelas: 2 });
    const rotas: [string, string, unknown?][] = [
      ["GET", `/api/financeiro/grupos/${r.grupo_id}`],
      ["POST", `/api/financeiro/grupos/${r.grupo_id}/cancelar-abertas`, {}],
      ["POST", "/api/financeiro", lanc({ parcelas: 3 })],
      ["GET", "/api/financeiro/totais?cliente_id=x"],
    ];
    for (const [m, u, corpo] of rotas) {
      const x = await chamar(m, u, { cookie: adv.cookie, ...(corpo !== undefined ? { corpo } : {}) });
      expect(x.status, `${m} ${u}`).toBe(403);
    }
    await liberar(socio.cookie, adv.id, "leitura");
    expect((await chamar("GET", `/api/financeiro/grupos/${r.grupo_id}`, { cookie: adv.cookie })).status).toBe(200);
    expect((await chamar("GET", "/api/financeiro/totais?cliente_id=x", { cookie: adv.cookie })).status).toBe(200);
    expect((await chamar("POST", `/api/financeiro/grupos/${r.grupo_id}/cancelar-abertas`, { cookie: adv.cookie, corpo: {} })).status).toBe(403);
    expect((await chamar("POST", "/api/financeiro", { cookie: adv.cookie, corpo: lanc({ parcelas: 3 }) })).status).toBe(403);
    await liberar(socio.cookie, adv.id, "edicao");
    expect((await chamar("POST", "/api/financeiro", { cookie: adv.cookie, corpo: lanc({ parcelas: 3 }) })).status).toBe(201);
    expect((await chamar("POST", `/api/financeiro/grupos/${r.grupo_id}/cancelar-abertas`, { cookie: adv.cookie, corpo: {} })).status).toBe(200);
  });

  it("cliente desativado: 409 e nenhuma parcela gravada; cliente de outro escritório: 404", async () => {
    const a = await cenario();
    const b = await cenario();
    const cliente = await criarCliente(a.socio.cookie);
    const clienteB = await criarCliente(b.socio.cookie, "Cliente do B");
    expect((await chamar("POST", `/api/clientes/${cliente}/situacao`, { cookie: a.socio.cookie, corpo: { ativo: false } })).status).toBe(200);
    expect((await chamar("POST", "/api/financeiro", { cookie: a.socio.cookie, corpo: lanc({ parcelas: 3, cliente_id: cliente }) })).status).toBe(409);
    expect((await chamar("POST", "/api/financeiro", { cookie: a.socio.cookie, corpo: lanc({ repetir_meses: 3, cliente_id: clienteB }) })).status).toBe(404);
    expect((await chamar("GET", "/api/financeiro", { cookie: a.socio.cookie })).json.total).toBe(0);
  });

  it("isolamento: grupo, recibo e totais de outro escritório não aparecem", async () => {
    const a = await cenario();
    const b = await cenario();
    const clienteB = await criarCliente(b.socio.cookie, "Cliente do B");
    const g = await criarGrupo(b.socio.cookie, { parcelas: 2, cliente_id: clienteB });
    const idB = g.lancamentos[0]?.id as string;
    await pagar(b.socio.cookie, idB);
    expect((await chamar("GET", `/api/financeiro/grupos/${g.grupo_id}`, { cookie: a.socio.cookie })).status).toBe(404);
    expect((await chamar("POST", `/api/financeiro/grupos/${g.grupo_id}/cancelar-abertas`, { cookie: a.socio.cookie })).status).toBe(404);
    expect((await chamar("GET", `/api/financeiro/${idB}/recibo`, { cookie: a.socio.cookie })).status).toBe(404);
    expect((await chamar("GET", `/api/financeiro?grupo_id=${g.grupo_id}`, { cookie: a.socio.cookie })).json.total).toBe(0);
    const tot = await chamar("GET", `/api/financeiro/totais?cliente_id=${clienteB}`, { cookie: a.socio.cookie });
    expect(tot.json.totais).toMatchObject({ receita_aberta_centavos: 0, receita_paga_centavos: 0 });
    // intacto no B
    const depois = await chamar("GET", `/api/financeiro/grupos/${g.grupo_id}`, { cookie: b.socio.cookie });
    expect(depois.json.lancamentos.map((l: { status: string }) => l.status)).toEqual(["pago", "aberto"]);
    // o banco recusa ligar um lançamento do A a um grupo do B (chave estrangeira composta)
    const idA = (await chamar("POST", "/api/financeiro", { cookie: a.socio.cookie, corpo: lanc() })).json.lancamento.id as string;
    await expect(env.DB.prepare("UPDATE lancamentos SET grupo_id = ?, numero_no_grupo = 1 WHERE id = ?").bind(g.grupo_id, idA).run()).rejects.toThrow();
  });

  it("auditoria do grupo só tem ids, tipo e quantidade (sem descrição nem valores)", async () => {
    const { t, socio } = await cenario();
    const g = await criarGrupo(socio.cookie, { descricao: "Segredo do cliente XPTO", valor_centavos: 987654, parcelas: 3 });
    await chamar("POST", `/api/financeiro/grupos/${g.grupo_id}/cancelar-abertas`, { cookie: socio.cookie });
    const log = await env.DB.prepare("SELECT acao, entidade, entidade_id, detalhes FROM audit_log WHERE tenant_id = ? AND entidade = 'lancamentos_grupos' ORDER BY criado_em, rowid").bind(t).all<{ acao: string; entidade_id: string; detalhes: string | null }>();
    expect(log.results.map((x) => x.acao)).toEqual(["lancamento_grupo_criado", "lancamento_grupo_cancelado"]);
    expect(log.results.every((x) => x.entidade_id === g.grupo_id)).toBe(true);
    const texto = JSON.stringify(log.results);
    expect(texto).not.toContain("XPTO");
    expect(texto).not.toContain("987654");
  });
});

describe("recibo", () => {
  async function receitaPaga(cookie: string, extra: object = {}, valorPago?: number) {
    const cliente = await criarCliente(cookie, "Maria da Silva");
    const r = await chamar("POST", "/api/financeiro", { cookie, corpo: lanc({ cliente_id: cliente, descricao: "Honorários da ação", valor_centavos: 123456, ...extra }) });
    const id = r.json.lancamento.id as string;
    const p = await chamar("POST", `/api/financeiro/${id}/pagar`, { cookie, corpo: { pago_em: "2020-03-10", ...(valorPago ? { valor_pago_centavos: valorPago } : {}) } });
    expect(p.status).toBe(200);
    return { id, cliente };
  }

  it("receita paga: dados do recibo com valor pago por extenso, pagador, escritório e auditoria só com ids", async () => {
    const { t, socio } = await cenario();
    await chamar("PUT", "/api/escritorio/perfil", { cookie: socio.cookie, corpo: { razao_social: "Silva Advogados", telefone: "11999990000" } });
    const { id } = await receitaPaga(socio.cookie, {}, 150000);
    const r = await chamar("GET", `/api/financeiro/${id}/recibo`, { cookie: socio.cookie });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json.recibo).toMatchObject({
      valor_centavos: 150000,
      valor_extenso: "mil e quinhentos reais",
      pago_em: "2020-03-10",
      descricao: "Honorários da ação",
      pagador: { nome: "Maria da Silva" },
      escritorio: { razao_social: "Silva Advogados" },
    });
    expect(r.json.recibo.referencia).toBe(id.slice(0, 8).toUpperCase());
    const log = await env.DB.prepare("SELECT acao, entidade_id, detalhes FROM audit_log WHERE tenant_id = ? AND acao = 'recibo_gerado'").bind(t).all<{ entidade_id: string; detalhes: string | null }>();
    expect(log.results).toHaveLength(1);
    expect(log.results[0]).toMatchObject({ entidade_id: id, detalhes: null });
  });

  it("recusa (409) lançamento em aberto, cancelado e despesa; 404 se não existe", async () => {
    const { socio } = await cenario();
    const aberto = (await chamar("POST", "/api/financeiro", { cookie: socio.cookie, corpo: lanc() })).json.lancamento.id as string;
    expect((await chamar("GET", `/api/financeiro/${aberto}/recibo`, { cookie: socio.cookie })).status).toBe(409);
    const despesa = (await chamar("POST", "/api/financeiro", { cookie: socio.cookie, corpo: lanc({ tipo: "despesa" }) })).json.lancamento.id as string;
    await pagar(socio.cookie, despesa);
    expect((await chamar("GET", `/api/financeiro/${despesa}/recibo`, { cookie: socio.cookie })).status).toBe(409);
    await chamar("POST", `/api/financeiro/${aberto}/cancelar`, { cookie: socio.cookie });
    expect((await chamar("GET", `/api/financeiro/${aberto}/recibo`, { cookie: socio.cookie })).status).toBe(409);
    expect((await chamar("GET", "/api/financeiro/nao-existe/recibo", { cookie: socio.cookie })).status).toBe(404);
  });

  it("permissão: sem acesso 403, leitura permitida; sem sessão 401; sem cliente o pagador vem vazio", async () => {
    const { socio, adv } = await cenario();
    const r = await chamar("POST", "/api/financeiro", { cookie: socio.cookie, corpo: lanc() });
    const id = r.json.lancamento.id as string;
    await pagar(socio.cookie, id);
    expect((await chamar("GET", `/api/financeiro/${id}/recibo`, { cookie: adv.cookie })).status).toBe(403);
    expect((await chamar("GET", `/api/financeiro/${id}/recibo`)).status).toBe(401);
    await liberar(socio.cookie, adv.id, "leitura");
    const ok = await chamar("GET", `/api/financeiro/${id}/recibo`, { cookie: adv.cookie });
    expect(ok.status).toBe(200);
    expect(ok.json.recibo.pagador).toBeNull();
  });
});

describe("totais por cliente/processo e saldo corrido", () => {
  it("totais: aberto, vencido e pago por cliente e por processo; cancelado não conta; exige cliente ou processo", async () => {
    const { socio } = await cenario();
    const cliente = await criarCliente(socio.cookie);
    const proc = await chamar("POST", "/api/processos", { cookie: socio.cookie, corpo: { numero_cnj: NUMERO_CNJ, fase: "Conhecimento" } });
    const processo = proc.json.processo.id as string;
    const mk = async (extra: object) => (await chamar("POST", "/api/financeiro", { cookie: socio.cookie, corpo: lanc(extra) })).json.lancamento.id as string;
    await mk({ cliente_id: cliente, valor_centavos: 1000 });
    await mk({ cliente_id: cliente, valor_centavos: 2000, vencimento: "2020-01-01" });
    const paga = await mk({ cliente_id: cliente, processo_id: processo, valor_centavos: 5000 });
    await pagar(socio.cookie, paga);
    const cancelada = await mk({ cliente_id: cliente, valor_centavos: 9999 });
    await chamar("POST", `/api/financeiro/${cancelada}/cancelar`, { cookie: socio.cookie });
    await mk({ tipo: "despesa", cliente_id: cliente, valor_centavos: 300 });
    await mk({ processo_id: processo, valor_centavos: 70 });
    const t = await chamar("GET", `/api/financeiro/totais?cliente_id=${cliente}`, { cookie: socio.cookie });
    expect(t.json.totais).toMatchObject({ receita_aberta_centavos: 3000, receita_aberta_qtd: 2, receita_vencida_centavos: 2000, receita_paga_centavos: 5000, despesa_aberta_centavos: 300, despesa_paga_centavos: 0 });
    const tp = await chamar("GET", `/api/financeiro/totais?processo_id=${processo}`, { cookie: socio.cookie });
    expect(tp.json.totais).toMatchObject({ receita_aberta_centavos: 70, receita_paga_centavos: 5000 });
    expect((await chamar("GET", "/api/financeiro/totais", { cookie: socio.cookie })).status).toBe(400);
    // filtro da lista por cliente e por processo
    expect((await chamar("GET", `/api/financeiro?cliente_id=${cliente}&por_pagina=100`, { cookie: socio.cookie })).json.total).toBe(5);
    expect((await chamar("GET", `/api/financeiro?processo_id=${processo}`, { cookie: socio.cookie })).json.total).toBe(2);
  });

  it("saldo corrido: acumulado do escritório até cada linha paga, na ordem do caixa", async () => {
    const { socio } = await cenario();
    const mk = async (tipo: string, valor: number, pago_em: string) => {
      const id = (await chamar("POST", "/api/financeiro", { cookie: socio.cookie, corpo: lanc({ tipo, valor_centavos: valor }) })).json.lancamento.id as string;
      await pagar(socio.cookie, id, pago_em);
      return id;
    };
    const a = await mk("receita", 10000, "2020-01-05");
    const b = await mk("despesa", 2500, "2020-01-10");
    const c = await mk("receita", 700, "2020-02-01");
    const d = await mk("despesa", 20000, "2020-02-01");
    const r = await chamar("GET", "/api/financeiro?status=pago&ordem=pago_em_desc&com_saldo=1&por_pagina=100", { cookie: socio.cookie });
    const saldo = new Map<string, number>(r.json.lancamentos.map((l: { id: string; saldo_corrido_centavos: number }) => [l.id, l.saldo_corrido_centavos]));
    expect(saldo.get(a)).toBe(10000);
    expect(saldo.get(b)).toBe(7500);
    // mesmo dia: o criado depois vem primeiro na lista e tem o saldo mais recente
    expect(saldo.get(c)).toBe(8200);
    expect(saldo.get(d)).toBe(-11800);
    expect(r.json.lancamentos[0].id).toBe(d);
    // página 2 (por_pagina 2) continua com o saldo global, não reinicia
    const p2 = await chamar("GET", "/api/financeiro?status=pago&ordem=pago_em_desc&com_saldo=1&por_pagina=2&pagina=2", { cookie: socio.cookie });
    expect(p2.json.lancamentos.map((l: { saldo_corrido_centavos: number }) => l.saldo_corrido_centavos)).toEqual([7500, 10000]);
    // sem o parâmetro, o campo não vem
    expect((await chamar("GET", "/api/financeiro?status=pago", { cookie: socio.cookie })).json.lancamentos[0]).not.toHaveProperty("saldo_corrido_centavos");
  });
});
