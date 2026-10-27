import { useEffect, useState } from "react";
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

export function Link({ para, children }: { para: string; children: ReactNode }) {
  const aoClicar = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navegar(para);
  };
  return (
    <a href={para} onClick={aoClicar}>
      {children}
    </a>
  );
}
