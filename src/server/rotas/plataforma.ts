import { Hono } from "hono";
import type { Env } from "../env";
import type { Variaveis } from "../contexto";
import { criarAcessoPlataforma } from "../db/repositorio";
import type { LinhaTenant, StatusEscritorio } from "../db/repositorio";
import { auditar } from "../auditoria";
import { criarConvite } from "../convites";
import { exigirSessao, ipDe } from "../sessao";
import { registrarDiagnosticoDjen } from "./diagnostico-djen";
import { ehPlano, lerJson, normalizarEmail, normalizarNome, respostaErro } from "../validacao";

// Todas as rotas aqui são do dono da plataforma, com 2FA concluído.
export const rotasPlataforma = new Hono<{ Bindings: Env; Variables: Variaveis }>();
rotasPlataforma.use("*", exigirSessao({ papel: "dono" }));

registrarDiagnosticoDjen(rotasPlataforma);

const DIAS_TESTE = 14;
const STATUS_PERMITIDOS: readonly StatusEscritorio[] = ["ativo", "suspenso", "cancelado"];
const ACAO_POR_STATUS: Record<StatusEscritorio, string> = {
  teste: "tenant_em_teste",
  ativo: "tenant_ativado",
  suspenso: "tenant_suspenso",
  cancelado: "tenant_cancelado",
};

function escritorioPublico(t: LinhaTenant, usuarios: number) {
  return {
    id: t.id,
    nome: t.nome,
    plano: t.plano,
    status: t.status,
    teste_ate: t.teste_ate,
    exigir_2fa: t.exigir_2fa === 1,
    criado_em: t.criado_em,
    usuarios,
  };
}

rotasPlataforma.get("/escritorios", async (c) => {
  const plataforma = criarAcessoPlataforma(c.env.DB);
  const [lista, contagem] = await Promise.all([plataforma.listarEscritorios({ limite: 200 }), plataforma.contarUsuariosPorEscritorio()]);
  return c.json({ ok: true, escritorios: lista.map((t) => escritorioPublico(t, contagem[t.id] ?? 0)) });
});

rotasPlataforma.post("/escritorios", async (c) => {
  const { usuario } = c.get("sessao");
  const corpo = await lerJson(c);
  const nome = normalizarNome(corpo.nome);
  if (!nome) return respostaErro(c, 400, "Informe o nome do escritório (até 120 caracteres).");
  if (!ehPlano(corpo.plano)) return respostaErro(c, 400, "Plano inválido.");
  const plataforma = criarAcessoPlataforma(c.env.DB);
  const id = await plataforma.criarEscritorio({
    nome,
    plano: corpo.plano,
    status: "teste",
    teste_ate: new Date(Date.now() + DIAS_TESTE * 24 * 3600 * 1000).toISOString(),
  });
  await auditar(c.env.DB, {
    tenantId: id,
    plataforma: true,
    userId: usuario.id,
    acao: "tenant_criado",
    entidade: "tenants",
    entidadeId: id,
    detalhes: { plano: corpo.plano },
    ip: ipDe(c),
  });
  const criado = await plataforma.buscarEscritorio(id);
  return c.json({ ok: true, escritorio: escritorioPublico(criado as LinhaTenant, 0) }, 201);
});

rotasPlataforma.patch("/escritorios/:id", async (c) => {
  const { usuario } = c.get("sessao");
  const plataforma = criarAcessoPlataforma(c.env.DB);
  const atual = await plataforma.buscarEscritorio(c.req.param("id"));
  if (!atual) return respostaErro(c, 404, "Escritório não encontrado.");
  const corpo = await lerJson(c);
  const ip = ipDe(c);
  const mudancas: { plano?: LinhaTenant["plano"]; status?: StatusEscritorio } = {};
  if (corpo.plano !== undefined) {
    if (!ehPlano(corpo.plano)) return respostaErro(c, 400, "Plano inválido.");
    mudancas.plano = corpo.plano;
  }
  if (corpo.status !== undefined) {
    if (typeof corpo.status !== "string" || !(STATUS_PERMITIDOS as readonly string[]).includes(corpo.status)) {
      return respostaErro(c, 400, "Situação inválida. Use ativo, suspenso ou cancelado.");
    }
    mudancas.status = corpo.status as StatusEscritorio;
  }
  if (mudancas.plano === undefined && mudancas.status === undefined) {
    return respostaErro(c, 400, "Informe o plano ou a situação.");
  }
  await plataforma.atualizarEscritorio(atual.id, mudancas);
  if (mudancas.plano !== undefined && mudancas.plano !== atual.plano) {
    await auditar(c.env.DB, {
      tenantId: atual.id,
      plataforma: true,
      userId: usuario.id,
      acao: "tenant_plano_alterado",
      entidade: "tenants",
      entidadeId: atual.id,
      detalhes: { de: atual.plano, para: mudancas.plano },
      ip,
    });
  }
  if (mudancas.status !== undefined && mudancas.status !== atual.status) {
    // Suspender ou cancelar derruba na hora todas as sessões do escritório.
    if (mudancas.status !== "ativo") await plataforma.encerrarSessoesDoEscritorio(atual.id);
    await auditar(c.env.DB, {
      tenantId: atual.id,
      plataforma: true,
      userId: usuario.id,
      acao: ACAO_POR_STATUS[mudancas.status],
      entidade: "tenants",
      entidadeId: atual.id,
      detalhes: { de: atual.status, para: mudancas.status },
      ip,
    });
  }
  const novo = await plataforma.buscarEscritorio(atual.id);
  const contagem = await plataforma.contarUsuariosPorEscritorio();
  return c.json({ ok: true, escritorio: escritorioPublico(novo as LinhaTenant, contagem[atual.id] ?? 0) });
});

// Convite do primeiro usuário (sócio) de um escritório.
rotasPlataforma.post("/escritorios/:id/convite-socio", async (c) => {
  const { usuario } = c.get("sessao");
  const plataforma = criarAcessoPlataforma(c.env.DB);
  const escritorio = await plataforma.buscarEscritorio(c.req.param("id"));
  if (!escritorio) return respostaErro(c, 404, "Escritório não encontrado.");
  const corpo = await lerJson(c);
  const email = normalizarEmail(corpo.email);
  if (!email) return respostaErro(c, 400, "Informe um e-mail válido.");
  const r = await criarConvite(c.env.DB, escritorio.id, { email, perfil: "socio", criadoPor: usuario.id });
  if (!r.ok) return respostaErro(c, 409, "Já existe um usuário com este e-mail neste escritório.");
  await auditar(c.env.DB, {
    tenantId: escritorio.id,
    plataforma: true,
    userId: usuario.id,
    acao: "convite_criado",
    entidade: "users",
    entidadeId: r.userId,
    detalhes: { perfil: "socio", reenvio: r.reenvio },
    ip: ipDe(c),
  });
  return c.json({ ok: true, link: `${new URL(c.req.url).origin}/convite#${r.token}`, expira_em: r.expiraEm }, 201);
});
