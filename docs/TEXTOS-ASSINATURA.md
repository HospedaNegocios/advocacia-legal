# Textos da assinatura (para revisão)

Todos ficam em um só arquivo: `src/comum/textos-assinatura.ts`. Se mudar um texto aqui, peça a troca lá (e vice-versa). Não há promessa de prazo, desconto ou condição comercial além do que está no CLAUDE.md.

Contatos usados: WhatsApp (12) 99219-8038 e e-mail comercial@advocacia.legal.

| Onde aparece | Texto |
| --- | --- |
| Resposta do servidor, teste vencido, somente leitura (HTTP 402, quando alguém tenta criar/alterar) | O período de teste grátis do seu escritório terminou. Por enquanto você ainda pode consultar tudo e baixar documentos, mas não é possível criar nem alterar nada. Para voltar a usar o sistema normalmente, fale com o suporte. |
| Resposta do servidor, bloqueado (HTTP 402, qualquer rota) | A assinatura do seu escritório está vencida e o acesso foi bloqueado. Os dados continuam guardados. Para reativar o acesso, fale com o suporte. |
| Dica ao passar o mouse nos botões desativados (somente leitura) | Somente leitura: o período de teste grátis terminou. Fale com o suporte para ativar a assinatura. |
| Tela "Assinatura vencida": título | Assinatura vencida |
| Tela "Assinatura vencida": descrição | O acesso ao seu escritório está bloqueado. Fale com o suporte para reativar. |
| Tela "Assinatura vencida": aviso | Os dados do seu escritório continuam guardados. Assim que a assinatura for ativada, o acesso volta ao normal. |
| Tela "Assinatura vencida": contatos e botão | WhatsApp: (12) 99219-8038; E-mail: comercial@advocacia.legal; botão "Sair" |
| Faixa fixa na fase somente leitura | **Somente leitura.** O teste grátis do seu escritório terminou em DD/MM/AAAA. Você pode consultar tudo e baixar documentos, mas não pode criar nem alterar nada. Faltam N dias para o bloqueio (a partir de DD/MM/AAAA). Fale com o suporte para ativar a assinatura. (com 1 dia: "Falta 1 dia para o bloqueio") |
| Banner do teste, 2 ou mais dias | Seu teste grátis termina em N dias. Para continuar usando depois disso, fale com o suporte: WhatsApp (12) 99219-8038 ou comercial@advocacia.legal. |
| Banner do teste, 1 dia | Seu teste grátis termina amanhã. (mesmo complemento) |
| Banner do teste, último dia | Seu teste grátis termina hoje. (mesmo complemento) |
| Banner: botão de fechar (leitor de tela e dica) | Dispensar aviso de hoje |
| Limite de usuários do plano (409 ao convidar ou reativar) | Limite de usuários do plano atingido. O plano {Individual/Equipe} permite N usuário(s), contando os convites pendentes. Para convidar mais alguém, desative um usuário, exclua um convite pendente ou fale com o suporte para trocar de plano. |
| Excluir convite: convite não existe (404) | Não encontramos este convite. |
| Excluir convite: já aceito (409) | Este convite já foi aceito e não pode ser excluído. Se for o caso, desative o usuário. |
| Excluir convite: pergunta de confirmação (tela Equipe) | Excluir o convite de {e-mail}? O link enviado deixa de funcionar e a vaga volta a ficar livre. |
| Excluir convite: aviso de sucesso (tela Equipe) | Convite de {e-mail} excluído. |

## Regras do banner (para conferir)

- Aparece para **todos os perfis** do escritório, só quando o status é **teste** e o teste ainda não terminou. Escritório `ativo`, suspenso ou cancelado e o dono da plataforma não veem.
- Destaque crescente: **8 dias ou mais** = informativo (azul); **de 4 a 7 dias** = atenção (amarelo); **3 dias ou menos, inclusive hoje** = urgente (vermelho).
- Pode ser dispensado (X) por usuário, por dia, neste navegador, **só nos níveis informativo e atenção**. No urgente e na fase somente leitura não há como fechar. No dia seguinte o aviso volta.
- Os limiares estão em `LIMIAR_URGENTE` (3) e `LIMIAR_ATENCAO` (7), no arquivo de textos.
