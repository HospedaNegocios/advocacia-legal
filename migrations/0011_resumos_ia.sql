-- Fase 3, passo 2: resumo por IA das intimações (Workers AI) e cota diária de uso.
-- Toda tabela tem tenant_id NOT NULL e chaves estrangeiras compostas (id, tenant_id).

-- Um resumo por intimação. Gerar de novo substitui o rascunho ou o rejeitado; o aprovado só muda depois de rejeitado.
-- situacao: rascunho (gerado, ainda não revisado), aprovado (liberado para o portal do cliente, que ainda não existe), rejeitado.
CREATE TABLE intimacoes_resumos (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  intimacao_id TEXT NOT NULL,
  texto TEXT NOT NULL CHECK (length(texto) BETWEEN 1 AND 4000),
  -- Identificador do modelo que gerou o texto (ex.: @cf/meta/llama-3.3-70b-instruct-fp8-fast).
  modelo TEXT NOT NULL CHECK (length(modelo) BETWEEN 1 AND 200),
  situacao TEXT NOT NULL DEFAULT 'rascunho' CHECK (situacao IN ('rascunho', 'aprovado', 'rejeitado')),
  gerado_por TEXT NOT NULL,
  -- Quem aprovou ou rejeitou, e quando.
  decidido_por TEXT,
  decidido_em TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  CHECK ((decidido_por IS NULL) = (decidido_em IS NULL)),
  CHECK ((situacao = 'rascunho') = (decidido_por IS NULL)),
  FOREIGN KEY (intimacao_id, tenant_id) REFERENCES intimacoes (id, tenant_id),
  FOREIGN KEY (gerado_por, tenant_id) REFERENCES users (id, tenant_id),
  FOREIGN KEY (decidido_por, tenant_id) REFERENCES users (id, tenant_id)
);
CREATE UNIQUE INDEX intimacoes_resumos_id_tenant_unico ON intimacoes_resumos (id, tenant_id);
CREATE UNIQUE INDEX intimacoes_resumos_intimacao_unico ON intimacoes_resumos (tenant_id, intimacao_id);

-- Uso diário de IA por escritório (dia civil de America/Sao_Paulo, AAAA-MM-DD). Só uma contagem, sem texto.
CREATE TABLE ia_uso_diario (
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  dia TEXT NOT NULL CHECK (dia GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  usado INTEGER NOT NULL DEFAULT 0 CHECK (usado >= 0),
  PRIMARY KEY (tenant_id, dia)
);
