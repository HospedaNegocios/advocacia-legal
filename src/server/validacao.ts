import type { Ctx } from "./contexto";
import { UFS } from "./db/repositorio";
import type { DadosPerfilEscritorio, Perfil, Plano } from "./db/repositorio";

export const PLANOS: readonly Plano[] = ["solo", "escritorio", "banca"];
export const PERFIS: readonly Perfil[] = ["socio", "advogado", "estagiario", "secretaria"];

export async function lerJson(c: Ctx): Promise<Record<string, unknown>> {
  try {
    const corpo = await c.req.json();
    return corpo !== null && typeof corpo === "object" && !Array.isArray(corpo) ? (corpo as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const FORMATO_EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]+$/;

export function normalizarEmail(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const email = valor.trim().toLowerCase();
  return email.length <= 254 && FORMATO_EMAIL.test(email) ? email : null;
}

export function normalizarNome(valor: unknown, maximo = 120): string | null {
  if (typeof valor !== "string") return null;
  const nome = valor.trim().replace(/\s+/g, " ");
  return nome.length >= 1 && nome.length <= maximo ? nome : null;
}

export function ehPlano(v: unknown): v is Plano {
  return typeof v === "string" && (PLANOS as readonly string[]).includes(v);
}

export function ehPerfil(v: unknown): v is Perfil {
  return typeof v === "string" && (PERFIS as readonly string[]).includes(v);
}

export function respostaErro(c: Ctx, status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 500 | 503, erro: string) {
  return c.json({ ok: false, erro }, status);
}

// ---------- Dados do escritório e OABs ----------

export function apenasDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

function todosIguais(d: string): boolean {
  return /^(\d)\1+$/.test(d);
}

export function cpfValido(valor: string): boolean {
  const d = apenasDigitos(valor);
  if (d.length !== 11 || todosIguais(d)) return false;
  for (const tamanho of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(d[i]) * (tamanho + 1 - i);
    const dv = ((soma * 10) % 11) % 10;
    if (dv !== Number(d[tamanho])) return false;
  }
  return true;
}

export function cnpjValido(valor: string): boolean {
  const d = apenasDigitos(valor);
  if (d.length !== 14 || todosIguais(d)) return false;
  for (const tamanho of [12, 13]) {
    const pesos = tamanho === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < tamanho; i++) soma += Number(d[i]) * (pesos[i] as number);
    const resto = soma % 11;
    const dv = resto < 2 ? 0 : 11 - resto;
    if (dv !== Number(d[tamanho])) return false;
  }
  return true;
}

/** Resultado de um campo opcional: `undefined` = vazio (vira NULL); `false` = inválido. */
export type Opcional<T> = T | null | false;

export function textoOpcional(valor: unknown, maximo: number): Opcional<string> {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== "string") return false;
  const t = valor.trim().replace(/\s+/g, " ");
  if (t === "") return null;
  return t.length <= maximo ? t : false;
}

export function digitosOpcional(valor: unknown, aceita: (d: string) => boolean): Opcional<string> {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== "string") return false;
  const d = apenasDigitos(valor);
  if (d === "" && valor.trim() === "") return null;
  return aceita(d) ? d : false;
}

export function ehUf(v: unknown): v is string {
  return typeof v === "string" && (UFS as readonly string[]).includes(v);
}

export type ResultadoPerfil = { ok: true; dados: DadosPerfilEscritorio } | { ok: false; erro: string };

/** Valida e normaliza o corpo do perfil. Campos ausentes ou vazios viram NULL. */
export function validarPerfil(corpo: Record<string, unknown>): ResultadoPerfil {
  const razao = textoOpcional(corpo.razao_social, 150);
  if (razao === false) return { ok: false, erro: "Razão social inválida (máximo 150 caracteres)." };
  const documento = digitosOpcional(corpo.documento, (d) => cpfValido(d) || cnpjValido(d));
  if (documento === false) return { ok: false, erro: "CPF ou CNPJ inválido. Confira os números." };
  let email: Opcional<string> = null;
  if (corpo.email_contato !== undefined && corpo.email_contato !== null && String(corpo.email_contato).trim() !== "") {
    email = normalizarEmail(corpo.email_contato) ?? false;
  }
  if (email === false) return { ok: false, erro: "E-mail de contato inválido." };
  const telefone = digitosOpcional(corpo.telefone, (d) => d.length === 10 || d.length === 11);
  if (telefone === false) return { ok: false, erro: "Telefone inválido: informe DDD e número (10 ou 11 dígitos)." };
  const cep = digitosOpcional(corpo.cep, (d) => d.length === 8);
  if (cep === false) return { ok: false, erro: "CEP inválido: informe os 8 dígitos." };
  const logradouro = textoOpcional(corpo.logradouro, 150);
  const numero = textoOpcional(corpo.numero, 20);
  const complemento = textoOpcional(corpo.complemento, 80);
  const bairro = textoOpcional(corpo.bairro, 80);
  const cidade = textoOpcional(corpo.cidade, 80);
  if ([logradouro, numero, complemento, bairro, cidade].includes(false)) return { ok: false, erro: "Algum campo do endereço é longo demais." };
  let uf: Opcional<string> = null;
  if (corpo.uf !== undefined && corpo.uf !== null && corpo.uf !== "") {
    uf = ehUf(corpo.uf) ? corpo.uf : false;
  }
  if (uf === false) return { ok: false, erro: "UF inválida." };
  return {
    ok: true,
    dados: {
      razao_social: razao,
      documento,
      email_contato: email,
      telefone,
      cep,
      logradouro: logradouro as string | null,
      numero: numero as string | null,
      complemento: complemento as string | null,
      bairro: bairro as string | null,
      cidade: cidade as string | null,
      uf,
    },
  };
}

export interface DadosOab {
  numero: string;
  sufixo: string | null;
  uf: string;
  advogado_nome: string;
}

/** Valida os campos de identificação da OAB (número só dígitos sem zeros à esquerda; sufixo = letras após o hífen). */
export function validarOab(corpo: Record<string, unknown>): { ok: true; dados: DadosOab } | { ok: false; erro: string } {
  if (typeof corpo.numero !== "string" && typeof corpo.numero !== "number") return { ok: false, erro: "Informe o número da OAB." };
  const numero = apenasDigitos(String(corpo.numero)).replace(/^0+(?=\d)/, "");
  if (numero === "" || /^0+$/.test(numero) || numero.length > 10) return { ok: false, erro: "Número da OAB inválido: use só dígitos (até 10)." };
  let sufixo: string | null = null;
  if (corpo.sufixo !== undefined && corpo.sufixo !== null && String(corpo.sufixo).trim() !== "") {
    const s = String(corpo.sufixo).trim().toUpperCase();
    if (!/^[A-Z]{1,5}$/.test(s)) return { ok: false, erro: "Sufixo da OAB inválido: use só letras (até 5)." };
    sufixo = s;
  }
  if (!ehUf(corpo.uf)) return { ok: false, erro: "Escolha a UF da OAB." };
  const nome = normalizarNome(corpo.advogado_nome);
  if (!nome) return { ok: false, erro: "Informe o nome do advogado." };
  return { ok: true, dados: { numero, sufixo, uf: corpo.uf, advogado_nome: nome } };
}
