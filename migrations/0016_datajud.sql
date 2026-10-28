-- Consulta de movimentações na API Pública do DataJud (CNJ). Ver docs/DATAJUD.md.
-- Recurso ligado só em dev (os termos de uso do CNJ proíbem uso comercial). As tabelas existem em todos os ambientes.
-- Os movimentos do DataJud ficam separados dos andamentos manuais e NUNCA vão para o portal do cliente.
-- Toda tabela tem tenant_id NOT NULL e chaves estrangeiras compostas (id, tenant_id).

-- Uma linha por processo: a situação da última consulta e alguns dados do tribunal.
CREATE TABLE datajud_consultas (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  processo_id TEXT NOT NULL,
  consultado_em TEXT NOT NULL,
  resultado TEXT NOT NULL CHECK (resultado IN ('ok', 'nao_encontrado', 'sem_tribunal', 'erro', 'bloqueado')),
  status_http INTEGER,
  -- Apelido do tribunal na API (ex.: tjsp, trf3, tre-ac). Nulo quando o tribunal não é coberto.
  alias TEXT,
  -- dataHoraUltimaAtualizacao informada pela fonte (texto como veio, normalizado para AAAA-MM-DDTHH:MM:SS quando possível).
  ultima_atualizacao_fonte TEXT,
  classe TEXT,
  orgao TEXT,
  grau TEXT,
  total_movimentos INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  FOREIGN KEY (processo_id, tenant_id) REFERENCES processos (id, tenant_id)
);
CREATE UNIQUE INDEX datajud_consultas_processo_unico ON datajud_consultas (tenant_id, processo_id);
CREATE INDEX datajud_consultas_antiga_idx ON datajud_consultas (consultado_em);

-- Movimentos do processo, de todos os graus/sistemas. `chave` = hash estável de grau+código+data/hora+nome+órgão (não duplica).
CREATE TABLE datajud_movimentos (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  processo_id TEXT NOT NULL,
  chave TEXT NOT NULL CHECK (length(chave) BETWEEN 8 AND 100),
  data_hora TEXT,
  codigo TEXT,
  nome TEXT,
  complementos TEXT,
  orgao TEXT,
  grau TEXT,
  criado_em TEXT NOT NULL,
  FOREIGN KEY (processo_id, tenant_id) REFERENCES processos (id, tenant_id)
);
CREATE UNIQUE INDEX datajud_movimentos_chave_unica ON datajud_movimentos (tenant_id, processo_id, chave);
CREATE INDEX datajud_movimentos_lista_idx ON datajud_movimentos (tenant_id, processo_id, data_hora);
