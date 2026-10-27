// Datas e fusos horários. Usado pelo servidor e pela interface (sem biblioteca externa: só Intl).
// REGRA: nunca use a hora do servidor/navegador como hora local do escritório. "Hoje" é sempre calculado
// no fuso do escritório (America/Sao_Paulo por padrão).

export const FUSO_PADRAO = "America/Sao_Paulo";

/** Fusos aceitos (lista fixa de fusos IANA do Brasil). Nada de texto livre de fuso. */
export const FUSOS_ACEITOS = [
  "America/Sao_Paulo",
  "America/Noronha",
  "America/Belem",
  "America/Fortaleza",
  "America/Recife",
  "America/Araguaina",
  "America/Maceio",
  "America/Bahia",
  "America/Santarem",
  "America/Cuiaba",
  "America/Campo_Grande",
  "America/Manaus",
  "America/Porto_Velho",
  "America/Boa_Vista",
  "America/Eirunepe",
  "America/Rio_Branco",
] as const;

export function fusoAceito(v: unknown): v is string {
  return typeof v === "string" && (FUSOS_ACEITOS as readonly string[]).includes(v);
}

const formatadores = new Map<string, Intl.DateTimeFormat>();
function formatador(fuso: string): Intl.DateTimeFormat {
  let f = formatadores.get(fuso);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: fuso, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    formatadores.set(fuso, f);
  }
  return f;
}

export interface PartesLocais {
  data: string;
  hora: string;
  segundo: string;
}

/** Data e hora locais de um instante no fuso informado. */
export function partesLocais(instante: Date | number, fuso: string = FUSO_PADRAO): PartesLocais {
  const p: Record<string, string> = {};
  for (const x of formatador(fuso).formatToParts(new Date(instante))) p[x.type] = x.value;
  return { data: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}`, segundo: p.second ?? "00" };
}

/** Dia civil (AAAA-MM-DD) de hoje no fuso informado. */
export function hojeEm(fuso: string = FUSO_PADRAO, agora: Date | number = Date.now()): string {
  return partesLocais(agora, fuso).data;
}

/** Soma dias a uma data AAAA-MM-DD (calendário, sem fuso). */
export function somarDias(data: string, dias: number): string {
  const [a, m, d] = data.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Diferença em dias entre duas datas AAAA-MM-DD (b - a). */
export function diferencaDias(a: string, b: string): number {
  const t = (x: string) => {
    const [y, m, d] = x.split("-").map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((t(b) - t(a)) / 86400000);
}

export function dataCivilValida(texto: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const [a, m, d] = texto.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Instante UTC (ms) em que o relógio local do fuso marca `data` `hora`:`segundo`. */
export function instanteLocal(data: string, hora: string, fuso: string = FUSO_PADRAO, segundo = 0, milissegundo = 0): number {
  const [a, m, d] = data.split("-").map(Number) as [number, number, number];
  const [h, mi] = hora.split(":").map(Number) as [number, number];
  const alvo = Date.UTC(a, m - 1, d, h, mi, segundo, 0);
  // Desloca pelo deslocamento do fuso naquele instante (duas passadas cobrem mudanças de horário de verão).
  let chute = alvo;
  for (let i = 0; i < 2; i++) {
    const l = partesLocais(chute, fuso);
    const [la, lm, ld] = l.data.split("-").map(Number) as [number, number, number];
    const [lh, lmi] = l.hora.split(":").map(Number) as [number, number];
    const local = Date.UTC(la, lm - 1, ld, lh, lmi, Number(l.segundo), 0);
    chute -= local - alvo;
  }
  return chute + milissegundo;
}

/** Início do dia local (00:00:00.000) e fim do dia local (23:59:59.999), em ms UTC. */
export function limitesDoDia(data: string, fuso: string = FUSO_PADRAO): { inicio: number; fim: number } {
  return { inicio: instanteLocal(data, "00:00", fuso), fim: instanteLocal(data, "23:59", fuso, 59, 999) };
}

const FORMATO_ISO_COM_FUSO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Lê uma data/hora ISO 8601 que TEM de trazer o fuso (Z ou ±HH:MM). Devolve o instante em UTC normalizado
 * ("AAAA-MM-DDTHH:MM:SS.sssZ") ou null se for inválida.
 */
export function lerIsoComFuso(texto: unknown): string | null {
  if (typeof texto !== "string" || !FORMATO_ISO_COM_FUSO.test(texto)) return null;
  const ms = Date.parse(texto);
  if (Number.isNaN(ms)) return null;
  // Rejeita datas inexistentes que o motor "corrige" (ex.: 31 de abril).
  const [a, m, d] = texto.slice(0, 10).split("-").map(Number) as [number, number, number];
  if (!dataCivilValida(texto.slice(0, 10)) || a < 1900 || a > 2200 || m < 1 || d < 1) return null;
  const hh = Number(texto.slice(11, 13));
  const mm = Number(texto.slice(14, 16));
  if (hh > 23 || mm > 59) return null;
  return new Date(ms).toISOString();
}
