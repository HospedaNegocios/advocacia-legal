import { CircleCheck, CircleX, CirclePause, FlaskConical } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ROTULO_STATUS } from "../api";
import type { Status } from "../api";

export type TomSelo = "neutro" | "bom" | "aviso" | "critico" | "info";

/** Selo genérico. `icone` é obrigatório: o estado nunca é comunicado só por cor. */
export function Selo({ tom = "neutro", icone: Icone, children }: { tom?: TomSelo; icone: LucideIcon; children: ReactNode }) {
  return (
    <span className="selo" data-tom={tom}>
      <Icone size={14} aria-hidden="true" />
      {children}
    </span>
  );
}

const SITUACAO: Record<Status, { tom: TomSelo; icone: LucideIcon }> = {
  teste: { tom: "info", icone: FlaskConical },
  ativo: { tom: "bom", icone: CircleCheck },
  suspenso: { tom: "aviso", icone: CirclePause },
  cancelado: { tom: "critico", icone: CircleX },
};
export { SITUACAO };

/** Situação do escritório: teste, ativo, suspenso ou cancelado (ícone + texto). */
export function SeloSituacao({ status }: { status: Status }) {
  const { tom, icone } = SITUACAO[status];
  return (
    <Selo tom={tom} icone={icone}>
      {ROTULO_STATUS[status]}
    </Selo>
  );
}
