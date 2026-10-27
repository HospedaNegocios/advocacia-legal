import { CircleAlert } from "lucide-react";
import { useId } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

interface PropsCampo {
  rotulo: string;
  ajuda?: string | undefined;
  erro?: string | undefined;
}

function Moldura({ id, rotulo, ajuda, erro, children }: PropsCampo & { id: string; children: ReactNode }) {
  return (
    <div className="campo">
      <label className="campo-rotulo" htmlFor={id}>
        {rotulo}
      </label>
      {children}
      {ajuda && !erro && (
        <p className="campo-ajuda" id={`${id}-ajuda`}>
          {ajuda}
        </p>
      )}
      {erro && (
        <p className="campo-erro" id={`${id}-erro`} role="alert">
          <CircleAlert size={14} aria-hidden="true" style={{ marginTop: 2, flex: "none" }} />
          {erro}
        </p>
      )}
    </div>
  );
}

function descritoPor(id: string, ajuda?: string, erro?: string): string | undefined {
  if (erro) return `${id}-erro`;
  if (ajuda) return `${id}-ajuda`;
  return undefined;
}

export interface PropsEntrada extends PropsCampo, Omit<InputHTMLAttributes<HTMLInputElement>, "className"> {
  codigo?: boolean;
}
/** Campo de texto com rótulo e mensagem de erro ligados por aria. */
export function Entrada({ rotulo, ajuda, erro, codigo, ...resto }: PropsEntrada) {
  const id = useId();
  return (
    <Moldura id={id} rotulo={rotulo} ajuda={ajuda} erro={erro}>
      <input {...resto} id={id} className={`entrada${codigo ? " entrada-codigo" : ""}`} aria-invalid={erro ? true : undefined} aria-describedby={descritoPor(id, ajuda, erro)} />
    </Moldura>
  );
}

export interface PropsSelecao extends PropsCampo, Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> {
  children: ReactNode;
}
export function Selecao({ rotulo, ajuda, erro, children, ...resto }: PropsSelecao) {
  const id = useId();
  return (
    <Moldura id={id} rotulo={rotulo} ajuda={ajuda} erro={erro}>
      <select {...resto} id={id} className="entrada" aria-invalid={erro ? true : undefined} aria-describedby={descritoPor(id, ajuda, erro)}>
        {children}
      </select>
    </Moldura>
  );
}

/** Seleção compacta para dentro de tabelas (o rótulo vai em `aria-label`). */
export function SelecaoCompacta(props: Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> & { "aria-label": string }) {
  return <select {...props} className="entrada entrada-compacta" />;
}

export function CampoMarcar({ children, ...resto }: Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "type"> & { children: ReactNode }) {
  return (
    <label className="campo-marcar">
      <input {...resto} type="checkbox" />
      <span>{children}</span>
    </label>
  );
}

export function Formulario({ aoEnviar, children }: { aoEnviar: () => void; children: ReactNode }) {
  return (
    <form
      className="formulario"
      onSubmit={(e) => {
        e.preventDefault();
        aoEnviar();
      }}
    >
      {children}
    </form>
  );
}
