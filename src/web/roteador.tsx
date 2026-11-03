import { useEffect, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";

// Roteador mínimo por History API (o servidor já devolve o index.html para qualquer caminho).

export function navegar(caminho: string, substituir = false): void {
  if (substituir) history.replaceState(null, "", caminho);
  else history.pushState(null, "", caminho);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function useCaminho(): string {
  const [caminho, setCaminho] = useState(window.location.pathname);
  useEffect(() => {
    const atualizar = () => setCaminho(window.location.pathname);
    window.addEventListener("popstate", atualizar);
    return () => window.removeEventListener("popstate", atualizar);
  }, []);
  return caminho;
}

export function Link({
  para,
  children,
  className,
  atual,
  aoNavegar,
}: {
  para: string;
  children: ReactNode;
  className?: string | undefined;
  atual?: boolean | undefined;
  aoNavegar?: (() => void) | undefined;
}) {
  const aoClicar = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navegar(para);
    aoNavegar?.();
  };
  return (
    <a href={para} onClick={aoClicar} className={className} aria-current={atual ? "page" : undefined}>
      {children}
    </a>
  );
}

/**
 * Atalho "criar novo": a página abre o seu formulário "novo" quando a URL traz `?novo=1` (ao carregar e quando já está aberta
 * e o usuário usa o botão "+" da barra inferior). O parâmetro é removido da URL logo depois de usado.
 */
export function useParametroNovo(caminho: string, abrir: () => void): void {
  const ref = useRef(abrir);
  ref.current = abrir;
  useEffect(() => {
    const checar = () => {
      // Só a página dona do caminho consome o parâmetro (a página anterior ainda está montada durante a navegação).
      if (window.location.pathname !== caminho) return;
      const p = new URLSearchParams(window.location.search);
      if (p.get("novo") !== "1") return;
      p.delete("novo");
      const resto = p.toString();
      history.replaceState(null, "", window.location.pathname + (resto ? `?${resto}` : ""));
      ref.current();
    };
    checar();
    window.addEventListener("popstate", checar);
    return () => window.removeEventListener("popstate", checar);
  }, [caminho]);
}
