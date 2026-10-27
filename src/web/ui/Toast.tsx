import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Botao } from "./Botao";

type TomToast = "ok" | "erro" | "info";
interface ItemToast {
  id: number;
  tom: TomToast;
  texto: string;
}
interface Estado {
  avisar: (texto: string, tom?: TomToast) => void;
}
const Contexto = createContext<Estado | null>(null);
const ICONE = { ok: CircleCheck, erro: CircleAlert, info: Info };

export function ProvedorToast({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<ItemToast[]>([]);
  const proximo = useRef(1);
  const fechar = useCallback((id: number) => setItens((l) => l.filter((i) => i.id !== id)), []);
  const avisar = useCallback(
    (texto: string, tom: TomToast = "ok") => {
      const id = proximo.current++;
      setItens((l) => [...l.slice(-3), { id, tom, texto }]);
      window.setTimeout(() => fechar(id), tom === "erro" ? 9000 : 5000);
    },
    [fechar],
  );
  return (
    <Contexto.Provider value={{ avisar }}>
      {children}
      <div className="toasts" role="region" aria-label="Notificações" aria-live="polite">
        {itens.map((i) => {
          const Icone = ICONE[i.tom];
          return (
            <div key={i.id} className="toast" data-tom={i.tom} role={i.tom === "erro" ? "alert" : "status"}>
              <Icone size={18} className="toast-icone" aria-hidden="true" />
              <span className="toast-texto">{i.texto}</span>
              <Botao variante="fantasma" tamanho="pequeno" somenteIcone aria-label="Dispensar notificação" onClick={() => fechar(i.id)}>
                <X size={16} aria-hidden="true" />
              </Botao>
            </div>
          );
        })}
      </div>
    </Contexto.Provider>
  );
}

export function useToast(): Estado {
  const c = useContext(Contexto);
  if (!c) throw new Error("useToast fora do ProvedorToast");
  return c;
}
