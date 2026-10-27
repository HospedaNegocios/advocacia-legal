import { useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

export interface Aba {
  id: string;
  rotulo: string;
  conteudo: ReactNode;
}

/** Abas acessíveis: setas esquerda/direita, Home e End trocam de aba. */
export function Abas({ abas, inicial }: { abas: Aba[]; inicial?: string }) {
  const base = useId();
  const [ativa, setAtiva] = useState(inicial ?? abas[0]?.id ?? "");
  const botoes = useRef<Record<string, HTMLButtonElement | null>>({});

  const aoTeclar = (e: KeyboardEvent, indice: number) => {
    let novo = -1;
    if (e.key === "ArrowRight") novo = (indice + 1) % abas.length;
    else if (e.key === "ArrowLeft") novo = (indice - 1 + abas.length) % abas.length;
    else if (e.key === "Home") novo = 0;
    else if (e.key === "End") novo = abas.length - 1;
    const alvo = abas[novo];
    if (!alvo) return;
    e.preventDefault();
    setAtiva(alvo.id);
    botoes.current[alvo.id]?.focus();
  };

  const atual = abas.find((a) => a.id === ativa) ?? abas[0];
  return (
    <div>
      <div role="tablist" className="abas-lista" aria-label="Seções">
        {abas.map((a, i) => (
          <button
            key={a.id}
            ref={(el) => {
              botoes.current[a.id] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-aba-${a.id}`}
            aria-selected={a.id === atual?.id}
            aria-controls={`${base}-painel-${a.id}`}
            tabIndex={a.id === atual?.id ? 0 : -1}
            className="aba"
            onClick={() => setAtiva(a.id)}
            onKeyDown={(e) => aoTeclar(e, i)}
          >
            {a.rotulo}
          </button>
        ))}
      </div>
      {atual && (
        <div role="tabpanel" id={`${base}-painel-${atual.id}`} aria-labelledby={`${base}-aba-${atual.id}`} className="aba-painel">
          {atual.conteudo}
        </div>
      )}
    </div>
  );
}
