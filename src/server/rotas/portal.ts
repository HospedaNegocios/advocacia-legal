import { Hono } from "hono";
import type { Env } from "../env";
import type { Ctx, Variaveis } from "../contexto";
import { criarAcessoPortal, criarRepositorioPortal } from "../db/portal";
import type { ProcessoDoPortal, UsuarioPortalComContexto } from "../db/portal";
import { FORMATO_TOKEN, sha256Hex } from "../auth/codificacao";
import { criarLinkAnexo, verificarLinkAnexo, VALIDADE_LINK_ANEXO_MS } from "../auth/cripto";
import { hashSenha, validarSenhaNova, verificarSenha } from "../auth/senha";
import { cabecalhoDownload } from "../anexos";
import { BLOQUEIO_MS, MAX_FALHAS, MENSAGEM_LIMITE, erroContado, limiteAtingido } from "../sessao";
import { abrirSessaoPortal, acessoHabilitado, auditarPortal, estaBloqueado, exigirSessaoPortal, lerSessaoPortal, limparCookiePortal } from "../portal-sessao";
import { lerJson, normalizarEmail, respostaErro } from "../validacao";

// Portal do cliente (somente leitura). O escritório e o cliente vêm SEMPRE da sessão do portal (cookie `__Host-portal`),
// nunca de parâmetro, corpo ou cabeçalho. Nenhuma rota daqui aceita tenant_id nem cliente_id. Veja docs/PORTAL.md.
export const rotasPortal = new Hono<{ Bindings: Env; Variables: Variaveis }>();

const ERRO_LOGIN = "E-mail ou senha inválidos. Após 5 tentativas erradas o acesso fica bloqueado por 15 minutos.";
const ERRO_LINK = "Link inválido, expirado ou já utilizado. Peça um novo link ao seu escritório.";

// ---------- Entrar, sair e aceitar o convite (sem sessão) ----------

rotasPortal.post("/entrar", async (c) => {
  if (await limiteAtingido(c, "portal-login")) return respostaErro(c, 429, MENSAGEM_LIMITE);
  const corpo = await lerJson(c);
  const email = normalizarEmail(corpo.email);
  const senha = corpo.senha;
  const escolhido = typeof corpo.escritorio_id === "string" ? corpo.escritorio_id.slice(0, 64) : null;
  if (!email || typeof senha !== "string" || senha.length === 0 || senha.length > 200) return erroContado(c, "portal-login", 401, ERRO_LOGIN);

  const acesso = criarAcessoPortal(c.env.DB);
  const contas = await acesso.usuariosPorEmail(email);
  const agoraIso = new Date().toISOString();
  const aprovadas: UsuarioPortalComContexto[] = [];
  const senhaErrada = new Set<string>();
  if (contas.length === 0) await verificarSenha(senha, "!", "!"); // gasta o mesmo tempo de uma conta real
  for (const conta of contas) {
    if (!(await verificarSenha(senha, conta.senha_hash, conta.senha_salt))) senhaErrada.add(conta.id);
    else if (acessoHabilitado(conta) && !estaBloqueado(conta, agoraIso)) aprovadas.push(conta);
  }
  // O escritório escolhido é só um seletor ENTRE contas cuja senha já conferiu.
  const candidatas = escolhido === null ? aprovadas : aprovadas.filter((u) => u.tenant_id === escolhido);

  if (candidatas.length === 0) {
    for (const conta of contas) {
      if (senhaErrada.has(conta.id) && !estaBloqueado(conta, agoraIso) && conta.senha_definida === 1) {
        await acesso.registrarFalha(conta.id, MAX_FALHAS, new Date(Date.now() + BLOQUEIO_MS).toISOString());
      }
      await auditarPortal(c, conta.tenant_id, "portal_login_falha", conta.id);
    }
    return erroContado(c, "portal-login", 401, ERRO_LOGIN);
  }
  if (candidatas.length > 1) {
    return c.json({ ok: true, etapa: "escolher_escritorio", escritorios: candidatas.map((u) => ({ id: u.tenant_id, nome: u.tenant_nome })) });
  }
  const conta = candidatas[0] as UsuarioPortalComContexto;
  await acesso.zerarFalhas(conta.id);
  await abrirSessaoPortal(c, conta);
  await auditarPortal(c, conta.tenant_id, "portal_login_sucesso", conta.id);
  return c.json({ ok: true, etapa: "ok" });
});

rotasPortal.post("/sair", async (c) => {
  const sessao = await lerSessaoPortal(c);
  if (sessao) {
    await criarAcessoPortal(c.env.DB).excluirSessao(sessao.sessaoId);
    await auditarPortal(c, sessao.tenantId, "portal_logout", sessao.usuario.id);
  }
  limparCookiePortal(c);
  return c.json({ ok: true });
});

/** Convite utilizável: existe, não usado, não expirado, e o acesso ainda pode entrar (ativo, escritório em operação, cliente ativo, consentimento). */
async function conviteUtilizavel(c: Ctx, bruto: unknown) {
  if (typeof bruto !== "string" || !FORMATO_TOKEN.test(bruto)) return null;
  const hash = await sha256Hex(bruto);
  const acesso = criarAcessoPortal(c.env.DB);
  const convite = await acesso.buscarConvite(hash);
  if (!convite || convite.usado_em !== null || convite.expira_em <= new Date().toISOString()) return null;
  const usuario = await acesso.usuario(convite.portal_usuario_id, convite.tenant_id);
  if (!usuario || usuario.ativo !== 1 || usuario.cliente_ativo !== 1 || usuario.consentimento_ativo !== 1) return null;
  if (usuario.tenant_status !== "teste" && usuario.tenant_status !== "ativo") return null;
  return { hash, usuario };
}

rotasPortal.post("/convite/validar", async (c) => {
  if (await limiteAtingido(c, "portal-acesso")) return respostaErro(c, 429, MENSAGEM_LIMITE);
  const corpo = await lerJson(c);
  const achado = await conviteUtilizavel(c, corpo.token);
  if (!achado) return erroContado(c, "portal-acesso", 400, ERRO_LINK);
  return c.json({ ok: true, email: achado.usuario.email, escritorio: achado.usuario.tenant_nome });
});

rotasPortal.post("/convite/concluir", async (c) => {
  if (await limiteAtingido(c, "portal-acesso")) return respostaErro(c, 429, MENSAGEM_LIMITE);
  const corpo = await lerJson(c);
  const achado = await conviteUtilizavel(c, corpo.token);
  if (!achado) return erroContado(c, "portal-acesso", 400, ERRO_LINK);
  const erroSenha = validarSenhaNova(corpo.senha);
  if (erroSenha) return respostaErro(c, 400, erroSenha);
  const credenciais = await hashSenha(corpo.senha as string);
  const acesso = criarAcessoPortal(c.env.DB);
  // Uso único: o UPDATE condicional só vence para uma requisição.
  if (!(await acesso.consumirConvite(achado.hash, new Date().toISOString()))) return erroContado(c, "portal-acesso", 400, ERRO_LINK);
  const u = achado.usuario;
  await acesso.definirSenha(u.id, credenciais);
  await auditarPortal(c, u.tenant_id, "portal_acesso_ativado", u.id);
  const conta = await acesso.usuario(u.id, u.tenant_id);
  if (!conta || !acessoHabilitado(conta)) return erroContado(c, "portal-acesso", 400, ERRO_LINK);
  await abrirSessaoPortal(c, conta);
  await auditarPortal(c, u.tenant_id, "portal_login_sucesso", u.id, { origem: "convite" });
  return c.json({ ok: true });
});

// ---------- Com sessão do portal (somente leitura) ----------

const protegidas = new Hono<{ Bindings: Env; Variables: Variaveis }>();
protegidas.use("*", exigirSessaoPortal);

function repoDoPortal(c: Ctx) {
  const s = c.get("sessaoPortal");
  return criarRepositorioPortal(c.env.DB, s.tenantId, s.clienteId);
}

const processoPublico = (p: ProcessoDoPortal) => ({ id: p.id, numero_cnj: p.numero_cnj, fase: p.fase, tribunal: p.tribunal, orgao: p.orgao });
const documentoPublico = (d: { id: string; nome_original: string; tipo_mime: string; tamanho_bytes: number; criado_em: string }) => ({
  id: d.id,
  nome: d.nome_original,
  tipo_mime: d.tipo_mime,
  tamanho_bytes: d.tamanho_bytes,
  criado_em: d.criado_em,
});

protegidas.get("/eu", (c) => {
  const u = c.get("sessaoPortal").usuario;
  return c.json({ ok: true, email: u.email, cliente: { nome: u.cliente_nome }, escritorio: { nome: u.tenant_nome } });
});

protegidas.get("/processos", async (c) => {
  const lista = await repoDoPortal(c).processos();
  return c.json({ ok: true, processos: lista.map(processoPublico) });
});

protegidas.get("/processos/:id", async (c) => {
  const repo = repoDoPortal(c);
  const p = await repo.processo(c.req.param("id"));
  if (!p) return respostaErro(c, 404, "Processo não encontrado.");
  const [andamentos, resumos, documentos] = await Promise.all([repo.andamentos(p.id), repo.resumos(p.id), repo.documentosDoProcesso(p.id)]);
  return c.json({
    ok: true,
    processo: processoPublico(p),
    andamentos: andamentos.map((a) => ({ id: a.id, data: a.data, descricao: a.descricao })),
    resumos: resumos.map((r) => ({ texto: r.texto, data_disponibilizacao: r.data_disponibilizacao, publicado_em: r.publicado_em })),
    documentos: documentos.map(documentoPublico),
  });
});

protegidas.get("/documentos", async (c) => {
  const lista = await repoDoPortal(c).documentosDoCliente();
  return c.json({ ok: true, documentos: lista.map(documentoPublico) });
});

/** Escopo do link: preso ao cliente da sessão, então um link do escritório (ou de outro cliente) não vale aqui. */
const escopoDoLink = (clienteId: string) => `portal:${clienteId}`;

protegidas.get("/anexos/:anexoId/link", async (c) => {
  const s = c.get("sessaoPortal");
  const doc = await repoDoPortal(c).documento(c.req.param("anexoId"));
  if (!doc) return respostaErro(c, 404, "Documento não encontrado.");
  const token = await criarLinkAnexo(s.tenantId, doc.id, c.env.CHAVE_CRIPTO, Date.now(), escopoDoLink(s.clienteId));
  return c.json({ ok: true, url: `/api/portal/anexos/${doc.id}/arquivo?token=${token}`, validade_segundos: VALIDADE_LINK_ANEXO_MS / 1000 });
});

protegidas.get("/anexos/:anexoId/arquivo", async (c) => {
  const s = c.get("sessaoPortal");
  const anexoId = c.req.param("anexoId");
  if (!(await verificarLinkAnexo(c.req.query("token") ?? "", s.tenantId, anexoId, c.env.CHAVE_CRIPTO, Date.now(), escopoDoLink(s.clienteId)))) {
    return respostaErro(c, 403, "Link inválido ou expirado. Volte à tela anterior e gere um novo.");
  }
  // A visibilidade é conferida DE NOVO no download: retirar o compartilhamento vale já.
  const doc = await repoDoPortal(c).documento(anexoId);
  if (!doc || !doc.chave_r2.startsWith(`${s.tenantId}/`)) return respostaErro(c, 404, "Documento não encontrado.");
  const objeto = await c.env.ARQUIVOS.get(doc.chave_r2);
  if (!objeto) return respostaErro(c, 404, "Documento não encontrado.");
  await auditarPortal(c, s.tenantId, "portal_documento_baixado", s.usuario.id, { anexo_id: doc.id });
  return new Response(objeto.body, {
    headers: {
      "Content-Type": doc.tipo_mime,
      "Content-Length": String(doc.tamanho_bytes),
      "Content-Disposition": cabecalhoDownload(doc.nome_original),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
});

rotasPortal.route("/", protegidas);
