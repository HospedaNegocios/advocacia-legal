# CLAUDE.md — advocacia.legal

Memória do projeto. Leia inteiro no início de cada sessão. Atualize a seção "Estado atual" ao fim de cada tarefa.

## O que é

SaaS jurídico por assinatura para escritórios de advocacia, cobrado por escritório.
- App: `app.advocacia.legal` (prod; dev em `dev.app.advocacia.legal`) (um único domínio para todos os escritórios, marca advocacia.legal)
- Site de vendas: `advocacia.legal`
- **Sem personalização visual por escritório:** o app e o portal do cliente usam somente a marca advocacia.legal. O escritório não envia nem usa a própria logo (decisão de 2026-10-27).
- Ativação de clientes **manual** pelo dono da plataforma. Sem Stripe/gateway nesta fase.
- Plano completo (funcionalidades, arquitetura, preços, LGPD): https://claude.ai/artifact/MqJrYDc7CxEH3SirgS8rey

## Regras de trabalho (obrigatórias)

1. **Não inventar nada.** Fato desconhecido (dado da empresa, regra de negócio, limite de serviço) → perguntar ao usuário ou verificar na documentação oficial. Nunca preencher com suposição.
2. **Modelos:** Opus só para planejamento, arquitetura, revisão de segurança e decisões. **Sonnet para todo o desenvolvimento** (subagentes com `model: sonnet`).
3. **Economia de tokens:** tarefas pequenas, um módulo por vez; este arquivo é a fonte de contexto, não reexplicar o projeto.
4. **O usuário não é desenvolvedor.** Explicar em português simples, sem jargão; Claude executa tudo de forma automática.
5. **Segredos nunca no código nem neste arquivo.** Tokens ficam em GitHub Secrets e Cloudflare Secrets. Aqui só nomes e datas.
6. Idioma do produto, código de interface e mensagens: português do Brasil.
7. **Toda tela, componente ou gráfico novo segue `docs/DESIGN.md` e a skill `ux-advocacia`** (componentes de `src/web/ui`, tokens de `src/web/estilo/tokens.css`, regras de gráficos, verificação em 375px e 1280px, claro e escuro).

## Decisões tomadas (2026-10-27)

| Tema | Decisão |
| --- | --- |
| Infraestrutura | Cloudflare. **Workers Paid (US$ 5/mês)** assinado pelo usuário |
| Multi-tenant | **Banco único D1**, coluna `tenant_id` em toda tabela de dados de escritório |
| Domínio por cliente | **Não.** Um domínio só, controle total da gestão de escritórios |
| Ambientes | dev e prod totalmente separados (Worker, D1, R2) |
| Endereço do dev | **`dev.app.advocacia.legal`** (Custom Domain do Worker; certificado gerado automaticamente, sem custo extra — verificado na doc da Cloudflare em 2026-10-27) |
| Dono da plataforma | Login: **guilherme@hospedanegocios.com.br** (criado pelo fluxo de primeiro acesso, sem senha no código) |
| Git | GitHub `HospedaNegocios/advocacia-legal`. `develop` → dev, `main` → prod |
| MVP | Acesso/equipe, config. do escritório (dados e OABs), clientes, processos, prazos, agenda, financeiro, portal do cliente, intimações DJEN, resumo por IA, painel do dono |
| Teste grátis | 14 dias, sem cartão de crédito |
| Alerta de prazos | E-mail diário às **07:00 (America/Sao_Paulo)** + **popup na tela** quando o usuário estiver com o sistema aberto |
| Site de vendas | Contato por WhatsApp **(12) 99219-8038** e e-mail **comercial@advocacia.legal**. **Sem formulário** |
| Retenção após cancelamento | **90 dias**, depois exclusão |
| Kanban de prazos | Colunas: **A fazer, Em andamento, Aguardando, Concluído** (aprovado em 2026-10-27) |
| Fases do processo | **Conhecimento, Recursal, Execução, Suspenso, Arquivado** (aprovado em 2026-10-27) |
| Anexos | Até **7 MB** por arquivo; PDF, imagens, Word e Excel (aprovado em 2026-10-27) |
| Agenda | Integração com **Google Agenda** em fase posterior; modelar eventos de forma compatível (data/hora com fuso, id externo opcional) |

## Planos (aprovados pelo usuário)

| Plano | R$/mês | Inclui |
| --- | --- | --- |
| Individual | 59,90 | 1 usuário, 1 OAB no DJEN, processos, prazos, agenda, financeiro |
| Equipe | 109,90 | Até 5 usuários, 3 OABs, portal do cliente, resumos por IA com cota diária |
| Sociedade | 159,90 | Usuários e OABs ilimitados, cota maior de IA |

Anual: paga 10, usa 12 (Individual R$ 599,00, Equipe R$ 1.099,00, Sociedade R$ 1.599,00). Nomes e preços trocados em 2026-10-27; o id interno continua `solo` / `escritorio` / `banca` (banco, código e testes). Cotas exatas de IA por plano: **a definir com o usuário** antes de implementar.

## Empresa (para Termos, Política de Privacidade e contrato)

- Razão social: Guilherme Rodrigues De Paula Informática
- CNPJ: 20.888.978/0001-49
- Endereço: **pendente**
- Encarregado (DPO): e-mail **dpo@advocacia.legal**; nome do encarregado **pendente**
- Papéis LGPD: escritório = controlador dos dados dos clientes dele; advocacia.legal = operadora

## Arquitetura

- **Worker `advocacia-legal`** (app + API) em `app.advocacia.legal`; **Worker do site** em `advocacia.legal`.
- Stack: TypeScript, Hono (API), React (interface), Vitest (testes), Wrangler (deploy).
- Tenant identificado pela **sessão do login**, nunca por parâmetro vindo do navegador.
- Cron Trigger diário: busca DJEN + alertas de prazo.
- Workers AI: resumo de intimações em linguagem simples, publicado no portal **só após aprovação do advogado**.
- E-mail: Cloudflare Email Service (Email Sending, incluído no Workers Paid: 3.000/mês).
- Painel do dono: área restrita no mesmo app para criar, ativar, suspender escritórios e definir plano.

## Recursos Cloudflare criados

| Recurso | dev | prod |
| --- | --- | --- |
| D1 | `advocacia-legal-dev` (`dc1609a4-a249-4548-a1ea-f934cb54eb48`) | `advocacia-legal-prod` (`2f2cac5f-5885-455e-b31d-61094f2c707e`) |
| R2 | `advocacia-legal-dev` | `advocacia-legal-prod` |
| Região | ENAM (mais próxima do Brasil disponível) | ENAM |

A conta Cloudflare é **compartilhada com outros projetos** do usuário (Workers `gophish`, `controle-financeiro`, `lgpd-pme`, `lgpdsoar-site`, `jurista`, `advocacia`, etc.). **Nunca alterar ou apagar recursos que não comecem com `advocacia-legal`.** Os Workers antigos `advocacia` e `jurista` não fazem parte deste projeto.

## Segurança (requisitos não negociáveis)

- Toda consulta ao D1 passa por uma camada de acesso única que injeta `tenant_id`. Proibido SQL direto fora dela.
- Testes automatizados de isolamento: usuário do escritório A tentando ler/alterar dados do B deve falhar.
- Senhas com hash lento (PBKDF2 via WebCrypto); 2FA TOTP; bloqueio após tentativas erradas.
- Cookie de sessão `HttpOnly; Secure; SameSite=Strict`; CSRF; CSP, HSTS.
- R2 privado; arquivos só por URL temporária assinada após checar permissão.
- Log de auditoria (quem, o quê, quando) para criação, alteração, exclusão e acesso a dados sensíveis.
- Rate limit nas rotas de login.

## DJEN (intimações)

Verificação de termos feita em 2026-10-27 — ver `docs/DJEN.md`. Resumo: API pública de consulta `https://comunicaapi.pje.jus.br/api/v1/comunicacao`, sem autenticação; **não foram encontrados termos de uso nem limite oficial publicados**. Integradores relatam bloqueio (HTTP 403) para IPs fora do Brasil → Teste feito em 2026-10-27 a partir do Worker de dev: **HTTP 200 em 4 de 4 chamadas, sem bloqueio** (ver `docs/DJEN.md`).

## Tokens e acessos

| Item | Onde fica | Quem cria | Status |
| --- | --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` (Workers, D1, R2, KV desta conta) | GitHub Secrets do repositório | Usuário, guiado por Claude | criado em 2026-10-27 (expira em 90 dias) |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Secrets | Usuário | salvo em 2026-10-27 |
| Claude GitHub App no repositório (permite push e Claude Code na nuvem) | GitHub da organização HospedaNegocios | Usuário (admin da org) | instalado em 2026-10-27 (informado pelo usuário) |
| `CHAVE_CRIPTO` (32 bytes em base64; cifra os segredos do 2FA e assina o desafio do 2FA) | Cloudflare Secrets por ambiente | Workflow `configurar-segredos` (gera e grava sem mostrar o valor) | existe no **dev**; **prod ainda não tem** (rodar `configurar-segredos` em prod antes do primeiro uso lá) |

**Atenção:** trocar ou apagar `CHAVE_CRIPTO` torna ilegíveis os segredos TOTP já cadastrados (todos os usuários com 2FA ficariam sem conseguir entrar e precisariam refazer o 2FA). Por isso o workflow nunca sobrescreve uma chave existente. Em testes, a chave vem de um valor fixo em `vitest.config.ts`.

Rotação do token Cloudflare: a cada 90 dias. Registrar aqui a data da última troca: 2026-10-27 (próxima até 2027-01-25)

## Estado atual

- [x] Plano do produto aprovado
- [x] D1 e R2 de dev e prod criados
- [x] CLAUDE.md e docs iniciais (enviados ao repositório em 2026-10-27)
- [x] Instalar Claude GitHub App no repositório (usuário)
- [x] Criar `CLOUDFLARE_API_TOKEN` e salvar nos GitHub Secrets (usuário, com guia)
- [x] Domínio `advocacia.legal` ativo na Cloudflare (usuário confirmou em 2026-10-27)
- [ ] Endereço da empresa e nome do encarregado (DPO) (usuário)
- [x] Fase 0, parte 1 (fundação) publicada no dev em 2026-10-27 (PR #1): projeto TS/Hono/React/Vitest/Wrangler, `wrangler.jsonc` com envs dev/prod, migrações D1 (`tenants`, `users`, `sessions`, `audit_log`), camada de dados com `tenant_id` obrigatório (`src/server/db/repositorio.ts`) + testes de isolamento, `GET /api/saude`, CI e deploy no GitHub Actions.
- [x] Fase 0, parte 2 (acesso) publicada no dev em 2026-10-27 (PR #2, revisão de segurança feita): migração `0002_acesso.sql` (tokens de uso único, limite de tentativas por IP, `exigir_2fa`, `senha_definida`, `totp_ultimo_passo`, `sessions.pendente_2fa`); senha PBKDF2-SHA256 (100.000 iterações, mínimo 10 caracteres); sessão em cookie `__Host-sessao` (12 h, só o hash no banco); 2FA TOTP (RFC 6238) com segredo cifrado AES-GCM; bloqueio de 15 min após 5 erros; limite de 20 erros por IP em 15 min; proteção CSRF (Origin + `X-Requested-With: advocacia`); log de auditoria; primeiro acesso do dono e convites por link de uso único; painel do dono (`/api/plataforma/*`); equipe do escritório (`/api/equipe/*`, só sócio); telas em React; workflows `criar-dono` e `configurar-segredos`.
- [x] Visual moderno (branch `visual-moderno`, publicado no dev): tokens claro/escuro, casca responsiva, biblioteca `src/web/ui`, gráficos em SVG, painel do dono como dashboard, `docs/DESIGN.md` e skill `ux-advocacia`. Cores da marca são proposta (trocar só em `tokens.css`).
- [ ] **Para usar em dev:** depois do deploy da `develop` (aplica a migração 0002), rodar no GitHub Actions `configurar-segredos` (dev) e depois `criar-dono` (dev, com o e-mail do dono) e abrir o link do resumo (ver README).
- [ ] Decisões pendentes do usuário: bloquear escritório com teste grátis vencido (`teste_ate` passou)? limites de usuários por plano (Individual 1, Equipe 5) devem ser impostos nos convites? envio de convite por e-mail (hoje o sócio copia o link)?
- [x] Fase 1, passo 1 (configuração do escritório e OABs) na branch `fase1-escritorio`, publicado no dev: migração `0003_escritorio.sql` (`escritorio_perfil` 1:1 e `oabs`), `/api/escritorio/*` (leitura para todos os perfis, escrita só sócio), limite de OABs ativas por plano (Individual 1, Equipe 3, Sociedade sem limite; 409 ao criar/reativar), tela "Escritório" com abas Dados e OABs; nome de exibição continua sendo definido pelo dono da plataforma.
- [x] Fase 1, passo 2 (Clientes) na branch `fase1-clientes`, publicado no dev: migração `0004_clientes.sql` (clientes, contatos, anexos genéricos, consentimentos LGPD), `/api/clientes/*` (PF/PJ com CPF/CNPJ validado, contatos, consentimentos, anexos no R2 até 7 MB com verificação dos bytes iniciais, download só por link assinado de 5 min com subchave da `CHAVE_CRIPTO`), telas Clientes e detalhe (Dados, Contatos, Documentos, LGPD). Cliente desativado fica somente leitura; não há exclusão de cliente.
- [x] Fase 1, passo 3 (Processos) na branch `fase1-processos`, publicado no dev: migração `0005_processos.sql` (`processos`, `processos_partes`, `processos_responsaveis`, `processos_andamentos`, todas com `tenant_id` e chaves estrangeiras compostas), `/api/processos/*` (lista com busca por número CNJ/nome de parte, filtros por fase, responsável e cliente, resumo, partes, responsáveis, andamentos, anexos com as mesmas regras de Clientes) e `GET /api/clientes/:id/processos`; número CNJ obrigatório, 20 dígitos, dígito verificador módulo 97 (Res. CNJ 65/2008), único por escritório; fases Conhecimento, Recursal, Execução, Suspenso, Arquivado; andamento não é editado, só o sócio apaga (auditado); processo desativado fica somente leitura (inclusive apagar anexo/andamento); telas Processos (lista, KPIs, gráfico por fase, formulário com máscara) e detalhe (Dados, Partes, Responsáveis, Andamentos, Documentos), aba "Processos" no cliente; abas quebram de linha no celular. Código de anexos e rotas compartilhado em `src/server/rotas/comum.ts`.
- [x] Fase 1, passo 4 (Prazos, Agenda e Início) na branch `fase1-prazos-agenda`, publicado no dev: migração `0006_prazos_agenda.sql` (`prazos`, `eventos_agenda`, `eventos_participantes`, chaves compostas por escritório), `/api/prazos/*` (Kanban A fazer/Em andamento/Aguardando/Concluído, qualquer status para qualquer outro; só o sócio apaga, com auditoria), `/api/agenda/*` (consulta de no máximo 62 dias; início/fim guardados em UTC + fuso IANA de lista fixa do Brasil; quem cria ou o sócio edita/apaga), `GET /api/inicio`, `GET /api/processos/:id/prazos|eventos`. "Hoje" e "vencido" são calculados em America/Sao_Paulo (`src/comum/fuso.ts`, só Intl). Telas Início (primeira tela), Prazos (quadro com arrastar + seletor "mover para", abas no celular, lista, filtros) e Agenda (Dia/Semana/Mês), abas Prazos e Agenda no processo. Sem dias úteis/feriados forenses e sem alerta por e-mail/popup (Fase 2; índices já prontos).
- [x] Fase 2, passo 1 (Alertas de prazo) na branch `fase2-alertas`, ainda não publicada: migração `0007_alertas.sql` (`alertas_enviados`, chave única escritório + usuário + dia); `GET /api/alertas/prazos` (prazos não concluídos do próprio usuário vencidos/hoje/amanhã, dia de São Paulo); popup acessível na casca (consulta ao abrir, a cada 15 min e ao voltar o foco; dispensa guardada no navegador por usuário e dia, reaparece só se prazo novo/alterado) e selo com a contagem no item "Prazos" do menu; Cron `0 10 * * *` UTC (= 07:00 São Paulo, UTC-3 sem horário de verão) com handler `scheduled` (um e-mail por usuário com prazos vencidos/hoje/próximos 3 dias; escritório suspenso/cancelado e usuário inativo ou sem senha ficam de fora; falha de um envio não derruba os outros). Envio por trás de `EnviadorEmail` (`src/server/email.ts`) com o binding `send_email` do Cloudflare Email Service. **E-mail DESLIGADO** (`EMAIL_ALERTAS_ATIVO=false`) até o usuário cadastrar o domínio no Email Sending e confirmar o remetente (sugestão `alertas@advocacia.legal`): ver `docs/EMAIL.md`. Pendências: remetente, cota mensal de e-mails no plano, opção de o usuário desligar o e-mail.
- [x] Fase 2, passo 2a (Permissões por usuário no financeiro) na branch `fase2-permissoes`, ainda não publicada: decisão do usuário: o sócio escolhe, usuário por usuário, **sem acesso / leitura / edição** (edição inclui leitura); padrão sem acesso; sócio sempre tem acesso total e não pode ser alterado (409). Migração `0008_permissoes.sql` (`permissoes_usuario`: escritório + usuário + módulo único, chaves compostas; ausência de linha = sem acesso; módulo novo = ampliar o CHECK numa migração futura); camada de dados `repo.permissoes.*` (só usuário ativo do mesmo escritório); middleware `exigirPermissao(modulo, "leitura"|"edicao")` em `src/server/sessao.ts` (vai depois de `exigirSessao`; consulta o banco a cada requisição, então a mudança vale na hora; **ainda não aplicado a nenhuma rota, não existe rota de financeiro**); `GET /api/equipe/permissoes` e `PUT /api/equipe/:usuarioId/permissoes/financeiro` (só sócio, auditoria `permissao_alterada` com de/para); `GET /api/eu` devolve `permissoes.financeiro`; aba "Acesso ao financeiro" na tela Equipe. Item "Financeiro" do menu ainda "Em breve".
- [x] Fase 2, passo 2b (Financeiro) na branch `fase2-financeiro`, ainda não publicada: migração `0009_financeiro.sql` (tabela `lancamentos`: receita/despesa, valor em centavos inteiros, vencimento, situação aberto/pago/cancelado, data e valor pagos, cliente e processo opcionais com chave composta por escritório; "honorário" é uma receita com categoria de texto livre); `/api/financeiro/*` (leitura exige permissão `financeiro` leitura; criar, editar, pagar, estornar, cancelar e reabrir exigem edição; apagar só sócio, definitivo, com auditoria; lista com filtros/paginação, `/resumo` com série dos últimos 6 meses, `/categorias`); "vencido" calculado no dia de São Paulo; pago ou cancelado fica somente leitura (estornar/reabrir antes); pagamento não pode ser futuro; cliente/processo desativado dá 409 em lançamento novo; auditoria só com ids, tipo e situação de/para (sem descrição nem valores); teto técnico de R$ 999.999.999,99 por lançamento. Tela Financeiro (menu só com permissão) com abas Visão geral (KPIs + gráfico `BarrasAgrupadas` recebido × pago), Contas a receber, Contas a pagar e Caixa. **Ficou de fora:** parcelamento automático, recorrência, juros/multa, conciliação bancária, recibos em PDF, lançamentos nas telas de cliente e processo, saldo corrido linha a linha no caixa, filtro por cliente/processo na tela (a API já filtra), alerta de contas vencidas, lista fixa de categorias. Decisões conservadoras: tipo não muda na edição; `/reabrir` (cancelado → aberto) além de `/estornar`; valor pago sempre gravado (padrão = valor).
- [ ] **Fase 2 em andamento: alertas e financeiro prontos; próximo: ver docs/ROADMAP.md** (ver `docs/ROADMAP.md`)
