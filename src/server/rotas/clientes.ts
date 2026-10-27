import { Hono } from "hono";
import type { Env } from "../env";
import type { Ctx, Variaveis } from "../contexto";
import { CAMPOS_CLIENTE } from "../db/repositorio";
import type { LinhaCliente, LinhaConsentimento, LinhaContatoCliente, Repositorio } from "../db/repositorio";
import { exigirSessao } from "../sessao";
import { lerJson, respostaErro } from "../validacao";
import { validarCliente, validarConsentimento, validarContato } from "../validacao-clientes";
import { anexoDaEntidade, apagarAnexo, baixarAnexo, ehConflitoDeUnicidade, enviarAnexo, linkDoAnexo, listarAnexos, numeroPositivo, registrar, repoDaSessao } from "./comum";

// Clientes do escritório. Todos os perfis criam e editam; só o sócio desativa/reativa e apaga anexos.
// O escritório vem SEMPRE da sessão. Nenhuma rota aceita tenant_id.
export const rotasClientes = new Hono<{ Bindings: Env; Variables: Variaveis }>();
rotasClientes.use("*", exigirSessao({ papel: "escritorio" }));

const exigirSocio = exigirSessao({ papel: "socio" });

const MSG_DOC_DUPLICADO = "Já existe um cliente com este CPF/CNPJ neste escritório.";
const MSG_INATIVO = "Este cliente está desativado. Reative o cliente para alterar o cadastro.";

function clientePublico(l: LinhaCliente) {
  const saida: Record<string, string | number | boolean | null> = { id: l.id };
  for (const campo of CAMPOS_CLIENTE) saida[campo] = l[campo];
  saida.ativo = l.ativo === 1;
  saida.criado_em = l.criado_em;
  saida.atualizado_em = l.atualizado_em;
  return saida;
}

const contatoPublico = (l: LinhaContatoCliente) => ({ id: l.id, nome: l.nome, cargo: l.cargo, email: l.email, telefone: l.telefone, criado_em: l.criado_em });

const consentimentoPublico = (l: LinhaConsentimento) => ({
  id: l.id,
  finalidade: l.finalidade,
  base_legal: l.base_legal,
  forma: l.forma,
  data_consentimento: l.data_consentimento,
  revogado_em: l.revogado_em,
  registrado_por: l.registrado_por,
  criado_em: l.criado_em,
});

// ---------- Download por link temporário (registrada antes de /:id) ----------

rotasClientes.get("/anexos/:anexoId/arquivo", (c) => baixarAnexo(c, "cliente"));

// ---------- Lista, resumo e cadastro ----------

rotasClientes.get("/", async (c) => {
  const repo = repoDaSessao(c);
  const situacao = c.req.query("situacao") ?? "ativos";
  const tipo = c.req.query("tipo");
  const porPagina = numeroPositivo(c.req.query("por_pagina"), 20, 100);
  const pagina = numeroPositivo(c.req.query("pagina"), 1, 100000);
  const r = await repo.clientes.pesquisar({
    busca: c.req.query("busca") ?? "",
    ...(tipo === "pf" || tipo === "pj" ? { tipo } : {}),
    ...(situacao === "ativos" ? { ativo: true } : situacao === "inativos" ? { ativo: false } : {}),
    limite: porPagina,
    deslocamento: (pagina - 1) * porPagina,
  });
  return c.json({ ok: true, clientes: r.itens.map(clientePublico), total: r.total, pagina, por_pagina: porPagina });
});

rotasClientes.get("/resumo", async (c) => {
  const r = await repoDaSessao(c).clientes.resumo();
  return c.json({ ok: true, resumo: r });
});

rotasClientes.post("/", async (c) => {
  const v = validarCliente(await lerJson(c));
  if (!v.ok) return respostaErro(c, 400, v.erro);
  const repo = repoDaSessao(c);
  let id: string;
  try {
    id = await repo.clientes.inserir({ ...v.dados, ativo: 1, criado_por: c.get("sessao").usuario.id });
  } catch (e) {
    if (ehConflitoDeUnicidade(e)) return respostaErro(c, 409, MSG_DOC_DUPLICADO);
    throw e;
  }
  await registrar(c, "cliente_criado", "clientes", id, { tipo: v.dados.tipo });
  const criado = await repo.clientes.buscar(id);
  return c.json({ ok: true, cliente: criado ? clientePublico(criado) : null }, 201);
});

/** Carrega o cliente do escritório da sessão (404 se não existir ou for de outro escritório). */
async function clienteOu404(c: Ctx, repo: Repositorio): Promise<LinhaCliente | null> {
  return repo.clientes.buscar(c.req.param("id") ?? "");
}

rotasClientes.get("/:id", async (c) => {
  const cli = await clienteOu404(c, repoDaSessao(c));
  if (!cli) return respostaErro(c, 404, "Cliente não encontrado.");
  return c.json({ ok: true, cliente: clientePublico(cli) });
});

rotasClientes.put("/:id", async (c) => {
  const repo = repoDaSessao(c);
  const atual = await clienteOu404(c, repo);
  if (!atual) return respostaErro(c, 404, "Cliente não encontrado.");
  if (atual.ativo === 0) return respostaErro(c, 409, MSG_INATIVO);
  const v = validarCliente(await lerJson(c));
  if (!v.ok) return respostaErro(c, 400, v.erro);
  if (v.dados.tipo !== atual.tipo) return respostaErro(c, 400, "Não é possível trocar entre pessoa física e jurídica. Cadastre um novo cliente.");
  try {
    await repo.clientes.atualizar(atual.id, v.dados);
  } catch (e) {
    if (ehConflitoDeUnicidade(e)) return respostaErro(c, 409, MSG_DOC_DUPLICADO);
    throw e;
  }
  // Auditoria guarda só os nomes dos campos alterados (não os dados pessoais).
  const alterados = CAMPOS_CLIENTE.filter((campo) => (atual[campo] ?? null) !== v.dados[campo]);
  await registrar(c, "cliente_alterado", "clientes", atual.id, { campos: alterados.join(",") });
  const novo = await repo.clientes.buscar(atual.id);
  return c.json({ ok: true, cliente: novo ? clientePublico(novo) : null });
});

// Desativar/reativar: só o sócio. O cliente e o histórico ficam guardados.
rotasClientes.post("/:id/situacao", exigirSocio, async (c) => {
  const repo = repoDaSessao(c);
  const atual = await clienteOu404(c, repo);
  if (!atual) return respostaErro(c, 404, "Cliente não encontrado.");
  const corpo = await lerJson(c);
  if (typeof corpo.ativo !== "boolean") return respostaErro(c, 400, "Informe ativo como verdadeiro ou falso.");
  const novo = corpo.ativo ? 1 : 0;
  if (novo !== atual.ativo) {
    await repo.clientes.atualizar(atual.id, { ativo: novo });
    await registrar(c, novo ? "cliente_reativado" : "cliente_desativado", "clientes", atual.id);
  }
  const depois = await repo.clientes.buscar(atual.id);
  return c.json({ ok: true, cliente: depois ? clientePublico(depois) : null });
});

// ---------- Contatos ----------

rotasClientes.get("/:id/contatos", async (c) => {
  const repo = repoDaSessao(c);
  const cli = await clienteOu404(c, repo);
  if (!cli) return respostaErro(c, 404, "Cliente não encontrado.");
  const lista = await repo.contatos.listar({ cliente_id: cli.id }, { limite: 200 });
  return c.json({ ok: true, contatos: lista.map(contatoPublico) });
});

rotasClientes.post("/:id/contatos", async (c) => {
  const repo = repoDaSessao(c);
  const cli = await clienteOu404(c, repo);
  if (!cli) return respostaErro(c, 404, "Cliente não encontrado.");
  if (cli.ativo === 0) return respostaErro(c, 409, MSG_INATIVO);
  const v = validarContato(await lerJson(c));
  if (!v.ok) return respostaErro(c, 400, v.erro);
  const id = await repo.contatos.inserir({ ...v.dados, cliente_id: cli.id });
  await registrar(c, "contato_criado", "clientes_contatos", id, { cliente_id: cli.id });
  const novo = await repo.contatos.buscar(id);
  return c.json({ ok: true, contato: novo ? contatoPublico(novo) : null }, 201);
});

async function contatoDoCliente(c: Ctx, repo: Repositorio, cli: LinhaCliente) {
  const ct = await repo.contatos.buscar(c.req.param("contatoId") ?? "");
  return ct && ct.cliente_id === cli.id ? ct : null;
}

rotasClientes.put("/:id/contatos/:contatoId", async (c) => {
  const repo = repoDaSessao(c);
  const cli = await clienteOu404(c, repo);
  if (!cli) return respostaErro(c, 404, "Cliente não encontrado.");
  if (cli.ativo === 0) return respostaErro(c, 409, MSG_INATIVO);
  const ct = await contatoDoCliente(c, repo, cli);
  if (!ct) return respostaErro(c, 404, "Contato não encontrado.");
  const v = validarContato(await lerJson(c));
  if (!v.ok) return respostaErro(c, 400, v.erro);
  await repo.contatos.atualizar(ct.id, v.dados);
  await registrar(c, "contato_alterado", "clientes_contatos", ct.id, { cliente_id: cli.id });
  const novo = await repo.contatos.buscar(ct.id);
  return c.json({ ok: true, contato: novo ? contatoPublico(novo) : null });
});

rotasClientes.delete("/:id/contatos/:contatoId", async (c) => {
  const repo = repoDaSessao(c);
  const cli = await clienteOu404(c, repo);
  if (!cli) return respostaErro(c, 404, "Cliente não encontrado.");
  if (cli.ativo === 0) return respostaErro(c, 409, MSG_INATIVO);
  const ct = await contatoDoCliente(c, repo, cli);
  if (!ct) return respostaErro(c, 404, "Contato não encontrado.");
  await repo.contatos.excluir(ct.id);
  await registrar(c, "contato_excluido", "clientes_contatos", ct.id, { cliente_id: cli.id });
  return c.json({ ok: true });
});

// ---------- Consentimentos LGPD ----------

rotasClientes.get("/:id/consentimentos", async (c) => {
  const repo = repoDaSessao(c);
  const cli = await clienteOu404(c, repo);
  if (!cli) return respostaErro(c, 404, "Cliente não encontrado.");
  const lista = await repo.consentimentos.listar({ cliente_id: cli.id }, { limite: 200 });
  return c.json({ ok: true, consentimentos: lista.map(consentimentoPublico) });
});

rotasClientes.post("/:id/consentimentos", async (c) => {
  const repo = repoDaSessao(c);
  const cli = await clienteOu404(c, repo);
  if (!cli) return respostaErro(c, 404, "Cliente não encontrado.");
  if (cli.ativo === 0) return respostaErro(c, 409, MSG_INATIVO);
  const v = validarConsentimento(await lerJson(c));
  if (!v.ok) return respostaErro(c, 400, v.erro);
  const id = await repo.consentimentos.inserir({ ...v.dados, cliente_id: cli.id, registrado_por: c.get("sessao").usuario.id });
  await registrar(c, "consentimento_registrado", "consentimentos_lgpd", id, { cliente_id: cli.id });
  const novo = await repo.consentimentos.buscar(id);
  return c.json({ ok: true, consentimento: novo ? consentimentoPublico(novo) : null }, 201);
});

rotasClientes.post("/:id/consentimentos/:consentimentoId/revogar", async (c) => {
  const repo = repoDaSessao(c);
  const cli = await clienteOu404(c, repo);
  if (!cli) return respostaErro(c, 404, "Cliente não encontrado.");
  if (cli.ativo === 0) return respostaErro(c, 409, MSG_INATIVO);
  const cons = await repo.consentimentos.buscar(c.req.param("consentimentoId") ?? "");
  if (!cons || cons.cliente_id !== cli.id) return respostaErro(c, 404, "Consentimento não encontrado.");
  if (cons.revogado_em) return respostaErro(c, 409, "Este consentimento já foi revogado.");
  await repo.consentimentos.atualizar(cons.id, { revogado_em: new Date().toISOString() });
  await registrar(c, "consentimento_revogado", "consentimentos_lgpd", cons.id, { cliente_id: cli.id });
  const novo = await repo.consentimentos.buscar(cons.id);
  return c.json({ ok: true, consentimento: novo ? consentimentoPublico(novo) : null });
});

// ---------- Anexos ----------

rotasClientes.get("/:id/anexos", async (c) => {
  const repo = repoDaSessao(c);
  const cli = await clienteOu404(c, repo);
  if (!cli) return respostaErro(c, 404, "Cliente não encontrado.");
  return listarAnexos(c, repo, "cliente", cli.id);
});

rotasClientes.post("/:id/anexos", async (c) => {
  const repo = repoDaSessao(c);
  const cli = await clienteOu404(c, repo);
  if (!cli) return respostaErro(c, 404, "Cliente não encontrado.");
  if (cli.ativo === 0) return respostaErro(c, 409, MSG_INATIVO);
  return enviarAnexo(c, repo, "cliente", cli.id);
});

rotasClientes.get("/:id/anexos/:anexoId/link", async (c) => {
  const repo = repoDaSessao(c);
  const cli = await clienteOu404(c, repo);
  if (!cli) return respostaErro(c, 404, "Cliente não encontrado.");
  const a = await anexoDaEntidade(c, repo, "cliente", cli.id);
  if (!a) return respostaErro(c, 404, "Arquivo não encontrado.");
  return linkDoAnexo(c, repo, a, "/api/clientes");
});

rotasClientes.delete("/:id/anexos/:anexoId", exigirSocio, async (c) => {
  const repo = repoDaSessao(c);
  const cli = await clienteOu404(c, repo);
  if (!cli) return respostaErro(c, 404, "Cliente não encontrado.");
  const a = await anexoDaEntidade(c, repo, "cliente", cli.id);
  if (!a) return respostaErro(c, 404, "Arquivo não encontrado.");
  return apagarAnexo(c, repo, a, "cliente", cli.id);
});

// ---------- Processos do cliente (somente leitura; a gestão fica em /api/processos) ----------

rotasClientes.get("/:id/processos", async (c) => {
  const repo = repoDaSessao(c);
  const cli = await clienteOu404(c, repo);
  if (!cli) return respostaErro(c, 404, "Cliente não encontrado.");
  const lista = await repo.processos.doCliente(cli.id, 100);
  return c.json({
    ok: true,
    processos: lista.map((p) => ({ id: p.id, numero_cnj: p.numero_cnj, fase: p.fase, polo: p.polo, tribunal: p.tribunal, orgao: p.orgao, comarca: p.comarca, ativo: p.ativo === 1 })),
  });
});
