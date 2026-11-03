import { formatarNumero } from "./comum";

interface Props {
  /** Texto para leitor de tela e dica: o que o anel mostra. */
  rotulo: string;
  valor: number;
  maximo: number;
  /** Texto pequeno sob a porcentagem (ex.: "recebido"). */
  legenda?: string;
  tamanho?: number;
}

const RAIO = 46;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;

/** Anel de progresso (razão contra um total). Mostra a porcentagem no centro; os valores absolutos devem aparecer ao lado, em texto. */
export function Anel({ rotulo, valor, maximo, legenda, tamanho = 108 }: Props) {
  const razao = maximo > 0 ? Math.min(1, Math.max(0, valor / maximo)) : 0;
  const pct = Math.round(razao * 100);
  return (
    <div className="anel" style={{ width: tamanho, height: tamanho }} role="img" aria-label={`${rotulo}: ${formatarNumero(pct)}%`}>
      <svg viewBox="0 0 108 108" aria-hidden="true" focusable="false">
        <circle className="anel-trilho" cx="54" cy="54" r={RAIO} fill="none" strokeWidth="10" />
        <circle className="anel-valor" cx="54" cy="54" r={RAIO} fill="none" strokeWidth="10" strokeLinecap="round" strokeDasharray={CIRCUNFERENCIA} strokeDashoffset={CIRCUNFERENCIA * (1 - razao)} />
      </svg>
      <div className="anel-centro" aria-hidden="true">
        <b>{pct}%</b>
        {legenda && <small>{legenda}</small>}
      </div>
    </div>
  );
}
