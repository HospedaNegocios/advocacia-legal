import { Scale } from "lucide-react";

/** Marca advocacia.legal (única do produto: não há personalização por escritório). */
export function Marca({ textoVisivel = true, tamanhoSelo = 20 }: { textoVisivel?: boolean; tamanhoSelo?: number }) {
  return (
    <>
      <span className="marca-selo" aria-hidden="true">
        <Scale size={tamanhoSelo} />
      </span>
      {textoVisivel ? (
        <span className="marca-texto">
          advocacia<span className="ponto">.</span>legal
        </span>
      ) : (
        <span className="so-leitor">advocacia.legal</span>
      )}
    </>
  );
}
