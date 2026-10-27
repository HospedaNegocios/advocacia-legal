-- Fase 2, passo 2b: financeiro (honorários, lançamentos, contas a receber e a pagar, caixa).
-- Um único tipo de registro: o lançamento. "Honorário" é uma receita ligada a cliente/processo (a categoria é texto livre).
-- Valores sempre em centavos (inteiro). Datas civis AAAA-MM-DD (sem fuso: o "hoje" é calculado em America/Sao_Paulo pela aplicação).
-- tenant_id NOT NULL e chaves estrangeiras compostas (id, tenant_id): o banco recusa vínculo com dado de outro escritório.

CREATE TABLE lancamentos (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  tipo TEXT NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  descricao TEXT NOT NULL CHECK (length(descricao) BETWEEN 1 AND 200),
  -- Descrição em minúsculas e sem acentos, só para a busca (preenchida pela camada de dados).
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
  -- Pago: data e valor pagos obrigatórios. Aberto ou cancelado: nenhum dos dois.
  CHECK (
    (status = 'pago' AND pago_em IS NOT NULL AND valor_pago_centavos IS NOT NULL)
    OR (status <> 'pago' AND pago_em IS NULL AND valor_pago_centavos IS NULL)
  ),
  FOREIGN KEY (cliente_id, tenant_id) REFERENCES clientes (id, tenant_id),
  FOREIGN KEY (processo_id, tenant_id) REFERENCES processos (id, tenant_id),
  FOREIGN KEY (criado_por, tenant_id) REFERENCES users (id, tenant_id)
);
CREATE UNIQUE INDEX lancamentos_id_tenant_unico ON lancamentos (id, tenant_id);
CREATE INDEX lancamentos_vencimento_idx ON lancamentos (tenant_id, tipo, status, vencimento);
CREATE INDEX lancamentos_pagamento_idx ON lancamentos (tenant_id, status, pago_em);
CREATE INDEX lancamentos_cliente_idx ON lancamentos (tenant_id, cliente_id);
CREATE INDEX lancamentos_processo_idx ON lancamentos (tenant_id, processo_id);
