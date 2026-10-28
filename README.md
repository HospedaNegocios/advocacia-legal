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

## Site de vendas

Fica em `site/` (arquivos estáticos, sem build). Publicação automática pelo workflow `deploy-site`: `develop` publica em `dev.advocacia.legal` e `main` publica em `advocacia.legal`, **só quando algo em `site/` mudar**. Nada vai para produção sem juntar a branch na `main`. Detalhes e pendências: `docs/SITE.md`.

## Primeiro acesso do dono (passo a passo, sem programar)

Depois que a `develop` foi publicada (o deploy automático também prepara o banco), faça no GitHub, em **Actions**:

1. Clique em **configurar-segredos** → **Run workflow** → escolha **dev** → **Run workflow**. Isso cria a chave que protege os códigos do 2FA. Só precisa ser feito uma vez por ambiente; se a chave já existir, nada é alterado.
2. Clique em **criar-dono** → **Run workflow** → escolha **dev**, digite o seu e-mail → **Run workflow**.
3. Quando terminar (bolinha verde), abra a execução e role até o **Summary** (resumo). Lá aparece o link de primeiro acesso. Ele vale 24 horas e só abre uma vez.
4. Abra o link, crie a sua senha (mínimo 10 caracteres) e leia o QR code com um aplicativo autenticador (Google Authenticator, Microsoft Authenticator, Authy...). Digite o código de 6 dígitos para ativar.
5. Pronto: entre em `dev.app.advocacia.legal`, abra **Escritórios**, crie um escritório e gere o convite do primeiro sócio (copie o link e envie para ele).

Para **prod**, repita os passos 1 e 2 escolhendo **prod** (só funciona rodando a partir da branch `main`). Se perder o acesso, rode **criar-dono** de novo com o mesmo e-mail: é gerado um link novo (o 2FA já cadastrado continua valendo).

Regras importantes: todo acesso ao banco passa por `src/server/db/repositorio.ts`; o escritório (tenant) vem sempre da sessão do login, nunca de parâmetro enviado pelo navegador. No seu computador, o servidor local (`npm run dev:api`) precisa de um arquivo `.dev.vars` com `CHAVE_CRIPTO=` seguido de uma chave de teste (`openssl rand -base64 32`); esse arquivo não vai para o GitHub.
