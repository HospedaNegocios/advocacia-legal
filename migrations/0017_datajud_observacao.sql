-- Detalhe técnico curto da última tentativa com erro ou bloqueio (sem dado pessoal, sem chave). Fica vazio quando a consulta dá certo.
ALTER TABLE datajud_consultas ADD COLUMN observacao TEXT;
