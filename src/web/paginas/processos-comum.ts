import { mascaraCnj } from "../mascaras";

export const FASES = ["Conhecimento", "Recursal", "Execução", "Suspenso", "Arquivado"] as const;
export type Fase = (typeof FASES)[number];
export type Polo = "ativo" | "passivo" | "terceiro";

export const ROTULO_POLO: Record<Polo, string> = { ativo: "Polo ativo", passivo: "Polo passivo", terceiro: "Terceiro" };

export interface Parte {
  id: string;
  processo_id: string;
  cliente_id: string | null;
  nome: string;
  polo: Polo;
  cliente_escritorio: boolean;
}

export interface Responsavel {
  user_id: string;
  nome: string;
  ativo: boolean;
}

export interface Processo {
  id: string;
  numero_cnj: string;
  tribunal: string | null;
  orgao: string | null;
  comarca: string | null;
  area: string | null;
  classe: string | null;
  assunto: string | null;
  fase: Fase;
  valor_causa_centavos: number | null;
  data_distribuicao: string | null;
  observacoes: string | null;
  ativo: boolean;
  /** O cliente vê este processo no portal. */
  visivel_portal: boolean;
  criado_em: string;
  atualizado_em: string;
  partes: Parte[];
  responsaveis: Responsavel[];
}

export interface Andamento {
  id: string;
  data: string;
  descricao: string;
  registrado_por: string | null;
  registrado_por_nome: string | null;
  criado_em: string;
  /** O cliente vê este andamento no portal. */
  visivel_portal: boolean;
}

export interface UsuarioDisponivel {
  id: string;
  nome: string;
  perfil: string | null;
}

export function cnjFormatado(digitos: string): string {
  return mascaraCnj(digitos);
}

export function reais(centavos: number | null): string {
  return centavos === null ? "—" : (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Resumo curto das partes para a lista: "Autor x Réu". */
export function resumoPartes(partes: Parte[]): { ativo: string; passivo: string; outros: number } {
  const nomes = (polo: Polo) => partes.filter((p) => p.polo === polo).map((p) => p.nome);
  const juntar = (n: string[]) => (n.length === 0 ? "—" : n.length === 1 ? (n[0] as string) : `${n[0]} e mais ${n.length - 1}`);
  return { ativo: juntar(nomes("ativo")), passivo: juntar(nomes("passivo")), outros: nomes("terceiro").length };
}
