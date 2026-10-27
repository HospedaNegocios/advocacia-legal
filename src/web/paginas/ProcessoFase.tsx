import { Archive, CirclePause, Gavel, Repeat, Scale } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Selo } from "../ui";
import type { Fase } from "./processos-comum";

const ICONE_FASE: Record<Fase, LucideIcon> = { Conhecimento: Scale, Recursal: Repeat, Execução: Gavel, Suspenso: CirclePause, Arquivado: Archive };

/** Fase do processo: ícone + texto (a fase nunca é comunicada só por cor). */
export function SeloFase({ fase }: { fase: Fase }) {
  return <Selo icone={ICONE_FASE[fase]}>{fase}</Selo>;
}
