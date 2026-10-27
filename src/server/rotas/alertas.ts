import { Hono } from "hono";
import type { Env } from "../env";
import type { Variaveis } from "../contexto";
import { somarDias } from "../../comum/fuso";
import { exigirSessao } from "../sessao";
import { hojeDoEscritorio, prazoPublico } from "./agenda-comum";
import { repoDaSessao } from "./comum";

// Alertas para o popup da tela. Sempre do usuário logado e do escritório da sessão.
export const rotasAlertas = new Hono<{ Bindings: Env; Variables: Variaveis }>();
rotasAlertas.use("*", exigirSessao({ papel: "escritorio" }));

const LIMITE_POPUP = 50;

/** Prazos NÃO concluídos em que o usuário é o responsável e que estão vencidos, vencem hoje ou vencem amanhã (calendário de São Paulo). */
rotasAlertas.get("/prazos", async (c) => {
  const repo = repoDaSessao(c);
  const hoje = hojeDoEscritorio();
  const r = await repo.prazos.pesquisar({ abertos: true, responsavel: c.get("sessao").usuario.id, ate: somarDias(hoje, 1), limite: LIMITE_POPUP });
  return c.json({
    ok: true,
    hoje,
    total: r.total,
    prazos: r.itens.map((p) => {
      const x = prazoPublico(p, hoje);
      return { id: x.id, titulo: x.titulo, data_fatal: x.data_fatal, hora: x.hora, processo_id: x.processo_id, processo_numero: x.processo_numero, status: x.status, situacao: x.situacao, dias_para_vencer: x.dias_para_vencer, atualizado_em: x.atualizado_em };
    }),
  });
});
