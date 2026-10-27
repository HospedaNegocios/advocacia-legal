import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { Botao } from "./Botao";

const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Diálogo modal: prende o foco, fecha com Esc ou clique no fundo e devolve o foco a quem abriu. */
export function Modal({ aberto, aoFechar, titulo, descricao, children }: { aberto: boolean; aoFechar: () => void; titulo: string; descricao?: string | undefined; children: ReactNode }) {
  const idTitulo = useId();
  const idDescricao = useId();
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const anterior = document.activeElement as HTMLElement | null;
    const rolagem = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const primeiro = caixa.current?.querySelector<HTMLElement>("input, select, textarea") ?? caixa.current?.querySelector<HTMLElement>(FOCAVEIS);
    primeiro?.focus();
    return () => {
      document.body.style.overflow = rolagem;
      anterior?.focus();
    };
  }, [aberto]);

  if (!aberto) return null;

  const aoTeclar = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      aoFechar();
      return;
    }
    if (e.key !== "Tab" || !caixa.current) return;
    const itens = Array.from(caixa.current.querySelectorAll<HTMLElement>(FOCAVEIS));
    const primeiro = itens[0];
    const ultimo = itens[itens.length - 1];
    if (!primeiro || !ultimo) return;
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  };

  return createPortal(
    <div
      className="modal-fundo"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) aoFechar();
      }}
    >
      <div ref={caixa} className="modal" role="dialog" aria-modal="true" aria-labelledby={idTitulo} aria-describedby={descricao ? idDescricao : undefined} onKeyDown={aoTeclar}>
        <div className="modal-topo">
          <div>
            <h2 id={idTitulo}>{titulo}</h2>
            {descricao && <p id={idDescricao}>{descricao}</p>}
          </div>
          <Botao variante="fantasma" tamanho="pequeno" somenteIcone aria-label="Fechar" onClick={aoFechar}>
            <X size={18} aria-hidden="true" />
          </Botao>
        </div>
        <div className="modal-corpo">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
