import { FUSO_PADRAO, diferencaDias, hojeEm, somarDias } from "../comum/fuso";
import { sha256Hex } from "./auth/codificacao";
import { auditar } from "./auditoria";
import { criarAcessoAgendado, criarRepositorio } from "./db/repositorio";
import type { PrazoDetalhado } from "./db/repositorio";
import type { Env } from "./env";
import { ErroEnvioEmail, criarEnviadorResend } from "./email";
import type { EnviadorEmail } from "./email";

// E-mail diário de prazos (07:00 de São Paulo = 10:00 UTC; ver wrangler.jsonc e docs/EMAIL.md), enviado pelo Resend.
// Só recebe quem ligou o aviso em "Minha conta" (preferencias_usuario.alerta_email; padrão desligado).
// Um e-mail por usuário, só se houver prazo não concluído vencido, de hoje ou dos próximos 3 dias em que ele é o responsável.

export const DIAS_A_FRENTE_EMAIL = 3;
const MAX_PRAZOS_NO_EMAIL = 30;
const MAX_PRAZOS_BUSCADOS = 200;
const ESCRITORIOS_POR_PAGINA = 100;

export interface ResultadoAlertas {
  ligado: boolean;
  escritorios: number;
  enviados: number;
  jaEnviados: number;
  falhas: number;
}

const diaBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** 0000001-78.2020.8.26.0100 a partir dos 20 dígitos (formato CNJ). Se vier em outro formato, devolve como está. */
export function cnjFormatado(n: string): string {
  return /^\d{20}$/.test(n) ? `${n.slice(0, 7)}-${n.slice(7, 9)}.${n.slice(9, 13)}.${n.slice(13, 14)}.${n.slice(14, 16)}.${n.slice(16)}` : n;
}

const escaparHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export interface EmailMontado {
  assunto: string;
  texto: string;
  html: string;
}

type PrazoParaEmail = Pick<PrazoDetalhado, "titulo" | "data_fatal" | "hora" | "processo_numero">;

/** Texto em português simples. Só título, data, número do processo e o link do app: sem descrição nem nome de cliente. */
export function montarEmailAlerta(entrada: { nome: string; prazos: PrazoParaEmail[]; total: number; hoje: string; urlApp: string }): EmailMontado {
  const { prazos, total, hoje } = entrada;
  const dias = (p: PrazoParaEmail) => diferencaDias(hoje, p.data_fatal);
  const vencidos = prazos.filter((p) => dias(p) < 0);
  const deHoje = prazos.filter((p) => dias(p) === 0);
  const proximos = prazos.filter((p) => dias(p) > 0);
  const assunto = `Prazos: ${total === 1 ? "1 prazo precisa" : `${total} prazos precisam`} da sua atenção`;

  const primeiroNome = entrada.nome.trim().split(/\s+/)[0] || "";
  const saudacao = primeiroNome ? `Olá, ${primeiroNome}.` : "Olá.";
  const link = `${entrada.urlApp}/prazos`;
  const linha = (p: PrazoParaEmail) => {
    const quando = `${diaBr(p.data_fatal)}${p.hora ? ` às ${p.hora}` : ""}`;
    return `${p.titulo} (${quando})${p.processo_numero ? ` - Processo ${cnjFormatado(p.processo_numero)}` : ""}`;
  };
  const grupos: [string, PrazoParaEmail[]][] = [
    ["Vencidos", vencidos],
    ["Vencem hoje", deHoje],
    [`Próximos ${DIAS_A_FRENTE_EMAIL} dias`, proximos],
  ];
  const resto = total - prazos.length;
  const rodapeResto = resto > 0 ? `E mais ${plural(resto, "prazo", "prazos")}. Veja todos no sistema.` : "";

  const texto = [
    saudacao,
    "",
    "Estes são os seus prazos que precisam de atenção hoje:",
    ...grupos.filter(([, l]) => l.length).flatMap(([titulo, l]) => ["", `${titulo}:`, ...l.map((p) => `- ${linha(p)}`)]),
    ...(rodapeResto ? ["", rodapeResto] : []),
    "",
    `Abrir os prazos: ${link}`,
    "",
    "Você recebe este resumo porque ativou o aviso diário de prazos na sua conta.",
    `Para parar de receber, desative em Minha conta: ${entrada.urlApp}/minha-conta`,
  ].join("\n");

  const html = [
    `<p>${escaparHtml(saudacao)}</p>`,
    "<p>Estes são os seus prazos que precisam de atenção hoje:</p>",
    ...grupos.filter(([, l]) => l.length).map(([titulo, l]) => `<h3>${escaparHtml(titulo)}</h3><ul>${l.map((p) => `<li>${escaparHtml(linha(p))}</li>`).join("")}</ul>`),
    ...(rodapeResto ? [`<p>${escaparHtml(rodapeResto)}</p>`] : []),
    `<p><a href="${escaparHtml(link)}">Abrir os prazos na advocacia.legal</a></p>`,
    `<p><small>Você recebe este resumo porque ativou o aviso diário de prazos na sua conta. Para parar de receber, desative em <a href="${escaparHtml(entrada.urlApp)}/minha-conta">Minha conta</a>.</small></p>`,
  ].join("\n");

  return { assunto, texto, html };
}

function urlBaseValida(v: string | undefined): string | null {
  if (!v) return null;
  const limpo = v.replace(/\/+$/, "");
  return /^https:\/\/[a-z0-9.-]+$/i.test(limpo) ? limpo : null;
}

/** Monta o enviador real a partir do ambiente. Devolve null (e o motivo) se o envio está desligado ou mal configurado. */
export function enviadorDoAmbiente(env: Env): { enviador: EnviadorEmail; urlApp: string } | { motivo: string } {
  if (env.EMAIL_ALERTAS_ATIVO !== "true") return { motivo: "desligado" };
  const urlApp = urlBaseValida(env.URL_APP);
  if (!urlApp) return { motivo: "URL_APP ausente ou inválida" };
  if (!env.EMAIL_REMETENTE) return { motivo: "EMAIL_REMETENTE ausente" };
  if (!env.RESEND_API_KEY) return { motivo: "RESEND_API_KEY ausente" };
  return { enviador: criarEnviadorResend({ chave: env.RESEND_API_KEY, remetente: env.EMAIL_REMETENTE }), urlApp };
}

/**
 * Roda o envio do dia. `agoraMs` define o "hoje" (São Paulo). Uma falha em um usuário ou escritório nunca impede os demais;
 * nada de e-mail, nome ou texto de prazo vai para o log.
 */
export async function executarAlertasDiarios(db: D1Database, enviador: EnviadorEmail, urlApp: string, agoraMs: number): Promise<ResultadoAlertas> {
  const hoje = hojeEm(FUSO_PADRAO, agoraMs);
  const ate = somarDias(hoje, DIAS_A_FRENTE_EMAIL);
  const r: ResultadoAlertas = { ligado: true, escritorios: 0, enviados: 0, jaEnviados: 0, falhas: 0 };
  const agendado = criarAcessoAgendado(db);
  let parar = false;

  let cursor: string | null = null;
  while (!parar) {
    const pagina = await agendado.escritoriosEmOperacao(cursor, ESCRITORIOS_POR_PAGINA);
    if (pagina.length === 0) break;
    for (const esc of pagina) {
      if (parar) break;
      cursor = esc.id;
      r.escritorios += 1;
      try {
        const repo = criarRepositorio(db, esc.id);
        for (const usuario of await repo.alertas.responsaveisComPrazos(ate)) {
          if (parar) break;
          try {
            const { itens, total } = await repo.prazos.pesquisar({ abertos: true, responsavel: usuario.id, ate, limite: MAX_PRAZOS_BUSCADOS });
            if (total === 0) continue;
            if (!(await repo.alertas.reservarEnvio(usuario.id, hoje, total))) {
              r.jaEnviados += 1;
              continue;
            }
            try {
              const email = montarEmailAlerta({ nome: usuario.nome, prazos: itens.slice(0, MAX_PRAZOS_NO_EMAIL), total, hoje, urlApp });
              // Mesma chave para o mesmo conteúdo no mesmo dia (o Resend não repete o envio por 24 h); se o conteúdo mudar, a chave muda.
              const idempotencia = `alerta-prazos/${esc.id}/${usuario.id}/${hoje}/${(await sha256Hex(email.texto)).slice(0, 16)}`;
              await enviador.enviar({ para: usuario.email, assunto: email.assunto, texto: email.texto, html: email.html, idempotencia });
              r.enviados += 1;
            } catch (e) {
              await repo.alertas.liberarEnvio(usuario.id, hoje).catch(() => undefined);
              throw e;
            }
          } catch (e) {
            r.falhas += 1;
            await registrarFalha(db, esc.id, usuario.id, hoje, e);
            // Chave inválida ou cota esgotada: continuar só geraria mais falhas iguais. Quem ficou sem e-mail tenta de novo na próxima execução.
            if (e instanceof ErroEnvioEmail && e.interrompeTudo) parar = true;
          }
        }
      } catch (e) {
        r.falhas += 1;
        await registrarFalha(db, esc.id, null, hoje, e);
      }
    }
    if (pagina.length < ESCRITORIOS_POR_PAGINA) break;
  }
  console.log("alertas-email", JSON.stringify({ data: hoje, ...r }));
  return r;
}

async function registrarFalha(db: D1Database, tenantId: string, userId: string | null, dataLocal: string, e: unknown): Promise<void> {
  const codigo = e instanceof ErroEnvioEmail ? e.codigo : e instanceof Error ? e.name : "desconhecido";
  console.error("alertas-email-falha", codigo);
  try {
    await auditar(db, { tenantId, userId: null, acao: "alerta_email_falha", entidade: "alertas_enviados", entidadeId: userId, detalhes: { data: dataLocal, codigo } });
  } catch {
    /* a auditoria não pode derrubar o restante do envio */
  }
}

/** Ponto de entrada do Cron Trigger. */
export async function aoAgendar(env: Env, agoraMs: number): Promise<ResultadoAlertas | null> {
  const cfg = enviadorDoAmbiente(env);
  if ("motivo" in cfg) {
    console.log("alertas-email-parado", cfg.motivo);
    return null;
  }
  return executarAlertasDiarios(env.DB, cfg.enviador, cfg.urlApp, agoraMs);
}
