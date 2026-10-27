import {
  base64ParaBytes,
  bytesAleatorios,
  bytesParaBase64,
  iguaisEmTempoConstante,
  textoParaBytes,
} from "./codificacao";

// PBKDF2-SHA256 via WebCrypto. 100000 é o máximo de iterações permitido no Workers.
export const ITERACOES = 100_000;
export const TAMANHO_MINIMO_SENHA = 10;
export const TAMANHO_MAXIMO_SENHA = 200;
const PREFIXO = "pbkdf2-sha256";

async function derivar(senha: string, sal: Uint8Array<ArrayBuffer>, iteracoes: number): Promise<Uint8Array> {
  const chave = await crypto.subtle.importKey("raw", textoParaBytes(senha), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: sal, iterations: iteracoes }, chave, 256);
  return new Uint8Array(bits);
}

/** Valida a regra de tamanho. Devolve a mensagem de erro, ou null se válida. */
export function validarSenhaNova(senha: unknown): string | null {
  if (typeof senha !== "string") return "Informe a senha.";
  if ([...senha].length < TAMANHO_MINIMO_SENHA) return `A senha deve ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`;
  if (senha.length > TAMANHO_MAXIMO_SENHA) return `A senha deve ter no máximo ${TAMANHO_MAXIMO_SENHA} caracteres.`;
  return null;
}

/** Gera hash (formato `pbkdf2-sha256$iterações$base64`) e sal (base64) de 16 bytes aleatórios. */
export async function hashSenha(senha: string): Promise<{ senha_hash: string; senha_salt: string }> {
  const sal = bytesAleatorios(16);
  const derivada = await derivar(senha, sal, ITERACOES);
  return { senha_hash: `${PREFIXO}$${ITERACOES}$${bytesParaBase64(derivada)}`, senha_salt: bytesParaBase64(sal) };
}

const SAL_FALSO = new Uint8Array(16) as Uint8Array<ArrayBuffer>;

/**
 * Confere a senha. Sempre faz o cálculo completo (mesmo com hash inválido, como o das contas
 * convidadas que ainda não definiram senha), para não revelar nada pelo tempo de resposta.
 */
export async function verificarSenha(senha: string, senha_hash: string, senha_salt: string): Promise<boolean> {
  const partes = senha_hash.split("$");
  let iteracoes = ITERACOES;
  let esperado: Uint8Array | null = null;
  let sal: Uint8Array<ArrayBuffer> = SAL_FALSO;
  if (partes.length === 3 && partes[0] === PREFIXO) {
    const n = Number(partes[1]);
    if (Number.isInteger(n) && n >= 1 && n <= ITERACOES) {
      try {
        esperado = base64ParaBytes(partes[2] ?? "");
        sal = base64ParaBytes(senha_salt);
        iteracoes = n;
      } catch {
        esperado = null;
      }
    }
  }
  const calculada = await derivar(senha, sal, iteracoes);
  if (esperado === null) return false;
  return iguaisEmTempoConstante(calculada, esperado);
}

/** Hash que nunca confere com nenhuma senha (conta aguardando convite ou primeiro acesso). */
export const SENHA_INUTILIZAVEL = { senha_hash: "!", senha_salt: "!" } as const;
