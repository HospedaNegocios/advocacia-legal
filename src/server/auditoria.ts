import { criarAcessoPlataforma, criarRepositorio } from "./db/repositorio";

export interface DadosAuditoria {
  /** Escritório ao qual o registro pertence (NULL = ação da plataforma). */
  tenantId: string | null;
  userId?: string | null;
  acao: string;
  entidade: string;
  entidadeId?: string | null;
  /** NUNCA incluir senhas, tokens ou segredos TOTP. */
  detalhes?: Record<string, string | number | boolean | null>;
  ip?: string | null;
  /** Ação do dono da plataforma sobre um escritório: registra com o tenant afetado, via acesso da plataforma. */
  plataforma?: boolean;
}

export async function auditar(db: D1Database, d: DadosAuditoria): Promise<void> {
  const base = {
    userId: d.userId ?? null,
    acao: d.acao,
    entidade: d.entidade,
    entidadeId: d.entidadeId ?? null,
    ...(d.detalhes !== undefined ? { detalhes: d.detalhes } : {}),
    ip: d.ip ?? null,
  };
  if (d.tenantId && !d.plataforma) await criarRepositorio(db, d.tenantId).auditoria.registrar(base);
  else await criarAcessoPlataforma(db).registrarAuditoria({ ...base, tenantId: d.tenantId });
}
