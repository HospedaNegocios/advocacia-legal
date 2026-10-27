import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ErroApi, api } from "./api";
import type { Eu } from "./api";

interface Estado {
  carregando: boolean;
  eu: Eu | null;
  recarregar: () => Promise<void>;
  sair: () => Promise<void>;
}

const Contexto = createContext<Estado | null>(null);

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [eu, setEu] = useState<Eu | null>(null);

  const recarregar = useCallback(async () => {
    try {
      setEu(await api<Eu>("GET", "/api/eu"));
    } catch (e) {
      if (e instanceof ErroApi && e.status === 401) setEu(null);
    } finally {
      setCarregando(false);
    }
  }, []);

  const sair = useCallback(async () => {
    try {
      await api("POST", "/api/auth/logout");
    } finally {
      setEu(null);
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  return <Contexto.Provider value={{ carregando, eu, recarregar, sair }}>{children}</Contexto.Provider>;
}

export function useSessao(): Estado {
  const c = useContext(Contexto);
  if (!c) throw new Error("useSessao fora do ProvedorSessao");
  return c;
}
