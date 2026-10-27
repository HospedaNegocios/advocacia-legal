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
