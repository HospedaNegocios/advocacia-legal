// Envio de e-mail. O resto do sistema só conhece a interface `EnviadorEmail`; os testes usam um falso.
// A implementação real chama a API REST do Resend com `fetch` (sem SDK). Fatos e fontes: docs/EMAIL.md.

export interface MensagemEmail {
  para: string;
  assunto: string;
  texto: string;
  html: string;
  /** Vira o cabeçalho `Idempotency-Key` (1 a 256 caracteres; o Resend guarda por 24 h). Não pode conter dados pessoais. */
  idempotencia?: string;
}

export interface EnviadorEmail {
  /** Lança `ErroEnvioEmail` se o envio falhar. */
  enviar(mensagem: MensagemEmail): Promise<void>;
}

/** Erro de envio sem o endereço do destinatário, sem o texto e sem a chave: só um código curto e o status HTTP. */
export class ErroEnvioEmail extends Error {
  constructor(
    readonly codigo: string,
    readonly status = 0,
    /** Falha que se repetiria para todos (chave inválida, cota esgotada): o Cron para de tentar nos demais. */
    readonly interrompeTudo = false,
  ) {
    super(`falha no envio de e-mail (${codigo})`);
    this.name = "ErroEnvioEmail";
  }
}

export const URL_RESEND = "https://api.resend.com/emails";
const TIMEOUT_PADRAO_MS = 10_000;
const ESPERA_MAXIMA_429_MS = 5_000;
/** Códigos de erro do Resend em que insistir nos demais usuários não adianta (docs/EMAIL.md). */
const CODIGOS_QUE_INTERROMPEM = new Set(["daily_quota_exceeded", "monthly_quota_exceeded", "missing_api_key", "restricted_api_key", "suspended_api_key", "invalid_permission"]);

export interface OpcoesResend {
  chave: string;
  /** Endereço (ex.: alertas@advocacia.legal), com ou sem "Nome <...>". */
  remetente: string;
  nomeRemetente?: string;
  /** Para testes: nunca chame a rede de verdade. */
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  /** Espera entre tentativas após 429 (testes passam uma função rápida). */
  esperar?: (ms: number) => Promise<void>;
}

/** Só aceita um nome de erro curto e seguro (letras minúsculas e _), nunca texto livre da resposta. */
function codigoSeguro(v: unknown): string | null {
  return typeof v === "string" && /^[a-z_]{1,60}$/.test(v) ? v : null;
}

export function criarEnviadorResend(o: OpcoesResend): EnviadorEmail {
  const chamar = o.fetchFn ?? fetch;
  const timeoutMs = o.timeoutMs ?? TIMEOUT_PADRAO_MS;
  const esperar = o.esperar ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const de = o.remetente.includes("<") ? o.remetente : `${o.nomeRemetente ?? "advocacia.legal"} <${o.remetente}>`;

  async function tentar(m: MensagemEmail): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${o.chave}`,
      "Content-Type": "application/json",
      // O Resend recusa (403) requisições sem User-Agent.
      "User-Agent": "advocacia-legal/1.0",
    };
    if (m.idempotencia) headers["Idempotency-Key"] = m.idempotencia;
    try {
      return await chamar(URL_RESEND, {
        method: "POST",
        headers,
        body: JSON.stringify({ from: de, to: [m.para], subject: m.assunto, text: m.texto, html: m.html }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      // Nunca repassa a mensagem do erro (pode citar a URL ou cabeçalhos).
      throw new ErroEnvioEmail(e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? "tempo_esgotado" : "rede");
    }
  }

  return {
    async enviar(m) {
      let r = await tentar(m);
      // Limite de requisições (429 rate_limit_exceeded): espera o `retry-after` (no máximo 5 s) e tenta uma vez mais.
      if (r.status === 429) {
        const corpo = (await r.json().catch(() => null)) as { name?: unknown } | null;
        if (codigoSeguro(corpo?.name) === "rate_limit_exceeded") {
          const seg = Number(r.headers.get("retry-after"));
          await esperar(Number.isFinite(seg) && seg > 0 ? Math.min(seg * 1000, ESPERA_MAXIMA_429_MS) : 1000);
          r = await tentar(m);
        } else {
          const codigo = codigoSeguro(corpo?.name) ?? "http_429";
          throw new ErroEnvioEmail(codigo, 429, CODIGOS_QUE_INTERROMPEM.has(codigo));
        }
      }
      if (r.ok) {
        await r.body?.cancel().catch(() => undefined);
        return;
      }
      const corpo = (await r.json().catch(() => null)) as { name?: unknown } | null;
      const codigo = codigoSeguro(corpo?.name) ?? `http_${r.status}`;
      // 401 e 403 de chave/permissão valem para todos os envios do dia; o resto é só deste usuário.
      throw new ErroEnvioEmail(codigo, r.status, CODIGOS_QUE_INTERROMPEM.has(codigo) || r.status === 401);
    },
  };
}
