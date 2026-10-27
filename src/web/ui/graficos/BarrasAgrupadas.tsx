import { useRef, useState } from "react";
import { Dica, QuadroGrafico, escalaBonita, formatarEixo, posicaoDe, useLargura } from "./comum";
import type { PosicaoDica } from "./comum";

export interface SerieAgrupada {
  chave: string;
  nome: string;
  /** Cor da série (token), ex.: "var(--serie-1)". Ordem fixa: nunca reordene nem recolora. */
  cor: string;
  valores: number[];
}

interface Props {
  titulo: string;
  subtitulo?: string | undefined;
  /** Uma categoria por grupo de barras (ex.: meses), na ordem de exibição. */
  categorias: { chave: string; rotulo: string }[];
  /** 2 a 3 séries; com 2 ou mais a legenda é obrigatória (já vem ligada). */
  series: SerieAgrupada[];
  /** Formata um valor para tooltip, rótulo e tabela (ex.: centavos -> "R$ 1.234,56"). */
  formatar: (valor: number) => string;
  /** Formata os números do eixo vertical (padrão: número compacto). */
  formatarEixoY?: (valor: number) => string;
  /** Nome da coluna de categorias na tabela. Ex.: "Mês". */
  nomeCategoria: string;
  altura?: number;
}

/**
 * Barras agrupadas (várias séries lado a lado em cada categoria), na vertical. Uma escala só (nunca eixo duplo).
 * Legenda sempre visível, rótulo com o valor da maior barra, tooltip por hover e foco de teclado e "ver como tabela".
 * Barras finas (máx. 20px cada), canto externo de 4px.
 */
export function BarrasAgrupadas({ titulo, subtitulo, categorias, series, formatar, formatarEixoY = formatarEixo, nomeCategoria, altura = 240 }: Props) {
  const area = useRef<HTMLDivElement>(null);
  const largura = useLargura(area);
  const [dica, setDica] = useState<PosicaoDica | null>(null);
  const [ativa, setAtiva] = useState<string | null>(null);

  const margem = { topo: 22, direita: 8, base: 28, esquerda: 40 };
  const w = Math.max(200, largura);
  const areaW = w - margem.esquerda - margem.direita;
  const areaH = altura - margem.topo - margem.base;
  const maximo = Math.max(0, ...series.flatMap((s) => s.valores));
  const { teto, ticks } = escalaBonita(maximo);
  const y = (v: number) => margem.topo + areaH - (v / teto) * areaH;
  const faixa = areaW / Math.max(1, categorias.length);
  const largBarra = Math.min(20, (faixa * 0.8) / series.length);
  const folga = 2;
  const grupoW = largBarra * series.length + folga * (series.length - 1);
  const base = margem.topo + areaH;

  const resumo = `${titulo}. ${categorias.map((c, i) => `${c.rotulo}: ${series.map((s) => `${s.nome} ${formatar(s.valores[i] ?? 0)}`).join(", ")}`).join("; ")}.`;
  const tabela = { colunas: [nomeCategoria, ...series.map((s) => s.nome)], linhas: categorias.map((c, i) => [c.rotulo, ...series.map((s) => formatar(s.valores[i] ?? 0))]) };
  const legenda = series.map((s) => ({ chave: s.chave, rotulo: s.nome, cor: s.cor }));

  const mostrar = (alvo: Element, indice: number) => {
    const c = categorias[indice];
    if (!c) return;
    setAtiva(c.chave);
    setDica(posicaoDe(area.current, alvo, { titulo: c.rotulo, linhas: series.map((s) => ({ cor: s.cor, rotulo: s.nome, valor: formatar(s.valores[indice] ?? 0) })) }));
  };
  const esconder = () => {
    setAtiva(null);
    setDica(null);
  };

  // Rótulo de valor só na maior barra de todas (as demais ficam no tooltip e na tabela).
  let maior = { i: -1, j: -1 };
  series.forEach((s, j) => s.valores.forEach((v, i) => v > 0 && v === maximo && maior.i < 0 && (maior = { i, j })));

  return (
    <QuadroGrafico titulo={titulo} subtitulo={subtitulo} resumo={resumo} legenda={legenda} tabela={tabela}>
      <div className="grafico-area" ref={area} data-tem-ativo={ativa !== null}>
        <svg width={w} height={altura} role="group" aria-label="Barras agrupadas">
          {ticks.map((t) => (
            <g key={t}>
              <line className={t === 0 ? "grafico-eixo" : "grafico-grade"} x1={margem.esquerda} x2={w - margem.direita} y1={y(t)} y2={y(t)} />
              <text className="grafico-texto" x={margem.esquerda - 8} y={y(t)} textAnchor="end" dominantBaseline="middle">
                {formatarEixoY(t)}
              </text>
            </g>
          ))}
          {categorias.map((c, i) => {
            const centro = margem.esquerda + faixa * i + faixa / 2;
            const inicio = centro - grupoW / 2;
            return (
              <g key={c.chave} className="marca-grafico" data-ativo={ativa === c.chave} tabIndex={0} role="img" aria-label={`${c.rotulo}: ${series.map((s) => `${s.nome} ${formatar(s.valores[i] ?? 0)}`).join(", ")}`} onFocus={(e) => mostrar(e.currentTarget.querySelector("path") ?? e.currentTarget, i)} onBlur={esconder} onPointerEnter={(e) => mostrar(e.currentTarget.querySelector("path") ?? e.currentTarget, i)} onPointerLeave={esconder}>
                <rect x={centro - faixa / 2} y={margem.topo} width={faixa} height={areaH + margem.base} fill="transparent" />
                {series.map((s, j) => {
                  const v = s.valores[i] ?? 0;
                  const x0 = inicio + j * (largBarra + folga);
                  const x1 = x0 + largBarra;
                  const topo = y(v);
                  const h = Math.max(0, base - topo);
                  const r = Math.min(4, h, largBarra / 2);
                  const caminho = h > 0 ? `M${x0},${base} V${topo + r} Q${x0},${topo} ${x0 + r},${topo} H${x1 - r} Q${x1},${topo} ${x1},${topo + r} V${base} Z` : "";
                  return (
                    <g key={s.chave}>
                      {caminho && <path d={caminho} style={{ fill: s.cor }} />}
                      {maior.i === i && maior.j === j && (() => {
                        const texto = formatar(v);
                        const meia = (texto.length * 6.6) / 2;
                        const x = Math.min(Math.max((x0 + x1) / 2, margem.esquerda + meia), w - margem.direita - meia);
                        return (
                          <text className="grafico-texto-forte" x={x} y={topo - 6} textAnchor="middle">
                            {texto}
                          </text>
                        );
                      })()}
                    </g>
                  );
                })}
                <text className="grafico-texto" x={centro} y={altura - 8} textAnchor="middle">
                  {c.rotulo}
                </text>
              </g>
            );
          })}
        </svg>
        <Dica pos={dica} />
      </div>
    </QuadroGrafico>
  );
}
