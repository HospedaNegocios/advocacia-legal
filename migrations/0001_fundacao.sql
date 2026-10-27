-- Fase 0: tabelas de fundação. SQLite (D1).
-- Datas em texto ISO 8601 UTC (ex.: 2026-10-27T13:00:00.000Z).

-- Escritórios (tenants). Gerenciado somente pelo dono da plataforma.
CREATE TABLE tenants (
  id TEXT PRIMARY KEY NOT NULL,
  nome TEXT NOT NULL,
  plano TEXT NOT NULL CHECK (plano IN ('solo', 'escritorio', 'banca')),
  status TEXT NOT NULL CHECK (status IN ('teste', 'ativo', 'suspenso', 'cancelado')),
  teste_ate TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

-- Usuários.
-- Usuário de escritório: tenant_id preenchido, perfil preenchido, papel_plataforma NULL.
-- Dono da plataforma (única exceção documentada a "tenant_id NOT NULL"):
--   tenant_id NULL, perfil NULL, papel_plataforma = 'dono'.
CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT REFERENCES tenants (id),
  papel_plataforma TEXT CHECK (papel_plataforma IN ('dono')),
  perfil TEXT CHECK (perfil IN ('socio', 'advogado', 'estagiario', 'secretaria')),
  nome TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  senha_hash TEXT NOT NULL,
  senha_salt TEXT NOT NULL,
  totp_secret TEXT,
  totp_ativo INTEGER NOT NULL DEFAULT 0 CHECK (totp_ativo IN (0, 1)),
  tentativas_falhas INTEGER NOT NULL DEFAULT 0,
  bloqueado_ate TEXT,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  CHECK (
    (tenant_id IS NOT NULL AND papel_plataforma IS NULL AND perfil IS NOT NULL)
    OR (tenant_id IS NULL AND papel_plataforma = 'dono' AND perfil IS NULL)
  )
);
-- E-mail único por escritório.
CREATE UNIQUE INDEX users_tenant_email_unico ON users (tenant_id, email) WHERE tenant_id IS NOT NULL;
-- E-mail único entre donos da plataforma.
CREATE UNIQUE INDEX users_dono_email_unico ON users (email) WHERE tenant_id IS NULL;
CREATE INDEX users_tenant_id_idx ON users (tenant_id);

-- Sessões. id = hash do token (o token em si nunca é gravado).
-- tenant_id NULL somente para sessão de dono da plataforma.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id),
  tenant_id TEXT REFERENCES tenants (id),
  expira_em TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX sessions_tenant_id_idx ON sessions (tenant_id);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expira_em_idx ON sessions (expira_em);

-- Log de auditoria (somente inserção pela aplicação).
-- tenant_id NULL somente para ações do dono da plataforma fora de um escritório.
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT REFERENCES tenants (id),
  user_id TEXT REFERENCES users (id),
  acao TEXT NOT NULL,
  entidade TEXT NOT NULL,
  entidade_id TEXT,
  detalhes TEXT CHECK (detalhes IS NULL OR json_valid(detalhes)),
  ip TEXT,
  criado_em TEXT NOT NULL
);
CREATE INDEX audit_log_tenant_id_idx ON audit_log (tenant_id, criado_em);
CREATE INDEX audit_log_user_id_idx ON audit_log (user_id);
