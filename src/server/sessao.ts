import { createMiddleware } from "hono/factory";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Env } from "./env";
import type { Ctx, Variaveis } from "./contexto";
import { criarAcessoAutenticacao } from "./db/repositorio";
import { criarRepositorio } from "./db/repositorio";
import type { ModuloPermissao, NivelPermissao, UsuarioComEscritorio } from "./db/repositorio";
import { FORMATO_TOKEN, gerarToken, sha256Hex } from "./auth/codificacao";
import { respostaErro } from "./validacao";

export const NOME_COOKIE = "__Host-sessao";
export const DURACAO_SESSAO_MS = 12 * 60 * 60 * 1000;
export const MAX_FALHAS = 5;
export const BLOQUEIO_MS = 15 * 60 * 1000;
export const JANELA_LIMITE_MS = 15 * 60 * 1000;
export const MAX_TENTATIVAS_POR_IP = 20;

export function ipDe(c: Ctx): string {
  return (c.req.header("CF-Connecting-IP") ?? "desconhecido").slice(0, 64);
}

/** O dono sempre precisa de 2FA; usuário de escritório, quando o escritório exige. */
export function exige2fa(u: UsuarioComEscritorio): boolean {
  return u.papel_plataforma === "dono" || u.tenant_exigir_2fa === 1;
}

/** Conta pode entrar: ativa, senha definida e escritório (se houver) em teste ou ativo. */
export function contaHabilitada(u: UsuarioComEscritorio): boolean {
  if (u.ativo !== 1 || u.senha_definida !== 1) return false;
  if (u.tenant_id === null) return u.papel_plataforma === "dono";
  return u.tenant_status === "teste" || u.tenant_status === "ativo";
}

export function estaBloqueada(u: UsuarioComEscritorio, agoraIso = new Date().toISOString()): boolean {
  return u.bloqueado_ate !== null && u.bloqueado_ate > agoraIso;
}

/** Cria a sessão no banco (só o hash do token) e define o cookie. */
export async function abrirSessao(c: Ctx, u: UsuarioComEscritorio, pendente2fa: boolean): Promise<void> {
  const token = gerarToken();
  const acesso = criarAcessoAutenticacao(c.env.DB);
  await acesso.criarSessao({
    id: await sha256Hex(token),
    user_id: u.id,
    tenant_id: u.tenant_id,
    expira_em: new Date(Date.now() + DURACAO_SESSAO_MS).toISOString(),
    pendente_2fa: pendente2fa,
    ip: ipDe(c),
    user_agent: (c.req.header("User-Agent") ?? "").slice(0, 200) || null,
  });
  setCookie(c, NOME_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Strict",
    path: "/",
    maxAge: Math.floor(DURACAO_SESSAO_MS / 1000),
  });
  await acesso.limparExpirados();
}

export function limparCookie(c: Ctx): void {
  deleteCookie(c, NOME_COOKIE, { path: "/", secure: true });
}

/** Lê o cookie e valida a sessão. Devolve null se ausente, inválida, expirada ou conta inabilitada. */
export async function lerSessao(c: Ctx) {
  const token = getCookie(c, NOME_COOKIE);
  if (!token || !FORMATO_TOKEN.test(token)) return null;
  const acesso = criarAcessoAutenticacao(c.env.DB);
  const id = await sha256Hex(token);
  const linha = await acesso.buscarSessao(id);
  if (!linha) return null;
  if (linha.expira_em <= new Date().toISOString()) {
    await acesso.excluirSessao(id);
    return null;
  }
  const usuario = await acesso.buscarUsuario(linha.user_id);
  // Usuário inativo, escritório suspenso/cancelado ou escritório da sessão diferente do do usuário: rejeita.
  if (!usuario || !contaHabilitada(usuario) || usuario.tenant_id !== linha.tenant_id) {
    await acesso.excluirSessao(id);
    return null;
  }
  const pendente2fa = linha.pendente_2fa === 1 || (exige2fa(usuario) && usuario.totp_ativo !== 1);
  return { sessaoId: id, pendente2fa, usuario, tenantId: usuario.tenant_id };
}

interface OpcoesSessao {
  /** Aceita também sessão que só pode configurar o 2FA. */
  permitirPendente?: boolean;
  /** Exige dono da plataforma ('dono'), usuário de escritório ('escritorio') ou sócio ('socio'). */
  papel?: "dono" | "escritorio" | "socio";
}

export function exigirSessao(opcoes: OpcoesSessao = {}) {
  return createMiddleware<{ Bindings: Env; Variables: Variaveis }>(async (c, next) => {
    const sessao = await lerSessao(c);
    if (!sessao) {
      limparCookie(c);
      return respostaErro(c, 401, "Sessão ausente ou expirada. Entre novamente.");
    }
    if (sessao.pendente2fa && !opcoes.permitirPendente) {
      return respostaErro(c, 403, "Configure a verificação em duas etapas para continuar.");
    }
    const u = sessao.usuario;
    if (opcoes.papel === "dono" && u.papel_plataforma !== "dono") return respostaErro(c, 403, "Acesso negado.");
    if (opcoes.papel === "escritorio" && (u.tenant_id === null || u.papel_plataforma !== null)) {
      return respostaErro(c, 403, "Acesso negado.");
    }
    if (opcoes.papel === "socio" && (u.tenant_id === null || u.perfil !== "socio")) {
      return respostaErro(c, 403, "Acesso negado.");
    }
    c.set("sessao", sessao);
    await next();
  });
}

export type NivelEfetivo = "nenhum" | NivelPermissao;

/**
 * Nível de acesso do usuário da sessão a um módulo. Lido do banco a cada chamada (nunca guardado na sessão),
 * então uma mudança feita pelo sócio vale já na requisição seguinte. Sócio sempre tem "edicao".
 */
export async function nivelNoModulo(c: Ctx, modulo: ModuloPermissao): Promise<NivelEfetivo> {
  const { usuario, tenantId } = c.get("sessao");
  if (tenantId === null || usuario.tenant_id === null || usuario.papel_plataforma !== null) return "nenhum";
  if (usuario.perfil === "socio") return "edicao";
  return (await criarRepositorio(c.env.DB, tenantId).permissoes.obterNivel(usuario.id, modulo)) ?? "nenhum";
}

/**
 * Exige acesso ao módulo no nível pedido ("edicao" inclui "leitura"). Vai DEPOIS de `exigirSessao`
 * (sem sessão no contexto, recusa). Exemplo: `rotas.use("*", exigirSessao({ papel: "escritorio" }), exigirPermissao("financeiro", "leitura"))`.
 */
export function exigirPermissao(modulo: ModuloPermissao, minimo: NivelPermissao) {
  return createMiddleware<{ Bindings: Env; Variables: Variaveis }>(async (c, next) => {
    if (!c.get("sessao")) return respostaErro(c, 401, "Sessão ausente ou expirada. Entre novamente.");
    const nivel = await nivelNoModulo(c, modulo);
    const ok = nivel === "edicao" || (nivel === "leitura" && minimo === "leitura");
    if (!ok) {
      return respostaErro(
        c,
        403,
        nivel === "leitura"
          ? "Você pode apenas consultar esta área. Peça a um sócio para liberar a edição."
          : "Você não tem acesso a esta área. Peça a um sócio para liberar.",
      );
    }
    await next();
  });
}

async function chaveDoIp(c: Ctx, escopo: string): Promise<string> {
  return `${escopo}:${await sha256Hex(ipDe(c))}`;
}

/** True se este IP já errou demais na janela (só erros contam; quem acerta não gasta o limite). */
export async function limiteAtingido(c: Ctx, escopo: string, maximo = MAX_TENTATIVAS_POR_IP): Promise<boolean> {
  const total = await criarAcessoAutenticacao(c.env.DB).lerTentativas(await chaveDoIp(c, escopo), JANELA_LIMITE_MS);
  return total >= maximo;
}

/** Registra um erro (senha, código ou link inválido) deste IP. */
export async function registrarErroIp(c: Ctx, escopo: string): Promise<void> {
  await criarAcessoAutenticacao(c.env.DB).contarTentativa(await chaveDoIp(c, escopo), JANELA_LIMITE_MS);
}

/** Resposta de erro que também conta contra o limite de erros do IP. */
export async function erroContado(c: Ctx, escopo: string, status: 400 | 401, erro: string) {
  await registrarErroIp(c, escopo);
  return respostaErro(c, status, erro);
}

export const MENSAGEM_LIMITE = "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
