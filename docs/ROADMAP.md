# Roadmap — advocacia.legal

Cada fase termina com testes passando, deploy em dev e revisão (Opus). Desenvolvimento por Sonnet.

## Fase 0 — Fundação
- Estrutura do repositório (TypeScript, Hono, React, Vitest, Wrangler)
- `wrangler` com ambientes `dev` e `prod` ligados aos D1/R2 do CLAUDE.md
- Migrações D1: `tenants`, `users`, `sessions`, `audit_log`
- Camada de acesso a dados com `tenant_id` obrigatório + testes de isolamento
- Login, sessão, 2FA, perfis; painel do dono (criar/ativar/suspender escritório)
- GitHub Actions: testes em todo PR; deploy `develop` → dev, `main` → prod

## Fase 1 — Núcleo do escritório
- Configuração do escritório (dados e OABs)
- Clientes (PF/PJ), processos, prazos (Kanban), agenda

## Fase 2 — Alertas e financeiro
- Cron 07:00 (America/Sao_Paulo) com e-mail de prazos; popup na tela
- Financeiro: honorários, lançamentos, contas a receber, caixa

## Fase 3 — Portal e DJEN
- Teste da API DJEN a partir do Worker (ver docs/DJEN.md)
- Captura diária por OAB, vinculação por número CNJ
- Resumo por IA com aprovação — **feito** (branch `fase3-ia`, ver docs/IA.md)
- Portal do cliente (marca advocacia.legal) — **feito, com regras provisórias** (branch `fase3-portal`, ver docs/PORTAL.md): acesso por convite, sessão própria, processos, andamentos, resumos aprovados e documentos só depois de publicados pelo escritório. Falta confirmar as regras provisórias (2FA do cliente, consentimento, envio por e-mail)

## Fase 4 — Site de vendas e LGPD
- `advocacia.legal`: planos, WhatsApp, e-mail comercial, sem formulário
- Termos de Uso, Política de Privacidade, exportação e exclusão de dados (90 dias)

