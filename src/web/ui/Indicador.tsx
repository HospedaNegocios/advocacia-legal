import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { formatarNumero } from "./graficos/comum";

export interface Variacao {
  /** Diferença assinada (ex.: +3). */
  valor: number;
  /** Texto do período, obrigatório: "nos últimos 30 dias". */
  periodo: string;
  /** Se subir é bom (padrão). Define a cor; seta e texto sempre aparecem. */
  subirEhBom?: boolean;
}

/**
 * Indicador (KPI): rótulo, valor grande, variação com seta + texto e, opcionalmente, uma sparkline ou nota.
 */
export function Indicador({ rotulo, valor, icone: Icone, variacao, tendencia, nota, children }: { rotulo: string; valor: string | number; icone?: LucideIcon; variacao?: Variacao; tendencia?: ReactNode; nota?: string | undefined; children?: ReactNode }) {
  const texto = typeof valor === "number" ? formatarNumero(valor) : valor;
  let delta: ReactNode = null;
  if (variacao) {
    const { valor: v, periodo, subirEhBom = true } = variacao;
    const Seta = v > 0 ? ArrowUp : v < 0 ? ArrowDown : Minus;
    const tom = v === 0 ? undefined : (v > 0) === subirEhBom ? "bom" : "ruim";
    const sinal = v > 0 ? "+" : v < 0 ? "−" : "";
    delta = (
      <span className="kpi-delta" data-tom={tom}>
        <Seta size={14} aria-hidden="true" />
        {sinal}
        {formatarNumero(Math.abs(v))} {periodo}
      </span>
    );
  }
  return (
    <div className="cartao kpi">
      <div className="kpi-topo">
        <span>{rotulo}</span>
        {Icone && (
          <span className="kpi-icone">
            <Icone size={16} aria-hidden="true" />
          </span>
        )}
      </div>
      <div className={`kpi-valor${typeof valor === "string" && valor.length > 8 ? " kpi-valor-texto" : ""}`}>{texto}</div>
      {(delta || tendencia || nota) && (
        <div className="kpi-rodape">
          <div style={{ display: "grid", gap: 2 }}>
            {delta}
            {nota && <span className="kpi-nota">{nota}</span>}
          </div>
          {tendencia}
        </div>
      )}
      {children}
    </div>
  );
}
