import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mesDe, primeiroDiaDoMes, ultimoDiaDoMes, ultimosMeses } from "../src/comum/periodo";
import { hojeEm } from "../src/comum/fuso";
import { centavosValidos, validarLancamento, validarPagamento } from "../src/server/validacao-financeiro";
import { prepararBanco } from "./aplicar-migracoes";
import { chamar, criarEscritorio, sessaoDeDono, sessaoDeUsuario } from "./ajuda";

prepararBanco();

afterEach(() => vi.useRealTimers());

const NUMERO_CNJ = "0000001-78.2020.8.26.0100";
const lanc = (extra: object = {}) => ({ tipo: "receita", descricao: "Honorários iniciais", categoria: "Honorário", valor_centavos: 150000, vencimento: "2030-01-15", ...extra });

async function cenario() {
  const t = await criarEscritorio("escritorio");
  const socio = await sessaoDeUsuario(t, "socio");
  const adv = await sessaoDeUsuario(t, "advogado");
  return { t, socio, adv };
}

const liberar = (socioCookie: string, id: string, nivel: string) => chamar("PUT", `/api/equipe/${id}/permissoes/financeiro`, { cookie: socioCookie, corpo: { nivel } });

async function criar(cookie: string, extra: object = {}) {
  const r = await chamar("POST", "/api/financeiro", { cookie, corpo: lanc(extra) });
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  return r.json.lancamento.id as string;
}

async function criarCliente(cookie: string, nome = "Maria da Silva") {
  const r = await chamar("POST", "/api/clientes", { cookie, corpo: { tipo: "pf", nome } });
  expect(r.status).toBe(201);
  return r.json.cliente.id as string;
}

async function criarProcesso(cookie: string) {
  const r = await chamar("POST", "/api/processos", { cookie, corpo: { numero_cnj: NUMERO_CNJ, fase: "Conhecimento" } });
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  return r.json.processo.id as string;
}

const hoje = () => hojeEm("America/Sao_Paulo");
const somar = (data: string, dias: number) => new Date(Date.parse(`${data}T00:00:00Z`) + dias * 86400000).toISOString().slice(0, 10);

describe("permissões do financeiro", () => {
  it("sem acesso: 403 em todas as rotas; sem sessão: 401; dono da plataforma: 403", async () => {
    const { socio, adv } = await cenario();
    const id = await criar(socio.cookie);
    const chamadas: [string, string, unknown?][] = [
      ["GET", "/api/financeiro"],
      ["GET", "/api/financeiro/resumo"],
      ["GET", "/api/financeiro/categorias"],
      ["GET", `/api/financeiro/${id}`],
      ["POST", "/api/financeiro", lanc()],
      ["PUT", `/api/financeiro/${id}`, lanc()],
      ["POST", `/api/financeiro/${id}/pagar`, { pago_em: "2020-01-01" }],
      ["POST", `/api/financeiro/${id}/estornar`, {}],
      ["POST", `/api/financeiro/${id}/cancelar`, {}],
      ["POST", `/api/financeiro/${id}/reabrir`, {}],
      ["DELETE", `/api/financeiro/${id}`],
    ];
    for (const [m, u, corpo] of chamadas) {
      const r = await chamar(m, u, { cookie: adv.cookie, ...(corpo !== undefined ? { corpo } : {}) });
      expect(r.status, `${m} ${u}`).toBe(403);
      expect(r.json.erro).toMatch(/não tem acesso/);
      expect((await chamar(m, u, corpo !== undefined ? { corpo } : {})).status, `${m} ${u}`).toBe(401);
    }
    const dono = await sessaoDeDono();
    expect((await chamar("GET", "/api/financeiro", { cookie: dono.cookie })).status).toBe(403);
    // nada mudou
    expect((await chamar("GET", `/api/financeiro/${id}`, { cookie: socio.cookie })).json.lancamento.status).toBe("aberto");
  });

  it("leitura: só GET; edição escreve mas não apaga; sócio sempre passa e é o único que apaga", async () => {
    const { socio, adv } = await cenario();
    const id = await criar(socio.cookie);
    await liberar(socio.cookie, adv.id, "leitura");
    expect((await chamar("GET", "/api/financeiro", { cookie: adv.cookie })).status).toBe(200);
    expect((await chamar("GET", "/api/financeiro/resumo", { cookie: adv.cookie })).status).toBe(200);
    expect((await chamar("GET", "/api/financeiro/categorias", { cookie: adv.cookie })).status).toBe(200);
    expect((await chamar("GET", `/api/financeiro/${id}`, { cookie: adv.cookie })).status).toBe(200);
    for (const [m, u, corpo] of [
      ["POST", "/api/financeiro", lanc()],
      ["PUT", `/api/financeiro/${id}`, lanc()],
      ["POST", `/api/financeiro/${id}/pagar`, { pago_em: "2020-01-01" }],
      ["POST", `/api/financeiro/${id}/cancelar`, {}],
      ["DELETE", `/api/financeiro/${id}`, undefined],
    ] as [string, string, unknown][]) {
      const r = await chamar(m, u, { cookie: adv.cookie, ...(corpo !== undefined ? { corpo } : {}) });
      expect(r.status, `${m} ${u}`).toBe(403);
      expect(r.json.erro).toMatch(/apenas consultar/);
    }
    await liberar(socio.cookie, adv.id, "edicao");
    const novo = await criar(adv.cookie);
    expect((await chamar("PUT", `/api/financeiro/${novo}`, { cookie: adv.cookie, corpo: lanc({ descricao: "Outra" }) })).status).toBe(200);
    expect((await chamar("POST", `/api/financeiro/${novo}/pagar`, { cookie: adv.cookie, corpo: { pago_em: "2020-01-01" } })).status).toBe(200);
    expect((await chamar("POST", `/api/financeiro/${novo}/estornar`, { cookie: adv.cookie })).status).toBe(200);
    expect((await chamar("POST", `/api/financeiro/${novo}/cancelar`, { cookie: adv.cookie })).status).toBe(200);
    expect((await chamar("POST", `/api/financeiro/${novo}/reabrir`, { cookie: adv.cookie })).status).toBe(200);
    const negado = await chamar("DELETE", `/api/financeiro/${novo}`, { cookie: adv.cookie });
    expect(negado.status).toBe(403);
    expect(negado.json.erro).toMatch(/sócio/);
    expect((await chamar("GET", `/api/financeiro/${novo}`, { cookie: socio.cookie })).status).toBe(200);
    expect((await chamar("DELETE", `/api/financeiro/${novo}`, { cookie: socio.cookie })).status).toBe(200);
    expect((await chamar("GET", `/api/financeiro/${novo}`, { cookie: socio.cookie })).status).toBe(404);
  });

  it("permissão removida vale na requisição seguinte; sócio sem linha de permissão tem acesso total", async () => {
    const { socio, adv } = await cenario();
    await liberar(socio.cookie, adv.id, "edicao");
    expect((await chamar("POST", "/api/financeiro", { cookie: adv.cookie, corpo: lanc() })).status).toBe(201);
    await liberar(socio.cookie, adv.id, "leitura");
    expect((await chamar("POST", "/api/financeiro", { cookie: adv.cookie, corpo: lanc() })).status).toBe(403);
    expect((await chamar("GET", "/api/financeiro", { cookie: adv.cookie })).status).toBe(200);
    await liberar(socio.cookie, adv.id, "nenhum");
    expect((await chamar("GET", "/api/financeiro", { cookie: adv.cookie })).status).toBe(403);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM permissoes_usuario WHERE usuario_id = ?").bind(socio.id).first<{ n: number }>();
    expect(n?.n).toBe(0);
    expect((await chamar("GET", "/api/financeiro", { cookie: socio.cookie })).status).toBe(200);
  });
});

describe("isolamento entre escritórios", () => {
  it("lançamento de outro escritório: ler, alterar, pagar, estornar, cancelar e apagar dão 404; listas e resumo não vazam", async () => {
    const a = await cenario();
    const b = await cenario();
    const idB = await criar(b.socio.cookie, { descricao: "Segredo do B", valor_centavos: 777700 });
    for (const [m, u, corpo] of [
      ["GET", `/api/financeiro/${idB}`, undefined],
      ["PUT", `/api/financeiro/${idB}`, lanc()],
      ["POST", `/api/financeiro/${idB}/pagar`, { pago_em: "2020-01-01" }],
      ["POST", `/api/financeiro/${idB}/estornar`, {}],
      ["POST", `/api/financeiro/${idB}/cancelar`, {}],
      ["POST", `/api/financeiro/${idB}/reabrir`, {}],
      ["DELETE", `/api/financeiro/${idB}`, undefined],
    ] as [string, string, unknown][]) {
      const r = await chamar(m, u, { cookie: a.socio.cookie, ...(corpo !== undefined ? { corpo } : {}) });
      expect(r.status, `${m} ${u}`).toBe(404);
    }
    const lista = await chamar("GET", "/api/financeiro", { cookie: a.socio.cookie });
    expect(lista.json.total).toBe(0);
    expect(JSON.stringify((await chamar("GET", "/api/financeiro/resumo", { cookie: a.socio.cookie })).json)).not.toContain("777700");
    expect((await chamar("GET", "/api/financeiro/categorias", { cookie: a.socio.cookie })).json.categorias).toEqual([]);
    // intacto no escritório B
    const depois = await chamar("GET", `/api/financeiro/${idB}`, { cookie: b.socio.cookie });
    expect(depois.json.lancamento).toMatchObject({ status: "aberto", descricao: "Segredo do B" });
  });

  it("vincular cliente ou processo de outro escritório falha (404) e o banco também recusa", async () => {
    const a = await cenario();
    const b = await cenario();
    const clienteB = await criarCliente(b.socio.cookie);
    const processoB = await criarProcesso(b.socio.cookie);
    expect((await chamar("POST", "/api/financeiro", { cookie: a.socio.cookie, corpo: lanc({ cliente_id: clienteB }) })).status).toBe(404);
    expect((await chamar("POST", "/api/financeiro", { cookie: a.socio.cookie, corpo: lanc({ processo_id: processoB }) })).status).toBe(404);
    const idA = await criar(a.socio.cookie);
    expect((await chamar("PUT", `/api/financeiro/${idA}`, { cookie: a.socio.cookie, corpo: lanc({ cliente_id: clienteB }) })).status).toBe(404);
    expect((await chamar("PUT", `/api/financeiro/${idA}`, { cookie: a.socio.cookie, corpo: lanc({ processo_id: processoB }) })).status).toBe(404);
    // chave estrangeira composta: mesmo SQL direto não consegue ligar ao cliente/processo de outro escritório
    for (const coluna of ["cliente_id", "processo_id"]) {
      await expect(
        env.DB.prepare(
          `INSERT INTO lancamentos (id, tenant_id, tipo, descricao, descricao_busca, valor_centavos, vencimento, status, ${coluna}, criado_em, atualizado_em)
           VALUES (?, ?, 'receita', 'x', 'x', 100, '2030-01-01', 'aberto', ?, 'a', 'a')`,
        )
          .bind(crypto.randomUUID(), a.t, coluna === "cliente_id" ? clienteB : processoB)
          .run(),
      ).rejects.toThrow(/FOREIGN KEY/i);
    }
  });

  it("cliente e processo desativados não recebem lançamento novo (409), mas lançamento antigo continua editável", async () => {
    const { socio } = await cenario();
    const cliente = await criarCliente(socio.cookie);
    const processo = await criarProcesso(socio.cookie);
    const id = await criar(socio.cookie, { cliente_id: cliente, processo_id: processo });
    expect((await chamar("POST", `/api/clientes/${cliente}/situacao`, { cookie: socio.cookie, corpo: { ativo: false } })).status).toBe(200);
    expect((await chamar("POST", `/api/processos/${processo}/situacao`, { cookie: socio.cookie, corpo: { ativo: false } })).status).toBe(200);
    const r1 = await chamar("POST", "/api/financeiro", { cookie: socio.cookie, corpo: lanc({ cliente_id: cliente }) });
    expect(r1.status).toBe(409);
    expect(r1.json.erro).toMatch(/desativado/);
    expect((await chamar("POST", "/api/financeiro", { cookie: socio.cookie, corpo: lanc({ processo_id: processo }) })).status).toBe(409);
    // mantém os vínculos antigos ao editar outro campo
    const ed = await chamar("PUT", `/api/financeiro/${id}`, { cookie: socio.cookie, corpo: lanc({ cliente_id: cliente, processo_id: processo, descricao: "Editado" }) });
    expect(ed.status, JSON.stringify(ed.json)).toBe(200);
    expect(ed.json.lancamento).toMatchObject({ descricao: "Editado", cliente_nome: "Maria da Silva" });
    // mas não troca por outro desativado
    const outro = await criarCliente(socio.cookie, "Outro");
    await chamar("POST", `/api/clientes/${outro}/situacao`, { cookie: socio.cookie, corpo: { ativo: false } });
    expect((await chamar("PUT", `/api/financeiro/${id}`, { cookie: socio.cookie, corpo: lanc({ cliente_id: outro }) })).status).toBe(409);
  });
});

describe("validações", () => {
  it("recusa valor, datas e campos inválidos (400)", async () => {
    const { socio } = await cenario();
    const ruins: object[] = [
      lanc({ tipo: "honorario" }),
      lanc({ tipo: undefined }),
      lanc({ descricao: "" }),
      lanc({ descricao: "   " }),
      lanc({ descricao: "x".repeat(201) }),
      lanc({ categoria: "x".repeat(61) }),
      lanc({ valor_centavos: 0 }),
      lanc({ valor_centavos: -5 }),
      lanc({ valor_centavos: 10.5 }),
      lanc({ valor_centavos: "1000" }),
      lanc({ valor_centavos: null }),
      lanc({ valor_centavos: 100_000_000_000 }),
      lanc({ vencimento: undefined }),
      lanc({ vencimento: "2030-02-31" }),
      lanc({ vencimento: "15/01/2030" }),
      lanc({ vencimento: "1800-01-01" }),
      lanc({ observacoes: "x".repeat(2001) }),
      lanc({ observacoes: 5 }),
      lanc({ cliente_id: 5 }),
    ];
    for (const corpo of ruins) {
      const r = await chamar("POST", "/api/financeiro", { cookie: socio.cookie, corpo });
      expect(r.status, JSON.stringify(corpo)).toBe(400);
    }
    expect((await chamar("GET", "/api/financeiro", { cookie: socio.cookie })).json.total).toBe(0);
    expect(centavosValidos(1)).toBe(true);
    expect(centavosValidos(99_999_999_999)).toBe(true);
  });

  it("aceita lançamento mínimo, normaliza espaços e deixa categoria e vínculos vazios", async () => {
    const { socio } = await cenario();
    const r = await chamar("POST", "/api/financeiro", { cookie: socio.cookie, corpo: { tipo: "despesa", descricao: "  Custas   do   fórum ", valor_centavos: 1, vencimento: "2030-01-01" } });
    expect(r.status).toBe(201);
    expect(r.json.lancamento).toMatchObject({ tipo: "despesa", descricao: "Custas do fórum", categoria: null, valor_centavos: 1, status: "aberto", pago_em: null, cliente_id: null, processo_id: null });
    // tipo não muda na edição
    const ed = await chamar("PUT", `/api/financeiro/${r.json.lancamento.id}`, { cookie: socio.cookie, corpo: { tipo: "receita", descricao: "x", valor_centavos: 2, vencimento: "2030-01-02" } });
    expect(ed.json.lancamento.tipo).toBe("despesa");
  });

  it("pagamento: data obrigatória e válida, não pode ser futura, valor pago positivo", async () => {
    const { socio } = await cenario();
    const id = await criar(socio.cookie);
    const amanha = somar(hoje(), 1);
    for (const corpo of [{}, { pago_em: "2020-13-01" }, { pago_em: amanha }, { pago_em: "2030-01-01" }, { pago_em: "2020-01-01", valor_pago_centavos: 0 }, { pago_em: "2020-01-01", valor_pago_centavos: 10.5 }, { pago_em: "2020-01-01", valor_pago_centavos: "5" }]) {
      expect((await chamar("POST", `/api/financeiro/${id}/pagar`, { cookie: socio.cookie, corpo })).status, JSON.stringify(corpo)).toBe(400);
    }
    expect((await chamar("GET", `/api/financeiro/${id}`, { cookie: socio.cookie })).json.lancamento.status).toBe("aberto");
    expect((await chamar("POST", `/api/financeiro/${id}/pagar`, { cookie: socio.cookie, corpo: { pago_em: hoje() } })).status).toBe(200);
    expect(validarPagamento({ pago_em: "2020-01-01" }, "2020-01-01").ok).toBe(true);
    expect(validarPagamento({ pago_em: "2020-01-02" }, "2020-01-01").ok).toBe(false);
    expect(validarLancamento({}, true).ok).toBe(false);
  });

  it("filtros e parâmetros inválidos dão 400", async () => {
    const { socio } = await cenario();
    for (const q of ["tipo=x", "status=x", "ordem=x", "de=2020-02-31", "pago_ate=abc", "de=2030-02-01&ate=2030-01-01", "pago_de=2030-02-01&pago_ate=2030-01-01"]) {
      expect((await chamar("GET", `/api/financeiro?${q}`, { cookie: socio.cookie })).status, q).toBe(400);
    }
    expect((await chamar("GET", "/api/financeiro/resumo?de=2030-02-01&ate=2030-01-01", { cookie: socio.cookie })).status).toBe(400);
    expect((await chamar("GET", "/api/financeiro/resumo?de=x", { cookie: socio.cookie })).status).toBe(400);
  });
});

describe("transições e somente leitura", () => {
  it("aberto → pago → estornado → pago; valor pago padrão = valor; pagamento diferente do previsto", async () => {
    const { socio } = await cenario();
    const id = await criar(socio.cookie, { valor_centavos: 150000 });
    const p1 = await chamar("POST", `/api/financeiro/${id}/pagar`, { cookie: socio.cookie, corpo: { pago_em: "2020-03-10" } });
    expect(p1.json.lancamento).toMatchObject({ status: "pago", pago_em: "2020-03-10", valor_pago_centavos: 150000, valor_centavos: 150000 });
    // pagar de novo: 409
    expect((await chamar("POST", `/api/financeiro/${id}/pagar`, { cookie: socio.cookie, corpo: { pago_em: "2020-03-11" } })).status).toBe(409);
    const e = await chamar("POST", `/api/financeiro/${id}/estornar`, { cookie: socio.cookie });
    expect(e.json.lancamento).toMatchObject({ status: "aberto", pago_em: null, valor_pago_centavos: null });
    expect((await chamar("POST", `/api/financeiro/${id}/estornar`, { cookie: socio.cookie })).status).toBe(409);
    const p2 = await chamar("POST", `/api/financeiro/${id}/pagar`, { cookie: socio.cookie, corpo: { pago_em: "2020-03-12", valor_pago_centavos: 120000 } });
    expect(p2.json.lancamento).toMatchObject({ status: "pago", valor_centavos: 150000, valor_pago_centavos: 120000 });
  });

  it("cancelar só em aberto; reabrir só cancelado; pago precisa ser estornado antes", async () => {
    const { socio } = await cenario();
    const id = await criar(socio.cookie);
    expect((await chamar("POST", `/api/financeiro/${id}/reabrir`, { cookie: socio.cookie })).status).toBe(409);
    expect((await chamar("POST", `/api/financeiro/${id}/estornar`, { cookie: socio.cookie })).status).toBe(409);
    expect((await chamar("POST", `/api/financeiro/${id}/cancelar`, { cookie: socio.cookie })).json.lancamento.status).toBe("cancelado");
    expect((await chamar("POST", `/api/financeiro/${id}/cancelar`, { cookie: socio.cookie })).status).toBe(409);
    expect((await chamar("POST", `/api/financeiro/${id}/pagar`, { cookie: socio.cookie, corpo: { pago_em: "2020-01-01" } })).status).toBe(409);
    expect((await chamar("POST", `/api/financeiro/${id}/reabrir`, { cookie: socio.cookie })).json.lancamento.status).toBe("aberto");
    await chamar("POST", `/api/financeiro/${id}/pagar`, { cookie: socio.cookie, corpo: { pago_em: "2020-01-01" } });
    expect((await chamar("POST", `/api/financeiro/${id}/cancelar`, { cookie: socio.cookie })).status).toBe(409);
  });

  it("pago ou cancelado é somente leitura (editar dá 409); depois de estornar/reabrir volta a editar", async () => {
    const { socio } = await cenario();
    const id = await criar(socio.cookie);
    const editar = (extra: object = {}) => chamar("PUT", `/api/financeiro/${id}`, { cookie: socio.cookie, corpo: lanc({ descricao: "Novo texto", ...extra }) });
    await chamar("POST", `/api/financeiro/${id}/pagar`, { cookie: socio.cookie, corpo: { pago_em: "2020-01-01" } });
    const r = await editar();
    expect(r.status).toBe(409);
    expect(r.json.erro).toMatch(/Estorne/);
    await chamar("POST", `/api/financeiro/${id}/estornar`, { cookie: socio.cookie });
    expect((await editar({ valor_centavos: 999 })).json.lancamento).toMatchObject({ descricao: "Novo texto", valor_centavos: 999 });
    await chamar("POST", `/api/financeiro/${id}/cancelar`, { cookie: socio.cookie });
    expect((await editar()).status).toBe(409);
    await chamar("POST", `/api/financeiro/${id}/reabrir`, { cookie: socio.cookie });
    expect((await editar()).status).toBe(200);
  });

  it("o banco recusa estado incoerente (pago sem data; aberto com data de pagamento)", async () => {
    const { t, socio } = await cenario();
    const id = await criar(socio.cookie);
    await expect(env.DB.prepare("UPDATE lancamentos SET status = 'pago' WHERE id = ?").bind(id).run()).rejects.toThrow(/CHECK/i);
    await expect(env.DB.prepare("UPDATE lancamentos SET pago_em = '2020-01-01', valor_pago_centavos = 1 WHERE id = ?").bind(id).run()).rejects.toThrow(/CHECK/i);
    await expect(env.DB.prepare("UPDATE lancamentos SET valor_centavos = 0 WHERE id = ?").bind(id).run()).rejects.toThrow(/CHECK/i);
    expect(t).toBeTruthy();
  });
});

describe("lista, filtros e categorias", () => {
  it("filtra por tipo, situação, período, cliente, processo, categoria e busca (sem acento); ordena por vencimento; pagina", async () => {
    const { socio } = await cenario();
    const cliente = await criarCliente(socio.cookie);
    const processo = await criarProcesso(socio.cookie);
    const a = await criar(socio.cookie, { descricao: "Honorários de êxito", categoria: "Êxito", vencimento: "2030-03-10", cliente_id: cliente, processo_id: processo });
    const b = await criar(socio.cookie, { descricao: "Custas", tipo: "despesa", categoria: "Custas", vencimento: "2030-01-10" });
    const c = await criar(socio.cookie, { descricao: "Consulta", vencimento: "2030-02-10", categoria: null });
    await chamar("POST", `/api/financeiro/${c}/pagar`, { cookie: socio.cookie, corpo: { pago_em: "2020-05-05" } });
    const ids = async (q: string) => (await chamar("GET", `/api/financeiro?${q}`, { cookie: socio.cookie })).json.lancamentos.map((l: any) => l.id);
    expect(await ids("")).toEqual([b, c, a]);
    expect(await ids("ordem=vencimento_desc")).toEqual([a, c, b]);
    expect(await ids("tipo=despesa")).toEqual([b]);
    expect(await ids("status=pago")).toEqual([c]);
    expect(await ids("status=aberto")).toEqual([b, a]);
    expect(await ids("de=2030-02-01&ate=2030-03-31")).toEqual([c, a]);
    expect(await ids(`cliente_id=${cliente}`)).toEqual([a]);
    expect(await ids(`processo_id=${processo}`)).toEqual([a]);
    expect(await ids("categoria=Custas")).toEqual([b]);
    expect(await ids("busca=exito")).toEqual([a]);
    expect(await ids("busca=HONORARIOS")).toEqual([a]);
    expect(await ids("busca=100%25")).toEqual([]);
    expect(await ids("pago_de=2020-05-01&pago_ate=2020-05-31")).toEqual([c]);
    expect(await ids("status=pago&ordem=pago_em_desc")).toEqual([c]);
    const pag = await chamar("GET", "/api/financeiro?por_pagina=2&pagina=2", { cookie: socio.cookie });
    expect(pag.json).toMatchObject({ total: 3, pagina: 2, por_pagina: 2 });
    expect(pag.json.lancamentos.map((l: any) => l.id)).toEqual([a]);
    const item = (await chamar("GET", `/api/financeiro/${a}`, { cookie: socio.cookie })).json.lancamento;
    expect(item).toMatchObject({ cliente_nome: "Maria da Silva", processo_numero: "00000017820208260100" });
    expect((await chamar("GET", "/api/financeiro/categorias", { cookie: socio.cookie })).json.categorias).toEqual(["Custas", "Êxito"]);
  });

  it("vencido é calculado: em aberto e vencimento antes de hoje", async () => {
    const { socio } = await cenario();
    const ontem = await criar(socio.cookie, { vencimento: somar(hoje(), -1) });
    const hojeId = await criar(socio.cookie, { vencimento: hoje() });
    const pagoAntigo = await criar(socio.cookie, { vencimento: "2020-01-01" });
    await chamar("POST", `/api/financeiro/${pagoAntigo}/pagar`, { cookie: socio.cookie, corpo: { pago_em: "2020-01-02" } });
    const venc = await chamar("GET", "/api/financeiro?status=vencido", { cookie: socio.cookie });
    expect(venc.json.lancamentos.map((l: any) => l.id)).toEqual([ontem]);
    expect(venc.json.lancamentos[0]).toMatchObject({ vencido: true, situacao: "vencido", dias_atraso: 1, status: "aberto" });
    const h = (await chamar("GET", `/api/financeiro/${hojeId}`, { cookie: socio.cookie })).json.lancamento;
    expect(h).toMatchObject({ vencido: false, situacao: "aberto", dias_atraso: 0 });
    expect((await chamar("GET", `/api/financeiro/${pagoAntigo}`, { cookie: socio.cookie })).json.lancamento).toMatchObject({ vencido: false, situacao: "pago" });
  });
});

describe("resumo e série mensal (centavos)", () => {
  it("calcula a receber, vencido, a pagar, recebido, pago, saldo do período e acumulado", async () => {
    const { socio } = await cenario();
    const d = hoje();
    // abertos
    await criar(socio.cookie, { valor_centavos: 10001, vencimento: somar(d, 5) }); // a receber
    await criar(socio.cookie, { valor_centavos: 20002, vencimento: somar(d, -3) }); // a receber vencido
    await criar(socio.cookie, { tipo: "despesa", valor_centavos: 3003, vencimento: somar(d, 2) }); // a pagar
    await criar(socio.cookie, { tipo: "despesa", valor_centavos: 4004, vencimento: somar(d, -1) }); // a pagar vencido
    const cancelado = await criar(socio.cookie, { valor_centavos: 999999 });
    await chamar("POST", `/api/financeiro/${cancelado}/cancelar`, { cookie: socio.cookie });
    // pagos
    const pagar = async (extra: object, pagoEm: string, valorPago?: number) => {
      const id = await criar(socio.cookie, extra);
      const r = await chamar("POST", `/api/financeiro/${id}/pagar`, { cookie: socio.cookie, corpo: { pago_em: pagoEm, ...(valorPago ? { valor_pago_centavos: valorPago } : {}) } });
      expect(r.status).toBe(200);
    };
    await pagar({ valor_centavos: 100000 }, "2025-02-10"); // recebido em fev/2025
    await pagar({ valor_centavos: 50000 }, "2025-02-20", 45050); // recebido com valor diferente
    await pagar({ tipo: "despesa", valor_centavos: 30000 }, "2025-02-15"); // pago em fev/2025
    await pagar({ valor_centavos: 70000 }, "2025-03-01"); // recebido em mar/2025
    await pagar({ tipo: "despesa", valor_centavos: 12345 }, "2025-03-02"); // pago em mar/2025
    const r = await chamar("GET", "/api/financeiro/resumo?de=2025-02-01&ate=2025-02-28", { cookie: socio.cookie });
    expect(r.status).toBe(200);
    expect(r.json.periodo).toEqual({ de: "2025-02-01", ate: "2025-02-28" });
    expect(r.json.resumo).toEqual({
      a_receber_centavos: 30003,
      a_receber_qtd: 2,
      vencido_receber_centavos: 20002,
      vencido_receber_qtd: 1,
      a_pagar_centavos: 7007,
      a_pagar_qtd: 2,
      vencido_pagar_centavos: 4004,
      vencido_pagar_qtd: 1,
      recebido_periodo_centavos: 145050,
      pago_periodo_centavos: 30000,
      saldo_periodo_centavos: 115050,
      // acumulado até 28/02/2025: 145050 − 30000 (março fica de fora)
      saldo_acumulado_centavos: 115050,
    });
    const todo = await chamar("GET", "/api/financeiro/resumo?de=2025-02-01&ate=2025-03-31", { cookie: socio.cookie });
    expect(todo.json.resumo).toMatchObject({ recebido_periodo_centavos: 215050, pago_periodo_centavos: 42345, saldo_periodo_centavos: 172705, saldo_acumulado_centavos: 172705 });
    // período sem movimento: saldo do período zero, acumulado continua valendo
    const vazio = await chamar("GET", "/api/financeiro/resumo?de=2025-06-01&ate=2025-06-30", { cookie: socio.cookie });
    expect(vazio.json.resumo).toMatchObject({ recebido_periodo_centavos: 0, pago_periodo_centavos: 0, saldo_periodo_centavos: 0, saldo_acumulado_centavos: 172705 });
    // padrão: mês atual
    const padrao = await chamar("GET", "/api/financeiro/resumo", { cookie: socio.cookie });
    expect(padrao.json.periodo).toEqual({ de: primeiroDiaDoMes(d), ate: ultimoDiaDoMes(d) });
  });

  it("série dos últimos 6 meses (recebido × pago) com zeros nos meses sem movimento", async () => {
    const { socio } = await cenario();
    const d = hoje();
    const meses = ultimosMeses(d, 6);
    expect(meses).toHaveLength(6);
    expect(meses[5]).toBe(mesDe(d));
    const pagar = async (extra: object, pagoEm: string) => {
      const id = await criar(socio.cookie, extra);
      await chamar("POST", `/api/financeiro/${id}/pagar`, { cookie: socio.cookie, corpo: { pago_em: pagoEm } });
    };
    await pagar({ valor_centavos: 12345 }, `${meses[0]}-01`);
    await pagar({ valor_centavos: 55 }, `${meses[0]}-01`);
    await pagar({ tipo: "despesa", valor_centavos: 999 }, ultimoDiaDoMes(`${meses[0]}-01`));
    await pagar({ valor_centavos: 100 }, d);
    await pagar({ valor_centavos: 777 }, `${somar(`${meses[0]}-01`, -1)}`); // antes da janela: fora da série
    const r = await chamar("GET", "/api/financeiro/resumo", { cookie: socio.cookie });
    expect(r.json.serie_mensal).toEqual([
      { mes: meses[0], recebido_centavos: 12400, pago_centavos: 999 },
      { mes: meses[1], recebido_centavos: 0, pago_centavos: 0 },
      { mes: meses[2], recebido_centavos: 0, pago_centavos: 0 },
      { mes: meses[3], recebido_centavos: 0, pago_centavos: 0 },
      { mes: meses[4], recebido_centavos: 0, pago_centavos: 0 },
      { mes: meses[5], recebido_centavos: 100, pago_centavos: 0 },
    ]);
  });

  it("'vencido' e 'hoje' seguem o dia de São Paulo perto da meia-noite UTC", async () => {
    // 28/10/2026 01:30 UTC = 27/10/2026 22:30 em São Paulo (UTC-3): ainda é dia 27.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-28T01:30:00Z"));
    const { socio } = await cenario();
    const venceHoje = await criar(socio.cookie, { vencimento: "2026-10-27" });
    const venceOntem = await criar(socio.cookie, { vencimento: "2026-10-26", valor_centavos: 20000 });
    const venceAmanha = await criar(socio.cookie, { vencimento: "2026-10-28" });
    const venc = await chamar("GET", "/api/financeiro?status=vencido", { cookie: socio.cookie });
    expect(venc.json.hoje).toBe("2026-10-27");
    expect(venc.json.lancamentos.map((l: any) => l.id)).toEqual([venceOntem]);
    for (const id of [venceHoje, venceAmanha]) expect((await chamar("GET", `/api/financeiro/${id}`, { cookie: socio.cookie })).json.lancamento.vencido).toBe(false);
    const resumo = await chamar("GET", "/api/financeiro/resumo", { cookie: socio.cookie });
    expect(resumo.json.hoje).toBe("2026-10-27");
    expect(resumo.json.resumo).toMatchObject({ vencido_receber_centavos: 20000, vencido_receber_qtd: 1 });
    expect(resumo.json.periodo).toEqual({ de: "2026-10-01", ate: "2026-10-31" });
    // pagamento "hoje" em São Paulo (27) é aceito; o dia 28 (já é 28 em UTC) ainda é futuro para o escritório
    expect((await chamar("POST", `/api/financeiro/${venceHoje}/pagar`, { cookie: socio.cookie, corpo: { pago_em: "2026-10-28" } })).status).toBe(400);
    expect((await chamar("POST", `/api/financeiro/${venceHoje}/pagar`, { cookie: socio.cookie, corpo: { pago_em: "2026-10-27" } })).status).toBe(200);
    // três horas depois já é dia 28 em São Paulo: o de ontem passa a 2 dias de atraso e o que vence dia 27 também vence
    vi.setSystemTime(new Date("2026-10-28T03:00:00Z"));
    const depois = await chamar("GET", "/api/financeiro?status=vencido", { cookie: socio.cookie });
    expect(depois.json.hoje).toBe("2026-10-28");
    expect(depois.json.lancamentos.map((l: any) => l.id)).toEqual([venceOntem]);
    expect(depois.json.lancamentos[0].dias_atraso).toBe(2);
  });
});

describe("auditoria sem dados financeiros", () => {
  it("registra criar, editar, pagar, estornar, cancelar, reabrir e apagar só com ids e situação", async () => {
    const { t, socio } = await cenario();
    const cliente = await criarCliente(socio.cookie);
    const id = await criar(socio.cookie, { descricao: "Descricao-Secreta-XYZ", categoria: "Categoria-Secreta", valor_centavos: 987654, observacoes: "Obs-Secreta", cliente_id: cliente });
    await chamar("PUT", `/api/financeiro/${id}`, { cookie: socio.cookie, corpo: lanc({ descricao: "Descricao-Secreta-ABC", valor_centavos: 987655, cliente_id: cliente }) });
    await chamar("POST", `/api/financeiro/${id}/pagar`, { cookie: socio.cookie, corpo: { pago_em: "2020-02-02", valor_pago_centavos: 987656 } });
    await chamar("POST", `/api/financeiro/${id}/estornar`, { cookie: socio.cookie });
    await chamar("POST", `/api/financeiro/${id}/cancelar`, { cookie: socio.cookie });
    await chamar("POST", `/api/financeiro/${id}/reabrir`, { cookie: socio.cookie });
    await chamar("DELETE", `/api/financeiro/${id}`, { cookie: socio.cookie });
    const log = await env.DB.prepare("SELECT acao, entidade_id, detalhes FROM audit_log WHERE tenant_id = ? AND entidade = 'lancamentos' ORDER BY criado_em, rowid").bind(t).all<{ acao: string; entidade_id: string; detalhes: string | null }>();
    expect(log.results.map((l) => l.acao)).toEqual(["lancamento_criado", "lancamento_alterado", "lancamento_pago", "lancamento_estornado", "lancamento_cancelado", "lancamento_reaberto", "lancamento_apagado"]);
    expect(log.results.every((l) => l.entidade_id === id)).toBe(true);
    const bruto = JSON.stringify(log.results);
    for (const proibido of ["Secret", "Descricao", "987654", "987655", "987656", "2020-02-02", "Obs", cliente]) expect(bruto).not.toContain(proibido);
    expect(JSON.parse(log.results[2]!.detalhes!)).toEqual({ status_de: "aberto", status_para: "pago" });
    expect(JSON.parse(log.results[6]!.detalhes!)).toEqual({ status_de: "aberto" });
    expect(JSON.parse(log.results[1]!.detalhes!).campos).toBe("descricao,categoria,valor_centavos,observacoes");
  });
});

describe("períodos (calendário civil)", () => {
  it("primeiro e último dia do mês, inclusive fevereiro bissexto e virada de ano", () => {
    expect(primeiroDiaDoMes("2026-10-27")).toBe("2026-10-01");
    expect(ultimoDiaDoMes("2026-10-27")).toBe("2026-10-31");
    expect(ultimoDiaDoMes("2024-02-10")).toBe("2024-02-29");
    expect(ultimoDiaDoMes("2025-02-10")).toBe("2025-02-28");
    expect(ultimoDiaDoMes("2025-12-01")).toBe("2025-12-31");
    expect(ultimosMeses("2026-02-15", 6)).toEqual(["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(ultimosMeses("2026-10-27", 1)).toEqual(["2026-10"]);
  });
});
