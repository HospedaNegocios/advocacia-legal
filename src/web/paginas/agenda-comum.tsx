import { AlarmClock, AlarmClockOff, CalendarCheck, CalendarClock, CalendarDays, CircleCheck, Footprints, Gavel, Handshake, Hourglass, ListTodo, Timer } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FUSO_PADRAO, partesLocais } from "../../comum/fuso";
import { Selo } from "../ui";
import type { TomSelo } from "../ui";
import { diaBr } from "./clientes-comum";

// Tipos, rótulos e peças visuais compartilhados por Início, Prazos, Agenda e abas do processo.

// ---------- Prazos ----------

export type StatusPrazo = "a_fazer" | "em_andamento" | "aguardando" | "concluido";
export const STATUS_PRAZO: readonly StatusPrazo[] = ["a_fazer", "em_andamento", "aguardando", "concluido"];
export const ROTULO_STATUS_PRAZO: Record<StatusPrazo, string> = { a_fazer: "A fazer", em_andamento: "Em andamento", aguardando: "Aguardando", concluido: "Concluído" };
export const ICONE_STATUS_PRAZO: Record<StatusPrazo, LucideIcon> = { a_fazer: ListTodo, em_andamento: Timer, aguardando: Hourglass, concluido: CircleCheck };

export interface Prazo {
  id: string;
  titulo: string;
  descricao: string | null;
  data_fatal: string;
  hora: string | null;
  processo_id: string | null;
  processo_numero: string | null;
  responsavel_id: string;
  responsavel_nome: string;
  status: StatusPrazo;
  concluido_em: string | null;
  situacao: "concluido" | "vencido" | "hoje" | "futuro";
  dias_para_vencer: number;
  criado_em: string;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Texto da situação do prazo, calculado no calendário de São Paulo pelo servidor. */
export function textoSituacao(p: Pick<Prazo, "situacao" | "dias_para_vencer">): string {
  if (p.situacao === "concluido") return "Concluído";
  if (p.situacao === "vencido") return `Vencido há ${plural(-p.dias_para_vencer, "dia", "dias")}`;
  if (p.situacao === "hoje") return "Vence hoje";
  if (p.dias_para_vencer === 1) return "Vence amanhã";
  return `Vence em ${p.dias_para_vencer} dias`;
}

/** Selo do prazo: cor E ícone E texto (vencido, hoje, até 7 dias, depois). */
export function SeloPrazo({ prazo }: { prazo: Pick<Prazo, "situacao" | "dias_para_vencer"> }) {
  let tom: TomSelo = "neutro";
  let Icone: LucideIcon = CalendarDays;
  if (prazo.situacao === "concluido") {
    tom = "bom";
    Icone = CircleCheck;
  } else if (prazo.situacao === "vencido") {
    tom = "critico";
    Icone = AlarmClockOff;
  } else if (prazo.situacao === "hoje") {
    tom = "aviso";
    Icone = AlarmClock;
  } else if (prazo.dias_para_vencer <= 7) {
    tom = "info";
    Icone = CalendarClock;
  }
  return (
    <Selo tom={tom} icone={Icone}>
      {textoSituacao(prazo)}
    </Selo>
  );
}

/** "10/11/2026 às 14:30" ou só a data. */
export function dataFatalTexto(p: Pick<Prazo, "data_fatal" | "hora">): string {
  return p.hora ? `${diaBr(p.data_fatal)} às ${p.hora}` : diaBr(p.data_fatal);
}

// ---------- Eventos ----------

export type TipoEvento = "audiencia" | "reuniao" | "diligencia" | "outro";
export const TIPOS_EVENTO: readonly TipoEvento[] = ["audiencia", "reuniao", "diligencia", "outro"];
export const ROTULO_TIPO_EVENTO: Record<TipoEvento, string> = { audiencia: "Audiência", reuniao: "Reunião", diligencia: "Diligência", outro: "Outro" };
export const ICONE_TIPO_EVENTO: Record<TipoEvento, LucideIcon> = { audiencia: Gavel, reuniao: Handshake, diligencia: Footprints, outro: CalendarCheck };

export interface Evento {
  id: string;
  titulo: string;
  tipo: TipoEvento;
  inicio: string;
  fim: string;
  fuso: string;
  dia_inteiro: boolean;
  local: string | null;
  descricao: string | null;
  processo_id: string | null;
  processo_numero: string | null;
  cliente_id: string | null;
  cliente_nome: string | null;
  criado_por: string | null;
  participantes: { user_id: string; nome: string; ativo: boolean }[];
  pode_alterar: boolean;
}

export const ROTULO_FUSO: Record<string, string> = {
  "America/Sao_Paulo": "Brasília (São Paulo)",
  "America/Noronha": "Fernando de Noronha",
  "America/Belem": "Belém",
  "America/Fortaleza": "Fortaleza",
  "America/Recife": "Recife",
  "America/Araguaina": "Araguaína",
  "America/Maceio": "Maceió",
  "America/Bahia": "Salvador (Bahia)",
  "America/Santarem": "Santarém",
  "America/Cuiaba": "Cuiabá",
  "America/Campo_Grande": "Campo Grande",
  "America/Manaus": "Manaus",
  "America/Porto_Velho": "Porto Velho",
  "America/Boa_Vista": "Boa Vista",
  "America/Eirunepe": "Eirunepé",
  "America/Rio_Branco": "Rio Branco",
};

/** Dia (AAAA-MM-DD) em que o evento começa e termina no calendário do escritório. O fim exatamente à meia-noite não conta como dia seguinte. */
export function diasDoEvento(e: Pick<Evento, "inicio" | "fim">): { primeiro: string; ultimo: string } {
  const primeiro = partesLocais(Date.parse(e.inicio), FUSO_PADRAO).data;
  const f = partesLocais(Date.parse(e.fim), FUSO_PADRAO);
  const ultimo = f.hora === "00:00" && f.segundo === "00" && f.data > primeiro ? partesLocais(Date.parse(e.fim) - 1000, FUSO_PADRAO).data : f.data;
  return { primeiro, ultimo: ultimo < primeiro ? primeiro : ultimo };
}

function horaNoFuso(iso: string, fuso: string): string {
  return partesLocais(Date.parse(iso), fuso).hora;
}

/** Horário do evento no fuso dele, com o nome do fuso quando for diferente do de Brasília. */
export function horarioEvento(e: Pick<Evento, "inicio" | "fim" | "fuso" | "dia_inteiro">): string {
  if (e.dia_inteiro) return "Dia inteiro";
  const base = e.inicio === e.fim ? horaNoFuso(e.inicio, e.fuso) : `${horaNoFuso(e.inicio, e.fuso)} às ${horaNoFuso(e.fim, e.fuso)}`;
  return e.fuso === FUSO_PADRAO ? base : `${base} (${ROTULO_FUSO[e.fuso] ?? e.fuso})`;
}

/** Data de início no fuso do evento, para listas fora do calendário. */
export function dataEvento(e: Pick<Evento, "inicio" | "fuso">): string {
  return diaBr(partesLocais(Date.parse(e.inicio), e.fuso).data);
}

export function SeloTipoEvento({ tipo }: { tipo: TipoEvento }) {
  return <Selo icone={ICONE_TIPO_EVENTO[tipo]}>{ROTULO_TIPO_EVENTO[tipo]}</Selo>;
}

export interface UsuarioBasico {
  id: string;
  nome: string;
  perfil: string | null;
}
