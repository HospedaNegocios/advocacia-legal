import { Hono } from "hono";
import type { Env } from "../env";
import type { Variaveis } from "../contexto";
import { somarDias } from "../../comum/fuso";
import { exigirSessao } from "../sessao";
import { eventosPublicos, hojeDoEscritorio, prazoPublico } from "./agenda-comum";
import { repoDaSessao } from "./comum";

// Resumo da tela Início do escritório. Tudo filtrado pela sessão.
export const rotasInicio = new Hono<{ Bindings: Env; Variables: Variaveis }>();
rotasInicio.use("*", exigirSessao({ papel: "escritorio" }));

rotasInicio.get("/", async (c) => {
  const repo = repoDaSessao(c);
  const hoje = hojeDoEscritorio();
  const amanha = somarDias(hoje, 1);
  const [resumoPrazos, vencidos, deHoje, proximos, eventos, processos, clientes, intimacoes] = await Promise.all([
    repo.prazos.resumo(hoje),
    repo.prazos.pesquisar({ abertos: true, ate: somarDias(hoje, -1), limite: 5 }),
    repo.prazos.pesquisar({ abertos: true, de: hoje, ate: hoje, limite: 20 }),
    repo.prazos.pesquisar({ abertos: true, de: amanha, ate: somarDias(hoje, 7), limite: 20 }),
    // Só compara instantes: eventos que ainda não terminaram.
    repo.eventos.proximos(new Date().toISOString(), 6),
    repo.processos.resumo(),
    repo.clientes.resumo(),
    repo.intimacoes.resumo(hoje, somarDias(hoje, -6)),
  ]);
  const pub = (l: typeof vencidos.itens) => l.map((p) => prazoPublico(p, hoje));
  return c.json({
    ok: true,
    hoje,
    prazos: {
      vencidos: resumoPrazos.vencidos,
      vencem_hoje: resumoPrazos.vencem_hoje,
      proximos_7_dias: resumoPrazos.proximos_7_dias,
      por_status: resumoPrazos.por_status,
      lista_vencidos: pub(vencidos.itens),
      lista_hoje: pub(deHoje.itens),
      lista_proximos: pub(proximos.itens),
    },
    eventos: await eventosPublicos(c, repo, eventos),
    processos: { ativos: processos.total_ativos, por_fase: processos.por_fase },
    clientes: { ativos: clientes.ativos },
    intimacoes: { nao_lidas: intimacoes.nao_lidas, sem_processo: intimacoes.sem_processo },
  });
});
