import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { criarAcessoPlataforma, criarRepositorio } from "../src/server/db/repositorio";
import type { Perfil, Plano } from "../src/server/db/repositorio";
import { hashSenha } from "../src/server/auth/senha";
import { base32Decodificar, gerarCodigo, passoDe } from "../src/server/auth/totp";
import { decifrar } from "../src/server/auth/cripto";

export const ORIGEM = "https://exemplo.test";
export const SENHA = "senha-de-teste-123";

let contador = 0;
export function unico(prefixo: string): string {
  contador += 1;
  return `${prefixo}${contador}-${crypto.randomUUID().slice(0, 8)}`;
}

export interface OpcoesChamada {
  corpo?: unknown;
  cookie?: string | null;
  ip?: string;
  origem?: string | null;
  marca?: string | null;
}

export interface Resposta {
  status: number;
  json: any;
  cookie: string | null;
  headers: Headers;
}

let ipAtual = 0;
export function novoIp(): string {
  ipAtual += 1;
  return `203.0.113.${ipAtual % 250}-${ipAtual}`;
}

/** Chama a API real (Worker) com Origin e X-Requested-With corretos por padrão. */
export async function chamar(metodo: string, caminho: string, o: OpcoesChamada = {}): Promise<Resposta> {
  const headers: Record<string, string> = { "CF-Connecting-IP": o.ip ?? novoIp() };
  if (o.origem !== null) headers["Origin"] = o.origem ?? ORIGEM;
  if (o.marca !== null) headers["X-Requested-With"] = o.marca ?? "advocacia";
  if (o.cookie) headers["Cookie"] = o.cookie;
  const init: RequestInit = { method: metodo, headers };
  if (o.corpo !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(o.corpo);
  }
  const r = await SELF.fetch(`${ORIGEM}${caminho}`, init);
  const texto = await r.text();
  let json: any = null;
  try {
    json = JSON.parse(texto);
  } catch {
    json = texto;
  }
  const setCookie = r.headers.get("set-cookie");
  const cookie = setCookie ? (setCookie.split(";")[0] ?? null) : null;
  return { status: r.status, json, cookie, headers: r.headers };
}

let hashCompartilhado: Promise<{ senha_hash: string; senha_salt: string }> | null = null;
/** Hash da SENHA de teste, calculado uma vez por arquivo (PBKDF2 é lento de propósito). */
export function hashDeTeste() {
  hashCompartilhado ??= hashSenha(SENHA);
  return hashCompartilhado;
}

export async function criarEscritorio(plano: Plano = "escritorio", exigir2fa = false) {
  const plataforma = criarAcessoPlataforma(env.DB);
  const id = await plataforma.criarEscritorio({ nome: unico("Escritório "), plano });
  if (exigir2fa) await criarRepositorio(env.DB, id).definirExigir2fa(true);
  return id;
}

export async function criarUsuario(tenantId: string, perfil: Perfil = "socio", email = `${unico("u")}@teste.com`) {
  const h = await hashDeTeste();
  const id = await criarRepositorio(env.DB, tenantId).users.inserir({ perfil, nome: "Usuário Teste", email, ...h });
  return { id, email };
}

export async function criarDono(email = `${unico("dono")}@teste.com`) {
  const h = await hashDeTeste();
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO users (id, tenant_id, papel_plataforma, perfil, nome, email, senha_hash, senha_salt, criado_em, atualizado_em) VALUES (?, NULL, 'dono', NULL, 'Dono', ?, ?, ?, 'a', 'a')",
  )
    .bind(id, email, h.senha_hash, h.senha_salt)
    .run();
  return { id, email };
}

/** Login simples (sem 2FA). Devolve o cookie. */
export async function entrar(email: string, extra: Partial<OpcoesChamada> = {}) {
  const r = await chamar("POST", "/api/auth/login", { corpo: { email, senha: SENHA }, ...extra });
  return r;
}

/** Ativa o TOTP para um usuário direto no banco e devolve o segredo (bytes). */
export async function ativarTotpNoBanco(userId: string): Promise<Uint8Array> {
  const { cifrar } = await import("../src/server/auth/cripto");
  const { base32Codificar, gerarSegredoTotp } = await import("../src/server/auth/totp");
  const segredo = gerarSegredoTotp();
  const cifrado = await cifrar(base32Codificar(segredo), env.CHAVE_CRIPTO);
  await env.DB.prepare("UPDATE users SET totp_secret = ?, totp_ativo = 1 WHERE id = ?").bind(cifrado, userId).run();
  return segredo;
}

export async function segredoDoBanco(userId: string): Promise<Uint8Array> {
  const l = await env.DB.prepare("SELECT totp_secret FROM users WHERE id = ?").bind(userId).first<{ totp_secret: string }>();
  return base32Decodificar(await decifrar(l!.totp_secret, env.CHAVE_CRIPTO));
}

/** Código TOTP de um passo (relativo ao atual). */
export async function codigoTotp(segredo: Uint8Array, deslocamentoPassos = 0): Promise<string> {
  return gerarCodigo(segredo, passoDe(Date.now()) + deslocamentoPassos);
}

/** Dono com 2FA ativo e sessão completa (passando pelo login + 2fa). */
export async function sessaoDeDono() {
  const dono = await criarDono();
  const segredo = await ativarTotpNoBanco(dono.id);
  const l = await entrar(dono.email);
  const r = await chamar("POST", "/api/auth/2fa", { corpo: { desafio: l.json.desafio, codigo: await codigoTotp(segredo) } });
  return { ...dono, segredo, cookie: r.cookie! };
}

/** Usuário de escritório com sessão (sem 2FA exigido). */
export async function sessaoDeUsuario(tenantId: string, perfil: Perfil = "socio") {
  const u = await criarUsuario(tenantId, perfil);
  const r = await entrar(u.email);
  return { ...u, cookie: r.cookie! };
}

/** Permite reutilizar um passo TOTP em testes que entram várias vezes com o mesmo usuário. */
export async function liberarPassoTotp(userId: string) {
  await env.DB.prepare("UPDATE users SET totp_ultimo_passo = NULL WHERE id = ?").bind(userId).run();
}
