# Financeiro (Fase 5)

Complementa a Fase 2, passo 2b (ver CLAUDE.md). Código: `src/server/rotas/financeiro.ts`, `src/comum/parcelas.ts`, `src/comum/extenso.ts`, migração `0014_financeiro_grupos.sql`.

## Parcelamento e recorrência (mesmo mecanismo de grupo)
- Ao criar um lançamento: `parcelas: N` (parcelamento) **ou** `repetir_meses: N` (recorrência); os dois juntos dão 400. N de **2 a 60** (limite prático, sem regra de negócio externa).
- Tabela `lancamentos_grupos` (tenant_id, chave composta com `lancamentos`). Cada parcela/ocorrência é um lançamento independente (`grupo_id`, `numero_no_grupo`), criado de uma vez (lote único: tudo ou nada), em aberto. Sem job automático e sem geração infinita.
- **Parcelamento:** o valor informado é o TOTAL. Dividido em centavos inteiros: todas as parcelas valem `floor(total/N)` e a **última** recebe a diferença (0 a N-1 centavos). A soma é sempre exata. Total precisa ter ao menos 1 centavo por parcela.
- **Recorrência:** o valor informado é o de CADA ocorrência.
- **Vencimentos:** o primeiro é a data informada; os seguintes mantêm o dia do mês da data ORIGINAL. Mês sem esse dia usa o último dia (31/01 → 28/02 ou 29/02 → 31/03 → 30/04).
- **Descrição:** "Descrição (3/12)". Por isso, com grupo, a descrição-base tem no máximo 192 caracteres.
- Editar, pagar, cancelar ou reabrir uma parcela não mexe nas outras. Cliente/processo desativado: 409 e nada é gravado.
- **"Cancelar parcelas em aberto"** (`POST /api/financeiro/grupos/:id/cancelar-abertas`, exige edição): cancela só as abertas do grupo; pagas e já canceladas ficam; 409 se não há abertas. Cada uma pode ser reaberta depois. `GET /api/financeiro/grupos/:id` lista o grupo.
- Auditoria: `lancamento_grupo_criado` e `lancamento_grupo_cancelado` (só ids, tipo e quantidade).

## Recibo
`GET /api/financeiro/:id/recibo` (permissão de leitura): só receita PAGA (409 nos demais). Tela `/financeiro/:id/recibo` para imprimir/salvar em PDF pelo navegador (CSS de impressão em `financeiro.css`, sem biblioteca). Texto: "Recebi de ... a quantia de ... (por extenso) ..., referente a ...", data do pagamento e linha de assinatura; marca advocacia.legal; dados do escritório de `escritorio_perfil`. Valor é o **valor efetivamente pago**. Sem cliente, o nome do pagador fica em branco para preencher à mão. Valor por extenso em `src/comum/extenso.ts` (testado). Auditoria `recibo_gerado` só com ids. Código "Referência" = 8 primeiros caracteres do id (não é numeração oficial).

## Cliente e processo
Aba "Financeiro" no detalhe de cliente e de processo (só com permissão financeiro leitura ou edição): totais (a receber em aberto/vencido, recebido, a pagar, pago; cancelado não conta) via `GET /api/financeiro/totais?cliente_id|processo_id`, lista paginada e "Nova receita/despesa" já ligada ao cliente/processo (só com edição e registro ativo).

## Tela Financeiro
Filtros por cliente e por processo (inclui desativados) em Contas a receber/pagar e Caixa. Caixa: **saldo corrido** linha a linha (`com_saldo=1`): soma de recebido − pago de TODAS as movimentações pagas do escritório até a linha, ordenadas por data do pagamento, criação e id. É global; com filtro de cliente/processo a coluna some e os indicadores seguem do escritório inteiro (avisado na tela).

## Pendências / fora do escopo
- Juros, multa, correção, conciliação bancária e alerta de contas vencidas: não feitos.
- Limite 2–60 e "diferença na última parcela" são escolhas conservadoras a confirmar com o usuário.
- Editar o grupo inteiro de uma vez, reabrir o grupo todo e apagar o grupo: não existem (só por parcela).
- Recibo: nenhuma cláusula jurídica; numeração oficial de recibos, recibo de despesa e envio por e-mail não existem. Revisão do texto por advogado recomendada.
- KPIs do caixa não respeitam o filtro por cliente/processo.
