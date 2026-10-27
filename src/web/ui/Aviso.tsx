import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

export type TipoAviso = "erro" | "ok" | "info" | "atencao";
const ICONE = { erro: CircleAlert, ok: CircleCheck, info: Info, atencao: TriangleAlert };

/** Aviso em linha. Sempre com ícone + texto (cor nunca é a única pista). */
export function Aviso({ tipo = "erro", children }: { tipo?: TipoAviso; children: ReactNode }) {
  const Icone = ICONE[tipo];
  return (
    <p className={`aviso${tipo === "info" ? "" : ` aviso-${tipo}`}`} role={tipo === "erro" ? "alert" : "status"}>
      <Icone size={18} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
