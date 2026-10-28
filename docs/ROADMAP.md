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
- `advocacia.legal`: planos, WhatsApp, e-mail comercial, sem formulário — **feito, não publicado** (branch `fase4-site`, ver docs/SITE.md)
- Termos de Uso e Política de Privacidade — **minutas feitas**, aguardam revisão por advogado, endereço e DPO
- Exportação e exclusão de dados (90 dias) — a fazer

## Fase 5 — Prazos em dias úteis
- Cálculo da data final do prazo (dias úteis ou corridos, CPC arts. 219, 220, 224 e 231) com explicação passo a passo, feriados nacionais por lei e calendário do escritório (feriado local, suspensão de tribunal) — **feito, não publicado** (branch `fase5-dias-uteis`, ver docs/PRAZOS.md). Regras e fontes registradas; pendências de interpretação aguardam o advogado
- Fora desta fase: prazo em dobro, regras especiais (Juizados, trabalhista), consulta automática em 10 dias, calendário por comarca
- Assinatura (passo 2) — **feito, não publicado** (branch `fase5-limites`, ver docs/ASSINATURA.md): teste vencido vira somente leitura por 10 dias e depois bloqueio; limite de usuários por plano (Individual 1, Equipe 5, Sociedade ilimitado) com convites pendentes contando; exclusão de convite pendente; dono estende o teste no painel. Pendentes: vigência paga para escritório `ativo`, aviso ao cliente antes do vencimento, portal com escritório bloqueado
- Banner de dias restantes do teste e textos centralizados da assinatura — **feito, não publicado** (branch `fase5-banner`, ver docs/ASSINATURA.md e docs/TEXTOS-ASSINATURA.md). Resolve o "aviso antes do vencimento" no app; e-mail segue adiado
- Financeiro completo — **feito, não publicado** (branch `fase5-financeiro`, ver docs/FINANCEIRO.md): parcelamento, recorrência mensal, recibo imprimível, aba Financeiro em cliente/processo, filtros e saldo corrido no caixa. Fora: juros/multa, conciliação bancária, alerta de contas vencidas
- E-mail dos alertas de prazo via **Resend** — **feito, não publicado** (branch `fase5-resend`, ver docs/EMAIL.md): chave geral desligada por padrão + preferência por usuário em Minha conta (padrão desligada), workflow `configurar-resend`. Pendentes: remetente/domínio, plano do Resend, descadastro sem login, termos citando o Resend
