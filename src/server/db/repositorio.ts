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
  criado_em: string;
  ip: string | null;
  user_agent: string | null;
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
      "id", "perfil", "nome", "email", "senha_hash", "senha_salt", "totp_secret", "totp_ativo",
      "tentativas_falhas", "bloqueado_ate", "ativo", "criado_em", "atualizado_em",
    ],
    atualizavel: [
      "perfil", "nome", "email", "senha_hash", "senha_salt", "totp_secret", "totp_ativo",
      "tentativas_falhas", "bloqueado_ate", "ativo",
    ],
    temAtualizadoEm: true,
    imutavel: false,
  },
  sessions: {
    inserivel: ["id", "user_id", "expira_em", "criado_em", "ip", "user_agent"],
    atualizavel: ["expira_em"],
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
}

export interface EntradaAuditoria {
  userId?: string | null;
  acao: string;
  entidade: string;
  entidadeId?: string | null;
  detalhes?: unknown;
  ip?: string | null;
}

export interface Repositorio {
  readonly tenantId: string;
  /** Dados do próprio escritório (somente leitura). */
  buscarMeuEscritorio(): Promise<LinhaTenant | null>;
  users: RepositorioTabela<LinhaUsuario>;
  sessions: RepositorioTabela<LinhaSessao>;
  /** Auditoria: só leitura e registro (sem alterar/excluir). */
  auditoria: {
    registrar(entrada: EntradaAuditoria): Promise<string>;
    listar(filtros?: Filtros<LinhaAuditoria>, opcoes?: { limite?: number; deslocamento?: number }): Promise<LinhaAuditoria[]>;
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
    users: montarTabela(db, tid, "users"),
    sessions: montarTabela(db, tid, "sessions"),
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
