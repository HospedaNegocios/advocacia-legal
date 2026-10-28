# Design da advocacia.legal

Sistema visual do app. Só existe a marca advocacia.legal (sem personalização por escritório).
**As cores da marca são uma proposta**: para mudar a identidade, edite apenas `src/web/estilo/tokens.css`.

## Logotipo
`src/web/ui/Marca.tsx` é um logotipo **provisório** (ícone de balança + texto "advocacia.legal"). Quando houver um logotipo definitivo, troque só esse arquivo: ele é usado no menu lateral, na barra superior do celular, na gaveta e nas telas de acesso. O texto da marca usa sempre a cor cheia do contexto (branco no menu e no painel escuro, `--cor-texto` na barra clara), peso 700, sem opacidade (contraste ≥ 7:1).

## Princípios
- Sóbrio e confiável: azul-marinho/índigo, cinzas frios, um destaque dourado (só em detalhes: item ativo do menu e ponto do logo).
- Dados primeiro: indicadores no topo, gráficos finos e silenciosos, tabelas legíveis.
- Nada depende só de cor: estado = ícone + texto.
- Mobile de verdade: sem rolagem horizontal, alvos de toque de 44px.
- CSP estrita (`'self'`): sem CDN, fontes e ícones vêm do npm (`@fontsource-variable/inter`, `lucide-react`). Nada de `<script>` inline (o tema inicial vem de `public/tema.js`).

## Arquivos
| Onde | O quê |
| --- | --- |
| `src/web/estilo/tokens.css` | Todas as cores, espaçamentos, raios, sombras, movimento (claro e escuro) |
| `src/web/estilo/base.css`, `layout.css`, `ui.css`, `graficos.css` | Estilos usando só tokens |
| `src/web/ui/` | Biblioteca de componentes (importe de `../ui`) |
| `src/web/ui/graficos/` | Gráficos em SVG/HTML próprios |
| `src/web/layout/` | Casca (menu lateral, barra superior), tela de acesso, menu do usuário |
| `src/web/tema.tsx`, `public/tema.js` | Tema Sistema/Claro/Escuro (salvo em `localStorage`, com try/catch) |
| `src/web/estilo/agenda.css` | Kanban de prazos, Agenda e Início |
| `src/web/portal/`, `src/web/estilo/portal.css` | Portal do cliente (rota `/portal`): casca própria (marca, tema, Sair), login, convite, lista e detalhe do processo. Mesmos tokens e componentes de `ui`; aviso fixo "As informações são um resumo..." em todas as telas |
| `src/web/paginas/PortalGestao.tsx` | Controles do escritório: cartão "Portal do cliente" no processo, botão por andamento e aba "Portal" do cliente |
| `site/public/estilo.css` | Site de vendas: tokens copiados de `tokens.css` (repetir mudanças), claro/escuro automático, sem JS; ver `docs/SITE.md` |
| `src/web/paginas/CalculoPrazo.tsx`, `CalendarioEscritorio.tsx` | Calculadora "Calcular data final" dentro do formulário de prazo (blocos `.calc-*` em `agenda.css`) e aba Calendário do Escritório. Aviso fixo de conferência em ambas |
| `src/web/somente-leitura.tsx`, `src/web/paginas/AssinaturaVencida.tsx`, `.faixa-assinatura` em `layout.css` | Escritório com teste vencido: faixa fixa "Somente leitura" na casca, `Botao` de gravar desativado por contexto (prop `leitura` isenta ações que não gravam) e tela "Assinatura vencida" quando bloqueado; ver `docs/ASSINATURA.md` |
| `src/web/paginas/MinhaConta.tsx` | Tela "Minha conta" (menu do usuário): preferências pessoais, hoje o aviso diário de prazos por e-mail (`CampoMarcar` que grava ao marcar, aviso informativo se o envio ainda não foi habilitado); ver `docs/EMAIL.md` |
| `src/web/painel.ts` | Cálculos do painel do dono (com testes em `test/painel-calculos.test.ts`) |

## Tokens
- Cores de superfície/texto: `--cor-fundo`, `--cor-superficie(-2/-3)`, `--cor-borda`, `--cor-borda-campo` (3:1), `--cor-texto`, `--cor-texto-2`, `--cor-texto-3` (todos AA 4.5:1 sobre as superfícies).
- Marca: `--cor-marca`, `--cor-marca-hover`, `--cor-marca-texto`, `--cor-marca-suave(-texto)`, `--cor-destaque`, `--cor-foco`; menu lateral: `--cor-lateral*`.
- Estados (selo/aviso): `--st-bom|aviso|critico|neutro|info-fundo|texto`.
- Gráficos: `--serie-1..8`, `--ordinal-1..3`, `--grafico-bom|aviso|grave|critico|neutro|grade|eixo`.
- Tipografia: Inter variável (`--fonte`), escala `--texto-xs … --texto-3xl`. Espaços `--e-1 … --e-16` (base 4px). Raios `--raio-sm|md|lg|pilula`. Sombras `--sombra-1..3`. Movimento `--dur-rapida`, `--dur`, `--ease` (zerados com `prefers-reduced-motion`).
- Tema escuro: bloco repetido duas vezes em `tokens.css` (automático por `prefers-color-scheme` e manual por `data-tema="escuro"`). Mantenha idênticos. Contraste de texto verificado em ambos os temas.

## Breakpoints
- `< 768px`: celular. Barra superior + menu em gaveta; tabelas viram cartões; botões e campos com 44px.
- `768–1023px`: menu lateral fixo (recolhível); grades de 2 colunas viram 1 coluna abaixo de 1024px.
- `≥ 1024px`: layout completo. Conteúdo com largura máxima de 78rem.
- Telas de acesso: painel da marca some abaixo de 900px.

## Componentes (`src/web/ui`)
| Componente | Uso |
| --- | --- |
| `Botao` (`variante`: primario, secundario, fantasma, perigo; `tamanho`; `carregando`; `somenteIcone` com `aria-label`) | Toda ação |
| `Entrada`, `AreaTexto`, `Selecao`, `SelecaoCompacta`, `CampoMarcar`, `Formulario` | Campos com rótulo, ajuda e erro ligados por aria |
| `Cartao` | Bloco de conteúdo (`titulo`, `subtitulo`, `acoes`, `semPadding`) |
| `Indicador` | KPI: valor, variação com seta + texto + período, `tendencia` (Sparkline) |
| `Selo`, `SeloSituacao` | Estado com ícone + texto (teste, ativo, suspenso, cancelado) |
| `Tabela` | Tabela responsiva: colunas com `principal`, `acoes`, `numerica`; vira cartões no celular |
| `EstadoVazio`, `EstadoErro`, `Esqueleto*` | Vazio, erro com "tentar de novo", carregando |
| `Aviso`, `useToast` | Aviso em linha; notificação temporária |
| `Modal`, `Confirmar` | Diálogo com foco preso, Esc fecha, devolve o foco |
| `Abas` (abaixo de 768px as abas quebram de linha, todas visíveis), `Passos`, `Avatar`, `CabecalhoPagina` (com migalhas), `CopiarLink` | Navegação e identificação |
| `AvisoDePrazos` (`src/web/layout/AlertasPrazos.tsx`) | Popup de prazos vencidos/hoje/amanhã do usuário (usa `Modal`, `SeloPrazo`); selo `.nav-contagem` no item Prazos do menu |
| `SeletorBusca` | Escolher processo/cliente por busca (lista de resultados, trocar/remover) |
| `Barras`, `BarrasAgrupadas`, `Empilhada`, `Linha`, `Sparkline`, `Medidor` | Gráficos (abaixo). `BarrasAgrupadas`: 2 a 3 séries lado a lado por categoria (ex.: recebido × pago por mês), legenda sempre, `formatar` para valores, rótulo só na maior barra, tooltip e tabela |

## Regras de gráficos (resumo do guia dataviz)
- Escolha a forma pelo trabalho: um número = `Indicador`; razão contra limite = `Medidor`; comparar = `Barras` (duas séries por categoria: `BarrasAgrupadas`); parte do todo = `Empilhada` (preferida à pizza); tendência = `Linha`. Mais de ~7 classes: tabela.
- Uma série: sem legenda (o título diz). **Duas ou mais: legenda obrigatória.**
- Barras nominais usam sempre a série 1. Categorias com ordem natural (planos Individual < Equipe < Sociedade) usam a rampa ordinal.
- Cores de série em ordem fixa, nunca reordenadas nem recoloridas por filtro; máximo 8 (passou disso: agrupe em "Outros").
- Cores de estado (`--grafico-bom|aviso|critico`) só quando a cor significa bom/ruim, sempre com ícone + rótulo.
- Nunca eixo duplo. Marcas finas: barra ≤ 24px com 4px arredondado só na ponta; linha 2px; ponto ≥ 8px com anel de 2px da cor da superfície; área a ~10%; grade de 1px sólida; 2px de espaço entre segmentos (sem contorno).
- Texto nunca usa a cor dos dados; rótulo dentro de segmento só se couber.
- Todo gráfico tem tooltip (hover e foco de teclado), resumo para leitor de tela e botão **"Ver como tabela"** (`QuadroGrafico`).
- Nunca invente série temporal: use só dados reais (ex.: `criado_em`); sem dados, mostre estado vazio.

### Paleta validada
Superfícies de gráfico: claro `#ffffff`, escuro `#151b2b`.

| Slot | Claro | Escuro |
| --- | --- | --- |
| 1 | `#2a78d6` | `#3987e5` |
| 2 | `#eb6834` | `#d95926` |
| 3 | `#1baf7a` | `#199e70` |
| 4 | `#eda100` | `#c98500` |
| 5 | `#e87ba4` | `#d55181` |
| 6 | `#008300` | `#008300` |
| 7 | `#6250d6` | `#9085e9` |
| 8 | `#e34948` | `#e66767` |
| Ordinal 1–3 (planos) | `#86b6ef #3987e5 #1c5cab` | `#2a78d6 #5598e7 #9ec5f4` |
| Status bom/aviso/grave/crítico | `#0ca30c #fab219 #ec835a #d03b3b` | iguais |
| Neutro | `#898781` | `#898781` |

Resultado do validador: categórica passa nos dois temas (no claro, aqua/amarelo/rosa ficam abaixo de 3:1: alívio obrigatório = rótulos visíveis e "ver como tabela"). Rampas ordinais passam com `--ordinal`. Status e cinza neutro vêm da paleta documentada (o validador categórico não os cobre).

Comandos (a pasta do validador fica na skill dataviz; ajuste o caminho se mudar):
```
V=/tmp/claude-0/bundled-skills/2.1.311/51f497cc408d9c4794d392e4faa97a7b/dataviz/scripts/validate_palette.js
node $V "#2a78d6,#eb6834,#1baf7a,#eda100,#e87ba4,#008300,#6250d6,#e34948" --mode light --surface "#ffffff"
node $V "#3987e5,#d95926,#199e70,#c98500,#d55181,#008300,#9085e9,#e66767" --mode dark --surface "#151b2b"
node $V "#86b6ef,#3987e5,#1c5cab" --mode light --surface "#ffffff" --ordinal
node $V "#2a78d6,#5598e7,#9ec5f4" --mode dark --surface "#151b2b" --ordinal
```
Se mudar a cor de fundo dos cartões (`--cor-superficie`), rode de novo com a nova superfície.

## Acessibilidade (checklist)
- [ ] Tudo funciona só com teclado; foco sempre visível (anel `--cor-foco`).
- [ ] Texto com contraste AA (4.5:1; 3:1 para texto grande e bordas de campo).
- [ ] Alvos de toque ≥ 44px no celular; sem rolagem horizontal em 375px.
- [ ] Estado nunca só por cor (ícone + texto).
- [ ] Campos com rótulo; erros ligados por `aria-describedby` e `role="alert"`.
- [ ] Modal com foco preso, Esc e retorno do foco; menu e abas com `aria`.
- [ ] Gráficos com resumo, tooltip por teclado e "ver como tabela".
- [ ] Respeita `prefers-reduced-motion` e `prefers-color-scheme`.

## Como criar uma nova tela
1. Crie `src/web/paginas/Nome.tsx` e registre a rota em `App.tsx` (e o item no menu em `layout/Casca.tsx`).
2. Comece por `CabecalhoPagina` (título, descrição, migalhas, ação principal).
3. Se a tela tem métricas, coloque `Indicador`es logo abaixo (grade `grade grade-kpi`).
4. Listas em `Tabela` dentro de `Cartao semPadding` (responsiva).
5. Trate os quatro estados: carregando (`Esqueleto*`), vazio (`EstadoVazio` com ação), erro (`EstadoErro` com "tentar de novo") e sucesso (`useToast`).
6. Ações destrutivas pedem `Confirmar`; formulários em `Modal` com `Formulario`.
7. Gráficos só com dados reais, seguindo as regras acima.
8. Confira em 375px e 1280px, claro e escuro; rode `npm run typecheck`, `npm test`, `npm run build`.
