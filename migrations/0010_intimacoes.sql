-- Fase 3, passo 1: intimações do DJEN.
-- Toda tabela tem tenant_id NOT NULL e chaves estrangeiras compostas (id, tenant_id).
-- Os campos vêm da API pública do DJEN (formato em docs/DJEN.md). Só `comunicacao_id` é obrigatório; o resto é opcional
-- porque o formato oficial não foi publicado pelo CNJ.

-- Permite a chave composta (oab_id, tenant_id) em tabelas novas.
CREATE UNIQUE INDEX oabs_id_tenant_unico ON oabs (id, tenant_id);

CREATE TABLE intimacoes (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  -- Primeira OAB do escritório que encontrou esta publicação. Todas as OABs que a encontraram ficam em intimacoes_oabs.
  oab_id TEXT NOT NULL,
  -- Campo `id` da comunicação no DJEN (guardado como texto). Se a API não trouxer `id`, usa-se o `hash`.
  comunicacao_id TEXT NOT NULL CHECK (length(comunicacao_id) BETWEEN 1 AND 200),
  hash TEXT,
  -- 20 dígitos (número CNJ sem máscara) quando o número tem 20 dígitos; senão, o texto original.
  numero_processo TEXT,
  tribunal TEXT,
  orgao TEXT,
  tipo TEXT,
  tipo_documento TEXT,
  classe TEXT,
  -- AAAA-MM-DD (data de disponibilização).
  data_disponibilizacao TEXT CHECK (data_disponibilizacao IS NULL OR data_disponibilizacao GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  -- Texto como publicado (limitado a 300.000 caracteres pela aplicação; cabe com folga no limite de linha do D1).
  texto TEXT NOT NULL DEFAULT '',
  link TEXT,
  -- Preenchida se a API informou data de cancelamento da comunicação.
  cancelada_em TEXT,
  processo_id TEXT,
  -- 'cnj' = número bateu com um processo do escritório; 'manual' = o usuário vinculou.
  vinculo TEXT CHECK (vinculo IS NULL OR vinculo IN ('cnj', 'manual')),
  lida_em TEXT,
  lida_por TEXT,
  criado_em TEXT NOT NULL,
  CHECK ((processo_id IS NULL) = (vinculo IS NULL)),
  CHECK ((lida_em IS NULL) = (lida_por IS NULL)),
  FOREIGN KEY (oab_id, tenant_id) REFERENCES oabs (id, tenant_id),
  FOREIGN KEY (processo_id, tenant_id) REFERENCES processos (id, tenant_id),
  FOREIGN KEY (lida_por, tenant_id) REFERENCES users (id, tenant_id)
);
CREATE UNIQUE INDEX intimacoes_id_tenant_unico ON intimacoes (id, tenant_id);
-- A mesma publicação nunca é guardada duas vezes no mesmo escritório (mesmo achada por duas OABs).
CREATE UNIQUE INDEX intimacoes_comunicacao_unica ON intimacoes (tenant_id, comunicacao_id);
CREATE INDEX intimacoes_lista_idx ON intimacoes (tenant_id, data_disponibilizacao DESC, id);
CREATE INDEX intimacoes_nao_lidas_idx ON intimacoes (tenant_id, lida_em, data_disponibilizacao);
CREATE INDEX intimacoes_processo_idx ON intimacoes (tenant_id, processo_id);
CREATE INDEX intimacoes_numero_idx ON intimacoes (tenant_id, numero_processo);

-- Quais OABs do escritório encontraram cada publicação (N para N).
CREATE TABLE intimacoes_oabs (
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  intimacao_id TEXT NOT NULL,
  oab_id TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  PRIMARY KEY (intimacao_id, oab_id),
  FOREIGN KEY (intimacao_id, tenant_id) REFERENCES intimacoes (id, tenant_id),
  FOREIGN KEY (oab_id, tenant_id) REFERENCES oabs (id, tenant_id)
);
CREATE INDEX intimacoes_oabs_oab_idx ON intimacoes_oabs (tenant_id, oab_id);

-- Execuções da busca (uma por OAB e por rodada). Auditoria operacional: nunca guarda texto de publicação.
CREATE TABLE djen_execucoes (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  oab_id TEXT NOT NULL,
  origem TEXT NOT NULL CHECK (origem IN ('cron', 'manual')),
  -- Intervalo de datas de disponibilização consultado (AAAA-MM-DD). data_fim = "hoje" de São Paulo na rodada.
  data_inicio TEXT NOT NULL,
  data_fim TEXT NOT NULL,
  iniciada_em TEXT NOT NULL,
  concluida_em TEXT,
  paginas INTEGER NOT NULL DEFAULT 0,
  itens_lidos INTEGER NOT NULL DEFAULT 0,
  itens_novos INTEGER NOT NULL DEFAULT 0,
  -- NULL enquanto a rodada não terminou.
  resultado TEXT CHECK (resultado IS NULL OR resultado IN ('sucesso', 'erro', 'bloqueado')),
  http_status INTEGER,
  -- Código curto (ex.: limite_paginas, formato_inesperado, tempo_esgotado). Nunca texto de publicação.
  observacao TEXT,
  FOREIGN KEY (oab_id, tenant_id) REFERENCES oabs (id, tenant_id)
);
CREATE INDEX djen_execucoes_oab_idx ON djen_execucoes (tenant_id, oab_id, resultado, concluida_em);
