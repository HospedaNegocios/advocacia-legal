# IA — resumo das intimações (Workers AI)

Verificado na documentação oficial da Cloudflare em 2026-10-27.

## Modelo escolhido
- `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (Meta Llama 3.3 70B, texto). Constante `MODELO_RESUMO` em `src/server/ia.ts`; trocar o modelo é mudar só essa linha.
- Janela de contexto: 24.000 tokens. Preço de tabela: US$ 0,293 por milhão de tokens de entrada e US$ 2,253 por milhão de saída. Fonte: https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/
- **Português:** a página da Cloudflare não lista idiomas. A lista de idiomas oficialmente suportados do Llama 3.3 (inclui português) vem da ficha da Meta, que não foi reaberta nesta sessão: **conferir a qualidade do português com textos reais antes de liberar a clientes**. Alternativa avaliada, sem confirmação de idiomas na documentação: `@cf/google/gemma-4-26b-a4b-it` (US$ 0,10 / US$ 0,30 por milhão, contexto 256.000).
- Binding `AI` no `wrangler.jsonc` (dev e prod). Chamada: `env.AI.run(modelo, { messages, max_tokens, temperature })`; resposta lida de `response` (ou de `choices[0].message.content`).

## Franquia, preço e limites (https://developers.cloudflare.com/workers-ai/platform/pricing/ e .../limits/)
- Franquia gratuita: **10.000 neurons por dia**, nos planos Free e Paid; zera às 00:00 UTC (21:00 em São Paulo). O que passar disso, no Workers Paid, é cobrado a **US$ 0,011 por 1.000 neurons**. No Free, passar da franquia dá erro 3036 (HTTP 429).
- Limite de requisições de modelos de texto: 300 por minuto (padrão).
- Neurons por milhão de tokens (conta derivada do preço: preço ÷ 0,011 × 1.000, não está na tabela para este modelo): entrada ~26.600, saída ~204.800.

## Custo estimado por resumo (estimativa, não medida)
- Pior caso: 20.000 caracteres de entrada (~6.000 tokens) + 700 de saída ≈ 160 + 145 ≈ **300 neurons ≈ US$ 0,0033**. Uma publicação comum é bem menor (cerca de 100 a 150 neurons).
- A franquia grátis cobre ~33 resumos por dia no pior caso (bem mais no caso comum), somando **todos os escritórios**. Como a conta já é Workers Paid, passar disso **não bloqueia**: apenas cobra. Com a cota provisória, um escritório Equipe no máximo (20/dia) custa ~US$ 0,07 por dia no pior caso, e um Sociedade (60/dia) ~US$ 0,20.
- Medir o consumo real no painel https://dash.cloudflare.com/?to=/:account/ai/workers-ai nas primeiras semanas e ajustar a cota.

## Cota diária — PROVISÓRIA
- Definida em `COTA_IA_DIARIA_PROVISORIA` (`src/server/planos.ts`): **Individual 0 (sem IA), Equipe 20/dia, Sociedade 60/dia, por escritório**. Os números finais são decisão do usuário.
- O dia conta em America/Sao_Paulo. A cota é reservada de forma atômica antes de chamar a IA e devolvida se a IA falhar. Esgotada: HTTP 429 com mensagem em português. Editar o texto e aprovar/rejeitar não gastam cota; gerar de novo gasta.

## Privacidade e segurança
- Ao modelo vai **somente o texto da publicação** (até 20.000 caracteres; o resto é cortado e a tela avisa). Nada do escritório, cliente, usuário ou número do processo.
- A instrução do sistema manda resumir em linguagem simples, sem inventar fatos e sem conselho jurídico, e trata o texto como dado: ordens escritas dentro da publicação são ignoradas. As marcas `<publicacao>` dentro do texto são removidas para não fecharem o bloco de dados. Saída limitada a 700 tokens e 4.000 caracteres.
- O resumo é sempre rascunho até um sócio ou advogado aprovar. Só resumo **aprovado** poderá ir ao portal do cliente (portal ainda não existe). A tela mostra "Revise antes de aprovar; a IA pode errar".
- Auditoria (`resumo_ia_gerado|editado|aprovado|rejeitado`) guarda só ids, modelo e situação, nunca o texto.
- Falha da IA: erro amigável (HTTP 503), nada gravado, cota devolvida.
- Sobre o tratamento pela Cloudflare (LGPD, retenção e treinamento), os Termos e a Política de Privacidade (Fase 4) devem citar o uso de Workers AI; a política de dados da Cloudflare para Workers AI **não foi verificada** nesta sessão.
