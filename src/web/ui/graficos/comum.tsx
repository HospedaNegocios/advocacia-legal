import { ChartColumn, Table2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { ReactNode, RefObject } from "react";

const numero = new Intl.NumberFormat("pt-BR");
const compacto = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

export function formatarNumero(n: number): string {
  return numero.format(n);
}
/** 0, 5, 1,2 mil... usado nos eixos. */
export function formatarEixo(n: number): string {
  return Math.abs(n) >= 1000 ? compacto.format(n) : numero.format(n);
}

/** Largura atual de um elemento (para o SVG usar tamanho real e o texto não distorcer). */
export function useLargura(ref: RefObject<HTMLElement | null>, inicial = 320): number {
  const [largura, setLargura] = useState(inicial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setLargura(Math.max(0, Math.floor(el.getBoundingClientRect().width)) || inicial);
    if (typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver((entradas) => {
      const w = entradas[0]?.contentRect.width;
      if (w) setLargura(Math.floor(w));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref, inicial]);
  return largura;
}

/** Máximo "redondo" e marcas do eixo (inteiros quando os dados são contagens). */
export function escalaBonita(maximo: number, marcas = 4): { teto: number; ticks: number[] } {
  if (maximo <= 0) return { teto: marcas, ticks: Array.from({ length: marcas + 1 }, (_, i) => i) };
  const bruto = maximo / marcas;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const passo = ([1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => p >= bruto) ?? 10 * pot);
  const passoInteiro = maximo >= marcas ? Math.max(1, passo) : 1;
  const teto = Math.ceil(maximo / passoInteiro) * passoInteiro;
  const ticks: number[] = [];
  for (let v = 0; v <= teto + 1e-9; v += passoInteiro) ticks.push(v);
  return { teto, ticks };
}

export interface ItemLegenda {
  chave: string;
  rotulo: string;
  /** Valor CSS da cor, ex.: "var(--serie-1)". */
  cor: string;
  /** Se informado, mostra o ícone (na cor da marca) no lugar do quadradinho. Obrigatório para status. */
  icone?: LucideIcon | undefined;
  linha?: boolean | undefined;
}

/** Legenda: obrigatória com 2 ou mais séries. A cor identifica a marca; o texto usa a cor de texto. */
export function Legenda({ itens }: { itens: ItemLegenda[] }) {
  return (
    <ul className="legenda" aria-label="Legenda">
      {itens.map((i) => {
        const Icone = i.icone;
        return (
          <li key={i.chave}>
            {Icone ? <Icone size={14} aria-hidden="true" style={{ color: i.cor }} /> : <span className={`legenda-chave${i.linha ? " legenda-chave-linha" : ""}`} style={{ background: i.cor }} aria-hidden="true" />}
            {i.rotulo}
          </li>
        );
      })}
    </ul>
  );
}

export interface ConteudoDica {
  titulo?: string | undefined;
  linhas: { cor: string; rotulo: string; valor: string }[];
}
export interface PosicaoDica {
  x: number;
  y: number;
  conteudo: ConteudoDica;
}

/** Tooltip. Todo texto entra como nó de texto do React (nunca HTML bruto). */
export function Dica({ pos }: { pos: PosicaoDica | null }) {
  if (!pos) return null;
  return (
    <div className="dica" role="presentation" style={{ left: `min(max(${pos.x}px, 8rem), calc(100% - 8rem))`, top: pos.y, transform: "translate(-50%, calc(-100% - 10px))" }}>
      {pos.conteudo.titulo && <div className="dica-titulo">{pos.conteudo.titulo}</div>}
      {pos.conteudo.linhas.map((l) => (
        <div className="dica-linha" key={l.rotulo}>
          <span className="dica-chave">
            <i style={{ background: l.cor }} aria-hidden="true" />
            {l.rotulo}
          </span>
          <b>{l.valor}</b>
        </div>
      ))}
    </div>
  );
}

/** Calcula a posição da dica a partir de um elemento (ou ponto) relativo à área do gráfico. */
export function posicaoDe(area: HTMLElement | null, alvo: Element | null, conteudo: ConteudoDica): PosicaoDica | null {
  if (!area || !alvo) return null;
  const a = area.getBoundingClientRect();
  const r = alvo.getBoundingClientRect();
  return { x: r.left + r.width / 2 - a.left, y: r.top - a.top, conteudo };
}

export interface TabelaGrafico {
  colunas: string[];
  linhas: (string | number)[][];
}

/**
 * Moldura de todo gráfico: título, descrição acessível, legenda (2+ séries) e alternância
 * "ver como tabela" (equivalente acessível com os mesmos números).
 */
export function QuadroGrafico({ titulo, subtitulo, resumo, legenda, tabela, children }: { titulo: string; subtitulo?: string | undefined; resumo: string; legenda?: ItemLegenda[] | undefined; tabela: TabelaGrafico; children: ReactNode }) {
  const [comoTabela, setComoTabela] = useState(false);
  const id = useId();
  return (
    <figure className="grafico" aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`}>
      <div className="grafico-cabeca">
        <div>
          <h3 id={`${id}-t`}>{titulo}</h3>
          {subtitulo && <p>{subtitulo}</p>}
        </div>
        <button type="button" className="btn btn-fantasma btn-pequeno grafico-alternar" aria-pressed={comoTabela} onClick={() => setComoTabela((v) => !v)}>
          {comoTabela ? <ChartColumn size={16} aria-hidden="true" /> : <Table2 size={16} aria-hidden="true" />}
          {comoTabela ? "Ver como gráfico" : "Ver como tabela"}
        </button>
      </div>
      <p id={`${id}-d`} className="so-leitor">
        {resumo}
      </p>
      {comoTabela ? (
        <div className="grafico-tabela">
          <table>
            <caption className="so-leitor">{titulo}</caption>
            <thead>
              <tr>
                {tabela.colunas.map((c) => (
                  <th key={c} scope="col">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tabela.linhas.map((l, i) => (
                <tr key={i}>
                  {l.map((v, j) => (j === 0 ? (
                    <th key={j} scope="row">
                      {v}
                    </th>
                  ) : (
                    <td key={j}>{typeof v === "number" ? formatarNumero(v) : v}</td>
                  )))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {legenda && legenda.length >= 2 && <Legenda itens={legenda} />}
          {children}
        </>
      )}
    </figure>
  );
}
