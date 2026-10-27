import { Hono } from "hono";
import type { Env } from "../env";
import type { Ctx, Variaveis } from "../contexto";
import { CAMPOS_CLIENTE, criarRepositorio } from "../db/repositorio";
import type { LinhaAnexo, LinhaCliente, LinhaConsentimento, LinhaContatoCliente, Repositorio } from "../db/repositorio";
import { auditar } from "../auditoria";
import { criarLinkAnexo, verificarLinkAnexo, VALIDADE_LINK_ANEXO_MS } from "../auth/cripto";
import {
  MIME_POR_TIPO,
  TAMANHO_MAXIMO_ANEXO,
  cabecalhoDownload,
  detectarTipo,
  extensaoCombina,
  extensaoDe,
  limparNomeArquivo,
  montarChaveR2,
} from "../anexos";
import { exigirSessao, ipDe } from "../sessao";
import { lerJson, respostaErro } from "../validacao";
import { validarCliente, validarConsentimento, validarContato } from "../validacao-clientes";

// Clientes do escritório. Todos os perfis criam e editam; só o sócio desativa/reativa e apaga anexos.
// O escritório vem SEMPRE da sessão. Nenhuma rota aceita tenant_id.
export const rotasClientes = new Hono<{ Bindings: Env; Variables: Variaveis }>();
rotasClientes.use("*", exigirSessao({ papel: "escritorio" }));

const exigirSocio = exigirSessao({ papel: "socio" });

const MSG_DOC_DUPLICADO = "Já existe um cliente com este CPF/CNPJ neste escritório.";
const MSG_INATIVO = "Este cliente está desativado. Reative o cliente para alterar o cadastro.";

function repoDaSessao(c: Ctx): Repositorio {
  return criarRepositorio(c.env.DB, c.get("sessao").tenantId as string);
}

function ehConflitoDeUnicidade(e: unknown): boolean {
  return e instanceof Error && /UNIQUE/i.test(e.message);
}

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

const anexoPublico = (l: LinhaAnexo) => ({ id: l.id, nome: l.nome_original, tipo_mime: l.tipo_mime, tamanho_bytes: l.tamanho_bytes, enviado_por: l.enviado_por, criado_em: l.criado_em });

async function registrar(c: Ctx, acao: string, entidade: string, entidadeId: string, detalhes?: Record<string, string | number | boolean | null>) {
  const sessao = c.get("sessao");
  await auditar(c.env.DB, {
    tenantId: sessao.tenantId,
    userId: sessao.usuario.id,
    acao,
    entidade,
    entidadeId,
    ...(detalhes ? { detalhes } : {}),
    ip: ipDe(c),
  });
}

function numeroPositivo(v: string | undefined, padrao: number, maximo: number): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, maximo) : padrao;
}

// ---------- Download por link temporário (registrada antes de /:id) ----------

rotasClientes.get("/anexos/:anexoId/arquivo", async (c) => {
  const sessao = c.get("sessao");
  const token = c.req.query("token") ?? "";
  const anexoId = c.req.param("anexoId");
  const tenantId = sessao.tenantId as string;
  // Primeiro a assinatura (escritório da sessão + anexo + validade); depois a busca já filtrada pelo escritório.
  if (!(await verificarLinkAnexo(token, tenantId, anexoId, c.env.CHAVE_CRIPTO))) {
    return respostaErro(c, 403, "Link inválido ou expirado. Volte à tela do cliente e gere um novo.");
  }
  const repo = repoDaSessao(c);
  const anexo = await repo.anexos.buscar(anexoId);
  if (!anexo || !anexo.chave_r2.startsWith(`${tenantId}/`)) return respostaErro(c, 404, "Arquivo não encontrado.");
  const objeto = await c.env.ARQUIVOS.get(anexo.chave_r2);
  if (!objeto) return respostaErro(c, 404, "Arquivo não encontrado.");
  await registrar(c, "anexo_baixado", "anexos", anexo.id, { entidade: anexo.entidade, entidade_id: anexo.entidade_id });
  return new Response(objeto.body, {
    headers: {
      "Content-Type": anexo.tipo_mime,
      "Content-Length": String(anexo.tamanho_bytes),
      "Content-Disposition": cabecalhoDownload(anexo.nome_original),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
});

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
  const lista = await repo.anexos.listar({ entidade: "cliente", entidade_id: cli.id }, { limite: 200 });
  return c.json({ ok: true, anexos: lista.map(anexoPublico), tamanho_maximo: TAMANHO_MAXIMO_ANEXO });
});

// Envio: corpo = bytes do arquivo; nome em X-Nome-Arquivo (codificado com encodeURIComponent).
rotasClientes.post("/:id/anexos", async (c) => {
  const repo = repoDaSessao(c);
  const cli = await clienteOu404(c, repo);
  if (!cli) return respostaErro(c, 404, "Cliente não encontrado.");
  if (cli.ativo === 0) return respostaErro(c, 409, MSG_INATIVO);
  const limiteMb = TAMANHO_MAXIMO_ANEXO / 1024 / 1024;
  const msgTamanho = `O arquivo é maior que ${limiteMb} MB. Reduza o arquivo e tente de novo.`;
  // Recusa pelo tamanho declarado antes de ler o corpo; depois confere o tamanho real.
  const declarado = Number(c.req.header("Content-Length"));
  if (!Number.isInteger(declarado) || declarado <= 0) return respostaErro(c, 400, "Envie o arquivo com o tamanho informado.");
  if (declarado > TAMANHO_MAXIMO_ANEXO) return respostaErro(c, 413, msgTamanho);
  let nome = "";
  try {
    nome = limparNomeArquivo(decodeURIComponent(c.req.header("X-Nome-Arquivo") ?? ""));
  } catch {
    nome = "";
  }
  if (!nome) return respostaErro(c, 400, "Informe o nome do arquivo.");
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (bytes.length === 0) return respostaErro(c, 400, "O arquivo está vazio.");
  if (bytes.length > TAMANHO_MAXIMO_ANEXO) return respostaErro(c, 413, msgTamanho);
  const extensao = extensaoDe(nome);
  const tipo = detectarTipo(bytes, extensao);
  if (!tipo || !extensaoCombina(tipo, extensao)) {
    return respostaErro(c, 400, "Tipo de arquivo não aceito. Envie PDF, imagem (JPEG, PNG ou WEBP), Word (.doc, .docx) ou Excel (.xls, .xlsx).");
  }
  const mime = MIME_POR_TIPO[tipo];
  const chave = montarChaveR2(repo.tenantId, "cliente", cli.id);
  await c.env.ARQUIVOS.put(chave, bytes, { httpMetadata: { contentType: mime } });
  let id: string;
  try {
    id = await repo.anexos.inserir({
      entidade: "cliente",
      entidade_id: cli.id,
      nome_original: nome,
      tipo_mime: mime,
      tamanho_bytes: bytes.length,
      chave_r2: chave,
      enviado_por: c.get("sessao").usuario.id,
    });
  } catch (e) {
    await c.env.ARQUIVOS.delete(chave);
    throw e;
  }
  await registrar(c, "anexo_enviado", "anexos", id, { entidade: "cliente", entidade_id: cli.id, tamanho_bytes: bytes.length, tipo });
  const novo = await repo.anexos.buscar(id);
  return c.json({ ok: true, anexo: novo ? anexoPublico(novo) : null }, 201);
});

async function anexoDoCliente(c: Ctx, repo: Repositorio, cli: LinhaCliente) {
  const a = await repo.anexos.buscar(c.req.param("anexoId") ?? "");
  return a && a.entidade === "cliente" && a.entidade_id === cli.id ? a : null;
}

// Gera o link temporário (5 minutos). O navegador abre o link, que confere sessão, escritório e assinatura.
rotasClientes.get("/:id/anexos/:anexoId/link", async (c) => {
  const repo = repoDaSessao(c);
  const cli = await clienteOu404(c, repo);
  if (!cli) return respostaErro(c, 404, "Cliente não encontrado.");
  const a = await anexoDoCliente(c, repo, cli);
  if (!a) return respostaErro(c, 404, "Arquivo não encontrado.");
  const token = await criarLinkAnexo(repo.tenantId, a.id, c.env.CHAVE_CRIPTO);
  return c.json({ ok: true, url: `/api/clientes/anexos/${a.id}/arquivo?token=${token}`, validade_segundos: VALIDADE_LINK_ANEXO_MS / 1000 });
});

rotasClientes.delete("/:id/anexos/:anexoId", exigirSocio, async (c) => {
  const repo = repoDaSessao(c);
  const cli = await clienteOu404(c, repo);
  if (!cli) return respostaErro(c, 404, "Cliente não encontrado.");
  const a = await anexoDoCliente(c, repo, cli);
  if (!a) return respostaErro(c, 404, "Arquivo não encontrado.");
  await repo.anexos.excluir(a.id);
  // Se a remoção no R2 falhar, o registro já saiu do sistema e o arquivo fica inacessível (sem link possível).
  await c.env.ARQUIVOS.delete(a.chave_r2);
  await registrar(c, "anexo_excluido", "anexos", a.id, { entidade: "cliente", entidade_id: cli.id });
  return c.json({ ok: true });
});
