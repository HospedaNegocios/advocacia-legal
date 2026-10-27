import { Hono } from "hono";
import type { Env } from "../env";
import type { Ctx, Variaveis } from "../contexto";
import { CAMPOS_LANCAMENTO, STATUS_LANCAMENTO } from "../db/repositorio";
import type { LancamentoDetalhado, LinhaLancamento, Repositorio, StatusLancamento, TipoLancamento } from "../db/repositorio";
import { exigirPermissao, exigirSessao } from "../sessao";
import { lerJson, respostaErro } from "../validacao";
import { dataCivilAceita } from "../validacao-agenda";
import { ehTipoLancamento, validarLancamento, validarPagamento } from "../validacao-financeiro";
import { diferencaDias } from "../../comum/fuso";
import { primeiroDiaDoMes, ultimoDiaDoMes, ultimosMeses } from "../../comum/periodo";
import { hojeDoEscritorio } from "./agenda-comum";
import { numeroPositivo, registrar, repoDaSessao } from "./comum";

// Financeiro do escritório: lançamentos (receitas e despesas), contas a receber/pagar e caixa.
// Leitura (GET) exige a permissão "leitura" do módulo; criar, editar, pagar, estornar, cancelar e reabrir exigem "edicao";
// apagar exige "edicao" E ser sócio (sócio sempre tem acesso total). O escritório vem SEMPRE da sessão.
export const rotasFinanceiro = new Hono<{ Bindings: Env; Variables: Variaveis }>();
rotasFinanceiro.use("*", exigirSessao({ papel: "escritorio" }));

const lerPermitido = exigirPermissao("financeiro", "leitura");
const editarPermitido = exigirPermissao("financeiro", "edicao");
rotasFinanceiro.use("*", (c, proximo) => (c.req.method === "GET" || c.req.method === "HEAD" ? lerPermitido(c, proximo) : editarPermitido(c, proximo)));

const MSG_SOMENTE_LEITURA = "Lançamento pago ou cancelado não pode ser alterado. Estorne o pagamento ou reabra o lançamento antes de editar.";
const MSG_NAO_ABERTO = "Este lançamento não está em aberto.";

/** Situação para a tela: vencido = em aberto com vencimento antes de hoje (dia de São Paulo). */
function lancamentoPublico(l: LancamentoDetalhado, hoje: string) {
  const dias = diferencaDias(hoje, l.vencimento);
  const vencido = l.status === "aberto" && dias < 0;
  return {
    id: l.id,
    tipo: l.tipo,
    descricao: l.descricao,
    categoria: l.categoria,
    valor_centavos: l.valor_centavos,
    vencimento: l.vencimento,
    status: l.status,
    situacao: vencido ? "vencido" : l.status,
    vencido,
    /** Dias de atraso (0 se não está vencido). */
    dias_atraso: vencido ? -dias : 0,
    pago_em: l.pago_em,
    valor_pago_centavos: l.valor_pago_centavos,
    cliente_id: l.cliente_id,
    cliente_nome: l.cliente_nome,
    processo_id: l.processo_id,
    processo_numero: l.processo_numero,
    observacoes: l.observacoes,
    criado_por: l.criado_por,
    criado_em: l.criado_em,
    atualizado_em: l.atualizado_em,
  };
}

async function publicoPorId(repo: Repositorio, id: string) {
  const l = await repo.lancamentos.buscarDetalhado(id);
  return l ? lancamentoPublico(l, hojeDoEscritorio()) : null;
}

/** Cliente e processo precisam existir neste escritório (a busca filtra pela sessão) e estar ativos. */
async function conferirVinculos(c: Ctx, repo: Repositorio, clienteId: string | null, processoId: string | null) {
  if (clienteId !== null) {
    const cli = await repo.clientes.buscar(clienteId);
    if (!cli) return respostaErro(c, 404, "Cliente não encontrado.");
    if (cli.ativo === 0) return respostaErro(c, 409, "Este cliente está desativado. Reative o cliente para lançar valores nele.");
  }
  if (processoId !== null) {
    const p = await repo.processos.buscar(processoId);
    if (!p) return respostaErro(c, 404, "Processo não encontrado.");
    if (p.ativo === 0) return respostaErro(c, 409, "Este processo está desativado. Reative o processo para lançar valores nele.");
  }
  return null;
}

async function lancamentoOu404(c: Ctx, repo: Repositorio): Promise<LinhaLancamento | null> {
  return repo.lancamentos.buscar(c.req.param("id") ?? "");
}

// ---------- Rotas fixas (antes de /:id) ----------

rotasFinanceiro.get("/categorias", async (c) => c.json({ ok: true, categorias: await repoDaSessao(c).lancamentos.categorias() }));

rotasFinanceiro.get("/resumo", async (c) => {
  const hoje = hojeDoEscritorio();
  const de = c.req.query("de") || primeiroDiaDoMes(hoje);
  const ate = c.req.query("ate") || ultimoDiaDoMes(hoje);
  if (!dataCivilAceita(de) || !dataCivilAceita(ate)) return respostaErro(c, 400, "Período inválido. Use datas no formato AAAA-MM-DD.");
  if (de > ate) return respostaErro(c, 400, "O início do período não pode ser depois do fim.");
  const repo = repoDaSessao(c);
  const meses = ultimosMeses(hoje, 6);
  const [resumo, pontos] = await Promise.all([
    repo.lancamentos.resumo(hoje, de, ate),
    repo.lancamentos.serieMensal(`${meses[0]}-01`, ultimoDiaDoMes(hoje)),
  ]);
  const porMes = new Map(pontos.map((p) => [p.mes, p]));
  const serie = meses.map((mes) => ({ mes, recebido_centavos: porMes.get(mes)?.recebido_centavos ?? 0, pago_centavos: porMes.get(mes)?.pago_centavos ?? 0 }));
  return c.json({ ok: true, hoje, periodo: { de, ate }, resumo, serie_mensal: serie });
});

// ---------- Lista e cadastro ----------

rotasFinanceiro.get("/", async (c) => {
  const q = (nome: string) => c.req.query(nome) || undefined;
  const tipo = q("tipo");
  const status = q("status");
  const ordem = q("ordem");
  if (tipo && !ehTipoLancamento(tipo)) return respostaErro(c, 400, "Tipo inválido.");
  // "vencido" não é uma situação gravada: é calculado (em aberto e vencimento antes de hoje, no dia de São Paulo).
  if (status && status !== "vencido" && !(STATUS_LANCAMENTO as readonly string[]).includes(status)) return respostaErro(c, 400, "Situação inválida.");
  if (ordem && ordem !== "vencimento" && ordem !== "vencimento_desc" && ordem !== "pago_em_desc") return respostaErro(c, 400, "Ordem inválida.");
  const datas = { de: q("de"), ate: q("ate"), pago_de: q("pago_de"), pago_ate: q("pago_ate") };
  for (const valor of Object.values(datas)) if (valor && !dataCivilAceita(valor)) return respostaErro(c, 400, "Período inválido. Use datas no formato AAAA-MM-DD.");
  if ((datas.de && datas.ate && datas.de > datas.ate) || (datas.pago_de && datas.pago_ate && datas.pago_de > datas.pago_ate)) {
    return respostaErro(c, 400, "O início do período não pode ser depois do fim.");
  }
  const hoje = hojeDoEscritorio();
  const porPagina = numeroPositivo(c.req.query("por_pagina"), 20, 100);
  const pagina = numeroPositivo(c.req.query("pagina"), 1, 100000);
  const r = await repoDaSessao(c).lancamentos.pesquisar({
    ...(tipo ? { tipo: tipo as TipoLancamento } : {}),
    ...(status === "vencido" ? { vencidos_antes_de: hoje } : status ? { status: status as StatusLancamento } : {}),
    ...(datas.de ? { de: datas.de } : {}),
    ...(datas.ate ? { ate: datas.ate } : {}),
    ...(datas.pago_de ? { pago_de: datas.pago_de } : {}),
    ...(datas.pago_ate ? { pago_ate: datas.pago_ate } : {}),
    ...(q("cliente_id") ? { cliente_id: q("cliente_id") as string } : {}),
    ...(q("processo_id") ? { processo_id: q("processo_id") as string } : {}),
    ...(q("categoria") ? { categoria: q("categoria") as string } : {}),
    busca: c.req.query("busca") ?? "",
    ...(ordem ? { ordem: ordem as "vencimento" | "vencimento_desc" | "pago_em_desc" } : {}),
    limite: porPagina,
    deslocamento: (pagina - 1) * porPagina,
  });
  return c.json({ ok: true, hoje, lancamentos: r.itens.map((l) => lancamentoPublico(l, hoje)), total: r.total, pagina, por_pagina: porPagina });
});

rotasFinanceiro.post("/", async (c) => {
  const v = validarLancamento(await lerJson(c), true);
  if (!v.ok) return respostaErro(c, 400, v.erro);
  const repo = repoDaSessao(c);
  const falha = await conferirVinculos(c, repo, v.dados.cliente_id, v.dados.processo_id);
  if (falha) return falha;
  const id = await repo.lancamentos.inserir({ ...v.dados, tipo: v.tipo as "receita" | "despesa", status: "aberto", criado_por: c.get("sessao").usuario.id });
  // Auditoria sem descrição nem valores: só o tipo e a situação.
  await registrar(c, "lancamento_criado", "lancamentos", id, { tipo: v.tipo, status_para: "aberto" });
  return c.json({ ok: true, lancamento: await publicoPorId(repo, id) }, 201);
});

rotasFinanceiro.get("/:id", async (c) => {
  const repo = repoDaSessao(c);
  const l = await repo.lancamentos.buscarDetalhado(c.req.param("id"));
  if (!l) return respostaErro(c, 404, "Lançamento não encontrado.");
  return c.json({ ok: true, lancamento: lancamentoPublico(l, hojeDoEscritorio()) });
});

rotasFinanceiro.put("/:id", async (c) => {
  const repo = repoDaSessao(c);
  const atual = await lancamentoOu404(c, repo);
  if (!atual) return respostaErro(c, 404, "Lançamento não encontrado.");
  if (atual.status !== "aberto") return respostaErro(c, 409, MSG_SOMENTE_LEITURA);
  const v = validarLancamento(await lerJson(c), false);
  if (!v.ok) return respostaErro(c, 400, v.erro);
  // Só confere (e recusa desativado) o vínculo que mudou: manter o cliente de antes continua permitido.
  const falha = await conferirVinculos(c, repo, v.dados.cliente_id !== atual.cliente_id ? v.dados.cliente_id : null, v.dados.processo_id !== atual.processo_id ? v.dados.processo_id : null);
  if (falha) return falha;
  if (!(await repo.lancamentos.atualizarAberto(atual.id, v.dados))) return respostaErro(c, 409, MSG_SOMENTE_LEITURA);
  // Auditoria guarda só os nomes dos campos alterados.
  const alterados = CAMPOS_LANCAMENTO.filter((campo) => (atual[campo] ?? null) !== v.dados[campo]);
  await registrar(c, "lancamento_alterado", "lancamentos", atual.id, { campos: alterados.join(",") });
  return c.json({ ok: true, lancamento: await publicoPorId(repo, atual.id) });
});

// ---------- Mudanças de situação ----------

rotasFinanceiro.post("/:id/pagar", async (c) => {
  const repo = repoDaSessao(c);
  const atual = await lancamentoOu404(c, repo);
  if (!atual) return respostaErro(c, 404, "Lançamento não encontrado.");
  if (atual.status !== "aberto") return respostaErro(c, 409, MSG_NAO_ABERTO);
  const v = validarPagamento(await lerJson(c), hojeDoEscritorio());
  if (!v.ok) return respostaErro(c, 400, v.erro);
  if (!(await repo.lancamentos.pagar(atual.id, v.pago_em, v.valor_pago_centavos ?? atual.valor_centavos))) return respostaErro(c, 409, MSG_NAO_ABERTO);
  await registrar(c, "lancamento_pago", "lancamentos", atual.id, { status_de: "aberto", status_para: "pago" });
  return c.json({ ok: true, lancamento: await publicoPorId(repo, atual.id) });
});

async function mudarSituacao(c: Ctx, de: StatusLancamento, para: StatusLancamento, acao: string, mensagem409: string, executar: (repo: Repositorio, id: string) => Promise<boolean>) {
  const repo = repoDaSessao(c);
  const atual = await lancamentoOu404(c, repo);
  if (!atual) return respostaErro(c, 404, "Lançamento não encontrado.");
  if (atual.status !== de || !(await executar(repo, atual.id))) return respostaErro(c, 409, mensagem409);
  await registrar(c, acao, "lancamentos", atual.id, { status_de: de, status_para: para });
  return c.json({ ok: true, lancamento: await publicoPorId(repo, atual.id) });
}

rotasFinanceiro.post("/:id/estornar", (c) => mudarSituacao(c, "pago", "aberto", "lancamento_estornado", "Só é possível estornar um lançamento pago.", (r, id) => r.lancamentos.estornar(id)));
rotasFinanceiro.post("/:id/cancelar", (c) => mudarSituacao(c, "aberto", "cancelado", "lancamento_cancelado", "Só é possível cancelar um lançamento em aberto. Se já foi pago, estorne o pagamento antes.", (r, id) => r.lancamentos.cancelar(id)));
rotasFinanceiro.post("/:id/reabrir", (c) => mudarSituacao(c, "cancelado", "aberto", "lancamento_reaberto", "Só é possível reabrir um lançamento cancelado.", (r, id) => r.lancamentos.reabrir(id)));

// Apagar: definitivo, só o sócio, em qualquer situação. Fica registrado na auditoria (sem descrição nem valores).
rotasFinanceiro.delete("/:id", async (c) => {
  if (c.get("sessao").usuario.perfil !== "socio") return respostaErro(c, 403, "Só o sócio pode apagar um lançamento.");
  const repo = repoDaSessao(c);
  const atual = await lancamentoOu404(c, repo);
  if (!atual) return respostaErro(c, 404, "Lançamento não encontrado.");
  await repo.lancamentos.excluir(atual.id);
  await registrar(c, "lancamento_apagado", "lancamentos", atual.id, { status_de: atual.status });
  return c.json({ ok: true });
});
