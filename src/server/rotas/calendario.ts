import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { Env } from "../env";
import type { Variaveis } from "../contexto";
import type { LinhaDiaCalendario } from "../db/repositorio";
import { TIPOS_DIA_CALENDARIO } from "../db/repositorio";
import { exigirSessao } from "../sessao";
import { lerJson, normalizarNome, respostaErro } from "../validacao";
import { ehConflitoDeUnicidade, registrar, repoDaSessao } from "./comum";
import { hojeDoEscritorio } from "./agenda-comum";
import { ANO_MAXIMO, ANO_MINIMO, feriadosNacionais, sugestoesMoveis } from "../../comum/prazos-uteis";
import { dataCivilValida } from "../../comum/fuso";

// Calendário do escritório: dias sem expediente (feriado local, suspensão de tribunal, outro) usados na contagem de prazos.
// Todos os perfis leem; só sócio e advogado criam e apagam. O escritório vem SEMPRE da sessão.
// Os feriados nacionais por lei vêm do código (src/comum/prazos-uteis.ts) e não são editáveis.
export const rotasCalendario = new Hono<{ Bindings: Env; Variables: Variaveis }>();
rotasCalendario.use("*", exigirSessao({ papel: "escritorio" }));

const exigirSocioOuAdvogado: MiddlewareHandler<{ Bindings: Env; Variables: Variaveis }> = async (c, next) => {
  const perfil = c.get("sessao").usuario.perfil;
  if (perfil !== "socio" && perfil !== "advogado") return respostaErro(c, 403, "Só sócio ou advogado pode alterar o calendário do escritório.");
  await next();
};

const publico = (d: LinhaDiaCalendario) => ({ id: d.id, data: d.data, descricao: d.descricao, tipo: d.tipo, criado_em: d.criado_em });

rotasCalendario.get("/", async (c) => {
  const anoTexto = c.req.query("ano");
  const ano = anoTexto === undefined ? Number(hojeDoEscritorio().slice(0, 4)) : Number(anoTexto);
  if (!Number.isInteger(ano) || ano < ANO_MINIMO || ano > ANO_MAXIMO) return respostaErro(c, 400, `Informe um ano entre ${ANO_MINIMO} e ${ANO_MAXIMO}.`);
  const dias = await repoDaSessao(c).calendario.doPeriodo(`${ano}-01-01`, `${ano}-12-31`);
  return c.json({ ok: true, ano, dias: dias.map(publico), nacionais: feriadosNacionais(ano), sugestoes: sugestoesMoveis(ano) });
});

rotasCalendario.post("/", exigirSocioOuAdvogado, async (c) => {
  const corpo = await lerJson(c);
  if (typeof corpo.data !== "string" || !dataCivilValida(corpo.data)) return respostaErro(c, 400, "Informe uma data válida.");
  const ano = Number(corpo.data.slice(0, 4));
  if (ano < ANO_MINIMO || ano > ANO_MAXIMO) return respostaErro(c, 400, `A data deve estar entre ${ANO_MINIMO} e ${ANO_MAXIMO}.`);
  const descricao = normalizarNome(corpo.descricao, 200);
  if (!descricao) return respostaErro(c, 400, "Informe a descrição (até 200 caracteres).");
  if (typeof corpo.tipo !== "string" || !(TIPOS_DIA_CALENDARIO as readonly string[]).includes(corpo.tipo)) return respostaErro(c, 400, "Tipo inválido. Use feriado local, suspensão de tribunal ou outro.");
  const repo = repoDaSessao(c);
  let id: string;
  try {
    id = await repo.calendario.inserir({ data: corpo.data, descricao, tipo: corpo.tipo as LinhaDiaCalendario["tipo"], criado_por: c.get("sessao").usuario.id });
  } catch (e) {
    if (ehConflitoDeUnicidade(e)) return respostaErro(c, 409, "Esta data já está no calendário do escritório.");
    throw e;
  }
  // Auditoria sem o texto livre da descrição.
  await registrar(c, "calendario_dia_criado", "calendario_dias", id, { data: corpo.data, tipo: corpo.tipo });
  const criado = await repo.calendario.buscar(id);
  return c.json({ ok: true, dia: criado ? publico(criado) : null }, 201);
});

rotasCalendario.delete("/:id", exigirSocioOuAdvogado, async (c) => {
  const repo = repoDaSessao(c);
  const atual = await repo.calendario.buscar(c.req.param("id"));
  if (!atual) return respostaErro(c, 404, "Dia não encontrado.");
  await repo.calendario.excluir(atual.id);
  await registrar(c, "calendario_dia_removido", "calendario_dias", atual.id, { data: atual.data, tipo: atual.tipo });
  return c.json({ ok: true });
});
