import { Check } from "lucide-react";

/** Indicador de etapas (stepper). `atual` começa em 1. */
export function Passos({ etapas, atual }: { etapas: string[]; atual: number }) {
  return (
    <ol className="passos" aria-label={`Etapa ${atual} de ${etapas.length}`}>
      {etapas.map((e, i) => {
        const n = i + 1;
        const estado = n < atual ? "feito" : n === atual ? "atual" : "pendente";
        return (
          <li key={e} data-estado={estado} aria-current={estado === "atual" ? "step" : undefined}>
            <span className="passo-num">
              {estado === "feito" ? <Check size={14} aria-hidden="true" /> : <span aria-hidden="true">{n}.</span>}
              {e}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
