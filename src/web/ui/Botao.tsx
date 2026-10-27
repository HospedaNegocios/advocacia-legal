import { LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type VarianteBotao = "primario" | "secundario" | "fantasma" | "perigo";
export type TamanhoBotao = "pequeno" | "medio" | "grande";

export interface PropsBotao extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  variante?: VarianteBotao;
  tamanho?: TamanhoBotao;
  carregando?: boolean;
  bloco?: boolean;
  /** Botão só com ícone: precisa de `aria-label`. */
  somenteIcone?: boolean;
  children?: ReactNode;
}

export function classeBotao(variante: VarianteBotao, tamanho: TamanhoBotao, bloco: boolean, somenteIcone: boolean): string {
  const v = variante === "primario" ? "" : ` btn-${variante}`;
  const t = tamanho === "pequeno" ? " btn-pequeno" : tamanho === "grande" ? " btn-grande" : "";
  return `btn${v}${t}${bloco ? " btn-bloco" : ""}${somenteIcone ? " btn-icone" : ""}`;
}

export function Botao({ variante = "primario", tamanho = "medio", carregando = false, bloco = false, somenteIcone = false, type = "button", disabled, children, ...resto }: PropsBotao) {
  return (
    <button {...resto} type={type} className={classeBotao(variante, tamanho, bloco, somenteIcone)} disabled={disabled || carregando} aria-busy={carregando || undefined}>
      {carregando && <LoaderCircle size={16} className="girando" aria-hidden="true" />}
      {children}
    </button>
  );
}
