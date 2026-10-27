---
name: ux-advocacia
description: Use sempre que criar ou alterar qualquer tela, componente ou gráfico da advocacia.legal.
---

# UX da advocacia.legal

1. Leia `docs/DESIGN.md` antes de começar (princípios, tokens, componentes, regras de gráficos, checklist de nova tela).
2. Use somente os componentes de `src/web/ui` (`import { ... } from "../ui"`) e os tokens CSS de `src/web/estilo/tokens.css`. Nunca escreva cor, raio ou sombra soltos; se faltar um componente, crie-o em `src/web/ui` e documente em `docs/DESIGN.md`.
3. Gráficos: siga as regras de `docs/DESIGN.md` (ordem fixa de cores, legenda com 2+ séries, tooltip, "ver como tabela", status com ícone + texto, sem eixo duplo, sem dados inventados). Se mudar qualquer cor de gráfico, rode o validador:
   `node /tmp/claude-0/bundled-skills/*/*/dataviz/scripts/validate_palette.js "<hex,...>" --mode light|dark --surface "<fundo do cartão>"` (comandos exatos em `docs/DESIGN.md`) e corrija os FAIL.
4. Toda tela nova: `CabecalhoPagina`, indicadores no topo se houver métricas, tabelas responsivas, estados de carregando/vazio/erro.
5. Verifique em 375px e 1280px, nos temas claro e escuro: sem rolagem horizontal, alvos de toque de 44px, foco visível, contraste AA. Rode `npm run typecheck`, `npm test` e `npm run build`.
