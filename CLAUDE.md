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

## Planos (aprovados pelo usuário)

| Plano | R$/mês | Inclui |
| --- | --- | --- |
| Solo | 49,90 | 1 usuário, 1 OAB no DJEN, processos, prazos, agenda, financeiro |
| Escritório | 99,90 | Até 5 usuários, 3 OABs, portal do cliente, resumos por IA com cota diária |
| Banca | 149,90 | Usuários e OABs ilimitados, cota maior de IA |

Anual: paga 10, usa 12. Cotas exatas de IA por plano: **a definir com o usuário** antes de implementar.

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

Verificação de termos feita em 2026-10-27 — ver `docs/DJEN.md`. Resumo: API pública de consulta `https://comunicaapi.pje.jus.br/api/v1/comunicacao`, sem autenticação; **não foram encontrados termos de uso nem limite oficial publicados**. Integradores relatam bloqueio (HTTP 403) para IPs fora do Brasil → **primeira tarefa técnica do módulo DJEN é testar a chamada a partir de um Worker em dev.**

## Tokens e acessos

| Item | Onde fica | Quem cria | Status |
| --- | --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` (Workers, D1, R2, KV desta conta) | GitHub Secrets do repositório | Usuário, guiado por Claude | criado em 2026-10-27 (expira em 90 dias) |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub Secrets | Usuário | salvo em 2026-10-27 |
| Claude GitHub App no repositório (permite push e Claude Code na nuvem) | GitHub da organização HospedaNegocios | Usuário (admin da org) | instalado em 2026-10-27 (informado pelo usuário) |
| `CHAVE_CRIPTO` (32 bytes em base64; cifra os segredos do 2FA e assina o desafio do 2FA) | Cloudflare Secrets por ambiente | Workflow `configurar-segredos` (gera e grava sem mostrar o valor) | pendente de execução (dev e prod) |

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
- [ ] **Para usar em dev:** depois do deploy da `develop` (aplica a migração 0002), rodar no GitHub Actions `configurar-segredos` (dev) e depois `criar-dono` (dev, com o e-mail do dono) e abrir o link do resumo (ver README).
- [ ] Decisões pendentes do usuário: bloquear escritório com teste grátis vencido (`teste_ate` passou)? limites de usuários por plano (Solo 1, Escritório 5) devem ser impostos nos convites? envio de convite por e-mail (hoje o sócio copia o link)?
- [ ] **Próximo passo: Fase 1 — núcleo do escritório** (ver `docs/ROADMAP.md`)
