import type { Ctx } from "./contexto";
import type { Perfil, Plano } from "./db/repositorio";

export const PLANOS: readonly Plano[] = ["solo", "escritorio", "banca"];
export const PERFIS: readonly Perfil[] = ["socio", "advogado", "estagiario", "secretaria"];

export async function lerJson(c: Ctx): Promise<Record<string, unknown>> {
  try {
    const corpo = await c.req.json();
    return corpo !== null && typeof corpo === "object" && !Array.isArray(corpo) ? (corpo as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const FORMATO_EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]+$/;

export function normalizarEmail(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const email = valor.trim().toLowerCase();
  return email.length <= 254 && FORMATO_EMAIL.test(email) ? email : null;
}

export function normalizarNome(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const nome = valor.trim().replace(/\s+/g, " ");
  return nome.length >= 1 && nome.length <= 120 ? nome : null;
}

export function ehPlano(v: unknown): v is Plano {
  return typeof v === "string" && (PLANOS as readonly string[]).includes(v);
}

export function ehPerfil(v: unknown): v is Perfil {
  return typeof v === "string" && (PERFIS as readonly string[]).includes(v);
}

export function respostaErro(c: Ctx, status: 400 | 401 | 403 | 404 | 409 | 429 | 500, erro: string) {
  return c.json({ ok: false, erro }, status);
}
