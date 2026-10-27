import type { CSSProperties } from "react";

/** Bloco cinza animado enquanto o conteúdo carrega. Decorativo (aria-hidden). */
export function Esqueleto({ largura = "100%", altura = 16, estilo }: { largura?: string | number; altura?: string | number; estilo?: CSSProperties }) {
  return <span className="esqueleto" aria-hidden="true" style={{ width: largura, height: altura, ...estilo }} />;
}

export function EsqueletoKpi() {
  return (
    <div className="cartao kpi" role="status" aria-label="Carregando indicador">
      <Esqueleto largura="55%" altura={14} />
      <Esqueleto largura="35%" altura={34} />
      <Esqueleto largura="45%" altura={12} />
    </div>
  );
}

export function EsqueletoLinhas({ linhas = 4 }: { linhas?: number }) {
  return (
    <div role="status" aria-label="Carregando" style={{ display: "grid", gap: "var(--e-3)", padding: "var(--e-5)" }}>
      {Array.from({ length: linhas }, (_, i) => (
        <Esqueleto key={i} altura={18} largura={i % 2 ? "82%" : "100%"} />
      ))}
    </div>
  );
}
