import { useRef, useState } from "react";
import { Dica, QuadroGrafico, escalaBonita, formatarEixo, formatarNumero, posicaoDe, useLargura } from "./comum";
import type { PosicaoDica } from "./comum";

export interface DadoBarra {
  chave: string;
  rotulo: string;
  valor: number;
  /** Só use cor própria para ORDINAL (ex.: planos Individual<Equipe<Sociedade). Barras nominais usam sempre a série 1. */
  cor?: string | undefined;
}

interface Props {
  titulo: string;
  subtitulo?: string | undefined;
  dados: DadoBarra[];
  orientacao?: "horizontal" | "vertical";
  /** Nome da medida, usado no tooltip e na tabela. Ex.: "Escritórios". */
  medida: string;
  /** Nome da coluna de categorias na tabela. Ex.: "Plano". */
  categoria: string;
  altura?: number;
}

const COR_PADRAO = "var(--serie-1)";

/** Gráfico de barras. Uma série só: sem legenda (o título já diz o que é). Barras finas (máx. 24px), canto externo de 4px. */
export function Barras({ titulo, subtitulo, dados, orientacao = "horizontal", medida, categoria, altura = 220 }: Props) {
  const total = dados.reduce((s, d) => s + d.valor, 0);
  const resumo = `${titulo}. ${dados.map((d) => `${d.rotulo}: ${formatarNumero(d.valor)}`).join("; ")}. Total: ${formatarNumero(total)}.`;
  const tabela = { colunas: [categoria, medida], linhas: dados.map((d) => [d.rotulo, d.valor] as (string | number)[]) };
  return (
    <QuadroGrafico titulo={titulo} subtitulo={subtitulo} resumo={resumo} tabela={tabela}>
      {orientacao === "horizontal" ? <Horizontais dados={dados} medida={medida} /> : <Verticais dados={dados} medida={medida} altura={altura} />}
    </QuadroGrafico>
  );
}

function Horizontais({ dados, medida }: { dados: DadoBarra[]; medida: string }) {
  const area = useRef<HTMLDivElement>(null);
  const [dica, setDica] = useState<PosicaoDica | null>(null);
  const [ativa, setAtiva] = useState<string | null>(null);
  const maximo = Math.max(1, ...dados.map((d) => d.valor));
  const mostrar = (alvo: Element, d: DadoBarra) => {
    setAtiva(d.chave);
    setDica(posicaoDe(area.current, alvo, { titulo: d.rotulo, linhas: [{ cor: d.cor ?? COR_PADRAO, rotulo: medida, valor: formatarNumero(d.valor) }] }));
  };
  const esconder = () => {
    setAtiva(null);
    setDica(null);
  };
  return (
    <div className="grafico-area" ref={area} data-tem-ativo={ativa !== null}>
      <ul className="barras-h">
        {dados.map((d) => (
          <li
            key={d.chave}
            className="barra-h"
            tabIndex={0}
            aria-label={`${d.rotulo}: ${formatarNumero(d.valor)}`}
            onPointerEnter={(e) => mostrar(e.currentTarget.querySelector(".barra-h-trilho") ?? e.currentTarget, d)}
            onPointerLeave={esconder}
            onFocus={(e) => mostrar(e.currentTarget.querySelector(".barra-h-trilho") ?? e.currentTarget, d)}
            onBlur={esconder}
          >
            <span className="barra-h-rotulo">{d.rotulo}</span>
            <span className="barra-h-trilho">
              <span className="barra-h-marca" style={{ width: `calc(${(d.valor / maximo) * 100}% * 0.86)`, background: d.cor ?? COR_PADRAO, minWidth: d.valor > 0 ? 4 : 0 }} />
              <span className="barra-h-valor">{formatarNumero(d.valor)}</span>
            </span>
          </li>
        ))}
      </ul>
      <Dica pos={dica} />
    </div>
  );
}

function Verticais({ dados, medida, altura }: { dados: DadoBarra[]; medida: string; altura: number }) {
  const area = useRef<HTMLDivElement>(null);
  const largura = useLargura(area);
  const [dica, setDica] = useState<PosicaoDica | null>(null);
  const [ativa, setAtiva] = useState<string | null>(null);
  const margem = { topo: 20, direita: 8, base: 28, esquerda: 34 };
  const w = Math.max(160, largura);
  const areaW = w - margem.esquerda - margem.direita;
  const areaH = altura - margem.topo - margem.base;
  const maximo = Math.max(0, ...dados.map((d) => d.valor));
  const { teto, ticks } = escalaBonita(maximo);
  const y = (v: number) => margem.topo + areaH - (v / teto) * areaH;
  const faixa = areaW / Math.max(1, dados.length);
  const largBarra = Math.min(24, faixa * 0.6);
  const rotularTodas = dados.length <= 8;
  const iMax = dados.findIndex((d) => d.valor === maximo);

  const mostrar = (alvo: Element, d: DadoBarra) => {
    setAtiva(d.chave);
    setDica(posicaoDe(area.current, alvo, { titulo: d.rotulo, linhas: [{ cor: d.cor ?? COR_PADRAO, rotulo: medida, valor: formatarNumero(d.valor) }] }));
  };
  const esconder = () => {
    setAtiva(null);
    setDica(null);
  };

  return (
    <div className="grafico-area" ref={area} data-tem-ativo={ativa !== null}>
      <svg width={w} height={altura} role="group" aria-label="Barras verticais">
        {ticks.map((t) => (
          <g key={t}>
            <line className={t === 0 ? "grafico-eixo" : "grafico-grade"} x1={margem.esquerda} x2={w - margem.direita} y1={y(t)} y2={y(t)} />
            <text className="grafico-texto" x={margem.esquerda - 8} y={y(t)} textAnchor="end" dominantBaseline="middle">
              {formatarEixo(t)}
            </text>
          </g>
        ))}
        {dados.map((d, i) => {
          const cx = margem.esquerda + faixa * i + faixa / 2;
          const topo = y(d.valor);
          const h = Math.max(0, margem.topo + areaH - topo);
          const r = Math.min(4, h, largBarra / 2);
          const x0 = cx - largBarra / 2;
          const x1 = cx + largBarra / 2;
          const base = margem.topo + areaH;
          const caminho = h > 0 ? `M${x0},${base} V${topo + r} Q${x0},${topo} ${x0 + r},${topo} H${x1 - r} Q${x1},${topo} ${x1},${topo + r} V${base} Z` : "";
          return (
            <g key={d.chave} className="marca-grafico" data-ativo={ativa === d.chave} tabIndex={0} role="img" aria-label={`${d.rotulo}: ${formatarNumero(d.valor)}`} onFocus={(e) => mostrar(e.currentTarget.querySelector("path, rect") ?? e.currentTarget, d)} onBlur={esconder} onPointerEnter={(e) => mostrar(e.currentTarget.querySelector("path") ?? e.currentTarget, d)} onPointerLeave={esconder}>
              <rect x={cx - faixa / 2} y={margem.topo} width={faixa} height={areaH + margem.base} fill="transparent" />
              {caminho && <path d={caminho} style={{ fill: d.cor ?? COR_PADRAO }} />}
              {(rotularTodas || i === iMax) && d.valor > 0 && (
                <text className="grafico-texto-forte" x={cx} y={topo - 6} textAnchor="middle">
                  {formatarNumero(d.valor)}
                </text>
              )}
              <text className="grafico-texto" x={cx} y={altura - 8} textAnchor="middle">
                {d.rotulo}
              </text>
            </g>
          );
        })}
      </svg>
      <Dica pos={dica} />
    </div>
  );
}
