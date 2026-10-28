import { Hono } from "hono";
import type { Env } from "../env";
import type { Variaveis } from "../contexto";
import { exigirSessao, nivelNoModulo } from "../sessao";
import { CODIGO_SOMENTE_LEITURA, assinaturaDoUsuario } from "../assinatura";
import { MENSAGEM_SOMENTE_LEITURA } from "../../comum/assinatura";
import { respostaErro } from "../validacao";
import { registrar, repoDaSessao } from "./comum";

export const rotasEu = new Hono<{ Bindings: Env; Variables: Variaveis }>();

/** Dados do próprio usuário logado (também para sessão pendente de 2FA, para a tela saber o que falta). */
rotasEu.get("/", exigirSessao({ permitirPendente: true }), async (c) => {
  const { usuario, pendente2fa } = c.get("sessao");
  const assinatura = assinaturaDoUsuario(usuario);
  // Escritório bloqueado: a tela só mostra "Assinatura vencida"; nada de dados do escritório nem permissões.
  if (assinatura.situacao === "bloqueado") {
    return c.json({
      ok: true,
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, perfil: usuario.perfil, dono_plataforma: false, totp_ativo: usuario.totp_ativo === 1 },
      escritorio: { nome: null, status: usuario.tenant_status, exigir_2fa: usuario.tenant_exigir_2fa === 1 },
      assinatura: { situacao: "bloqueado" },
      permissoes: { financeiro: "nenhum" },
      pendente_2fa: pendente2fa,
    });
  }
  return c.json({
    ok: true,
    usuario: {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil,
      dono_plataforma: usuario.papel_plataforma === "dono",
      totp_ativo: usuario.totp_ativo === 1,
    },
    escritorio:
      usuario.tenant_id === null
        ? null
        : {
            nome: usuario.tenant_nome,
            status: usuario.tenant_status,
            exigir_2fa: usuario.tenant_exigir_2fa === 1,
          },
    assinatura: {
      situacao: assinatura.situacao,
      ultimo_dia_teste: assinatura.ultimo_dia_teste,
      leitura_desde: assinatura.leitura_desde,
      bloqueio_desde: assinatura.bloqueio_desde,
      dias_para_fim_teste: assinatura.dias_para_fim_teste,
      dias_para_bloqueio: assinatura.dias_para_bloqueio,
    },
    // Nível do próprio usuário em cada módulo (sócio = "edicao"); a tela usa para adaptar menu e botões.
    // A API continua conferindo a cada requisição.
    permissoes: { financeiro: pendente2fa ? "nenhum" : await nivelNoModulo(c, "financeiro") },
    pendente_2fa: pendente2fa,
  });
});

// ---------- Preferências pessoais ----------
// Só o próprio usuário (escritório e usuário vêm da sessão; nunca de parâmetro). O dono da plataforma não tem escritório e não usa isto.
// Assinatura: esta rota fica fora do controle central (para o usuário sempre conseguir DESLIGAR o e-mail), então a regra é aplicada aqui:
// com o escritório em somente leitura ou bloqueado, só é permitido desligar; ligar é recusado (HTTP 402), como qualquer outra gravação.

rotasEu.get("/preferencias", exigirSessao({ papel: "escritorio" }), async (c) => {
  const repo = repoDaSessao(c);
  const { usuario } = c.get("sessao");
  return c.json({
    ok: true,
    alerta_email: await repo.preferencias.alertaEmail(usuario.id),
    // Só um sim/não: a tela avisa que o administrador ainda não habilitou, sem detalhes técnicos.
    envio_habilitado: c.env.EMAIL_ALERTAS_ATIVO === "true",
  });
});

rotasEu.put("/preferencias", exigirSessao({ papel: "escritorio" }), async (c) => {
  const corpo = await c.req.json().catch(() => null);
  if (!corpo || typeof corpo !== "object" || typeof (corpo as { alerta_email?: unknown }).alerta_email !== "boolean") {
    return respostaErro(c, 400, "Informe se quer receber o e-mail (sim ou não).");
  }
  const novo = (corpo as { alerta_email: boolean }).alerta_email;
  const { usuario } = c.get("sessao");
  if (novo && assinaturaDoUsuario(usuario).situacao !== "normal") {
    return c.json({ ok: false, erro: MENSAGEM_SOMENTE_LEITURA, codigo: CODIGO_SOMENTE_LEITURA }, 402);
  }
  const repo = repoDaSessao(c);
  const antes = await repo.preferencias.alertaEmail(usuario.id);
  if (!(await repo.preferencias.definirAlertaEmail(usuario.id, novo))) return respostaErro(c, 404, "Usuário não encontrado.");
  // Auditoria só com ids e de/para (sem e-mail).
  await registrar(c, "preferencia_alterada", "preferencias_usuario", usuario.id, { preferencia: "alerta_email", de: antes, para: novo });
  return c.json({ ok: true, alerta_email: novo, envio_habilitado: c.env.EMAIL_ALERTAS_ATIVO === "true" });
});
