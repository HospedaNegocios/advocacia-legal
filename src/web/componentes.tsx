import { useState } from "react";
import type { FormEvent, ReactNode } from "react";

export function Cartao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <main className="cartao-central">
      <h1 className="marca">advocacia.legal</h1>
      <section className="cartao">
        <h2>{titulo}</h2>
        {children}
      </section>
    </main>
  );
}

export function Aviso({ tipo = "erro", children }: { tipo?: "erro" | "ok"; children: ReactNode }) {
  return (
    <p className={tipo === "erro" ? "aviso erro" : "aviso ok"} role={tipo === "erro" ? "alert" : "status"}>
      {children}
    </p>
  );
}

export function Formulario({ aoEnviar, children }: { aoEnviar: () => void; children: ReactNode }) {
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    aoEnviar();
  };
  return (
    <form onSubmit={enviar} className="formulario">
      {children}
    </form>
  );
}

export function CopiarLink({ link }: { link: string }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };
  return (
    <div className="link-copiavel">
      <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Link do convite" />
      <button type="button" onClick={copiar}>
        {copiado ? "Copiado!" : "Copiar link"}
      </button>
    </div>
  );
}
