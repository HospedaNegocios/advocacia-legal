-- Fase 1, passo 4: prazos (Kanban) e agenda.
-- Toda tabela tem tenant_id NOT NULL. As chaves estrangeiras compostas (id, tenant_id)
-- garantem NO BANCO que um registro nunca aponta para dado de outro escritório.
-- Sem cálculo de dias úteis nem feriados forenses (fase posterior). Alertas por e-mail e popup são da Fase 2:
-- os índices abaixo (status + data fatal; responsável + data fatal) já atendem a consulta diária dos alertas.

CREATE TABLE prazos (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  titulo TEXT NOT NULL CHECK (length(titulo) BETWEEN 1 AND 200),
  descricao TEXT CHECK (descricao IS NULL OR length(descricao) <= 2000),
  -- Data fatal: dia civil, AAAA-MM-DD (sem fuso).
  data_fatal TEXT NOT NULL CHECK (data_fatal GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  -- Hora opcional, HH:MM (horário de Brasília do escritório; sem fuso guardado).
  hora TEXT CHECK (hora IS NULL OR hora GLOB '[0-2][0-9]:[0-5][0-9]'),
  processo_id TEXT,
  responsavel_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'a_fazer' CHECK (status IN ('a_fazer', 'em_andamento', 'aguardando', 'concluido')),
  -- Instante (UTC, ISO 8601) em que foi concluído. Preenchido se e somente se o status é 'concluido'.
  concluido_em TEXT,
  criado_por TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  CHECK ((status = 'concluido') = (concluido_em IS NOT NULL)),
  FOREIGN KEY (processo_id, tenant_id) REFERENCES processos (id, tenant_id),
  FOREIGN KEY (responsavel_id, tenant_id) REFERENCES users (id, tenant_id),
  FOREIGN KEY (criado_por, tenant_id) REFERENCES users (id, tenant_id)
);
CREATE UNIQUE INDEX prazos_id_tenant_unico ON prazos (id, tenant_id);
CREATE INDEX prazos_status_data_idx ON prazos (tenant_id, status, data_fatal);
CREATE INDEX prazos_responsavel_data_idx ON prazos (tenant_id, responsavel_id, data_fatal);
CREATE INDEX prazos_processo_idx ON prazos (tenant_id, processo_id);

CREATE TABLE eventos_agenda (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  titulo TEXT NOT NULL CHECK (length(titulo) BETWEEN 1 AND 200),
  tipo TEXT NOT NULL CHECK (tipo IN ('audiencia', 'reuniao', 'diligencia', 'outro')),
  -- Instantes em ISO 8601 UTC ("AAAA-MM-DDTHH:MM:SS.sssZ"), normalizados pela aplicação; comparáveis como texto.
  inicio TEXT NOT NULL CHECK (inicio GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z'),
  fim TEXT NOT NULL CHECK (fim GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T*Z' AND fim >= inicio),
  -- Fuso IANA do evento (lista fixa validada pela aplicação, nunca texto livre).
  fuso TEXT NOT NULL DEFAULT 'America/Sao_Paulo' CHECK (length(fuso) BETWEEN 3 AND 40),
  dia_inteiro INTEGER NOT NULL DEFAULT 0 CHECK (dia_inteiro IN (0, 1)),
  local TEXT CHECK (local IS NULL OR length(local) <= 200),
  descricao TEXT CHECK (descricao IS NULL OR length(descricao) <= 2000),
  processo_id TEXT,
  cliente_id TEXT,
  -- Reservados para a futura integração com o Google Agenda (NULL por enquanto).
  id_externo TEXT,
  origem_externa TEXT,
  criado_por TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  FOREIGN KEY (processo_id, tenant_id) REFERENCES processos (id, tenant_id),
  FOREIGN KEY (cliente_id, tenant_id) REFERENCES clientes (id, tenant_id),
  FOREIGN KEY (criado_por, tenant_id) REFERENCES users (id, tenant_id)
);
CREATE UNIQUE INDEX eventos_agenda_id_tenant_unico ON eventos_agenda (id, tenant_id);
CREATE INDEX eventos_agenda_inicio_idx ON eventos_agenda (tenant_id, inicio);
CREATE INDEX eventos_agenda_processo_idx ON eventos_agenda (tenant_id, processo_id);
CREATE UNIQUE INDEX eventos_agenda_externo_unico ON eventos_agenda (tenant_id, origem_externa, id_externo) WHERE id_externo IS NOT NULL;

-- Participantes: usuários do mesmo escritório (N para N).
CREATE TABLE eventos_participantes (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  evento_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  FOREIGN KEY (evento_id, tenant_id) REFERENCES eventos_agenda (id, tenant_id),
  FOREIGN KEY (user_id, tenant_id) REFERENCES users (id, tenant_id)
);
CREATE UNIQUE INDEX eventos_participantes_unico ON eventos_participantes (tenant_id, evento_id, user_id);
CREATE INDEX eventos_participantes_user_idx ON eventos_participantes (tenant_id, user_id);
