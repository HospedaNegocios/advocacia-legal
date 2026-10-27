# advocacia.legal

SaaS jurídico para escritórios de advocacia. Leia o `CLAUDE.md` antes de qualquer trabalho.

- `docs/MVP.md`: funcionalidades do MVP
- `docs/ROADMAP.md`: fases de desenvolvimento
- `docs/DJEN.md`: verificação da API de intimações

## Como rodar

Precisa de Node 22 instalado.

1. `npm ci` — instala as dependências.
2. `npm test` — roda os testes (inclui os de isolamento entre escritórios).
3. `npm run typecheck` — confere os tipos (também serve como `npm run lint`).
4. `npm run build` — gera a interface em `dist/client`.
5. Ver o sistema no seu computador: rode `npm run build`, depois `npm run dev:api` (servidor local em http://localhost:8787, com banco local de teste). Para a tela em modo de edição, em outro terminal rode `npm run dev` (http://localhost:5173, já conversa com o servidor local).

Publicação é automática pelo GitHub: `develop` publica em dev (`dev.app.advocacia.legal`) e `main` publica em prod (`app.advocacia.legal`). Os segredos `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` ficam nos GitHub Secrets.

Regras importantes: todo acesso ao banco passa por `src/server/db/repositorio.ts`; o escritório (tenant) vem sempre da sessão do login, nunca de parâmetro enviado pelo navegador.
