-- Fase 5, passo 4: preferências pessoais de cada usuário (hoje só o e-mail diário de prazos).
-- Ausência de linha = tudo desligado (opt-in: o usuário liga na própria conta, em "Minha conta").
-- tenant_id NOT NULL e chave estrangeira composta (user_id, tenant_id), como nas demais tabelas.
-- Não guarda e-mail nem texto: só ids, o interruptor e a data da última mudança.

CREATE TABLE preferencias_usuario (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  user_id TEXT NOT NULL,
  alerta_email INTEGER NOT NULL DEFAULT 0 CHECK (alerta_email IN (0, 1)),
  atualizado_em TEXT NOT NULL,
  FOREIGN KEY (user_id, tenant_id) REFERENCES users (id, tenant_id)
);
CREATE UNIQUE INDEX preferencias_usuario_unica ON preferencias_usuario (tenant_id, user_id);
