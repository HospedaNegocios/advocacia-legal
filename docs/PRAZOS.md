# Contagem de prazos em dias úteis

Funcionalidade da Fase 5 (branch `fase5-dias-uteis`). É um **apoio** ao advogado: calcula a data final com explicação passo a passo, mas **não grava nada sozinho**. O vencimento do prazo continua sendo um campo de data, sempre editável à mão. Aviso fixo nas telas: "Confira o resultado com o calendário do seu tribunal; a responsabilidade pelo prazo é do advogado."

Código: `src/comum/prazos-uteis.ts` (módulo puro, só Intl), testes em `test/prazos-uteis.test.ts` e `test/calendario-rotas.test.ts`. API: `POST /api/prazos/calcular` (só cálculo) e `/api/calendario/*`. Tela: botão "Calcular data final" no prazo e aba "Calendário" em Escritório.

## Regras aplicadas e fontes

Fontes consultadas em 2026-10-28. **O texto do CPC no Planalto não pôde ser lido por inteiro neste ambiente** (a página chegou cortada no art. 165): os arts. 219, 224 e 231 foram conferidos em transcrição secundária (Projuris) e os arts. 216 e 220 em transcrição do LegJur. **Conferir os textos no Planalto antes de divulgar** (ver pendências).

| Regra | Fonte |
| --- | --- |
| Em prazo em dias, contam-se só os dias úteis (art. 219) | CPC, Lei 13.105/2015, art. 219. https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm |
| Exclui o dia do começo e inclui o dia do vencimento (art. 224, caput) | CPC art. 224. Mesmo endereço |
| Publicação = primeiro dia útil seguinte à disponibilização no DJe (art. 224 § 2º); a contagem começa no primeiro dia útil que seguir à publicação (§ 3º) | CPC art. 224, §§ 2º e 3º |
| Início do prazo (dia do começo) conforme a forma de comunicação; para intimação eletrônica é o dia útil seguinte à consulta (art. 231, V) | CPC art. 231 |
| Vencimento em dia sem expediente passa ao primeiro dia útil seguinte (art. 224 § 1º) | CPC art. 224 § 1º (ver dúvida abaixo) |
| Sábados, domingos e dias sem expediente forense são feriados para efeito forense (art. 216) | CPC art. 216 |
| Prazo suspenso de 20/12 a 20/01, inclusive (art. 220) | CPC art. 220 |
| Intimação na sexta: prazo começa na segunda; sem expediente, no primeiro dia útil seguinte | Súmula 310 do STF. https://portal.stf.jus.br/jurisprudencia/sumariosumulas.asp?base=30&sumula=2600 |
| Feriados nacionais: 1/1, 21/4, 1/5, 7/9, 2/11, 15/11, 25/12 | Lei 662/1949, art. 1º, na redação da Lei 10.607/2002. https://www.planalto.gov.br/ccivil_03/leis/l0662.htm |
| 12/10 (Nossa Senhora Aparecida) | Lei 6.802/1980. https://www.planalto.gov.br/ccivil_03/leis/l6802.htm |
| 20/11 (Consciência Negra), a partir de 2024 (lei de 21/12/2023, em vigor na publicação) | Lei 14.759/2023. https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14759.htm |

### O que NÃO é feriado nacional por lei (não entra no cálculo por padrão)

- **Sexta-feira Santa:** a Lei 9.093/1995, art. 2º, a trata como feriado religioso "declarado em lei municipal, de acordo com a tradição local", em número não superior a quatro, "neste incluída a Sexta-Feira da Paixão" (https://www.planalto.gov.br/ccivil_03/leis/l9093.htm). Não consta da Lei 662/1949. Na Justiça Federal, a Lei 5.010/1966, art. 62, II, dá feriado de quarta-feira da Semana Santa até o domingo de Páscoa (https://www.planalto.gov.br/ccivil_03/leis/l5010.htm).
- **Carnaval:** não há lei nacional. A Lei 5.010/1966, art. 62, III, prevê segunda e terça de Carnaval **para a Justiça Federal**. Nos demais tribunais depende de ato do próprio tribunal.
- **Corpus Christi:** não há lei nacional; depende de lei local ou ato do tribunal.
- Os tribunais divulgam seus próprios calendários, e as datas variam (ex.: em 2020 o TJSP antecipou o Corpus Christi na capital; fonte: AASP, https://www.aasp.org.br/?p=15527).
- O STJ reafirmou que **feriado local deve ser comprovado no ato de interposição do recurso** (CPC art. 1.003, § 6º), com tratamento próprio para o Carnaval em casos anteriores ao acórdão: https://www.stj.jus.br/sites/portalp/Paginas/Comunicacao/Noticias/21052021-Feriado-local-deve-ser-comprovado-no-ato-de-interposicao-do-recurso--reafirma-Corte-Especial.aspx

Por isso esses dias ficam no **calendário editável do escritório** (tabela `calendario_dias`, nada vem preenchido). Para facilitar, a aba "Calendário" mostra **sugestões** de dias móveis do ano (segunda e terça de Carnaval, quarta a sexta da Semana Santa, Corpus Christi) com a base de cada uma, e o escritório cadastra só os que valem para ele. A Páscoa só é calculada para gerar essas sugestões (algoritmo de Meeus/Jones/Butcher, calendário gregoriano). Conferência: as datas de 2020 coincidem com as publicadas pelos tribunais na página da AASP (Carnaval 24 e 25/02, Sexta-feira Santa 10/04, Corpus Christi 11/06) e há teste para isso.

## Como o cálculo funciona

1. Define o **dia do começo**: disponibilização (publicação = próximo dia útil), publicação, consulta eletrônica (dia útil seguinte) ou o dia do começo já definido pelo art. 231.
2. Exclui o dia do começo. O primeiro dia contado é o primeiro dia útil seguinte.
3. **Dias úteis:** conta cada dia que não seja sábado, domingo, feriado nacional por lei nem dia cadastrado no calendário do escritório, e que não esteja entre 20/12 e 20/01. **Dias corridos:** conta todos os dias, menos os de 20/12 a 20/01.
4. Se o último dia cair em dia sem expediente, passa ao primeiro dia útil seguinte.
5. A resposta traz as datas puladas, agrupadas por motivo, e o passo a passo.

Limites: data entre 2016 e 2099 (CPC em vigor desde 18/03/2016); de 1 a 365 dias.

## Casos de teste (derivados à mão das regras)

| Caso | Resultado | Origem |
| --- | --- | --- |
| Disponibilização qui 02/10/2025, 15 úteis | 24/10/2025 | contagem manual: publicação 03/10, começa 06/10 |
| Disponibilização seg 27/10/2025, 20 úteis | 26/11/2025 | pula 20/11 (Lei 14.759/2023) |
| Publicação seg 30/10/2023, 15 úteis | 22/11/2023 | 20/11/2023 ainda não era feriado; pula 2/11 e 15/11 |
| Disponibilização seg 15/12/2025, 15 úteis | 05/02/2026 | suspensão de 20/12 a 20/01 (32 dias) |
| Mesmo caso sem suspensão | 08/01/2026 | pula 25/12 e 01/01 |
| 5 corridos desde 10/03/2025 | 17/03/2025 | 15/03 é sábado |
| 10 corridos desde 10/04/2025 | 22/04/2025 | 20/04 domingo e 21/04 Tiradentes |
| Calendário do escritório com 08/10/2025 | 27/10/2025 | dia cadastrado é pulado |

Páscoa (2020, 2024, 2025 e 2026) conferida contra o calendário; só 2020 tem fonte citada acima, as demais são datas conhecidas do calendário litúrgico.

## Decisões de interpretação (a confirmar com o advogado)

Nenhuma delas veio de texto de lei que eu tenha conseguido ler por inteiro; estão marcadas como pendência.

- Em **dias corridos** o cálculo também começa no primeiro dia útil depois do dia do começo (art. 224 § 3º e Súmula 310) e também suspende de 20/12 a 20/01. O art. 220 fala em "prazo processual"; prazo material (ex.: decadência, prescrição) **não** deve usar a suspensão, e a calculadora tem a opção de desligá-la.
- Para achar a "publicação" e o "dia útil seguinte à consulta", o período de 20/12 a 20/01 **não** é tratado como sem expediente (o art. 220 suspende o prazo, não o expediente). Recessos que fecham o fórum devem ser cadastrados no calendário.
- Se o vencimento prorrogado cair dentro de 20/12 a 20/01, a tela avisa para conferir.
- Dia cadastrado como "suspensão de tribunal" é tratado igual a dia sem expediente (não conta).
- A prorrogação do vencimento que cai em dia sem expediente foi atribuída ao art. 224 § 1º, que, no resumo lido, trata de expediente encerrado antes ou iniciado depois da hora normal e de indisponibilidade do sistema. Confirmar se a base correta é esse parágrafo (com o art. 216) e ajustar o texto da explicação, se preciso. Os casos de expediente encerrado antes da hora e de indisponibilidade do sistema **não** são calculados (sem dados no sistema).

## Pendências para o usuário/advogado

1. Ler os arts. 216, 219, 220, 224 e 231 do CPC diretamente no Planalto e confirmar as transcrições acima. A Lei 11.419/2006 (arts. 4º e 5º) também não pôde ser lida (acesso bloqueado) e não foi usada como base além do que o art. 224 do CPC já diz.
2. Confirmar as interpretações da seção anterior (principalmente corridos + suspensão e a publicação durante a suspensão).
3. Regras especiais **não** cobertas: Juizados, Justiça do Trabalho (CLT), prazo em dobro (Fazenda, Defensoria, litisconsortes), consulta automática ao fim de 10 dias da intimação eletrônica. Decidir se entram.
4. Quem pode editar o calendário: hoje sócio e advogado (leitura para todos). Confirmar.
5. Calendário por tribunal/comarca: hoje é um calendário único por escritório. Se o escritório atua em comarcas com feriados diferentes, precisará de um calendário por comarca (não feito).
6. Datas antes de 2016 não são aceitas; mudanças futuras na lista de feriados nacionais exigem alterar o código (`FERIADOS_FIXOS`).
