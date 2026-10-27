import { useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Dica, QuadroGrafico, formatarNumero, posicaoDe, useLargura } from "./comum";
import type { PosicaoDica } from "./comum";

export interface Segmento {
  chave: string;
  rotulo: string;
  valor: number;
  cor: string;
  /** Ícone da legenda. Obrigatório quando a cor significa um estado (bom, aviso, crítico). */
  icone?: LucideIcon | undefined;
  /** Texto escuro dentro do segmento (necessário sobre amarelo/aviso). */
  textoEscuro?: boolean | undefined;
}

interface Props {
  titulo: string;
  subtitulo?: string | undefined;
  segmentos: Segmento[];
  medida: string;
  categoria: string;
}

/**
 * Parte do todo: barra horizontal empilhada (preferida à pizza), com 2px de separação entre segmentos.
 * A legenda embaixo traz ícone, rótulo, valor e porcentagem; assim nada depende só da cor.
 */
export function Empilhada({ titulo, subtitulo, segmentos, medida, categoria }: Props) {
  const area = useRef<HTMLDivElement>(null);
  const largura = useLargura(area);
  const [dica, setDica] = useState<PosicaoDica | null>(null);
  const total = segmentos.reduce((s, x) => s + x.valor, 0);
  const visiveis = segmentos.filter((s) => s.valor > 0);
  const util = Math.max(0, largura - 2 * Math.max(0, visiveis.length - 1));
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

  const resumo = `${titulo}. Total: ${formatarNumero(total)}. ${segmentos.map((s) => `${s.rotulo}: ${formatarNumero(s.valor)} (${pct(s.valor)}%)`).join("; ")}.`;
  const tabela = { colunas: [categoria, medida, "Participação"], linhas: segmentos.map((s) => [s.rotulo, s.valor, `${pct(s.valor)}%`] as (string | number)[]) };
  const mostrar = (alvo: Element, s: Segmento) => setDica(posicaoDe(area.current, alvo, { titulo: s.rotulo, linhas: [{ cor: s.cor, rotulo: medida, valor: `${formatarNumero(s.valor)} (${pct(s.valor)}%)` }] }));

  return (
    <QuadroGrafico titulo={titulo} subtitulo={subtitulo} resumo={resumo} tabela={tabela}>
      <div className="grafico-area" ref={area}>
        {total === 0 ? (
          <div className="empilhada-vazia" aria-hidden="true" />
        ) : (
          <div className="empilhada" role="group" aria-label="Participação por segmento">
            {visiveis.map((s) => {
              const larg = (s.valor / total) * util;
              return (
                <button
                  type="button"
                  key={s.chave}
                  className="empilhada-seg"
                  style={{ flexGrow: s.valor, flexBasis: 0, background: s.cor }}
                  data-texto-escuro={s.textoEscuro ? "true" : undefined}
                  aria-label={`${s.rotulo}: ${formatarNumero(s.valor)} (${pct(s.valor)}%)`}
                  onPointerEnter={(e) => mostrar(e.currentTarget, s)}
                  onPointerLeave={() => setDica(null)}
                  onFocus={(e) => mostrar(e.currentTarget, s)}
                  onBlur={() => setDica(null)}
                >
                  {larg >= 30 ? formatarNumero(s.valor) : null}
                </button>
              );
            })}
          </div>
        )}
        <Dica pos={dica} />
      </div>
      <ul className="resumo-lista" aria-label="Legenda e valores">
        {segmentos.map((s) => {
          const Icone = s.icone;
          return (
            <li key={s.chave}>
              {Icone ? <Icone size={16} aria-hidden="true" style={{ color: s.cor, flex: "none" }} /> : <span className="legenda-chave" style={{ background: s.cor }} aria-hidden="true" />}
              <span>{s.rotulo}</span>
              <span className="resumo-valor">{formatarNumero(s.valor)}</span>
              <span className="resumo-pct">{pct(s.valor)}%</span>
            </li>
          );
        })}
      </ul>
    </QuadroGrafico>
  );
}
