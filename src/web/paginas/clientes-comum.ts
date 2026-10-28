import { mascaraCep, mascaraDocumento, mascaraTelefone } from "../mascaras";

export const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

export interface Cliente {
  id: string;
  tipo: "pf" | "pj";
  nome: string;
  nome_fantasia: string | null;
  documento: string | null;
  rg: string | null;
  inscricao_estadual: string | null;
  data_nascimento: string | null;
  email: string | null;
  telefone: string | null;
  celular: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  observacoes: string | null;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export interface Contato {
  id: string;
  nome: string;
  cargo: string | null;
  email: string | null;
  telefone: string | null;
}

export interface Consentimento {
  id: string;
  finalidade: string;
  base_legal: string | null;
  forma: string;
  data_consentimento: string;
  revogado_em: string | null;
}

export interface Anexo {
  id: string;
  nome: string;
  tipo_mime: string;
  tamanho_bytes: number;
  criado_em: string;
  /** O cliente pode ver e baixar este arquivo no portal. */
  compartilhado_cliente: boolean;
}

export const ROTULO_TIPO = { pf: "Pessoa física", pj: "Pessoa jurídica" } as const;

export function documentoFormatado(c: Pick<Cliente, "documento">): string {
  return c.documento ? mascaraDocumento(c.documento) : "—";
}

export function telefoneFormatado(v: string | null): string {
  return v ? mascaraTelefone(v) : "—";
}

export function cepFormatado(v: string | null): string {
  return v ? mascaraCep(v) : "";
}

/** Data "AAAA-MM-DD" para "DD/MM/AAAA" sem passar por fuso horário. */
export function diaBr(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
