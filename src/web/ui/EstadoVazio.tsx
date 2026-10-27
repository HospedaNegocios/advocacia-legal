import type { LucideIcon } from "lucide-react";
import { Inbox, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

export function EstadoVazio({ icone: Icone = Inbox, titulo, children, acao, compacto, tom }: { icone?: LucideIcon; titulo: string; children?: ReactNode; acao?: ReactNode; compacto?: boolean; tom?: "erro" }) {
  return (
    <div className={`vazio${compacto ? " vazio-compacto" : ""}`} data-tom={tom}>
      <span className="vazio-icone">
        <Icone size={22} aria-hidden="true" />
      </span>
      <h3>{titulo}</h3>
      {children && <p>{children}</p>}
      {acao}
    </div>
  );
}

/** Estado de erro de carregamento, com ação de tentar de novo. */
export function EstadoErro({ titulo = "Não foi possível carregar", children, acao }: { titulo?: string; children?: ReactNode; acao?: ReactNode }) {
  return (
    <EstadoVazio icone={TriangleAlert} titulo={titulo} tom="erro" {...(acao ? { acao } : {})}>
      {children}
    </EstadoVazio>
  );
}
