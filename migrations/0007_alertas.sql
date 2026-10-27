-- Fase 2, passo 1: registro dos e-mails diários de alerta de prazos.
-- Uma linha por usuário por dia local (America/Sao_Paulo). A chave única impede envio duplicado
-- se o Cron Trigger rodar duas vezes no mesmo dia. Não guarda e-mail nem texto: só ids, a data e a contagem.
-- tenant_id NOT NULL e chave estrangeira composta (user_id, tenant_id), como nas demais tabelas.

CREATE TABLE alertas_enviados (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  user_id TEXT NOT NULL,
  -- Dia civil local do envio, AAAA-MM-DD.
  data_local TEXT NOT NULL CHECK (data_local GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  -- Quantos prazos entraram no resumo.
  qtd_prazos INTEGER NOT NULL CHECK (qtd_prazos >= 1),
  criado_em TEXT NOT NULL,
  FOREIGN KEY (user_id, tenant_id) REFERENCES users (id, tenant_id)
);
CREATE UNIQUE INDEX alertas_enviados_unico ON alertas_enviados (tenant_id, user_id, data_local);
CREATE INDEX alertas_enviados_data_idx ON alertas_enviados (tenant_id, data_local);
