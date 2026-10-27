-- Fase 0, parte 2: acesso (primeiro acesso, convites, 2FA, limite de tentativas).

-- Escritório pode exigir 2FA de todos os usuários (o dono da plataforma sempre exige).
ALTER TABLE tenants ADD COLUMN exigir_2fa INTEGER NOT NULL DEFAULT 0 CHECK (exigir_2fa IN (0, 1));

-- 0 = convite ainda não aceito (usuário sem senha utilizável, não consegue entrar).
ALTER TABLE users ADD COLUMN senha_definida INTEGER NOT NULL DEFAULT 1 CHECK (senha_definida IN (0, 1));
-- Último passo de 30 s do TOTP aceito (impede reutilizar o mesmo código).
ALTER TABLE users ADD COLUMN totp_ultimo_passo INTEGER;

-- 1 = sessão que só pode configurar o 2FA (login feito, mas 2FA ainda não cadastrado).
ALTER TABLE sessions ADD COLUMN pendente_2fa INTEGER NOT NULL DEFAULT 0 CHECK (pendente_2fa IN (0, 1));

-- Links de uso único: primeiro acesso do dono e convite de usuário.
-- id = SHA-256 (hex) do token; o token em si nunca é gravado.
-- tenant_id NULL somente para 'primeiro_acesso' (dono da plataforma).
CREATE TABLE tokens_acesso (
  id TEXT PRIMARY KEY NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('primeiro_acesso', 'convite')),
  user_id TEXT NOT NULL REFERENCES users (id),
  tenant_id TEXT REFERENCES tenants (id),
  expira_em TEXT NOT NULL,
  usado_em TEXT,
  criado_por TEXT REFERENCES users (id),
  criado_em TEXT NOT NULL,
  CHECK (
    (tipo = 'primeiro_acesso' AND tenant_id IS NULL)
    OR (tipo = 'convite' AND tenant_id IS NOT NULL)
  )
);
CREATE INDEX tokens_acesso_tenant_id_idx ON tokens_acesso (tenant_id);
CREATE INDEX tokens_acesso_user_id_idx ON tokens_acesso (user_id);

-- Limite de tentativas por IP (chave = prefixo + SHA-256 do IP). Janela fixa.
-- Tabela da plataforma: não pertence a nenhum escritório.
CREATE TABLE limites_taxa (
  chave TEXT PRIMARY KEY NOT NULL,
  janela_inicio TEXT NOT NULL,
  contagem INTEGER NOT NULL
);
