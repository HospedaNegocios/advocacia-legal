# DataJud (CNJ): movimentações dos processos

Recurso **ligado só em dev** e **desligado em prod**. Motivo: os termos de uso do CNJ proíbem uso comercial (ver abaixo). Nada de segredo neste arquivo.

## O que foi verificado (termos de uso v1.2 da API Pública do DataJud)

| Cláusula | O que diz | Efeito aqui |
| --- | --- | --- |
| 3.3 e 3.8 | Uso **não comercial** | Recurso desligado em prod (`DATAJUD_ATIVO` = `"false"` no `wrangler.jsonc`). Ligar em prod só depois de decisão do dono (autorização do CNJ ou outro entendimento). |
| 3.13 | Máximo de **120 requisições por minuto** | O sistema faz no máximo 1 por segundo (60 por minuto). |
| 3.6 | O CNJ **não garante** atualidade nem disponibilidade | A tela avisa que os dados podem chegar com atraso e que a informação oficial é a dos autos. |
| (escopo) | Só processos **públicos**; sigilosos não aparecem | A tela avisa; "não encontrado" pode significar segredo de justiça. |

A chave de acesso é **pública**, publicada pelo CNJ na wiki oficial do DataJud, e **muda de tempos em tempos**. Não fica no código.

## Como funciona

- Endpoint: `POST https://api-publica.datajud.cnj.jus.br/api_publica_<alias>/_search`, cabeçalhos `Authorization: APIKey <chave>` e `Content-Type: application/json`, corpo `{"query":{"match":{"numeroProcesso":"<20 dígitos>"}},"size":10}`.
- O `<alias>` (tjsp, trf3, trt2, tre-ac, tjmmg...) é derivado do número CNJ (`src/server/datajud/tribunal.ts`). Tribunais fora da API (STF, CNJ etc.) ficam como "tribunal não coberto", sem chamar a rede.
- A resposta vem no estilo Elasticsearch (`hits.hits[]._source`). Pode haver um hit por grau/sistema: os movimentos de todos são juntados. Todo campo é tratado como opcional e de tipo não garantido (`formato.ts`). Hits de outro número de processo são ignorados.
- Cada movimento tem uma **chave** (hash de grau + código + data/hora + nome + órgão): a mesma movimentação nunca é gravada duas vezes.
- Tabelas (`migrations/0016_datajud.sql`): `datajud_consultas` (uma linha por processo: situação da última consulta) e `datajud_movimentos`. Separadas dos andamentos manuais. **Os movimentos do DataJud não vão para o portal do cliente.**
- Cron diário (mesmo das 07:00): processos **ativos** de escritórios em teste ou ativos; nunca consultados primeiro, depois os de consulta mais antiga; pula quem foi consultado há menos de 20 h; no mínimo 1 s entre requisições; até 300 requisições e 10 min por rodada; 5xx e falha de rede repetem até 3 vezes (espera de 2 s e 4 s); 401, 403, 429, redirecionamento ou resposta que não é JSON são tratados como **bloqueio** e param a rodada inteira.
- Botão "Atualizar agora" (aba Movimentações do processo): qualquer perfil, processo ativo, no máximo 1 vez a cada 10 minutos por processo (resposta 429 em português), até 2 tentativas em caso de falha temporária. Fica na auditoria (`datajud_atualizado`: só resultado e quantidade, nunca o conteúdo).
- Rotas: `GET /api/processos/:id/datajud` e `POST /api/processos/:id/datajud/atualizar`. `GET /api/eu` traz `recursos.datajud` para a tela decidir se mostra a aba.
- Segurança: o escritório vem sempre da sessão; processo de outro escritório responde 404; toda consulta ao banco passa pela camada de dados (`repositorio.datajud`). O Cron usa `criarAcessoAgendado(...).processosParaDatajud`, que só lista quais processos consultar; a gravação é feita depois com o `tenant_id` de cada um.
- Os testes nunca chamam a rede (cliente e relógio simulados, `definirDepsDatajudParaTeste`).

## Como configurar (dev)

1. No GitHub: Settings > Secrets and variables > Actions > New repository secret, nome `DATAJUD_CHAVE`, valor = a **chave pública copiada da wiki oficial do DataJud** (https://datajud-wiki.cnj.jus.br/api-publica/acesso).
2. No dev, nada mais: a cada deploy da `develop`, o workflow Deploy grava o segredo `DATAJUD_CHAVE` no Worker de dev (sem mostrar o valor) se o GitHub Secret existir. Para trocar a chave, atualize o GitHub Secret e faça um novo deploy. O workflow **configurar-datajud** faz o mesmo sob demanda, mas só aparece em Actions quando estiver na `main` (branch padrão do repositório).
3. Sem a chave, o recurso fica desligado mesmo com `DATAJUD_ATIVO` = `"true"`. Se a chave deixar de valer, o DataJud responde 401/403: a situação do processo aparece como "consulta recusada" e a rodada do Cron para. Basta atualizar o GitHub Secret e rodar o workflow com "substituir".

## O que NÃO foi confirmado

- **Formato real da resposta**: a leitura foi escrita a partir da descrição pública dos campos, sem chamada real. Conferir com um processo de verdade em dev (formato de `dataHora`, `grau`, `complementosTabelados`).
- **Atraso dos dados** em relação aos autos.
- **Se o Worker é bloqueado** (como relatado para o DJEN com IPs de fora do Brasil). Testar a chamada a partir do Worker em dev.
- Se os nomes dos aliases estão todos corretos para tribunais menos comuns (Justiça Militar estadual, TREs).
