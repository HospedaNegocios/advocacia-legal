import { Hono } from "hono";
import type { Env } from "../env";
import type { Variaveis } from "../contexto";
import type { Ctx } from "../contexto";
import { CAMPOS_PERFIL, criarRepositorio } from "../db/repositorio";
import type { LinhaOab, LinhaPerfilEscritorio, Repositorio } from "../db/repositorio";
import { auditar } from "../auditoria";
import { limiteDeOabs, mensagemLimiteDeOabs } from "../planos";
import { exigirSessao, ipDe } from "../sessao";
import { lerJson, respostaErro, validarOab, validarPerfil } from "../validacao";

// Dados do escritório e OABs. Leitura: qualquer perfil do escritório. Escrita: só sócio.
// O escritório vem SEMPRE da sessão.
export const rotasEscritorio = new Hono<{ Bindings: Env; Variables: Variaveis }>();
rotasEscritorio.use("*", exigirSessao({ papel: "escritorio" }));

const exigirSocio = exigirSessao({ papel: "socio" });

function repoDaSessao(c: Ctx): Repositorio {
  return criarRepositorio(c.env.DB, c.get("sessao").tenantId as string);
}

function perfilPublico(p: LinhaPerfilEscritorio | null) {
  const saida: Record<string, string | null> = {};
  for (const campo of CAMPOS_PERFIL) saida[campo] = p?.[campo] ?? null;
  return saida;
}

function oabPublica(o: LinhaOab) {
  return {
    id: o.id,
    numero: o.numero,
    sufixo: o.sufixo,
    uf: o.uf,
    advogado_nome: o.advogado_nome,
    user_id: o.user_id,
    ativo: o.ativo === 1,
    criado_em: o.criado_em,
  };
}

rotasEscritorio.get("/perfil", async (c) => {
  const repo = repoDaSessao(c);
  const [escritorio, perfil] = await Promise.all([repo.buscarMeuEscritorio(), repo.perfil.buscar()]);
  return c.json({ ok: true, nome: escritorio?.nome ?? "", plano: escritorio?.plano ?? null, perfil: perfilPublico(perfil) });
});

rotasEscritorio.put("/perfil", exigirSocio, async (c) => {
  const sessao = c.get("sessao");
  const r = validarPerfil(await lerJson(c));
  if (!r.ok) return respostaErro(c, 400, r.erro);
  const repo = repoDaSessao(c);
  const antes = await repo.perfil.buscar();
  await repo.perfil.salvar(r.dados);
  // Auditoria guarda só os nomes dos campos alterados (não os valores pessoais).
  const alterados = CAMPOS_PERFIL.filter((campo) => (antes?.[campo] ?? null) !== r.dados[campo]);
  await auditar(c.env.DB, {
    tenantId: sessao.tenantId,
    userId: sessao.usuario.id,
    acao: "escritorio_perfil_alterado",
    entidade: "escritorio_perfil",
    entidadeId: sessao.tenantId,
    detalhes: { campos: alterados.join(",") },
    ip: ipDe(c),
  });
  return c.json({ ok: true, perfil: perfilPublico(await repo.perfil.buscar()) });
});

async function resumoDeUso(repo: Repositorio) {
  const [escritorio, ativas] = await Promise.all([repo.buscarMeuEscritorio(), repo.oabs.contarAtivas()]);
  const plano = escritorio?.plano ?? "solo";
  return { plano, ativas, limite: limiteDeOabs(plano) };
}

rotasEscritorio.get("/oabs", async (c) => {
  const repo = repoDaSessao(c);
  const [oabs, uso] = await Promise.all([repo.oabs.listar({}, { limite: 200 }), resumoDeUso(repo)]);
  return c.json({ ok: true, oabs: oabs.map(oabPublica), uso });
});

function ehConflitoDeUnicidade(e: unknown): boolean {
  return e instanceof Error && /UNIQUE/i.test(e.message);
}

const MSG_DUPLICADA = "Esta OAB já está cadastrada no escritório.";

/** Confere que o advogado vinculado é um usuário deste escritório. */
async function usuarioValido(repo: Repositorio, userId: unknown): Promise<{ ok: true; id: string | null } | { ok: false }> {
  if (userId === undefined || userId === null || userId === "") return { ok: true, id: null };
  if (typeof userId !== "string") return { ok: false };
  const u = await repo.users.buscar(userId);
  return u ? { ok: true, id: u.id } : { ok: false };
}

rotasEscritorio.post("/oabs", exigirSocio, async (c) => {
  const sessao = c.get("sessao");
  const corpo = await lerJson(c);
  const v = validarOab(corpo);
  if (!v.ok) return respostaErro(c, 400, v.erro);
  const repo = repoDaSessao(c);
  const vinculo = await usuarioValido(repo, corpo.user_id);
  if (!vinculo.ok) return respostaErro(c, 400, "Usuário não encontrado neste escritório.");
  const uso = await resumoDeUso(repo);
  let id: string | null;
  try {
    id = await repo.oabs.inserirRespeitandoLimite({ ...v.dados, user_id: vinculo.id }, uso.limite);
  } catch (e) {
    if (ehConflitoDeUnicidade(e)) return respostaErro(c, 409, MSG_DUPLICADA);
    throw e;
  }
  if (!id) return respostaErro(c, 409, mensagemLimiteDeOabs(uso.plano));
  await auditar(c.env.DB, {
    tenantId: sessao.tenantId,
    userId: sessao.usuario.id,
    acao: "oab_criada",
    entidade: "oabs",
    entidadeId: id,
    detalhes: { numero: v.dados.numero, sufixo: v.dados.sufixo, uf: v.dados.uf },
    ip: ipDe(c),
  });
  const criada = await repo.oabs.buscar(id);
  return c.json({ ok: true, oab: criada ? oabPublica(criada) : null }, 201);
});

rotasEscritorio.put("/oabs/:id", exigirSocio, async (c) => {
  const sessao = c.get("sessao");
  const repo = repoDaSessao(c);
  const atual = await repo.oabs.buscar(c.req.param("id"));
  if (!atual) return respostaErro(c, 404, "OAB não encontrada.");
  const corpo = await lerJson(c);
  const v = validarOab(corpo);
  if (!v.ok) return respostaErro(c, 400, v.erro);
  const vinculo = await usuarioValido(repo, corpo.user_id);
  if (!vinculo.ok) return respostaErro(c, 400, "Usuário não encontrado neste escritório.");
  if (corpo.ativo !== undefined && typeof corpo.ativo !== "boolean") return respostaErro(c, 400, "Informe ativo como verdadeiro ou falso.");
  const reativar = corpo.ativo === true && atual.ativo === 0;
  const desativar = corpo.ativo === false && atual.ativo === 1;
  if (reativar) {
    const uso = await resumoDeUso(repo);
    if (!(await repo.oabs.reativarRespeitandoLimite(atual.id, uso.limite))) return respostaErro(c, 409, mensagemLimiteDeOabs(uso.plano));
  }
  try {
    await repo.oabs.atualizar(atual.id, { ...v.dados, user_id: vinculo.id, ...(desativar ? { ativo: 0 } : {}) });
  } catch (e) {
    if (reativar) await repo.oabs.atualizar(atual.id, { ativo: 0 });
    if (ehConflitoDeUnicidade(e)) return respostaErro(c, 409, MSG_DUPLICADA);
    throw e;
  }
  await auditar(c.env.DB, {
    tenantId: sessao.tenantId,
    userId: sessao.usuario.id,
    acao: reativar ? "oab_reativada" : desativar ? "oab_desativada" : "oab_alterada",
    entidade: "oabs",
    entidadeId: atual.id,
    detalhes: { numero: v.dados.numero, sufixo: v.dados.sufixo, uf: v.dados.uf },
    ip: ipDe(c),
  });
  const nova = await repo.oabs.buscar(atual.id);
  return c.json({ ok: true, oab: nova ? oabPublica(nova) : null });
});

// DELETE = desativar (a OAB e o histórico ficam guardados).
rotasEscritorio.delete("/oabs/:id", exigirSocio, async (c) => {
  const sessao = c.get("sessao");
  const repo = repoDaSessao(c);
  const atual = await repo.oabs.buscar(c.req.param("id"));
  if (!atual) return respostaErro(c, 404, "OAB não encontrada.");
  if (atual.ativo === 1) {
    await repo.oabs.atualizar(atual.id, { ativo: 0 });
    await auditar(c.env.DB, {
      tenantId: sessao.tenantId,
      userId: sessao.usuario.id,
      acao: "oab_desativada",
      entidade: "oabs",
      entidadeId: atual.id,
      detalhes: { numero: atual.numero, sufixo: atual.sufixo, uf: atual.uf },
      ip: ipDe(c),
    });
  }
  return c.json({ ok: true });
});
