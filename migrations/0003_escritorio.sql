-- Fase 1, passo 1: dados do escritório e OABs monitoradas.

-- Permite a chave estrangeira composta (user_id, tenant_id) em tabelas novas:
-- garante no banco que o usuário citado pertence ao mesmo escritório.
CREATE UNIQUE INDEX users_id_tenant_unico ON users (id, tenant_id);

-- Perfil do escritório (1 para 1 com tenants). Tudo opcional.
-- documento, telefone e cep guardam só dígitos. O nome de exibição continua em tenants.nome.
CREATE TABLE escritorio_perfil (
  tenant_id TEXT PRIMARY KEY NOT NULL REFERENCES tenants (id),
  razao_social TEXT,
  documento TEXT CHECK (documento IS NULL OR (length(documento) IN (11, 14) AND documento NOT GLOB '*[^0-9]*')),
  email_contato TEXT,
  telefone TEXT CHECK (telefone IS NULL OR (length(telefone) IN (10, 11) AND telefone NOT GLOB '*[^0-9]*')),
  cep TEXT CHECK (cep IS NULL OR (length(cep) = 8 AND cep NOT GLOB '*[^0-9]*')),
  logradouro TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  uf TEXT CHECK (uf IS NULL OR uf IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  atualizado_em TEXT NOT NULL
);

-- OABs monitoradas do escritório (base da busca de intimações no DJEN).
-- numero: só dígitos, sem zeros à esquerda. sufixo: letras maiúsculas digitadas depois do hífen (opcional).
CREATE TABLE oabs (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  numero TEXT NOT NULL CHECK (length(numero) BETWEEN 1 AND 10 AND numero NOT GLOB '*[^0-9]*'),
  sufixo TEXT CHECK (sufixo IS NULL OR (length(sufixo) BETWEEN 1 AND 5 AND sufixo NOT GLOB '*[^A-Z]*')),
  uf TEXT NOT NULL CHECK (uf IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  advogado_nome TEXT NOT NULL,
  user_id TEXT,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  FOREIGN KEY (user_id, tenant_id) REFERENCES users (id, tenant_id)
);
-- Única por escritório (sufixo ausente conta como vazio, pois NULL nunca é igual a NULL no índice).
CREATE UNIQUE INDEX oabs_unica ON oabs (tenant_id, numero, COALESCE(sufixo, ''), uf);
CREATE INDEX oabs_tenant_id_idx ON oabs (tenant_id, ativo);
