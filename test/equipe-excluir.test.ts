import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { criarRepositorio } from "../src/server/db/repositorio";
import type { Plano } from "../src/server/db/repositorio";
import { prepararBanco } from "./aplicar-migracoes";
import { chamar, criarEscritorio, criarUsuario, entrar, sessaoDeUsuario, unico } from "./ajuda";

prepararBanco();

async function cenario(plano: Plano = "escritorio") {
  const t = await criarEscritorio(plano);
  const socio = await sessaoDeUsuario(t, "socio");
  return { t, socio };
}
const linha = (id: string) => env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<any>();
const membros = async (cookie: string) => (await chamar("GET", "/api/equipe/usuarios", { cookie })).json;
async function convidar(cookie: string, email = `${unico("c")}@teste.com`) {
  return chamar("POST", "/api/equipe/convites", { cookie, corpo: { email, perfil: "advogado" } });
}

describe("excluir usuário da equipe", () => {
  it("usuário ativo: desconecta, some da equipe, não entra mais e a auditoria registra só ids", async () => {
    const { t, socio } = await cenario();
    const adv = await sessaoDeUsuario(t, "advogado");
    const r = await chamar("DELETE", `/api/equipe/usuarios/${adv.id}`, { cookie: socio.cookie });
    expect(r.status).toBe(200);
    expect((await chamar("GET", "/api/eu", { cookie: adv.cookie })).status).toBe(401);
    expect((await entrar(adv.email)).status).not.toBe(200);
    expect((await membros(socio.cookie)).usuarios.map((u: any) => u.id)).not.toContain(adv.id);
    const u = await linha(adv.id);
    expect(u).toMatchObject({ ativo: 0, totp_secret: null, senha_hash: "" });
    expect(u.excluido_em).not.toBeNull();
    expect(u.email).not.toBe(adv.email);
    expect(await env.DB.prepare("SELECT id FROM sessions WHERE user_id = ?").bind(adv.id).first()).toBeNull();
    const aud = await env.DB.prepare("SELECT user_id, entidade_id, detalhes FROM audit_log WHERE tenant_id = ? AND acao = 'usuario_excluido'").bind(t).first<any>();
    expect(aud).toMatchObject({ user_id: socio.id, entidade_id: adv.id, detalhes: null });
  });

  it("preserva o que a pessoa criou (cliente continua do escritório, com o nome de quem criou)", async () => {
    const { t, socio } = await cenario();
    const adv = await criarUsuario(t, "advogado");
    const repo = criarRepositorio(env.DB, t);
    const clienteId = await repo.clientes.inserir({ tipo: "pf", nome: "Cliente do Advogado", criado_por: adv.id } as any);
    expect((await chamar("DELETE", `/api/equipe/usuarios/${adv.id}`, { cookie: socio.cookie })).status).toBe(200);
    const cli = await repo.clientes.buscar(clienteId);
    expect(cli).toMatchObject({ criado_por: adv.id });
    expect((await linha(adv.id)).nome).toBe("Usuário Teste");
  });

  it("usuário desativado também pode ser excluído", async () => {
    const { t, socio } = await cenario();
    const adv = await criarUsuario(t, "advogado");
    await chamar("POST", `/api/equipe/usuarios/${adv.id}/desativar`, { cookie: socio.cookie });
    expect((await chamar("DELETE", `/api/equipe/usuarios/${adv.id}`, { cookie: socio.cookie })).status).toBe(200);
    expect((await linha(adv.id)).excluido_em).not.toBeNull();
  });

  it("libera a vaga do plano e o mesmo e-mail pode ser convidado de novo", async () => {
    const { t, socio } = await cenario("escritorio"); // até 5 usuários
    const outros = [];
    for (let i = 0; i < 4; i++) outros.push(await criarUsuario(t, "advogado")); // 5 de 5
    expect((await convidar(socio.cookie)).status).toBe(409);
    expect((await chamar("DELETE", `/api/equipe/usuarios/${outros[0]!.id}`, { cookie: socio.cookie })).status).toBe(200);
    expect((await membros(socio.cookie)).vagas).toMatchObject({ usados: 4, limite: 5 });
    expect((await convidar(socio.cookie, outros[0]!.email)).status).toBe(201);
  });

  it("sócio não exclui a si mesmo; pode excluir outro sócio", async () => {
    const { t, socio } = await cenario();
    expect((await chamar("DELETE", `/api/equipe/usuarios/${socio.id}`, { cookie: socio.cookie })).status).toBe(400);
    expect((await linha(socio.id)).excluido_em).toBeNull();
    const outro = await criarUsuario(t, "socio");
    expect((await chamar("DELETE", `/api/equipe/usuarios/${outro.id}`, { cookie: socio.cookie })).status).toBe(200);
  });

  it("depois de excluído: não pode ser reativado, nem mudar perfil, nem ser excluído de novo", async () => {
    const { t, socio } = await cenario();
    const adv = await criarUsuario(t, "advogado");
    await chamar("DELETE", `/api/equipe/usuarios/${adv.id}`, { cookie: socio.cookie });
    expect((await chamar("POST", `/api/equipe/usuarios/${adv.id}/reativar`, { cookie: socio.cookie })).status).toBe(404);
    expect((await chamar("PATCH", `/api/equipe/usuarios/${adv.id}`, { cookie: socio.cookie, corpo: { perfil: "socio" } })).status).toBe(404);
    expect((await chamar("PUT", `/api/equipe/${adv.id}/permissoes/financeiro`, { cookie: socio.cookie, corpo: { nivel: "leitura" } })).status).toBe(404);
    expect((await chamar("DELETE", `/api/equipe/usuarios/${adv.id}`, { cookie: socio.cookie })).status).toBe(404);
    expect((await linha(adv.id)).ativo).toBe(0);
  });

  it("só sócio exclui; outro escritório e id inexistente dão 404", async () => {
    const a = await cenario();
    const b = await cenario();
    const adv = await sessaoDeUsuario(a.t, "advogado");
    const alvo = await criarUsuario(a.t, "estagiario");
    expect((await chamar("DELETE", `/api/equipe/usuarios/${alvo.id}`, { cookie: adv.cookie })).status).toBe(403);
    expect((await chamar("DELETE", `/api/equipe/usuarios/${alvo.id}`)).status).toBe(401);
    expect((await chamar("DELETE", `/api/equipe/usuarios/${alvo.id}`, { cookie: b.socio.cookie })).status).toBe(404);
    expect((await linha(alvo.id)).excluido_em).toBeNull();
    expect((await chamar("DELETE", "/api/equipe/usuarios/nao-existe", { cookie: a.socio.cookie })).status).toBe(404);
  });

  it("aparece no log da equipe com o nome de quem foi excluído", async () => {
    const { t, socio } = await cenario();
    const adv = await criarUsuario(t, "advogado");
    await chamar("DELETE", `/api/equipe/usuarios/${adv.id}`, { cookie: socio.cookie });
    const log = (await chamar("GET", "/api/equipe/acessos", { cookie: socio.cookie })).json.itens;
    expect(log.find((i: any) => i.acao === "usuario_excluido")).toMatchObject({ alvo_nome: "Usuário Teste", usuario_email: socio.email });
  });
});

describe("excluir convite em qualquer situação", () => {
  it("convite pendente: apaga de vez e o link deixa de funcionar", async () => {
    const { t, socio } = await cenario();
    const email = `${unico("p")}@teste.com`;
    const token = (await convidar(socio.cookie, email)).json.link.split("#")[1];
    const id = (await env.DB.prepare("SELECT id FROM users WHERE tenant_id = ? AND email = ?").bind(t, email).first<any>()).id;
    expect((await chamar("DELETE", `/api/equipe/usuarios/${id}`, { cookie: socio.cookie })).status).toBe(200);
    expect(await linha(id)).toBeNull();
    expect((await chamar("POST", "/api/acesso/validar", { corpo: { token } })).status).not.toBe(200);
    expect(await env.DB.prepare("SELECT acao FROM audit_log WHERE tenant_id = ? AND entidade_id = ? AND acao = 'convite_excluido'").bind(t, id).first()).not.toBeNull();
  });

  it("convite desativado ou expirado também é excluído", async () => {
    const { t, socio } = await cenario();
    const e1 = `${unico("d")}@teste.com`;
    const e2 = `${unico("x")}@teste.com`;
    await convidar(socio.cookie, e1);
    await convidar(socio.cookie, e2);
    const id1 = (await env.DB.prepare("SELECT id FROM users WHERE tenant_id = ? AND email = ?").bind(t, e1).first<any>()).id;
    const id2 = (await env.DB.prepare("SELECT id FROM users WHERE tenant_id = ? AND email = ?").bind(t, e2).first<any>()).id;
    await chamar("POST", `/api/equipe/usuarios/${id1}/desativar`, { cookie: socio.cookie });
    await env.DB.prepare("UPDATE tokens_acesso SET expira_em = '2000-01-01T00:00:00.000Z' WHERE user_id = ?").bind(id2).run();
    expect((await chamar("DELETE", `/api/equipe/usuarios/${id1}`, { cookie: socio.cookie })).status).toBe(200);
    expect((await chamar("DELETE", `/api/equipe/usuarios/${id2}`, { cookie: socio.cookie })).status).toBe(200);
    expect(await linha(id1)).toBeNull();
    expect(await linha(id2)).toBeNull();
  });

  it("convite já ligado a um registro: fica marcado como excluído em vez de apagar, sem quebrar o registro", async () => {
    const { t, socio } = await cenario();
    const email = `${unico("v")}@teste.com`;
    await convidar(socio.cookie, email);
    const id = (await env.DB.prepare("SELECT id FROM users WHERE tenant_id = ? AND email = ?").bind(t, email).first<any>()).id;
    const repo = criarRepositorio(env.DB, t);
    const clienteId = await repo.clientes.inserir({ tipo: "pf", nome: "Cliente Vinculado", criado_por: id } as any);
    expect((await chamar("DELETE", `/api/equipe/usuarios/${id}`, { cookie: socio.cookie })).status).toBe(200);
    expect((await linha(id)).excluido_em).not.toBeNull();
    expect(await env.DB.prepare("SELECT id FROM tokens_acesso WHERE user_id = ?").bind(id).first()).toBeNull();
    expect(await repo.clientes.buscar(clienteId)).not.toBeNull();
    expect((await membros(socio.cookie)).usuarios.map((u: any) => u.id)).not.toContain(id);
  });
});
