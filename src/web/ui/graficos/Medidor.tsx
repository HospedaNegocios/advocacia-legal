import { useId } from "react";
import { formatarNumero } from "./comum";

interface Props {
  rotulo: string;
  valor: number;
  maximo: number;
  /** Texto à direita (padrão: "valor de máximo"). */
  texto?: string;
  /** Gravidade da barra. Por padrão é a cor da série 1; use só quando houver limite real. */
  tom?: "padrao" | "bom" | "aviso" | "critico";
}

/** Medidor de uma razão contra um limite. Trilho = tom mais claro da própria cor do preenchimento. */
export function Medidor({ rotulo, valor, maximo, texto, tom = "padrao" }: Props) {
  const id = useId();
  const pct = maximo > 0 ? Math.min(100, Math.max(0, (valor / maximo) * 100)) : 0;
  return (
    <div className="medidor" data-tom={tom === "padrao" ? undefined : tom}>
      <div className="medidor-cabeca">
        <span id={id}>{rotulo}</span>
        <b>{texto ?? `${formatarNumero(valor)} de ${formatarNumero(maximo)}`}</b>
      </div>
      <div className="medidor-trilho" role="progressbar" aria-labelledby={id} aria-valuemin={0} aria-valuemax={maximo} aria-valuenow={valor} aria-valuetext={texto ?? `${formatarNumero(valor)} de ${formatarNumero(maximo)}`}>
        <div className="medidor-preenche" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
