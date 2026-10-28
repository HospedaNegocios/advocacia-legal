import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { criarGestaoPortal, criarRepositorioPortal } from "../src/server/db/portal";
import { criarAcessoPlataforma, criarRepositorio } from "../src/server/db/repositorio";
import { normalizarItem } from "../src/server/djen/formato";
import { prepararBanco } from "./aplicar-migracoes";
import { ORIGEM, SENHA, chamar, criarEscritorio, novoIp, sessaoDeUsuario, unico } from "./ajuda";
import { criarOab, item } from "./djen-ajuda";

prepararBanco();

const CNJ = "0000001-78.2020.8.26.0100";
const CNJ2 = "1234567-53.2023.8.26.0001";
const PDF = () => new TextEncoder().encode("%PDF-1.4\nconteudo de teste\n%%EOF");


async function criarCliente(cookie: string, nome = "Maria da Silva", consentimento = true) {
  const r = await chamar("POST", "/api/clientes", { cookie, corpo: { tipo: "pf", nome } });
  expect(r.status).toBe(201);
  const id = r.json.cliente.id as string;
  if (consentimento) await darConsentimento(cookie, id);
  return id;
}
async function darConsentimento(cookie: string, clienteId: string) {
  const r = await chamar("POST", `/api/clientes/${clienteId}/consentimentos`, {
    cookie,
    corpo: { finalidade: "Acompanhar o processo pelo portal", forma: "Termo assinado", data_consentimento: "2026-01-10" },
  });
  expect(r.status).toBe(201);
  return r.json.consentimento.id as string;
}
async function criarProcesso(cookie: string, clienteId: string | null, cnj = CNJ) {
  const r = await chamar("POST", "/api/processos", { cookie, corpo: { numero_cnj: cnj, fase: "Conhecimento", tribunal: "TJSP", orgao: "1ª Vara Cível", observacoes: "SEGREDO INTERNO" } });
  expect(r.status, JSON.stringify(r.json)).toBe(201);
  const id = r.json.processo.id as string;
  if (clienteId) {
    const p = await chamar("POST", `/api/processos/${id}/partes`, { cookie, corpo: { cliente_id: clienteId, polo: "ativo" } });
    expect(p.status, JSON.stringify(p.json)).toBe(201);
  }
  return id;
}
async function andamento(cookie: string, processoId: string, descricao: string) {
  const r = await chamar("POST", `/api/processos/${processoId}/andamentos`, { cookie, corpo: { data: "2026-03-01", descricao } });
  expect(r.status).toBe(201);
  return r.json.andamento.id as string;
}
async function enviar(cookie: string, base: string, nome = "doc.pdf", bytes = PDF()) {
  const r = await SELF.fetch(`${ORIGEM}${base}/anexos`, {
    method: "POST",
    headers: { Origin: ORIGEM, "X-Requested-With": "advocacia", Cookie: cookie, "CF-Connecting-IP": novoIp(), "X-Nome-Arquivo": encodeURIComponent(nome), "Content-Type": "application/octet-stream" },
    body: bytes as BodyInit,
  });
  const json = (await r.json()) as any;
  expect(r.status, JSON.stringify(json)).toBe(201);
  return json.anexo.id as string;
}
/** Convida o cliente e conclui o convite como o cliente faria. Devolve o cookie do portal. */
async function acessoDoPortal(cookie: string, clienteId: string, email = `${unico("cli")}@exemplo.com`) {
  const conv = await chamar("POST", `/api/portal-gestao/clientes/${clienteId}/convites`, { cookie, corpo: { email } });
  expect(conv.status, JSON.stringify(conv.json)).toBe(201);
  const token = (conv.json.link as string).split("#")[1]!;
  const fim = await chamar("POST", "/api/portal/convite/concluir", { corpo: { token, senha: SENHA } });
  expect(fim.status, JSON.stringify(fim.json)).toBe(200);
  return { email, cookie: fim.cookie!, acessoId: conv.json.acesso_id as string };
}
const publicarProcesso = (cookie: string, id: string, visivel = true) => chamar("PUT", `/api/portal-gestao/processos/${id}/visibilidade`, { cookie, corpo: { visivel } });
const publicarAndamento = (cookie: string, p: string, a: string, visivel = true) => chamar("PUT", `/api/portal-gestao/processos/${p}/andamentos/${a}/visibilidade`, { cookie, corpo: { visivel } });
const compartilhar = (cookie: string, anexo: string, compartilhado = true) => chamar("PUT", `/api/portal-gestao/anexos/${anexo}/visibilidade`, { cookie, corpo: { compartilhado } });

async function cenario() {
  const t = await criarEscritorio("escritorio");
  const socio = await sessaoDeUsuario(t, "socio");
  const adv = await sessaoDeUsuario(t, "advogado");
  const clienteId = await criarCliente(socio.cookie);
  const processoId = await criarProcesso(socio.cookie, clienteId);
  return { t, socio, adv, clienteId, processoId };
}

async function intimacaoDoProcesso(t: string, extra: Record<string, unknown> = {}, id = 1) {
  const oab = await criarOab(t);
  const repo = criarRepositorio(env.DB, t);
  await repo.intimacoes.inserirDaColeta(oab.id, [normalizarItem(item(id, { texto: `TEXTO INTEGRAL RESERVADO ${id}`, ...extra }))!]);
  const achada = (await repo.intimacoes.pesquisar({})).itens.find((i) => i.comunicacao_id === String(id))!;
  return { repo, id: achada.id };
}
async function resumoAprovado(repo: ReturnType<typeof criarRepositorio>, intimacaoId: string, userId: string, texto = "Resumo simples do que aconteceu.") {
  expect(await repo.resumosIa.salvarRascunho(intimacaoId, { texto, modelo: "m", geradoPor: userId }, new Date().toISOString())).toBe(true);
  expect(await repo.resumosIa.decidir(intimacaoId, "aprovado", userId, new Date().toISOString())).toBe(true);
}

describe("visibilidade padrão: nada aparece", () => {
  it("cliente com acesso, mas nada publicado, não vê processo, andamento, documento nem resumo", async () => {
    const { t, socio, clienteId, processoId } = await cenario();
    const a = await andamento(socio.cookie, processoId, "Despacho interno");
    const doc = await enviar(socio.cookie, `/api/processos/${processoId}`);
    const docCliente = await enviar(socio.cookie, `/api/clientes/${clienteId}`);
    const { repo, id } = await intimacaoDoProcesso(t);
    await resumoAprovado(repo, id, socio.id);
    const portal = await acessoDoPortal(socio.cookie, clienteId);

    expect((await chamar("GET", "/api/portal/processos", { cookie: portal.cookie })).json.processos).toEqual([]);
    expect((await chamar("GET", `/api/portal/processos/${processoId}`, { cookie: portal.cookie })).status).toBe(404);
    expect((await chamar("GET", "/api/portal/documentos", { cookie: portal.cookie })).json.documentos).toEqual([]);
    expect((await chamar("GET", `/api/portal/anexos/${doc}/link`, { cookie: portal.cookie })).status).toBe(404);
    expect((await chamar("GET", `/api/portal/anexos/${docCliente}/link`, { cookie: portal.cookie })).status).toBe(404);
    // Os marcadores nascem em zero no banco.
    const m = await env.DB.prepare("SELECT (SELECT visivel_portal FROM processos WHERE id = ?) AS p, (SELECT visivel_portal FROM processos_andamentos WHERE id = ?) AS a, (SELECT compartilhado_cliente FROM anexos WHERE id = ?) AS d, (SELECT COUNT(*) FROM portal_resumos_publicados WHERE tenant_id = ?) AS r")
      .bind(processoId, a, doc, t)
      .first<any>();
    expect(m).toEqual({ p: 0, a: 0, d: 0, r: 0 });
  });
});

describe("processo, andamentos e documentos", () => {
  it("publicar e retirar processo; andamento só aparece se marcado; processo mostra só campos permitidos", async () => {
    const { socio, adv, clienteId, processoId } = await cenario();
    const a1 = await andamento(socio.cookie, processoId, "Audiência marcada para março");
    const a2 = await andamento(socio.cookie, processoId, "Anotação reservada do escritório");
    const portal = await acessoDoPortal(adv.cookie, clienteId);

    expect((await publicarProcesso(adv.cookie, processoId)).json).toEqual({ ok: true, visivel_portal: true });
    const lista = await chamar("GET", "/api/portal/processos", { cookie: portal.cookie });
    expect(lista.json.processos).toEqual([{ id: processoId, numero_cnj: "00000017820208260100", fase: "Conhecimento", tribunal: "TJSP", orgao: "1ª Vara Cível" }]);
    let det = await chamar("GET", `/api/portal/processos/${processoId}`, { cookie: portal.cookie });
    expect(det.status).toBe(200);
    expect(det.json.andamentos).toEqual([]);
    expect(JSON.stringify(det.json)).not.toContain("SEGREDO INTERNO");

    await publicarAndamento(adv.cookie, processoId, a1);
    det = await chamar("GET", `/api/portal/processos/${processoId}`, { cookie: portal.cookie });
    expect(det.json.andamentos).toEqual([{ id: a1, data: "2026-03-01", descricao: "Audiência marcada para março" }]);
    expect(JSON.stringify(det.json)).not.toContain("reservada");

    // Retirar o andamento e depois o processo esconde na hora.
    await publicarAndamento(adv.cookie, processoId, a1, false);
    det = await chamar("GET", `/api/portal/processos/${processoId}`, { cookie: portal.cookie });
    expect(det.json.andamentos).toEqual([]);
    await publicarAndamento(adv.cookie, processoId, a2);
    await publicarProcesso(adv.cookie, processoId, false);
    expect((await chamar("GET", `/api/portal/processos/${processoId}`, { cookie: portal.cookie })).status).toBe(404);
    expect((await chamar("GET", "/api/portal/processos", { cookie: portal.cookie })).json.processos).toEqual([]);
    // Republicar o processo NÃO republica sozinho o andamento retirado antes, mas o a2 (marcado) aparece.
    await publicarProcesso(adv.cookie, processoId);
    det = await chamar("GET", `/api/portal/processos/${processoId}`, { cookie: portal.cookie });
    expect(det.json.andamentos.map((x: any) => x.id)).toEqual([a2]);
  });

  it("o escritório vê os marcadores nas telas de gestão", async () => {
    const { socio, clienteId, processoId } = await cenario();
    const a = await andamento(socio.cookie, processoId, "x");
    const doc = await enviar(socio.cookie, `/api/processos/${processoId}`);
    await acessoDoPortal(socio.cookie, clienteId);
    await publicarProcesso(socio.cookie, processoId);
    await publicarAndamento(socio.cookie, processoId, a);
    await compartilhar(socio.cookie, doc);
    expect((await chamar("GET", `/api/processos/${processoId}`, { cookie: socio.cookie })).json.processo.visivel_portal).toBe(true);
    expect((await chamar("GET", `/api/processos/${processoId}/andamentos`, { cookie: socio.cookie })).json.andamentos[0].visivel_portal).toBe(true);
    expect((await chamar("GET", `/api/processos/${processoId}/anexos`, { cookie: socio.cookie })).json.anexos[0].compartilhado_cliente).toBe(true);
  });

  it("processo desativado some do portal e não pode ser publicado; andamento de processo desativado idem", async () => {
    const { socio, clienteId, processoId } = await cenario();
    const a = await andamento(socio.cookie, processoId, "x");
    const portal = await acessoDoPortal(socio.cookie, clienteId);
    await publicarProcesso(socio.cookie, processoId);
    await publicarAndamento(socio.cookie, processoId, a);
    await chamar("POST", `/api/processos/${processoId}/situacao`, { cookie: socio.cookie, corpo: { ativo: false } });
    expect((await chamar("GET", "/api/portal/processos", { cookie: portal.cookie })).json.processos).toEqual([]);
    expect((await chamar("GET", `/api/portal/processos/${processoId}`, { cookie: portal.cookie })).status).toBe(404);
    expect((await publicarProcesso(socio.cookie, processoId)).status).toBe(409);
    expect((await publicarAndamento(socio.cookie, processoId, a)).status).toBe(409);
    // Retirar continua permitido.
    expect((await publicarProcesso(socio.cookie, processoId, false)).status).toBe(200);
  });

  it("documentos: só compartilhado baixa; retirar vale mesmo com link já gerado", async () => {
    const { socio, clienteId, processoId } = await cenario();
    const doc = await enviar(socio.cookie, `/api/processos/${processoId}`, "Petição.pdf");
    const meu = await enviar(socio.cookie, `/api/clientes/${clienteId}`, "Procuração.pdf");
    const portal = await acessoDoPortal(socio.cookie, clienteId);
    await publicarProcesso(socio.cookie, processoId);
    await compartilhar(socio.cookie, doc);
    await compartilhar(socio.cookie, meu);

    const det = await chamar("GET", `/api/portal/processos/${processoId}`, { cookie: portal.cookie });
    expect(det.json.documentos.map((d: any) => d.nome)).toEqual(["Petição.pdf"]);
    expect((await chamar("GET", "/api/portal/documentos", { cookie: portal.cookie })).json.documentos.map((d: any) => d.nome)).toEqual(["Procuração.pdf"]);

    const link = await chamar("GET", `/api/portal/anexos/${doc}/link`, { cookie: portal.cookie });
    expect(link.json.validade_segundos).toBe(300);
    const dl = await SELF.fetch(`${ORIGEM}${link.json.url}`, { headers: { Cookie: portal.cookie, "CF-Connecting-IP": novoIp() } });
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(new Uint8Array(await dl.arrayBuffer())).toEqual(PDF());

    // Link sem token ou com token de outro documento não vale.
    const sem = await SELF.fetch(`${ORIGEM}/api/portal/anexos/${doc}/arquivo`, { headers: { Cookie: portal.cookie, "CF-Connecting-IP": novoIp() } });
    expect(sem.status).toBe(403);
    await sem.arrayBuffer();
    const link2 = await chamar("GET", `/api/portal/anexos/${meu}/link`, { cookie: portal.cookie });
    const troca = await SELF.fetch(`${ORIGEM}/api/portal/anexos/${doc}/arquivo?token=${link2.json.url.split("token=")[1]}`, { headers: { Cookie: portal.cookie, "CF-Connecting-IP": novoIp() } });
    expect(troca.status).toBe(403);
    await troca.arrayBuffer();

    // Retirar o compartilhamento: o link antigo deixa de funcionar na hora.
    await compartilhar(socio.cookie, doc, false);
    const depois = await SELF.fetch(`${ORIGEM}${link.json.url}`, { headers: { Cookie: portal.cookie, "CF-Connecting-IP": novoIp() } });
    expect(depois.status).toBe(404);
    await depois.arrayBuffer();
    // Documento de processo cujo processo foi retirado também some, mesmo compartilhado.
    await compartilhar(socio.cookie, doc);
    await publicarProcesso(socio.cookie, processoId, false);
    expect((await chamar("GET", `/api/portal/anexos/${doc}/link`, { cookie: portal.cookie })).status).toBe(404);
  });

  it("link de download do escritório não serve no portal e vice-versa", async () => {
    const { socio, clienteId, processoId } = await cenario();
    const doc = await enviar(socio.cookie, `/api/processos/${processoId}`);
    const portal = await acessoDoPortal(socio.cookie, clienteId);
    await publicarProcesso(socio.cookie, processoId);
    await compartilhar(socio.cookie, doc);
    const deles = await chamar("GET", `/api/processos/${processoId}/anexos/${doc}/link`, { cookie: socio.cookie });
    const token = deles.json.url.split("token=")[1];
    const r = await SELF.fetch(`${ORIGEM}/api/portal/anexos/${doc}/arquivo?token=${token}`, { headers: { Cookie: portal.cookie, "CF-Connecting-IP": novoIp() } });
    expect(r.status).toBe(403);
    await r.arrayBuffer();
    const meu = await chamar("GET", `/api/portal/anexos/${doc}/link`, { cookie: portal.cookie });
    const r2 = await SELF.fetch(`${ORIGEM}/api/processos/anexos/${doc}/arquivo?token=${meu.json.url.split("token=")[1]}`, { headers: { Cookie: socio.cookie, "CF-Connecting-IP": novoIp() } });
    expect(r2.status).toBe(403);
    await r2.arrayBuffer();
  });
});

describe("resumos de intimações", () => {
  it("só resumo aprovado e com processo vinculado é publicado; o texto da intimação nunca vai ao portal", async () => {
    const { t, socio, adv, clienteId, processoId } = await cenario();
    const portal = await acessoDoPortal(socio.cookie, clienteId);
    await publicarProcesso(socio.cookie, processoId);
    const { repo, id } = await intimacaoDoProcesso(t);

    // Sem resumo, rascunho e rejeitado: não publica.
    expect((await chamar("POST", `/api/portal-gestao/intimacoes/${id}/resumo/publicar`, { cookie: adv.cookie })).status).toBe(404);
    await repo.resumosIa.salvarRascunho(id, { texto: "Rascunho ainda não revisado", modelo: "m", geradoPor: adv.id }, new Date().toISOString());
    const rasc = await chamar("POST", `/api/portal-gestao/intimacoes/${id}/resumo/publicar`, { cookie: adv.cookie });
    expect(rasc.status).toBe(409);
    expect(rasc.json.erro).toMatch(/aprovado/);
    await repo.resumosIa.decidir(id, "rejeitado", adv.id, new Date().toISOString());
    expect((await chamar("POST", `/api/portal-gestao/intimacoes/${id}/resumo/publicar`, { cookie: adv.cookie })).status).toBe(409);
    expect((await chamar("GET", `/api/portal/processos/${processoId}`, { cookie: portal.cookie })).json.resumos).toEqual([]);

    // Aprovado, mas ainda não publicado: o cliente não vê.
    await repo.resumosIa.salvarRascunho(id, { texto: "Foi marcada uma audiência.", modelo: "m", geradoPor: adv.id }, new Date().toISOString());
    await repo.resumosIa.decidir(id, "aprovado", adv.id, new Date().toISOString());
    expect((await chamar("GET", `/api/portal/processos/${processoId}`, { cookie: portal.cookie })).json.resumos).toEqual([]);

    expect((await chamar("POST", `/api/portal-gestao/intimacoes/${id}/resumo/publicar`, { cookie: adv.cookie })).json).toEqual({ ok: true, publicado: true });
    const det = await chamar("GET", `/api/portal/processos/${processoId}`, { cookie: portal.cookie });
    expect(det.json.resumos).toEqual([{ texto: "Foi marcada uma audiência.", data_disponibilizacao: expect.any(String), publicado_em: expect.any(String) }]);
    expect(JSON.stringify(det.json)).not.toContain("TEXTO INTEGRAL RESERVADO");
    // O escritório vê a situação de publicação no resumo.
    expect((await chamar("GET", `/api/intimacoes/${id}/resumo`, { cookie: socio.cookie })).json.resumo.publicado_portal_em).toBeTruthy();

    // Retirar esconde na hora.
    await chamar("POST", `/api/portal-gestao/intimacoes/${id}/resumo/retirar`, { cookie: adv.cookie });
    expect((await chamar("GET", `/api/portal/processos/${processoId}`, { cookie: portal.cookie })).json.resumos).toEqual([]);
    expect((await chamar("GET", `/api/intimacoes/${id}/resumo`, { cookie: socio.cookie })).json.resumo.publicado_portal_em).toBeNull();
  });

  it("rejeitar o resumo (retirar a aprovação) tira do portal e uma nova aprovação não republica sozinha", async () => {
    const { t, socio, clienteId, processoId } = await cenario();
    const portal = await acessoDoPortal(socio.cookie, clienteId);
    await publicarProcesso(socio.cookie, processoId);
    const { repo, id } = await intimacaoDoProcesso(t);
    await resumoAprovado(repo, id, socio.id);
    await chamar("POST", `/api/portal-gestao/intimacoes/${id}/resumo/publicar`, { cookie: socio.cookie });
    expect((await chamar("GET", `/api/portal/processos/${processoId}`, { cookie: portal.cookie })).json.resumos).toHaveLength(1);

    const rej = await chamar("POST", `/api/intimacoes/${id}/resumo/rejeitar`, { cookie: socio.cookie });
    expect(rej.status).toBe(200);
    expect(rej.json.resumo.publicado_portal_em).toBeNull();
    expect((await chamar("GET", `/api/portal/processos/${processoId}`, { cookie: portal.cookie })).json.resumos).toEqual([]);
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM portal_resumos_publicados WHERE intimacao_id = ?").bind(id).first<any>()).n).toBe(0);

    await resumoAprovado(repo, id, socio.id, "Novo resumo aprovado.");
    expect((await chamar("GET", `/api/portal/processos/${processoId}`, { cookie: portal.cookie })).json.resumos).toEqual([]);
  });

  it("o banco recusa publicar resumo que não está aprovado (defesa em profundidade)", async () => {
    const { t, socio } = await cenario();
    const { repo, id } = await intimacaoDoProcesso(t);
    await repo.resumosIa.salvarRascunho(id, { texto: "r", modelo: "m", geradoPor: socio.id }, new Date().toISOString());
    // Mesmo que a publicação entrasse por outro caminho, a leitura do portal exige 'aprovado'.
    await env.DB.prepare("INSERT INTO portal_resumos_publicados (tenant_id, intimacao_id, publicado_por, publicado_em) VALUES (?, ?, ?, ?)").bind(t, id, socio.id, "2026-01-01T00:00:00Z").run();
    const { clienteId, processoId } = await (async () => {
      const clienteId = await criarCliente(socio.cookie, "Outro");
      const processoId = await criarProcesso(socio.cookie, clienteId, CNJ2);
      return { clienteId, processoId };
    })();
    const portal = await acessoDoPortal(socio.cookie, clienteId);
    await publicarProcesso(socio.cookie, processoId);
    expect((await chamar("GET", `/api/portal/processos/${processoId}`, { cookie: portal.cookie })).json.resumos).toEqual([]);
  });

  it("sem processo vinculado não publica", async () => {
    const t = await criarEscritorio("escritorio");
    const socio = await sessaoDeUsuario(t, "socio");
    const { repo, id } = await intimacaoDoProcesso(t); // nenhum processo com este número no escritório
    await resumoAprovado(repo, id, socio.id);
    const r = await chamar("POST", `/api/portal-gestao/intimacoes/${id}/resumo/publicar`, { cookie: socio.cookie });
    expect(r.status).toBe(409);
    expect(r.json.erro).toMatch(/processo/);
  });
});

describe("convites e acesso", () => {
  it("exige cliente ativo e consentimento LGPD; e-mail inválido; só sócio e advogado", async () => {
    const t = await criarEscritorio("escritorio");
    const socio = await sessaoDeUsuario(t, "socio");
    const est = await sessaoDeUsuario(t, "estagiario");
    const sec = await sessaoDeUsuario(t, "secretaria");
    const semConsent = await criarCliente(socio.cookie, "Sem consentimento", false);
    const r = await chamar("POST", `/api/portal-gestao/clientes/${semConsent}/convites`, { cookie: socio.cookie, corpo: { email: "a@b.com" } });
    expect(r.status).toBe(409);
    expect(r.json.erro).toMatch(/consentimento/i);

    const comConsent = await criarCliente(socio.cookie, "Com consentimento");
    expect((await chamar("POST", `/api/portal-gestao/clientes/${comConsent}/convites`, { cookie: socio.cookie, corpo: { email: "sem-arroba" } })).status).toBe(400);
    for (const outro of [est, sec]) {
      expect((await chamar("POST", `/api/portal-gestao/clientes/${comConsent}/convites`, { cookie: outro.cookie, corpo: { email: "a@b.com" } })).status).toBe(403);
      expect((await chamar("GET", `/api/portal-gestao/clientes/${comConsent}`, { cookie: outro.cookie })).status).toBe(403);
      expect((await publicarProcesso(outro.cookie, "x")).status).toBe(403);
    }
    // Cliente desativado.
    await chamar("POST", `/api/clientes/${comConsent}/situacao`, { cookie: socio.cookie, corpo: { ativo: false } });
    expect((await chamar("POST", `/api/portal-gestao/clientes/${comConsent}/convites`, { cookie: socio.cookie, corpo: { email: "a@b.com" } })).status).toBe(409);
    // Sem login: negado.
    expect((await chamar("POST", `/api/portal-gestao/clientes/${comConsent}/convites`, { corpo: { email: "a@b.com" } })).status).toBe(401);
  });

  it("link de uso único: valida, conclui, não vale de novo; senha curta é recusada; convite novo invalida o anterior", async () => {
    const { socio, clienteId } = await cenario();
    const email = `${unico("c")}@exemplo.com`;
    const c1 = await chamar("POST", `/api/portal-gestao/clientes/${clienteId}/convites`, { cookie: socio.cookie, corpo: { email } });
    expect(c1.json.reenvio).toBe(false);
    const t1 = (c1.json.link as string).split("#")[1]!;
    expect(c1.json.link).toContain("/portal/convite#");
    const c2 = await chamar("POST", `/api/portal-gestao/clientes/${clienteId}/convites`, { cookie: socio.cookie, corpo: { email: email.toUpperCase() } });
    expect(c2.json.reenvio).toBe(true);
    expect(c2.json.acesso_id).toBe(c1.json.acesso_id);
    const t2 = (c2.json.link as string).split("#")[1]!;
    expect((await chamar("POST", "/api/portal/convite/validar", { corpo: { token: t1 } })).status).toBe(400);

    const val = await chamar("POST", "/api/portal/convite/validar", { corpo: { token: t2 } });
    expect(val.status).toBe(200);
    expect(val.json.email).toBe(email);
    expect((await chamar("POST", "/api/portal/convite/concluir", { corpo: { token: t2, senha: "curta" } })).status).toBe(400);
    const ok = await chamar("POST", "/api/portal/convite/concluir", { corpo: { token: t2, senha: SENHA } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toMatch(/^__Host-portal=/);
    expect(ok.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect(ok.headers.get("set-cookie")).toMatch(/Secure/i);
    expect(ok.headers.get("set-cookie")).toMatch(/SameSite=Strict/i);
    expect((await chamar("POST", "/api/portal/convite/concluir", { corpo: { token: t2, senha: SENHA } })).status).toBe(400);
    expect((await chamar("POST", "/api/portal/convite/concluir", { corpo: { token: "x".repeat(43), senha: SENHA } })).status).toBe(400);
    // O token nunca fica guardado em claro.
    expect((await env.DB.prepare("SELECT COUNT(*) AS n FROM portal_convites WHERE id = ?").bind(t2).first<any>()).n).toBe(0);
  });

  it("convite expirado não vale", async () => {
    const { socio, clienteId } = await cenario();
    const c = await chamar("POST", `/api/portal-gestao/clientes/${clienteId}/convites`, { cookie: socio.cookie, corpo: { email: `${unico("c")}@exemplo.com` } });
    await env.DB.prepare("UPDATE portal_convites SET expira_em = '2020-01-01T00:00:00Z' WHERE portal_usuario_id = ?").bind(c.json.acesso_id).run();
    expect((await chamar("POST", "/api/portal/convite/validar", { corpo: { token: (c.json.link as string).split("#")[1] } })).status).toBe(400);
  });

  it("o mesmo e-mail não pode ser de dois clientes do mesmo escritório", async () => {
    const { socio, clienteId } = await cenario();
    const outro = await criarCliente(socio.cookie, "Outra pessoa");
    const email = `${unico("c")}@exemplo.com`;
    await acessoDoPortal(socio.cookie, clienteId, email);
    const r = await chamar("POST", `/api/portal-gestao/clientes/${outro}/convites`, { cookie: socio.cookie, corpo: { email } });
    expect(r.status).toBe(409);
  });

  it("login: senha errada, bloqueio após 5 erros, escolha de escritório, saída", async () => {
    const { socio, clienteId } = await cenario();
    const portal = await acessoDoPortal(socio.cookie, clienteId);
    expect((await chamar("GET", "/api/portal/eu", { cookie: portal.cookie })).json).toMatchObject({ ok: true, email: portal.email, cliente: { nome: "Maria da Silva" } });

    const bom = await chamar("POST", "/api/portal/entrar", { corpo: { email: portal.email, senha: SENHA } });
    expect(bom.status).toBe(200);
    expect(bom.json.etapa).toBe("ok");
    expect((await chamar("GET", "/api/portal/eu", { cookie: bom.cookie! })).status).toBe(200);
    expect((await chamar("POST", "/api/portal/sair", { cookie: bom.cookie! })).status).toBe(200);
    expect((await chamar("GET", "/api/portal/eu", { cookie: bom.cookie! })).status).toBe(401);

    for (let i = 0; i < 5; i++) {
      const r = await chamar("POST", "/api/portal/entrar", { corpo: { email: portal.email, senha: "senha-errada-123" } });
      expect(r.status).toBe(401);
    }
    // Bloqueado mesmo com a senha certa.
    expect((await chamar("POST", "/api/portal/entrar", { corpo: { email: portal.email, senha: SENHA } })).status).toBe(401);
    // E-mail inexistente dá a mesma resposta.
    const nada = await chamar("POST", "/api/portal/entrar", { corpo: { email: "naoexiste@exemplo.com", senha: SENHA } });
    expect(nada.status).toBe(401);
  });

  it("limite de tentativas por IP", async () => {
    const ip = novoIp();
    let ultimo = 0;
    for (let i = 0; i < 22; i++) {
      ultimo = (await chamar("POST", "/api/portal/entrar", { ip, corpo: { email: `x${i}@exemplo.com`, senha: "qualquer-coisa-1" } })).status;
    }
    expect(ultimo).toBe(429);
  });

  it("mesmo e-mail em dois escritórios: escolhe o escritório depois de conferir a senha", async () => {
    const a = await cenario();
    const b = await cenario();
    const email = `${unico("dup")}@exemplo.com`;
    await acessoDoPortal(a.socio.cookie, a.clienteId, email);
    await acessoDoPortal(b.socio.cookie, b.clienteId, email);
    const ip = novoIp();
    const r = await chamar("POST", "/api/portal/entrar", { ip, corpo: { email, senha: SENHA } });
    expect(r.json.etapa).toBe("escolher_escritorio");
    expect(r.json.escritorios).toHaveLength(2);
    expect(r.cookie).toBeNull();
    const r2 = await chamar("POST", "/api/portal/entrar", { ip, corpo: { email, senha: SENHA, escritorio_id: b.t } });
    expect(r2.json.etapa).toBe("ok");
    // A sessão é do escritório B.
    await publicarProcesso(b.socio.cookie, b.processoId);
    expect((await chamar("GET", "/api/portal/processos", { cookie: r2.cookie! })).json.processos).toHaveLength(1);
    expect((await chamar("GET", `/api/portal/processos/${a.processoId}`, { cookie: r2.cookie! })).status).toBe(404);
  });

  it("desativar o acesso derruba a sessão na hora; reativar exige consentimento; revogar consentimento bloqueia", async () => {
    const { socio, clienteId } = await cenario();
    const portal = await acessoDoPortal(socio.cookie, clienteId);
    expect((await chamar("GET", "/api/portal/eu", { cookie: portal.cookie })).status).toBe(200);
    const des = await chamar("POST", `/api/portal-gestao/acessos/${portal.acessoId}/situacao`, { cookie: socio.cookie, corpo: { ativo: false } });
    expect(des.json.acesso.ativo).toBe(false);
    expect((await chamar("GET", "/api/portal/eu", { cookie: portal.cookie })).status).toBe(401);
    expect((await chamar("POST", "/api/portal/entrar", { corpo: { email: portal.email, senha: SENHA } })).status).toBe(401);
    expect((await chamar("POST", `/api/portal-gestao/clientes/${clienteId}/convites`, { cookie: socio.cookie, corpo: { email: portal.email } })).status).toBe(409);

    const rea = await chamar("POST", `/api/portal-gestao/acessos/${portal.acessoId}/situacao`, { cookie: socio.cookie, corpo: { ativo: true } });
    expect(rea.status).toBe(200);
    const novo = await chamar("POST", "/api/portal/entrar", { corpo: { email: portal.email, senha: SENHA } });
    expect(novo.json.etapa).toBe("ok");

    // Revogar TODOS os consentimentos tira o acesso, inclusive a sessão aberta.
    const lista = await chamar("GET", `/api/clientes/${clienteId}/consentimentos`, { cookie: socio.cookie });
    for (const k of lista.json.consentimentos) await chamar("POST", `/api/clientes/${clienteId}/consentimentos/${k.id}/revogar`, { cookie: socio.cookie });
    expect((await chamar("GET", "/api/portal/eu", { cookie: novo.cookie! })).status).toBe(401);
    expect((await chamar("POST", "/api/portal/entrar", { corpo: { email: portal.email, senha: SENHA } })).status).toBe(401);
    expect((await chamar("POST", `/api/portal-gestao/acessos/${portal.acessoId}/situacao`, { cookie: socio.cookie, corpo: { ativo: true } })).status).toBe(409);
  });

  it("cliente desativado ou escritório suspenso perdem o acesso", async () => {
    const a = await cenario();
    const pa = await acessoDoPortal(a.socio.cookie, a.clienteId);
    await chamar("POST", `/api/clientes/${a.clienteId}/situacao`, { cookie: a.socio.cookie, corpo: { ativo: false } });
    expect((await chamar("GET", "/api/portal/eu", { cookie: pa.cookie })).status).toBe(401);

    const b = await cenario();
    const pb = await acessoDoPortal(b.socio.cookie, b.clienteId);
    expect((await chamar("GET", "/api/portal/eu", { cookie: pb.cookie })).status).toBe(200);
    await criarAcessoPlataforma(env.DB).atualizarEscritorio(b.t, { status: "suspenso" });
    expect((await chamar("GET", "/api/portal/eu", { cookie: pb.cookie })).status).toBe(401);
  });

  it("lista de acessos do cliente mostra convite pendente e último acesso, sem hash", async () => {
    const { socio, clienteId } = await cenario();
    const email = `${unico("c")}@exemplo.com`;
    await chamar("POST", `/api/portal-gestao/clientes/${clienteId}/convites`, { cookie: socio.cookie, corpo: { email } });
    const r = await chamar("GET", `/api/portal-gestao/clientes/${clienteId}`, { cookie: socio.cookie });
    expect(r.json).toMatchObject({ cliente_ativo: true, consentimento_ativo: true });
    expect(r.json.acessos).toHaveLength(1);
    expect(r.json.acessos[0]).toMatchObject({ email, ativo: true, convite_pendente: true, ultimo_acesso_em: null });
    expect(JSON.stringify(r.json)).not.toMatch(/senha|hash|salt/i);
    // Convite pendente não entra.
    expect((await chamar("POST", "/api/portal/entrar", { corpo: { email, senha: SENHA } })).status).toBe(401);
  });
});

describe("isolamento", () => {
  it("clientes do mesmo escritório só veem o que é deles", async () => {
    const { t, socio, clienteId, processoId } = await cenario();
    const outroCliente = await criarCliente(socio.cookie, "Joana Souza");
    const processoDela = await criarProcesso(socio.cookie, outroCliente, CNJ2);
    const docDele = await enviar(socio.cookie, `/api/processos/${processoId}`, "dele.pdf");
    const docDela = await enviar(socio.cookie, `/api/processos/${processoDela}`, "dela.pdf");
    const cadDela = await enviar(socio.cookie, `/api/clientes/${outroCliente}`, "cadastro-dela.pdf");
    const pm = await acessoDoPortal(socio.cookie, clienteId);
    const pj = await acessoDoPortal(socio.cookie, outroCliente);
    for (const p of [processoId, processoDela]) await publicarProcesso(socio.cookie, p);
    for (const d of [docDele, docDela, cadDela]) await compartilhar(socio.cookie, d);
    const { repo, id } = await intimacaoDoProcesso(t, { numero_processo: "12345675320238260001", numeroprocessocommascara: CNJ2 });
    await resumoAprovado(repo, id, socio.id, "Resumo da Joana.");
    await chamar("POST", `/api/portal-gestao/intimacoes/${id}/resumo/publicar`, { cookie: socio.cookie });

    const minha = await chamar("GET", "/api/portal/processos", { cookie: pm.cookie });
    expect(minha.json.processos.map((p: any) => p.id)).toEqual([processoId]);
    expect((await chamar("GET", `/api/portal/processos/${processoDela}`, { cookie: pm.cookie })).status).toBe(404);
    expect((await chamar("GET", `/api/portal/anexos/${docDela}/link`, { cookie: pm.cookie })).status).toBe(404);
    expect((await chamar("GET", `/api/portal/anexos/${cadDela}/link`, { cookie: pm.cookie })).status).toBe(404);
    expect((await chamar("GET", "/api/portal/documentos", { cookie: pm.cookie })).json.documentos).toEqual([]);
    const dele = await chamar("GET", `/api/portal/processos/${processoId}`, { cookie: pm.cookie });
    expect(dele.json.documentos.map((d: any) => d.nome)).toEqual(["dele.pdf"]);
    expect(dele.json.resumos).toEqual([]);

    const dela = await chamar("GET", `/api/portal/processos/${processoDela}`, { cookie: pj.cookie });
    expect(dela.json.resumos.map((r: any) => r.texto)).toEqual(["Resumo da Joana."]);
    expect((await chamar("GET", "/api/portal/documentos", { cookie: pj.cookie })).json.documentos.map((d: any) => d.nome)).toEqual(["cadastro-dela.pdf"]);
  });

  it("processo com dois clientes como partes: ambos veem o processo, mas cada um só os seus documentos de cadastro", async () => {
    const { socio, clienteId, processoId } = await cenario();
    const segundo = await criarCliente(socio.cookie, "Sócio da Maria");
    await chamar("POST", `/api/processos/${processoId}/partes`, { cookie: socio.cookie, corpo: { cliente_id: segundo, polo: "ativo" } });
    const p1 = await acessoDoPortal(socio.cookie, clienteId);
    const p2 = await acessoDoPortal(socio.cookie, segundo);
    await publicarProcesso(socio.cookie, processoId);
    expect((await chamar("GET", "/api/portal/processos", { cookie: p1.cookie })).json.processos).toHaveLength(1);
    expect((await chamar("GET", "/api/portal/processos", { cookie: p2.cookie })).json.processos).toHaveLength(1);
  });

  it("escritórios diferentes: nada vaza e o gestor de um não mexe nos itens do outro", async () => {
    const a = await cenario();
    const b = await cenario();
    const docA = await enviar(a.socio.cookie, `/api/processos/${a.processoId}`);
    const pa = await acessoDoPortal(a.socio.cookie, a.clienteId);
    const pb = await acessoDoPortal(b.socio.cookie, b.clienteId);
    await publicarProcesso(a.socio.cookie, a.processoId);
    await compartilhar(a.socio.cookie, docA);
    // Mesmo número CNJ no escritório B (cenario usa o mesmo número) não aparece para o cliente de B.
    expect((await chamar("GET", "/api/portal/processos", { cookie: pb.cookie })).json.processos).toEqual([]);
    expect((await chamar("GET", `/api/portal/processos/${a.processoId}`, { cookie: pb.cookie })).status).toBe(404);
    expect((await chamar("GET", `/api/portal/anexos/${docA}/link`, { cookie: pb.cookie })).status).toBe(404);
    expect((await chamar("GET", "/api/portal/processos", { cookie: pa.cookie })).json.processos).toHaveLength(1);

    // O sócio de B não consegue publicar nem convidar sobre dados de A.
    expect((await publicarProcesso(b.socio.cookie, a.processoId, false)).status).toBe(404);
    expect((await publicarProcesso(b.socio.cookie, a.processoId)).status).toBe(404);
    expect((await compartilhar(b.socio.cookie, docA, false)).status).toBe(404);
    expect((await chamar("POST", `/api/portal-gestao/clientes/${a.clienteId}/convites`, { cookie: b.socio.cookie, corpo: { email: "x@exemplo.com" } })).status).toBe(404);
    expect((await chamar("GET", `/api/portal-gestao/clientes/${a.clienteId}`, { cookie: b.socio.cookie })).status).toBe(404);
    expect((await chamar("POST", `/api/portal-gestao/acessos/${pa.acessoId}/situacao`, { cookie: b.socio.cookie, corpo: { ativo: false } })).status).toBe(404);
    expect((await chamar("GET", "/api/portal/eu", { cookie: pa.cookie })).status).toBe(200);
    // O processo de A continua publicado.
    expect((await chamar("GET", `/api/processos/${a.processoId}`, { cookie: a.socio.cookie })).json.processo.visivel_portal).toBe(true);
  });

  it("tenant_id e cliente_id enviados pelo navegador são ignorados", async () => {
    const a = await cenario();
    const b = await cenario();
    await acessoDoPortal(a.socio.cookie, a.clienteId);
    const pb = await acessoDoPortal(b.socio.cookie, b.clienteId);
    await publicarProcesso(a.socio.cookie, a.processoId);
    const r = await chamar("GET", `/api/portal/processos?tenant_id=${a.t}&cliente_id=${a.clienteId}`, { cookie: pb.cookie });
    expect(r.json.processos).toEqual([]);
  });
});

describe("sessões separadas", () => {
  it("o cookie do portal não abre rotas do escritório e o do escritório não abre o portal", async () => {
    const { socio, clienteId, processoId } = await cenario();
    const portal = await acessoDoPortal(socio.cookie, clienteId);
    await publicarProcesso(socio.cookie, processoId);
    for (const rota of ["/api/eu", "/api/clientes", "/api/processos", "/api/financeiro/resumo", "/api/intimacoes", `/api/portal-gestao/clientes/${clienteId}`, "/api/equipe", "/api/inicio"]) {
      const r = await chamar("GET", rota, { cookie: portal.cookie });
      expect(r.status, rota).toBe(401);
    }
    expect((await chamar("PUT", `/api/portal-gestao/processos/${processoId}/visibilidade`, { cookie: portal.cookie, corpo: { visivel: false } })).status).toBe(401);
    // Também não vale se o cliente tentar usar o valor do cookie do portal com o nome do cookie do escritório.
    const valor = portal.cookie.split("=")[1];
    expect((await chamar("GET", "/api/eu", { cookie: `__Host-sessao=${valor}` })).status).toBe(401);
    // E o contrário.
    expect((await chamar("GET", "/api/portal/eu", { cookie: socio.cookie })).status).toBe(401);
    expect((await chamar("GET", "/api/portal/processos", { cookie: socio.cookie })).status).toBe(401);
    expect((await chamar("GET", "/api/portal/eu", { cookie: `__Host-portal=${socio.cookie.split("=")[1]}` })).status).toBe(401);
    // Sem cookie nenhum.
    expect((await chamar("GET", "/api/portal/processos")).status).toBe(401);
  });

  it("proteção CSRF vale para o portal", async () => {
    const { socio, clienteId } = await cenario();
    const portal = await acessoDoPortal(socio.cookie, clienteId);
    expect((await chamar("POST", "/api/portal/sair", { cookie: portal.cookie, marca: null })).status).toBe(403);
    expect((await chamar("POST", "/api/portal/sair", { cookie: portal.cookie, origem: "https://outro.test" })).status).toBe(403);
    expect((await chamar("POST", "/api/portal/entrar", { marca: null, corpo: { email: "a@b.com", senha: "x" } })).status).toBe(403);
    expect((await chamar("GET", "/api/portal/eu", { cookie: portal.cookie })).headers.get("cache-control")).toBe("no-store");
  });
});

describe("auditoria", () => {
  it("registra convite, ativação, login, publicações e download, sem dados pessoais nem texto", async () => {
    const { t, socio, clienteId, processoId } = await cenario();
    const a = await andamento(socio.cookie, processoId, "TEXTO DO ANDAMENTO SIGILOSO");
    const doc = await enviar(socio.cookie, `/api/processos/${processoId}`, "contrato-sigiloso.pdf");
    const { repo, id } = await intimacaoDoProcesso(t);
    await resumoAprovado(repo, id, socio.id, "RESUMO SIGILOSO");
    const email = `${unico("aud")}@exemplo.com`;
    const portal = await acessoDoPortal(socio.cookie, clienteId, email);
    await publicarProcesso(socio.cookie, processoId);
    await publicarAndamento(socio.cookie, processoId, a);
    await compartilhar(socio.cookie, doc);
    await chamar("POST", `/api/portal-gestao/intimacoes/${id}/resumo/publicar`, { cookie: socio.cookie });
    const link = await chamar("GET", `/api/portal/anexos/${doc}/link`, { cookie: portal.cookie });
    const dl = await SELF.fetch(`${ORIGEM}${link.json.url}`, { headers: { Cookie: portal.cookie, "CF-Connecting-IP": novoIp() } });
    await dl.arrayBuffer();
    await chamar("POST", "/api/portal/entrar", { corpo: { email, senha: "senha-errada-999" } });
    await chamar("POST", "/api/portal/entrar", { corpo: { email, senha: SENHA } });
    await publicarProcesso(socio.cookie, processoId, false);
    await publicarAndamento(socio.cookie, processoId, a, false);
    await compartilhar(socio.cookie, doc, false);
    await chamar("POST", `/api/portal-gestao/intimacoes/${id}/resumo/retirar`, { cookie: socio.cookie });
    await chamar("POST", `/api/portal-gestao/acessos/${portal.acessoId}/situacao`, { cookie: socio.cookie, corpo: { ativo: false } });

    const { results } = await env.DB.prepare("SELECT acao, user_id, detalhes FROM audit_log WHERE tenant_id = ? AND acao LIKE 'portal_%'").bind(t).all<any>();
    const acoes = results.map((r) => r.acao);
    expect(acoes).toEqual(
      expect.arrayContaining([
        "portal_convite_criado", "portal_acesso_ativado", "portal_login_sucesso", "portal_login_falha", "portal_documento_baixado",
        "portal_processo_publicado", "portal_processo_retirado", "portal_andamento_publicado", "portal_andamento_retirado",
        "portal_documento_compartilhado", "portal_documento_retirado", "portal_resumo_publicado", "portal_resumo_retirado", "portal_acesso_desativado",
      ]),
    );
    const tudo = JSON.stringify(results);
    for (const proibido of [email, "SIGILOSO", "TEXTO INTEGRAL", "Maria da Silva", SENHA]) expect(tudo).not.toContain(proibido);
    // Ações do próprio cliente não têm usuário do escritório.
    expect(results.filter((r) => r.acao === "portal_login_sucesso").every((r) => r.user_id === null)).toBe(true);
  });
});

describe("camada de dados do portal", () => {
  it("exige escritório e cliente (que vêm da sessão do portal)", () => {
    expect(() => criarRepositorioPortal(env.DB, "", "c")).toThrow();
    expect(() => criarRepositorioPortal(env.DB, "t", "")).toThrow();
    expect(() => criarGestaoPortal(env.DB, "")).toThrow();
  });

  it("o repositório do portal de um cliente não enxerga processo de outro, mesmo publicado e do mesmo escritório", async () => {
    const { t, socio, clienteId, processoId } = await cenario();
    const outro = await criarCliente(socio.cookie, "Outro cliente");
    await publicarProcesso(socio.cookie, processoId);
    expect(await criarRepositorioPortal(env.DB, t, clienteId).processo(processoId)).not.toBeNull();
    expect(await criarRepositorioPortal(env.DB, t, outro).processo(processoId)).toBeNull();
    expect(await criarRepositorioPortal(env.DB, "outro-escritorio", clienteId).processo(processoId)).toBeNull();
  });
});
