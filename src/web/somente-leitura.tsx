import { createContext, useContext } from "react";

/**
 * Verdadeiro quando o escritório está em SOMENTE LEITURA (teste vencido há até 10 dias; docs/ASSINATURA.md).
 * Os botões de gravar (principal, perigo e envio de formulário) ficam desativados com a explicação.
 * É só conforto da tela: quem recusa de verdade é o servidor (HTTP 402).
 */
const Contexto = createContext(false);
export const ProvedorSomenteLeitura = Contexto.Provider;
export const useSomenteLeitura = () => useContext(Contexto);

export const TEXTO_SOMENTE_LEITURA = "Somente leitura: o período de teste terminou. Fale com o suporte para ativar a assinatura.";
