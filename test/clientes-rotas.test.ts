import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { criarLinkAnexo, verificarLinkAnexo } from "../src/server/auth/cripto";
import { cnpjValido, cpfValido } from "../src/server/validacao";
import { prepararBanco } from "./aplicar-migracoes";
import { ORIGEM, chamar, criarEscritorio, novoIp, sessaoDeUsuario } from "./ajuda";

prepararBanco();

const CPF = "529.982.247-25";
const CNPJ = "11.222.333/0001-81";
const pf = (extra: object = {}) => ({ tipo: "pf", nome: "Maria da Silva", documento: CPF, ...extra });

async function cenario() {
  const t = await criarEscritorio("escritorio");
  return { t, socio: await sessaoDeUsuario(t, "socio") };
}

async function criarCliente(cookie: string, corpo: object = pf({ documento: undefined })) {
  const r = await chamar("POST", "/api/clientes", { cookie, corpo });
  expect(r.status).toBe(201);
  return r.json.cliente.id as string;
}

const PDF = () => new TextEncoder().encode("%PDF-1.4\nconteudo de teste\n%%EOF");
const PNG = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

async function enviar(cookie: string, clienteId: string, nome: string, bytes: Uint8Array, extra: Record<string, string> = {}) {
  const r = await SELF.fetch(`${ORIGEM}/api/clientes/${clienteId}/anexos`, {
    method: "POST",
    headers: { Origin: ORIGEM, "X-Requested-With": "advocacia", Cookie: cookie, "CF-Connecting-IP": novoIp(), "X-Nome-Arquivo": encodeURIComponent(nome), "Content-Type": "application/octet-stream", ...extra },
    body: bytes,
  });
  const json: any = await r.json();
  return { status: r.status, json };
}

async function baixar(cookie: string, url: string) {
  return SELF.fetch(`${ORIGEM}${url}`, { headers: { Cookie: cookie, "CF-Connecting-IP": novoIp() } });
}

describe("validação de CPF e CNPJ", () => {
  it("aceita números válidos e recusa dígito verificador errado ou repetidos", () => {
    expect(cpfValido(CPF)).toBe(true);
    expect(cpfValido("529.982.247-24")).toBe(false);
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cpfValido("123")).toBe(false);
    expect(cnpjValido(CNPJ)).toBe(true);
    expect(cnpjValido("11.222.333/0001-82")).toBe(false);
    expect(cnpjValido("00.000.000/0000-00")).toBe(false);
  });

  it("a API valida o documento conforme o tipo e os demais campos", async () => {
    const { socio } = await cenario();
    const ruins: object[] = [
      pf({ documento: "529.982.247-24" }),
      pf({ documento: CNPJ }),
      { tipo: "pj", nome: "Empresa", documento: CPF },
      { tipo: "pj", nome: "Empresa", documento: "11.222.333/0001-80" },
      pf({ cep: "123" }),
      pf({ uf: "ZZ" }),
      pf({ telefone: "12" }),
      pf({ celular: "1234567890123" }),
      pf({ email: "sem-arroba" }),
      pf({ data_nascimento: "2999-01-01" }),
      pf({ data_nascimento: "2020-02-31" }),
      { tipo: "xx", nome: "A" },
      { tipo: "pf", nome: "" },
    ];
    for (const corpo of ruins) expect((await chamar("POST", "/api/clientes", { cookie: socio.cookie, corpo })).status, JSON.stringify(corpo)).toBe(400);
    const ok = await chamar("POST", "/api/clientes", {
      cookie: socio.cookie,
      corpo: { tipo: "pj", nome: "Silva Ltda", nome_fantasia: "Silva", documento: CNPJ, telefone: "(12) 3456-7890", celular: "(12) 99219-8038", cep: "12345-678", uf: "SP", email: "A@B.com" },
    });
    expect(ok.status).toBe(201);
    expect(ok.json.cliente).toMatchObject({ tipo: "pj", documento: "11222333000181", telefone: "1234567890", celular: "12992198038", cep: "12345678", email: "a@b.com", ativo: true });
  });
});

describe("clientes: cadastro, busca e permissões", () => {
  it("todos os perfis criam e editam; documento duplicado dá 409; auditoria sem dados pessoais", async () => {
    const { t, socio } = await cenario();
    const id = await criarCliente(socio.cookie, pf());
    for (const perfil of ["advogado", "estagiario", "secretaria"] as const) {
      const u = await sessaoDeUsuario(t, perfil);
      const novo = await chamar("POST", "/api/clientes", { cookie: u.cookie, corpo: { tipo: "pf", nome: `Cliente do ${perfil}` } });
      expect(novo.status).toBe(201);
      const ed = await chamar("PUT", `/api/clientes/${id}`, { cookie: u.cookie, corpo: pf({ observacoes: `nota ${perfil}` }) });
      expect(ed.status).toBe(200);
      expect(ed.json.cliente.observacoes).toBe(`nota ${perfil}`);
    }
    const dup = await chamar("POST", "/api/clientes", { cookie: socio.cookie, corpo: pf({ nome: "Outra" }) });
    expect(dup.status).toBe(409);
    const trocar = await chamar("PUT", `/api/clientes/${id}`, { cookie: socio.cookie, corpo: { tipo: "pj", nome: "X" } });
    expect(trocar.status).toBe(400);
    const log = await env.DB.prepare("SELECT acao, detalhes FROM audit_log WHERE tenant_id = ? AND entidade = 'clientes'").bind(t).all<{ acao: string; detalhes: string | null }>();
    expect(log.results.some((l) => l.acao === "cliente_criado")).toBe(true);
    expect(log.results.some((l) => l.acao === "cliente_alterado")).toBe(true);
    expect(JSON.stringify(log.results)).not.toContain("Maria");
    expect(JSON.stringify(log.results)).not.toContain("529");
  });

  it("só o sócio desativa e reativa; inativo sai da lista padrão e não aceita alterações", async () => {
    const { t, socio } = await cenario();
    const id = await criarCliente(socio.cookie, pf());
    const adv = await sessaoDeUsuario(t, "advogado");
    expect((await chamar("POST", `/api/clientes/${id}/situacao`, { cookie: adv.cookie, corpo: { ativo: false } })).status).toBe(403);
    expect((await chamar("POST", `/api/clientes/${id}/situacao`, { cookie: socio.cookie, corpo: { ativo: "nao" } })).status).toBe(400);
    const d = await chamar("POST", `/api/clientes/${id}/situacao`, { cookie: socio.cookie, corpo: { ativo: false } });
    expect(d.json.cliente.ativo).toBe(false);
    expect((await chamar("GET", "/api/clientes", { cookie: socio.cookie })).json.total).toBe(0);
    expect((await chamar("GET", "/api/clientes?situacao=inativos", { cookie: socio.cookie })).json.total).toBe(1);
    expect((await chamar("GET", "/api/clientes?situacao=todos", { cookie: socio.cookie })).json.total).toBe(1);
    expect((await chamar("PUT", `/api/clientes/${id}`, { cookie: adv.cookie, corpo: pf() })).status).toBe(409);
    expect((await chamar("POST", `/api/clientes/${id}/contatos`, { cookie: adv.cookie, corpo: { nome: "Fulano" } })).status).toBe(409);
    expect((await chamar("POST", `/api/clientes/${id}/situacao`, { cookie: socio.cookie, corpo: { ativo: true } })).json.cliente.ativo).toBe(true);
    const acoes = await env.DB.prepare("SELECT acao FROM audit_log WHERE tenant_id = ? AND acao LIKE 'cliente_%ativado' ORDER BY criado_em, id").bind(t).all<{ acao: string }>();
    expect(acoes.results.map((a) => a.acao)).toEqual(["cliente_desativado", "cliente_reativado"]);
  });

  it("busca por nome (sem acento, parcial) e por documento, com paginação e resumo", async () => {
    const { socio } = await cenario();
    await criarCliente(socio.cookie, pf({ nome: "José Antônio Pereira" }));
    await criarCliente(socio.cookie, { tipo: "pj", nome: "Padaria Pão Quente Ltda", documento: CNPJ });
    for (let i = 0; i < 3; i++) await criarCliente(socio.cookie, { tipo: "pf", nome: `Pessoa ${i}` });
    const busca = async (q: string) => (await chamar("GET", `/api/clientes?busca=${encodeURIComponent(q)}`, { cookie: socio.cookie })).json;
    expect((await busca("jose antonio")).total).toBe(1);
    expect((await busca("PAO quente")).total).toBe(1);
    expect((await busca("11.222.333")).total).toBe(1);
    expect((await busca("%")).total).toBe(0);
    const p1 = (await chamar("GET", "/api/clientes?por_pagina=2&pagina=1", { cookie: socio.cookie })).json;
    const p3 = (await chamar("GET", "/api/clientes?por_pagina=2&pagina=3", { cookie: socio.cookie })).json;
    expect(p1.total).toBe(5);
    expect(p1.clientes).toHaveLength(2);
    expect(p3.clientes).toHaveLength(1);
    expect((await chamar("GET", "/api/clientes?tipo=pj", { cookie: socio.cookie })).json.total).toBe(1);
    const r = (await chamar("GET", "/api/clientes/resumo", { cookie: socio.cookie })).json.resumo;
    expect(r).toEqual({ ativos: 5, pf: 4, pj: 1, novos_30_dias: 5 });
  });

  it("exige login e CSRF", async () => {
    const { socio } = await cenario();
    expect((await chamar("GET", "/api/clientes")).status).toBe(401);
    expect((await chamar("POST", "/api/clientes", { cookie: socio.cookie, corpo: pf(), marca: null })).status).toBe(403);
  });
});

describe("contatos e consentimentos LGPD", () => {
  it("CRUD de contatos e registro/revogação de consentimento com auditoria", async () => {
    const { t, socio } = await cenario();
    const id = await criarCliente(socio.cookie);
    const c = await chamar("POST", `/api/clientes/${id}/contatos`, { cookie: socio.cookie, corpo: { nome: "João", cargo: "Sócio", telefone: "(12) 99999-0000", email: "j@x.com" } });
    expect(c.status).toBe(201);
    const cid = c.json.contato.id;
    expect((await chamar("POST", `/api/clientes/${id}/contatos`, { cookie: socio.cookie, corpo: { nome: "" } })).status).toBe(400);
    const e = await chamar("PUT", `/api/clientes/${id}/contatos/${cid}`, { cookie: socio.cookie, corpo: { nome: "João Paulo" } });
    expect(e.json.contato.nome).toBe("João Paulo");
    expect((await chamar("GET", `/api/clientes/${id}/contatos`, { cookie: socio.cookie })).json.contatos).toHaveLength(1);
    expect((await chamar("DELETE", `/api/clientes/${id}/contatos/${cid}`, { cookie: socio.cookie })).status).toBe(200);
    expect((await chamar("GET", `/api/clientes/${id}/contatos`, { cookie: socio.cookie })).json.contatos).toHaveLength(0);

    const corpo = { finalidade: "Atendimento do caso", base_legal: "Execução de contrato", forma: "Termo assinado", data_consentimento: "2026-10-01" };
    const k = await chamar("POST", `/api/clientes/${id}/consentimentos`, { cookie: socio.cookie, corpo });
    expect(k.status).toBe(201);
    expect(k.json.consentimento.revogado_em).toBeNull();
    expect((await chamar("POST", `/api/clientes/${id}/consentimentos`, { cookie: socio.cookie, corpo: { ...corpo, finalidade: "" } })).status).toBe(400);
    expect((await chamar("POST", `/api/clientes/${id}/consentimentos`, { cookie: socio.cookie, corpo: { ...corpo, data_consentimento: "2999-01-01" } })).status).toBe(400);
    const rev = await chamar("POST", `/api/clientes/${id}/consentimentos/${k.json.consentimento.id}/revogar`, { cookie: socio.cookie });
    expect(rev.json.consentimento.revogado_em).not.toBeNull();
    expect((await chamar("POST", `/api/clientes/${id}/consentimentos/${k.json.consentimento.id}/revogar`, { cookie: socio.cookie })).status).toBe(409);
    const acoes = await env.DB.prepare("SELECT acao FROM audit_log WHERE tenant_id = ? AND entidade IN ('clientes_contatos','consentimentos_lgpd') ORDER BY criado_em, id").bind(t).all<{ acao: string }>();
    expect(acoes.results.map((a) => a.acao)).toEqual(["contato_criado", "contato_alterado", "contato_excluido", "consentimento_registrado", "consentimento_revogado"]);
  });
});

describe("anexos", () => {
  it("envia, lista, baixa por link temporário e só o sócio apaga", async () => {
    const { t, socio } = await cenario();
    const adv = await sessaoDeUsuario(t, "advogado");
    const id = await criarCliente(socio.cookie);
    const up = await enviar(adv.cookie, id, "Procuração.pdf", PDF());
    expect(up.status).toBe(201);
    expect(up.json.anexo).toMatchObject({ nome: "Procuração.pdf", tipo_mime: "application/pdf" });
    const aid = up.json.anexo.id;
    const linha = await env.DB.prepare("SELECT chave_r2 FROM anexos WHERE id = ?").bind(aid).first<{ chave_r2: string }>();
    expect(linha!.chave_r2.startsWith(`${t}/cliente/${id}/`)).toBe(true);
    expect(linha!.chave_r2).not.toContain("Procura");
    expect(await env.ARQUIVOS.head(linha!.chave_r2)).not.toBeNull();
    expect((await chamar("GET", `/api/clientes/${id}/anexos`, { cookie: adv.cookie })).json.anexos).toHaveLength(1);

    const link = await chamar("GET", `/api/clientes/${id}/anexos/${aid}/link`, { cookie: adv.cookie });
    expect(link.json.validade_segundos).toBe(300);
    const dl = await baixar(adv.cookie, link.json.url);
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(dl.headers.get("content-disposition")).toContain("Procura%C3%A7%C3%A3o.pdf");
    expect(dl.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await dl.arrayBuffer())).toEqual(PDF());
    const semToken = await baixar(adv.cookie, `/api/clientes/anexos/${aid}/arquivo`);
    expect(semToken.status).toBe(403);
    await semToken.arrayBuffer();

    expect((await chamar("DELETE", `/api/clientes/${id}/anexos/${aid}`, { cookie: adv.cookie })).status).toBe(403);
    expect((await chamar("DELETE", `/api/clientes/${id}/anexos/${aid}`, { cookie: socio.cookie })).status).toBe(200);
    expect(await env.ARQUIVOS.head(linha!.chave_r2)).toBeNull();
    expect((await chamar("GET", `/api/clientes/${id}/anexos`, { cookie: adv.cookie })).json.anexos).toHaveLength(0);
    const acoes = await env.DB.prepare("SELECT acao FROM audit_log WHERE tenant_id = ? AND entidade = 'anexos' ORDER BY criado_em, id").bind(t).all<{ acao: string }>();
    expect(acoes.results.map((a) => a.acao)).toEqual(["anexo_enviado", "anexo_baixado", "anexo_excluido"]);
  });

  it("recusa arquivo acima de 7 MB e aceita exatamente 7 MB", async () => {
    const { socio } = await cenario();
    const id = await criarCliente(socio.cookie);
    const limite = 7 * 1024 * 1024;
    const grande = new Uint8Array(limite + 1);
    grande.set(PDF());
    const r = await enviar(socio.cookie, id, "grande.pdf", grande);
    expect(r.status).toBe(413);
    expect(r.json.erro).toContain("7 MB");
    const exato = new Uint8Array(limite);
    exato.set(PDF());
    expect((await enviar(socio.cookie, id, "exato.pdf", exato)).status).toBe(201);
  });

  it("recusa tipo falsificado: extensão ou Content-Type não decidem", async () => {
    const { socio } = await cenario();
    const id = await criarCliente(socio.cookie);
    const texto = new TextEncoder().encode("<script>alert(1)</script>");
    expect((await enviar(socio.cookie, id, "falso.pdf", texto, { "Content-Type": "application/pdf" })).status).toBe(400);
    expect((await enviar(socio.cookie, id, "foto.png", texto, { "Content-Type": "image/png" })).status).toBe(400);
    expect((await enviar(socio.cookie, id, "programa.exe", new Uint8Array([0x4d, 0x5a, 0x90, 0]))).status).toBe(400);
    // arquivo real com extensão trocada também é recusado
    expect((await enviar(socio.cookie, id, "foto.pdf", PNG())).status).toBe(400);
    expect((await enviar(socio.cookie, id, "vazio.pdf", new Uint8Array(0))).status).toBe(400);
    // ZIP genérico não vira Word/Excel
    expect((await enviar(socio.cookie, id, "x.docx", new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]))).status).toBe(400);
    expect((await enviar(socio.cookie, id, "foto.png", PNG())).status).toBe(201);
    const docx = new Uint8Array([0x50, 0x4b, 3, 4, ...new TextEncoder().encode("word/document.xml")]);
    expect((await enviar(socio.cookie, id, "peca.docx", docx)).status).toBe(201);
    const xlsx = new Uint8Array([0x50, 0x4b, 3, 4, ...new TextEncoder().encode("xl/workbook.xml")]);
    expect((await enviar(socio.cookie, id, "planilha.xls", xlsx)).status).toBe(400);
    expect((await enviar(socio.cookie, id, "planilha.xlsx", xlsx)).status).toBe(201);
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
    expect((await enviar(socio.cookie, id, "velho.doc", ole)).status).toBe(201);
    expect((await enviar(socio.cookie, id, "velho.ppt", ole)).status).toBe(400);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM anexos WHERE entidade_id = ?").bind(id).first<{ n: number }>();
    expect(n!.n).toBe(4);
  });

  it("link expirado ou adulterado é recusado", async () => {
    const { t, socio } = await cenario();
    const id = await criarCliente(socio.cookie);
    const up = await enviar(socio.cookie, id, "a.pdf", PDF());
    const aid = up.json.anexo.id as string;
    const chave = env.CHAVE_CRIPTO;
    const velho = await criarLinkAnexo(t, aid, chave, Date.now() - 6 * 60 * 1000);
    const dl = await baixar(socio.cookie, `/api/clientes/anexos/${aid}/arquivo?token=${velho}`);
    expect(dl.status).toBe(403);
    await dl.arrayBuffer();
    const recente = await criarLinkAnexo(t, aid, chave, Date.now() - 4 * 60 * 1000);
    expect(await verificarLinkAnexo(recente, t, aid, chave)).toBe(true);
    expect(await verificarLinkAnexo(recente, t, aid, chave, Date.now() + 2 * 60 * 1000)).toBe(false);
    const adulterado = recente.slice(0, -2) + (recente.endsWith("AA") ? "BB" : "AA");
    expect(await verificarLinkAnexo(adulterado, t, aid, chave)).toBe(false);
    expect(await verificarLinkAnexo(recente, t, "outro-anexo", chave)).toBe(false);
    expect(await verificarLinkAnexo(recente, "outro-escritorio", aid, chave)).toBe(false);
    const ok = await baixar(socio.cookie, `/api/clientes/anexos/${aid}/arquivo?token=${recente}`);
    expect(ok.status).toBe(200);
    await ok.arrayBuffer();
  });
});

describe("isolamento entre escritórios", () => {
  it("escritório B não lê, altera, baixa nem apaga nada do A", async () => {
    const a = await cenario();
    const b = await cenario();
    const id = await criarCliente(a.socio.cookie, pf());
    const ct = (await chamar("POST", `/api/clientes/${id}/contatos`, { cookie: a.socio.cookie, corpo: { nome: "Contato A" } })).json.contato.id;
    const cons = (await chamar("POST", `/api/clientes/${id}/consentimentos`, { cookie: a.socio.cookie, corpo: { finalidade: "f", forma: "m", data_consentimento: "2026-10-01" } })).json.consentimento.id;
    const aid = (await enviar(a.socio.cookie, id, "a.pdf", PDF())).json.anexo.id as string;
    const linkA = (await chamar("GET", `/api/clientes/${id}/anexos/${aid}/link`, { cookie: a.socio.cookie })).json.url as string;

    const B = b.socio.cookie;
    const naoEncontrado = [
      await chamar("GET", `/api/clientes/${id}`, { cookie: B }),
      await chamar("PUT", `/api/clientes/${id}`, { cookie: B, corpo: pf({ nome: "Invadido" }) }),
      await chamar("POST", `/api/clientes/${id}/situacao`, { cookie: B, corpo: { ativo: false } }),
      await chamar("GET", `/api/clientes/${id}/contatos`, { cookie: B }),
      await chamar("POST", `/api/clientes/${id}/contatos`, { cookie: B, corpo: { nome: "Invasor" } }),
      await chamar("PUT", `/api/clientes/${id}/contatos/${ct}`, { cookie: B, corpo: { nome: "Invasor" } }),
      await chamar("DELETE", `/api/clientes/${id}/contatos/${ct}`, { cookie: B }),
      await chamar("GET", `/api/clientes/${id}/consentimentos`, { cookie: B }),
      await chamar("POST", `/api/clientes/${id}/consentimentos`, { cookie: B, corpo: { finalidade: "f", forma: "m", data_consentimento: "2026-10-01" } }),
      await chamar("POST", `/api/clientes/${id}/consentimentos/${cons}/revogar`, { cookie: B }),
      await chamar("GET", `/api/clientes/${id}/anexos`, { cookie: B }),
      await enviar(B, id, "b.pdf", PDF()),
      await chamar("GET", `/api/clientes/${id}/anexos/${aid}/link`, { cookie: B }),
      await chamar("DELETE", `/api/clientes/${id}/anexos/${aid}`, { cookie: B }),
    ];
    for (const r of naoEncontrado) expect(r.status).toBe(404);

    // lista e busca do B não mostram nada do A
    expect((await chamar("GET", "/api/clientes?situacao=todos", { cookie: B })).json.total).toBe(0);
    expect((await chamar("GET", "/api/clientes?busca=Maria", { cookie: B })).json.total).toBe(0);
    expect((await chamar("GET", "/api/clientes/resumo", { cookie: B })).json.resumo.ativos).toBe(0);

    // o link assinado do A não funciona na sessão do B (assinatura é do escritório A)
    const roubado = await baixar(B, linkA);
    expect(roubado.status).toBe(403);
    await roubado.arrayBuffer();
    // B gera um link válido para o próprio escritório, mas com o id do anexo do A: 404 (não existe no B)
    const meuId = await criarCliente(B);
    const meuAnexo = (await enviar(B, meuId, "b.pdf", PDF())).json.anexo.id as string;
    const linkB = (await chamar("GET", `/api/clientes/${meuId}/anexos/${meuAnexo}/link`, { cookie: B })).json.url as string;
    const tokenB = linkB.split("token=")[1]!;
    const cruzado = await baixar(B, `/api/clientes/anexos/${aid}/arquivo?token=${tokenB}`);
    expect(cruzado.status).toBe(403);
    await cruzado.arrayBuffer();
    const tokenBParaAnexoA = await criarLinkAnexo(b.t, aid, env.CHAVE_CRIPTO);
    const forjado = await baixar(B, `/api/clientes/anexos/${aid}/arquivo?token=${tokenBParaAnexoA}`);
    expect(forjado.status).toBe(404);
    await forjado.arrayBuffer();

    // nada do A mudou
    const intacto = (await chamar("GET", `/api/clientes/${id}`, { cookie: a.socio.cookie })).json.cliente;
    expect(intacto).toMatchObject({ nome: "Maria da Silva", ativo: true });
    expect((await chamar("GET", `/api/clientes/${id}/anexos`, { cookie: a.socio.cookie })).json.anexos).toHaveLength(1);
    // B não consegue amarrar dado a cliente de outro escritório nem direto no banco
    await expect(
      env.DB.prepare("INSERT INTO clientes_contatos (id, tenant_id, cliente_id, nome, criado_em, atualizado_em) VALUES ('x', ?, ?, 'N', 'a', 'a')").bind(b.t, id).run(),
    ).rejects.toThrow();
  });
});
