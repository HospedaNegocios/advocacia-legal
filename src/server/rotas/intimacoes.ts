import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { Env } from "../env";
import type { Ctx, Variaveis } from "../contexto";
import { htmlParaTexto } from "../../comum/html";
import { FUSO_PADRAO, dataCivilValida, hojeEm, somarDias } from "../../comum/fuso";
import type { IntimacaoDetalhada, IntimacaoResumida, LinhaResumoIa, OabDaIntimacao, Repositorio } from "../db/repositorio";
import { criarAcessoAutenticacao } from "../db/repositorio";
import { buscarDoEscritorio } from "../djen/coleta";
import { depsDjen } from "../djen/ambiente";
import { exigirSessao } from "../sessao";
import { lerJson, respostaErro } from "../validacao";
import { numeroPositivo, registrar, repoDaSessao } from "./comum";
import { MAX_CARACTERES_RESUMO, bindingIa, ErroIa, gerarResumo, prepararEntrada, MODELO_RESUMO } from "../ia";
import { cotaDeIa, mensagemCotaDeIaEsgotada, mensagemPlanoSemIa } from "../planos";

// Intimações do DJEN. Todos os perfis do escritório leem, marcam como lida e vinculam a processo; só o sócio dispara a busca.
// Ninguém apaga intimação. O escritório vem SEMPRE da sessão. Os registros NÃO guardam nem registram texto de publicação na auditoria.
export const rotasIntimacoes = new Hono<{ Bindings: Env; Variables: Variaveis }>();
rotasIntimacoes.use("*", exigirSessao({ papel: "escritorio" }));

const exigirSocio = exigirSessao({ papel: "socio" });

const JANELA_BUSCA_MANUAL_MS = 10 * 60_000;
const MAX_IDS_EM_LOTE = 200;

const oabPublica = (o: OabDaIntimacao) => ({ id: o.oab_id, numero: o.numero, sufixo: o.sufixo, uf: o.uf, advogado_nome: o.advogado_nome });

function basePublica(l: Omit<IntimacaoResumida, "texto_inicio"> | Omit<IntimacaoDetalhada, "texto">, oabs: OabDaIntimacao[]) {
  return {
    id: l.id,
    numero_processo: l.numero_processo,
    tribunal: l.tribunal,
    orgao: l.orgao,
    tipo: l.tipo,
    tipo_documento: l.tipo_documento,
    classe: l.classe,
    data_disponibilizacao: l.data_disponibilizacao,
    link: l.link,
    cancelada: l.cancelada_em !== null,
    processo_id: l.processo_id,
    processo_cnj: l.processo_cnj,
    vinculo: l.vinculo,
    lida: l.lida_em !== null,
    lida_em: l.lida_em,
    lida_por: l.lida_por,
    criado_em: l.criado_em,
    oabs: oabs.filter((o) => o.intimacao_id === l.id).map(oabPublica),
  };
}

const previa = (t: string) => htmlParaTexto(t).replace(/\s+/g, " ").trim().slice(0, 240);

async function listaPublica(repo: Repositorio, linhas: IntimacaoResumida[]) {
  const oabs = await repo.intimacoes.oabsDe(linhas.map((l) => l.id));
  return linhas.map((l) => ({ ...basePublica(l, oabs), previa: previa(l.texto_inicio) }));
}

async function detalhePublico(repo: Repositorio, l: IntimacaoDetalhada) {
  const oabs = await repo.intimacoes.oabsDe([l.id]);
  return { ...basePublica(l, oabs), texto: htmlParaTexto(l.texto) };
}

const dataOuNula = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && dataCivilValida(v) ? v : null);

// ---------- Rotas fixas (antes de /:id) ----------

/** Só a contagem de não lidas (selo do menu, consultada de tempos em tempos). */
rotasIntimacoes.get("/contagem", async (c) => {
  const hoje = hojeEm(FUSO_PADRAO);
  const r = await repoDaSessao(c).intimacoes.resumo(hoje, somarDias(hoje, -6));
  return c.json({ ok: true, nao_lidas: r.nao_lidas });
});

rotasIntimacoes.get("/resumo", async (c) => {
  const repo = repoDaSessao(c);
  const hoje = hojeEm(FUSO_PADRAO);
  const [resumo, situacao, oabs] = await Promise.all([repo.intimacoes.resumo(hoje, somarDias(hoje, -6)), repo.djen.situacao(), repo.oabs.listar({}, { limite: 200 })]);
  return c.json({
    ok: true,
    hoje,
    resumo: { total: resumo.total, nao_lidas: resumo.nao_lidas, hoje: resumo.hoje, ultimos_7_dias: resumo.ultimos_7_dias, sem_processo: resumo.sem_processo },
    tribunais: resumo.tribunais,
    oabs: oabs.map((o) => ({ id: o.id, numero: o.numero, sufixo: o.sufixo, uf: o.uf, advogado_nome: o.advogado_nome, ativo: o.ativo === 1 })),
    busca: {
      ultima_sucesso_em: situacao.ultima_sucesso_em,
      ultima: situacao.ultima ? { resultado: situacao.ultima.resultado, em: situacao.ultima.concluida_em, origem: situacao.ultima.origem } : null,
    },
  });
});

rotasIntimacoes.get("/", async (c) => {
  const repo = repoDaSessao(c);
  const situacao = c.req.query("situacao") ?? "nao_lidas";
  const vinculo = c.req.query("vinculo");
  const de = c.req.query("de");
  const ate = c.req.query("ate");
  if (!["nao_lidas", "lidas", "todas"].includes(situacao)) return respostaErro(c, 400, "Situação inválida.");
  if (vinculo && vinculo !== "com" && vinculo !== "sem") return respostaErro(c, 400, "Filtro de processo inválido.");
  if ((de && !dataOuNula(de)) || (ate && !dataOuNula(ate))) return respostaErro(c, 400, "Data inválida.");
  const porPagina = numeroPositivo(c.req.query("por_pagina"), 20, 100);
  const pagina = numeroPositivo(c.req.query("pagina"), 1, 100000);
  const oabId = c.req.query("oab_id");
  const tribunal = c.req.query("tribunal");
  const processoId = c.req.query("processo_id");
  const r = await repo.intimacoes.pesquisar({
    ...(situacao === "nao_lidas" || situacao === "lidas" ? { situacao } : {}),
    ...(oabId ? { oab_id: oabId } : {}),
    ...(tribunal ? { tribunal } : {}),
    ...(vinculo ? { vinculo: vinculo as "com" | "sem" } : {}),
    ...(processoId ? { processo_id: processoId } : {}),
    ...(de ? { de } : {}),
    ...(ate ? { ate } : {}),
    busca: c.req.query("busca") ?? "",
    limite: porPagina,
    deslocamento: (pagina - 1) * porPagina,
  });
  return c.json({ ok: true, intimacoes: await listaPublica(repo, r.itens), total: r.total, pagina, por_pagina: porPagina });
});

/** Marcar várias como lidas. Auditoria só com a quantidade (nunca texto nem números de processo). */
rotasIntimacoes.post("/lidas", async (c) => {
  const corpo = await lerJson(c);
  const ids = Array.isArray(corpo["ids"]) ? corpo["ids"].filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 64) : [];
  if (ids.length === 0) return respostaErro(c, 400, "Escolha ao menos uma intimação.");
  if (ids.length > MAX_IDS_EM_LOTE) return respostaErro(c, 400, `Marque no máximo ${MAX_IDS_EM_LOTE} de cada vez.`);
  const mudadas = await repoDaSessao(c).intimacoes.marcarVariasLidas(ids, c.get("sessao").usuario.id, new Date().toISOString());
  await registrar(c, "intimacoes_lidas_em_lote", "intimacoes", "lote", { quantidade: mudadas });
  return c.json({ ok: true, marcadas: mudadas });
});

/** Busca agora no DJEN, só o sócio, no máximo uma vez a cada 10 minutos por escritório. */
rotasIntimacoes.post("/buscar", exigirSocio, async (c) => {
  const tenantId = c.get("sessao").tenantId as string;
  const repo = repoDaSessao(c);
  if ((await repo.oabs.contarAtivas()) === 0) return respostaErro(c, 409, "Cadastre ao menos uma OAB ativa na tela Escritório para buscar intimações.");
  const tentativas = await criarAcessoAutenticacao(c.env.DB).contarTentativa(`djen-buscar:${tenantId}`, JANELA_BUSCA_MANUAL_MS);
  if (tentativas > 1) return respostaErro(c, 429, "A busca já foi feita há pouco. Aguarde 10 minutos para buscar de novo.");
  const r = await buscarDoEscritorio(depsDjen(c.env.DB), tenantId);
  await registrar(c, "intimacoes_busca_manual", "intimacoes", tenantId, {
    oabs: r.oabs,
    sucesso: r.sucesso,
    erro: r.erro,
    bloqueado: r.bloqueado,
    adiadas: r.adiadas,
    novas: r.novas,
  });
  return c.json({ ok: true, resultado: { oabs: r.oabs, sucesso: r.sucesso, erro: r.erro, bloqueado: r.bloqueado, adiadas: r.adiadas, novas: r.novas } });
});

// ---------- Uma intimação ----------

async function intimacaoOu404(c: Ctx, repo: Repositorio): Promise<IntimacaoDetalhada | null> {
  return repo.intimacoes.buscarDetalhada(c.req.param("id") ?? "");
}

rotasIntimacoes.get("/:id", async (c) => {
  const repo = repoDaSessao(c);
  const i = await intimacaoOu404(c, repo);
  if (!i) return respostaErro(c, 404, "Intimação não encontrada.");
  return c.json({ ok: true, intimacao: await detalhePublico(repo, i) });
});

rotasIntimacoes.post("/:id/lida", async (c) => {
  const repo = repoDaSessao(c);
  const id = c.req.param("id");
  if (!(await repo.intimacoes.marcarLida(id, c.get("sessao").usuario.id, new Date().toISOString()))) return respostaErro(c, 404, "Intimação não encontrada.");
  await registrar(c, "intimacao_lida", "intimacoes", id);
  const i = await repo.intimacoes.buscarDetalhada(id);
  return c.json({ ok: true, intimacao: i ? await detalhePublico(repo, i) : null });
});

rotasIntimacoes.post("/:id/nao-lida", async (c) => {
  const repo = repoDaSessao(c);
  const id = c.req.param("id");
  if (!(await repo.intimacoes.marcarNaoLida(id))) return respostaErro(c, 404, "Intimação não encontrada.");
  await registrar(c, "intimacao_nao_lida", "intimacoes", id);
  const i = await repo.intimacoes.buscarDetalhada(id);
  return c.json({ ok: true, intimacao: i ? await detalhePublico(repo, i) : null });
});

/** Vínculo manual: só quando o número CNJ não bateu com nenhum processo, e só com processo ATIVO do próprio escritório. */
rotasIntimacoes.post("/:id/processo", async (c) => {
  const repo = repoDaSessao(c);
  const i = await intimacaoOu404(c, repo);
  if (!i) return respostaErro(c, 404, "Intimação não encontrada.");
  const corpo = await lerJson(c);
  const processoId = typeof corpo["processo_id"] === "string" ? corpo["processo_id"] : "";
  if (!processoId) return respostaErro(c, 400, "Escolha o processo.");
  if (i.processo_id) return respostaErro(c, 409, "Esta intimação já está vinculada a um processo.");
  const processo = await repo.processos.buscar(processoId);
  if (!processo) return respostaErro(c, 404, "Processo não encontrado.");
  if (processo.ativo !== 1) return respostaErro(c, 409, "Este processo está desativado. Reative o processo para vincular.");
  if (!(await repo.intimacoes.vincularProcesso(i.id, processo.id))) return respostaErro(c, 409, "Esta intimação já está vinculada a um processo.");
  await registrar(c, "intimacao_vinculada", "intimacoes", i.id, { processo_id: processo.id });
  const nova = await repo.intimacoes.buscarDetalhada(i.id);
  return c.json({ ok: true, intimacao: nova ? await detalhePublico(repo, nova) : null });
});

// ---------- Resumo por IA (docs/IA.md) ----------
// Ver, todos os perfis. Gerar, editar, aprovar e rejeitar: só sócio e advogado (quem responde pela revisão).
// A auditoria guarda só ids, modelo e situação, NUNCA o texto da publicação nem o do resumo.

const exigirRevisor: MiddlewareHandler<{ Bindings: Env; Variables: Variaveis }> = async (c, next) => {
  const perfil = c.get("sessao").usuario.perfil;
  if (perfil !== "socio" && perfil !== "advogado") return respostaErro(c, 403, "Só sócio ou advogado pode gerar, editar, aprovar ou rejeitar resumos.");
  await next();
};

const resumoPublico = (r: LinhaResumoIa | null) =>
  r
    ? { id: r.id, texto: r.texto, modelo: r.modelo, situacao: r.situacao, gerado_por: r.gerado_por, decidido_por: r.decidido_por, decidido_em: r.decidido_em, criado_em: r.criado_em, atualizado_em: r.atualizado_em, publicado_portal_em: r.publicado_portal_em }
    : null;

async function estadoDoResumo(repo: Repositorio, intimacaoId: string) {
  const dia = hojeEm(FUSO_PADRAO);
  const [escritorio, resumo, usado] = await Promise.all([repo.buscarMeuEscritorio(), repo.resumosIa.buscar(intimacaoId), repo.resumosIa.usoDoDia(dia)]);
  const plano = escritorio?.plano ?? "solo";
  const limite = cotaDeIa(plano);
  return { plano, resumo: resumoPublico(resumo), uso: { dia, usado: Math.min(usado, limite), limite, restante: Math.max(0, limite - usado) } };
}

rotasIntimacoes.get("/:id/resumo", async (c) => {
  const repo = repoDaSessao(c);
  const id = c.req.param("id");
  if (!(await repo.intimacoes.buscarDetalhada(id))) return respostaErro(c, 404, "Intimação não encontrada.");
  const e = await estadoDoResumo(repo, id);
  return c.json({ ok: true, resumo: e.resumo, uso: e.uso });
});

rotasIntimacoes.post("/:id/resumo/gerar", exigirRevisor, async (c) => {
  const repo = repoDaSessao(c);
  const id = c.req.param("id");
  const i = await repo.intimacoes.buscarDetalhada(id);
  if (!i) return respostaErro(c, 404, "Intimação não encontrada.");
  const e = await estadoDoResumo(repo, id);
  if (e.uso.limite === 0) return respostaErro(c, 403, mensagemPlanoSemIa(e.plano));
  if (e.resumo?.situacao === "aprovado") return respostaErro(c, 409, "Este resumo já foi aprovado. Rejeite-o antes de gerar outro.");
  if (i.texto.trim().length === 0) return respostaErro(c, 400, "A publicação não trouxe texto para resumir.");
  const entrada = prepararEntrada(i.texto);
  // Reserva a cota ANTES de chamar a IA (evita gastar além do limite em cliques simultâneos) e devolve se a IA falhar.
  const dia = e.uso.dia;
  if (!(await repo.resumosIa.reservarUso(dia, e.uso.limite))) return respostaErro(c, 429, mensagemCotaDeIaEsgotada(e.uso.limite));
  let texto: string;
  try {
    texto = await gerarResumo(bindingIa(c.env), entrada);
  } catch (erro) {
    await repo.resumosIa.devolverUso(dia);
    if (erro instanceof ErroIa) return respostaErro(c, 503, "Não foi possível gerar o resumo agora. Nada foi descontado da sua cota. Tente de novo em instantes.");
    throw erro;
  }
  const sessao = c.get("sessao");
  const gravou = await repo.resumosIa.salvarRascunho(id, { texto, modelo: MODELO_RESUMO, geradoPor: sessao.usuario.id }, new Date().toISOString());
  if (!gravou) {
    await repo.resumosIa.devolverUso(dia);
    return respostaErro(c, 409, "Este resumo já foi aprovado. Rejeite-o antes de gerar outro.");
  }
  await registrar(c, "resumo_ia_gerado", "intimacoes_resumos", id, { modelo: MODELO_RESUMO, truncado: entrada.truncado });
  const novo = await estadoDoResumo(repo, id);
  return c.json({ ok: true, resumo: novo.resumo, uso: novo.uso, texto_cortado: entrada.truncado });
});

rotasIntimacoes.put("/:id/resumo", exigirRevisor, async (c) => {
  const repo = repoDaSessao(c);
  const id = c.req.param("id");
  const atual = await repo.resumosIa.buscar(id);
  if (!atual) return respostaErro(c, 404, "Esta intimação ainda não tem resumo.");
  const corpo = await lerJson(c);
  const texto = typeof corpo["texto"] === "string" ? corpo["texto"].trim() : "";
  if (texto.length === 0) return respostaErro(c, 400, "O resumo não pode ficar vazio.");
  if (texto.length > MAX_CARACTERES_RESUMO) return respostaErro(c, 400, `O resumo pode ter no máximo ${MAX_CARACTERES_RESUMO} caracteres.`);
  if (atual.situacao !== "rascunho") return respostaErro(c, 409, "Só é possível editar um resumo em rascunho. Rejeite o atual e gere outro.");
  if (!(await repo.resumosIa.editarRascunho(id, texto, new Date().toISOString()))) return respostaErro(c, 409, "Só é possível editar um resumo em rascunho.");
  await registrar(c, "resumo_ia_editado", "intimacoes_resumos", id);
  const e = await estadoDoResumo(repo, id);
  return c.json({ ok: true, resumo: e.resumo, uso: e.uso });
});

for (const [rota, para, acao] of [
  ["aprovar", "aprovado", "resumo_ia_aprovado"],
  ["rejeitar", "rejeitado", "resumo_ia_rejeitado"],
] as const) {
  rotasIntimacoes.post(`/:id/resumo/${rota}`, exigirRevisor, async (c) => {
    const repo = repoDaSessao(c);
    const id = c.req.param("id");
    const atual = await repo.resumosIa.buscar(id);
    if (!atual) return respostaErro(c, 404, "Esta intimação ainda não tem resumo.");
    if (!(await repo.resumosIa.decidir(id, para, c.get("sessao").usuario.id, new Date().toISOString()))) {
      return respostaErro(c, 409, para === "aprovado" ? "Só é possível aprovar um resumo em rascunho." : "Este resumo já foi rejeitado.");
    }
    await registrar(c, acao, "intimacoes_resumos", id, { de: atual.situacao, para });
    const e = await estadoDoResumo(repo, id);
    return c.json({ ok: true, resumo: e.resumo, uso: e.uso });
  });
}
