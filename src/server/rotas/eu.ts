import { Hono } from "hono";
import type { Env } from "../env";
import type { Variaveis } from "../contexto";
import { exigirSessao, nivelNoModulo } from "../sessao";
import { assinaturaDoUsuario } from "../assinatura";

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
