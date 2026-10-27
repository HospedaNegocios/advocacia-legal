interface Props {
  valores: number[];
  /** Descrição para leitores de tela, ex.: "Escritórios nos últimos 12 meses: de 2 para 9". */
  rotulo: string;
  largura?: number;
  altura?: number;
}

/** Tendência em miniatura: linha de 2px na cor neutra e ponto atual em destaque (série 1). Precisa de 2 ou mais pontos. */
export function Sparkline({ valores, rotulo, largura = 96, altura = 32 }: Props) {
  if (valores.length < 2) return null;
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const faixa = max - min || 1;
  const pad = 4;
  const x = (i: number) => pad + ((largura - 2 * pad) * i) / (valores.length - 1);
  const y = (v: number) => altura - pad - ((altura - 2 * pad) * (v - min)) / faixa;
  const ultimo = valores.length - 1;
  return (
    <svg className="sparkline" width={largura} height={altura} role="img" aria-label={rotulo}>
      <polyline points={valores.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" style={{ stroke: "var(--grafico-neutro)" }} />
      <circle cx={x(ultimo)} cy={y(valores[ultimo] ?? 0)} r={4} strokeWidth={2} style={{ fill: "var(--serie-1)", stroke: "var(--cor-superficie)" }} />
    </svg>
  );
}
