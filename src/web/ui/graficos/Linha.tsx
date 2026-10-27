import { useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import { Dica, QuadroGrafico, escalaBonita, formatarEixo, formatarNumero, useLargura } from "./comum";
import type { ItemLegenda, PosicaoDica } from "./comum";

export interface SerieLinha {
  chave: string;
  rotulo: string;
  cor: string;
  valores: number[];
}

interface Props {
  titulo: string;
  subtitulo?: string | undefined;
  categorias: string[];
  /** Nome longo de cada ponto, para tooltip/tabela. Se omitido, usa `categorias`. */
  categoriasLongas?: string[] | undefined;
  series: SerieLinha[];
  /** Preenche a área sob a linha (10%). Recomendado só para 1 série. */
  area?: boolean;
  categoria: string;
  altura?: number;
}

/** Linha/área com cursor vertical que segue o ponteiro (ou as setas do teclado) e um tooltip com todas as séries. */
export function Linha({ titulo, subtitulo, categorias, categoriasLongas, series, area = false, categoria, altura = 220 }: Props) {
  const longas = categoriasLongas ?? categorias;
  const caixa = useRef<HTMLDivElement>(null);
  const largura = useLargura(caixa);
  const [indice, setIndice] = useState<number | null>(null);
  const margem = { topo: 16, direita: 16, base: 28, esquerda: 34 };
  const w = Math.max(200, largura);
  const areaW = w - margem.esquerda - margem.direita;
  const areaH = altura - margem.topo - margem.base;
  const n = categorias.length;
  const maximo = Math.max(0, ...series.flatMap((s) => s.valores));
  const { teto, ticks } = escalaBonita(maximo);
  const x = (i: number) => margem.esquerda + (n <= 1 ? areaW / 2 : (areaW * i) / (n - 1));
  const y = (v: number) => margem.topo + areaH - (v / teto) * areaH;
  const passoRotulo = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(areaW / 56))));

  const legenda: ItemLegenda[] = series.map((s) => ({ chave: s.chave, rotulo: s.rotulo, cor: s.cor, linha: true }));
  const resumo = `${titulo}. ${series.map((s) => `${s.rotulo}: de ${formatarNumero(s.valores[0] ?? 0)} em ${longas[0] ?? ""} para ${formatarNumero(s.valores[n - 1] ?? 0)} em ${longas[n - 1] ?? ""}, máximo ${formatarNumero(Math.max(0, ...s.valores))}`).join("; ")}.`;
  const tabela = { colunas: [categoria, ...series.map((s) => s.rotulo)], linhas: longas.map((c, i) => [c, ...series.map((s) => s.valores[i] ?? 0)] as (string | number)[]) };

  const moverPonteiro = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = n <= 1 ? 0 : Math.round((px / r.width) * (n - 1));
    setIndice(Math.min(n - 1, Math.max(0, i)));
  };
  const teclar = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") setIndice((i) => Math.min(n - 1, (i ?? -1) + 1));
    else if (e.key === "ArrowLeft") setIndice((i) => Math.max(0, (i ?? n) - 1));
    else if (e.key === "Home") setIndice(0);
    else if (e.key === "End") setIndice(n - 1);
    else if (e.key === "Escape") setIndice(null);
    else return;
    e.preventDefault();
  };

  const dica: PosicaoDica | null =
    indice === null
      ? null
      : {
          x: x(indice),
          y: margem.topo,
          conteudo: { titulo: longas[indice], linhas: series.map((s) => ({ cor: s.cor, rotulo: s.rotulo, valor: formatarNumero(s.valores[indice] ?? 0) })) },
        };

  return (
    <QuadroGrafico titulo={titulo} subtitulo={subtitulo} resumo={resumo} legenda={legenda} tabela={tabela}>
      <div className="grafico-area" ref={caixa}>
        <svg width={w} height={altura} role="group" aria-label={`${titulo}. Use as setas para ler cada ponto.`} tabIndex={0} onKeyDown={teclar} onBlur={() => setIndice(null)} style={{ touchAction: "pan-y" }}>
          {ticks.map((t) => (
            <g key={t}>
              <line className={t === 0 ? "grafico-eixo" : "grafico-grade"} x1={margem.esquerda} x2={w - margem.direita} y1={y(t)} y2={y(t)} />
              <text className="grafico-texto" x={margem.esquerda - 8} y={y(t)} textAnchor="end" dominantBaseline="middle">
                {formatarEixo(t)}
              </text>
            </g>
          ))}
          {categorias.map((c, i) =>
            i % passoRotulo === 0 || i === n - 1 ? (
              <text key={`${c}-${i}`} className="grafico-texto" x={x(i)} y={altura - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>
                {c}
              </text>
            ) : null,
          )}
          {series.map((s) => {
            const pontos = s.valores.map((v, i) => `${x(i)},${y(v)}`);
            const base = margem.topo + areaH;
            return (
              <g key={s.chave}>
                {area && n > 1 && <path d={`M${x(0)},${base} L${pontos.join(" L")} L${x(n - 1)},${base} Z`} style={{ fill: s.cor }} fillOpacity={0.1} />}
                {n > 1 && <polyline points={pontos.join(" ")} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" style={{ stroke: s.cor }} />}
                {indice === null && <circle cx={x(n - 1)} cy={y(s.valores[n - 1] ?? 0)} r={4} style={{ fill: s.cor, stroke: "var(--cor-superficie)" }} strokeWidth={2} />}
              </g>
            );
          })}
          {indice !== null && (
            <g>
              <line x1={x(indice)} x2={x(indice)} y1={margem.topo} y2={margem.topo + areaH} className="grafico-eixo" />
              {series.map((s) => (
                <circle key={s.chave} cx={x(indice)} cy={y(s.valores[indice] ?? 0)} r={4.5} style={{ fill: s.cor, stroke: "var(--cor-superficie)" }} strokeWidth={2} />
              ))}
            </g>
          )}
          <rect x={margem.esquerda} y={margem.topo} width={areaW} height={areaH + 4} fill="transparent" onPointerMove={moverPonteiro} onPointerDown={moverPonteiro} onPointerLeave={() => setIndice(null)} />
        </svg>
        <Dica pos={dica} />
      </div>
    </QuadroGrafico>
  );
}
