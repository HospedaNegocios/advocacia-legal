# Portal do cliente (Fase 3, passo 3)

Estado: implementado na branch `fase3-portal` (migração `0012_portal.sql`). **As regras abaixo são decisões PROVISÓRIAS do planejamento; o usuário ainda precisa confirmá-las.**

## Princípio
O cliente só vê o que o escritório **publicou de forma explícita**. Todo marcador novo nasce em zero (nada visível). Marca somente advocacia.legal (sem logo do escritório; o nome do escritório aparece apenas como texto no topo). Aviso fixo em todas as telas do portal: "As informações são um resumo. Em caso de dúvida, fale com seu advogado."

## Endereços
- Tela: `/portal` (lista), `/portal/entrar`, `/portal/convite#TOKEN`, `/portal/processos/:id` (mesmo domínio do app; o React escolhe a tela pelo caminho).
- API do cliente: `/api/portal/*` (cookie `__Host-portal`). API do escritório para gerir o portal: `/api/portal-gestao/*` (cookie normal do escritório).

## Acesso do cliente
- Tabelas `portal_usuarios` (uma conta por e-mail em cada escritório, ligada a UM cliente por chave composta), `portal_convites` (só o hash do token), `portal_sessoes`.
- Quem convida: **sócio e advogado**, na aba "Portal" do cliente. Gera um link de uso único (7 dias, mesma validade dos convites da equipe) que o escritório envia ao cliente (hoje não há envio de e-mail). O cliente cria a própria senha (PBKDF2, mínimo 10 caracteres, igual ao app). Gerar novo link para quem já tem senha serve como "esqueci a senha".
- Só cliente **ativo** e com **consentimento LGPD em vigor** pode ser convidado e entrar. A regra é conferida a cada requisição: desativar o cliente, desativar o acesso, revogar todos os consentimentos ou suspender/cancelar o escritório derruba a sessão na hora.
- Bloqueio de 15 minutos após 5 senhas erradas na conta e limite de 20 erros por IP em 15 minutos (escopos `portal-login` e `portal-acesso`, separados dos do app).
- Sessão: 8 horas; cookie `__Host-portal` (`HttpOnly; Secure; SameSite=Strict`), só o hash fica no banco. **Totalmente separada** da sessão do escritório: um cookie não abre as rotas do outro (testado nos dois sentidos). Escritório e cliente vêm SEMPRE da sessão do portal; nenhuma rota aceita `tenant_id` nem `cliente_id`.
- Mesmo e-mail em dois escritórios: depois de conferir a senha, o cliente escolhe o escritório (igual ao login do app).

## O que o cliente vê (somente leitura)
| Item | Regra de visibilidade |
| --- | --- |
| Processo | `processos.visivel_portal = 1`, processo **ativo** e o cliente é parte (`processos_partes.cliente_id`). Mostra só número CNJ, fase, tribunal e órgão |
| Andamento | `processos_andamentos.visivel_portal = 1` e processo visível. Mostra data e descrição (até os 100 mais recentes) |
| Resumo de intimação | Resumo **aprovado** e publicado (`portal_resumos_publicados`), intimação vinculada a processo visível do cliente. **Nunca** o texto integral da intimação. Rejeitar o resumo apaga a publicação na mesma transação; aprovar de novo não republica sozinho |
| Documento | `anexos.compartilhado_cliente = 1` e (do cadastro do próprio cliente, ou de processo visível dele). Download por link assinado de 5 minutos, preso ao cliente da sessão (escopo `portal:<cliente>`), conferido de novo no download (retirar vale na hora) |

Quem marca (sócio e advogado): "Publicar no portal do cliente" no processo, "Mostrar ao cliente" em cada andamento, "Compartilhar com o cliente" em cada documento (processo e cliente) e "Publicar no portal do cliente" no resumo aprovado. Retirar é sempre permitido; publicar exige registro ativo (processo/cliente desativado dá 409). Estagiário e secretaria não veem nem usam esses controles.

## Auditoria (só ids, sem e-mail, texto ou nomes)
`portal_convite_criado`, `portal_acesso_ativado`, `portal_acesso_desativado|reativado`, `portal_login_sucesso|falha`, `portal_logout`, `portal_processo_publicado|retirado`, `portal_andamento_publicado|retirado`, `portal_documento_compartilhado|retirado`, `portal_resumo_publicado|retirado`, `portal_documento_baixado`. As ações do cliente gravam `user_id` nulo (o cliente não é um usuário do escritório) e `entidade_id` = id do acesso.

## Segurança
CSRF (Origin + `X-Requested-With`), CSP/HSTS e `Cache-Control: no-store` valem para o portal (middleware global de `/api/*`). R2 continua privado. SQL só em `src/server/db/portal.ts` (a regra do teste `sql-so-na-camada` vale). Testes em `test/portal.test.ts`: visibilidade padrão = nada, retirar esconde, resumo não aprovado não publica, isolamento entre escritórios e entre clientes do mesmo escritório, sessões separadas, auditoria sem dados pessoais.

## PENDÊNCIAS (decidir com o usuário)
1. **Consentimento LGPD**: o modelo existente (`consentimentos_lgpd`) só tem texto livre de finalidade, **sem tipo**. Regra provisória: basta existir um consentimento não revogado. Definir se deve haver um tipo/finalidade própria para o portal (a regra está numa só função, `CONSENTIMENTO_ATIVO` em `src/server/db/portal.ts`, e na checagem de `temConsentimentoAtivo`).
2. **2FA do cliente**: não existe nesta etapa (só senha, bloqueio por tentativas e limite por IP). Decidir se será exigido ou opcional.
3. **Envio do convite por e-mail**: hoje o escritório copia o link e envia (WhatsApp, etc.). O Email Service ainda está desligado (docs/EMAIL.md). Também não existe "esqueci a senha" automático: o escritório gera novo link.
4. **Textos jurídicos**: Termos de Uso e Política de Privacidade do portal (Fase 4) e o texto do aviso do portal; o aviso atual é o fornecido no planejamento.
5. **Várias pessoas por cliente** (ex.: sócios de uma empresa): é possível convidar mais de um e-mail por cliente; um mesmo e-mail não pode ser de dois clientes do mesmo escritório. Confirmar se serve.
6. **Limites por plano**: o portal está liberado para todos os planos no código; o plano Individual não o inclui na tabela de preços (CLAUDE.md lista portal só em Equipe). Decidir se bloqueia no Individual.
7. **Intimação cancelada no DJEN** (`cancelada_em`): o resumo publicado continua visível; decidir se deve sumir.
8. **O que o cliente vê além disso** (prazos, agenda, financeiro): nada, por decisão provisória. Notificação de novidade ao cliente (e-mail/WhatsApp) não existe.
9. **Duração da sessão** (8 h) e **validade do convite** (7 dias) são constantes provisórias (`DURACAO_SESSAO_PORTAL_MS`, `VALIDADE_CONVITE_MS`).
10. **Limite de itens**: o cliente vê no máximo 100 andamentos e 100 resumos por processo, 200 processos e 200 documentos (sem paginação ainda).
11. Nome do escritório aparece como texto no topo do portal; confirmar se é aceitável sem personalização visual.
12. Retenção: exclusão das contas do portal faz parte da exclusão de dados em 90 dias (Fase 4, ainda não feita).
