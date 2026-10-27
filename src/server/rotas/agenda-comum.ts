import type { Ctx } from "../contexto";
import type { EventoDetalhado, ParticipanteDetalhado, PrazoDetalhado, Repositorio } from "../db/repositorio";
import { FUSO_PADRAO, diferencaDias, hojeEm } from "../../comum/fuso";
import { respostaErro } from "../validacao";

// Peças compartilhadas pelas rotas de Prazos, Agenda, Início e pelas abas do processo.

/** Dia de hoje no fuso do escritório. Nunca usa a hora do servidor como hora local. */
export function hojeDoEscritorio(): string {
  return hojeEm(FUSO_PADRAO);
}

export type SituacaoPrazo = "concluido" | "vencido" | "hoje" | "futuro";

export function prazoPublico(p: PrazoDetalhado, hoje: string) {
  const dias = diferencaDias(hoje, p.data_fatal);
  const situacao: SituacaoPrazo = p.status === "concluido" ? "concluido" : dias < 0 ? "vencido" : dias === 0 ? "hoje" : "futuro";
  return {
    id: p.id,
    titulo: p.titulo,
    descricao: p.descricao,
    data_fatal: p.data_fatal,
    hora: p.hora,
    processo_id: p.processo_id,
    processo_numero: p.processo_numero,
    responsavel_id: p.responsavel_id,
    responsavel_nome: p.responsavel_nome,
    status: p.status,
    concluido_em: p.concluido_em,
    situacao,
    /** Dias até a data fatal (negativo = atrasado), contados no calendário do escritório. */
    dias_para_vencer: dias,
    criado_por: p.criado_por,
    criado_em: p.criado_em,
    atualizado_em: p.atualizado_em,
  };
}

export function eventoPublico(e: EventoDetalhado, participantes: ParticipanteDetalhado[], c: Ctx) {
  return {
    id: e.id,
    titulo: e.titulo,
    tipo: e.tipo,
    inicio: e.inicio,
    fim: e.fim,
    fuso: e.fuso,
    dia_inteiro: e.dia_inteiro === 1,
    local: e.local,
    descricao: e.descricao,
    processo_id: e.processo_id,
    processo_numero: e.processo_numero,
    cliente_id: e.cliente_id,
    cliente_nome: e.cliente_nome,
    criado_por: e.criado_por,
    participantes: participantes.filter((x) => x.evento_id === e.id).map((x) => ({ user_id: x.user_id, nome: x.nome, ativo: x.ativo === 1 })),
    pode_alterar: podeAlterarEvento(c, e.criado_por),
    criado_em: e.criado_em,
    atualizado_em: e.atualizado_em,
  };
}

export function podeAlterarEvento(c: Ctx, criadoPor: string | null): boolean {
  const u = c.get("sessao").usuario;
  return u.perfil === "socio" || (criadoPor !== null && criadoPor === u.id);
}

export async function eventosPublicos(c: Ctx, repo: Repositorio, eventos: EventoDetalhado[]) {
  const participantes = await repo.eventos.participantes(eventos.map((e) => e.id));
  return eventos.map((e) => eventoPublico(e, participantes, c));
}

export const MSG_PROCESSO_INATIVO = "Este processo está desativado. Reative o processo para criar prazos e eventos nele.";

/** O processo precisa existir neste escritório (a busca já filtra pela sessão) e estar ativo. Devolve a resposta de erro, ou null se está tudo certo. */
export async function conferirProcesso(c: Ctx, repo: Repositorio, processoId: string | null) {
  if (processoId === null) return null;
  const p = await repo.processos.buscar(processoId);
  if (!p) return respostaErro(c, 404, "Processo não encontrado.");
  if (p.ativo === 0) return respostaErro(c, 409, MSG_PROCESSO_INATIVO);
  return null;
}

/** Usuário do escritório da sessão. `exigirAtivo` recusa usuário desativado. */
export async function conferirUsuario(c: Ctx, repo: Repositorio, userId: string, exigirAtivo: boolean, rotulo: string) {
  const u = await repo.users.buscar(userId);
  if (!u || u.perfil === null) return respostaErro(c, 404, `${rotulo} não encontrado.`);
  if (exigirAtivo && u.ativo === 0) return respostaErro(c, 409, `${rotulo} está desativado.`);
  return null;
}
