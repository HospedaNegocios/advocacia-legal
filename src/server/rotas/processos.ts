import { Hono } from "hono";
import type { Env } from "../env";
import type { Ctx, Variaveis } from "../contexto";
import { CAMPOS_PROCESSO } from "../db/repositorio";
import type { FaseProcesso, LinhaAndamento, LinhaProcesso, ParteDetalhada, Repositorio, ResponsavelDetalhado } from "../db/repositorio";
import { exigirSessao } from "../sessao";
import { lerJson, respostaErro } from "../validacao";
import { ehFase, validarAndamento, validarParte, validarProcesso } from "../validacao-processos";
import { eventosPublicos, hojeDoEscritorio, prazoPublico } from "./agenda-comum";
import { anexoDaEntidade, apagarAnexo, baixarAnexo, ehConflitoDeUnicidade, enviarAnexo, linkDoAnexo, listarAnexos, numeroPositivo, registrar, repoDaSessao } from "./comum";

// Processos do escritório. Todos os perfis criam e editam; só o sócio desativa/reativa e apaga anexos e andamentos.
// O escritório vem SEMPRE da sessão. Nenhuma rota aceita tenant_id.
export const rotasProcessos = new Hono<{ Bindings: Env; Variables: Variaveis }>();
rotasProcessos.use("*", exigirSessao({ papel: "escritorio" }));

const exigirSocio = exigirSessao({ papel: "socio" });

const MSG_NUMERO_DUPLICADO = "Já existe um processo com este número neste escritório.";
const MSG_INATIVO = "Este processo está desativado. Reative o processo para alterá-lo.";

function processoPublico(l: LinhaProcesso) {
  const saida: Record<string, string | number | boolean | null> = { id: l.id };
  for (const campo of CAMPOS_PROCESSO) saida[campo] = l[campo];
  saida.ativo = l.ativo === 1;
  saida.visivel_portal = l.visivel_portal === 1;
  saida.criado_em = l.criado_em;
  saida.atualizado_em = l.atualizado_em;
  return saida;
}

const partePublica = (p: ParteDetalhada) => ({
  id: p.id,
  processo_id: p.processo_id,
  cliente_id: p.cliente_id,
  nome: p.nome_exibicao,
  polo: p.polo,
  cliente_escritorio: p.cliente_escritorio === 1,
});

const responsavelPublico = (r: ResponsavelDetalhado) => ({ user_id: r.user_id, nome: r.nome, ativo: r.ativo === 1 });

const andamentoPublico = (a: LinhaAndamento) => ({
  id: a.id,
  data: a.data,
  descricao: a.descricao,
  registrado_por: a.registrado_por,
  criado_em: a.criado_em,
  visivel_portal: a.visivel_portal === 1,
});

/** Processo + partes + responsáveis (uma consulta de cada para a lista toda). */
async function comRelacionados(repo: Repositorio, linhas: LinhaProcesso[]) {
  const ids = linhas.map((l) => l.id);
  const [partes, responsaveis] = await Promise.all([repo.processoPartes.detalhadas(ids), repo.processoResponsaveis.detalhados(ids)]);
  return linhas.map((l) => ({
    ...processoPublico(l),
    partes: partes.filter((p) => p.processo_id === l.id).map(partePublica),
    responsaveis: responsaveis.filter((r) => r.processo_id === l.id).map(responsavelPublico),
  }));
}

// ---------- Rotas fixas (registradas antes de /:id) ----------

rotasProcessos.get("/anexos/:anexoId/arquivo", (c) => baixarAnexo(c, "processo"));

rotasProcessos.get("/resumo", async (c) => {
  const r = await repoDaSessao(c).processos.resumo();
  return c.json({ ok: true, resumo: r });
});

// Usuários ativos do escritório que podem ser responsáveis (só id, nome e perfil; sem e-mail).
rotasProcessos.get("/responsaveis-disponiveis", async (c) => {
  const lista = await repoDaSessao(c).users.listar({ ativo: 1 }, { limite: 200 });
  return c.json({ ok: true, usuarios: lista.map((u) => ({ id: u.id, nome: u.nome, perfil: u.perfil })) });
});

// ---------- Lista e cadastro ----------

rotasProcessos.get("/", async (c) => {
  const repo = repoDaSessao(c);
  const situacao = c.req.query("situacao") ?? "ativos";
  const fase = c.req.query("fase");
  const responsavel = c.req.query("responsavel");
  const clienteId = c.req.query("cliente_id");
  if (fase && !ehFase(fase)) return respostaErro(c, 400, "Fase inválida.");
  const porPagina = numeroPositivo(c.req.query("por_pagina"), 20, 100);
  const pagina = numeroPositivo(c.req.query("pagina"), 1, 100000);
  const r = await repo.processos.pesquisar({
    busca: c.req.query("busca") ?? "",
    ...(fase ? { fase: fase as FaseProcesso } : {}),
    ...(responsavel ? { responsavel } : {}),
    ...(clienteId ? { cliente_id: clienteId } : {}),
    ...(situacao === "ativos" ? { ativo: true } : situacao === "inativos" ? { ativo: false } : {}),
    limite: porPagina,
    deslocamento: (pagina - 1) * porPagina,
  });
  return c.json({ ok: true, processos: await comRelacionados(repo, r.itens), total: r.total, pagina, por_pagina: porPagina });
});

rotasProcessos.post("/", async (c) => {
  const v = validarProcesso(await lerJson(c));
  if (!v.ok) return respostaErro(c, 400, v.erro);
  const repo = repoDaSessao(c);
  let id: string;
  try {
    id = await repo.processos.inserir({ ...v.dados, ativo: 1, criado_por: c.get("sessao").usuario.id });
  } catch (e) {
    if (ehConflitoDeUnicidade(e)) return respostaErro(c, 409, MSG_NUMERO_DUPLICADO);
    throw e;
  }
  await registrar(c, "processo_criado", "processos", id, { fase: v.dados.fase });
  // Intimações que chegaram antes do cadastro do processo passam a apontar para ele (pelo número CNJ).
  await repo.intimacoes.vincularOrfas().catch(() => 0);
  const criado = await repo.processos.buscar(id);
  return c.json({ ok: true, processo: criado ? (await comRelacionados(repo, [criado]))[0] : null }, 201);
});

/** Carrega o processo do escritório da sessão (nulo se não existir ou for de outro escritório). */
async function processoOu404(c: Ctx, repo: Repositorio): Promise<LinhaProcesso | null> {
  return repo.processos.buscar(c.req.param("id") ?? "");
}

rotasProcessos.get("/:id", async (c) => {
  const repo = repoDaSessao(c);
  const p = await processoOu404(c, repo);
  if (!p) return respostaErro(c, 404, "Processo não encontrado.");
  return c.json({ ok: true, processo: (await comRelacionados(repo, [p]))[0] });
});

rotasProcessos.put("/:id", async (c) => {
  const repo = repoDaSessao(c);
  const atual = await processoOu404(c, repo);
  if (!atual) return respostaErro(c, 404, "Processo não encontrado.");
  if (atual.ativo === 0) return respostaErro(c, 409, MSG_INATIVO);
  const v = validarProcesso(await lerJson(c));
  if (!v.ok) return respostaErro(c, 400, v.erro);
  try {
    await repo.processos.atualizar(atual.id, v.dados);
  } catch (e) {
    if (ehConflitoDeUnicidade(e)) return respostaErro(c, 409, MSG_NUMERO_DUPLICADO);
    throw e;
  }
  // Auditoria guarda só os nomes dos campos alterados.
  const alterados = CAMPOS_PROCESSO.filter((campo) => (atual[campo] ?? null) !== v.dados[campo]);
  await registrar(c, "processo_alterado", "processos", atual.id, { campos: alterados.join(",") });
  if (alterados.includes("numero_cnj")) await repo.intimacoes.vincularOrfas().catch(() => 0);
  const novo = await repo.processos.buscar(atual.id);
  return c.json({ ok: true, processo: novo ? (await comRelacionados(repo, [novo]))[0] : null });
});

// Desativar/reativar: só o sócio. O processo e o histórico ficam guardados.
rotasProcessos.post("/:id/situacao", exigirSocio, async (c) => {
  const repo = repoDaSessao(c);
  const atual = await processoOu404(c, repo);
  if (!atual) return respostaErro(c, 404, "Processo não encontrado.");
  const corpo = await lerJson(c);
  if (typeof corpo.ativo !== "boolean") return respostaErro(c, 400, "Informe ativo como verdadeiro ou falso.");
  const novo = corpo.ativo ? 1 : 0;
  if (novo !== atual.ativo) {
    await repo.processos.atualizar(atual.id, { ativo: novo });
    await registrar(c, novo ? "processo_reativado" : "processo_desativado", "processos", atual.id);
  }
  const depois = await repo.processos.buscar(atual.id);
  return c.json({ ok: true, processo: depois ? (await comRelacionados(repo, [depois]))[0] : null });
});

// ---------- Apagar processo (definitivo; só o sócio) ----------

const MAX_JUSTIFICATIVA = 500;
const MIN_JUSTIFICATIVA = 10;

// Contagem para a tela de confirmação.
rotasProcessos.get("/:id/exclusao", exigirSocio, async (c) => {
  const repo = repoDaSessao(c);
  const p = await processoOu404(c, repo);
  if (!p) return respostaErro(c, 404, "Processo não encontrado.");
  return c.json({ ok: true, vinculos: await repo.processos.contarVinculos(p.id) });
});

// Para quem cadastrou por engano. Processo encerrado deve ser desativado, não apagado. A justificativa fica na auditoria.
rotasProcessos.post("/:id/exclusao", exigirSocio, async (c) => {
  const repo = repoDaSessao(c);
  const p = await processoOu404(c, repo);
  if (!p) return respostaErro(c, 404, "Processo não encontrado.");
  const corpo = await lerJson(c);
  const justificativa = typeof corpo.justificativa === "string" ? corpo.justificativa.trim() : "";
  if (justificativa.length < MIN_JUSTIFICATIVA) return respostaErro(c, 400, `Explique o motivo da exclusão (mínimo de ${MIN_JUSTIFICATIVA} caracteres).`);
  if (justificativa.length > MAX_JUSTIFICATIVA) return respostaErro(c, 400, `O motivo da exclusão deve ter no máximo ${MAX_JUSTIFICATIVA} caracteres.`);
  const opcoes = { apagar_prazos: false, apagar_eventos: false, apagar_lancamentos: false };
  for (const chave of Object.keys(opcoes) as (keyof typeof opcoes)[]) {
    const valor = corpo[chave];
    if (valor !== undefined && typeof valor !== "boolean") return respostaErro(c, 400, "Informe as opções de exclusão como verdadeiro ou falso.");
    opcoes[chave] = valor === true;
  }
  const vinculos = await repo.processos.contarVinculos(p.id);
  const r = await repo.processos.excluirCompleto(p.id, opcoes);
  if (!r) return respostaErro(c, 404, "Processo não encontrado.");
  // Os registros já saíram do banco; os arquivos do R2 são apagados em seguida (de mil em mil).
  for (let i = 0; i < r.chaves_r2.length; i += 1000) await c.env.ARQUIVOS.delete(r.chaves_r2.slice(i, i + 1000));
  // Detalhes planos (a auditoria guarda só valores simples): contagens com prefixo "tinha_" e opções com o mesmo nome do pedido.
  const contagens = Object.fromEntries(Object.entries(vinculos).map(([k, v]) => [`tinha_${k}`, v]));
  await registrar(c, "processo_excluido", "processos", p.id, { justificativa, numero_cnj: p.numero_cnj, assunto: p.assunto, classe: p.classe, ...contagens, ...opcoes });
  return c.json({ ok: true });
});

// ---------- Partes ----------

rotasProcessos.get("/:id/partes", async (c) => {
  const repo = repoDaSessao(c);
  const p = await processoOu404(c, repo);
  if (!p) return respostaErro(c, 404, "Processo não encontrado.");
  return c.json({ ok: true, partes: (await repo.processoPartes.detalhadas([p.id])).map(partePublica) });
});

rotasProcessos.post("/:id/partes", async (c) => {
  const repo = repoDaSessao(c);
  const p = await processoOu404(c, repo);
  if (!p) return respostaErro(c, 404, "Processo não encontrado.");
  if (p.ativo === 0) return respostaErro(c, 409, MSG_INATIVO);
  const v = validarParte(await lerJson(c));
  if (!v.ok) return respostaErro(c, 400, v.erro);
  if (v.dados.cliente_id) {
    // O cliente precisa ser do mesmo escritório (a busca já filtra pelo escritório da sessão) e estar ativo.
    const cli = await repo.clientes.buscar(v.dados.cliente_id);
    if (!cli) return respostaErro(c, 404, "Cliente não encontrado.");
    if (cli.ativo === 0) return respostaErro(c, 409, "Este cliente está desativado. Reative o cliente para vinculá-lo a um processo.");
  }
  let id: string;
  try {
    id = await repo.processoPartes.inserir({
      processo_id: p.id,
      cliente_id: v.dados.cliente_id,
      nome: v.dados.nome,
      polo: v.dados.polo,
      cliente_escritorio: v.dados.cliente_escritorio ? 1 : 0,
    });
  } catch (e) {
    if (ehConflitoDeUnicidade(e)) return respostaErro(c, 409, "Este cliente já é parte deste processo.");
    throw e;
  }
  await registrar(c, "parte_adicionada", "processos_partes", id, { processo_id: p.id, polo: v.dados.polo, com_cadastro: v.dados.cliente_id !== null });
  const nova = (await repo.processoPartes.detalhadas([p.id])).find((x) => x.id === id);
  return c.json({ ok: true, parte: nova ? partePublica(nova) : null }, 201);
});

async function parteDoProcesso(c: Ctx, repo: Repositorio, p: LinhaProcesso) {
  const x = await repo.processoPartes.buscar(c.req.param("parteId") ?? "");
  return x && x.processo_id === p.id ? x : null;
}

// Altera polo (qualquer parte) e, nas partes de nome livre, o nome e a marcação de cliente do escritório.
rotasProcessos.put("/:id/partes/:parteId", async (c) => {
  const repo = repoDaSessao(c);
  const p = await processoOu404(c, repo);
  if (!p) return respostaErro(c, 404, "Processo não encontrado.");
  if (p.ativo === 0) return respostaErro(c, 409, MSG_INATIVO);
  const atual = await parteDoProcesso(c, repo, p);
  if (!atual) return respostaErro(c, 404, "Parte não encontrada.");
  const corpo = await lerJson(c);
  const v = validarParte(
    atual.cliente_id
      ? { cliente_id: atual.cliente_id, polo: corpo.polo ?? atual.polo }
      : { nome: corpo.nome ?? atual.nome, polo: corpo.polo ?? atual.polo, cliente_escritorio: corpo.cliente_escritorio ?? atual.cliente_escritorio === 1 },
  );
  if (!v.ok) return respostaErro(c, 400, v.erro);
  await repo.processoPartes.atualizar(atual.id, atual.cliente_id ? { polo: v.dados.polo } : { polo: v.dados.polo, nome: v.dados.nome, cliente_escritorio: v.dados.cliente_escritorio ? 1 : 0 });
  await registrar(c, "parte_alterada", "processos_partes", atual.id, { processo_id: p.id });
  const nova = (await repo.processoPartes.detalhadas([p.id])).find((x) => x.id === atual.id);
  return c.json({ ok: true, parte: nova ? partePublica(nova) : null });
});

rotasProcessos.delete("/:id/partes/:parteId", async (c) => {
  const repo = repoDaSessao(c);
  const p = await processoOu404(c, repo);
  if (!p) return respostaErro(c, 404, "Processo não encontrado.");
  if (p.ativo === 0) return respostaErro(c, 409, MSG_INATIVO);
  const atual = await parteDoProcesso(c, repo, p);
  if (!atual) return respostaErro(c, 404, "Parte não encontrada.");
  await repo.processoPartes.excluir(atual.id);
  await registrar(c, "parte_removida", "processos_partes", atual.id, { processo_id: p.id });
  return c.json({ ok: true });
});

// ---------- Responsáveis ----------

rotasProcessos.get("/:id/responsaveis", async (c) => {
  const repo = repoDaSessao(c);
  const p = await processoOu404(c, repo);
  if (!p) return respostaErro(c, 404, "Processo não encontrado.");
  return c.json({ ok: true, responsaveis: (await repo.processoResponsaveis.detalhados([p.id])).map(responsavelPublico) });
});

rotasProcessos.post("/:id/responsaveis", async (c) => {
  const repo = repoDaSessao(c);
  const p = await processoOu404(c, repo);
  if (!p) return respostaErro(c, 404, "Processo não encontrado.");
  if (p.ativo === 0) return respostaErro(c, 409, MSG_INATIVO);
  const corpo = await lerJson(c);
  if (typeof corpo.user_id !== "string" || corpo.user_id === "") return respostaErro(c, 400, "Escolha o responsável.");
  // A busca já filtra pelo escritório da sessão: usuário de outro escritório não é encontrado.
  const usuario = await repo.users.buscar(corpo.user_id);
  if (!usuario || usuario.perfil === null) return respostaErro(c, 404, "Usuário não encontrado.");
  if (usuario.ativo === 0) return respostaErro(c, 409, "Este usuário está desativado e não pode ser responsável.");
  let id: string;
  try {
    id = await repo.processoResponsaveis.inserir({ processo_id: p.id, user_id: usuario.id });
  } catch (e) {
    if (ehConflitoDeUnicidade(e)) return respostaErro(c, 409, "Este usuário já é responsável pelo processo.");
    throw e;
  }
  await registrar(c, "responsavel_adicionado", "processos_responsaveis", id, { processo_id: p.id, user_id: usuario.id });
  return c.json({ ok: true, responsaveis: (await repo.processoResponsaveis.detalhados([p.id])).map(responsavelPublico) }, 201);
});

rotasProcessos.delete("/:id/responsaveis/:userId", async (c) => {
  const repo = repoDaSessao(c);
  const p = await processoOu404(c, repo);
  if (!p) return respostaErro(c, 404, "Processo não encontrado.");
  if (p.ativo === 0) return respostaErro(c, 409, MSG_INATIVO);
  const userId = c.req.param("userId") ?? "";
  const existente = (await repo.processoResponsaveis.listar({ processo_id: p.id, user_id: userId }, { limite: 1 }))[0];
  if (!existente) return respostaErro(c, 404, "Responsável não encontrado neste processo.");
  await repo.processoResponsaveis.excluir(existente.id);
  await registrar(c, "responsavel_removido", "processos_responsaveis", existente.id, { processo_id: p.id, user_id: userId });
  return c.json({ ok: true });
});

// ---------- Andamentos (não editáveis; só o sócio apaga) ----------

rotasProcessos.get("/:id/andamentos", async (c) => {
  const repo = repoDaSessao(c);
  const p = await processoOu404(c, repo);
  if (!p) return respostaErro(c, 404, "Processo não encontrado.");
  const porPagina = numeroPositivo(c.req.query("por_pagina"), 50, 100);
  const pagina = numeroPositivo(c.req.query("pagina"), 1, 100000);
  const r = await repo.andamentos.doProcesso(p.id, { limite: porPagina, deslocamento: (pagina - 1) * porPagina });
  // Nome de quem registrou: só dos usuários deste escritório (a consulta de usuários é filtrada pela sessão).
  const nomes = new Map<string, string>();
  for (const u of await repo.users.listar({}, { limite: 200 })) nomes.set(u.id, u.nome);
  return c.json({
    ok: true,
    andamentos: r.itens.map((a) => ({ ...andamentoPublico(a), registrado_por_nome: a.registrado_por ? (nomes.get(a.registrado_por) ?? null) : null })),
    total: r.total,
    pagina,
    por_pagina: porPagina,
  });
});

rotasProcessos.post("/:id/andamentos", async (c) => {
  const repo = repoDaSessao(c);
  const p = await processoOu404(c, repo);
  if (!p) return respostaErro(c, 404, "Processo não encontrado.");
  if (p.ativo === 0) return respostaErro(c, 409, MSG_INATIVO);
  const v = validarAndamento(await lerJson(c));
  if (!v.ok) return respostaErro(c, 400, v.erro);
  const id = await repo.andamentos.inserir({ ...v.dados, processo_id: p.id, registrado_por: c.get("sessao").usuario.id });
  await registrar(c, "andamento_registrado", "processos_andamentos", id, { processo_id: p.id });
  const novo = await repo.andamentos.buscar(id);
  return c.json({ ok: true, andamento: novo ? andamentoPublico(novo) : null }, 201);
});

rotasProcessos.delete("/:id/andamentos/:andamentoId", exigirSocio, async (c) => {
  const repo = repoDaSessao(c);
  const p = await processoOu404(c, repo);
  if (!p) return respostaErro(c, 404, "Processo não encontrado.");
  if (p.ativo === 0) return respostaErro(c, 409, MSG_INATIVO);
  const a = await repo.andamentos.buscar(c.req.param("andamentoId") ?? "");
  if (!a || a.processo_id !== p.id) return respostaErro(c, 404, "Andamento não encontrado.");
  await repo.andamentos.excluir(a.id);
  await registrar(c, "andamento_excluido", "processos_andamentos", a.id, { processo_id: p.id, data: a.data });
  return c.json({ ok: true });
});

// ---------- Prazos e agenda do processo (somente leitura; criar e editar pelas rotas /api/prazos e /api/agenda) ----------

rotasProcessos.get("/:id/prazos", async (c) => {
  const repo = repoDaSessao(c);
  const p = await processoOu404(c, repo);
  if (!p) return respostaErro(c, 404, "Processo não encontrado.");
  const hoje = hojeDoEscritorio();
  const r = await repo.prazos.pesquisar({ processo_id: p.id, limite: 200 });
  return c.json({ ok: true, hoje, prazos: r.itens.map((x) => prazoPublico(x, hoje)), total: r.total });
});

rotasProcessos.get("/:id/eventos", async (c) => {
  const repo = repoDaSessao(c);
  const p = await processoOu404(c, repo);
  if (!p) return respostaErro(c, 404, "Processo não encontrado.");
  const lista = await repo.eventos.pesquisar({ processo_id: p.id, limite: 200 });
  return c.json({ ok: true, eventos: await eventosPublicos(c, repo, lista) });
});

// ---------- Anexos ----------

rotasProcessos.get("/:id/anexos", async (c) => {
  const repo = repoDaSessao(c);
  const p = await processoOu404(c, repo);
  if (!p) return respostaErro(c, 404, "Processo não encontrado.");
  return listarAnexos(c, repo, "processo", p.id);
});

rotasProcessos.post("/:id/anexos", async (c) => {
  const repo = repoDaSessao(c);
  const p = await processoOu404(c, repo);
  if (!p) return respostaErro(c, 404, "Processo não encontrado.");
  if (p.ativo === 0) return respostaErro(c, 409, MSG_INATIVO);
  return enviarAnexo(c, repo, "processo", p.id);
});

rotasProcessos.get("/:id/anexos/:anexoId/link", async (c) => {
  const repo = repoDaSessao(c);
  const p = await processoOu404(c, repo);
  if (!p) return respostaErro(c, 404, "Processo não encontrado.");
  const a = await anexoDaEntidade(c, repo, "processo", p.id);
  if (!a) return respostaErro(c, 404, "Arquivo não encontrado.");
  return linkDoAnexo(c, repo, a, "/api/processos");
});

rotasProcessos.delete("/:id/anexos/:anexoId", exigirSocio, async (c) => {
  const repo = repoDaSessao(c);
  const p = await processoOu404(c, repo);
  if (!p) return respostaErro(c, 404, "Processo não encontrado.");
  if (p.ativo === 0) return respostaErro(c, 409, MSG_INATIVO);
  const a = await anexoDaEntidade(c, repo, "processo", p.id);
  if (!a) return respostaErro(c, 404, "Arquivo não encontrado.");
  return apagarAnexo(c, repo, a, "processo", p.id);
});
