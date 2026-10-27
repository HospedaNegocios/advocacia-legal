import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export type PreferenciaTema = "sistema" | "claro" | "escuro";
const CHAVE = "tema";

function lerSalvo(): PreferenciaTema {
  try {
    const v = localStorage.getItem(CHAVE);
    if (v === "claro" || v === "escuro") return v;
  } catch {
    /* armazenamento indisponível: usa o tema do sistema */
  }
  return "sistema";
}

function aplicar(p: PreferenciaTema): void {
  const raiz = document.documentElement;
  if (p === "sistema") raiz.removeAttribute("data-tema");
  else raiz.setAttribute("data-tema", p);
}

interface Estado {
  preferencia: PreferenciaTema;
  definir: (p: PreferenciaTema) => void;
}
const Contexto = createContext<Estado | null>(null);

export function ProvedorTema({ children }: { children: ReactNode }) {
  const [preferencia, setPreferencia] = useState<PreferenciaTema>(lerSalvo);
  useEffect(() => aplicar(preferencia), [preferencia]);
  const definir = useCallback((p: PreferenciaTema) => {
    setPreferencia(p);
    try {
      if (p === "sistema") localStorage.removeItem(CHAVE);
      else localStorage.setItem(CHAVE, p);
    } catch {
      /* não salvar é aceitável: vale só nesta visita */
    }
  }, []);
  return <Contexto.Provider value={{ preferencia, definir }}>{children}</Contexto.Provider>;
}

export function useTema(): Estado {
  const c = useContext(Contexto);
  if (!c) throw new Error("useTema fora do ProvedorTema");
  return c;
}
