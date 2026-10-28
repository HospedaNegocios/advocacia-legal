import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import { criarRepositorio } from "../src/server/db/repositorio";
import { atualizarAgora, coletaDiariaDatajud, executarRodadaDatajud, INTERVALO_MANUAL_MS, MAX_REQUISICOES_CRON, ORCAMENTO_CRON_MS, RECENTE_CRON_MS } from "../src/server/datajud/atualizacao";
import { datajudAtivo, definirDepsDatajudParaTeste } from "../src/server/datajud/ambiente";
import type { ClienteDatajud, RespostaDatajud } from "../src/server/datajud/cliente";
import { lerHits, normalizarDataHora, textoDosComplementos } from "../src/server/datajud/formato";
import { aliasDoTribunal } from "../src/server/datajud/tribunal";
import { prepararBanco } from "./aplicar-migracoes";
import { chamar, criarEscritorio, sessaoDeUsuario } from "./ajuda";
import { relogioFalso } from "./djen-ajuda";

prepararBanco();
afterEach(() => definirDepsDatajudParaTeste(null));

// A rede NUNCA é chamada: o cliente é simulado e o relógio é falso.
function clienteSimulado(relogio: { agora(): number }, responder: (alias: string, numero: string, n: number) => RespostaDatajud) {
  const chamadas: { alias: string; numero: string; em: number }[] = [];
  const cliente: ClienteDatajud = {
    async consultar(alias, numero) {
      chamadas.push({ alias, numero, em: relogio.agora() });
      return responder(alias, numero, chamadas.length);
    },
  };
  return Object.assign(cliente, { chamadas });
}

const ok = (hits: unknown[]): RespostaDatajud => ({ tipo: "ok", status: 200, hits });
const hit = (numero: string, extra: Record<string, unknown> = {}) => ({
  _source: {
    numeroProcesso: numero,
    tribunal: "TJSP",
    grau: "G1",
    dataHoraUltimaAtualizacao: "2026-10-20T10:00:00.000Z",
    classe: { codigo: 7, nome: "Procedimento Comum Cível" },
    orgaoJulgador: { codigo: 1, nome: "1ª Vara Cível" },
    movimentos: [
      { codigo: 26, nome: "Distribuição", dataHora: "2026-01-10T09:00:00.000Z", complementosTabelados: [{ codigo: 1, valor: 2, nome: "tipo_de_distribuicao_redistribuicao", descricao: "sorteio" }], orgaoJulgador: { codigoOrgao: 1, nomeOrgao: "1ª Vara Cível" } },
      { codigo: 193, nome: "Juntada", dataHora: "2026-02-11T09:00:00.000Z" },
    ],
    ...extra,
  },
});

const NUMERO_SP = "00000017820208260100";
let seq = 0;
/** Número de 20 dígitos único (o banco não confere o dígito verificador). */
const numeroUnico = (sufixo = "8260100") => `${String(1000000 + ++seq).padStart(7, "0")}002020${sufixo}`.slice(0, 20);

async function novoProcesso(tenantId: string, numero = numeroUnico(), ativo = 1) {
  const id = await criarRepositorio(env.DB, tenantId).processos.inserir({ numero_cnj: numero, fase: "Conhecimento", ativo });
  return { id, numero };
}

describe("tribunal: apelido a partir do número CNJ", () => {
  const casos: [string, string | null][] = [
    ["00000017820208260100", "tjsp"],
    ["00000017820208190001", "tjrj"],
    ["00000017820208070001", "tjdft"],
    ["00000017820208270001", "tjto"],
    ["00000017820208010001", "tjac"],
    ["00000017820208280001", null],
    ["00000017820208000001", null],
    ["00000017820204030001", "trf3"],
    ["00000017820204060001", "trf6"],
    ["00000017820204070001", null],
    ["00000017820205020001", "trt2"],
    ["00000017820205240001", "trt24"],
    ["00000017820205250001", null],
    ["00000017820205000001", "tst"],
    ["00000017820206000001", "tse"],
    ["00000017820206010001", "tre-ac"],
    ["00000017820206070001", "tre-df"],
    ["00000017820206260001", "tre-sp"],
    ["00000017820203000001", "stj"],
    ["00000017820207000001", "stm"],
    ["00000017820209130001", "tjmmg"],
    ["00000017820209210001", "tjmrs"],
    ["00000017820209260001", "tjmsp"],
    ["00000017820209010001", null],
    ["00000017820201000001", null],
    ["00000017820202000001", null],
    ["123", null],
    ["0000001782020826010x", null],
  ];
  for (const [numero, esperado] of casos) it(`${numero} -> ${esperado ?? "não coberto"}`, () => expect(aliasDoTribunal(numero)).toBe(esperado));
});

describe("formato: leitura tolerante dos hits", () => {
  it("lê um hit completo", async () => {
    const r = await lerHits([hit(NUMERO_SP)], NUMERO_SP);
    expect(r).toMatchObject({ hits_lidos: 1, classe: "Procedimento Comum Cível", orgao: "1ª Vara Cível", grau: "G1", ultima_atualizacao_fonte: "2026-10-20T10:00:00.000Z" });
    expect(r.movimentos).toHaveLength(2);
    expect(r.movimentos[0]).toMatchObject({ codigo: "26", nome: "Distribuição", orgao: "1ª Vara Cível", grau: "G1", complementos: "tipo_de_distribuicao_redistribuicao: sorteio" });
    expect(r.movimentos[1]).toMatchObject({ codigo: "193", complementos: null, orgao: null });
  });

  it("ignora campos ausentes, tipos errados e hits sem _source", async () => {
    const r = await lerHits(
      [null, "texto", 7, {}, { _source: null }, { _source: [] }, { _source: { movimentos: "nada", classe: 5, orgaoJulgador: "x", grau: { a: 1 } } }, { _source: { movimentos: [null, 3, {}, { nome: { x: 1 } }, { nome: "Ok" }] } }],
      NUMERO_SP,
    );
    expect(r.hits_lidos).toBe(2);
    expect(r.classe).toBeNull();
    expect(r.movimentos.map((m) => m.nome)).toEqual(["Ok"]);
  });

  it("junta os movimentos de vários hits e não repete o mesmo movimento", async () => {
    const g2 = hit(NUMERO_SP, { grau: "G2", dataHoraUltimaAtualizacao: "2026-10-25T10:00:00.000Z", orgaoJulgador: { nome: "Câmara" } });
    const r = await lerHits([hit(NUMERO_SP), g2, hit(NUMERO_SP)], NUMERO_SP);
    // 2 movimentos do G1 (o terceiro hit repete os mesmos) + 2 do G2 (grau diferente = chave diferente).
    expect(r.movimentos).toHaveLength(4);
    expect(new Set(r.movimentos.map((m) => m.chave)).size).toBe(4);
    // O cabeçalho vem do hit atualizado mais recentemente.
    expect(r).toMatchObject({ grau: "G2", orgao: "Câmara", ultima_atualizacao_fonte: "2026-10-25T10:00:00.000Z" });
  });

  it("a chave é estável e hits de OUTRO número de processo são ignorados", async () => {
    const a = await lerHits([hit(NUMERO_SP)], NUMERO_SP);
    const b = await lerHits([hit("0000001-78.2020.8.26.0100")], NUMERO_SP);
    expect(b.movimentos.map((m) => m.chave)).toEqual(a.movimentos.map((m) => m.chave));
    const outro = await lerHits([hit("99999999999999999999")], NUMERO_SP);
    expect(outro.hits_lidos).toBe(0);
  });

  it("normaliza datas e complementos", () => {
    expect(normalizarDataHora("20230510143000")).toBe("2023-05-10T14:30:00");
    expect(normalizarDataHora("2023-05-10T14:30:00.000Z")).toBe("2023-05-10T14:30:00.000Z");
    expect(normalizarDataHora("ontem")).toBeNull();
    expect(normalizarDataHora(123)).toBeNull();
    expect(textoDosComplementos([{ nome: "A", descricao: "b" }, { valor: 3 }, { nome: "só nome" }, 5, null])).toBe("A: b; 3; só nome");
    expect(textoDosComplementos("x")).toBeNull();
    expect(textoDosComplementos([])).toBeNull();
  });
});

describe("atualização de um processo", () => {
  it("insere os movimentos, não duplica na segunda vez e guarda a situação", async () => {
    const t = await criarEscritorio("escritorio");
    const p = await novoProcesso(t);
    const relogio = relogioFalso();
    const cliente = clienteSimulado(relogio, (_a, n) => ok([hit(n)]));
    const deps = { db: env.DB, cliente, relogio };
    const r1 = await atualizarAgora(deps, t, p.id, p.numero);
    expect(r1).toMatchObject({ resultado: "ok", novos: 2 });
    expect(cliente.chamadas[0]).toMatchObject({ alias: "tjsp", numero: p.numero });
    const r2 = await atualizarAgora(deps, t, p.id, p.numero);
    expect(r2).toMatchObject({ resultado: "ok", novos: 0 });
    const repo = criarRepositorio(env.DB, t);
    expect((await repo.datajud.movimentosDoProcesso(p.id)).total).toBe(2);
    const c = await repo.datajud.buscarConsulta(p.id);
    expect(c).toMatchObject({ resultado: "ok", status_http: 200, alias: "tjsp", total_movimentos: 2, classe: "Procedimento Comum Cível", grau: "G1" });
  });

  it("nao_encontrado (lista vazia) não apaga o que já foi guardado", async () => {
    const t = await criarEscritorio("escritorio");
    const p = await novoProcesso(t);
    const relogio = relogioFalso();
    let vazio = false;
    const cliente = clienteSimulado(relogio, (_a, n) => ok(vazio ? [] : [hit(n)]));
    const deps = { db: env.DB, cliente, relogio };
    await atualizarAgora(deps, t, p.id, p.numero);
    vazio = true;
    expect(await atualizarAgora(deps, t, p.id, p.numero)).toMatchObject({ resultado: "nao_encontrado", novos: 0 });
    const repo = criarRepositorio(env.DB, t);
    expect(await repo.datajud.buscarConsulta(p.id)).toMatchObject({ resultado: "nao_encontrado", total_movimentos: 2, classe: "Procedimento Comum Cível" });
  });

  it("tribunal não coberto: não chama a rede", async () => {
    const t = await criarEscritorio("escritorio");
    const p = await novoProcesso(t, numeroUnico("1000001"));
    const relogio = relogioFalso();
    const cliente = clienteSimulado(relogio, () => ok([]));
    expect(await atualizarAgora({ db: env.DB, cliente, relogio }, t, p.id, p.numero)).toMatchObject({ resultado: "sem_tribunal" });
    expect(cliente.chamadas).toHaveLength(0);
    expect((await criarRepositorio(env.DB, t).datajud.buscarConsulta(p.id))?.resultado).toBe("sem_tribunal");
  });

  it("hits ilegíveis viram erro; 5xx é repetido com espera crescente", async () => {
    const t = await criarEscritorio("escritorio");
    const p = await novoProcesso(t);
    const relogio = relogioFalso();
    const ilegivel = clienteSimulado(relogio, () => ok([1, "x"]));
    expect(await atualizarAgora({ db: env.DB, cliente: ilegivel, relogio }, t, p.id, p.numero)).toMatchObject({ resultado: "erro" });

    const q = await novoProcesso(t);
    const falha = clienteSimulado(relogio, () => ({ tipo: "erro", status: 503, motivo: "servidor" }));
    const rodada = await executarRodadaDatajud({ db: env.DB, cliente: falha, relogio }, [{ tenant_id: t, processo_id: q.id, numero_cnj: q.numero }], { orcamentoMs: ORCAMENTO_CRON_MS, maxRequisicoes: 300 });
    expect(rodada).toMatchObject({ erro: 1, requisicoes: 3 });
    expect(relogio.dormidos).toEqual(expect.arrayContaining([2000, 4000]));
    for (let i = 1; i < falha.chamadas.length; i++) expect(falha.chamadas[i]!.em - falha.chamadas[i - 1]!.em).toBeGreaterThanOrEqual(1000);
  });

  it("erro 400 não é repetido", async () => {
    const t = await criarEscritorio("escritorio");
    const p = await novoProcesso(t);
    const relogio = relogioFalso();
    const cliente = clienteSimulado(relogio, () => ({ tipo: "erro", status: 400, motivo: "recusada" }));
    await atualizarAgora({ db: env.DB, cliente, relogio }, t, p.id, p.numero);
    expect(cliente.chamadas).toHaveLength(1);
  });
});

describe("rodada: bloqueio, orçamento e Cron", () => {
  it("bloqueio para a rodada inteira", async () => {
    const t = await criarEscritorio("escritorio");
    const a = await novoProcesso(t);
    const b = await novoProcesso(t);
    const c = await novoProcesso(t);
    const relogio = relogioFalso();
    const cliente = clienteSimulado(relogio, (_al, _n, n) => (n === 1 ? ok([hit(a.numero)]) : { tipo: "bloqueado", status: 403, motivo: "recusado" }));
    const alvos = [a, b, c].map((p) => ({ tenant_id: t, processo_id: p.id, numero_cnj: p.numero }));
    const r = await executarRodadaDatajud({ db: env.DB, cliente, relogio }, alvos, { orcamentoMs: ORCAMENTO_CRON_MS, maxRequisicoes: 300 });
    expect(r).toMatchObject({ ok: 1, bloqueado: true, adiados: 1, requisicoes: 2 });
    expect(cliente.chamadas).toHaveLength(2);
    const repo = criarRepositorio(env.DB, t);
    expect((await repo.datajud.buscarConsulta(b.id))?.resultado).toBe("bloqueado");
    expect(await repo.datajud.buscarConsulta(c.id)).toBeNull();
  });

  it("respeita o limite de requisições", async () => {
    const t = await criarEscritorio("escritorio");
    const ps = [await novoProcesso(t), await novoProcesso(t), await novoProcesso(t)];
    const relogio = relogioFalso();
    const cliente = clienteSimulado(relogio, (_a, n) => ok([hit(n)]));
    const r = await executarRodadaDatajud({ db: env.DB, cliente, relogio }, ps.map((p) => ({ tenant_id: t, processo_id: p.id, numero_cnj: p.numero })), { orcamentoMs: ORCAMENTO_CRON_MS, maxRequisicoes: 2 });
    expect(r).toMatchObject({ ok: 2, adiados: 1 });
  });

  it("Cron: só processos ativos de escritórios em operação, nunca consultados primeiro, e pula quem foi consultado há menos de 20 h", async () => {
    const t = await criarEscritorio("escritorio");
    const suspenso = await criarEscritorio("escritorio");
    await env.DB.prepare("UPDATE tenants SET status = 'suspenso' WHERE id = ?").bind(suspenso).run();
    const nunca = await novoProcesso(t);
    const antigo = await novoProcesso(t);
    const recente = await novoProcesso(t);
    const inativo = await novoProcesso(t, numeroUnico(), 0);
    const doSuspenso = await novoProcesso(suspenso);
    const relogio = relogioFalso();
    const repo = criarRepositorio(env.DB, t);
    const antes = (ms: number) => new Date(relogio.agora() - ms).toISOString();
    await repo.datajud.registrarConsulta(antigo.id, { consultado_em: antes(RECENTE_CRON_MS + 60_000), resultado: "ok", status_http: 200, alias: "tjsp" });
    await repo.datajud.registrarConsulta(recente.id, { consultado_em: antes(RECENTE_CRON_MS - 60_000), resultado: "ok", status_http: 200, alias: "tjsp" });
    const cliente = clienteSimulado(relogio, (_a, n) => ok([hit(n)]));
    const r = await coletaDiariaDatajud({ db: env.DB, cliente, relogio });
    const meus = cliente.chamadas.filter((c) => [nunca, antigo, recente, inativo, doSuspenso].some((p) => p.numero === c.numero)).map((c) => c.numero);
    // Primeiro o nunca consultado, depois o mais antigo.
    expect(meus).toEqual([nunca.numero, antigo.numero]);
    expect(r.requisicoes).toBe(cliente.chamadas.length);
    expect(r.requisicoes).toBeLessThanOrEqual(MAX_REQUISICOES_CRON);
    expect((await criarRepositorio(env.DB, suspenso).datajud.buscarConsulta(doSuspenso.id))).toBeNull();
    expect(await repo.datajud.buscarConsulta(inativo.id)).toBeNull();
  });
});

describe("ambiente", () => {
  it("só liga com DATAJUD_ATIVO=true e chave", () => {
    expect(datajudAtivo({})).toBe(false);
    expect(datajudAtivo({ DATAJUD_ATIVO: "true" })).toBe(false);
    expect(datajudAtivo({ DATAJUD_ATIVO: "true", DATAJUD_CHAVE: "  " })).toBe(false);
    expect(datajudAtivo({ DATAJUD_ATIVO: "false", DATAJUD_CHAVE: "x" })).toBe(false);
    expect(datajudAtivo({ DATAJUD_ATIVO: "TRUE", DATAJUD_CHAVE: "x" })).toBe(false);
    expect(datajudAtivo({ DATAJUD_ATIVO: "true", DATAJUD_CHAVE: "x" })).toBe(true);
  });
});

describe("rotas /api/processos/:id/datajud", () => {
  async function cenario() {
    const t = await criarEscritorio("escritorio");
    const socio = await sessaoDeUsuario(t, "socio");
    const p = await novoProcesso(t);
    return { t, socio, p };
  }

  it("desligado: GET diz que não está disponível, POST responde 404 e /api/eu informa", async () => {
    const { socio, p } = await cenario();
    const g = await chamar("GET", `/api/processos/${p.id}/datajud`, { cookie: socio.cookie });
    expect(g.status).toBe(200);
    expect(g.json).toMatchObject({ ok: true, disponivel: false, movimentos: [] });
    const post = await chamar("POST", `/api/processos/${p.id}/datajud/atualizar`, { cookie: socio.cookie });
    expect(post.status).toBe(404);
    expect(post.json.erro).toContain("não está disponível");
    expect((await chamar("GET", "/api/eu", { cookie: socio.cookie })).json.recursos.datajud).toBe(false);
  });

  it("exige login", async () => {
    const { p } = await cenario();
    expect((await chamar("GET", `/api/processos/${p.id}/datajud`)).status).toBe(401);
    expect((await chamar("POST", `/api/processos/${p.id}/datajud/atualizar`)).status).toBe(401);
  });

  it("ligado: qualquer perfil atualiza, lista paginada e auditoria sem conteúdo", async () => {
    const { t, p } = await cenario();
    const relogio = relogioFalso();
    const cliente = clienteSimulado(relogio, (_a, n) => ok([hit(n, { movimentos: Array.from({ length: 25 }, (_x, i) => ({ codigo: i + 1, nome: `CONTEUDO-SECRETO-${i}`, dataHora: `2026-03-${String(i + 1).padStart(2, "0")}T10:00:00.000Z` })) })]));
    definirDepsDatajudParaTeste({ cliente, relogio });
    const u = await sessaoDeUsuario(t, "estagiario");
    expect((await chamar("GET", "/api/eu", { cookie: u.cookie })).json.recursos.datajud).toBe(true);
    const vazio = await chamar("GET", `/api/processos/${p.id}/datajud`, { cookie: u.cookie });
    expect(vazio.json).toMatchObject({ disponivel: true, consulta: null, total: 0 });
    const r = await chamar("POST", `/api/processos/${p.id}/datajud/atualizar`, { cookie: u.cookie });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json).toMatchObject({ resultado: "ok", novos: 25, total: 25 });
    expect(r.json.consulta).toMatchObject({ situacao: "ok", tribunal: "tjsp", total_movimentos: 25 });
    const pag1 = await chamar("GET", `/api/processos/${p.id}/datajud?por_pagina=20`, { cookie: u.cookie });
    expect(pag1.json.movimentos).toHaveLength(20);
    expect(pag1.json.movimentos[0].nome).toBe("CONTEUDO-SECRETO-24");
    const pag2 = await chamar("GET", `/api/processos/${p.id}/datajud?por_pagina=20&pagina=2`, { cookie: u.cookie });
    expect(pag2.json.movimentos).toHaveLength(5);
    const aud = await env.DB.prepare("SELECT acao, detalhes FROM audit_log WHERE tenant_id = ? AND acao = 'datajud_atualizado'").bind(t).all<{ acao: string; detalhes: string | null }>();
    expect(aud.results).toHaveLength(1);
    expect(JSON.stringify(aud.results)).not.toContain("CONTEUDO-SECRETO");
  });

  it("limite de 1 atualização a cada 10 minutos por processo (429)", async () => {
    const { socio, p } = await cenario();
    const relogio = relogioFalso();
    const cliente = clienteSimulado(relogio, (_a, n) => ok([hit(n)]));
    definirDepsDatajudParaTeste({ cliente, relogio });
    const url = `/api/processos/${p.id}/datajud/atualizar`;
    expect((await chamar("POST", url, { cookie: socio.cookie })).status).toBe(200);
    const segunda = await chamar("POST", url, { cookie: socio.cookie });
    expect(segunda.status).toBe(429);
    expect(segunda.json.erro).toContain("Tente de novo em");
    expect(cliente.chamadas).toHaveLength(1);
    await relogio.dormir(INTERVALO_MANUAL_MS + 1000);
    expect((await chamar("POST", url, { cookie: socio.cookie })).status).toBe(200);
    expect(cliente.chamadas).toHaveLength(2);
  });

  it("processo desativado não atualiza (409) e processo inexistente dá 404", async () => {
    const { t, socio } = await cenario();
    const relogio = relogioFalso();
    definirDepsDatajudParaTeste({ cliente: clienteSimulado(relogio, () => ok([])), relogio });
    const off = await novoProcesso(t, numeroUnico(), 0);
    expect((await chamar("POST", `/api/processos/${off.id}/datajud/atualizar`, { cookie: socio.cookie })).status).toBe(409);
    expect((await chamar("POST", "/api/processos/nao-existe/datajud/atualizar", { cookie: socio.cookie })).status).toBe(404);
    expect((await chamar("GET", "/api/processos/nao-existe/datajud", { cookie: socio.cookie })).status).toBe(404);
  });

  it("ISOLAMENTO: usuário do escritório A não lê nem atualiza o DataJud de processo do escritório B", async () => {
    const a = await cenario();
    const b = await cenario();
    const relogio = relogioFalso();
    const cliente = clienteSimulado(relogio, (_al, n) => ok([hit(n, { movimentos: [{ codigo: 1, nome: "SEGREDO-DO-ESCRITORIO-B", dataHora: "2026-03-01T10:00:00.000Z" }] })]));
    definirDepsDatajudParaTeste({ cliente, relogio });
    expect((await chamar("POST", `/api/processos/${b.p.id}/datajud/atualizar`, { cookie: b.socio.cookie })).status).toBe(200);

    const le = await chamar("GET", `/api/processos/${b.p.id}/datajud`, { cookie: a.socio.cookie });
    expect(le.status).toBe(404);
    expect(JSON.stringify(le.json)).not.toContain("SEGREDO");
    const antes = cliente.chamadas.length;
    const atualiza = await chamar("POST", `/api/processos/${b.p.id}/datajud/atualizar`, { cookie: a.socio.cookie });
    expect(atualiza.status).toBe(404);
    expect(cliente.chamadas).toHaveLength(antes);
    // Nada foi gravado no escritório A.
    expect((await criarRepositorio(env.DB, a.t).datajud.movimentosDoProcesso(b.p.id)).total).toBe(0);
    expect(await criarRepositorio(env.DB, a.t).datajud.buscarConsulta(b.p.id)).toBeNull();
    // E o banco recusa gravar movimento de B com tenant de A (chave estrangeira composta).
    await expect(
      env.DB.prepare("INSERT INTO datajud_movimentos (id, tenant_id, processo_id, chave, criado_em) VALUES ('x', ?, ?, 'chave-de-teste-1', 'a')").bind(a.t, b.p.id).run(),
    ).rejects.toThrow();
  });
});
