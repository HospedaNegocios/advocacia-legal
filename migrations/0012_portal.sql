-- Fase 3, passo 3: portal do cliente.
-- Princípio: o cliente só vê o que o escritório publicou de forma EXPLÍCITA. Todo marcador novo nasce em 0 (nada visível).
-- Toda tabela nova tem tenant_id NOT NULL e chaves estrangeiras compostas (id, tenant_id).

-- Marcadores de visibilidade (0 = o cliente NÃO vê). Só rotas próprias alteram estes campos.
ALTER TABLE processos ADD COLUMN visivel_portal INTEGER NOT NULL DEFAULT 0 CHECK (visivel_portal IN (0, 1));
ALTER TABLE processos_andamentos ADD COLUMN visivel_portal INTEGER NOT NULL DEFAULT 0 CHECK (visivel_portal IN (0, 1));
ALTER TABLE anexos ADD COLUMN compartilhado_cliente INTEGER NOT NULL DEFAULT 0 CHECK (compartilhado_cliente IN (0, 1));

-- Resumos de IA publicados no portal. Só resumo APROVADO pode ser publicado (conferido ao publicar e, de novo, ao ler);
-- rejeitar o resumo apaga a publicação (feito na camada de dados, na mesma transação).
CREATE TABLE portal_resumos_publicados (
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  intimacao_id TEXT NOT NULL,
  publicado_por TEXT NOT NULL,
  publicado_em TEXT NOT NULL,
  PRIMARY KEY (tenant_id, intimacao_id),
  FOREIGN KEY (tenant_id, intimacao_id) REFERENCES intimacoes_resumos (tenant_id, intimacao_id),
  FOREIGN KEY (publicado_por, tenant_id) REFERENCES users (id, tenant_id)
);

-- Acesso do cliente ao portal. Uma conta por e-mail em cada escritório, ligada a UM cliente.
CREATE TABLE portal_usuarios (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  cliente_id TEXT NOT NULL,
  email TEXT NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  senha_hash TEXT NOT NULL,
  senha_salt TEXT NOT NULL,
  -- 0 = convite ainda não aceito (sem senha utilizável, não consegue entrar).
  senha_definida INTEGER NOT NULL DEFAULT 0 CHECK (senha_definida IN (0, 1)),
  tentativas_falhas INTEGER NOT NULL DEFAULT 0,
  bloqueado_ate TEXT,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  convidado_por TEXT,
  ultimo_acesso_em TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  FOREIGN KEY (cliente_id, tenant_id) REFERENCES clientes (id, tenant_id),
  FOREIGN KEY (convidado_por, tenant_id) REFERENCES users (id, tenant_id)
);
CREATE UNIQUE INDEX portal_usuarios_id_tenant_unico ON portal_usuarios (id, tenant_id);
CREATE UNIQUE INDEX portal_usuarios_email_unico ON portal_usuarios (tenant_id, email);
CREATE INDEX portal_usuarios_cliente_idx ON portal_usuarios (tenant_id, cliente_id);
CREATE INDEX portal_usuarios_email_idx ON portal_usuarios (email);

-- Convites de uso único. id = SHA-256 (hex) do token; o token em si nunca é gravado.
CREATE TABLE portal_convites (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  portal_usuario_id TEXT NOT NULL,
  expira_em TEXT NOT NULL,
  usado_em TEXT,
  criado_por TEXT,
  criado_em TEXT NOT NULL,
  FOREIGN KEY (portal_usuario_id, tenant_id) REFERENCES portal_usuarios (id, tenant_id),
  FOREIGN KEY (criado_por, tenant_id) REFERENCES users (id, tenant_id)
);
CREATE INDEX portal_convites_usuario_idx ON portal_convites (tenant_id, portal_usuario_id);

-- Sessões do portal (separadas das do escritório). id = SHA-256 (hex) do token do cookie `__Host-portal`.
CREATE TABLE portal_sessoes (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  portal_usuario_id TEXT NOT NULL,
  expira_em TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  FOREIGN KEY (portal_usuario_id, tenant_id) REFERENCES portal_usuarios (id, tenant_id)
);
CREATE INDEX portal_sessoes_usuario_idx ON portal_sessoes (tenant_id, portal_usuario_id);
CREATE INDEX portal_sessoes_expira_idx ON portal_sessoes (expira_em);
