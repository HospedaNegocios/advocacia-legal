import type { ReactNode } from "react";

export function Cartao({ titulo, subtitulo, acoes, semPadding, children, rotuloId }: { titulo?: string; subtitulo?: string; acoes?: ReactNode; semPadding?: boolean; children?: ReactNode; rotuloId?: string }) {
  return (
    <section className={`cartao${semPadding ? " cartao-sem-padding" : ""}`} aria-labelledby={titulo ? rotuloId : undefined}>
      {titulo && (
        <div className="cartao-topo">
          <div>
            <h2 id={rotuloId}>{titulo}</h2>
            {subtitulo && <p className="cartao-sub">{subtitulo}</p>}
          </div>
          {acoes}
        </div>
      )}
      <div className="cartao-corpo" style={titulo && semPadding ? { paddingTop: "var(--e-4)" } : undefined}>
        {children}
      </div>
    </section>
  );
}
