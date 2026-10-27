import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../env";
import type { Variaveis } from "../contexto";
import { criarRepositorio } from "../db/repositorio";
import type { LinhaUsuario } from "../db/repositorio";
import { auditar } from "../auditoria";
import { criarConvite } from "../convites";
import { exigirSessao, ipDe } from "../sessao";
import { ehPerfil, lerJson, normalizarEmail, respostaErro } from "../validacao";

// Gestão da equipe: somente sócio. O escritório vem da sessão (c.get("sessao").tenantId).
export const rotasEquipe = new Hono<{ Bindings: Env; Variables: Variaveis }>();
rotasEquipe.use("*", exigirSessao({ papel: "socio" }));

const POR_PAGINA = 50;

/** Lista explícita de campos: nunca devolve hash/sal de senha nem segredo TOTP. */
function usuarioPublico(u: LinhaUsuario) {
  return {
    id: u.id,
    nome: u.nome,
    email: u.email,
    perfil: u.perfil,
    ativo: u.ativo === 1,
    convite_pendente: u.senha_definida === 0,
    totp_ativo: u.totp_ativo === 1,
    criado_em: u.criado_em,
  };
}

function repoDaSessao(c: Context<{ Bindings: Env; Variables: Variaveis }, any>) {
  const { tenantId } = c.get("sessao");
  return criarRepositorio(c.env.DB, tenantId as string);
}

rotasEquipe.get("/usuarios", async (c) => {
  const repo = repoDaSessao(c);
  const [usuarios, escritorio] = await Promise.all([repo.users.listar({}, { limite: 200 }), repo.buscarMeuEscritorio()]);
  return c.json({
    ok: true,
    usuarios: usuarios.map(usuarioPublico),
    exigir_2fa: escritorio?.exigir_2fa === 1,
  });
});

rotasEquipe.post("/convites", async (c) => {
  const sessao = c.get("sessao");
  const corpo = await lerJson(c);
  const email = normalizarEmail(corpo.email);
  if (!email) return respostaErro(c, 400, "Informe um e-mail válido.");
  if (!ehPerfil(corpo.perfil)) return respostaErro(c, 400, "Perfil inválido.");
  const r = await criarConvite(c.env.DB, sessao.tenantId as string, {
    email,
    perfil: corpo.perfil,
    criadoPor: sessao.usuario.id,
  });
  if (!r.ok) return respostaErro(c, 409, "Já existe um usuário com este e-mail no escritório.");
  await auditar(c.env.DB, {
    tenantId: sessao.tenantId,
    userId: sessao.usuario.id,
    acao: "convite_criado",
    entidade: "users",
    entidadeId: r.userId,
    detalhes: { perfil: corpo.perfil, reenvio: r.reenvio },
    ip: ipDe(c),
  });
  return c.json({ ok: true, link: `${new URL(c.req.url).origin}/convite#${r.token}`, expira_em: r.expiraEm }, 201);
});

rotasEquipe.patch("/usuarios/:id", async (c) => {
  const sessao = c.get("sessao");
  const repo = repoDaSessao(c);
  const alvo = await repo.users.buscar(c.req.param("id"));
  if (!alvo) return respostaErro(c, 404, "Usuário não encontrado.");
  const corpo = await lerJson(c);
  if (!ehPerfil(corpo.perfil)) return respostaErro(c, 400, "Perfil inválido.");
  if (alvo.id === sessao.usuario.id) return respostaErro(c, 400, "Você não pode alterar o seu próprio perfil.");
  await repo.users.atualizar(alvo.id, { perfil: corpo.perfil });
  await auditar(c.env.DB, {
    tenantId: sessao.tenantId,
    userId: sessao.usuario.id,
    acao: "usuario_perfil_alterado",
    entidade: "users",
    entidadeId: alvo.id,
    detalhes: { de: alvo.perfil, para: corpo.perfil },
    ip: ipDe(c),
  });
  return c.json({ ok: true });
});

rotasEquipe.post("/usuarios/:id/desativar", async (c) => {
  const sessao = c.get("sessao");
  const repo = repoDaSessao(c);
  const alvo = await repo.users.buscar(c.req.param("id"));
  if (!alvo) return respostaErro(c, 404, "Usuário não encontrado.");
  if (alvo.id === sessao.usuario.id) return respostaErro(c, 400, "Você não pode desativar o seu próprio usuário.");
  await repo.users.atualizar(alvo.id, { ativo: 0 });
  await repo.sessions.excluirPor({ user_id: alvo.id });
  await auditar(c.env.DB, {
    tenantId: sessao.tenantId,
    userId: sessao.usuario.id,
    acao: "usuario_desativado",
    entidade: "users",
    entidadeId: alvo.id,
    ip: ipDe(c),
  });
  return c.json({ ok: true });
});

rotasEquipe.post("/usuarios/:id/reativar", async (c) => {
  const sessao = c.get("sessao");
  const repo = repoDaSessao(c);
  const alvo = await repo.users.buscar(c.req.param("id"));
  if (!alvo) return respostaErro(c, 404, "Usuário não encontrado.");
  await repo.users.atualizar(alvo.id, { ativo: 1 });
  await auditar(c.env.DB, {
    tenantId: sessao.tenantId,
    userId: sessao.usuario.id,
    acao: "usuario_reativado",
    entidade: "users",
    entidadeId: alvo.id,
    ip: ipDe(c),
  });
  return c.json({ ok: true });
});

rotasEquipe.put("/configuracao", async (c) => {
  const sessao = c.get("sessao");
  const corpo = await lerJson(c);
  if (typeof corpo.exigir_2fa !== "boolean") return respostaErro(c, 400, "Informe exigir_2fa como verdadeiro ou falso.");
  await repoDaSessao(c).definirExigir2fa(corpo.exigir_2fa);
  await auditar(c.env.DB, {
    tenantId: sessao.tenantId,
    userId: sessao.usuario.id,
    acao: "exigir_2fa_alterado",
    entidade: "tenants",
    entidadeId: sessao.tenantId,
    detalhes: { exigir_2fa: corpo.exigir_2fa },
    ip: ipDe(c),
  });
  return c.json({ ok: true, exigir_2fa: corpo.exigir_2fa });
});

rotasEquipe.get("/acessos", async (c) => {
  const pagina = Math.max(Math.trunc(Number(c.req.query("pagina") ?? "1")) || 1, 1);
  const itens = await repoDaSessao(c).auditoria.listarAcessos({
    limite: POR_PAGINA + 1,
    deslocamento: (pagina - 1) * POR_PAGINA,
  });
  return c.json({
    ok: true,
    pagina,
    itens: itens.slice(0, POR_PAGINA),
    tem_proxima: itens.length > POR_PAGINA,
  });
});
