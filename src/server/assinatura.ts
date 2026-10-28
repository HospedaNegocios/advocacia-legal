import { createMiddleware } from "hono/factory";
import type { Env } from "./env";
import type { Variaveis } from "./contexto";
import { lerSessao } from "./sessao";
import { MENSAGEM_BLOQUEADO, MENSAGEM_SOMENTE_LEITURA, resumoDaAssinatura } from "../comum/assinatura";
import type { ResumoAssinatura } from "../comum/assinatura";
import type { UsuarioComEscritorio } from "./db/repositorio";

// CONTROLE CENTRAL DE ACESSO POR SITUAÇÃO DA ASSINATURA (regras em docs/ASSINATURA.md e src/comum/assinatura.ts).
//  - somente leitura: GET/HEAD/OPTIONS passam; POST/PUT/PATCH/DELETE são recusados com HTTP 402.
//  - bloqueado: toda rota de escritório é recusada com HTTP 402 (a tela mostra "Assinatura vencida").
// Falha fechada: vale para TODA rota /api/ de escritório, exceto a lista abaixo (acesso, sessão, dono, portal do cliente).

/** Primeiro trecho de /api/<trecho>/... que NÃO é rota de escritório. O portal do cliente tem sessão própria. */
const FORA_DO_CONTROLE = new Set(["saude", "auth", "acesso", "2fa", "eu", "plataforma", "portal"]);
const METODOS_DE_LEITURA = new Set(["GET", "HEAD", "OPTIONS"]);
/** Apenas calcula uma data (não grava nada): continua disponível em somente leitura. */
const SOMENTE_CALCULO = new Set(["POST /api/prazos/calcular"]);

export const CODIGO_SOMENTE_LEITURA = "assinatura_somente_leitura";
export const CODIGO_BLOQUEADO = "assinatura_bloqueada";

/** Situação da assinatura do escritório do usuário; dono da plataforma e contas sem escritório são sempre "normal". */
export function assinaturaDoUsuario(u: UsuarioComEscritorio, agora: Date | number = Date.now()): ResumoAssinatura {
  if (u.tenant_id === null) return resumoDaAssinatura({ status: null, teste_ate: null });
  return resumoDaAssinatura({ status: u.tenant_status, teste_ate: u.tenant_teste_ate }, agora);
}

export const controleDeAssinatura = createMiddleware<{ Bindings: Env; Variables: Variaveis }>(async (c, next) => {
  const caminho = new URL(c.req.url).pathname;
  const partes = caminho.split("/");
  if (partes[1] !== "api" || FORA_DO_CONTROLE.has(partes[2] ?? "")) return next();
  const sessao = await lerSessao(c);
  // Sem sessão válida, dono da plataforma ou sessão pendente de 2FA: a própria rota decide (401/403).
  if (!sessao || sessao.tenantId === null || sessao.pendente2fa) return next();
  const { situacao } = assinaturaDoUsuario(sessao.usuario);
  if (situacao === "normal") return next();
  const escrita = !METODOS_DE_LEITURA.has(c.req.method.toUpperCase());
  if (situacao === "bloqueado") return c.json({ ok: false, erro: MENSAGEM_BLOQUEADO, codigo: CODIGO_BLOQUEADO }, 402);
  if (escrita && !SOMENTE_CALCULO.has(`${c.req.method.toUpperCase()} ${caminho.replace(/\/+$/, "")}`)) {
    return c.json({ ok: false, erro: MENSAGEM_SOMENTE_LEITURA, codigo: CODIGO_SOMENTE_LEITURA }, 402);
  }
  return next();
});
