/**
 * CAMADA DE ACESSO A DADOS — único lugar do projeto onde SQL é executado.
 *
 * Regras (ver CLAUDE.md, seção Segurança):
 *  - Todo acesso de escritório passa por `criarRepositorio(db, tenantId)`.
 *  - `tenant_id` é SEMPRE aplicado aqui (WHERE em select/update/delete e valor em insert).
 *    Qualquer `tenant_id` vindo nos dados é ignorado.
 *  - O `tenantId` deve vir da SESSÃO do usuário, nunca de parâmetro do navegador.
 *  - Nomes de tabela e coluna vêm de listas fixas (whitelist) deste arquivo; valores
 *    sempre viajam como parâmetros (`?`). Nome desconhecido lança erro.
 *  - O acesso à tabela `tenants` pelo dono da plataforma fica em `criarAcessoPlataforma`,
 *    que só deve ser usado pelo painel do dono (rotas protegidas por papel 'dono').
 */

// ---------- Tipos das linhas ----------

export type Plano = "solo" | "escritorio" | "banca";
export type StatusEscritorio = "teste" | "ativo" | "suspenso" | "cancelado";
export type Perfil = "socio" | "advogado" | "estagiario" | "secretaria";

export interface LinhaTenant {
  id: string;
  nome: string;
  plano: Plano;
  status: StatusEscritorio;
  teste_ate: string | null;
  exigir_2fa: number;
  criado_em: string;
  atualizado_em: string;
}

export interface LinhaUsuario {
  id: string;
  tenant_id: string | null;
  papel_plataforma: "dono" | null;
  perfil: Perfil | null;
  nome: string;
  email: string;
  senha_hash: string;
  senha_salt: string;
  totp_secret: string | null;
  totp_ativo: number;
  totp_ultimo_passo: number | null;
  senha_definida: number;
  tentativas_falhas: number;
  bloqueado_ate: string | null;
  ativo: number;
  criado_em: string;
  atualizado_em: string;
}

export interface LinhaSessao {
  id: string;
  user_id: string;
  tenant_id: string | null;
  expira_em: string;
  pendente_2fa: number;
  criado_em: string;
  ip: string | null;
  user_agent: string | null;
}

export interface LinhaTokenAcesso {
  /** SHA-256 (hex) do token. */
  id: string;
  tipo: "primeiro_acesso" | "convite";
  user_id: string;
  tenant_id: string | null;
  expira_em: string;
  usado_em: string | null;
  criado_por: string | null;
  criado_em: string;
}

export interface LinhaAuditoria {
  id: string;
  tenant_id: string | null;
  user_id: string | null;
  acao: string;
  entidade: string;
  entidade_id: string | null;
  detalhes: string | null;
  ip: string | null;
  criado_em: string;
}

// ---------- Whitelist de tabelas e colunas ----------

interface LinhasPorTabela {
  users: LinhaUsuario;
  sessions: LinhaSessao;
  tokens_acesso: LinhaTokenAcesso;
  audit_log: LinhaAuditoria;
}
export type TabelaDoEscritorio = keyof LinhasPorTabela;

interface ConfigTabela {
  /** Colunas que podem ser lidas como filtro e gravadas na inserção (exceto tenant_id). */
  readonly inserivel: readonly string[];
  /** Colunas que podem ser alteradas depois de criadas. */
  readonly atualizavel: readonly string[];
  readonly temAtualizadoEm: boolean;
  /** Tabelas imutáveis não têm update nem delete (auditoria). */
  readonly imutavel: boolean;
}

const TABELAS: Readonly<Record<TabelaDoEscritorio, ConfigTabela>> = {
  users: {
    // 'papel_plataforma' de propósito FORA da lista: o repositório de escritório
    // nunca cria nem promove dono da plataforma.
    inserivel: [
      "id", "perfil", "nome", "email", "senha_hash", "senha_salt", "senha_definida", "totp_secret", "totp_ativo",
      "totp_ultimo_passo", "tentativas_falhas", "bloqueado_ate", "ativo", "criado_em", "atualizado_em",
    ],
    atualizavel: [
      "perfil", "nome", "email", "senha_hash", "senha_salt", "senha_definida", "totp_secret", "totp_ativo",
      "totp_ultimo_passo", "tentativas_falhas", "bloqueado_ate", "ativo",
    ],
    temAtualizadoEm: true,
    imutavel: false,
  },
  sessions: {
    inserivel: ["id", "user_id", "expira_em", "pendente_2fa", "criado_em", "ip", "user_agent"],
    atualizavel: ["expira_em", "pendente_2fa"],
    temAtualizadoEm: false,
    imutavel: false,
  },
  tokens_acesso: {
    // 'tipo' só aceita 'convite' aqui na prática: o banco exige tenant_id NULL para 'primeiro_acesso'.
    inserivel: ["id", "tipo", "user_id", "expira_em", "usado_em", "criado_por", "criado_em"],
    atualizavel: ["usado_em"],
    temAtualizadoEm: false,
    imutavel: false,
  },
  audit_log: {
    inserivel: ["id", "user_id", "acao", "entidade", "entidade_id", "detalhes", "ip", "criado_em"],
    atualizavel: [],
    temAtualizadoEm: false,
    imutavel: true,
  },
};

// Colunas aceitas em filtros de leitura (além de tenant_id, que é sempre aplicado).
const COLUNAS_FILTRO: Readonly<Record<TabelaDoEscritorio, readonly string[]>> = {
  users: ["id", "perfil", "email", "ativo"],
  sessions: ["id", "user_id"],
  tokens_acesso: ["id", "user_id", "tipo"],
  audit_log: ["id", "user_id", "acao", "entidade", "entidade_id"],
};

const LIMITE_PADRAO = 50;
const LIMITE_MAXIMO = 200;

type Valor = string | number | null;

function agora(): string {
  return new Date().toISOString();
}

function exigirTenantId(tenantId: unknown): string {
  if (typeof tenantId !== "string" || tenantId.trim() === "") {
    throw new Error("tenantId obrigatório: deve ser um texto não vazio.");
  }
  return tenantId;
}

function exigirColunas(permitidas: readonly string[], recebidas: string[], contexto: string): void {
  for (const coluna of recebidas) {
    if (!permitidas.includes(coluna)) {
      throw new Error(`Coluna não permitida em ${contexto}: ${coluna}`);
    }
  }
}

function valoresDefinidos(dados: Record<string, unknown>): [string, Valor][] {
  const saida: [string, Valor][] = [];
  for (const [coluna, valor] of Object.entries(dados)) {
    if (valor === undefined) continue;
    if (valor !== null && typeof valor !== "string" && typeof valor !== "number") {
      throw new Error(`Valor inválido para a coluna ${coluna}.`);
    }
    saida.push([coluna, valor]);
  }
  return saida;
}

// ---------- Repositório do escritório ----------

export type Filtros<T> = { [K in keyof T]?: T[K] };
export type DadosNovos<T> = { [K in keyof T]?: T[K] };

export interface RepositorioTabela<T> {
  buscar(id: string): Promise<T | null>;
  listar(filtros?: Filtros<T>, opcoes?: { limite?: number; deslocamento?: number }): Promise<T[]>;
  inserir(dados: DadosNovos<T>): Promise<string>;
  atualizar(id: string, dados: DadosNovos<T>): Promise<boolean>;
  excluir(id: string): Promise<boolean>;
  /** Exclui, dentro do escritório, os registros que casam com TODOS os filtros (filtros obrigatórios). */
  excluirPor(filtros: Filtros<T>): Promise<number>;
}

export interface EntradaAuditoria {
  userId?: string | null;
  acao: string;
  entidade: string;
  entidadeId?: string | null;
  detalhes?: unknown;
  ip?: string | null;
}

export const ACOES_DE_ACESSO = ["login_sucesso", "login_falha", "logout"] as const;

export interface EntradaAcesso {
  id: string;
  acao: string;
  ip: string | null;
  criado_em: string;
  usuario_nome: string | null;
  usuario_email: string | null;
}

export interface Repositorio {
  readonly tenantId: string;
  /** Dados do próprio escritório (somente leitura). */
  buscarMeuEscritorio(): Promise<LinhaTenant | null>;
  /** O escritório só altera a exigência de 2FA do próprio registro (nome, plano e status são do dono). */
  definirExigir2fa(exigir: boolean): Promise<boolean>;
  users: RepositorioTabela<LinhaUsuario>;
  sessions: RepositorioTabela<LinhaSessao>;
  tokens: RepositorioTabela<LinhaTokenAcesso>;
  /** Auditoria: só leitura e registro (sem alterar/excluir). */
  auditoria: {
    registrar(entrada: EntradaAuditoria): Promise<string>;
    listar(filtros?: Filtros<LinhaAuditoria>, opcoes?: { limite?: number; deslocamento?: number }): Promise<LinhaAuditoria[]>;
    /** Entradas de login/logout do escritório, com nome e e-mail do usuário, mais recentes primeiro. */
    listarAcessos(opcoes?: { limite?: number; deslocamento?: number }): Promise<EntradaAcesso[]>;
  };
}

function montarTabela<N extends TabelaDoEscritorio>(
  db: D1Database,
  tenantId: string,
  nome: N,
): RepositorioTabela<LinhasPorTabela[N]> {
  type T = LinhasPorTabela[N];
  const cfg = TABELAS[nome];
  // `nome` vem do tipo TabelaDoEscritorio (literais fixos), nunca de entrada externa.

  return {
    async buscar(id) {
      const linha = await db
        .prepare(`SELECT * FROM ${nome} WHERE id = ? AND tenant_id = ?`)
        .bind(id, tenantId)
        .first<T>();
      return linha ?? null;
    },

    async listar(filtros = {}, opcoes = {}) {
      const pares = valoresDefinidos(filtros as Record<string, unknown>);
      exigirColunas(COLUNAS_FILTRO[nome], pares.map(([c]) => c), `filtro de ${nome}`);
      const condicoes = ["tenant_id = ?"];
      const params: Valor[] = [tenantId];
      for (const [coluna, valor] of pares) {
        if (valor === null) {
          condicoes.push(`${coluna} IS NULL`);
        } else {
          condicoes.push(`${coluna} = ?`);
          params.push(valor);
        }
      }
      const limite = Math.min(Math.max(Math.trunc(opcoes.limite ?? LIMITE_PADRAO), 1), LIMITE_MAXIMO);
      const deslocamento = Math.max(Math.trunc(opcoes.deslocamento ?? 0), 0);
      params.push(limite, deslocamento);
      const { results } = await db
        .prepare(`SELECT * FROM ${nome} WHERE ${condicoes.join(" AND ")} ORDER BY criado_em, id LIMIT ? OFFSET ?`)
        .bind(...params)
        .all<T>();
      return results;
    },

    async inserir(dados) {
      // tenant_id recebido nos dados é descartado: vale sempre o do repositório.
      const { tenant_id: _ignorado, ...resto } = dados as Record<string, unknown>;
      const pares = valoresDefinidos(resto);
      exigirColunas(cfg.inserivel, pares.map(([c]) => c), `inserção em ${nome}`);
      const mapa = new Map<string, Valor>(pares);
      const id = typeof mapa.get("id") === "string" && mapa.get("id") !== "" ? (mapa.get("id") as string) : crypto.randomUUID();
      mapa.set("id", id);
      if (!mapa.has("criado_em")) mapa.set("criado_em", agora());
      if (cfg.temAtualizadoEm && !mapa.has("atualizado_em")) mapa.set("atualizado_em", mapa.get("criado_em") as string);
      mapa.set("tenant_id", tenantId);
      const colunas = [...mapa.keys()];
      await db
        .prepare(`INSERT INTO ${nome} (${colunas.join(", ")}) VALUES (${colunas.map(() => "?").join(", ")})`)
        .bind(...colunas.map((c) => mapa.get(c) as Valor))
        .run();
      return id;
    },

    async atualizar(id, dados) {
      if (cfg.imutavel) throw new Error(`A tabela ${nome} é imutável.`);
      const { tenant_id: _ignorado, ...resto } = dados as Record<string, unknown>;
      const pares = valoresDefinidos(resto);
      exigirColunas(cfg.atualizavel, pares.map(([c]) => c), `atualização de ${nome}`);
      if (pares.length === 0) return false;
      if (cfg.temAtualizadoEm) pares.push(["atualizado_em", agora()]);
      const sets = pares.map(([c]) => `${c} = ?`).join(", ");
      const r = await db
        .prepare(`UPDATE ${nome} SET ${sets} WHERE id = ? AND tenant_id = ?`)
        .bind(...pares.map(([, v]) => v), id, tenantId)
        .run();
      return r.meta.changes > 0;
    },

    async excluir(id) {
      if (cfg.imutavel) throw new Error(`A tabela ${nome} é imutável.`);
      const r = await db.prepare(`DELETE FROM ${nome} WHERE id = ? AND tenant_id = ?`).bind(id, tenantId).run();
      return r.meta.changes > 0;
    },

    async excluirPor(filtros) {
      if (cfg.imutavel) throw new Error(`A tabela ${nome} é imutável.`);
      const pares = valoresDefinidos(filtros as Record<string, unknown>);
      if (pares.length === 0) throw new Error("excluirPor exige ao menos um filtro.");
      exigirColunas(COLUNAS_FILTRO[nome], pares.map(([c]) => c), `exclusão em ${nome}`);
      const condicoes = ["tenant_id = ?"];
      const params: Valor[] = [tenantId];
      for (const [coluna, valor] of pares) {
        if (valor === null) {
          condicoes.push(`${coluna} IS NULL`);
        } else {
          condicoes.push(`${coluna} = ?`);
          params.push(valor);
        }
      }
      const r = await db
        .prepare(`DELETE FROM ${nome} WHERE ${condicoes.join(" AND ")}`)
        .bind(...params)
        .run();
      return r.meta.changes;
    },
  };
}

/**
 * Cria o repositório de UM escritório. `tenantId` deve vir da sessão autenticada.
 * Lança erro se vazio ou não for texto.
 */
export function criarRepositorio(db: D1Database, tenantId: string): Repositorio {
  const tid = exigirTenantId(tenantId);
  const auditoriaBase = montarTabela(db, tid, "audit_log");

  return {
    tenantId: tid,
    async buscarMeuEscritorio() {
      const linha = await db.prepare("SELECT * FROM tenants WHERE id = ?").bind(tid).first<LinhaTenant>();
      return linha ?? null;
    },
    async definirExigir2fa(exigir) {
      const r = await db
        .prepare("UPDATE tenants SET exigir_2fa = ?, atualizado_em = ? WHERE id = ?")
        .bind(exigir ? 1 : 0, agora(), tid)
        .run();
      return r.meta.changes > 0;
    },
    users: montarTabela(db, tid, "users"),
    sessions: montarTabela(db, tid, "sessions"),
    tokens: montarTabela(db, tid, "tokens_acesso"),
    auditoria: {
      registrar: (e) =>
        auditoriaBase.inserir({
          user_id: e.userId ?? null,
          acao: e.acao,
          entidade: e.entidade,
          entidade_id: e.entidadeId ?? null,
          detalhes: e.detalhes === undefined ? null : JSON.stringify(e.detalhes),
          ip: e.ip ?? null,
        }),
      listar: (filtros, opcoes) => auditoriaBase.listar(filtros, opcoes),
      async listarAcessos(opcoes = {}) {
        const limite = Math.min(Math.max(Math.trunc(opcoes.limite ?? LIMITE_PADRAO), 1), LIMITE_MAXIMO);
        const deslocamento = Math.max(Math.trunc(opcoes.deslocamento ?? 0), 0);
        const { results } = await db
          .prepare(
            `SELECT a.id AS id, a.acao AS acao, a.ip AS ip, a.criado_em AS criado_em,
                    u.nome AS usuario_nome, u.email AS usuario_email
             FROM audit_log a
             LEFT JOIN users u ON u.id = a.user_id AND u.tenant_id = a.tenant_id
             WHERE a.tenant_id = ? AND a.acao IN (${ACOES_DE_ACESSO.map(() => "?").join(", ")})
             ORDER BY a.criado_em DESC, a.id DESC LIMIT ? OFFSET ?`,
          )
          .bind(tid, ...ACOES_DE_ACESSO, limite, deslocamento)
          .all<EntradaAcesso>();
        return results;
      },
    },
  };
}

// ---------- Acesso da plataforma (SOMENTE painel do dono) ----------

export interface NovoEscritorio {
  nome: string;
  plano: Plano;
  status?: StatusEscritorio;
  teste_ate?: string | null;
}

export interface AlteracaoEscritorio {
  nome?: string;
  plano?: Plano;
  status?: StatusEscritorio;
  teste_ate?: string | null;
}

export interface AcessoPlataforma {
  criarEscritorio(dados: NovoEscritorio): Promise<string>;
  buscarEscritorio(id: string): Promise<LinhaTenant | null>;
  listarEscritorios(opcoes?: { limite?: number; deslocamento?: number }): Promise<LinhaTenant[]>;
  atualizarEscritorio(id: string, dados: AlteracaoEscritorio): Promise<boolean>;
  /** Número de usuários ativos por escritório (id do escritório → quantidade). */
  contarUsuariosPorEscritorio(): Promise<Record<string, number>>;
  /** Encerra todas as sessões de um escritório (ex.: ao suspender). Devolve quantas foram removidas. */
  encerrarSessoesDoEscritorio(tenantId: string): Promise<number>;
  /** Registra ação do dono da plataforma. `tenantId` opcional = escritório afetado. */
  registrarAuditoria(entrada: EntradaAuditoria & { tenantId?: string | null }): Promise<string>;
}

const COLUNAS_ESCRITORIO_ATUALIZAVEL = ["nome", "plano", "status", "teste_ate"] as const;

/**
 * ATENÇÃO: acesso SEM filtro de tenant à tabela `tenants`. Usar somente em rotas
 * do painel do dono da plataforma, após verificar `papel_plataforma = 'dono'` na sessão.
 */
export function criarAcessoPlataforma(db: D1Database): AcessoPlataforma {
  return {
    async criarEscritorio(dados) {
      const id = crypto.randomUUID();
      const ts = agora();
      await db
        .prepare(
          "INSERT INTO tenants (id, nome, plano, status, teste_ate, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(id, dados.nome, dados.plano, dados.status ?? "teste", dados.teste_ate ?? null, ts, ts)
        .run();
      return id;
    },

    async buscarEscritorio(id) {
      return (await db.prepare("SELECT * FROM tenants WHERE id = ?").bind(id).first<LinhaTenant>()) ?? null;
    },

    async listarEscritorios(opcoes = {}) {
      const limite = Math.min(Math.max(Math.trunc(opcoes.limite ?? LIMITE_PADRAO), 1), LIMITE_MAXIMO);
      const deslocamento = Math.max(Math.trunc(opcoes.deslocamento ?? 0), 0);
      const { results } = await db
        .prepare("SELECT * FROM tenants ORDER BY criado_em, id LIMIT ? OFFSET ?")
        .bind(limite, deslocamento)
        .all<LinhaTenant>();
      return results;
    },

    async atualizarEscritorio(id, dados) {
      const pares = valoresDefinidos(dados as Record<string, unknown>);
      exigirColunas(COLUNAS_ESCRITORIO_ATUALIZAVEL, pares.map(([c]) => c), "atualização de tenants");
      if (pares.length === 0) return false;
      pares.push(["atualizado_em", agora()]);
      const r = await db
        .prepare(`UPDATE tenants SET ${pares.map(([c]) => `${c} = ?`).join(", ")} WHERE id = ?`)
        .bind(...pares.map(([, v]) => v), id)
        .run();
      return r.meta.changes > 0;
    },

    async contarUsuariosPorEscritorio() {
      const { results } = await db
        .prepare("SELECT tenant_id, COUNT(*) AS total FROM users WHERE tenant_id IS NOT NULL AND ativo = 1 GROUP BY tenant_id")
        .all<{ tenant_id: string; total: number }>();
      return Object.fromEntries(results.map((r) => [r.tenant_id, r.total]));
    },

    async encerrarSessoesDoEscritorio(tenantId) {
      const r = await db.prepare("DELETE FROM sessions WHERE tenant_id = ?").bind(tenantId).run();
      return r.meta.changes;
    },

    async registrarAuditoria(e) {
      const id = crypto.randomUUID();
      await db
        .prepare(
          "INSERT INTO audit_log (id, tenant_id, user_id, acao, entidade, entidade_id, detalhes, ip, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          id,
          e.tenantId ?? null,
          e.userId ?? null,
          e.acao,
          e.entidade,
          e.entidadeId ?? null,
          e.detalhes === undefined ? null : JSON.stringify(e.detalhes),
          e.ip ?? null,
          agora(),
        )
        .run();
      return id;
    },
  };
}

// ---------- Acesso de autenticação (ANTES de existir sessão) ----------

export interface UsuarioComEscritorio extends LinhaUsuario {
  tenant_nome: string | null;
  tenant_status: StatusEscritorio | null;
  tenant_exigir_2fa: number | null;
}

export interface LinhaTokenComUsuario extends LinhaTokenAcesso {
  usuario_email: string;
  usuario_nome: string;
  usuario_ativo: number;
  tenant_nome: string | null;
  tenant_status: StatusEscritorio | null;
}

export interface NovaSessao {
  id: string;
  user_id: string;
  tenant_id: string | null;
  expira_em: string;
  pendente_2fa: boolean;
  ip: string | null;
  user_agent: string | null;
}

const SELECT_USUARIO_COM_ESCRITORIO = `SELECT u.*, t.nome AS tenant_nome, t.status AS tenant_status, t.exigir_2fa AS tenant_exigir_2fa
  FROM users u LEFT JOIN tenants t ON t.id = u.tenant_id`;

/**
 * ATENÇÃO: etapas de autenticação em que o escritório ainda NÃO é conhecido (login por e-mail,
 * resgate de link de acesso, leitura da sessão pelo hash do cookie). Aqui o escritório é
 * DESCOBERTO a partir do registro (usuário/sessão/token), nunca recebido do navegador.
 * Depois de autenticado, o código passa a usar `criarRepositorio(db, sessao.tenant_id)`.
 * Cada método toca só colunas de autenticação, e sempre por id de usuário/sessão/token.
 */
export interface AcessoAutenticacao {
  buscarUsuariosPorEmail(email: string): Promise<UsuarioComEscritorio[]>;
  buscarUsuario(id: string): Promise<UsuarioComEscritorio | null>;
  /** Soma 1 falha; ao chegar em `maximo`, bloqueia até `bloqueadoAte` e zera o contador. */
  registrarFalha(userId: string, maximo: number, bloqueadoAte: string): Promise<void>;
  zerarFalhas(userId: string): Promise<void>;
  definirSenha(userId: string, dados: { senha_hash: string; senha_salt: string; nome?: string }): Promise<void>;
  salvarTotp(userId: string, totpSecretCifrado: string): Promise<void>;
  ativarTotp(userId: string, passo: number): Promise<void>;
  /** Marca o passo TOTP como usado. Falso se o passo já foi usado (reutilização). */
  consumirPassoTotp(userId: string, passo: number): Promise<boolean>;
  criarSessao(dados: NovaSessao): Promise<void>;
  buscarSessao(id: string): Promise<LinhaSessao | null>;
  liberarSessao2fa(id: string): Promise<void>;
  excluirSessao(id: string): Promise<void>;
  buscarToken(id: string): Promise<LinhaTokenComUsuario | null>;
  /** Marca o token como usado de forma atômica. Falso se já usado ou expirado. */
  consumirToken(id: string, agora: string): Promise<boolean>;
  /** Conta uma tentativa na janela fixa e devolve o total já feito (incluindo esta). */
  contarTentativa(chave: string, janelaMs: number): Promise<number>;
  /** Quantas tentativas já foram contadas na janela atual (sem contar uma nova). */
  lerTentativas(chave: string, janelaMs: number): Promise<number>;
  limparExpirados(): Promise<void>;
}

export function criarAcessoAutenticacao(db: D1Database): AcessoAutenticacao {
  return {
    async buscarUsuariosPorEmail(email) {
      const { results } = await db
        .prepare(`${SELECT_USUARIO_COM_ESCRITORIO} WHERE u.email = ? ORDER BY u.criado_em, u.id LIMIT 50`)
        .bind(email)
        .all<UsuarioComEscritorio>();
      return results;
    },

    async buscarUsuario(id) {
      return (
        (await db.prepare(`${SELECT_USUARIO_COM_ESCRITORIO} WHERE u.id = ?`).bind(id).first<UsuarioComEscritorio>()) ?? null
      );
    },

    async registrarFalha(userId, maximo, bloqueadoAte) {
      await db
        .prepare(
          `UPDATE users SET
             bloqueado_ate = CASE WHEN tentativas_falhas + 1 >= ? THEN ? ELSE bloqueado_ate END,
             tentativas_falhas = CASE WHEN tentativas_falhas + 1 >= ? THEN 0 ELSE tentativas_falhas + 1 END
           WHERE id = ?`,
        )
        .bind(maximo, bloqueadoAte, maximo, userId)
        .run();
    },

    async zerarFalhas(userId) {
      await db.prepare("UPDATE users SET tentativas_falhas = 0, bloqueado_ate = NULL WHERE id = ?").bind(userId).run();
    },

    async definirSenha(userId, dados) {
      const ts = agora();
      if (dados.nome !== undefined) {
        await db
          .prepare(
            "UPDATE users SET senha_hash = ?, senha_salt = ?, senha_definida = 1, nome = ?, tentativas_falhas = 0, bloqueado_ate = NULL, atualizado_em = ? WHERE id = ?",
          )
          .bind(dados.senha_hash, dados.senha_salt, dados.nome, ts, userId)
          .run();
      } else {
        await db
          .prepare(
            "UPDATE users SET senha_hash = ?, senha_salt = ?, senha_definida = 1, tentativas_falhas = 0, bloqueado_ate = NULL, atualizado_em = ? WHERE id = ?",
          )
          .bind(dados.senha_hash, dados.senha_salt, ts, userId)
          .run();
      }
    },

    async salvarTotp(userId, totpSecretCifrado) {
      await db
        .prepare("UPDATE users SET totp_secret = ?, totp_ativo = 0, totp_ultimo_passo = NULL, atualizado_em = ? WHERE id = ?")
        .bind(totpSecretCifrado, agora(), userId)
        .run();
    },

    async ativarTotp(userId, passo) {
      await db
        .prepare("UPDATE users SET totp_ativo = 1, totp_ultimo_passo = ?, atualizado_em = ? WHERE id = ?")
        .bind(passo, agora(), userId)
        .run();
    },

    async consumirPassoTotp(userId, passo) {
      const r = await db
        .prepare("UPDATE users SET totp_ultimo_passo = ? WHERE id = ? AND (totp_ultimo_passo IS NULL OR totp_ultimo_passo < ?)")
        .bind(passo, userId, passo)
        .run();
      return r.meta.changes > 0;
    },

    async criarSessao(d) {
      await db
        .prepare(
          "INSERT INTO sessions (id, user_id, tenant_id, expira_em, pendente_2fa, criado_em, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(d.id, d.user_id, d.tenant_id, d.expira_em, d.pendente_2fa ? 1 : 0, agora(), d.ip, d.user_agent)
        .run();
    },

    async buscarSessao(id) {
      return (await db.prepare("SELECT * FROM sessions WHERE id = ?").bind(id).first<LinhaSessao>()) ?? null;
    },

    async liberarSessao2fa(id) {
      await db.prepare("UPDATE sessions SET pendente_2fa = 0 WHERE id = ?").bind(id).run();
    },

    async excluirSessao(id) {
      await db.prepare("DELETE FROM sessions WHERE id = ?").bind(id).run();
    },

    async buscarToken(id) {
      return (
        (await db
          .prepare(
            `SELECT k.*, u.email AS usuario_email, u.nome AS usuario_nome, u.ativo AS usuario_ativo,
                    t.nome AS tenant_nome, t.status AS tenant_status
             FROM tokens_acesso k
             JOIN users u ON u.id = k.user_id
             LEFT JOIN tenants t ON t.id = k.tenant_id
             WHERE k.id = ?`,
          )
          .bind(id)
          .first<LinhaTokenComUsuario>()) ?? null
      );
    },

    async consumirToken(id, momento) {
      const r = await db
        .prepare("UPDATE tokens_acesso SET usado_em = ? WHERE id = ? AND usado_em IS NULL AND expira_em > ?")
        .bind(momento, id, momento)
        .run();
      return r.meta.changes > 0;
    },

    async contarTentativa(chave, janelaMs) {
      const agoraMs = Date.now();
      const inicio = new Date(agoraMs).toISOString();
      const corte = new Date(agoraMs - janelaMs).toISOString();
      const linha = await db
        .prepare(
          `INSERT INTO limites_taxa (chave, janela_inicio, contagem) VALUES (?, ?, 1)
           ON CONFLICT (chave) DO UPDATE SET
             contagem = CASE WHEN janela_inicio <= ? THEN 1 ELSE contagem + 1 END,
             janela_inicio = CASE WHEN janela_inicio <= ? THEN ? ELSE janela_inicio END
           RETURNING contagem`,
        )
        .bind(chave, inicio, corte, corte, inicio)
        .first<{ contagem: number }>();
      return linha?.contagem ?? 1;
    },

    async lerTentativas(chave, janelaMs) {
      const corte = new Date(Date.now() - janelaMs).toISOString();
      const linha = await db
        .prepare("SELECT contagem FROM limites_taxa WHERE chave = ? AND janela_inicio > ?")
        .bind(chave, corte)
        .first<{ contagem: number }>();
      return linha?.contagem ?? 0;
    },

    async limparExpirados() {
      const ts = agora();
      const corteTaxa = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      await db.batch([
        db.prepare("DELETE FROM sessions WHERE expira_em <= ?").bind(ts),
        db.prepare("DELETE FROM limites_taxa WHERE janela_inicio <= ?").bind(corteTaxa),
      ]);
    },
  };
}
