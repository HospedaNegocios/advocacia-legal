// Regras do popup de prazos (sem tela): assinatura do que o usuário já viu e dispensa guardada no navegador.

export interface PrazoAlerta {
  id: string;
  titulo: string;
  data_fatal: string;
  hora: string | null;
  processo_id: string | null;
  processo_numero: string | null;
  situacao: "concluido" | "vencido" | "hoje" | "futuro";
  dias_para_vencer: number;
  atualizado_em: string;
}

export interface RespostaAlertas {
  hoje: string;
  total: number;
  prazos: PrazoAlerta[];
}

const chavePrazo = (p: PrazoAlerta) => `${p.id}|${p.data_fatal}|${p.hora ?? ""}|${p.atualizado_em}`;

/** Lista (ordenada) dos prazos vistos: muda quando entra um prazo novo ou algum é alterado (data, hora, título...). */
export function assinaturaDosPrazos(prazos: readonly PrazoAlerta[]): string {
  return prazos.map(chavePrazo).sort().join(";");
}

const PREFIXO = "alertas-prazos:";
const chave = (usuarioId: string, dia: string) => `${PREFIXO}${usuarioId}:${dia}`;

/** Assinatura que o usuário dispensou neste dia, ou null (também se o navegador não deixa guardar). */
export function lerDispensa(usuarioId: string, dia: string): string | null {
  try {
    return localStorage.getItem(chave(usuarioId, dia));
  } catch {
    return null;
  }
}

/** Guarda a dispensa (por usuário e por dia) e apaga as dos dias anteriores. */
export function gravarDispensa(usuarioId: string, dia: string, assinatura: string): void {
  try {
    const mantida = chave(usuarioId, dia);
    const dele = `${PREFIXO}${usuarioId}:`;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(dele) && k !== mantida) localStorage.removeItem(k);
    }
    localStorage.setItem(mantida, assinatura);
  } catch {
    /* sem armazenamento: a dispensa vale só enquanto a página estiver aberta */
  }
}

/** Precisa mostrar o aviso? Só se algum prazo é novo ou foi alterado desde a última dispensa (prazo que saiu da lista não conta). */
export function deveAvisar(prazos: readonly PrazoAlerta[], dispensada: string | null): boolean {
  const vistos = new Set(dispensada ? dispensada.split(";") : []);
  return prazos.some((p) => !vistos.has(chavePrazo(p)));
}
