import { Hono } from "hono";
import type { Env } from "../env";
import type { Variaveis } from "../contexto";
import { CAMPOS_PRAZO } from "../db/repositorio";
import type { LinhaPrazo, StatusPrazo } from "../db/repositorio";
import { exigirSessao } from "../sessao";
import { lerJson, respostaErro } from "../validacao";
import { dataCivilAceita, ehStatusPrazo, validarPrazo } from "../validacao-agenda";
import { conferirProcesso, conferirUsuario, hojeDoEscritorio, prazoPublico } from "./agenda-comum";
import { calcularPrazo, TIPOS_INICIO } from "../../comum/prazos-uteis";
import type { TipoContagem, TipoInicio } from "../../comum/prazos-uteis";
import { somarDias } from "../../comum/fuso";
import { numeroPositivo, registrar, repoDaSessao } from "./comum";

// Prazos do escritório (Kanban). Todos os perfis criam, editam e movem; só o sócio apaga (com registro na auditoria).
// O escritório vem SEMPRE da sessão. Nenhuma rota aceita tenant_id.
export const rotasPrazos = new Hono<{ Bindings: Env; Variables: Variaveis }>();
rotasPrazos.use("*", exigirSessao({ papel: "escritorio" }));

const exigirSocio = exigirSessao({ papel: "socio" });

rotasPrazos.get("/resumo", async (c) => {
  const responsavel = c.req.query("responsavel");
  const r = await repoDaSessao(c).prazos.resumo(hojeDoEscritorio(), responsavel || undefined);
  return c.json({ ok: true, resumo: r });
});

rotasPrazos.get("/", async (c) => {
  const repo = repoDaSessao(c);
  const status = c.req.query("status");
  const responsavel = c.req.query("responsavel");
  const processoId = c.req.query("processo_id");
  const de = c.req.query("de");
  const ate = c.req.query("ate");
  const concluidosDias = c.req.query("concluidos_dias");
  if (status && !ehStatusPrazo(status)) return respostaErro(c, 400, "Status inválido.");
  if ((de && !dataCivilAceita(de)) || (ate && !dataCivilAceita(ate))) return respostaErro(c, 400, "Período inválido. Use datas no formato AAAA-MM-DD.");
  if (de && ate && de > ate) return respostaErro(c, 400, "O início do período não pode ser depois do fim.");
  const porPagina = numeroPositivo(c.req.query("por_pagina"), 50, 200);
  const pagina = numeroPositivo(c.req.query("pagina"), 1, 100000);
  const hoje = hojeDoEscritorio();
  const r = await repo.prazos.pesquisar({
    ...(status ? { status: status as StatusPrazo } : {}),
    ...(c.req.query("abertos") === "1" ? { abertos: true } : {}),
    ...(responsavel ? { responsavel } : {}),
    ...(processoId ? { processo_id: processoId } : {}),
    ...(de ? { de } : {}),
    ...(ate ? { ate } : {}),
    // Concluídos antigos saem do quadro: o instante de corte é só uma comparação de instantes, não uma hora local.
    ...(concluidosDias ? { concluidos_desde: new Date(Date.now() - numeroPositivo(concluidosDias, 30, 3650) * 86400000).toISOString() } : {}),
    limite: porPagina,
    deslocamento: (pagina - 1) * porPagina,
  });
  return c.json({ ok: true, hoje, prazos: r.itens.map((p) => prazoPublico(p, hoje)), total: r.total, pagina, por_pagina: porPagina });
});

rotasPrazos.post("/", async (c) => {
  const v = validarPrazo(await lerJson(c));
  if (!v.ok) return respostaErro(c, 400, v.erro);
  const repo = repoDaSessao(c);
  const falhaProcesso = await conferirProcesso(c, repo, v.dados.processo_id);
  if (falhaProcesso) return falhaProcesso;
  const falhaResp = await conferirUsuario(c, repo, v.dados.responsavel_id, true, "Responsável");
  if (falhaResp) return falhaResp;
  const agora = new Date().toISOString();
  const id = await repo.prazos.inserir({ ...v.dados, status: v.status, concluido_em: v.status === "concluido" ? agora : null, criado_por: c.get("sessao").usuario.id });
  await registrar(c, "prazo_criado", "prazos", id, { status: v.status, com_processo: v.dados.processo_id !== null });
  const criado = await repo.prazos.buscarDetalhado(id);
  return c.json({ ok: true, prazo: criado ? prazoPublico(criado, hojeDoEscritorio()) : null }, 201);
});

// Somente cálculo: não grava nada e não altera nenhum prazo. O advogado confere e escolhe se usa a data.
rotasPrazos.post("/calcular", async (c) => {
  const corpo = await lerJson(c);
  if (typeof corpo.data !== "string" || !dataCivilAceita(corpo.data)) return respostaErro(c, 400, "Informe uma data válida.");
  if (typeof corpo.tipo_inicio !== "string" || !(TIPOS_INICIO as readonly string[]).includes(corpo.tipo_inicio)) return respostaErro(c, 400, "Tipo de início inválido.");
  if (corpo.contagem !== "uteis" && corpo.contagem !== "corridos") return respostaErro(c, 400, "Escolha dias úteis ou corridos.");
  if (typeof corpo.dias !== "number") return respostaErro(c, 400, "Informe a quantidade de dias.");
  if (corpo.aplicar_suspensao !== undefined && typeof corpo.aplicar_suspensao !== "boolean") return respostaErro(c, 400, "Informe aplicar_suspensao como verdadeiro ou falso.");
  // O calendário do escritório vem da sessão; só a janela de datas relevante é lida.
  const dias = await repoDaSessao(c).calendario.doPeriodo(corpo.data, somarDias(corpo.data, 1100));
  const r = calcularPrazo({
    data: corpo.data,
    tipoInicio: corpo.tipo_inicio as TipoInicio,
    dias: corpo.dias,
    contagem: corpo.contagem as TipoContagem,
    calendario: dias.map((d) => ({ data: d.data, descricao: d.descricao, tipo: d.tipo })),
    ...(corpo.aplicar_suspensao === false ? { aplicarSuspensao: false } : {}),
  });
  if (!r.ok) return respostaErro(c, 400, r.erro);
  const x = r.resultado;
  return c.json({
    ok: true,
    resultado: {
      data_final: x.dataFinal,
      dia_do_comeco: x.diaDoComeco,
      primeiro_dia_contado: x.primeiroDiaContado,
      dias_contados: x.diasContados,
      pulados: x.pulados,
      passos: x.passos,
      avisos: x.avisos,
    },
  });
});

rotasPrazos.get("/:id", async (c) => {
  const p = await repoDaSessao(c).prazos.buscarDetalhado(c.req.param("id"));
  if (!p) return respostaErro(c, 404, "Prazo não encontrado.");
  return c.json({ ok: true, prazo: prazoPublico(p, hojeDoEscritorio()) });
});

rotasPrazos.put("/:id", async (c) => {
  const repo = repoDaSessao(c);
  const atual = await repo.prazos.buscar(c.req.param("id"));
  if (!atual) return respostaErro(c, 404, "Prazo não encontrado.");
  const v = validarPrazo(await lerJson(c));
  if (!v.ok) return respostaErro(c, 400, v.erro);
  // Só reconfere o vínculo que mudou (um processo já desativado não impede editar o prazo que já estava nele).
  if (v.dados.processo_id !== atual.processo_id) {
    const falha = await conferirProcesso(c, repo, v.dados.processo_id);
    if (falha) return falha;
  }
  if (v.dados.responsavel_id !== atual.responsavel_id) {
    const falha = await conferirUsuario(c, repo, v.dados.responsavel_id, true, "Responsável");
    if (falha) return falha;
  }
  await repo.prazos.atualizar(atual.id, v.dados);
  // Auditoria guarda só os nomes dos campos alterados.
  const alterados = CAMPOS_PRAZO.filter((campo) => (atual[campo as keyof LinhaPrazo] ?? null) !== v.dados[campo]);
  await registrar(c, "prazo_alterado", "prazos", atual.id, { campos: alterados.join(",") });
  const novo = await repo.prazos.buscarDetalhado(atual.id);
  return c.json({ ok: true, prazo: novo ? prazoPublico(novo, hojeDoEscritorio()) : null });
});

// Mover no Kanban. Qualquer status vai para qualquer outro; ao concluir grava a data da conclusão, ao reabrir limpa.
rotasPrazos.post("/:id/status", async (c) => {
  const repo = repoDaSessao(c);
  const atual = await repo.prazos.buscar(c.req.param("id"));
  if (!atual) return respostaErro(c, 404, "Prazo não encontrado.");
  const corpo = await lerJson(c);
  if (!ehStatusPrazo(corpo.status)) return respostaErro(c, 400, "Status inválido. Use: a fazer, em andamento, aguardando ou concluído.");
  if (corpo.status !== atual.status) {
    await repo.prazos.mover(atual.id, corpo.status, new Date().toISOString());
    await registrar(c, "prazo_movido", "prazos", atual.id, { de: atual.status, para: corpo.status });
  }
  const novo = await repo.prazos.buscarDetalhado(atual.id);
  return c.json({ ok: true, prazo: novo ? prazoPublico(novo, hojeDoEscritorio()) : null });
});

rotasPrazos.delete("/:id", exigirSocio, async (c) => {
  const repo = repoDaSessao(c);
  const atual = await repo.prazos.buscar(c.req.param("id"));
  if (!atual) return respostaErro(c, 404, "Prazo não encontrado.");
  await repo.prazos.excluir(atual.id);
  await registrar(c, "prazo_excluido", "prazos", atual.id, { status: atual.status, data_fatal: atual.data_fatal, processo_id: atual.processo_id });
  return c.json({ ok: true });
});

