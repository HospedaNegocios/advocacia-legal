import { Hono } from "hono";
import type { Env } from "../env";
import type { Variaveis } from "../contexto";
import { criarAcessoAutenticacao } from "../db/repositorio";
import type { LinhaTokenComUsuario } from "../db/repositorio";
import { auditar } from "../auditoria";
import { FORMATO_TOKEN, sha256Hex } from "../auth/codificacao";
import { hashSenha, validarSenhaNova } from "../auth/senha";
import { cifrar, decifrar } from "../auth/cripto";
import { base32Codificar, base32Decodificar, gerarSegredoTotp, montarUriOtpauth, verificarCodigo } from "../auth/totp";
import { MENSAGEM_LIMITE, abrirSessao, exigirSessao, limiteAtingido, erroContado, exige2fa, ipDe } from "../sessao";
import { lerJson, normalizarNome, respostaErro } from "../validacao";

export const rotasAcesso = new Hono<{ Bindings: Env; Variables: Variaveis }>();
const ERRO_LINK = "Link inválido, expirado ou já utilizado. Peça um novo link.";

/** Token válido para uso: existe, não usado, não expirado, usuário ativo e escritório em teste/ativo. */
function tokenUtilizavel(t: LinhaTokenComUsuario | null): t is LinhaTokenComUsuario {
  if (!t || t.usado_em !== null || t.expira_em <= new Date().toISOString() || t.usuario_ativo !== 1) return false;
  if (t.tenant_id !== null && t.tenant_status !== "teste" && t.tenant_status !== "ativo") return false;
  return true;
}

async function buscarToken(env: Env, bruto: unknown) {
  if (typeof bruto !== "string" || !FORMATO_TOKEN.test(bruto)) return null;
  const hash = await sha256Hex(bruto);
  return { hash, linha: await criarAcessoAutenticacao(env.DB).buscarToken(hash) };
}

rotasAcesso.post("/validar", async (c) => {
  if (await limiteAtingido(c, "acesso")) return respostaErro(c, 429, MENSAGEM_LIMITE);
  const corpo = await lerJson(c);
  const achado = await buscarToken(c.env, corpo.token);
  if (!achado || !tokenUtilizavel(achado.linha)) return erroContado(c, "acesso", 400, ERRO_LINK);
  const t = achado.linha;
  return c.json({
    ok: true,
    tipo: t.tipo,
    email: t.usuario_email,
    nome: t.usuario_nome,
    escritorio: t.tenant_nome,
  });
});

rotasAcesso.post("/concluir", async (c) => {
  if (await limiteAtingido(c, "acesso")) return respostaErro(c, 429, MENSAGEM_LIMITE);
  const corpo = await lerJson(c);
  const achado = await buscarToken(c.env, corpo.token);
  if (!achado || !tokenUtilizavel(achado.linha)) return erroContado(c, "acesso", 400, ERRO_LINK);
  const t = achado.linha;

  const erroSenha = validarSenhaNova(corpo.senha);
  if (erroSenha) return respostaErro(c, 400, erroSenha);
  let nome: string | undefined;
  if (corpo.nome !== undefined && corpo.nome !== null && corpo.nome !== "") {
    const n = normalizarNome(corpo.nome);
    if (!n) return respostaErro(c, 400, "Informe um nome com até 120 caracteres.");
    nome = n;
  }
  const credenciais = await hashSenha(corpo.senha as string);

  const acesso = criarAcessoAutenticacao(c.env.DB);
  // Uso único: o UPDATE condicional só vence para uma requisição (token não usado e dentro da validade).
  if (!(await acesso.consumirToken(achado.hash, new Date().toISOString()))) return erroContado(c, "acesso", 400, ERRO_LINK);
  await acesso.definirSenha(t.user_id, { ...credenciais, ...(nome !== undefined ? { nome } : {}) });
  const ip = ipDe(c);
  await auditar(c.env.DB, {
    tenantId: t.tenant_id,
    userId: t.user_id,
    acao: t.tipo === "convite" ? "convite_aceito" : "primeiro_acesso_concluido",
    entidade: "users",
    entidadeId: t.user_id,
    ip,
  });

  const conta = await acesso.buscarUsuario(t.user_id);
  if (!conta) return erroContado(c, "acesso", 400, ERRO_LINK);
  // Quem já tem 2FA cadastrado (dono que pediu novo link) entra pelo login normal, com o código.
  if (conta.totp_ativo === 1) return c.json({ ok: true, etapa: "entrar" });
  const precisa2fa = exige2fa(conta);
  await abrirSessao(c, conta, precisa2fa);
  await auditar(c.env.DB, {
    tenantId: conta.tenant_id,
    userId: conta.id,
    acao: "login_sucesso",
    entidade: "sessao",
    detalhes: { pendente_2fa: precisa2fa, origem: "link" },
    ip,
  });
  return c.json({ ok: true, etapa: precisa2fa ? "configurar_2fa" : "ok" });
});

// ----- Configuração do 2FA (sessão completa ou pendente de 2FA) -----

export const rotasDoisFatores = new Hono<{ Bindings: Env; Variables: Variaveis }>();
rotasDoisFatores.use("*", exigirSessao({ permitirPendente: true }));

rotasDoisFatores.post("/iniciar", async (c) => {
  const { usuario } = c.get("sessao");
  if (usuario.totp_ativo === 1) return respostaErro(c, 409, "A verificação em duas etapas já está ativa.");
  const segredo = gerarSegredoTotp();
  const acesso = criarAcessoAutenticacao(c.env.DB);
  await acesso.salvarTotp(usuario.id, await cifrar(base32Codificar(segredo), c.env.CHAVE_CRIPTO));
  // O URI com o segredo só é devolvido aqui, ao próprio usuário logado, para montar o QR.
  return c.json({ ok: true, otpauth: montarUriOtpauth(segredo, usuario.email) });
});


rotasDoisFatores.post("/confirmar", async (c) => {
  if (await limiteAtingido(c, "login")) return respostaErro(c, 429, MENSAGEM_LIMITE);
  const { usuario, sessaoId } = c.get("sessao");
  const corpo = await lerJson(c);
  if (usuario.totp_ativo === 1) return respostaErro(c, 409, "A verificação em duas etapas já está ativa.");
  if (!usuario.totp_secret) return respostaErro(c, 400, "Inicie a configuração antes de confirmar o código.");
  if (typeof corpo.codigo !== "string") return respostaErro(c, 400, "Informe o código de 6 dígitos.");
  let passo: number | null;
  try {
    const segredo = base32Decodificar(await decifrar(usuario.totp_secret, c.env.CHAVE_CRIPTO));
    passo = await verificarCodigo(segredo, corpo.codigo.trim(), Date.now());
  } catch {
    return respostaErro(c, 500, "Não foi possível validar o código. Tente iniciar a configuração de novo.");
  }
  if (passo === null) return erroContado(c, "login", 400, "Código incorreto. Confira o aplicativo e tente de novo.");
  const acesso = criarAcessoAutenticacao(c.env.DB);
  await acesso.ativarTotp(usuario.id, passo);
  await acesso.liberarSessao2fa(sessaoId);
  await auditar(c.env.DB, {
    tenantId: usuario.tenant_id,
    userId: usuario.id,
    acao: "2fa_ativado",
    entidade: "users",
    entidadeId: usuario.id,
    ip: ipDe(c),
  });
  return c.json({ ok: true });
});
