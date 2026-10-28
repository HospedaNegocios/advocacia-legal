import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../env";
import type { Variaveis } from "../contexto";
import { criarRepositorio, NIVEIS_PERMISSAO } from "../db/repositorio";
import type { NivelPermissao } from "../db/repositorio";
import type { LinhaUsuario } from "../db/repositorio";
import { auditar } from "../auditoria";
import { criarConvite } from "../convites";
import { CONVITE_JA_ACEITO, CONVITE_NAO_ENCONTRADO } from "../../comum/textos-assinatura";
import { limiteDeUsuarios, mensagemLimiteDeUsuarios } from "../planos";
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

/** Usuário da equipe do escritório da sessão. Quem foi excluído não é mais encontrado. */
async function buscarMembro(repo: ReturnType<typeof criarRepositorio>, id: string) {
  const u = await repo.users.buscar(id);
  return u && u.excluido_em === null ? u : null;
}

rotasEquipe.get("/usuarios", async (c) => {
  const repo = repoDaSessao(c);
  const [usuarios, escritorio] = await Promise.all([repo.users.listar({ excluido_em: null }, { limite: 200 }), repo.buscarMeuEscritorio()]);
  const vagas = await repo.vagas.contarOcupadas();
  return c.json({
    ok: true,
    usuarios: usuarios.map(usuarioPublico),
    exigir_2fa: escritorio?.exigir_2fa === 1,
    // Vagas do plano: usuários ativos + convites pendentes (limite null = ilimitado).
    vagas: { usados: vagas.total, ativos: vagas.ativos, convites_pendentes: vagas.convites_pendentes, limite: escritorio ? limiteDeUsuarios(escritorio.plano) : null },
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
  if (!r.ok) {
    return respostaErro(c, 409, r.motivo === "limite" ? mensagemLimiteDeUsuarios(r.plano) : "Já existe um usuário com este e-mail no escritório.");
  }
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
  const alvo = await buscarMembro(repo, c.req.param("id"));
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
  const alvo = await buscarMembro(repo, c.req.param("id"));
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
  const alvo = await buscarMembro(repo, c.req.param("id"));
  if (!alvo) return respostaErro(c, 404, "Usuário não encontrado.");
  if (alvo.ativo !== 1) {
    // Reativar também respeita o limite do plano (ativos + convites pendentes, sem contar este usuário).
    const escritorio = await repo.buscarMeuEscritorio();
    const limite = escritorio ? limiteDeUsuarios(escritorio.plano) : null;
    if (escritorio && limite !== null && (await repo.vagas.contarOcupadas(alvo.id)).total >= limite) {
      return respostaErro(c, 409, mensagemLimiteDeUsuarios(escritorio.plano));
    }
  }
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

/**
 * Exclui alguém da equipe (usuário ativo, desativado ou convite em qualquer situação) e libera a vaga do plano.
 * O sócio não exclui a si mesmo: assim o escritório sempre continua com pelo menos um sócio (quem excluiu).
 * Processos, prazos, lançamentos e o histórico criados pela pessoa continuam no escritório.
 */
rotasEquipe.delete("/usuarios/:id", async (c) => {
  const sessao = c.get("sessao");
  const id = c.req.param("id");
  if (id === sessao.usuario.id) return respostaErro(c, 400, "Você não pode excluir o seu próprio usuário. Peça a outro sócio.");
  const r = await repoDaSessao(c).vagas.excluirUsuario(id);
  if (r === "nao_encontrado") return respostaErro(c, 404, "Usuário não encontrado.");
  await auditar(c.env.DB, {
    tenantId: sessao.tenantId,
    userId: sessao.usuario.id,
    acao: r.convite_pendente ? "convite_excluido" : "usuario_excluido",
    entidade: "users",
    // Só ids, como nos demais registros da equipe. Quem já entrou continua com o nome no banco (o log mostra quem era).
    entidadeId: id,
    ip: ipDe(c),
  });
  return c.json({ ok: true });
});

/** Exclui um convite pendente (gerado por engano). Convite já aceito (usuário com senha) não é excluído: use "desativar". */
rotasEquipe.delete("/convites/:usuarioId", async (c) => {
  const sessao = c.get("sessao");
  const id = c.req.param("usuarioId");
  const r = await repoDaSessao(c).vagas.excluirConvitePendente(id);
  if (r === "nao_encontrado") return respostaErro(c, 404, CONVITE_NAO_ENCONTRADO);
  if (r === "nao_pendente") return respostaErro(c, 409, CONVITE_JA_ACEITO);
  await auditar(c.env.DB, {
    tenantId: sessao.tenantId,
    userId: sessao.usuario.id,
    acao: "convite_excluido",
    entidade: "users",
    entidadeId: id,
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

// ---------- Permissões por usuário (módulo financeiro) ----------

/** "nenhum" (sem acesso), "leitura" ou "edicao". */
rotasEquipe.get("/permissoes", async (c) => {
  const usuarios = await repoDaSessao(c).permissoes.listarUsuarios("financeiro");
  return c.json({
    ok: true,
    usuarios: usuarios.map((u) => ({
      id: u.id,
      nome: u.nome,
      email: u.email,
      perfil: u.perfil,
      convite_pendente: u.senha_definida === 0,
      // Sócio tem acesso total e fixo; os demais seguem a tabela (sem linha = nenhum).
      fixo: u.perfil === "socio",
      financeiro: u.perfil === "socio" ? "edicao" : (u.nivel ?? "nenhum"),
    })),
  });
});

rotasEquipe.put("/:usuarioId/permissoes/financeiro", async (c) => {
  const sessao = c.get("sessao");
  const corpo = await lerJson(c);
  const pedido = corpo.nivel;
  if (pedido !== "nenhum" && !NIVEIS_PERMISSAO.includes(pedido as NivelPermissao)) {
    return respostaErro(c, 400, 'Informe o acesso como "nenhum", "leitura" ou "edicao".');
  }
  const novo: NivelPermissao | null = pedido === "nenhum" ? null : (pedido as NivelPermissao);
  const repo = repoDaSessao(c);
  const alvo = await buscarMembro(repo, c.req.param("usuarioId"));
  if (!alvo || alvo.perfil === null) return respostaErro(c, 404, "Usuário não encontrado.");
  if (alvo.perfil === "socio") return respostaErro(c, 409, "Sócios têm acesso total ao financeiro. Isso não pode ser alterado.");
  if (alvo.ativo !== 1) return respostaErro(c, 409, "Este usuário está desativado. Reative-o antes de alterar o acesso.");
  const antes = await repo.permissoes.obterNivel(alvo.id, "financeiro");
  const r = await repo.permissoes.definir(alvo.id, "financeiro", novo, sessao.usuario.id);
  if (r === "nao_encontrado") return respostaErro(c, 404, "Usuário não encontrado.");
  if (r === "socio") return respostaErro(c, 409, "Sócios têm acesso total ao financeiro. Isso não pode ser alterado.");
  if (r === "inativo") return respostaErro(c, 409, "Este usuário está desativado. Reative-o antes de alterar o acesso.");
  if (antes !== novo) {
    await auditar(c.env.DB, {
      tenantId: sessao.tenantId,
      userId: sessao.usuario.id,
      acao: "permissao_alterada",
      entidade: "permissoes_usuario",
      entidadeId: alvo.id,
      detalhes: { modulo: "financeiro", de: antes ?? "nenhum", para: novo ?? "nenhum" },
      ip: ipDe(c),
    });
  }
  return c.json({ ok: true, financeiro: novo ?? "nenhum" });
});
