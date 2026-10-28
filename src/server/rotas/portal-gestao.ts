import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { Env } from "../env";
import type { Ctx, Variaveis } from "../contexto";
import { criarGestaoPortal } from "../db/portal";
import type { GestaoPortal, LinhaPortalUsuario, ResultadoMarcador } from "../db/portal";
import { gerarToken, sha256Hex } from "../auth/codificacao";
import { SENHA_INUTILIZAVEL } from "../auth/senha";
import { VALIDADE_CONVITE_MS } from "../convites";
import { exigirSessao } from "../sessao";
import { lerJson, normalizarEmail, respostaErro } from "../validacao";
import { registrar, repoDaSessao } from "./comum";

// Gestão do portal pelo escritório: convidar o cliente e decidir, item por item, o que ele vê.
// Só sócio e advogado (quem responde pelo que o cliente enxerga). O escritório vem SEMPRE da sessão.
// Tudo nasce NÃO visível; cada item só aparece no portal depois de marcado aqui. Auditoria: só ids, nunca texto.
export const rotasPortalGestao = new Hono<{ Bindings: Env; Variables: Variaveis }>();
rotasPortalGestao.use("*", exigirSessao({ papel: "escritorio" }));

const exigirGestor: MiddlewareHandler<{ Bindings: Env; Variables: Variaveis }> = async (c, next) => {
  const perfil = c.get("sessao").usuario.perfil;
  if (perfil !== "socio" && perfil !== "advogado") return respostaErro(c, 403, "Só sócio ou advogado pode gerenciar o portal do cliente.");
  await next();
};
rotasPortalGestao.use("*", exigirGestor);

const gestaoDaSessao = (c: Ctx): GestaoPortal => criarGestaoPortal(c.env.DB, c.get("sessao").tenantId as string);

const MSG_SEM_CONSENTIMENTO = "Registre o consentimento LGPD do cliente (aba LGPD) antes de dar acesso ao portal.";
const MSG_CLIENTE_INATIVO = "Este cliente está desativado. Reative o cliente para dar acesso ao portal.";

const acessoPublico = (u: LinhaPortalUsuario) => ({
  id: u.id,
  email: u.email,
  ativo: u.ativo === 1,
  convite_pendente: u.senha_definida === 0,
  ultimo_acesso_em: u.ultimo_acesso_em,
  criado_em: u.criado_em,
});

/** Valor booleano obrigatório no corpo (nada de "truthy"). */
function booleano(corpo: Record<string, unknown>, campo: string): boolean | null {
  const v = corpo[campo];
  return typeof v === "boolean" ? v : null;
}

function respostaMarcador(c: Ctx, r: ResultadoMarcador, nome: string, ok: () => Response | Promise<Response>) {
  if (r === "inexistente") return respostaErro(c, 404, `${nome} não encontrado.`);
  if (r === "inativo") return respostaErro(c, 409, "Este item pertence a um registro desativado. Reative o registro antes de mostrá-lo ao cliente.");
  return ok();
}

// ---------- Acessos do cliente ----------

rotasPortalGestao.get("/clientes/:id", async (c) => {
  const cli = await repoDaSessao(c).clientes.buscar(c.req.param("id"));
  if (!cli) return respostaErro(c, 404, "Cliente não encontrado.");
  const gestao = gestaoDaSessao(c);
  const [acessos, consentimento] = await Promise.all([gestao.usuariosDoCliente(cli.id), gestao.temConsentimentoAtivo(cli.id)]);
  return c.json({ ok: true, cliente_ativo: cli.ativo === 1, consentimento_ativo: consentimento, acessos: acessos.map(acessoPublico) });
});

/** Cria o acesso (ou renova o link de quem já tem) e devolve o link de uso único. Só cliente ativo e com consentimento LGPD. */
rotasPortalGestao.post("/clientes/:id/convites", async (c) => {
  const cli = await repoDaSessao(c).clientes.buscar(c.req.param("id"));
  if (!cli) return respostaErro(c, 404, "Cliente não encontrado.");
  if (cli.ativo === 0) return respostaErro(c, 409, MSG_CLIENTE_INATIVO);
  const gestao = gestaoDaSessao(c);
  if (!(await gestao.temConsentimentoAtivo(cli.id))) return respostaErro(c, 409, MSG_SEM_CONSENTIMENTO);
  const corpo = await lerJson(c);
  const email = normalizarEmail(corpo.email);
  if (!email) return respostaErro(c, 400, "Informe um e-mail válido.");
  const existente = await gestao.buscarPorEmail(email);
  if (existente && existente.cliente_id !== cli.id) return respostaErro(c, 409, "Este e-mail já tem acesso ao portal em outro cliente deste escritório. Use outro e-mail.");
  if (existente && existente.ativo === 0) return respostaErro(c, 409, "Este acesso está desativado. Reative o acesso antes de gerar um novo link.");
  const sessao = c.get("sessao");
  const reenvio = existente !== null;
  const usuarioId = existente
    ? existente.id
    : await gestao.criarUsuario({ clienteId: cli.id, email, convidadoPor: sessao.usuario.id, senhaHash: SENHA_INUTILIZAVEL.senha_hash, senhaSalt: SENHA_INUTILIZAVEL.senha_salt });
  const token = gerarToken();
  const expiraEm = new Date(Date.now() + VALIDADE_CONVITE_MS).toISOString();
  await gestao.criarConvite({ usuarioId, tokenHash: await sha256Hex(token), expiraEm, criadoPor: sessao.usuario.id });
  await registrar(c, "portal_convite_criado", "portal_usuarios", usuarioId, { cliente_id: cli.id, reenvio });
  return c.json({ ok: true, acesso_id: usuarioId, link: `${new URL(c.req.url).origin}/portal/convite#${token}`, expira_em: expiraEm, reenvio }, 201);
});

rotasPortalGestao.post("/acessos/:id/situacao", async (c) => {
  const gestao = gestaoDaSessao(c);
  const acesso = await gestao.buscarUsuario(c.req.param("id"));
  if (!acesso) return respostaErro(c, 404, "Acesso não encontrado.");
  const ativo = booleano(await lerJson(c), "ativo");
  if (ativo === null) return respostaErro(c, 400, "Informe se o acesso fica ativo ou desativado.");
  if (ativo) {
    const cli = await repoDaSessao(c).clientes.buscar(acesso.cliente_id);
    if (!cli || cli.ativo === 0) return respostaErro(c, 409, MSG_CLIENTE_INATIVO);
    if (!(await gestao.temConsentimentoAtivo(acesso.cliente_id))) return respostaErro(c, 409, MSG_SEM_CONSENTIMENTO);
  }
  await gestao.definirAtivo(acesso.id, ativo);
  await registrar(c, ativo ? "portal_acesso_reativado" : "portal_acesso_desativado", "portal_usuarios", acesso.id, { cliente_id: acesso.cliente_id });
  const novo = await gestao.buscarUsuario(acesso.id);
  return c.json({ ok: true, acesso: novo ? acessoPublico(novo) : null });
});

// ---------- O que o cliente vê: processo, andamento, documento, resumo ----------

rotasPortalGestao.put("/processos/:id/visibilidade", async (c) => {
  const visivel = booleano(await lerJson(c), "visivel");
  if (visivel === null) return respostaErro(c, 400, "Informe se o processo fica visível ao cliente.");
  const id = c.req.param("id");
  return respostaMarcador(c, await gestaoDaSessao(c).definirProcessoVisivel(id, visivel), "Processo", async () => {
    await registrar(c, visivel ? "portal_processo_publicado" : "portal_processo_retirado", "processos", id);
    return c.json({ ok: true, visivel_portal: visivel });
  });
});

rotasPortalGestao.put("/processos/:id/andamentos/:andamentoId/visibilidade", async (c) => {
  const visivel = booleano(await lerJson(c), "visivel");
  if (visivel === null) return respostaErro(c, 400, "Informe se o andamento fica visível ao cliente.");
  const { id, andamentoId } = c.req.param();
  return respostaMarcador(c, await gestaoDaSessao(c).definirAndamentoVisivel(id, andamentoId, visivel), "Andamento", async () => {
    await registrar(c, visivel ? "portal_andamento_publicado" : "portal_andamento_retirado", "processos_andamentos", andamentoId, { processo_id: id });
    return c.json({ ok: true, visivel_portal: visivel });
  });
});

rotasPortalGestao.put("/anexos/:id/visibilidade", async (c) => {
  const compartilhado = booleano(await lerJson(c), "compartilhado");
  if (compartilhado === null) return respostaErro(c, 400, "Informe se o documento é compartilhado com o cliente.");
  const id = c.req.param("id");
  return respostaMarcador(c, await gestaoDaSessao(c).definirAnexoCompartilhado(id, compartilhado), "Documento", async () => {
    await registrar(c, compartilhado ? "portal_documento_compartilhado" : "portal_documento_retirado", "anexos", id);
    return c.json({ ok: true, compartilhado_cliente: compartilhado });
  });
});

rotasPortalGestao.post("/intimacoes/:id/resumo/publicar", async (c) => {
  const id = c.req.param("id");
  const r = await gestaoDaSessao(c).publicarResumo(id, c.get("sessao").usuario.id, new Date().toISOString());
  if (r === "inexistente") return respostaErro(c, 404, "Esta intimação ainda não tem resumo.");
  if (r === "nao_aprovado") return respostaErro(c, 409, "Só um resumo aprovado pode ser publicado no portal. Revise e aprove o resumo primeiro.");
  if (r === "sem_processo") return respostaErro(c, 409, "Vincule a intimação a um processo antes de publicar o resumo: o cliente vê o resumo dentro do processo.");
  if (r === "ok") await registrar(c, "portal_resumo_publicado", "intimacoes_resumos", id);
  return c.json({ ok: true, publicado: true });
});

rotasPortalGestao.post("/intimacoes/:id/resumo/retirar", async (c) => {
  const id = c.req.param("id");
  if (await gestaoDaSessao(c).retirarResumo(id)) await registrar(c, "portal_resumo_retirado", "intimacoes_resumos", id);
  return c.json({ ok: true, publicado: false });
});
