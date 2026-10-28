-- Exclusão de usuário da equipe.
-- Quem já entrou no sistema não é apagado do banco: processos, prazos, lançamentos e o log
-- continuam apontando para o registro. Ele fica desativado, some da equipe, perde e-mail,
-- senha e 2FA (o e-mail vira um endereço interno para liberar um novo convite) e não ocupa vaga.
ALTER TABLE users ADD COLUMN excluido_em TEXT;
