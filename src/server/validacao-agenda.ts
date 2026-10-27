import { STATUS_PRAZO, TIPOS_EVENTO } from "./db/repositorio";
import type { DadosEvento, DadosPrazo, StatusPrazo, TipoEvento } from "./db/repositorio";
import { FUSO_PADRAO, dataCivilValida, fusoAceito, lerIsoComFuso } from "../comum/fuso";
import { normalizarNome, textoOpcional } from "./validacao";
import type { Opcional } from "./validacao";

/** Texto com várias linhas (mantém as quebras de linha). */
function textoLongo(valor: unknown, maximo: number): Opcional<string> {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== "string") return false;
  const t = valor.trim();
  if (t === "") return null;
  return t.length <= maximo ? t : false;
}

export function ehStatusPrazo(v: unknown): v is StatusPrazo {
  return typeof v === "string" && (STATUS_PRAZO as readonly string[]).includes(v);
}

export function ehTipoEvento(v: unknown): v is TipoEvento {
  return typeof v === "string" && (TIPOS_EVENTO as readonly string[]).includes(v);
}

/** Data civil AAAA-MM-DD existente, entre os anos 1900 e 2200. */
export function dataCivilAceita(v: unknown): v is string {
  return typeof v === "string" && dataCivilValida(v) && v >= "1900-01-01" && v <= "2200-12-31";
}

function idOpcional(v: unknown): string | null | false {
  if (v === undefined || v === null || v === "") return null;
  return typeof v === "string" && v.length <= 64 ? v : false;
}

export function horaValida(v: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

export type ResultadoPrazo = { ok: true; dados: DadosPrazo; status: StatusPrazo } | { ok: false; erro: string };

/** Prazo novo ou editado. `status` só vale na criação (padrão: a fazer); depois o status muda pela rota própria. */
export function validarPrazo(corpo: Record<string, unknown>): ResultadoPrazo {
  const titulo = typeof corpo.titulo === "string" && corpo.titulo.trim().length > 200 ? null : normalizarNome(corpo.titulo, 200);
  if (!titulo) return { ok: false, erro: "Informe o título do prazo (até 200 caracteres)." };
  const descricao = textoLongo(corpo.descricao, 2000);
  if (descricao === false) return { ok: false, erro: "Descrição longa demais (máximo 2.000 caracteres)." };
  if (!dataCivilAceita(corpo.data_fatal)) return { ok: false, erro: "Informe a data fatal no formato AAAA-MM-DD, com uma data que exista." };
  let hora: string | null = null;
  if (corpo.hora !== undefined && corpo.hora !== null && corpo.hora !== "") {
    if (typeof corpo.hora !== "string" || !horaValida(corpo.hora)) return { ok: false, erro: "Hora inválida. Use o formato HH:MM." };
    hora = corpo.hora;
  }
  const processo = idOpcional(corpo.processo_id);
  if (processo === false) return { ok: false, erro: "Processo inválido." };
  if (typeof corpo.responsavel_id !== "string" || corpo.responsavel_id === "" || corpo.responsavel_id.length > 64) return { ok: false, erro: "Escolha o responsável pelo prazo." };
  let status: StatusPrazo = "a_fazer";
  if (corpo.status !== undefined) {
    if (!ehStatusPrazo(corpo.status)) return { ok: false, erro: "Status inválido. Use: a fazer, em andamento, aguardando ou concluído." };
    status = corpo.status;
  }
  return { ok: true, status, dados: { titulo, descricao, data_fatal: corpo.data_fatal, hora, processo_id: processo, responsavel_id: corpo.responsavel_id } };
}

export type ResultadoEvento = { ok: true; dados: DadosEvento; participantes: string[] } | { ok: false; erro: string };

export function validarEvento(corpo: Record<string, unknown>): ResultadoEvento {
  const titulo = typeof corpo.titulo === "string" && corpo.titulo.trim().length > 200 ? null : normalizarNome(corpo.titulo, 200);
  if (!titulo) return { ok: false, erro: "Informe o título do evento (até 200 caracteres)." };
  if (!ehTipoEvento(corpo.tipo)) return { ok: false, erro: "Escolha o tipo: audiência, reunião, diligência ou outro." };
  let fuso = FUSO_PADRAO;
  if (corpo.fuso !== undefined && corpo.fuso !== null) {
    if (!fusoAceito(corpo.fuso)) return { ok: false, erro: "Fuso horário inválido. Escolha um fuso da lista." };
    fuso = corpo.fuso;
  }
  const inicio = lerIsoComFuso(corpo.inicio);
  if (!inicio) return { ok: false, erro: "Início inválido. Use data e hora com fuso, por exemplo 2026-11-03T14:00:00-03:00." };
  const fim = lerIsoComFuso(corpo.fim);
  if (!fim) return { ok: false, erro: "Fim inválido. Use data e hora com fuso, por exemplo 2026-11-03T15:00:00-03:00." };
  if (fim < inicio) return { ok: false, erro: "O fim não pode ser antes do início." };
  if (corpo.dia_inteiro !== undefined && typeof corpo.dia_inteiro !== "boolean") return { ok: false, erro: "Informe dia inteiro como verdadeiro ou falso." };
  const local = textoOpcional(corpo.local, 200);
  if (local === false) return { ok: false, erro: "Local longo demais (máximo 200 caracteres)." };
  const descricao = textoLongo(corpo.descricao, 2000);
  if (descricao === false) return { ok: false, erro: "Descrição longa demais (máximo 2.000 caracteres)." };
  const processo = idOpcional(corpo.processo_id);
  if (processo === false) return { ok: false, erro: "Processo inválido." };
  const cliente = idOpcional(corpo.cliente_id);
  if (cliente === false) return { ok: false, erro: "Cliente inválido." };
  let participantes: string[] = [];
  if (corpo.participantes !== undefined && corpo.participantes !== null) {
    if (!Array.isArray(corpo.participantes) || corpo.participantes.length > 50 || corpo.participantes.some((x) => typeof x !== "string" || x === "" || x.length > 64)) {
      return { ok: false, erro: "Lista de participantes inválida (até 50 usuários)." };
    }
    participantes = [...new Set(corpo.participantes as string[])];
  }
  return {
    ok: true,
    participantes,
    dados: { titulo, tipo: corpo.tipo, inicio, fim, fuso, dia_inteiro: corpo.dia_inteiro === true ? 1 : 0, local, descricao, processo_id: processo, cliente_id: cliente },
  };
}
