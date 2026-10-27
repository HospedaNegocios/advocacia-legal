// Funções puras do script criar-dono (sem Node-only), para poderem ser testadas.
// O e-mail vem de um campo digitado em um workflow: validação ESTRITA antes de qualquer SQL.

export const HOSTS = { dev: "dev.app.advocacia.legal", prod: "app.advocacia.legal" };
export const VALIDADE_TOKEN_MS = 24 * 60 * 60 * 1000;

const FORMATO_EMAIL = /^[a-z0-9._%+-]{1,64}@([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24}$/;

/** Devolve o e-mail normalizado (minúsculas) ou lança erro. Só aceita caracteres seguros. */
export function validarEmail(bruto) {
  const email = String(bruto ?? "").trim().toLowerCase();
  if (email.length > 254 || !FORMATO_EMAIL.test(email)) {
    throw new Error("E-mail inválido. Use apenas letras, números e . _ % + - antes do @.");
  }
  return email;
}

export function validarAmbiente(bruto) {
  if (bruto !== "dev" && bruto !== "prod") throw new Error("Ambiente deve ser dev ou prod.");
  return bruto;
}

function paraBase64Url(bytes) {
  let texto = "";
  for (const b of bytes) texto += String.fromCharCode(b);
  return btoa(texto).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function gerarToken() {
  return paraBase64Url(globalThis.crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashDoToken(token) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function literal(texto) {
  // Todos os valores interpolados são gerados aqui ou já validados; mesmo assim, aspas são escapadas.
  return `'${String(texto).replaceAll("'", "''")}'`;
}

/**
 * Comandos SQL (um por item) que criam o dono se não existir e um token novo de primeiro acesso.
 * O dono nasce sem senha utilizável (senha_definida = 0, hash '!').
 * Tokens de primeiro acesso anteriores e ainda não usados deste dono são apagados.
 */
export function montarComandos({ email, tokenHash, agora = new Date(), idNovoUsuario = globalThis.crypto.randomUUID() }) {
  const ts = agora.toISOString();
  const expira = new Date(agora.getTime() + VALIDADE_TOKEN_MS).toISOString();
  const e = literal(email);
  const donoDoEmail = `SELECT id FROM users WHERE tenant_id IS NULL AND papel_plataforma = 'dono' AND email = ${e}`;
  return [
    `INSERT INTO users (id, tenant_id, papel_plataforma, perfil, nome, email, senha_hash, senha_salt, senha_definida, criado_em, atualizado_em) ` +
      `SELECT ${literal(idNovoUsuario)}, NULL, 'dono', NULL, 'Dono da plataforma', ${e}, '!', '!', 0, ${literal(ts)}, ${literal(ts)} ` +
      `WHERE NOT EXISTS (${donoDoEmail})`,
    `DELETE FROM tokens_acesso WHERE tipo = 'primeiro_acesso' AND usado_em IS NULL AND user_id IN (${donoDoEmail})`,
    `INSERT INTO tokens_acesso (id, tipo, user_id, tenant_id, expira_em, criado_por, criado_em) ` +
      `SELECT ${literal(tokenHash)}, 'primeiro_acesso', id, NULL, ${literal(expira)}, NULL, ${literal(ts)} FROM (${donoDoEmail})`,
  ];
}

export function montarLink(ambiente, token) {
  return `https://${HOSTS[ambiente]}/primeiro-acesso#${token}`;
}
