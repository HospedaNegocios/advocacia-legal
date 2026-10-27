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

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export interface LinhaOab {
  id: string;
  tenant_id: string;
  numero: string;
  sufixo: string | null;
  uf: string;
  advogado_nome: string;
  user_id: string | null;
  ativo: number;
  criado_em: string;
  atualizado_em: string;
}

export interface LinhaPerfilEscritorio {
  tenant_id: string;
  razao_social: string | null;
  documento: string | null;
  email_contato: string | null;
  telefone: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  atualizado_em: string;
}

export interface LinhaCliente {
  id: string;
  tenant_id: string;
  tipo: "pf" | "pj";
  nome: string;
  nome_busca: string;
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
  ativo: number;
  criado_por: string | null;
  criado_em: string;
  atualizado_em: string;
}

/** Campos do cadastro do cliente que o escritório grava (o resto é controlado pela camada). */
export const CAMPOS_CLIENTE = [
  "tipo", "nome", "nome_fantasia", "documento", "rg", "inscricao_estadual", "data_nascimento", "email", "telefone", "celular",
  "cep", "logradouro", "numero", "complemento", "bairro", "cidade", "uf", "observacoes",
] as const;
export type DadosCliente = { [K in (typeof CAMPOS_CLIENTE)[number]]: string | null } & { tipo: "pf" | "pj"; nome: string };

export interface LinhaContatoCliente {
  id: string;
  tenant_id: string;
  cliente_id: string;
  nome: string;
  cargo: string | null;
  email: string | null;
  telefone: string | null;
  criado_em: string;
  atualizado_em: string;
}

export type EntidadeAnexo = "cliente" | "processo";

export interface LinhaAnexo {
  id: string;
  tenant_id: string;
  entidade: EntidadeAnexo;
  entidade_id: string;
  nome_original: string;
  tipo_mime: string;
  tamanho_bytes: number;
  chave_r2: string;
  enviado_por: string | null;
  criado_em: string;
}

export interface LinhaConsentimento {
  id: string;
  tenant_id: string;
  cliente_id: string;
  finalidade: string;
  base_legal: string | null;
  forma: string;
  data_consentimento: string;
  revogado_em: string | null;
  registrado_por: string | null;
  criado_em: string;
}


export const FASES_PROCESSO = ["Conhecimento", "Recursal", "Execução", "Suspenso", "Arquivado"] as const;
export type FaseProcesso = (typeof FASES_PROCESSO)[number];
export const POLOS = ["ativo", "passivo", "terceiro"] as const;
export type Polo = (typeof POLOS)[number];

export interface LinhaProcesso {
  id: string;
  tenant_id: string;
  numero_cnj: string;
  tribunal: string | null;
  orgao: string | null;
  comarca: string | null;
  area: string | null;
  classe: string | null;
  assunto: string | null;
  fase: FaseProcesso;
  valor_causa_centavos: number | null;
  data_distribuicao: string | null;
  observacoes: string | null;
  ativo: number;
  criado_por: string | null;
  criado_em: string;
  atualizado_em: string;
}

/** Campos do processo que o escritório grava (o resto é controlado pela camada). */
export const CAMPOS_PROCESSO = [
  "numero_cnj", "tribunal", "orgao", "comarca", "area", "classe", "assunto", "fase", "valor_causa_centavos", "data_distribuicao", "observacoes",
] as const;
export interface DadosProcesso {
  numero_cnj: string;
  tribunal: string | null;
  orgao: string | null;
  comarca: string | null;
  area: string | null;
  classe: string | null;
  assunto: string | null;
  fase: FaseProcesso;
  valor_causa_centavos: number | null;
  data_distribuicao: string | null;
  observacoes: string | null;
}

export interface LinhaParteProcesso {
  id: string;
  tenant_id: string;
  processo_id: string;
  cliente_id: string | null;
  nome: string | null;
  nome_busca: string | null;
  polo: Polo;
  cliente_escritorio: number;
  criado_em: string;
  atualizado_em: string;
}

export interface LinhaResponsavelProcesso {
  id: string;
  tenant_id: string;
  processo_id: string;
  user_id: string;
  criado_em: string;
}

export interface LinhaAndamento {
  id: string;
  tenant_id: string;
  processo_id: string;
  data: string;
  descricao: string;
  registrado_por: string | null;
  criado_em: string;
}

/** Parte com o nome já resolvido (nome do cliente cadastrado ou nome livre). */
export interface ParteDetalhada extends LinhaParteProcesso {
  nome_exibicao: string;
}

export interface ResponsavelDetalhado extends LinhaResponsavelProcesso {
  nome: string;
  ativo: number;
}

export interface FiltroProcessos {
  /** Texto digitado na busca (número CNJ com ou sem máscara, ou nome de parte). */
  busca?: string;
  fase?: FaseProcesso;
  ativo?: boolean;
  /** Id de um usuário responsável, ou "sem" para processos sem responsável. */
  responsavel?: string;
  cliente_id?: string;
  limite?: number;
  deslocamento?: number;
}

export interface ResumoProcessos {
  total_ativos: number;
  por_fase: Record<FaseProcesso, number>;
  sem_responsavel: number;
  andamentos_30_dias: number;
}

export interface ProcessoDoCliente extends LinhaProcesso {
  polo: Polo;
}

export interface FiltroClientes {
  /** Texto digitado na busca (nome, nome fantasia ou documento). */
  busca?: string;
  tipo?: "pf" | "pj";
  ativo?: boolean;
  limite?: number;
  deslocamento?: number;
}

export interface ResumoClientes {
  ativos: number;
  pf: number;
  pj: number;
  novos_30_dias: number;
}

/** Minúsculas e sem acentos: usado na busca por nome. */
export function normalizarBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Campos do perfil que o escritório pode gravar (tenant_id e atualizado_em são da camada). */
export const CAMPOS_PERFIL = [
  "razao_social", "documento", "email_contato", "telefone", "cep", "logradouro", "numero", "complemento", "bairro", "cidade", "uf",
] as const;
export type DadosPerfilEscritorio = { [K in (typeof CAMPOS_PERFIL)[number]]: string | null };

// ---------- Whitelist de tabelas e colunas ----------

interface LinhasPorTabela {
  oabs: LinhaOab;
  users: LinhaUsuario;
  sessions: LinhaSessao;
  tokens_acesso: LinhaTokenAcesso;
  audit_log: LinhaAuditoria;
  clientes: LinhaCliente;
  clientes_contatos: LinhaContatoCliente;
  anexos: LinhaAnexo;
  consentimentos_lgpd: LinhaConsentimento;
  processos: LinhaProcesso;
  processos_partes: LinhaParteProcesso;
  processos_responsaveis: LinhaResponsavelProcesso;
  processos_andamentos: LinhaAndamento;
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
  oabs: {
    inserivel: ["id", "numero", "sufixo", "uf", "advogado_nome", "user_id", "ativo", "criado_em", "atualizado_em"],
    atualizavel: ["numero", "sufixo", "uf", "advogado_nome", "user_id", "ativo"],
    temAtualizadoEm: true,
    imutavel: false,
  },
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
  clientes: {
    inserivel: ["id", "nome_busca", "ativo", "criado_por", "criado_em", "atualizado_em", ...CAMPOS_CLIENTE],
    atualizavel: ["nome_busca", "ativo", ...CAMPOS_CLIENTE],
    temAtualizadoEm: true,
    imutavel: false,
  },
  clientes_contatos: {
    inserivel: ["id", "cliente_id", "nome", "cargo", "email", "telefone", "criado_em", "atualizado_em"],
    atualizavel: ["nome", "cargo", "email", "telefone"],
    temAtualizadoEm: true,
    imutavel: false,
  },
  anexos: {
    inserivel: ["id", "entidade", "entidade_id", "nome_original", "tipo_mime", "tamanho_bytes", "chave_r2", "enviado_por", "criado_em"],
    atualizavel: [],
    temAtualizadoEm: false,
    imutavel: false,
  },
  consentimentos_lgpd: {
    inserivel: ["id", "cliente_id", "finalidade", "base_legal", "forma", "data_consentimento", "revogado_em", "registrado_por", "criado_em"],
    atualizavel: ["revogado_em"],
    temAtualizadoEm: false,
    imutavel: false,
  },
  processos: {
    inserivel: ["id", "ativo", "criado_por", "criado_em", "atualizado_em", ...CAMPOS_PROCESSO],
    atualizavel: ["ativo", ...CAMPOS_PROCESSO],
    temAtualizadoEm: true,
    imutavel: false,
  },
  processos_partes: {
    inserivel: ["id", "processo_id", "cliente_id", "nome", "nome_busca", "polo", "cliente_escritorio", "criado_em", "atualizado_em"],
    atualizavel: ["nome", "nome_busca", "polo", "cliente_escritorio"],
    temAtualizadoEm: true,
    imutavel: false,
  },
  processos_responsaveis: {
    inserivel: ["id", "processo_id", "user_id", "criado_em"],
    atualizavel: [],
    temAtualizadoEm: false,
    imutavel: false,
  },
  processos_andamentos: {
    // Andamento nunca é editado depois de salvo (só apagado pelo sócio, na rota).
    inserivel: ["id", "processo_id", "data", "descricao", "registrado_por", "criado_em"],
    atualizavel: [],
    temAtualizadoEm: false,
    imutavel: false,
  },
};

// Colunas aceitas em filtros de leitura (além de tenant_id, que é sempre aplicado).
const COLUNAS_FILTRO: Readonly<Record<TabelaDoEscritorio, readonly string[]>> = {
  oabs: ["id", "ativo", "user_id", "numero", "uf"],
  users: ["id", "perfil", "email", "ativo"],
  sessions: ["id", "user_id"],
  tokens_acesso: ["id", "user_id", "tipo"],
  audit_log: ["id", "user_id", "acao", "entidade", "entidade_id"],
  clientes: ["id", "tipo", "ativo", "documento"],
  clientes_contatos: ["id", "cliente_id"],
  anexos: ["id", "entidade", "entidade_id", "enviado_por"],
  consentimentos_lgpd: ["id", "cliente_id"],
  processos: ["id", "ativo", "fase", "numero_cnj"],
  processos_partes: ["id", "processo_id", "cliente_id"],
  processos_responsaveis: ["id", "processo_id", "user_id"],
  processos_andamentos: ["id", "processo_id"],
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
  /** Perfil do escritório (1 para 1). Só colunas de `CAMPOS_PERFIL`. */
  perfil: {
    buscar(): Promise<LinhaPerfilEscritorio | null>;
    /** Grava todos os campos (os não informados viram vazios). */
    salvar(dados: Partial<DadosPerfilEscritorio>): Promise<void>;
  };
  /** OABs monitoradas. Os métodos "Respeitando" aplicam o limite do plano de forma atômica. */
  oabs: RepositorioTabela<LinhaOab> & {
    contarAtivas(): Promise<number>;
    /** Insere ativa se as OABs ativas forem menos que `limite` (null = sem limite). Devolve o id, ou null se o limite foi atingido. */
    inserirRespeitandoLimite(dados: DadosNovos<LinhaOab>, limite: number | null): Promise<string | null>;
    /** Reativa se as OABs ativas forem menos que `limite`. Falso se o limite foi atingido ou a OAB não existe. */
    reativarRespeitandoLimite(id: string, limite: number | null): Promise<boolean>;
  };
  sessions: RepositorioTabela<LinhaSessao>;
  tokens: RepositorioTabela<LinhaTokenAcesso>;
  /** Clientes. `nome_busca` é calculado aqui a partir de nome e nome fantasia (não vem de fora). */
  clientes: RepositorioTabela<LinhaCliente> & {
    pesquisar(filtro?: FiltroClientes): Promise<{ itens: LinhaCliente[]; total: number }>;
    resumo(): Promise<ResumoClientes>;
  };
  contatos: RepositorioTabela<LinhaContatoCliente>;
  /** Metadados dos anexos. O arquivo em si fica no R2 (ver src/server/anexos.ts). */
  anexos: RepositorioTabela<LinhaAnexo>;
  consentimentos: RepositorioTabela<LinhaConsentimento>;
  /** Processos. Partes, responsáveis e andamentos ficam em tabelas próprias, sempre filtradas pelo escritório. */
  processos: RepositorioTabela<LinhaProcesso> & {
    pesquisar(filtro?: FiltroProcessos): Promise<{ itens: LinhaProcesso[]; total: number }>;
    resumo(): Promise<ResumoProcessos>;
    /** Processos em que o cliente é parte (com o polo dele), ativos primeiro. */
    doCliente(clienteId: string, limite?: number): Promise<ProcessoDoCliente[]>;
  };
  /** `nome_busca` é calculado aqui a partir do nome livre. */
  processoPartes: RepositorioTabela<LinhaParteProcesso> & {
    detalhadas(processoIds: string[]): Promise<ParteDetalhada[]>;
  };
  processoResponsaveis: RepositorioTabela<LinhaResponsavelProcesso> & {
    detalhados(processoIds: string[]): Promise<ResponsavelDetalhado[]>;
  };
  andamentos: RepositorioTabela<LinhaAndamento> & {
    /** Mais recentes primeiro (data e depois ordem de registro). */
    doProcesso(processoId: string, opcoes?: { limite?: number; deslocamento?: number }): Promise<{ itens: LinhaAndamento[]; total: number }>;
  };
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
  const oabsBase = montarTabela(db, tid, "oabs");
  const clientesBase = montarTabela(db, tid, "clientes");
  const processosBase = montarTabela(db, tid, "processos");
  const partesBase = montarTabela(db, tid, "processos_partes");
  const responsaveisBase = montarTabela(db, tid, "processos_responsaveis");
  const andamentosBase = montarTabela(db, tid, "processos_andamentos");

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
    perfil: {
      async buscar() {
        return (await db.prepare("SELECT * FROM escritorio_perfil WHERE tenant_id = ?").bind(tid).first<LinhaPerfilEscritorio>()) ?? null;
      },
      async salvar(dados) {
        exigirColunas(CAMPOS_PERFIL, Object.keys(dados), "perfil do escritório");
        const valores = CAMPOS_PERFIL.map((c) => dados[c] ?? null);
        const colunas = CAMPOS_PERFIL.join(", ");
        await db
          .prepare(
            `INSERT INTO escritorio_perfil (tenant_id, ${colunas}, atualizado_em) VALUES (?, ${CAMPOS_PERFIL.map(() => "?").join(", ")}, ?)
             ON CONFLICT (tenant_id) DO UPDATE SET ${CAMPOS_PERFIL.map((c) => `${c} = excluded.${c}`).join(", ")}, atualizado_em = excluded.atualizado_em`,
          )
          .bind(tid, ...valores, agora())
          .run();
      },
    },
    oabs: {
      ...oabsBase,
      async contarAtivas() {
        const l = await db.prepare("SELECT COUNT(*) AS n FROM oabs WHERE tenant_id = ? AND ativo = 1").bind(tid).first<{ n: number }>();
        return l?.n ?? 0;
      },
      async inserirRespeitandoLimite(dados, limite) {
        const { tenant_id: _ignorado, ...resto } = dados as Record<string, unknown>;
        const pares = valoresDefinidos(resto).filter(([c]) => !["id", "ativo", "criado_em", "atualizado_em"].includes(c));
        exigirColunas(TABELAS.oabs.inserivel, pares.map(([c]) => c), "inserção em oabs");
        const id = crypto.randomUUID();
        const ts = agora();
        const colunas = ["id", "tenant_id", ...pares.map(([c]) => c), "ativo", "criado_em", "atualizado_em"];
        const valores: Valor[] = [id, tid, ...pares.map(([, v]) => v), 1, ts, ts];
        const r = await db
          .prepare(
            `INSERT INTO oabs (${colunas.join(", ")}) SELECT ${colunas.map(() => "?").join(", ")}
             WHERE ? IS NULL OR (SELECT COUNT(*) FROM oabs WHERE tenant_id = ? AND ativo = 1) < ?`,
          )
          .bind(...valores, limite, tid, limite)
          .run();
        return r.meta.changes > 0 ? id : null;
      },
      async reativarRespeitandoLimite(id, limite) {
        const r = await db
          .prepare(
            `UPDATE oabs SET ativo = 1, atualizado_em = ? WHERE id = ? AND tenant_id = ?
             AND (? IS NULL OR (SELECT COUNT(*) FROM oabs WHERE tenant_id = ? AND ativo = 1) < ?)`,
          )
          .bind(agora(), id, tid, limite, tid, limite)
          .run();
        return r.meta.changes > 0;
      },
    },
    sessions: montarTabela(db, tid, "sessions"),
    tokens: montarTabela(db, tid, "tokens_acesso"),
    clientes: {
      ...clientesBase,
      async inserir(dados) {
        const d = dados as Partial<LinhaCliente>;
        return clientesBase.inserir({ ...dados, nome_busca: normalizarBusca(`${d.nome ?? ""} ${d.nome_fantasia ?? ""}`) });
      },
      async atualizar(id, dados) {
        const d = dados as Partial<LinhaCliente>;
        if (d.nome === undefined && d.nome_fantasia === undefined) return clientesBase.atualizar(id, dados);
        const atual = await clientesBase.buscar(id);
        if (!atual) return false;
        const nome = d.nome ?? atual.nome;
        const fantasia = d.nome_fantasia === undefined ? atual.nome_fantasia : d.nome_fantasia;
        return clientesBase.atualizar(id, { ...dados, nome_busca: normalizarBusca(`${nome} ${fantasia ?? ""}`) });
      },
      async pesquisar(filtro = {}) {
        const condicoes = ["tenant_id = ?"];
        const params: Valor[] = [tid];
        if (filtro.tipo) {
          condicoes.push("tipo = ?");
          params.push(filtro.tipo);
        }
        if (filtro.ativo !== undefined) {
          condicoes.push("ativo = ?");
          params.push(filtro.ativo ? 1 : 0);
        }
        const busca = (filtro.busca ?? "").trim().slice(0, 100);
        if (busca) {
          const escapar = (t: string) => t.replace(/[\\%_]/g, (c) => `\\${c}`);
          const partes = ["nome_busca LIKE ? ESCAPE '\\'"];
          params.push(`%${escapar(normalizarBusca(busca))}%`);
          const digitos = busca.replace(/\D/g, "");
          if (digitos.length >= 3 && /^[\d.\-/\s]+$/.test(busca)) {
            partes.push("documento LIKE ?");
            params.push(`%${digitos}%`);
          }
          condicoes.push(`(${partes.join(" OR ")})`);
        }
        const onde = condicoes.join(" AND ");
        const limite = Math.min(Math.max(Math.trunc(filtro.limite ?? 20), 1), 100);
        const deslocamento = Math.max(Math.trunc(filtro.deslocamento ?? 0), 0);
        const [lista, total] = await Promise.all([
          db
            .prepare(`SELECT * FROM clientes WHERE ${onde} ORDER BY nome_busca, id LIMIT ? OFFSET ?`)
            .bind(...params, limite, deslocamento)
            .all<LinhaCliente>(),
          db.prepare(`SELECT COUNT(*) AS n FROM clientes WHERE ${onde}`).bind(...params).first<{ n: number }>(),
        ]);
        return { itens: lista.results, total: total?.n ?? 0 };
      },
      async resumo() {
        const corte = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
        const l = await db
          .prepare(
            `SELECT COALESCE(SUM(ativo = 1), 0) AS ativos,
                    COALESCE(SUM(ativo = 1 AND tipo = 'pf'), 0) AS pf,
                    COALESCE(SUM(ativo = 1 AND tipo = 'pj'), 0) AS pj,
                    COALESCE(SUM(criado_em >= ?), 0) AS novos_30_dias
             FROM clientes WHERE tenant_id = ?`,
          )
          .bind(corte, tid)
          .first<ResumoClientes>();
        return l ?? { ativos: 0, pf: 0, pj: 0, novos_30_dias: 0 };
      },
    },
    contatos: montarTabela(db, tid, "clientes_contatos"),
    anexos: montarTabela(db, tid, "anexos"),
    consentimentos: montarTabela(db, tid, "consentimentos_lgpd"),
    processos: {
      ...processosBase,
      async pesquisar(filtro = {}) {
        const condicoes = ["p.tenant_id = ?"];
        const params: Valor[] = [tid];
        if (filtro.fase) {
          condicoes.push("p.fase = ?");
          params.push(filtro.fase);
        }
        if (filtro.ativo !== undefined) {
          condicoes.push("p.ativo = ?");
          params.push(filtro.ativo ? 1 : 0);
        }
        if (filtro.responsavel === "sem") {
          condicoes.push("NOT EXISTS (SELECT 1 FROM processos_responsaveis r WHERE r.processo_id = p.id AND r.tenant_id = p.tenant_id)");
        } else if (filtro.responsavel) {
          condicoes.push("EXISTS (SELECT 1 FROM processos_responsaveis r WHERE r.processo_id = p.id AND r.tenant_id = p.tenant_id AND r.user_id = ?)");
          params.push(filtro.responsavel);
        }
        if (filtro.cliente_id) {
          condicoes.push("EXISTS (SELECT 1 FROM processos_partes x WHERE x.processo_id = p.id AND x.tenant_id = p.tenant_id AND x.cliente_id = ?)");
          params.push(filtro.cliente_id);
        }
        const busca = (filtro.busca ?? "").trim().slice(0, 100);
        if (busca) {
          const escapar = (t: string) => t.replace(/[\\%_]/g, (c) => `\\${c}`);
          const alternativas = [
            `EXISTS (SELECT 1 FROM processos_partes x LEFT JOIN clientes c ON c.id = x.cliente_id AND c.tenant_id = x.tenant_id
                     WHERE x.processo_id = p.id AND x.tenant_id = p.tenant_id AND (x.nome_busca LIKE ? ESCAPE '\\' OR c.nome_busca LIKE ? ESCAPE '\\'))`,
          ];
          const nomeBusca = `%${escapar(normalizarBusca(busca))}%`;
          params.push(nomeBusca, nomeBusca);
          const digitos = busca.replace(/\D/g, "");
          if (digitos.length >= 3 && /^[\d.\-/\s]+$/.test(busca)) {
            alternativas.push("p.numero_cnj LIKE ?");
            params.push(`%${digitos}%`);
          }
          condicoes.push(`(${alternativas.join(" OR ")})`);
        }
        const onde = condicoes.join(" AND ");
        const limite = Math.min(Math.max(Math.trunc(filtro.limite ?? 20), 1), 100);
        const deslocamento = Math.max(Math.trunc(filtro.deslocamento ?? 0), 0);
        const [lista, total] = await Promise.all([
          db
            .prepare(`SELECT p.* FROM processos p WHERE ${onde} ORDER BY p.criado_em DESC, p.id LIMIT ? OFFSET ?`)
            .bind(...params, limite, deslocamento)
            .all<LinhaProcesso>(),
          db.prepare(`SELECT COUNT(*) AS n FROM processos p WHERE ${onde}`).bind(...params).first<{ n: number }>(),
        ]);
        return { itens: lista.results, total: total?.n ?? 0 };
      },
      async resumo() {
        const corte = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
        const [fases, sem, andamentos] = await Promise.all([
          db.prepare("SELECT fase, COUNT(*) AS n FROM processos WHERE tenant_id = ? AND ativo = 1 GROUP BY fase").bind(tid).all<{ fase: FaseProcesso; n: number }>(),
          db
            .prepare(
              `SELECT COUNT(*) AS n FROM processos p WHERE p.tenant_id = ? AND p.ativo = 1
               AND NOT EXISTS (SELECT 1 FROM processos_responsaveis r WHERE r.processo_id = p.id AND r.tenant_id = p.tenant_id)`,
            )
            .bind(tid)
            .first<{ n: number }>(),
          db
            .prepare(
              `SELECT COUNT(*) AS n FROM processos_andamentos a JOIN processos p ON p.id = a.processo_id AND p.tenant_id = a.tenant_id
               WHERE a.tenant_id = ? AND p.ativo = 1 AND a.data >= ?`,
            )
            .bind(tid, corte)
            .first<{ n: number }>(),
        ]);
        const por_fase = Object.fromEntries(FASES_PROCESSO.map((f) => [f, 0])) as Record<FaseProcesso, number>;
        for (const l of fases.results) por_fase[l.fase] = l.n;
        return {
          total_ativos: FASES_PROCESSO.reduce((s, f) => s + por_fase[f], 0),
          por_fase,
          sem_responsavel: sem?.n ?? 0,
          andamentos_30_dias: andamentos?.n ?? 0,
        };
      },
      async doCliente(clienteId, limite = 100) {
        const { results } = await db
          .prepare(
            `SELECT p.*, x.polo AS polo FROM processos p JOIN processos_partes x ON x.processo_id = p.id AND x.tenant_id = p.tenant_id
             WHERE p.tenant_id = ? AND x.cliente_id = ? ORDER BY p.ativo DESC, p.criado_em DESC, p.id LIMIT ?`,
          )
          .bind(tid, clienteId, Math.min(Math.max(Math.trunc(limite), 1), LIMITE_MAXIMO))
          .all<ProcessoDoCliente>();
        return results;
      },
    },
    processoPartes: {
      ...partesBase,
      async inserir(dados) {
        const d = dados as Partial<LinhaParteProcesso>;
        return partesBase.inserir({ ...dados, nome_busca: d.nome ? normalizarBusca(d.nome) : null });
      },
      async atualizar(id, dados) {
        const d = dados as Partial<LinhaParteProcesso>;
        return partesBase.atualizar(id, d.nome === undefined ? dados : { ...dados, nome_busca: d.nome ? normalizarBusca(d.nome) : null });
      },
      async detalhadas(processoIds) {
        if (processoIds.length === 0) return [];
        const { results } = await db
          .prepare(
            `SELECT x.*, COALESCE(c.nome, x.nome) AS nome_exibicao FROM processos_partes x
             LEFT JOIN clientes c ON c.id = x.cliente_id AND c.tenant_id = x.tenant_id
             WHERE x.tenant_id = ? AND x.processo_id IN (${processoIds.map(() => "?").join(", ")})
             ORDER BY x.criado_em, x.id`,
          )
          .bind(tid, ...processoIds)
          .all<ParteDetalhada>();
        return results;
      },
    },
    processoResponsaveis: {
      ...responsaveisBase,
      async detalhados(processoIds) {
        if (processoIds.length === 0) return [];
        const { results } = await db
          .prepare(
            `SELECT r.*, u.nome AS nome, u.ativo AS ativo FROM processos_responsaveis r
             JOIN users u ON u.id = r.user_id AND u.tenant_id = r.tenant_id
             WHERE r.tenant_id = ? AND r.processo_id IN (${processoIds.map(() => "?").join(", ")})
             ORDER BY r.criado_em, r.id`,
          )
          .bind(tid, ...processoIds)
          .all<ResponsavelDetalhado>();
        return results;
      },
    },
    andamentos: {
      ...andamentosBase,
      async doProcesso(processoId, opcoes = {}) {
        const limite = Math.min(Math.max(Math.trunc(opcoes.limite ?? LIMITE_PADRAO), 1), LIMITE_MAXIMO);
        const deslocamento = Math.max(Math.trunc(opcoes.deslocamento ?? 0), 0);
        const [lista, total] = await Promise.all([
          db
            .prepare("SELECT * FROM processos_andamentos WHERE tenant_id = ? AND processo_id = ? ORDER BY data DESC, criado_em DESC, id DESC LIMIT ? OFFSET ?")
            .bind(tid, processoId, limite, deslocamento)
            .all<LinhaAndamento>(),
          db.prepare("SELECT COUNT(*) AS n FROM processos_andamentos WHERE tenant_id = ? AND processo_id = ?").bind(tid, processoId).first<{ n: number }>(),
        ]);
        return { itens: lista.results, total: total?.n ?? 0 };
      },
    },
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
