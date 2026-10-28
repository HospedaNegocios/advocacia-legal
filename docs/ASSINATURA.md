# Assinatura: acesso por situação e limite de usuários

Decisões do usuário em 2026-10-28. Código: `src/comum/assinatura.ts` (regra de datas), `src/server/assinatura.ts` (controle central), `src/server/planos.ts` (limites), `src/server/convites.ts` e `src/server/rotas/equipe.ts` (convites).

## 1. Teste grátis vencido

Vale **só para escritórios com status `teste` e `teste_ate` preenchida**.

| Situação | Quando (dia civil em America/Sao_Paulo) | O que acontece |
| --- | --- | --- |
| Normal | até o **último dia do teste**, inclusive | tudo funciona |
| Somente leitura | do dia seguinte ao último dia do teste, por **10 dias completos** | vê tudo e baixa documentos; nada é criado, alterado ou apagado |
| Bloqueado | a partir do **11º dia depois do último dia do teste** | login entra, mas só aparece "Assinatura vencida"; nenhuma rota do escritório responde |

- **Último dia do teste** = o dia civil de `teste_ate` em São Paulo (o dia inteiro conta, até 23:59:59).
- Exemplo: último dia 10/11 → leitura de 11/11 a 20/11 (10 dias) → bloqueado a partir de 21/11 às 00:00 de São Paulo.
- Quando o dono define a data pelo painel, o sistema grava o fim daquele dia em São Paulo (23:59:59.999), então o "último dia" volta exatamente como digitado.
- Nada é gravado no banco para a transição: a situação é **calculada a cada requisição** a partir de `status` + `teste_ate` + hoje em São Paulo. Estender a data restaura o acesso na hora.
- `ativo`: **nunca vence sozinho** (ver pendências). `suspenso` e `cancelado`: comportamento anterior (login recusado, sessões derrubadas).
- `teste` sem `teste_ate` (não acontece pelo painel, que sempre grava 14 dias): não vence.

### Como o servidor recusa

Middleware central `controleDeAssinatura` (`src/server/assinatura.ts`), registrado em `src/server/index.ts` para `/api/*`. **Falha fechada**: vale para toda rota nova, exceto a lista de exclusões (`saude`, `auth`, `acesso`, `2fa`, `eu`, `plataforma`, `portal`).

- Somente leitura: `GET/HEAD/OPTIONS` passam; `POST/PUT/PATCH/DELETE` recebem **HTTP 402** com `{ ok:false, codigo:"assinatura_somente_leitura", erro:"O período de teste do seu escritório terminou. ..." }`.
  - Exceção: `POST /api/prazos/calcular` (só calcula uma data, não grava).
- Bloqueado: qualquer método, qualquer rota de escritório, **HTTP 402** com `codigo:"assinatura_bloqueada"` e a mensagem "Assinatura vencida. Fale com o suporte...".
- Escolha do código **402** (e não 403): 403 já significa "sem permissão do seu perfil" nas telas; 402 (pagamento necessário) identifica a assinatura sem confundir.
- Continuam abertos: login, logout, `GET /api/eu` (para a tela saber a situação), 2FA, acesso por convite. Em bloqueado, `/api/eu` não devolve o nome do escritório nem permissões.
- **Dono da plataforma** (`/api/plataforma/*`) e sessões sem escritório não são afetados.
- Sessão pendente de 2FA não passa pelo controle (só alcança `/api/2fa` e `/api/eu`).

### Cron e DJEN

`criarAcessoAgendado` (`oabsParaColetar` e `escritoriosEmOperacao`) deixa de fora escritório `teste` bloqueado (teste vencido há mais de 10 dias). Somente leitura continua sendo coletado. O "Buscar agora" (POST) é recusado em somente leitura.

### Interface

- Faixa fixa "Somente leitura" sob a barra superior (data do fim do teste, data do bloqueio e "Faltam N dias para o bloqueio").
- **Banner de dias restantes** (`src/web/layout/BannerTeste.tsx`): para escritório `teste` ainda no prazo, todos os perfis veem "Seu teste grátis termina em N dias" (hoje/amanhã/singular) com WhatsApp e e-mail do suporte. Destaque: 8+ dias informativo, 4 a 7 atenção, até 3 urgente. Dispensável por dia no navegador (localStorage, com try/catch) só nos níveis informativo e atenção. `ativo` não mostra.
- **Todos os textos** ficam em `src/comum/textos-assinatura.ts` e estão listados em `docs/TEXTOS-ASSINATURA.md` para revisão.
- `Botao` (`src/web/ui/Botao.tsx`) fica desativado, com explicação no `title`, quando o escritório está em somente leitura e o botão é principal, de perigo ou de envio de formulário. `aria-pressed` (alternar visão) não é afetado; `leitura` marca uma ação que não grava (calcular data). O quadro de prazos não arrasta e o seletor "mover para" fica desativado. É só conforto: quem recusa de verdade é o servidor.
- Bloqueado: tela "Assinatura vencida" (`AssinaturaVencida.tsx`) com WhatsApp e e-mail comerciais do CLAUDE.md e botão Sair.
- Painel do dono: coluna "Teste até" mostra o último dia, o selo "Somente leitura" ou "Bloqueado" e o botão "Alterar" (`PATCH /api/plataforma/escritorios/:id` com `teste_ultimo_dia: "AAAA-MM-DD"`, auditoria `tenant_teste_alterado` com os dias de/para).

### Portal do cliente (apenas documentado, não alterado)

O portal (`src/server/portal-sessao.ts`) recusa o cliente só quando o escritório está `suspenso` ou `cancelado`. **Escritório bloqueado por data (teste vencido) continua com o portal funcionando**, pois o portal olha só o `status`. Em somente leitura isso é coerente (o portal já é só leitura). Em bloqueado, é uma decisão pendente (ver abaixo).

## 2. Limite de usuários por plano

| Plano | id | Limite |
| --- | --- | --- |
| Individual | `solo` | 1 |
| Equipe | `escritorio` | 5 |
| Sociedade | `banca` | ilimitado |

Tabela única: `LIMITE_USUARIOS` em `src/server/planos.ts`.

- **Conta como vaga**: usuário ativo com senha definida + convite pendente (usuário provisório sem senha com link de uso único **não usado e não expirado**). Convite expirado não conta.
- **Convidar** acima do limite: **409** "Limite de usuários do plano atingido..." (também no convite do primeiro sócio feito pelo dono). Reconvidar o mesmo e-mail não ocupa duas vagas.
- **Reativar** usuário desativado: **409** se não houver vaga.
- `GET /api/equipe/usuarios` devolve `vagas: { usados, ativos, convites_pendentes, limite }`; a tela Equipe mostra "X de Y usuários" com o detalhe "ativos + convites pendentes".
- Trocar de plano para um menor **não remove** ninguém: apenas impede novos convites e reativações até caber no limite.
- A checagem e a criação do convite são dois passos (não há transação no D1): dois convites simultâneos no limite exato poderiam passar um a mais. Risco baixo, aceito.

## 3. Excluir convite pendente

`DELETE /api/equipe/convites/:usuarioId` (só sócio). Remove os links, as permissões e o usuário provisório (que nunca entrou). Convite já aceito (usuário com senha): **409** "já foi aceito... desative o usuário". Id de outro escritório ou inexistente: **404**. Auditoria `convite_excluido` só com o id. Convite expirado (sem senha) também pode ser excluído (limpeza).

## 4. Pendências

1. **Não existe data de vigência paga** no modelo (`tenants` só tem `status` e `teste_ate`). Por isso um escritório `ativo` nunca vence sozinho. **Decisão do usuário em 2026-10-28:** o dono da plataforma controla manualmente (ativa, suspende, cancela); o escritório `ativo` não vê banner de vencimento. Quando houver cobrança, será preciso uma data de vigência (ou gateway) e decidir a regra de carência.
2. **Aviso antes do vencimento**: resolvido no app com o banner de dias restantes (acima). Aviso por e-mail continua adiado (Resend).
3. **Portal do cliente com escritório bloqueado por data**: continua acessível (ver acima). Decidir se deve recusar e alterar `portal-sessao.ts` depois.
4. Textos reescritos em linguagem simples (`docs/TEXTOS-ASSINATURA.md`); aguardam revisão do usuário.
5. Escritório `ativo` com plano reduzido para abaixo do número de usuários atuais: ninguém é removido (decisão conservadora).
6. Prazo de retenção de 90 dias após cancelamento (CLAUDE.md) não tem relação automática com o bloqueio: bloqueado por teste vencido não inicia contagem de exclusão.
