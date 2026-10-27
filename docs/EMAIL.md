# E-mail (Cloudflare Email Service)

Verificado na documentação oficial da Cloudflare em 2026-10-27 (developers.cloudflare.com/email-service/). O serviço aparece como **Beta** na navegação da doc.

## O que a documentação diz
- **Binding**: no `wrangler.jsonc`, `"send_email": [{ "name": "EMAIL" }]` (aqui já configurado em `dev` e `prod`). No código, `env.EMAIL.send({ to, from, subject, text, html })`. `from` aceita `"a@b.com"` ou `{ email, name }`. Devolve `{ messageId }`; em erro lança `Error` com `code` (ex.: `E_SENDER_NOT_VERIFIED`, `E_RATE_LIMIT_EXCEEDED`, `E_DAILY_LIMIT_EXCEEDED`, `E_RECIPIENT_NOT_ALLOWED`).
- **Binding sem restrição** (só `name`): envia para qualquer destinatário. Há opções `destination_address`, `allowed_destination_addresses` e `allowed_sender_addresses` (uma restrição por entrada). A doc não diz o que acontece quando uma restrição é violada.
- **Remetente**: o domínio do `from` precisa estar **cadastrado ("onboarded") no Email Sending** da mesma conta. Exige **DNS da Cloudflare** no domínio.
- **Antes de cadastrar o domínio**, só dá para enviar para endereços de destino verificados. **Depois**, para qualquer destinatário.
- **Registros DNS** que a Cloudflare cria (no subdomínio `cf-bounce`): MX (bounces), SPF (TXT), DKIM (TXT) e DMARC (TXT em `_dmarc`). Propagação: normalmente 5 a 15 minutos, no máximo 24 horas.
- **Limites**: 50 destinatários por e-mail; mensagem de até 5 MiB; assunto até 998 caracteres; cota diária começa baixa em contas novas e sobe conforme o uso (a página não dá números); há cota mensal (ver a página de preços). O CLAUDE.md registra 3.000 e-mails/mês incluídos no Workers Paid: **conferir na página de preços** antes de depender disso.
- Conformidade: a doc cita CAN-SPAM, GDPR e CASL e recomenda opção de cancelar o recebimento. Este e-mail é um aviso operacional do próprio sistema ao usuário; avaliar com o DPO se precisa de opção de desativar (ver "Pendências").

## Como está no código
- `src/server/email.ts`: interface `EnviadorEmail` + implementação `criarEnviadorCloudflare` (usa o binding). Testes usam um enviador falso.
- `src/server/alertas-email.ts`: monta e envia o resumo diário; chamado pelo `scheduled` de `src/server/index.ts`.
- **Cron**: `0 10 * * *` (UTC) = 07:00 em America/Sao_Paulo. O Brasil está em UTC-3 o ano todo (sem horário de verão desde 2019; há teste cobrindo isso).
- **Desligado por padrão**: variável `EMAIL_ALERTAS_ATIVO = "false"` no `wrangler.jsonc`. Desligado, o cron só registra no log que parou. Nada é enviado.
- Variáveis (sem segredos): `URL_APP` (dev `https://dev.app.advocacia.legal`, prod `https://app.advocacia.legal`) e `EMAIL_REMETENTE` (**`alertas@advocacia.legal` é só uma sugestão a confirmar**).
- Um e-mail por usuário por dia, só se houver prazo não concluído vencido, de hoje ou dos próximos 3 dias em que ele é o responsável. Registro em `alertas_enviados` (chave única escritório + usuário + dia) evita duplicidade. Se o envio falha, a reserva é desfeita e uma nova execução do mesmo dia tenta de novo. Escritório suspenso/cancelado e usuário inativo (ou que ainda não definiu a senha) não recebem.
- Falhas vão para o log (só o código do erro) e para a auditoria (`alerta_email_falha`), sem e-mail nem texto de prazo.

## O que VOCÊ precisa fazer (passo a passo)
1. Entre no painel da Cloudflare, na conta do projeto.
2. Vá em **Compute > Email Service > Email Sending** e clique em **Onboard Domain**.
3. Escolha o domínio **advocacia.legal** (ele já usa o DNS da Cloudflare). Pode conferir os registros que serão criados e clique em **Done**.
4. Espere alguns minutos (até 24 h) pela propagação.
5. Decida o endereço remetente (sugestão: `alertas@advocacia.legal`) e me avise para eu ajustar `EMAIL_REMETENTE` se for outro.
6. Para testar com segurança: em **dev**, troque `EMAIL_ALERTAS_ATIVO` para `"true"` no `wrangler.jsonc` e faça o deploy do dev. O cron roda sozinho às 07:00 do dia seguinte (peça-me se quiser um disparo manual para teste). Só depois repita em **prod**.
7. Se a conta tiver limite diário baixo no início, é normal: ele sobe com o uso.

## Pendências (precisam de decisão sua)
- Confirmar o remetente (`alertas@advocacia.legal`?).
- Confirmar na página de preços a cota mensal de envio do seu plano.
- Dar ao usuário uma forma de desligar o e-mail diário? (hoje não há; o popup continua funcionando).
