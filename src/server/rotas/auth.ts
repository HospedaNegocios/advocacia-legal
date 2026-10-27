import { Hono } from "hono";
import type { Env } from "../env";
import type { Variaveis } from "../contexto";
import { criarAcessoAutenticacao } from "../db/repositorio";
import type { UsuarioComEscritorio } from "../db/repositorio";
import { auditar } from "../auditoria";
import { verificarSenha } from "../auth/senha";
import { criarDesafio, decifrar, verificarDesafio } from "../auth/cripto";
import { base32Decodificar, verificarCodigo } from "../auth/totp";
import {
  BLOQUEIO_MS,
  MAX_FALHAS,
  MENSAGEM_LIMITE,
  abrirSessao,
  contaHabilitada,
  estaBloqueada,
  erroContado,
  limiteAtingido,
  exige2fa,
  ipDe,
  lerSessao,
  limparCookie,
} from "../sessao";
import { lerJson, normalizarEmail, respostaErro } from "../validacao";

export const rotasAuth = new Hono<{ Bindings: Env; Variables: Variaveis }>();

const ERRO_LOGIN = "E-mail ou senha inválidos. Após 5 tentativas erradas a conta fica bloqueada por 15 minutos.";
const ID_PLATAFORMA = "plataforma";

function idDoEscritorio(u: UsuarioComEscritorio): string {
  return u.tenant_id ?? ID_PLATAFORMA;
}

rotasAuth.post("/login", async (c) => {
  if (await limiteAtingido(c, "login")) return respostaErro(c, 429, MENSAGEM_LIMITE);
  const corpo = await lerJson(c);
  const email = normalizarEmail(corpo.email);
  const senha = corpo.senha;
  const escolhido = typeof corpo.escritorio_id === "string" ? corpo.escritorio_id.slice(0, 64) : null;
  if (!email || typeof senha !== "string" || senha.length === 0 || senha.length > 200) {
    return erroContado(c, "login", 401, ERRO_LOGIN);
  }

  const acesso = criarAcessoAutenticacao(c.env.DB);
  const ip = ipDe(c);
  const contas = await acesso.buscarUsuariosPorEmail(email);
  const agoraIso = new Date().toISOString();

  // Conferimos a senha em TODAS as contas com este e-mail (um e-mail pode existir em vários escritórios).
  const aprovadas: UsuarioComEscritorio[] = [];
  const senhaErrada = new Set<string>();
  if (contas.length === 0) await verificarSenha(senha, "!", "!"); // gasta o mesmo tempo de uma conta real
  for (const conta of contas) {
    const confere = await verificarSenha(senha, conta.senha_hash, conta.senha_salt);
    if (!confere) senhaErrada.add(conta.id);
    else if (contaHabilitada(conta) && !estaBloqueada(conta, agoraIso)) aprovadas.push(conta);
  }

  // O escritório escolhido pelo cliente é só um seletor ENTRE contas cuja senha já conferiu.
  const candidatas = escolhido === null ? aprovadas : aprovadas.filter((u) => idDoEscritorio(u) === escolhido);

  if (candidatas.length === 0) {
    for (const conta of contas) {
      // Só conta falha em contas cuja senha NÃO conferiu e que não estão bloqueadas.
      if (senhaErrada.has(conta.id) && !estaBloqueada(conta, agoraIso) && conta.senha_definida === 1) {
        await acesso.registrarFalha(conta.id, MAX_FALHAS, new Date(Date.now() + BLOQUEIO_MS).toISOString());
      }
      await auditar(c.env.DB, {
        tenantId: conta.tenant_id,
        userId: conta.id,
        acao: "login_falha",
        entidade: "sessao",
        detalhes: { motivo: "credenciais" },
        ip,
      });
    }
    if (contas.length === 0) {
      await auditar(c.env.DB, { tenantId: null, acao: "login_falha", entidade: "sessao", detalhes: { motivo: "credenciais" }, ip });
    }
    return erroContado(c, "login", 401, ERRO_LOGIN);
  }

  if (candidatas.length > 1) {
    const nomes = await Promise.all(
      candidatas.map(async (u) => ({ id: idDoEscritorio(u), nome: u.tenant_nome ?? "Administração da plataforma" })),
    );
    return c.json({ ok: true, etapa: "escolher_escritorio", escritorios: nomes });
  }

  const conta = candidatas[0] as UsuarioComEscritorio;
  if (conta.totp_ativo === 1 && conta.totp_secret) {
    // Falhas só são zeradas depois do 2FA, para não permitir tentativas ilimitadas do código.
    const desafio = await criarDesafio(conta.id, c.env.CHAVE_CRIPTO);
    return c.json({ ok: true, etapa: "2fa", desafio });
  }
  await acesso.zerarFalhas(conta.id);
  const precisa2fa = exige2fa(conta);
  await abrirSessao(c, conta, precisa2fa);
  await auditar(c.env.DB, {
    tenantId: conta.tenant_id,
    userId: conta.id,
    acao: "login_sucesso",
    entidade: "sessao",
    detalhes: { pendente_2fa: precisa2fa },
    ip,
  });
  return c.json({ ok: true, etapa: precisa2fa ? "configurar_2fa" : "ok" });
});

rotasAuth.post("/2fa", async (c) => {
  if (await limiteAtingido(c, "login")) return respostaErro(c, 429, MENSAGEM_LIMITE);
  const corpo = await lerJson(c);
  const erroInvalido = "Código ou desafio inválido. Se o problema continuar, entre novamente.";
  if (typeof corpo.desafio !== "string" || typeof corpo.codigo !== "string") return erroContado(c, "login", 401, erroInvalido);
  const userId = await verificarDesafio(corpo.desafio, c.env.CHAVE_CRIPTO);
  if (!userId) return erroContado(c, "login", 401, "Desafio expirado. Entre novamente com e-mail e senha.");

  const acesso = criarAcessoAutenticacao(c.env.DB);
  const conta = await acesso.buscarUsuario(userId);
  if (!conta || !contaHabilitada(conta) || estaBloqueada(conta) || conta.totp_ativo !== 1 || !conta.totp_secret) {
    return erroContado(c, "login", 401, erroInvalido);
  }
  const ip = ipDe(c);
  let passo: number | null = null;
  try {
    const segredo = base32Decodificar(await decifrar(conta.totp_secret, c.env.CHAVE_CRIPTO));
    passo = await verificarCodigo(segredo, corpo.codigo.trim(), Date.now());
  } catch {
    return respostaErro(c, 500, "Não foi possível validar o código. Fale com o suporte.");
  }
  // O mesmo código (passo) não vale duas vezes.
  if (passo === null || !(await acesso.consumirPassoTotp(conta.id, passo))) {
    await acesso.registrarFalha(conta.id, MAX_FALHAS, new Date(Date.now() + BLOQUEIO_MS).toISOString());
    await auditar(c.env.DB, {
      tenantId: conta.tenant_id,
      userId: conta.id,
      acao: "login_falha",
      entidade: "sessao",
      detalhes: { motivo: "2fa" },
      ip,
    });
    return erroContado(c, "login", 401, erroInvalido);
  }
  await acesso.zerarFalhas(conta.id);
  await abrirSessao(c, conta, false);
  await auditar(c.env.DB, {
    tenantId: conta.tenant_id,
    userId: conta.id,
    acao: "login_sucesso",
    entidade: "sessao",
    detalhes: { pendente_2fa: false, segundo_fator: true },
    ip,
  });
  return c.json({ ok: true, etapa: "ok" });
});

rotasAuth.post("/logout", async (c) => {
  const sessao = await lerSessao(c);
  if (sessao) {
    await criarAcessoAutenticacao(c.env.DB).excluirSessao(sessao.sessaoId);
    await auditar(c.env.DB, {
      tenantId: sessao.tenantId,
      userId: sessao.usuario.id,
      acao: "logout",
      entidade: "sessao",
      ip: ipDe(c),
    });
  }
  limparCookie(c);
  return c.json({ ok: true });
});
