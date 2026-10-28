/**
 * CAMADA DE DADOS DO PORTAL DO CLIENTE (SQL somente aqui, como em repositorio.ts).
 *
 * Três portas, cada uma com sua regra de escritório:
 *  - `criarGestaoPortal(db, tenantId)`: o lado do ESCRITÓRIO (convidar, publicar, retirar). tenantId vem da sessão do usuário do escritório.
 *  - `criarAcessoPortal(db)`: etapas ANTES de existir sessão do portal (login por e-mail, convite, leitura da sessão pelo hash do cookie).
 *    O escritório e o cliente são descobertos a partir do registro, nunca recebidos do navegador.
 *  - `criarRepositorioPortal(db, tenantId, clienteId)`: o que o CLIENTE lê. tenantId e clienteId vêm SEMPRE da sessão do portal,
 *    e toda consulta filtra por eles E pelos marcadores de visibilidade (nada aparece por padrão).
 */
import type { StatusEscritorio } from "./repositorio";

// ---------- Tipos ----------

export interface LinhaPortalUsuario {
  id: string;
  tenant_id: string;
  cliente_id: string;
  email: string;
  senha_hash: string;
  senha_salt: string;
  senha_definida: number;
  tentativas_falhas: number;
  bloqueado_ate: string | null;
  ativo: number;
  convidado_por: string | null;
  ultimo_acesso_em: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface UsuarioPortalComContexto extends LinhaPortalUsuario {
  tenant_nome: string;
  tenant_status: StatusEscritorio;
  cliente_nome: string;
  cliente_ativo: number;
  /** 1 se o cliente tem ao menos um consentimento LGPD não revogado (regra provisória: ver docs/PORTAL.md). */
  consentimento_ativo: number;
}

export interface LinhaSessaoPortal {
  id: string;
  tenant_id: string;
  portal_usuario_id: string;
  expira_em: string;
  criado_em: string;
}

export interface LinhaConvitePortal {
  id: string;
  tenant_id: string;
  portal_usuario_id: string;
  expira_em: string;
  usado_em: string | null;
}

export interface ProcessoDoPortal {
  id: string;
  numero_cnj: string;
  fase: string;
  tribunal: string | null;
  orgao: string | null;
}
export interface AndamentoDoPortal {
  id: string;
  data: string;
  descricao: string;
}
export interface ResumoDoPortal {
  texto: string;
  data_disponibilizacao: string | null;
  publicado_em: string;
}
export interface DocumentoDoPortal {
  id: string;
  nome_original: string;
  tipo_mime: string;
  tamanho_bytes: number;
  criado_em: string;
}
export interface DocumentoParaBaixar extends DocumentoDoPortal {
  chave_r2: string;
}

export type ResultadoMarcador = "ok" | "inexistente" | "inativo";
export type ResultadoPublicarResumo = "ok" | "ja_publicado" | "inexistente" | "nao_aprovado" | "sem_processo";

const LIMITE_LISTA = 200;
export const LIMITE_ANDAMENTOS_PORTAL = 100;

function agora(): string {
  return new Date().toISOString();
}

/**
 * REGRA PROVISÓRIA DE CONSENTIMENTO (a confirmar com o usuário): o modelo de consentimentos não tem "tipo", só texto livre de
 * finalidade. Por isso basta existir UM consentimento do cliente que não foi revogado. Esta é a única definição da regra.
 */
const CONSENTIMENTO_ATIVO = (alias: string) =>
  `EXISTS (SELECT 1 FROM consentimentos_lgpd k WHERE k.tenant_id = ${alias}.tenant_id AND k.cliente_id = ${alias}.cliente_id AND k.revogado_em IS NULL)`;

const SELECT_USUARIO_CONTEXTO = `SELECT u.*, t.nome AS tenant_nome, t.status AS tenant_status, c.nome AS cliente_nome, c.ativo AS cliente_ativo,
    ${CONSENTIMENTO_ATIVO("u")} AS consentimento_ativo
  FROM portal_usuarios u
  JOIN tenants t ON t.id = u.tenant_id
  JOIN clientes c ON c.id = u.cliente_id AND c.tenant_id = u.tenant_id`;

// ---------- Escritório: convidar e publicar ----------

export interface GestaoPortal {
  readonly tenantId: string;
  usuariosDoCliente(clienteId: string): Promise<LinhaPortalUsuario[]>;
  buscarUsuario(id: string): Promise<LinhaPortalUsuario | null>;
  buscarPorEmail(email: string): Promise<LinhaPortalUsuario | null>;
  /** Cliente com ao menos um consentimento LGPD não revogado (a mesma regra do login do portal). */
  temConsentimentoAtivo(clienteId: string): Promise<boolean>;
  /** Cria o acesso (sem senha utilizável, aguardando o convite). O cliente precisa ser deste escritório (chave composta). */
  criarUsuario(dados: { clienteId: string; email: string; convidadoPor: string; senhaHash: string; senhaSalt: string }): Promise<string>;
  /** Invalida convites anteriores ainda não usados do acesso e grava o novo (só o hash do token). */
  criarConvite(dados: { usuarioId: string; tokenHash: string; expiraEm: string; criadoPor: string }): Promise<void>;
  /** Ativa ou desativa o acesso. Ao desativar, as sessões abertas caem na hora. Falso se o acesso não existe neste escritório. */
  definirAtivo(id: string, ativo: boolean): Promise<boolean>;
  definirProcessoVisivel(processoId: string, visivel: boolean): Promise<ResultadoMarcador>;
  definirAndamentoVisivel(processoId: string, andamentoId: string, visivel: boolean): Promise<ResultadoMarcador>;
  definirAnexoCompartilhado(anexoId: string, compartilhado: boolean): Promise<ResultadoMarcador>;
  /** Só resumo aprovado, de intimação vinculada a um processo. */
  publicarResumo(intimacaoId: string, userId: string, agoraIso: string): Promise<ResultadoPublicarResumo>;
  retirarResumo(intimacaoId: string): Promise<boolean>;
}

export function criarGestaoPortal(db: D1Database, tenantId: string): GestaoPortal {
  if (typeof tenantId !== "string" || tenantId.trim() === "") throw new Error("tenantId obrigatório: deve ser um texto não vazio.");
  const tid = tenantId;

  async function existe(sql: string, ...params: string[]): Promise<boolean> {
    return (await db.prepare(sql).bind(...params).first()) !== null;
  }

  return {
    tenantId: tid,
    async usuariosDoCliente(clienteId) {
      const { results } = await db
        .prepare("SELECT * FROM portal_usuarios WHERE tenant_id = ? AND cliente_id = ? ORDER BY criado_em, id LIMIT 50")
        .bind(tid, clienteId)
        .all<LinhaPortalUsuario>();
      return results;
    },
    async buscarUsuario(id) {
      return (await db.prepare("SELECT * FROM portal_usuarios WHERE id = ? AND tenant_id = ?").bind(id, tid).first<LinhaPortalUsuario>()) ?? null;
    },
    async buscarPorEmail(email) {
      return (await db.prepare("SELECT * FROM portal_usuarios WHERE email = ? AND tenant_id = ?").bind(email, tid).first<LinhaPortalUsuario>()) ?? null;
    },
    async temConsentimentoAtivo(clienteId) {
      return existe("SELECT 1 FROM consentimentos_lgpd WHERE tenant_id = ? AND cliente_id = ? AND revogado_em IS NULL LIMIT 1", tid, clienteId);
    },
    async criarUsuario(d) {
      const id = crypto.randomUUID();
      const ts = agora();
      await db
        .prepare(
          `INSERT INTO portal_usuarios (id, tenant_id, cliente_id, email, senha_hash, senha_salt, senha_definida, ativo, convidado_por, criado_em, atualizado_em)
           VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?)`,
        )
        .bind(id, tid, d.clienteId, d.email, d.senhaHash, d.senhaSalt, d.convidadoPor, ts, ts)
        .run();
      return id;
    },
    async criarConvite(d) {
      await db.batch([
        db.prepare("DELETE FROM portal_convites WHERE tenant_id = ? AND portal_usuario_id = ? AND usado_em IS NULL").bind(tid, d.usuarioId),
        db
          .prepare("INSERT INTO portal_convites (id, tenant_id, portal_usuario_id, expira_em, criado_por, criado_em) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(d.tokenHash, tid, d.usuarioId, d.expiraEm, d.criadoPor, agora()),
      ]);
    },
    async definirAtivo(id, ativo) {
      const r = await db
        .prepare("UPDATE portal_usuarios SET ativo = ?, atualizado_em = ? WHERE id = ? AND tenant_id = ?")
        .bind(ativo ? 1 : 0, agora(), id, tid)
        .run();
      if (r.meta.changes === 0) return false;
      if (!ativo) await db.prepare("DELETE FROM portal_sessoes WHERE tenant_id = ? AND portal_usuario_id = ?").bind(tid, id).run();
      return true;
    },
    async definirProcessoVisivel(processoId, visivel) {
      const r = await db
        .prepare("UPDATE processos SET visivel_portal = ? WHERE id = ? AND tenant_id = ? AND (? = 0 OR ativo = 1)")
        .bind(visivel ? 1 : 0, processoId, tid, visivel ? 1 : 0)
        .run();
      if (r.meta.changes > 0) return "ok";
      return (await existe("SELECT 1 FROM processos WHERE id = ? AND tenant_id = ?", processoId, tid)) ? "inativo" : "inexistente";
    },
    async definirAndamentoVisivel(processoId, andamentoId, visivel) {
      const v = visivel ? 1 : 0;
      const r = await db
        .prepare(
          `UPDATE processos_andamentos SET visivel_portal = ? WHERE id = ? AND processo_id = ? AND tenant_id = ?
           AND (? = 0 OR EXISTS (SELECT 1 FROM processos p WHERE p.id = processos_andamentos.processo_id AND p.tenant_id = processos_andamentos.tenant_id AND p.ativo = 1))`,
        )
        .bind(v, andamentoId, processoId, tid, v)
        .run();
      if (r.meta.changes > 0) return "ok";
      return (await existe("SELECT 1 FROM processos_andamentos WHERE id = ? AND processo_id = ? AND tenant_id = ?", andamentoId, processoId, tid)) ? "inativo" : "inexistente";
    },
    async definirAnexoCompartilhado(anexoId, compartilhado) {
      const v = compartilhado ? 1 : 0;
      const r = await db
        .prepare(
          `UPDATE anexos SET compartilhado_cliente = ? WHERE id = ? AND tenant_id = ? AND (? = 0 OR (
             (entidade = 'cliente' AND EXISTS (SELECT 1 FROM clientes c WHERE c.id = anexos.entidade_id AND c.tenant_id = anexos.tenant_id AND c.ativo = 1))
             OR (entidade = 'processo' AND EXISTS (SELECT 1 FROM processos p WHERE p.id = anexos.entidade_id AND p.tenant_id = anexos.tenant_id AND p.ativo = 1))))`,
        )
        .bind(v, anexoId, tid, v)
        .run();
      if (r.meta.changes > 0) return "ok";
      return (await existe("SELECT 1 FROM anexos WHERE id = ? AND tenant_id = ?", anexoId, tid)) ? "inativo" : "inexistente";
    },
    async publicarResumo(intimacaoId, userId, agoraIso) {
      const r = await db
        .prepare(
          `INSERT INTO portal_resumos_publicados (tenant_id, intimacao_id, publicado_por, publicado_em)
           SELECT r.tenant_id, r.intimacao_id, ?, ? FROM intimacoes_resumos r
           JOIN intimacoes i ON i.id = r.intimacao_id AND i.tenant_id = r.tenant_id
           WHERE r.tenant_id = ? AND r.intimacao_id = ? AND r.situacao = 'aprovado' AND i.processo_id IS NOT NULL
           ON CONFLICT (tenant_id, intimacao_id) DO NOTHING`,
        )
        .bind(userId, agoraIso, tid, intimacaoId)
        .run();
      if (r.meta.changes > 0) return "ok";
      const resumo = await db
        .prepare(
          `SELECT r.situacao AS situacao, i.processo_id AS processo_id,
                  EXISTS (SELECT 1 FROM portal_resumos_publicados p WHERE p.tenant_id = r.tenant_id AND p.intimacao_id = r.intimacao_id) AS publicado
           FROM intimacoes_resumos r JOIN intimacoes i ON i.id = r.intimacao_id AND i.tenant_id = r.tenant_id
           WHERE r.tenant_id = ? AND r.intimacao_id = ?`,
        )
        .bind(tid, intimacaoId)
        .first<{ situacao: string; processo_id: string | null; publicado: number }>();
      if (!resumo) return "inexistente";
      if (resumo.situacao !== "aprovado") return "nao_aprovado";
      if (resumo.processo_id === null) return "sem_processo";
      return "ja_publicado";
    },
    async retirarResumo(intimacaoId) {
      const r = await db.prepare("DELETE FROM portal_resumos_publicados WHERE tenant_id = ? AND intimacao_id = ?").bind(tid, intimacaoId).run();
      return r.meta.changes > 0;
    },
  };
}

// ---------- Antes da sessão do portal ----------

export interface AcessoPortal {
  usuariosPorEmail(email: string): Promise<UsuarioPortalComContexto[]>;
  /** Pelo par vindo da sessão/convite no banco (nunca do navegador). */
  usuario(id: string, tenantId: string): Promise<UsuarioPortalComContexto | null>;
  registrarFalha(id: string, maximo: number, bloqueadoAte: string): Promise<void>;
  zerarFalhas(id: string): Promise<void>;
  definirSenha(id: string, dados: { senha_hash: string; senha_salt: string }): Promise<void>;
  registrarAcesso(id: string, agoraIso: string): Promise<void>;
  criarSessao(d: { id: string; tenant_id: string; portal_usuario_id: string; expira_em: string; ip: string | null; user_agent: string | null }): Promise<void>;
  buscarSessao(id: string): Promise<LinhaSessaoPortal | null>;
  excluirSessao(id: string): Promise<void>;
  limparSessoesExpiradas(): Promise<void>;
  buscarConvite(id: string): Promise<LinhaConvitePortal | null>;
  /** Marca como usado de forma atômica. Falso se já usado ou expirado. */
  consumirConvite(id: string, agoraIso: string): Promise<boolean>;
}

export function criarAcessoPortal(db: D1Database): AcessoPortal {
  return {
    async usuariosPorEmail(email) {
      const { results } = await db.prepare(`${SELECT_USUARIO_CONTEXTO} WHERE u.email = ? ORDER BY u.criado_em, u.id LIMIT 50`).bind(email).all<UsuarioPortalComContexto>();
      return results;
    },
    async usuario(id, tenantId) {
      return (await db.prepare(`${SELECT_USUARIO_CONTEXTO} WHERE u.id = ? AND u.tenant_id = ?`).bind(id, tenantId).first<UsuarioPortalComContexto>()) ?? null;
    },
    async registrarFalha(id, maximo, bloqueadoAte) {
      await db
        .prepare(
          `UPDATE portal_usuarios SET
             bloqueado_ate = CASE WHEN tentativas_falhas + 1 >= ? THEN ? ELSE bloqueado_ate END,
             tentativas_falhas = CASE WHEN tentativas_falhas + 1 >= ? THEN 0 ELSE tentativas_falhas + 1 END
           WHERE id = ?`,
        )
        .bind(maximo, bloqueadoAte, maximo, id)
        .run();
    },
    async zerarFalhas(id) {
      await db.prepare("UPDATE portal_usuarios SET tentativas_falhas = 0, bloqueado_ate = NULL WHERE id = ?").bind(id).run();
    },
    async definirSenha(id, d) {
      await db
        .prepare("UPDATE portal_usuarios SET senha_hash = ?, senha_salt = ?, senha_definida = 1, tentativas_falhas = 0, bloqueado_ate = NULL, atualizado_em = ? WHERE id = ?")
        .bind(d.senha_hash, d.senha_salt, agora(), id)
        .run();
    },
    async registrarAcesso(id, agoraIso) {
      await db.prepare("UPDATE portal_usuarios SET ultimo_acesso_em = ? WHERE id = ?").bind(agoraIso, id).run();
    },
    async criarSessao(d) {
      await db
        .prepare("INSERT INTO portal_sessoes (id, tenant_id, portal_usuario_id, expira_em, criado_em, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(d.id, d.tenant_id, d.portal_usuario_id, d.expira_em, agora(), d.ip, d.user_agent)
        .run();
    },
    async buscarSessao(id) {
      return (await db.prepare("SELECT id, tenant_id, portal_usuario_id, expira_em, criado_em FROM portal_sessoes WHERE id = ?").bind(id).first<LinhaSessaoPortal>()) ?? null;
    },
    async excluirSessao(id) {
      await db.prepare("DELETE FROM portal_sessoes WHERE id = ?").bind(id).run();
    },
    async limparSessoesExpiradas() {
      await db.prepare("DELETE FROM portal_sessoes WHERE expira_em <= ?").bind(agora()).run();
    },
    async buscarConvite(id) {
      return (await db.prepare("SELECT id, tenant_id, portal_usuario_id, expira_em, usado_em FROM portal_convites WHERE id = ?").bind(id).first<LinhaConvitePortal>()) ?? null;
    },
    async consumirConvite(id, agoraIso) {
      const r = await db.prepare("UPDATE portal_convites SET usado_em = ? WHERE id = ? AND usado_em IS NULL AND expira_em > ?").bind(agoraIso, id, agoraIso).run();
      return r.meta.changes > 0;
    },
  };
}

// ---------- O que o cliente lê (sessão do portal) ----------

export interface RepositorioPortal {
  readonly tenantId: string;
  readonly clienteId: string;
  /** Processos ATIVOS marcados "visível no portal" em que o cliente é parte. */
  processos(): Promise<ProcessoDoPortal[]>;
  processo(id: string): Promise<ProcessoDoPortal | null>;
  /** Só andamentos marcados como visíveis, de processo visível do cliente. */
  andamentos(processoId: string): Promise<AndamentoDoPortal[]>;
  /** Só resumos APROVADOS e publicados, de processo visível do cliente. Nunca o texto da intimação. */
  resumos(processoId: string): Promise<ResumoDoPortal[]>;
  /** Documentos compartilhados de um processo visível do cliente. */
  documentosDoProcesso(processoId: string): Promise<DocumentoDoPortal[]>;
  /** Documentos compartilhados do cadastro do próprio cliente. */
  documentosDoCliente(): Promise<DocumentoDoPortal[]>;
  /** Um documento, só se estiver compartilhado e ligado ao cliente (ou a processo visível dele). */
  documento(id: string): Promise<DocumentoParaBaixar | null>;
}

export function criarRepositorioPortal(db: D1Database, tenantId: string, clienteId: string): RepositorioPortal {
  if (typeof tenantId !== "string" || tenantId.trim() === "" || typeof clienteId !== "string" || clienteId.trim() === "") {
    throw new Error("tenantId e clienteId obrigatórios: devem vir da sessão do portal.");
  }
  const tid = tenantId;
  const cid = clienteId;
  const PARTE = (p: string) =>
    `EXISTS (SELECT 1 FROM processos_partes pp WHERE pp.tenant_id = ${p}.tenant_id AND pp.processo_id = ${p}.id AND pp.cliente_id = ?)`;
  const COLUNAS_DOC = "a.id, a.nome_original, a.tipo_mime, a.tamanho_bytes, a.criado_em";
  // Documento acessível: compartilhado E (do cadastro do cliente OU de processo ativo, visível, em que o cliente é parte). Usa 2 parâmetros: cid, cid.
  const ACESSO_DOC = `a.compartilhado_cliente = 1 AND ((a.entidade = 'cliente' AND a.entidade_id = ?) OR (a.entidade = 'processo' AND EXISTS (
    SELECT 1 FROM processos p WHERE p.tenant_id = a.tenant_id AND p.id = a.entidade_id AND p.ativo = 1 AND p.visivel_portal = 1 AND ${PARTE("p")})))`;

  return {
    tenantId: tid,
    clienteId: cid,
    async processos() {
      const { results } = await db
        .prepare(
          `SELECT p.id, p.numero_cnj, p.fase, p.tribunal, p.orgao FROM processos p
           WHERE p.tenant_id = ? AND p.ativo = 1 AND p.visivel_portal = 1 AND ${PARTE("p")}
           ORDER BY p.criado_em DESC, p.id LIMIT ?`,
        )
        .bind(tid, cid, LIMITE_LISTA)
        .all<ProcessoDoPortal>();
      return results;
    },
    async processo(id) {
      return (
        (await db
          .prepare(
            `SELECT p.id, p.numero_cnj, p.fase, p.tribunal, p.orgao FROM processos p
             WHERE p.tenant_id = ? AND p.id = ? AND p.ativo = 1 AND p.visivel_portal = 1 AND ${PARTE("p")}`,
          )
          .bind(tid, id, cid)
          .first<ProcessoDoPortal>()) ?? null
      );
    },
    async andamentos(processoId) {
      const { results } = await db
        .prepare(
          `SELECT a.id, a.data, a.descricao FROM processos_andamentos a
           JOIN processos p ON p.id = a.processo_id AND p.tenant_id = a.tenant_id
           WHERE a.tenant_id = ? AND a.processo_id = ? AND a.visivel_portal = 1
             AND p.ativo = 1 AND p.visivel_portal = 1 AND ${PARTE("p")}
           ORDER BY a.data DESC, a.criado_em DESC, a.id LIMIT ?`,
        )
        .bind(tid, processoId, cid, LIMITE_ANDAMENTOS_PORTAL)
        .all<AndamentoDoPortal>();
      return results;
    },
    async resumos(processoId) {
      const { results } = await db
        .prepare(
          `SELECT r.texto AS texto, i.data_disponibilizacao AS data_disponibilizacao, pub.publicado_em AS publicado_em
           FROM portal_resumos_publicados pub
           JOIN intimacoes_resumos r ON r.tenant_id = pub.tenant_id AND r.intimacao_id = pub.intimacao_id AND r.situacao = 'aprovado'
           JOIN intimacoes i ON i.id = pub.intimacao_id AND i.tenant_id = pub.tenant_id
           JOIN processos p ON p.id = i.processo_id AND p.tenant_id = i.tenant_id
           WHERE pub.tenant_id = ? AND i.processo_id = ? AND p.ativo = 1 AND p.visivel_portal = 1 AND ${PARTE("p")}
           ORDER BY i.data_disponibilizacao DESC, pub.publicado_em DESC, pub.intimacao_id LIMIT ?`,
        )
        .bind(tid, processoId, cid, LIMITE_ANDAMENTOS_PORTAL)
        .all<ResumoDoPortal>();
      return results;
    },
    async documentosDoProcesso(processoId) {
      const { results } = await db
        .prepare(`SELECT ${COLUNAS_DOC} FROM anexos a WHERE a.tenant_id = ? AND a.entidade = 'processo' AND a.entidade_id = ? AND ${ACESSO_DOC} ORDER BY a.criado_em DESC, a.id LIMIT ?`)
        .bind(tid, processoId, cid, cid, LIMITE_LISTA)
        .all<DocumentoDoPortal>();
      return results;
    },
    async documentosDoCliente() {
      const { results } = await db
        .prepare(`SELECT ${COLUNAS_DOC} FROM anexos a WHERE a.tenant_id = ? AND a.entidade = 'cliente' AND ${ACESSO_DOC} ORDER BY a.criado_em DESC, a.id LIMIT ?`)
        .bind(tid, cid, cid, LIMITE_LISTA)
        .all<DocumentoDoPortal>();
      return results;
    },
    async documento(id) {
      return (
        (await db
          .prepare(`SELECT ${COLUNAS_DOC}, a.chave_r2 FROM anexos a WHERE a.tenant_id = ? AND a.id = ? AND ${ACESSO_DOC}`)
          .bind(tid, id, cid, cid)
          .first<DocumentoParaBaixar>()) ?? null
      );
    },
  };
}
