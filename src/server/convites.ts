import { criarRepositorio } from "./db/repositorio";
import type { Perfil } from "./db/repositorio";
import { gerarToken, sha256Hex } from "./auth/codificacao";
import { SENHA_INUTILIZAVEL } from "./auth/senha";

export const VALIDADE_CONVITE_MS = 7 * 24 * 60 * 60 * 1000;

export type ResultadoConvite =
  | { ok: true; token: string; expiraEm: string; userId: string; reenvio: boolean }
  | { ok: false; motivo: "ja_existe" };

/**
 * Cria (ou renova) o convite de um usuário de UM escritório. `tenantId` vem da sessão do sócio
 * ou, no painel do dono, do escritório que o dono escolheu. Só o hash do token é gravado.
 */
export async function criarConvite(
  db: D1Database,
  tenantId: string,
  dados: { email: string; perfil: Perfil; criadoPor: string },
): Promise<ResultadoConvite> {
  const repo = criarRepositorio(db, tenantId);
  const [existente] = await repo.users.listar({ email: dados.email }, { limite: 1 });
  let userId: string;
  let reenvio = false;
  if (existente) {
    // Só renova convite de quem ainda não aceitou; usuário que já tem senha não é tocado.
    if (existente.senha_definida === 1) return { ok: false, motivo: "ja_existe" };
    userId = existente.id;
    reenvio = true;
    await repo.users.atualizar(userId, { perfil: dados.perfil, ativo: 1 });
    await repo.tokens.excluirPor({ user_id: userId });
  } else {
    userId = await repo.users.inserir({
      perfil: dados.perfil,
      nome: (dados.email.split("@")[0] ?? "Usuário").slice(0, 120),
      email: dados.email,
      senha_hash: SENHA_INUTILIZAVEL.senha_hash,
      senha_salt: SENHA_INUTILIZAVEL.senha_salt,
      senha_definida: 0,
    });
  }
  const token = gerarToken();
  const expiraEm = new Date(Date.now() + VALIDADE_CONVITE_MS).toISOString();
  await repo.tokens.inserir({
    id: await sha256Hex(token),
    tipo: "convite",
    user_id: userId,
    expira_em: expiraEm,
    criado_por: dados.criadoPor,
  });
  return { ok: true, token, expiraEm, userId, reenvio };
}
