import type { Hono } from "hono";
import type { Env } from "../env";
import type { Variaveis } from "../contexto";
import { auditar } from "../auditoria";
import { criarAcessoAutenticacao } from "../db/repositorio";
import { ipDe } from "../sessao";
import { respostaErro } from "../validacao";

const URL_DJEN = "https://comunicaapi.pje.jus.br/api/v1/comunicacao";
const TEMPO_LIMITE_MS = 15_000;
const INTERVALO_MS = 10_000;
const CHAVE_LIMITE = "diagnostico-djen";

/** Data de hoje no fuso de São Paulo, no formato AAAA-MM-DD. */
export function hojeSaoPaulo(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

/** Conta os itens da resposta sem assumir nada além de: lista na raiz ou em `items`. Outro formato → null. */
function contarItens(json: unknown): number | null {
  if (Array.isArray(json)) return json.length;
  if (json && typeof json === "object" && Array.isArray((json as { items?: unknown }).items)) {
    return (json as { items: unknown[] }).items.length;
  }
  return null;
}

/**
 * Teste de conexão com o DJEN a partir do Worker (rota só do dono, já protegida por exigirSessao).
 * Faz UMA chamada. Nunca guarda nem registra o conteúdo da resposta além do trecho de erro (sem 2xx).
 */
export function registrarDiagnosticoDjen(rotas: Hono<{ Bindings: Env; Variables: Variaveis }>): void {
  rotas.post("/diagnostico/djen", async (c) => {
    const { usuario } = c.get("sessao");
    const tentativas = await criarAcessoAutenticacao(c.env.DB).contarTentativa(CHAVE_LIMITE, INTERVALO_MS);
    if (tentativas > 1) return respostaErro(c, 429, "Aguarde 10 segundos antes de testar de novo.");

    const cf = (c.req.raw as { cf?: { colo?: string; country?: string } }).cf;
    const dia = hojeSaoPaulo();
    const url = new URL(URL_DJEN);
    url.search = new URLSearchParams({
      siglaTribunal: "TJSP",
      dataDisponibilizacaoInicio: dia,
      dataDisponibilizacaoFim: dia,
      pagina: "1",
      itensPorPagina: "5",
    }).toString();

    const resultado = {
      ok: false,
      status: null as number | null,
      statusText: null as string | null,
      duracaoMs: 0,
      colo: cf?.colo ?? null,
      pais: cf?.country ?? null,
      itens: null as number | null,
      contentType: null as string | null,
      trecho: null as string | null,
      erro: null as string | null,
    };

    const controle = new AbortController();
    const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
    const inicio = Date.now();
    try {
      const r = await fetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": "advocacia.legal/diagnostico" },
        signal: controle.signal,
      });
      const texto = await r.text();
      resultado.duracaoMs = Date.now() - inicio;
      resultado.ok = r.ok;
      resultado.status = r.status;
      resultado.statusText = r.statusText;
      resultado.contentType = r.headers.get("content-type");
      if (r.ok) {
        try {
          resultado.itens = contarItens(JSON.parse(texto));
        } catch {
          resultado.itens = null;
        }
      } else {
        resultado.trecho = texto.replace(/\s+/g, " ").trim().slice(0, 300);
      }
    } catch (e) {
      resultado.duracaoMs = Date.now() - inicio;
      resultado.erro = controle.signal.aborted
        ? "Tempo esgotado: o DJEN não respondeu em 15 segundos."
        : `Falha de rede: ${e instanceof Error ? e.name : "desconhecida"}.`;
    } finally {
      clearTimeout(relogio);
    }

    await auditar(c.env.DB, {
      tenantId: null,
      userId: usuario.id,
      acao: "diagnostico_djen",
      entidade: "plataforma",
      detalhes: { status: resultado.status, duracaoMs: resultado.duracaoMs },
      ip: ipDe(c),
    });
    return c.json(resultado);
  });
}
