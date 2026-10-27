import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "../roteador";

export interface Migalha {
  rotulo: string;
  para?: string;
}

export function CabecalhoPagina({ titulo, descricao, migalhas, acoes }: { titulo: string; descricao?: string | undefined; migalhas?: Migalha[]; acoes?: ReactNode }) {
  return (
    <header className="cabecalho-pagina">
      <div>
        {migalhas && migalhas.length > 0 && (
          <nav className="migalhas" aria-label="Você está em">
            <ol>
              {migalhas.map((m, i) => {
                const ultima = i === migalhas.length - 1;
                return (
                  <li key={m.rotulo}>
                    {m.para && !ultima ? <Link para={m.para}>{m.rotulo}</Link> : <span aria-current={ultima ? "page" : undefined}>{m.rotulo}</span>}
                    {!ultima && <ChevronRight size={14} aria-hidden="true" />}
                  </li>
                );
              })}
            </ol>
          </nav>
        )}
        <h1 tabIndex={-1} id="titulo-pagina">
          {titulo}
        </h1>
        {descricao && <p>{descricao}</p>}
      </div>
      {acoes && <div className="cabecalho-acoes">{acoes}</div>}
    </header>
  );
}
