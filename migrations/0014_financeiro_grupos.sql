-- Fase 5: financeiro completo. Parcelamento e recorrência mensal.
-- Um "grupo" liga lançamentos independentes criados de uma vez (parcelas ou ocorrências mensais).
-- Cada lançamento continua sendo uma linha própria de `lancamentos` (editar/pagar um não altera os outros).
-- tenant_id NOT NULL e chave composta (id, tenant_id): o banco recusa grupo de outro escritório.

CREATE TABLE lancamentos_grupos (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  tipo TEXT NOT NULL CHECK (tipo IN ('parcelamento', 'recorrencia')),
  total_itens INTEGER NOT NULL CHECK (total_itens BETWEEN 2 AND 60),
  criado_por TEXT,
  criado_em TEXT NOT NULL,
  FOREIGN KEY (criado_por, tenant_id) REFERENCES users (id, tenant_id)
);
CREATE UNIQUE INDEX lancamentos_grupos_id_tenant_unico ON lancamentos_grupos (id, tenant_id);

-- O SQLite não acrescenta chave estrangeira composta com ALTER TABLE: a tabela é recriada com as colunas novas
-- (grupo_id e numero_no_grupo, ambos NULL para lançamentos avulsos) e os dados são copiados sem alteração.
CREATE TABLE lancamentos_nova (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  tipo TEXT NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  descricao TEXT NOT NULL CHECK (length(descricao) BETWEEN 1 AND 200),
  descricao_busca TEXT NOT NULL,
  categoria TEXT CHECK (categoria IS NULL OR length(categoria) BETWEEN 1 AND 60),
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
  vencimento TEXT NOT NULL CHECK (vencimento GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'pago', 'cancelado')),
  pago_em TEXT CHECK (pago_em IS NULL OR pago_em GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  valor_pago_centavos INTEGER CHECK (valor_pago_centavos IS NULL OR valor_pago_centavos > 0),
  cliente_id TEXT,
  processo_id TEXT,
  observacoes TEXT CHECK (observacoes IS NULL OR length(observacoes) <= 2000),
  criado_por TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  grupo_id TEXT,
  numero_no_grupo INTEGER CHECK (numero_no_grupo IS NULL OR numero_no_grupo BETWEEN 1 AND 60),
  CHECK (
    (status = 'pago' AND pago_em IS NOT NULL AND valor_pago_centavos IS NOT NULL)
    OR (status <> 'pago' AND pago_em IS NULL AND valor_pago_centavos IS NULL)
  ),
  -- Os dois campos do grupo andam juntos.
  CHECK ((grupo_id IS NULL) = (numero_no_grupo IS NULL)),
  FOREIGN KEY (cliente_id, tenant_id) REFERENCES clientes (id, tenant_id),
  FOREIGN KEY (processo_id, tenant_id) REFERENCES processos (id, tenant_id),
  FOREIGN KEY (criado_por, tenant_id) REFERENCES users (id, tenant_id),
  FOREIGN KEY (grupo_id, tenant_id) REFERENCES lancamentos_grupos (id, tenant_id)
);
INSERT INTO lancamentos_nova (id, tenant_id, tipo, descricao, descricao_busca, categoria, valor_centavos, vencimento, status, pago_em, valor_pago_centavos, cliente_id, processo_id, observacoes, criado_por, criado_em, atualizado_em)
  SELECT id, tenant_id, tipo, descricao, descricao_busca, categoria, valor_centavos, vencimento, status, pago_em, valor_pago_centavos, cliente_id, processo_id, observacoes, criado_por, criado_em, atualizado_em FROM lancamentos;
DROP TABLE lancamentos;
ALTER TABLE lancamentos_nova RENAME TO lancamentos;

CREATE UNIQUE INDEX lancamentos_id_tenant_unico ON lancamentos (id, tenant_id);
CREATE INDEX lancamentos_vencimento_idx ON lancamentos (tenant_id, tipo, status, vencimento);
CREATE INDEX lancamentos_pagamento_idx ON lancamentos (tenant_id, status, pago_em);
CREATE INDEX lancamentos_cliente_idx ON lancamentos (tenant_id, cliente_id);
CREATE INDEX lancamentos_processo_idx ON lancamentos (tenant_id, processo_id);
CREATE INDEX lancamentos_grupo_idx ON lancamentos (tenant_id, grupo_id, numero_no_grupo);
