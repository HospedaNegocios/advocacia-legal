import { Scale } from "lucide-react";

/**
 * Marca advocacia.legal. COMPONENTE PROVISÓRIO: quando houver um logotipo definitivo, troque só este arquivo.
 * O texto da marca usa sempre a cor cheia do contexto (herdada), peso 700, sem opacidade.
 * (única do produto: não há personalização por escritório).
 */
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
