import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { cnjValido, formatarCnj } from "../src/server/validacao-processos";
import { prepararBanco } from "./aplicar-migracoes";
import { ORIGEM, chamar, criarEscritorio, novoIp, sessaoDeUsuario } from "./ajuda";

prepararBanco();

// Números calculados com a fórmula da Resolução CNJ 65/2008: DD = 98 − ((NNNNNNN AAAA J TR OOOO 00) mod 97).
const VALIDOS = ["0000001-78.2020.8.26.0100", "1234567-53.2023.8.26.0001", "0001234-48.2021.5.02.0471", "0700001-15.2024.4.03.6100", "0000321-66.2019.8.19.0001"];

/** Gera um número válido a partir de um sequencial (mesma fórmula oficial, em BigInt). */
function numeroValido(seq: number): string {
  const n7 = String(seq).padStart(7, "0");
  const dv = String(98n - (BigInt(`${n7}2023826010000`) % 97n)).padStart(2, "0");
  return `${n7}-${dv}.2023.8.26.0100`;
}

const processo = (extra: object = {}) => ({ numero_cnj: VALIDOS[0], fase: "Conhecimento", ...extra });

async function cenario() {
  const t = await criarEscritorio("escritorio");
  return { t, socio: await sessaoDeUsuario(t, "socio") };
}

async function criarProcesso(cookie: string, corpo: object = processo()) {
  const r = await chamar("POST", "/api/processos", { cookie, corpo });
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  return r.json.processo.id as string;
}

async function criarCliente(cookie: string, nome = "Maria da Silva") {
  const r = await chamar("POST", "/api/clientes", { cookie, corpo: { tipo: "pf", nome } });
  expect(r.status).toBe(201);
  return r.json.cliente.id as string;
}

const PDF = () => new TextEncoder().encode("%PDF-1.4\nconteudo de teste\n%%EOF");

async function enviar(cookie: string, processoId: string, nome: string, bytes: Uint8Array) {
  const r = await SELF.fetch(`${ORIGEM}/api/processos/${processoId}/anexos`, {
    method: "POST",
    headers: { Origin: ORIGEM, "X-Requested-With": "advocacia", Cookie: cookie, "CF-Connecting-IP": novoIp(), "X-Nome-Arquivo": encodeURIComponent(nome), "Content-Type": "application/octet-stream" },
    body: bytes as BodyInit,
  });
  return { status: r.status, json: (await r.json()) as any };
}

describe("número CNJ", () => {
  it("aceita números válidos, com ou sem máscara", () => {
    for (const n of VALIDOS) {
      expect(cnjValido(n), n).toBe(true);
      expect(cnjValido(n.replace(/\D/g, "")), n).toBe(true);
    }
    expect(formatarCnj("00000017820208260100")).toBe("0000001-78.2020.8.26.0100");
  });

  it("recusa dígito verificador errado, tamanho errado e segmento da Justiça zero", () => {
    expect(cnjValido("0000001-79.2020.8.26.0100")).toBe(false);
    expect(cnjValido("0000001-78.2020.8.26.0101")).toBe(false);
    expect(cnjValido("0000002-78.2020.8.26.0100")).toBe(false);
    expect(cnjValido("1234567-52.2023.8.26.0001")).toBe(false);
    expect(cnjValido("0000001-78.2020.8.26.010")).toBe(false);
    expect(cnjValido("")).toBe(false);
    expect(cnjValido("abc")).toBe(false);
    // dígito verificador correto, mas J = 0 (a Resolução vai de 1 a 9)
    expect(cnjValido("0000001-47.2020.0.26.0100")).toBe(false);
  });

  it("o gerador de teste produz números aceitos", () => {
    for (const n of [1, 2, 3, 4567, 9999999]) expect(cnjValido(numeroValido(n)), numeroValido(n)).toBe(true);
  });

  it("a API valida o número e os demais campos", async () => {
    const { socio } = await cenario();
    const ruins: object[] = [
      processo({ numero_cnj: "0000001-79.2020.8.26.0100" }),
      processo({ numero_cnj: "123" }),
      processo({ numero_cnj: undefined }),
      processo({ fase: "Qualquer" }),
      processo({ fase: "conhecimento" }),
      processo({ fase: undefined }),
      processo({ valor_causa_centavos: -1 }),
      processo({ valor_causa_centavos: 10.5 }),
      processo({ valor_causa_centavos: "100" }),
      processo({ data_distribuicao: "2999-01-01" }),
      processo({ data_distribuicao: "2020-02-31" }),
      processo({ tribunal: "x".repeat(101) }),
      processo({ observacoes: "x".repeat(2001) }),
    ];
    for (const corpo of ruins) expect((await chamar("POST", "/api/processos", { cookie: socio.cookie, corpo })).status, JSON.stringify(corpo)).toBe(400);
    const ok = await chamar("POST", "/api/processos", {
      cookie: socio.cookie,
      corpo: processo({ numero_cnj: VALIDOS[1], fase: "Execução", tribunal: "TJSP", orgao: "1ª Vara Cível", comarca: "São Paulo", area: "Cível", classe: "Procedimento Comum", assunto: "Indenização", valor_causa_centavos: 1234567, data_distribuicao: "2023-05-10", observacoes: "Obs" }),
    });
    expect(ok.status).toBe(201);
    expect(ok.json.processo).toMatchObject({ numero_cnj: "12345675320238260001", fase: "Execução", valor_causa_centavos: 1234567, data_distribuicao: "2023-05-10", ativo: true, partes: [], responsaveis: [] });
    for (const [i, fase] of ["Conhecimento", "Recursal", "Execução", "Suspenso", "Arquivado"].entries()) {
      const r = await chamar("POST", "/api/processos", { cookie: socio.cookie, corpo: processo({ numero_cnj: numeroValido(900 + i), fase }) });
      expect(r.status, fase).toBe(201);
    }
  });
});

describe("processos: cadastro, permissões e situação", () => {
  it("todos os perfis criam e editam; número duplicado dá 409; auditoria sem número nem nomes", async () => {
    const { t, socio } = await cenario();
    const id = await criarProcesso(socio.cookie);
    for (const [i, perfil] of (["advogado", "estagiario", "secretaria"] as const).entries()) {
      const u = await sessaoDeUsuario(t, perfil);
      const novo = await chamar("POST", "/api/processos", { cookie: u.cookie, corpo: processo({ numero_cnj: numeroValido(10 + i) }) });
      expect(novo.status).toBe(201);
      const ed = await chamar("PUT", `/api/processos/${id}`, { cookie: u.cookie, corpo: processo({ observacoes: `nota ${perfil}` }) });
      expect(ed.status).toBe(200);
      expect(ed.json.processo.observacoes).toBe(`nota ${perfil}`);
    }
    expect((await chamar("POST", "/api/processos", { cookie: socio.cookie, corpo: processo({ numero_cnj: "00000017820208260100" }) })).status).toBe(409);
    // trocar o número para outro já usado também dá 409
    const outro = await criarProcesso(socio.cookie, processo({ numero_cnj: VALIDOS[2] }));
    expect((await chamar("PUT", `/api/processos/${outro}`, { cookie: socio.cookie, corpo: processo({ numero_cnj: VALIDOS[0] }) })).status).toBe(409);
    const log = await env.DB.prepare("SELECT acao, detalhes FROM audit_log WHERE tenant_id = ? AND entidade = 'processos'").bind(t).all<{ acao: string; detalhes: string | null }>();
    expect(log.results.some((l) => l.acao === "processo_criado")).toBe(true);
    expect(log.results.some((l) => l.acao === "processo_alterado")).toBe(true);
    expect(JSON.stringify(log.results)).not.toContain("0000001");
    expect(JSON.stringify(log.results)).not.toContain("nota");
  });

  it("o mesmo número pode existir em escritórios diferentes", async () => {
    const a = await cenario();
    const b = await cenario();
    await criarProcesso(a.socio.cookie);
    await criarProcesso(b.socio.cookie);
  });

  it("só o sócio desativa e reativa; inativo sai da lista padrão e fica somente leitura", async () => {
    const { t, socio } = await cenario();
    const id = await criarProcesso(socio.cookie);
    const adv = await sessaoDeUsuario(t, "advogado");
    const cli = await criarCliente(socio.cookie);
    const resp = (await chamar("GET", "/api/processos/responsaveis-disponiveis", { cookie: adv.cookie })).json.usuarios[0].id;
    expect((await chamar("POST", `/api/processos/${id}/situacao`, { cookie: adv.cookie, corpo: { ativo: false } })).status).toBe(403);
    expect((await chamar("POST", `/api/processos/${id}/situacao`, { cookie: socio.cookie, corpo: { ativo: "nao" } })).status).toBe(400);
    // dados que existiam antes de desativar
    const parte = (await chamar("POST", `/api/processos/${id}/partes`, { cookie: socio.cookie, corpo: { nome: "Parte A", polo: "passivo" } })).json.parte.id;
    const and = (await chamar("POST", `/api/processos/${id}/andamentos`, { cookie: socio.cookie, corpo: { data: "2026-10-01", descricao: "Despacho" } })).json.andamento.id;
    const anexo = (await enviar(socio.cookie, id, "a.pdf", PDF())).json.anexo.id;
    expect((await chamar("POST", `/api/processos/${id}/responsaveis`, { cookie: socio.cookie, corpo: { user_id: resp } })).status).toBe(201);

    const d = await chamar("POST", `/api/processos/${id}/situacao`, { cookie: socio.cookie, corpo: { ativo: false } });
    expect(d.json.processo.ativo).toBe(false);
    expect((await chamar("GET", "/api/processos", { cookie: socio.cookie })).json.total).toBe(0);
    expect((await chamar("GET", "/api/processos?situacao=inativos", { cookie: socio.cookie })).json.total).toBe(1);
    expect((await chamar("GET", "/api/processos?situacao=todos", { cookie: socio.cookie })).json.total).toBe(1);
    // leitura continua; qualquer escrita é recusada (409), inclusive para o sócio
    expect((await chamar("GET", `/api/processos/${id}`, { cookie: adv.cookie })).status).toBe(200);
    expect((await chamar("GET", `/api/processos/${id}/andamentos`, { cookie: adv.cookie })).json.andamentos).toHaveLength(1);
    const escritas = [
      await chamar("PUT", `/api/processos/${id}`, { cookie: adv.cookie, corpo: processo() }),
      await chamar("POST", `/api/processos/${id}/partes`, { cookie: adv.cookie, corpo: { cliente_id: cli, polo: "ativo" } }),
      await chamar("PUT", `/api/processos/${id}/partes/${parte}`, { cookie: adv.cookie, corpo: { polo: "ativo" } }),
      await chamar("DELETE", `/api/processos/${id}/partes/${parte}`, { cookie: adv.cookie }),
      await chamar("POST", `/api/processos/${id}/responsaveis`, { cookie: adv.cookie, corpo: { user_id: adv.id } }),
      await chamar("DELETE", `/api/processos/${id}/responsaveis/${resp}`, { cookie: adv.cookie }),
      await chamar("POST", `/api/processos/${id}/andamentos`, { cookie: adv.cookie, corpo: { data: "2026-10-02", descricao: "Novo" } }),
      await chamar("DELETE", `/api/processos/${id}/andamentos/${and}`, { cookie: socio.cookie }),
      await enviar(adv.cookie, id, "b.pdf", PDF()),
      await chamar("DELETE", `/api/processos/${id}/anexos/${anexo}`, { cookie: socio.cookie }),
    ];
    for (const r of escritas) expect(r.status).toBe(409);
    expect((await chamar("POST", `/api/processos/${id}/situacao`, { cookie: socio.cookie, corpo: { ativo: true } })).json.processo.ativo).toBe(true);
    expect((await chamar("PUT", `/api/processos/${id}`, { cookie: adv.cookie, corpo: processo({ fase: "Recursal" }) })).status).toBe(200);
    const acoes = await env.DB.prepare("SELECT acao FROM audit_log WHERE tenant_id = ? AND acao LIKE 'processo_%ativado' ORDER BY criado_em, id").bind(t).all<{ acao: string }>();
    expect(acoes.results.map((a) => a.acao)).toEqual(["processo_desativado", "processo_reativado"]);
  });

  it("exige login e CSRF", async () => {
    const { socio } = await cenario();
    expect((await chamar("GET", "/api/processos")).status).toBe(401);
    expect((await chamar("POST", "/api/processos", { cookie: socio.cookie, corpo: processo(), marca: null })).status).toBe(403);
  });
});

describe("lista, busca, filtros e resumo", () => {
  it("busca por número com ou sem máscara e por nome de parte; filtros por fase, responsável e cliente; paginação", async () => {
    const { t, socio } = await cenario();
    const adv = await sessaoDeUsuario(t, "advogado");
    const maria = await criarCliente(socio.cookie, "José Antônio Pereira");
    const p1 = await criarProcesso(socio.cookie, processo({ numero_cnj: VALIDOS[0], fase: "Conhecimento" }));
    const p2 = await criarProcesso(socio.cookie, processo({ numero_cnj: VALIDOS[1], fase: "Recursal" }));
    await criarProcesso(socio.cookie, processo({ numero_cnj: VALIDOS[2], fase: "Recursal" }));
    await criarProcesso(socio.cookie, processo({ numero_cnj: VALIDOS[3], fase: "Arquivado" }));
    await criarProcesso(socio.cookie, processo({ numero_cnj: VALIDOS[4], fase: "Execução" }));
    await chamar("POST", `/api/processos/${p1}/partes`, { cookie: socio.cookie, corpo: { cliente_id: maria, polo: "ativo" } });
    await chamar("POST", `/api/processos/${p1}/partes`, { cookie: socio.cookie, corpo: { nome: "Banco Exemplo S.A.", polo: "passivo" } });
    await chamar("POST", `/api/processos/${p2}/responsaveis`, { cookie: socio.cookie, corpo: { user_id: adv.id } });

    const lista = async (q: string) => (await chamar("GET", `/api/processos${q}`, { cookie: socio.cookie })).json;
    expect((await lista("")).total).toBe(5);
    expect((await lista(`?busca=${encodeURIComponent("0000001-78.2020.8.26.0100")}`)).total).toBe(1);
    expect((await lista("?busca=00000017820208260100")).total).toBe(1);
    expect((await lista("?busca=1234567-53")).total).toBe(1);
    expect((await lista(`?busca=${encodeURIComponent("jose antonio")}`)).processos[0].id).toBe(p1);
    expect((await lista(`?busca=${encodeURIComponent("banco exemplo")}`)).total).toBe(1);
    expect((await lista("?busca=%25")).total).toBe(0);
    expect((await lista("?fase=Recursal")).total).toBe(2);
    expect((await lista("?fase=Invalida"))).toMatchObject({ ok: false });
    expect((await lista(`?responsavel=${adv.id}`)).total).toBe(1);
    expect((await lista("?responsavel=sem")).total).toBe(4);
    expect((await lista(`?cliente_id=${maria}`)).total).toBe(1);
    const p = (await lista("?por_pagina=2&pagina=1")).processos;
    expect(p).toHaveLength(2);
    expect((await lista("?por_pagina=2&pagina=3")).processos).toHaveLength(1);
    const completo = (await lista(`?cliente_id=${maria}`)).processos[0];
    expect(completo.partes.map((x: any) => x.nome).sort()).toEqual(["Banco Exemplo S.A.", "José Antônio Pereira"]);
    expect((await lista("?fase=Recursal&responsavel=" + adv.id)).processos[0].responsaveis).toEqual([{ user_id: adv.id, nome: "Usuário Teste", ativo: true }]);
  });

  it("resumo: total ativo, por fase, sem responsável e andamentos dos últimos 30 dias", async () => {
    const { socio } = await cenario();
    const a = await criarProcesso(socio.cookie, processo({ numero_cnj: VALIDOS[0], fase: "Conhecimento" }));
    const b = await criarProcesso(socio.cookie, processo({ numero_cnj: VALIDOS[1], fase: "Recursal" }));
    await criarProcesso(socio.cookie, processo({ numero_cnj: VALIDOS[2], fase: "Recursal" }));
    const inativo = await criarProcesso(socio.cookie, processo({ numero_cnj: VALIDOS[3], fase: "Suspenso" }));
    const eu = (await chamar("GET", "/api/processos/responsaveis-disponiveis", { cookie: socio.cookie })).json.usuarios[0].id;
    await chamar("POST", `/api/processos/${a}/responsaveis`, { cookie: socio.cookie, corpo: { user_id: eu } });
    const hoje = new Date().toISOString().slice(0, 10);
    await chamar("POST", `/api/processos/${a}/andamentos`, { cookie: socio.cookie, corpo: { data: hoje, descricao: "Recente" } });
    await chamar("POST", `/api/processos/${b}/andamentos`, { cookie: socio.cookie, corpo: { data: "2020-01-10", descricao: "Antigo" } });
    await chamar("POST", `/api/processos/${inativo}/andamentos`, { cookie: socio.cookie, corpo: { data: hoje, descricao: "De processo que será desativado" } });
    await chamar("POST", `/api/processos/${inativo}/situacao`, { cookie: socio.cookie, corpo: { ativo: false } });
    const r = (await chamar("GET", "/api/processos/resumo", { cookie: socio.cookie })).json.resumo;
    expect(r).toEqual({ total_ativos: 3, por_fase: { Conhecimento: 1, Recursal: 2, Execução: 0, Suspenso: 0, Arquivado: 0 }, sem_responsavel: 2, andamentos_30_dias: 1 });
  });
});

describe("partes e responsáveis", () => {
  it("vincula cliente do escritório ou nome livre, nunca os dois; duplicado dá 409; cliente desativado é recusado", async () => {
    const { t, socio } = await cenario();
    const id = await criarProcesso(socio.cookie);
    const cli = await criarCliente(socio.cookie);
    const adv = await sessaoDeUsuario(t, "advogado");
    const a = await chamar("POST", `/api/processos/${id}/partes`, { cookie: adv.cookie, corpo: { cliente_id: cli, polo: "ativo" } });
    expect(a.status).toBe(201);
    expect(a.json.parte).toMatchObject({ cliente_id: cli, nome: "Maria da Silva", polo: "ativo", cliente_escritorio: true });
    expect((await chamar("POST", `/api/processos/${id}/partes`, { cookie: adv.cookie, corpo: { cliente_id: cli, polo: "passivo" } })).status).toBe(409);
    const livre = await chamar("POST", `/api/processos/${id}/partes`, { cookie: adv.cookie, corpo: { nome: "  Empresa   Ré Ltda ", polo: "passivo" } });
    expect(livre.json.parte).toMatchObject({ cliente_id: null, nome: "Empresa Ré Ltda", polo: "passivo", cliente_escritorio: false });
    const ruins: object[] = [
      { polo: "ativo" },
      { cliente_id: cli, nome: "X", polo: "ativo" },
      { nome: "X", polo: "meio" },
      { nome: "X" },
      { nome: "x".repeat(151), polo: "ativo" },
      { nome: "X", polo: "ativo", cliente_escritorio: "sim" },
    ];
    for (const corpo of ruins) expect((await chamar("POST", `/api/processos/${id}/partes`, { cookie: adv.cookie, corpo })).status, JSON.stringify(corpo)).toBe(400);
    // nome livre pode ser marcado como cliente do escritório (cliente ainda não cadastrado)
    const marcada = await chamar("PUT", `/api/processos/${id}/partes/${livre.json.parte.id}`, { cookie: adv.cookie, corpo: { polo: "terceiro", cliente_escritorio: true, nome: "Empresa Ré S.A." } });
    expect(marcada.json.parte).toMatchObject({ polo: "terceiro", cliente_escritorio: true, nome: "Empresa Ré S.A." });
    // parte ligada a cliente: só o polo muda
    const pol = await chamar("PUT", `/api/processos/${id}/partes/${a.json.parte.id}`, { cookie: adv.cookie, corpo: { polo: "passivo", nome: "Outro Nome" } });
    expect(pol.json.parte).toMatchObject({ polo: "passivo", nome: "Maria da Silva", cliente_escritorio: true });
    expect((await chamar("GET", `/api/processos/${id}/partes`, { cookie: adv.cookie })).json.partes).toHaveLength(2);
    expect((await chamar("DELETE", `/api/processos/${id}/partes/${a.json.parte.id}`, { cookie: adv.cookie })).status).toBe(200);
    expect((await chamar("GET", `/api/processos/${id}/partes`, { cookie: adv.cookie })).json.partes).toHaveLength(1);
    // cliente desativado
    const cli2 = await criarCliente(socio.cookie, "Cliente Antigo");
    await chamar("POST", `/api/clientes/${cli2}/situacao`, { cookie: socio.cookie, corpo: { ativo: false } });
    expect((await chamar("POST", `/api/processos/${id}/partes`, { cookie: adv.cookie, corpo: { cliente_id: cli2, polo: "ativo" } })).status).toBe(409);
    // auditoria sem nomes
    const log = await env.DB.prepare("SELECT acao, detalhes FROM audit_log WHERE tenant_id = ? AND entidade = 'processos_partes'").bind(t).all<{ acao: string; detalhes: string | null }>();
    expect(log.results.map((l) => l.acao)).toEqual(expect.arrayContaining(["parte_adicionada", "parte_alterada", "parte_removida"]));
    expect(JSON.stringify(log.results)).not.toContain("Empresa");
    expect(JSON.stringify(log.results)).not.toContain("Maria");
  });

  it("o cliente mostra os processos dele (inclusive o polo) em /api/clientes/:id/processos", async () => {
    const { socio } = await cenario();
    const cli = await criarCliente(socio.cookie);
    const p1 = await criarProcesso(socio.cookie, processo({ numero_cnj: VALIDOS[0], fase: "Recursal" }));
    await criarProcesso(socio.cookie, processo({ numero_cnj: VALIDOS[1] }));
    await chamar("POST", `/api/processos/${p1}/partes`, { cookie: socio.cookie, corpo: { cliente_id: cli, polo: "passivo" } });
    const r = await chamar("GET", `/api/clientes/${cli}/processos`, { cookie: socio.cookie });
    expect(r.json.processos).toEqual([{ id: p1, numero_cnj: "00000017820208260100", fase: "Recursal", polo: "passivo", tribunal: null, orgao: null, comarca: null, ativo: true }]);
  });

  it("responsáveis: só usuários ativos do mesmo escritório; duplicado dá 409", async () => {
    const { t, socio } = await cenario();
    const outro = await cenario();
    const id = await criarProcesso(socio.cookie);
    const adv = await sessaoDeUsuario(t, "advogado");
    const inativo = await sessaoDeUsuario(t, "estagiario");
    await env.DB.prepare("UPDATE users SET ativo = 0 WHERE id = ?").bind(inativo.id).run();
    const disp = (await chamar("GET", "/api/processos/responsaveis-disponiveis", { cookie: adv.cookie })).json.usuarios as { id: string }[];
    expect(disp.map((u) => u.id)).toContain(adv.id);
    expect(disp.map((u) => u.id)).not.toContain(inativo.id);
    expect(JSON.stringify(disp)).not.toContain("@");
    const ok = await chamar("POST", `/api/processos/${id}/responsaveis`, { cookie: adv.cookie, corpo: { user_id: adv.id } });
    expect(ok.status).toBe(201);
    expect(ok.json.responsaveis).toEqual([{ user_id: adv.id, nome: "Usuário Teste", ativo: true }]);
    expect((await chamar("POST", `/api/processos/${id}/responsaveis`, { cookie: adv.cookie, corpo: { user_id: adv.id } })).status).toBe(409);
    expect((await chamar("POST", `/api/processos/${id}/responsaveis`, { cookie: adv.cookie, corpo: { user_id: inativo.id } })).status).toBe(409);
    expect((await chamar("POST", `/api/processos/${id}/responsaveis`, { cookie: adv.cookie, corpo: { user_id: outro.socio.id } })).status).toBe(404);
    expect((await chamar("POST", `/api/processos/${id}/responsaveis`, { cookie: adv.cookie, corpo: {} })).status).toBe(400);
    expect((await chamar("DELETE", `/api/processos/${id}/responsaveis/${outro.socio.id}`, { cookie: adv.cookie })).status).toBe(404);
    expect((await chamar("DELETE", `/api/processos/${id}/responsaveis/${adv.id}`, { cookie: adv.cookie })).status).toBe(200);
    expect((await chamar("GET", `/api/processos/${id}/responsaveis`, { cookie: adv.cookie })).json.responsaveis).toHaveLength(0);
  });
});

describe("andamentos", () => {
  it("registra, lista do mais recente ao mais antigo, não edita e só o sócio apaga (com auditoria)", async () => {
    const { t, socio } = await cenario();
    const adv = await sessaoDeUsuario(t, "advogado");
    const id = await criarProcesso(socio.cookie);
    const a1 = await chamar("POST", `/api/processos/${id}/andamentos`, { cookie: adv.cookie, corpo: { data: "2026-09-01", descricao: "Petição inicial protocolada" } });
    expect(a1.status).toBe(201);
    expect(a1.json.andamento).toMatchObject({ data: "2026-09-01", registrado_por: adv.id });
    await chamar("POST", `/api/processos/${id}/andamentos`, { cookie: socio.cookie, corpo: { data: "2026-10-05", descricao: "Audiência designada" } });
    const ruins: object[] = [{ data: "2026-09-01" }, { data: "2026-09-01", descricao: "  " }, { data: "2999-01-01", descricao: "x" }, { data: "01/09/2026", descricao: "x" }, { descricao: "x" }, { data: "2026-09-01", descricao: "x".repeat(2001) }];
    for (const corpo of ruins) expect((await chamar("POST", `/api/processos/${id}/andamentos`, { cookie: adv.cookie, corpo })).status, JSON.stringify(corpo)).toBe(400);
    const lista = (await chamar("GET", `/api/processos/${id}/andamentos`, { cookie: adv.cookie })).json;
    expect(lista.andamentos.map((a: any) => a.descricao)).toEqual(["Audiência designada", "Petição inicial protocolada"]);
    expect(lista.andamentos[1].registrado_por_nome).toBe("Usuário Teste");
    expect(lista.total).toBe(2);
    // não existe rota de edição
    expect((await chamar("PUT", `/api/processos/${id}/andamentos/${a1.json.andamento.id}`, { cookie: socio.cookie, corpo: { data: "2026-09-02", descricao: "Alterado" } })).status).toBe(404);
    expect((await chamar("DELETE", `/api/processos/${id}/andamentos/${a1.json.andamento.id}`, { cookie: adv.cookie })).status).toBe(403);
    expect((await chamar("DELETE", `/api/processos/${id}/andamentos/${a1.json.andamento.id}`, { cookie: socio.cookie })).status).toBe(200);
    expect((await chamar("DELETE", `/api/processos/${id}/andamentos/${a1.json.andamento.id}`, { cookie: socio.cookie })).status).toBe(404);
    expect((await chamar("GET", `/api/processos/${id}/andamentos`, { cookie: adv.cookie })).json.total).toBe(1);
    const log = await env.DB.prepare("SELECT acao, detalhes FROM audit_log WHERE tenant_id = ? AND entidade = 'processos_andamentos' ORDER BY criado_em, id").bind(t).all<{ acao: string; detalhes: string | null }>();
    expect(log.results.map((l) => l.acao)).toEqual(["andamento_registrado", "andamento_registrado", "andamento_excluido"]);
    expect(JSON.stringify(log.results)).not.toContain("Petição");
  });
});

describe("anexos do processo", () => {
  it("envia, lista, baixa por link temporário e só o sócio apaga; arquivo de cliente não abre pela rota de processo", async () => {
    const { t, socio } = await cenario();
    const adv = await sessaoDeUsuario(t, "advogado");
    const id = await criarProcesso(socio.cookie);
    const up = await enviar(adv.cookie, id, "Petição.pdf", PDF());
    expect(up.status).toBe(201);
    const aid = up.json.anexo.id as string;
    const linha = await env.DB.prepare("SELECT chave_r2, entidade, entidade_id FROM anexos WHERE id = ?").bind(aid).first<{ chave_r2: string; entidade: string; entidade_id: string }>();
    expect(linha).toMatchObject({ entidade: "processo", entidade_id: id });
    expect(linha!.chave_r2.startsWith(`${t}/processo/${id}/`)).toBe(true);
    expect((await chamar("GET", `/api/processos/${id}/anexos`, { cookie: adv.cookie })).json.anexos).toHaveLength(1);
    const link = await chamar("GET", `/api/processos/${id}/anexos/${aid}/link`, { cookie: adv.cookie });
    expect(link.json.validade_segundos).toBe(300);
    expect(link.json.url.startsWith("/api/processos/anexos/")).toBe(true);
    const dl = await SELF.fetch(`${ORIGEM}${link.json.url}`, { headers: { Cookie: adv.cookie, "CF-Connecting-IP": novoIp() } });
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(new Uint8Array(await dl.arrayBuffer())).toEqual(PDF());
    // o mesmo token não serve pela rota de clientes (entidade diferente)
    const cruzado = await SELF.fetch(`${ORIGEM}${link.json.url.replace("/api/processos/", "/api/clientes/")}`, { headers: { Cookie: adv.cookie, "CF-Connecting-IP": novoIp() } });
    expect(cruzado.status).toBe(404);
    await cruzado.arrayBuffer();
    // tipo e tamanho: mesmas regras de Clientes
    const falso = await enviar(adv.cookie, id, "falso.pdf", new TextEncoder().encode("<script>"));
    expect(falso.status).toBe(400);
    const grande = new Uint8Array(7 * 1024 * 1024 + 1);
    grande.set(PDF());
    expect((await enviar(adv.cookie, id, "grande.pdf", grande)).status).toBe(413);
    expect((await chamar("DELETE", `/api/processos/${id}/anexos/${aid}`, { cookie: adv.cookie })).status).toBe(403);
    expect((await chamar("DELETE", `/api/processos/${id}/anexos/${aid}`, { cookie: socio.cookie })).status).toBe(200);
    expect(await env.ARQUIVOS.head(linha!.chave_r2)).toBeNull();
  });
});

describe("isolamento entre escritórios", () => {
  it("escritório B não lê, altera, baixa nem apaga nada do A e não vincula dados do A", async () => {
    const a = await cenario();
    const b = await cenario();
    const cliA = await criarCliente(a.socio.cookie, "Cliente do A");
    const id = await criarProcesso(a.socio.cookie);
    const parte = (await chamar("POST", `/api/processos/${id}/partes`, { cookie: a.socio.cookie, corpo: { cliente_id: cliA, polo: "ativo" } })).json.parte.id;
    await chamar("POST", `/api/processos/${id}/responsaveis`, { cookie: a.socio.cookie, corpo: { user_id: a.socio.id } });
    const and = (await chamar("POST", `/api/processos/${id}/andamentos`, { cookie: a.socio.cookie, corpo: { data: "2026-10-01", descricao: "Segredo do A" } })).json.andamento.id;
    const aid = (await enviar(a.socio.cookie, id, "a.pdf", PDF())).json.anexo.id as string;
    const linkA = (await chamar("GET", `/api/processos/${id}/anexos/${aid}/link`, { cookie: a.socio.cookie })).json.url as string;

    const B = b.socio.cookie;
    const naoEncontrado = [
      await chamar("GET", `/api/processos/${id}`, { cookie: B }),
      await chamar("PUT", `/api/processos/${id}`, { cookie: B, corpo: processo({ fase: "Arquivado" }) }),
      await chamar("POST", `/api/processos/${id}/situacao`, { cookie: B, corpo: { ativo: false } }),
      await chamar("GET", `/api/processos/${id}/partes`, { cookie: B }),
      await chamar("POST", `/api/processos/${id}/partes`, { cookie: B, corpo: { nome: "Invasor", polo: "ativo" } }),
      await chamar("PUT", `/api/processos/${id}/partes/${parte}`, { cookie: B, corpo: { polo: "passivo" } }),
      await chamar("DELETE", `/api/processos/${id}/partes/${parte}`, { cookie: B }),
      await chamar("GET", `/api/processos/${id}/responsaveis`, { cookie: B }),
      await chamar("POST", `/api/processos/${id}/responsaveis`, { cookie: B, corpo: { user_id: b.socio.id } }),
      await chamar("DELETE", `/api/processos/${id}/responsaveis/${a.socio.id}`, { cookie: B }),
      await chamar("GET", `/api/processos/${id}/andamentos`, { cookie: B }),
      await chamar("POST", `/api/processos/${id}/andamentos`, { cookie: B, corpo: { data: "2026-10-01", descricao: "x" } }),
      await chamar("DELETE", `/api/processos/${id}/andamentos/${and}`, { cookie: B }),
      await chamar("GET", `/api/processos/${id}/anexos`, { cookie: B }),
      await enviar(B, id, "b.pdf", PDF()),
      await chamar("GET", `/api/processos/${id}/anexos/${aid}/link`, { cookie: B }),
      await chamar("DELETE", `/api/processos/${id}/anexos/${aid}`, { cookie: B }),
      await chamar("GET", `/api/clientes/${cliA}/processos`, { cookie: B }),
    ];
    for (const r of naoEncontrado) expect(r.status).toBe(404);

    expect((await chamar("GET", "/api/processos?situacao=todos", { cookie: B })).json.total).toBe(0);
    expect((await chamar("GET", "/api/processos?busca=0000001", { cookie: B })).json.total).toBe(0);
    expect((await chamar("GET", "/api/processos?busca=Cliente%20do%20A", { cookie: B })).json.total).toBe(0);
    expect((await chamar("GET", `/api/processos?cliente_id=${cliA}`, { cookie: B })).json.total).toBe(0);
    expect((await chamar("GET", "/api/processos/resumo", { cookie: B })).json.resumo.total_ativos).toBe(0);
    const dispB = (await chamar("GET", "/api/processos/responsaveis-disponiveis", { cookie: B })).json.usuarios.map((u: { id: string }) => u.id);
    expect(dispB).not.toContain(a.socio.id);

    // B tem um processo próprio e tenta vincular cliente e responsável do A
    const idB = await criarProcesso(B);
    expect((await chamar("POST", `/api/processos/${idB}/partes`, { cookie: B, corpo: { cliente_id: cliA, polo: "ativo" } })).status).toBe(404);
    expect((await chamar("POST", `/api/processos/${idB}/responsaveis`, { cookie: B, corpo: { user_id: a.socio.id } })).status).toBe(404);

    // o link assinado do A não funciona na sessão do B
    const roubado = await SELF.fetch(`${ORIGEM}${linkA}`, { headers: { Cookie: B, "CF-Connecting-IP": novoIp() } });
    expect(roubado.status).toBe(403);
    await roubado.arrayBuffer();

    // nada do A mudou
    const intacto = (await chamar("GET", `/api/processos/${id}`, { cookie: a.socio.cookie })).json.processo;
    expect(intacto).toMatchObject({ fase: "Conhecimento", ativo: true });
    expect(intacto.partes).toHaveLength(1);
    expect(intacto.responsaveis).toHaveLength(1);

    // o banco também recusa vínculos entre escritórios (chaves estrangeiras compostas)
    const ts = new Date().toISOString();
    const recusas = [
      env.DB.prepare("INSERT INTO processos_partes (id, tenant_id, processo_id, nome, polo, criado_em, atualizado_em) VALUES ('x1', ?, ?, 'N', 'ativo', ?, ?)").bind(b.t, id, ts, ts),
      env.DB.prepare("INSERT INTO processos_partes (id, tenant_id, processo_id, cliente_id, polo, cliente_escritorio, criado_em, atualizado_em) VALUES ('x2', ?, ?, ?, 'ativo', 1, ?, ?)").bind(b.t, idB, cliA, ts, ts),
      env.DB.prepare("INSERT INTO processos_responsaveis (id, tenant_id, processo_id, user_id, criado_em) VALUES ('x3', ?, ?, ?, ?)").bind(b.t, idB, a.socio.id, ts),
      env.DB.prepare("INSERT INTO processos_responsaveis (id, tenant_id, processo_id, user_id, criado_em) VALUES ('x4', ?, ?, ?, ?)").bind(b.t, id, b.socio.id, ts),
      env.DB.prepare("INSERT INTO processos_andamentos (id, tenant_id, processo_id, data, descricao, criado_em) VALUES ('x5', ?, ?, '2026-10-01', 'N', ?)").bind(b.t, id, ts),
    ];
    for (const q of recusas) await expect(q.run()).rejects.toThrow();
  });
});
