import { Hono } from "hono";
import type { Env } from "../env";
import type { Variaveis } from "../contexto";
import { exigirSessao } from "../sessao";

export const rotasEu = new Hono<{ Bindings: Env; Variables: Variaveis }>();

/** Dados do próprio usuário logado (também para sessão pendente de 2FA, para a tela saber o que falta). */
rotasEu.get("/", exigirSessao({ permitirPendente: true }), (c) => {
  const { usuario, pendente2fa } = c.get("sessao");
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
    pendente_2fa: pendente2fa,
  });
});
