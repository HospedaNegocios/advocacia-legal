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
| Segredos da aplicação (chave de sessão etc.) | Cloudflare Secrets por ambiente | Claude | pendente |

Rotação do token Cloudflare: a cada 90 dias. Registrar aqui a data da última troca: 2026-10-27 (próxima até 2027-01-25)

## Estado atual

- [x] Plano do produto aprovado
- [x] D1 e R2 de dev e prod criados
- [x] CLAUDE.md e docs iniciais (enviados ao repositório em 2026-10-27)
- [x] Instalar Claude GitHub App no repositório (usuário)
- [x] Criar `CLOUDFLARE_API_TOKEN` e salvar nos GitHub Secrets (usuário, com guia)
- [x] Domínio `advocacia.legal` ativo na Cloudflare (usuário confirmou em 2026-10-27)
- [ ] Endereço da empresa e nome do encarregado (DPO) (usuário)
- [ ] **Próximo passo: Fase 0 (fundação)** — ver `docs/ROADMAP.md`

