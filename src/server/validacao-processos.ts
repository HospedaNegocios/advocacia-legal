import { FASES_PROCESSO, POLOS } from "./db/repositorio";
import type { DadosProcesso, FaseProcesso, Polo } from "./db/repositorio";
import { apenasDigitos, normalizarNome, textoOpcional } from "./validacao";
import type { Opcional } from "./validacao";
import { dataValida } from "./validacao-clientes";

/**
 * Número único de processo (Resolução CNJ 65/2008): NNNNNNN-DD.AAAA.J.TR.OOOO (20 dígitos).
 * Dígito verificador: com o número reorganizado como NNNNNNN AAAA J TR OOOO DD, o resto da divisão por 97 deve ser 1
 * (equivale a DD = 98 − ((NNNNNNN AAAA J TR OOOO 00) mod 97)).
 * Além disso, o segmento da Justiça (J) vai de 1 a 9 na Resolução.
 */
export function cnjValido(valor: string): boolean {
  const d = apenasDigitos(valor);
  if (d.length !== 20) return false;
  const j = d[13];
  if (j === "0") return false;
  const reorganizado = d.slice(0, 7) + d.slice(9, 20) + d.slice(7, 9);
  // Resto por partes para não depender de BigInt.
  let resto = 0;
  for (let i = 0; i < reorganizado.length; i += 5) {
    resto = Number(`${resto}${reorganizado.slice(i, i + 5)}`) % 97;
  }
  return resto === 1;
}

/** Formata os 20 dígitos como NNNNNNN-DD.AAAA.J.TR.OOOO. */
export function formatarCnj(digitos: string): string {
  const d = digitos;
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16, 20)}`;
}

export function ehFase(v: unknown): v is FaseProcesso {
  return typeof v === "string" && (FASES_PROCESSO as readonly string[]).includes(v);
}

export function ehPolo(v: unknown): v is Polo {
  return typeof v === "string" && (POLOS as readonly string[]).includes(v);
}

function textoLongo(valor: unknown, maximo: number): Opcional<string> {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== "string") return false;
  const t = valor.trim();
  if (t === "") return null;
  return t.length <= maximo ? t : false;
}

export type ResultadoProcesso = { ok: true; dados: DadosProcesso } | { ok: false; erro: string };

const CAMPOS_TEXTO: ReadonlyArray<{ campo: "tribunal" | "orgao" | "comarca" | "area" | "classe" | "assunto"; rotulo: string; maximo: number }> = [
  { campo: "tribunal", rotulo: "Tribunal", maximo: 100 },
  { campo: "orgao", rotulo: "Órgão/vara", maximo: 150 },
  { campo: "comarca", rotulo: "Comarca", maximo: 100 },
  { campo: "area", rotulo: "Área", maximo: 80 },
  { campo: "classe", rotulo: "Classe", maximo: 150 },
  { campo: "assunto", rotulo: "Assunto", maximo: 200 },
];

export function validarProcesso(corpo: Record<string, unknown>): ResultadoProcesso {
  if (typeof corpo.numero_cnj !== "string" || apenasDigitos(corpo.numero_cnj).length !== 20) {
    return { ok: false, erro: "Informe o número do processo no formato CNJ (20 dígitos): NNNNNNN-DD.AAAA.J.TR.OOOO." };
  }
  if (!cnjValido(corpo.numero_cnj)) return { ok: false, erro: "Número do processo inválido: o dígito verificador não confere. Confira os números." };
  if (!ehFase(corpo.fase)) return { ok: false, erro: "Escolha a fase do processo: Conhecimento, Recursal, Execução, Suspenso ou Arquivado." };
  const textos: Record<string, string | null> = {};
  for (const { campo, rotulo, maximo } of CAMPOS_TEXTO) {
    const v = textoOpcional(corpo[campo], maximo);
    if (v === false) return { ok: false, erro: `${rotulo} inválido (máximo ${maximo} caracteres).` };
    textos[campo] = v;
  }
  let valor: number | null = null;
  const bruto = corpo.valor_causa_centavos;
  if (bruto !== undefined && bruto !== null && bruto !== "") {
    if (typeof bruto !== "number" || !Number.isSafeInteger(bruto) || bruto < 0 || bruto > 1e15) {
      return { ok: false, erro: "Valor da causa inválido: informe um valor igual ou maior que zero." };
    }
    valor = bruto;
  }
  let distribuicao: string | null = null;
  if (corpo.data_distribuicao !== undefined && corpo.data_distribuicao !== null && corpo.data_distribuicao !== "") {
    if (typeof corpo.data_distribuicao !== "string" || !dataValida(corpo.data_distribuicao)) return { ok: false, erro: "Data de distribuição inválida (não pode ser futura)." };
    distribuicao = corpo.data_distribuicao;
  }
  const observacoes = textoLongo(corpo.observacoes, 2000);
  if (observacoes === false) return { ok: false, erro: "Observações longas demais (máximo 2.000 caracteres)." };
  return {
    ok: true,
    dados: {
      numero_cnj: apenasDigitos(corpo.numero_cnj),
      tribunal: textos.tribunal ?? null,
      orgao: textos.orgao ?? null,
      comarca: textos.comarca ?? null,
      area: textos.area ?? null,
      classe: textos.classe ?? null,
      assunto: textos.assunto ?? null,
      fase: corpo.fase,
      valor_causa_centavos: valor,
      data_distribuicao: distribuicao,
      observacoes,
    },
  };
}

export interface DadosParte {
  cliente_id: string | null;
  nome: string | null;
  polo: Polo;
  cliente_escritorio: boolean;
}

/** Parte nova: um cliente cadastrado (cliente_id) OU um nome livre, nunca os dois. */
export function validarParte(corpo: Record<string, unknown>): { ok: true; dados: DadosParte } | { ok: false; erro: string } {
  if (!ehPolo(corpo.polo)) return { ok: false, erro: "Escolha o polo: ativo, passivo ou terceiro." };
  const temCliente = corpo.cliente_id !== undefined && corpo.cliente_id !== null && corpo.cliente_id !== "";
  const temNome = corpo.nome !== undefined && corpo.nome !== null && !(typeof corpo.nome === "string" && corpo.nome.trim() === "");
  if (temCliente === temNome) return { ok: false, erro: "Escolha um cliente cadastrado ou digite o nome da parte (um dos dois)." };
  if (corpo.cliente_escritorio !== undefined && typeof corpo.cliente_escritorio !== "boolean") return { ok: false, erro: "Marcação de cliente do escritório inválida." };
  if (temCliente) {
    if (typeof corpo.cliente_id !== "string" || corpo.cliente_id.length > 64) return { ok: false, erro: "Cliente inválido." };
    return { ok: true, dados: { cliente_id: corpo.cliente_id, nome: null, polo: corpo.polo, cliente_escritorio: true } };
  }
  const nome = typeof corpo.nome === "string" && corpo.nome.trim().length > 150 ? null : normalizarNome(corpo.nome, 150);
  if (!nome) return { ok: false, erro: "Informe o nome da parte (até 150 caracteres)." };
  return { ok: true, dados: { cliente_id: null, nome, polo: corpo.polo, cliente_escritorio: corpo.cliente_escritorio === true } };
}

export interface DadosAndamento {
  data: string;
  descricao: string;
}

export function validarAndamento(corpo: Record<string, unknown>): { ok: true; dados: DadosAndamento } | { ok: false; erro: string } {
  if (typeof corpo.data !== "string" || !dataValida(corpo.data)) return { ok: false, erro: "Informe a data do andamento (não pode ser futura)." };
  const descricao = textoLongo(corpo.descricao, 2000);
  if (descricao === null || descricao === false) return { ok: false, erro: "Descreva o andamento (até 2.000 caracteres)." };
  return { ok: true, dados: { data: corpo.data, descricao } };
}
