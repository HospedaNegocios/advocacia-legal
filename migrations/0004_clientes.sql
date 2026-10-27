-- Fase 1, passo 2: clientes, contatos, anexos (genérico) e consentimentos LGPD.
-- Toda tabela tem tenant_id NOT NULL. As chaves estrangeiras compostas (id, tenant_id)
-- garantem NO BANCO que um registro nunca aponta para dado de outro escritório.

CREATE TABLE clientes (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  tipo TEXT NOT NULL CHECK (tipo IN ('pf', 'pj')),
  -- PF: nome completo. PJ: razão social.
  nome TEXT NOT NULL CHECK (length(nome) BETWEEN 1 AND 150),
  -- Nome em minúsculas e sem acentos, só para a busca (preenchido pela camada de dados).
  nome_busca TEXT NOT NULL,
  nome_fantasia TEXT,
  -- CPF (11) ou CNPJ (14), só dígitos. Opcional, mas único por escritório quando informado.
  documento TEXT CHECK (documento IS NULL OR (documento NOT GLOB '*[^0-9]*' AND ((tipo = 'pf' AND length(documento) = 11) OR (tipo = 'pj' AND length(documento) = 14)))),
  rg TEXT,
  inscricao_estadual TEXT,
  data_nascimento TEXT CHECK (data_nascimento IS NULL OR data_nascimento GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  email TEXT,
  telefone TEXT CHECK (telefone IS NULL OR (length(telefone) IN (10, 11) AND telefone NOT GLOB '*[^0-9]*')),
  celular TEXT CHECK (celular IS NULL OR (length(celular) IN (10, 11) AND celular NOT GLOB '*[^0-9]*')),
  cep TEXT CHECK (cep IS NULL OR (length(cep) = 8 AND cep NOT GLOB '*[^0-9]*')),
  logradouro TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  uf TEXT CHECK (uf IS NULL OR uf IN ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
  observacoes TEXT,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  criado_por TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  FOREIGN KEY (criado_por, tenant_id) REFERENCES users (id, tenant_id)
);
CREATE UNIQUE INDEX clientes_id_tenant_unico ON clientes (id, tenant_id);
CREATE UNIQUE INDEX clientes_documento_unico ON clientes (tenant_id, documento) WHERE documento IS NOT NULL;
CREATE INDEX clientes_busca_idx ON clientes (tenant_id, ativo, nome_busca);
CREATE INDEX clientes_criado_idx ON clientes (tenant_id, criado_em);

-- Contatos adicionais (pessoas de contato de uma empresa, familiar, etc.).
CREATE TABLE clientes_contatos (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  cliente_id TEXT NOT NULL,
  nome TEXT NOT NULL CHECK (length(nome) BETWEEN 1 AND 120),
  cargo TEXT,
  email TEXT,
  telefone TEXT CHECK (telefone IS NULL OR (length(telefone) IN (10, 11) AND telefone NOT GLOB '*[^0-9]*')),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  FOREIGN KEY (cliente_id, tenant_id) REFERENCES clientes (id, tenant_id)
);
CREATE INDEX clientes_contatos_idx ON clientes_contatos (tenant_id, cliente_id);

-- Anexos genéricos (hoje só de cliente; no futuro, de processo). O arquivo fica no R2 (privado)
-- sob a chave "<tenant_id>/<entidade>/<entidade_id>/<aleatório>"; o nome original só vive aqui.
CREATE TABLE anexos (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  entidade TEXT NOT NULL CHECK (entidade IN ('cliente', 'processo')),
  entidade_id TEXT NOT NULL,
  nome_original TEXT NOT NULL,
  tipo_mime TEXT NOT NULL,
  tamanho_bytes INTEGER NOT NULL CHECK (tamanho_bytes > 0),
  chave_r2 TEXT NOT NULL,
  enviado_por TEXT,
  criado_em TEXT NOT NULL,
  FOREIGN KEY (enviado_por, tenant_id) REFERENCES users (id, tenant_id)
);
CREATE UNIQUE INDEX anexos_chave_unica ON anexos (chave_r2);
CREATE INDEX anexos_entidade_idx ON anexos (tenant_id, entidade, entidade_id);

-- Consentimentos LGPD. Os textos (finalidade, base legal, forma) são escritos pelo escritório;
-- o sistema não traz texto jurídico pronto.
CREATE TABLE consentimentos_lgpd (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  cliente_id TEXT NOT NULL,
  finalidade TEXT NOT NULL CHECK (length(finalidade) BETWEEN 1 AND 500),
  base_legal TEXT,
  forma TEXT NOT NULL CHECK (length(forma) BETWEEN 1 AND 200),
  data_consentimento TEXT NOT NULL CHECK (data_consentimento GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  revogado_em TEXT,
  registrado_por TEXT,
  criado_em TEXT NOT NULL,
  FOREIGN KEY (cliente_id, tenant_id) REFERENCES clientes (id, tenant_id),
  FOREIGN KEY (registrado_por, tenant_id) REFERENCES users (id, tenant_id)
);
CREATE INDEX consentimentos_idx ON consentimentos_lgpd (tenant_id, cliente_id);
