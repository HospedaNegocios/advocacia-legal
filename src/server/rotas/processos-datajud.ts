import { Hono } from "hono";
import type { Env } from "../env";
import type { Variaveis } from "../contexto";
import type { LinhaDatajudConsulta, LinhaDatajudMovimento } from "../db/repositorio";
import { atualizarAgora, INTERVALO_MANUAL_MS } from "../datajud/atualizacao";
import { depsDatajud } from "../datajud/ambiente";
import { exigirSessao } from "../sessao";
import { respostaErro } from "../validacao";
import { numeroPositivo, registrar, repoDaSessao } from "./comum";

// Movimentações do DataJud (CNJ) de um processo. Todos os perfis do escritório leem e pedem atualização.
// O escritório vem SEMPRE da sessão; o processo é buscado já filtrando por ele (processo de outro escritório = 404).
// Estes dados NÃO aparecem no portal do cliente.
export const rotasProcessosDatajud = new Hono<{ Bindings: Env; Variables: Variaveis }>();
rotasProcessosDatajud.use("/:id/datajud", exigirSessao({ papel: "escritorio" }));
rotasProcessosDatajud.use("/:id/datajud/*", exigirSessao({ papel: "escritorio" }));

const MSG_DESLIGADO = "A consulta de movimentações do DataJud não está disponível neste ambiente.";
const MSG_NAO_ENCONTRADO = "Processo não encontrado.";
const MSG_INATIVO = "Este processo está desativado. Reative o processo para atualizar as movimentações.";

const consultaPublica = (l: LinhaDatajudConsulta | null) =>
  l
    ? {
        situacao: l.resultado,
        consultado_em: l.consultado_em,
        tribunal: l.alias,
        observacao: l.observacao,
        ultima_atualizacao_fonte: l.ultima_atualizacao_fonte,
        classe: l.classe,
        orgao: l.orgao,
        grau: l.grau,
        total_movimentos: l.total_movimentos,
      }
    : null;

const movimentoPublico = (m: LinhaDatajudMovimento) => ({
  id: m.id,
  data_hora: m.data_hora,
  codigo: m.codigo,
  nome: m.nome,
  complementos: m.complementos,
  orgao: m.orgao,
  grau: m.grau,
});

rotasProcessosDatajud.get("/:id/datajud", async (c) => {
  const repo = repoDaSessao(c);
  const p = await repo.processos.buscar(c.req.param("id") ?? "");
  if (!p) return respostaErro(c, 404, MSG_NAO_ENCONTRADO);
  if (!depsDatajud(c.env)) return c.json({ ok: true, disponivel: false, consulta: null, movimentos: [], total: 0, pagina: 1, por_pagina: 0 });
  const porPagina = numeroPositivo(c.req.query("por_pagina"), 20, 100);
  const pagina = numeroPositivo(c.req.query("pagina"), 1, 100000);
  const [consulta, movimentos] = await Promise.all([repo.datajud.buscarConsulta(p.id), repo.datajud.movimentosDoProcesso(p.id, { limite: porPagina, deslocamento: (pagina - 1) * porPagina })]);
  return c.json({ ok: true, disponivel: true, consulta: consultaPublica(consulta), movimentos: movimentos.itens.map(movimentoPublico), total: movimentos.total, pagina, por_pagina: porPagina });
});

rotasProcessosDatajud.post("/:id/datajud/atualizar", async (c) => {
  const deps = depsDatajud(c.env);
  if (!deps) return respostaErro(c, 404, MSG_DESLIGADO);
  const repo = repoDaSessao(c);
  const p = await repo.processos.buscar(c.req.param("id") ?? "");
  if (!p) return respostaErro(c, 404, MSG_NAO_ENCONTRADO);
  if (p.ativo === 0) return respostaErro(c, 409, MSG_INATIVO);
  const anterior = await repo.datajud.buscarConsulta(p.id);
  if (anterior) {
    const falta = Date.parse(anterior.consultado_em) + INTERVALO_MANUAL_MS - deps.relogio.agora();
    if (falta > 0) {
      const minutos = Math.ceil(falta / 60_000);
      return respostaErro(c, 429, `Este processo foi consultado há pouco. Tente de novo em ${minutos} ${minutos === 1 ? "minuto" : "minutos"}.`);
    }
  }
  const r = await atualizarAgora(deps, repo.tenantId, p.id, p.numero_cnj);
  // Auditoria só com o resultado e a quantidade (nunca o conteúdo dos movimentos).
  await registrar(c, "datajud_atualizado", "processos", p.id, { resultado: r.resultado, novos: r.novos, ...(r.motivo ? { motivo: r.motivo.slice(0, 200) } : {}) });
  const [consulta, movimentos] = await Promise.all([repo.datajud.buscarConsulta(p.id), repo.datajud.movimentosDoProcesso(p.id, { limite: 20 })]);
  return c.json({ ok: true, disponivel: true, resultado: r.resultado, novos: r.novos, consulta: consultaPublica(consulta), movimentos: movimentos.itens.map(movimentoPublico), total: movimentos.total, pagina: 1, por_pagina: 20 });
});
