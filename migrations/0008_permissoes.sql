-- Fase 2, passo 2a: permissões por usuário, por módulo.
-- O sócio de cada escritório escolhe, usuário por usuário, o nível de acesso a um módulo:
-- leitura ou edição (edição inclui leitura). Ausência de linha = sem acesso (padrão para todos).
-- O sócio tem acesso total por regra de código e nunca recebe linha aqui.
-- Hoje só existe o módulo 'financeiro'. Para um novo módulo, a lista do CHECK de `modulo` é ampliada
-- numa migração futura (em SQLite isso recria a tabela); as colunas e as chaves continuam as mesmas.
-- tenant_id NOT NULL e chaves estrangeiras compostas (id, tenant_id), como nas demais tabelas.

CREATE TABLE permissoes_usuario (
  id TEXT PRIMARY KEY NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants (id),
  usuario_id TEXT NOT NULL,
  modulo TEXT NOT NULL CHECK (modulo IN ('financeiro')),
  nivel TEXT NOT NULL CHECK (nivel IN ('leitura', 'edicao')),
  -- Sócio que fez a última alteração.
  atualizado_por TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  FOREIGN KEY (usuario_id, tenant_id) REFERENCES users (id, tenant_id),
  FOREIGN KEY (atualizado_por, tenant_id) REFERENCES users (id, tenant_id)
);
CREATE UNIQUE INDEX permissoes_usuario_unica ON permissoes_usuario (tenant_id, usuario_id, modulo);
