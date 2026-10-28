// TEXTOS DA ASSINATURA, TODOS AQUI (servidor e interface). A lista para revisão está em docs/TEXTOS-ASSINATURA.md:
// ao mudar um texto, mude os dois. Não prometer prazo, desconto ou condição comercial que não esteja no CLAUDE.md.

export const CONTATO_SUPORTE = {
  whatsappTexto: "(12) 99219-8038",
  whatsappLink: "https://wa.me/5512992198038",
  email: "comercial@advocacia.legal",
  emailLink: "mailto:comercial@advocacia.legal",
} as const;

// ---- Respostas do servidor (HTTP 402) ----
export const MENSAGEM_SOMENTE_LEITURA =
  "O período de teste grátis do seu escritório terminou. Por enquanto você ainda pode consultar tudo e baixar documentos, mas não é possível criar nem alterar nada. Para voltar a usar o sistema normalmente, fale com o suporte.";
export const MENSAGEM_BLOQUEADO =
  "A assinatura do seu escritório está vencida e o acesso foi bloqueado. Os dados continuam guardados. Para reativar o acesso, fale com o suporte.";

// ---- Dica nos botões desativados (somente leitura) ----
export const TEXTO_SOMENTE_LEITURA = "Somente leitura: o período de teste grátis terminou. Fale com o suporte para ativar a assinatura.";

// ---- Tela "Assinatura vencida" (bloqueado) ----
export const TELA_VENCIDA = {
  titulo: "Assinatura vencida",
  descricao: "O acesso ao seu escritório está bloqueado. Fale com o suporte para reativar.",
  aviso: "Os dados do seu escritório continuam guardados. Assim que a assinatura for ativada, o acesso volta ao normal.",
} as const;

// ---- Faixa fixa da fase somente leitura ----
export const FAIXA_TITULO = "Somente leitura.";
export function textoFaixaLeitura(ultimoDiaFormatado: string | null, bloqueioFormatado: string | null, diasParaBloqueio: number | null): string {
  const termino = ultimoDiaFormatado ? `O teste grátis do seu escritório terminou em ${ultimoDiaFormatado}.` : "O teste grátis do seu escritório terminou.";
  const resto = "Você pode consultar tudo e baixar documentos, mas não pode criar nem alterar nada.";
  let prazo = "";
  if (diasParaBloqueio !== null && diasParaBloqueio >= 1) {
    const quando = bloqueioFormatado ? ` (a partir de ${bloqueioFormatado})` : "";
    prazo = ` ${diasParaBloqueio === 1 ? "Falta 1 dia" : `Faltam ${diasParaBloqueio} dias`} para o bloqueio${quando}.`;
  }
  return `${termino} ${resto}${prazo} Fale com o suporte para ativar a assinatura.`;
}

// ---- Banner de dias restantes do teste ----
/** Limiares (dias que faltam): até 3 = urgente; até 7 = atenção; acima disso = informativo. */
export const LIMIAR_URGENTE = 3;
export const LIMIAR_ATENCAO = 7;
export type NivelBanner = "info" | "atencao" | "urgente";

export function nivelDoBanner(diasParaFim: number): NivelBanner {
  if (diasParaFim <= LIMIAR_URGENTE) return "urgente";
  if (diasParaFim <= LIMIAR_ATENCAO) return "atencao";
  return "info";
}
/** Só os níveis informativo e de atenção podem ser dispensados no dia; o urgente fica sempre visível. */
export const podeDispensarBanner = (nivel: NivelBanner): boolean => nivel !== "urgente";

export function textoBannerTeste(diasParaFim: number): string {
  if (diasParaFim <= 0) return "Seu teste grátis termina hoje";
  if (diasParaFim === 1) return "Seu teste grátis termina amanhã";
  return `Seu teste grátis termina em ${diasParaFim} dias`;
}
export const BANNER_CONVITE = "Para continuar usando depois disso, fale com o suporte:";
export const BANNER_DISPENSAR = "Dispensar aviso de hoje";

// ---- Equipe: limite de usuários e convites ----
export function mensagemLimiteDeUsuarios(nomePlano: string, limite: number): string {
  return `Limite de usuários do plano atingido. O plano ${nomePlano} permite ${limite} ${limite === 1 ? "usuário" : "usuários"}, contando os convites pendentes. Para convidar mais alguém, desative um usuário, exclua um convite pendente ou fale com o suporte para trocar de plano.`;
}
export const CONVITE_NAO_ENCONTRADO = "Não encontramos este convite.";
export const CONVITE_JA_ACEITO = "Este convite já foi aceito e não pode ser excluído. Se for o caso, desative o usuário.";
export const conviteExcluidoAviso = (email: string) => `Convite de ${email} excluído.`;
export const CONVITE_CONFIRMAR_EXCLUSAO = "O link enviado deixa de funcionar e a vaga volta a ficar livre.";
