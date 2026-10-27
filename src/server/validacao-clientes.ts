import type { DadosCliente } from "./db/repositorio";
import { cnpjValido, cpfValido, digitosOpcional, ehUf, normalizarEmail, normalizarNome, textoOpcional } from "./validacao";
import type { Opcional } from "./validacao";

export type ResultadoCliente = { ok: true; dados: DadosCliente } | { ok: false; erro: string };

export function dataValida(texto: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const [a, m, d] = texto.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return false;
  return a >= 1900 && dt.getTime() <= Date.now();
}

function emailOpcional(valor: unknown): Opcional<string> {
  if (valor === undefined || valor === null || (typeof valor === "string" && valor.trim() === "")) return null;
  return normalizarEmail(valor) ?? false;
}

/** Valida e normaliza o cadastro de cliente (PF ou PJ). Campos vazios viram NULL; campos que não se aplicam ao tipo são descartados. */
export function validarCliente(corpo: Record<string, unknown>): ResultadoCliente {
  if (corpo.tipo !== "pf" && corpo.tipo !== "pj") return { ok: false, erro: "Escolha se o cliente é pessoa física ou jurídica." };
  const tipo = corpo.tipo;
  const nome = typeof corpo.nome === "string" && corpo.nome.trim().length > 150 ? null : normalizarNome(typeof corpo.nome === "string" ? corpo.nome : null);
  const rotuloNome = tipo === "pf" ? "Nome completo" : "Razão social";
  if (!nome) return { ok: false, erro: `${rotuloNome} é obrigatório (até 150 caracteres).` };
  const documento = digitosOpcional(corpo.documento, tipo === "pf" ? cpfValido : cnpjValido);
  if (documento === false) return { ok: false, erro: tipo === "pf" ? "CPF inválido. Confira os números." : "CNPJ inválido. Confira os números." };
  const fantasia = tipo === "pj" ? textoOpcional(corpo.nome_fantasia, 150) : null;
  const rg = tipo === "pf" ? textoOpcional(corpo.rg, 30) : null;
  const ie = tipo === "pj" ? textoOpcional(corpo.inscricao_estadual, 30) : null;
  if (fantasia === false) return { ok: false, erro: "Nome fantasia longo demais (máximo 150 caracteres)." };
  if (rg === false) return { ok: false, erro: "RG longo demais (máximo 30 caracteres)." };
  if (ie === false) return { ok: false, erro: "Inscrição estadual longa demais (máximo 30 caracteres)." };
  let nascimento: string | null = null;
  if (tipo === "pf" && corpo.data_nascimento !== undefined && corpo.data_nascimento !== null && corpo.data_nascimento !== "") {
    if (typeof corpo.data_nascimento !== "string" || !dataValida(corpo.data_nascimento)) return { ok: false, erro: "Data de nascimento inválida." };
    nascimento = corpo.data_nascimento;
  }
  const email = emailOpcional(corpo.email);
  if (email === false) return { ok: false, erro: "E-mail inválido." };
  const telefone = digitosOpcional(corpo.telefone, (d) => d.length === 10 || d.length === 11);
  if (telefone === false) return { ok: false, erro: "Telefone inválido: informe DDD e número (10 ou 11 dígitos)." };
  const celular = digitosOpcional(corpo.celular, (d) => d.length === 10 || d.length === 11);
  if (celular === false) return { ok: false, erro: "Celular inválido: informe DDD e número (10 ou 11 dígitos)." };
  const cep = digitosOpcional(corpo.cep, (d) => d.length === 8);
  if (cep === false) return { ok: false, erro: "CEP inválido: informe os 8 dígitos." };
  const logradouro = textoOpcional(corpo.logradouro, 150);
  const numero = textoOpcional(corpo.numero, 20);
  const complemento = textoOpcional(corpo.complemento, 80);
  const bairro = textoOpcional(corpo.bairro, 80);
  const cidade = textoOpcional(corpo.cidade, 80);
  if ([logradouro, numero, complemento, bairro, cidade].includes(false)) return { ok: false, erro: "Algum campo do endereço é longo demais." };
  let uf: string | null = null;
  if (corpo.uf !== undefined && corpo.uf !== null && corpo.uf !== "") {
    if (!ehUf(corpo.uf)) return { ok: false, erro: "UF inválida." };
    uf = corpo.uf;
  }
  const observacoes = textoOpcionalLongo(corpo.observacoes, 2000);
  if (observacoes === false) return { ok: false, erro: "Observações longas demais (máximo 2.000 caracteres)." };
  return {
    ok: true,
    dados: {
      tipo,
      nome,
      nome_fantasia: fantasia,
      documento,
      rg,
      inscricao_estadual: ie,
      data_nascimento: nascimento,
      email,
      telefone,
      celular,
      cep,
      logradouro: logradouro as string | null,
      numero: numero as string | null,
      complemento: complemento as string | null,
      bairro: bairro as string | null,
      cidade: cidade as string | null,
      uf,
      observacoes,
    },
  };
}

/** Texto livre com quebras de linha preservadas. */
function textoOpcionalLongo(valor: unknown, maximo: number): Opcional<string> {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== "string") return false;
  const t = valor.trim();
  if (t === "") return null;
  return t.length <= maximo ? t : false;
}

export interface DadosContato {
  nome: string;
  cargo: string | null;
  email: string | null;
  telefone: string | null;
}

export function validarContato(corpo: Record<string, unknown>): { ok: true; dados: DadosContato } | { ok: false; erro: string } {
  const nome = typeof corpo.nome === "string" && corpo.nome.trim().length > 120 ? null : normalizarNome(corpo.nome);
  if (!nome) return { ok: false, erro: "Informe o nome do contato (até 120 caracteres)." };
  const cargo = textoOpcional(corpo.cargo, 80);
  if (cargo === false) return { ok: false, erro: "Cargo ou relação longo demais (máximo 80 caracteres)." };
  const email = emailOpcional(corpo.email);
  if (email === false) return { ok: false, erro: "E-mail do contato inválido." };
  const telefone = digitosOpcional(corpo.telefone, (d) => d.length === 10 || d.length === 11);
  if (telefone === false) return { ok: false, erro: "Telefone do contato inválido: informe DDD e número." };
  return { ok: true, dados: { nome, cargo, email, telefone } };
}

export interface DadosConsentimento {
  finalidade: string;
  base_legal: string | null;
  forma: string;
  data_consentimento: string;
}

/** Os textos são do escritório: o sistema só guarda e exibe. */
export function validarConsentimento(corpo: Record<string, unknown>): { ok: true; dados: DadosConsentimento } | { ok: false; erro: string } {
  const finalidade = textoOpcional(corpo.finalidade, 500);
  if (finalidade === null || finalidade === false) return { ok: false, erro: "Descreva a finalidade (até 500 caracteres)." };
  const base = textoOpcional(corpo.base_legal, 200);
  if (base === false) return { ok: false, erro: "Base legal longa demais (máximo 200 caracteres)." };
  const forma = textoOpcional(corpo.forma, 200);
  if (forma === null || forma === false) return { ok: false, erro: "Descreva a forma como o consentimento foi dado (até 200 caracteres)." };
  if (typeof corpo.data_consentimento !== "string" || !dataValida(corpo.data_consentimento)) return { ok: false, erro: "Informe a data do consentimento (não pode ser futura)." };
  return { ok: true, dados: { finalidade, base_legal: base, forma, data_consentimento: corpo.data_consentimento } };
}
