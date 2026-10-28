# Site de vendas (Fase 4, passo 1)

Estado: na branch `fase4-site`, **não publicado**. Nada foi enviado à Cloudflare.

## O que é
Worker separado do app, só com arquivos estáticos, em `site/` (config em `site/wrangler.jsonc`, arquivos em `site/public/`). Sem JavaScript, sem formulário, sem banco, sem segredos. O app (`wrangler.jsonc` da raiz, `dist/`, testes e build) não é afetado.

| Página | Endereço | Arquivo |
| --- | --- | --- |
| Início | `/` | `index.html` |
| Planos e preços | `/planos` | `planos.html` |
| Termos de Uso (MINUTA) | `/termos` | `termos.html` |
| Política de Privacidade (MINUTA) | `/privacidade` | `privacidade.html` |
| Não encontrada | qualquer outro | `404.html` |

Também: `estilo.css` (tokens copiados de `src/web/estilo/tokens.css`, claro/escuro pelo sistema do visitante, sem botão de tema), `favicon.svg`, fonte Inter local (licença OFL em `fonts/`), `_headers` (CSP restrita a `'self'` sem estilo inline, HSTS, nosniff), `robots.txt`. Se a identidade mudar em `tokens.css`, repetir os valores em `site/public/estilo.css`.

## Ambientes e deploy
| Branch | Worker | Endereço | Workflow |
| --- | --- | --- | --- |
| `develop` | `advocacia-legal-site-dev` | `dev.advocacia.legal` (Custom Domain) | `.github/workflows/deploy-site.yml` (só roda se mudar algo em `site/`) |
| `main` | `advocacia-legal-site` | `advocacia.legal` (Custom Domain) | idem |

- Produção só é publicada quando alguém junta a branch na `main`: mesma regra do app. O site de dev recebe `X-Robots-Tag: noindex` (o workflow acrescenta ao `_headers`).
- O `dev.advocacia.legal` usa o mesmo mecanismo já verificado para `dev.app.advocacia.legal` (Custom Domain, certificado automático, sem custo extra). Não foi feita chamada real à Cloudflare nesta sessão; a validação foi `wrangler deploy --dry-run` nos dois ambientes (config válida).
- Teste local: `npx wrangler dev -c site/wrangler.jsonc --env dev`.
- Os dois nomes de Worker começam com `advocacia-legal`. Nenhum recurso de outro projeto é tocado.

## Decisões de conteúdo
- Só funcionalidades que existem hoje; preços e limites exatamente os do CLAUDE.md. Sem depoimentos, números, selos, certificações nem metas de disponibilidade.
- Contato só por WhatsApp (12) 99219-8038 e comercial@advocacia.legal; DPO dpo@advocacia.legal só nas minutas. Rodapé com razão social e CNPJ; endereço e nome do encarregado ficam "pendente" nas minutas.
- Não se promete e-mail diário de prazos (está desligado, docs/EMAIL.md); o site cita só o aviso na tela.
- Cotas de IA não aparecem (provisórias): "cota diária" (Equipe) e "cota maior" (Sociedade).
- Termos e Privacidade têm faixa "MINUTA — sujeita a revisão por advogado antes da publicação", `noindex` e um quadro final com pontos para conferência jurídica. Para publicar de verdade: remover a faixa, o `noindex` e o quadro e preencher os campos "pendente".
- O link "Entrar" aponta para `app.advocacia.legal` também no site de dev.

## PENDÊNCIAS
1. **Divergência de planos:** o site segue o CLAUDE.md (portal e IA só em Equipe e Sociedade; Individual sem eles). O código hoje libera o portal em todos os planos. Decidir e alinhar código ou site.
2. **Inferência a confirmar:** o CLAUDE.md não diz expressamente que Equipe inclui tudo do Individual nem que Sociedade inclui o portal; o site escreve "Tudo do plano Individual/Equipe".
3. Endereço da empresa e nome do encarregado (DPO); revisão das minutas por advogado (lista no fim de cada página).
4. Forma de pagamento/cobrança, reajuste, reembolso, o que ocorre após os 14 dias de teste, cancelamento, SLA e suporte, foro.
5. Exportação e exclusão de dados (90 dias) ainda não existem no produto; as minutas só afirmam a retenção de 90 dias.
6. Workers AI (retenção e treinamento) e compromissos de dados da Cloudflare: não verificados; dados ficam em região ENAM (fora do Brasil, art. 33 da LGPD).
7. **Antes do deploy de prod:** confirmar que `advocacia.legal` não está ligado ao Worker antigo `advocacia` (ou a um registro DNS existente); um Custom Domain novo pode conflitar. Decidir também sobre `www.advocacia.legal` (não configurado).
8. Logotipo é o mesmo ícone provisório do app; sem imagem de compartilhamento (og:image).
9. Primeira execução do workflow do site exige o `CLOUDFLARE_API_TOKEN` ter permissão de Workers e de Custom Domain/DNS da zona `advocacia.legal` (conferir).
