// Cliente da API. Todas as chamadas enviam o cookie da sessão (mesma origem) e o cabeçalho
// X-Requested-With exigido pelo servidor contra CSRF. O navegador envia o Origin sozinho.

export class ErroApi extends Error {
  constructor(
    mensagem: string,
    readonly status: number,
  ) {
    super(mensagem);
  }
}

export async function api<T = Record<string, unknown>>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  const headers: Record<string, string> = { "X-Requested-With": "advocacia" };
  const init: RequestInit = { method: metodo, credentials: "same-origin", headers };
  if (corpo !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(corpo);
  }
  let r: Response;
  try {
    r = await fetch(caminho, init);
  } catch {
    throw new ErroApi("Não foi possível falar com o servidor. Confira sua internet.", 0);
  }
  const json = (await r.json().catch(() => null)) as (T & { erro?: string }) | null;
  if (!r.ok) throw new ErroApi(json?.erro ?? "Algo deu errado. Tente novamente.", r.status);
  return json as T;
}

export type Perfil = "socio" | "advogado" | "estagiario" | "secretaria";
export type Plano = "solo" | "escritorio" | "banca";
export type Status = "teste" | "ativo" | "suspenso" | "cancelado";

export interface Eu {
  usuario: { id: string; nome: string; email: string; perfil: Perfil | null; dono_plataforma: boolean; totp_ativo: boolean };
  escritorio: { nome: string; status: Status; exigir_2fa: boolean } | null;
  pendente_2fa: boolean;
}

export const ROTULO_PERFIL: Record<Perfil, string> = {
  socio: "Sócio",
  advogado: "Advogado",
  estagiario: "Estagiário",
  secretaria: "Secretaria",
};
export const ROTULO_PLANO: Record<Plano, string> = { solo: "Solo", escritorio: "Escritório", banca: "Banca" };
export const ROTULO_STATUS: Record<Status, string> = {
  teste: "Em teste",
  ativo: "Ativo",
  suspenso: "Suspenso",
  cancelado: "Cancelado",
};

export function formatarDia(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function formatarData(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
