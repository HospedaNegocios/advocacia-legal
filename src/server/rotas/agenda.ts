import { Hono } from "hono";
import type { Env } from "../env";
import type { Ctx, Variaveis } from "../contexto";
import { CAMPOS_EVENTO } from "../db/repositorio";
import type { LinhaEvento, Repositorio } from "../db/repositorio";
import { FUSO_PADRAO, dataCivilValida, lerIsoComFuso, limitesDoDia } from "../../comum/fuso";
import { exigirSessao } from "../sessao";
import { lerJson, respostaErro } from "../validacao";
import { validarEvento } from "../validacao-agenda";
import { conferirProcesso, conferirUsuario, eventosPublicos, podeAlterarEvento } from "./agenda-comum";
import { registrar, repoDaSessao } from "./comum";

// Agenda do escritório. Todos veem todos os eventos; quem cria edita e apaga o próprio; o sócio altera qualquer um.
// O escritório vem SEMPRE da sessão. Nenhuma rota aceita tenant_id.
export const rotasAgenda = new Hono<{ Bindings: Env; Variables: Variaveis }>();
rotasAgenda.use("*", exigirSessao({ papel: "escritorio" }));

export const MAX_DIAS_CONSULTA = 62;
const MS_DIA = 86400000;

/**
 * Lê um limite da janela de consulta. Aceita um dia (AAAA-MM-DD, no fuso padrão do escritório: início ou fim do dia)
 * ou um instante ISO 8601 com fuso. Devolve o instante em ms, ou null se inválido.
 */
export function lerLimiteJanela(texto: unknown, lado: "de" | "ate"): number | null {
  if (typeof texto !== "string") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    if (!dataCivilValida(texto) || texto < "1900-01-01" || texto > "2200-12-31") return null;
    const l = limitesDoDia(texto, FUSO_PADRAO);
    return lado === "de" ? l.inicio : l.fim;
  }
  const iso = lerIsoComFuso(texto);
  return iso ? Date.parse(iso) : null;
}

function janela(c: Ctx): { de: string; ate: string } | Response {
  const de = lerLimiteJanela(c.req.query("de"), "de");
  const ate = lerLimiteJanela(c.req.query("ate"), "ate");
  if (de === null || ate === null) return respostaErro(c, 400, "Informe o período com de e ate (AAAA-MM-DD ou data e hora com fuso).");
  if (ate < de) return respostaErro(c, 400, "O fim do período não pode ser antes do início.");
  if (ate - de > MAX_DIAS_CONSULTA * MS_DIA) return respostaErro(c, 400, `Consulte no máximo ${MAX_DIAS_CONSULTA} dias por vez.`);
  return { de: new Date(de).toISOString(), ate: new Date(ate).toISOString() };
}

rotasAgenda.get("/", async (c) => {
  const j = janela(c);
  if (j instanceof Response) return j;
  const repo = repoDaSessao(c);
  const processoId = c.req.query("processo_id");
  const clienteId = c.req.query("cliente_id");
  const lista = await repo.eventos.pesquisar({ ...j, ...(processoId ? { processo_id: processoId } : {}), ...(clienteId ? { cliente_id: clienteId } : {}) });
  return c.json({ ok: true, eventos: await eventosPublicos(c, repo, lista) });
});

/** Confere processo, cliente e participantes do evento (todos do escritório da sessão). Devolve a resposta de erro, ou null. */
async function conferirVinculos(c: Ctx, repo: Repositorio, dados: { processo_id: string | null; cliente_id: string | null }, participantes: string[], atual: LinhaEvento | null) {
  if (dados.processo_id !== (atual?.processo_id ?? null)) {
    const falha = await conferirProcesso(c, repo, dados.processo_id);
    if (falha) return falha;
  }
  if (dados.cliente_id !== null && dados.cliente_id !== (atual?.cliente_id ?? null)) {
    const cli = await repo.clientes.buscar(dados.cliente_id);
    if (!cli) return respostaErro(c, 404, "Cliente não encontrado.");
    if (cli.ativo === 0) return respostaErro(c, 409, "Este cliente está desativado. Reative o cliente para vinculá-lo a um evento.");
  }
  const jaParticipam = new Set(atual ? (await repo.eventos.participantes([atual.id])).map((x) => x.user_id) : []);
  for (const userId of participantes) {
    const falha = await conferirUsuario(c, repo, userId, !jaParticipam.has(userId), "Participante");
    if (falha) return falha;
  }
  return null;
}

rotasAgenda.post("/", async (c) => {
  const v = validarEvento(await lerJson(c));
  if (!v.ok) return respostaErro(c, 400, v.erro);
  const repo = repoDaSessao(c);
  const falha = await conferirVinculos(c, repo, v.dados, v.participantes, null);
  if (falha) return falha;
  const id = await repo.eventos.criarComParticipantes(v.dados, c.get("sessao").usuario.id, v.participantes);
  await registrar(c, "evento_criado", "eventos_agenda", id, { tipo: v.dados.tipo, participantes: v.participantes.length });
  const criado = await repo.eventos.buscarDetalhado(id);
  return c.json({ ok: true, evento: criado ? (await eventosPublicos(c, repo, [criado]))[0] : null }, 201);
});

rotasAgenda.get("/:id", async (c) => {
  const repo = repoDaSessao(c);
  const e = await repo.eventos.buscarDetalhado(c.req.param("id"));
  if (!e) return respostaErro(c, 404, "Evento não encontrado.");
  return c.json({ ok: true, evento: (await eventosPublicos(c, repo, [e]))[0] });
});

rotasAgenda.put("/:id", async (c) => {
  const repo = repoDaSessao(c);
  const atual = await repo.eventos.buscar(c.req.param("id"));
  if (!atual) return respostaErro(c, 404, "Evento não encontrado.");
  if (!podeAlterarEvento(c, atual.criado_por)) return respostaErro(c, 403, "Só quem criou o evento ou o sócio pode alterá-lo.");
  const v = validarEvento(await lerJson(c));
  if (!v.ok) return respostaErro(c, 400, v.erro);
  const falha = await conferirVinculos(c, repo, v.dados, v.participantes, atual);
  if (falha) return falha;
  await repo.eventos.atualizarComParticipantes(atual.id, v.dados, v.participantes);
  const alterados: string[] = CAMPOS_EVENTO.filter((campo) => (atual[campo] ?? null) !== v.dados[campo]);
  await registrar(c, "evento_alterado", "eventos_agenda", atual.id, { campos: alterados.join(","), participantes: v.participantes.length });
  const novo = await repo.eventos.buscarDetalhado(atual.id);
  return c.json({ ok: true, evento: novo ? (await eventosPublicos(c, repo, [novo]))[0] : null });
});

rotasAgenda.delete("/:id", async (c) => {
  const repo = repoDaSessao(c);
  const atual = await repo.eventos.buscar(c.req.param("id"));
  if (!atual) return respostaErro(c, 404, "Evento não encontrado.");
  if (!podeAlterarEvento(c, atual.criado_por)) return respostaErro(c, 403, "Só quem criou o evento ou o sócio pode apagá-lo.");
  await repo.eventos.excluirCompleto(atual.id);
  await registrar(c, "evento_excluido", "eventos_agenda", atual.id, { tipo: atual.tipo, processo_id: atual.processo_id });
  return c.json({ ok: true });
});
