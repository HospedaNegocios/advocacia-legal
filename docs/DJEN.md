# DJEN — verificação da API pública (2026-10-27)

## O que foi confirmado

- Endpoint de consulta: `GET https://comunicaapi.pje.jus.br/api/v1/comunicacao`
- Sem autenticação, sem cadastro.
- Parâmetros vistos em uso: `siglaTribunal`, `dataDisponibilizacaoInicio`, `dataDisponibilizacaoFim`, `pagina`, `itensPorPagina`, `numeroOab`, `ufOab`.
- Base legal do DJEN: Resolução CNJ nº 455/2022 (https://atos.cnj.jus.br/atos/detalhar/4509). Portal: https://comunica.pje.jus.br

## O que NÃO foi encontrado

- **Termos de uso publicados** para a API de consulta do DJEN. (Os termos que existem são do DataJud, outra API do CNJ, que tem restrição a uso não comercial — não se aplicam ao DJEN, mas convém confirmar com o CNJ antes de vender a funcionalidade.)
- **Limite oficial de requisições** e SLA.
- A documentação Swagger do CNJ (https://app.swaggerhub.com/apis-docs/cnj/pcp/1.0.0) não pôde ser aberta nesta sessão.

## Relatos de integradores (não oficiais)

- Bloqueio HTTP 403 para IPs fora do Brasil. **Risco direto para Cloudflare Workers** — testar antes de construir o módulo.
- Erros HTTP 500 em picos; recomendam ~500 ms entre chamadas, retry com backoff.
- `itensPorPagina` acima de 50 pode retornar lista vazia.
- `numeroOab` é comparado como texto exato; números podem ter sufixos (`-A`, `-O`). Normalizar.

## Regras de implementação

- Máximo 1 requisição por segundo; parar diante de CAPTCHA, login ou bloqueio.
- Não pedir o mesmo dado duas vezes (guardar `hash`/id da comunicação).
- O texto com valor legal é o publicado no Diário; o sistema é auxiliar.
- Se o teste a partir do Worker der 403: alternativas a decidir com o usuário (proxy no Brasil ou serviço pago).

## Teste a partir do Worker

Rota do dono da plataforma (com 2FA): `POST /api/plataforma/diagnostico/djen`, tela **Diagnóstico** no app. Faz uma única consulta ao DJEN (TJSP, publicações de hoje no fuso de São Paulo, 5 itens) e devolve código HTTP, tempo, data center da Cloudflare (`colo`), país, quantidade de itens e, se falhar, os primeiros 300 caracteres da resposta. Limite de 1 teste a cada 10 s. Não guarda o conteúdo da resposta; só registra `status` e tempo no log de auditoria.

Resultado (2026-10-27, Worker `advocacia-legal-dev`): **4 chamadas, todas HTTP 200**, entre 52 ms e 181 ms (fonte: `audit_log`, ação `diagnostico_djen`). Não houve bloqueio 403. A tela mostrou **5 itens** (o pedido foi `itensPorPagina=5`): a resposta é JSON com a lista em `items` ou na raiz, como o diagnóstico espera. Os demais campos de cada item ainda devem ser conferidos ao construir o módulo.

## Fontes

- https://github.com/edilsonfs/apis-publicas-tribunais-orgaos
- https://chatjuridico.com.br/api-do-djen-consulta-oficial-cnj/
- https://www.lexnode.com.br/blog/api-do-djen


## Formato da resposta (Fase 3, passo 1)

**Como foi levantado:** a chamada direta à API não foi possível a partir do ambiente de desenvolvimento (o proxy de saída bloqueia `comunicaapi.pje.jus.br`) e o Swagger do CNJ não abriu. O formato abaixo vem de **relatos de terceiros** (nenhuma fonte oficial) e do diagnóstico do Worker de dev (HTTP 200, lista em `items`). **Confira com uma chamada real a partir do Worker antes de ligar em produção** (o código trata tudo, menos o identificador, como opcional).

Resposta: objeto com `count` (total, número) e `items` (lista). A coleta também aceita uma lista na raiz.

Campos de cada item citados por terceiros (24 chaves, nomes exatos, **tipos não confirmados**):
`id`, `hash`, `numero_processo`, `numeroprocessocommascara`, `siglaTribunal`, `nomeOrgao`, `idOrgao`, `tipoComunicacao`, `tipoDocumento`, `codigoClasse`, `nomeClasse`, `data_disponibilizacao`, `datadisponibilizacao`, `texto`, `link`, `meio`, `meiocompleto`, `numeroComunicacao`, `status`, `ativo`, `destinatarios`, `destinatarioadvogados`, `data_cancelamento`, `motivo_cancelamento`.

Dentro de `destinatarios`: `nome`, `polo`. Dentro de `destinatarioadvogados`: `nome`, `numero_oab`, `uf_oab` (resumo de terceiros, pode haver mais campos).

Exemplo (só campos citados; valores trocados por XXXX):
```json
{ "count": XXXX, "items": [ {
  "id": XXXX, "hash": "XXXX", "numero_processo": "XXXX", "numeroprocessocommascara": "XXXX",
  "siglaTribunal": "XXXX", "nomeOrgao": "XXXX", "tipoComunicacao": "XXXX", "tipoDocumento": "XXXX",
  "nomeClasse": "XXXX", "data_disponibilizacao": "XXXX", "texto": "XXXX", "link": "XXXX",
  "destinatarios": [ { "nome": "XXXX", "polo": "XXXX" } ],
  "destinatarioadvogados": [ { "nome": "XXXX", "numero_oab": "XXXX", "uf_oab": "XXXX" } ]
} ] }
```

Parâmetros usados pela coleta: `numeroOab`, `ufOab`, `dataDisponibilizacaoInicio`, `dataDisponibilizacaoFim`, `pagina` (começa em 1), `itensPorPagina` (50). Paginação: continua enquanto a página vier cheia e `count` não for atingido.

**NÃO confirmado:** tipo de `id` (número ou texto; guardamos como texto); formato de `data_disponibilizacao` (aceitamos AAAA-MM-DD e DD/MM/AAAA, com ou sem hora); se `texto` traz HTML (a tela mostra como texto puro); o que significam `status`/`ativo` (só usamos `data_cancelamento` para marcar "cancelada"); se `numeroOab` aceita o sufixo (`-A`, `-O`): **o sufixo cadastrado não é enviado**, só número e UF; se a data inicial/final é inclusiva; se `count` é o total real ou limitado (um relato cita teto de 10.000 por tribunal); se `link` existe.

## Como a coleta funciona (src/server/djen/)

- **Quando:** no mesmo Cron diário (10:00 UTC = 07:00 de São Paulo). `DJEN_COLETA_ATIVA=false` desliga. Sem OAB ativa não há chamada.
- **Quem:** OABs ativas de escritórios em teste ou ativos (suspenso e cancelado ficam de fora). As nunca coletadas vêm primeiro, depois as de coleta mais antiga.
- **Janela:** da data final da última coleta bem-sucedida da OAB (o dia é repetido porque publicações chegam depois) até hoje em São Paulo; primeira vez = últimos 3 dias; no máximo 30 dias.
- **Ritmo:** no mínimo 1 s entre o início de duas requisições; `itensPorPagina` 50; até 40 páginas por OAB (se bater o teto, a execução guarda a observação `limite_paginas`); 5xx e falha de rede são repetidos até 3 vezes com espera de 2 s e 4 s; o mesmo pedido não é repetido na mesma rodada (duas contas com a mesma OAB gastam uma chamada só).
- **Bloqueio:** 403, 429, 401, redirecionamento (login) ou resposta que não é JSON (HTML/CAPTCHA) **param a coleta inteira**; a execução fica `bloqueado` e as OABs restantes ficam para a próxima rodada. Outros erros (ex.: 400) só encerram aquela OAB.
- **Limites por rodada do Cron** (sem fila externa): 10 minutos, 300 requisições e 500 OABs; o que sobrar entra na próxima rodada. Uma OAB coletada há menos de 30 minutos é pulada no Cron (disparo duplo).
- **Duplicidade:** `intimacoes` tem chave única (escritório + id da comunicação; se faltar `id`, usa-se o `hash`; sem nenhum dos dois o item é ignorado). A mesma publicação achada por duas OABs do escritório é uma linha só, ligada às duas em `intimacoes_oabs`.
- **Vínculo ao processo:** número de 20 dígitos (máscara removida) igual ao `numero_cnj` de um processo do escritório. Intimações sem processo são ligadas quando o processo é cadastrado ou tem o número alterado, e ao fim de cada rodada.
- **Registros:** `djen_execucoes` (uma linha por OAB e rodada: datas, páginas, itens, resultado, HTTP, observação curta). Nunca guarda texto de publicação, nem o log nem a auditoria. O texto da publicação é guardado inteiro (limite técnico de 300.000 caracteres).
- **Buscar agora:** `POST /api/intimacoes/buscar`, só sócio, uma vez a cada 10 minutos por escritório, mesma lógica do Cron (orçamento de 40 s e 40 requisições).
- **Não resolvido:** atualização de uma comunicação já guardada (ex.: cancelada depois) não é feita; a busca por texto ignora maiúsculas só para letras ASCII (sem coluna de texto normalizado, para não dobrar o tamanho).
