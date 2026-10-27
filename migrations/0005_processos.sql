-- Fase 1, passo 3: processos, partes, responsáveis e andamentos.
-- Toda tabela tem tenant_id NOT NULL. As chaves estrangeiras compostas (id, tenant_id)
-- garantem NO BANCO que um registro nunca aponta para dado de outro escritório.
-- Os anexos de processo usam a tabela genérica `anexos` (entidade = 'processo').

CREATE TABLE processos (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  -- Número CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO) guardado só com os 20 dígitos. O dígito verificador é conferido pela aplicação.
  numero_cnj TEXT NOT NULL CHECK (length(numero_cnj) = 20 AND numero_cnj NOT GLOB '*[^0-9]*'),
  tribunal TEXT,
  orgao TEXT,
  comarca TEXT,
  area TEXT,
  classe TEXT,
  assunto TEXT,
  fase TEXT NOT NULL CHECK (fase IN ('Conhecimento', 'Recursal', 'Execução', 'Suspenso', 'Arquivado')),
  -- Valor da causa em centavos (inteiro).
  valor_causa_centavos INTEGER CHECK (valor_causa_centavos IS NULL OR valor_causa_centavos >= 0),
  data_distribuicao TEXT CHECK (data_distribuicao IS NULL OR data_distribuicao GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  observacoes TEXT,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  criado_por TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  FOREIGN KEY (criado_por, tenant_id) REFERENCES users (id, tenant_id)
);
CREATE UNIQUE INDEX processos_id_tenant_unico ON processos (id, tenant_id);
CREATE UNIQUE INDEX processos_numero_por_escritorio ON processos (tenant_id, numero_cnj);
CREATE INDEX processos_fase_idx ON processos (tenant_id, ativo, fase);

-- Partes do processo: um cliente do escritório OU um nome livre (ex.: parte contrária).
CREATE TABLE processos_partes (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  processo_id TEXT NOT NULL,
  cliente_id TEXT,
  nome TEXT CHECK (nome IS NULL OR length(nome) BETWEEN 1 AND 150),
  -- Nome em minúsculas e sem acentos, só para a busca (preenchido pela camada de dados).
  nome_busca TEXT,
  polo TEXT NOT NULL CHECK (polo IN ('ativo', 'passivo', 'terceiro')),
  cliente_escritorio INTEGER NOT NULL DEFAULT 0 CHECK (cliente_escritorio IN (0, 1)),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  CHECK ((cliente_id IS NOT NULL AND nome IS NULL AND cliente_escritorio = 1) OR (cliente_id IS NULL AND nome IS NOT NULL)),
  FOREIGN KEY (processo_id, tenant_id) REFERENCES processos (id, tenant_id),
  FOREIGN KEY (cliente_id, tenant_id) REFERENCES clientes (id, tenant_id)
);
CREATE INDEX processos_partes_idx ON processos_partes (tenant_id, processo_id);
CREATE INDEX processos_partes_cliente_idx ON processos_partes (tenant_id, cliente_id);
CREATE UNIQUE INDEX processos_partes_cliente_unico ON processos_partes (tenant_id, processo_id, cliente_id) WHERE cliente_id IS NOT NULL;

-- Responsáveis: usuários do mesmo escritório (N para N).
CREATE TABLE processos_responsaveis (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  processo_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  FOREIGN KEY (processo_id, tenant_id) REFERENCES processos (id, tenant_id),
  FOREIGN KEY (user_id, tenant_id) REFERENCES users (id, tenant_id)
);
CREATE UNIQUE INDEX processos_responsaveis_unico ON processos_responsaveis (tenant_id, processo_id, user_id);
CREATE INDEX processos_responsaveis_user_idx ON processos_responsaveis (tenant_id, user_id);

-- Andamentos manuais. Não são editados; só o sócio pode apagar (com registro na auditoria).
CREATE TABLE processos_andamentos (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  processo_id TEXT NOT NULL,
  data TEXT NOT NULL CHECK (data GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  descricao TEXT NOT NULL CHECK (length(descricao) BETWEEN 1 AND 2000),
  registrado_por TEXT,
  criado_em TEXT NOT NULL,
  FOREIGN KEY (processo_id, tenant_id) REFERENCES processos (id, tenant_id),
  FOREIGN KEY (registrado_por, tenant_id) REFERENCES users (id, tenant_id)
);
CREATE INDEX processos_andamentos_idx ON processos_andamentos (tenant_id, processo_id, data);
