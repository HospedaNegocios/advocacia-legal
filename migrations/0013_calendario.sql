-- Fase 5, passo 1: calendário do escritório (dias sem expediente) para a contagem de prazos em dias úteis.
-- Os feriados nacionais por lei ficam no código (src/comum/prazos-uteis.ts); aqui ficam só os dias que o
-- ESCRITÓRIO cadastra (feriado local, suspensão de tribunal, outro). Nada é preenchido por padrão.
-- tenant_id obrigatório; chave estrangeira composta garante que o autor é do mesmo escritório.

CREATE TABLE calendario_dias (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  -- Dia civil, AAAA-MM-DD (sem fuso).
  data TEXT NOT NULL CHECK (data GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  descricao TEXT NOT NULL CHECK (length(descricao) BETWEEN 1 AND 200),
  tipo TEXT NOT NULL CHECK (tipo IN ('feriado_local', 'suspensao_tribunal', 'outro')),
  criado_por TEXT,
  criado_em TEXT NOT NULL,
  FOREIGN KEY (criado_por, tenant_id) REFERENCES users (id, tenant_id)
);
CREATE UNIQUE INDEX calendario_dias_id_tenant_unico ON calendario_dias (id, tenant_id);
-- Um registro por data em cada escritório.
CREATE UNIQUE INDEX calendario_dias_data_unico ON calendario_dias (tenant_id, data);
