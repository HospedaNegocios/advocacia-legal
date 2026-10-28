import type { Hono } from "hono";
import type { Env } from "../env";
import type { Variaveis } from "../contexto";
import { auditar } from "../auditoria";
import { criarAcessoAutenticacao } from "../db/repositorio";
import { ipDe } from "../sessao";
import { respostaErro } from "../validacao";

const BASE = "https://api-publica.datajud.cnj.jus.br";
let tempoLimiteMs = 20_000;
/** Só para testes: troca o tempo limite (padrão 20 s). */
export function definirTempoLimiteParaTeste(ms: number): void {
  tempoLimiteMs = ms;
}
const INTERVALO_MS = 10_000;
const CHAVE_LIMITE = "diagnostico-datajud";

interface Alvo {
  nome: string;
  url: string;
  /** Verdadeiro: POST com a chave e corpo mínimo. Falso: GET simples, sem Authorization. */
  busca: boolean;
}

const ALVOS: Alvo[] = [
  { nome: "TJDFT", url: `${BASE}/api_publica_tjdft/_search`, busca: true },
  { nome: "TJSP", url: `${BASE}/api_publica_tjsp/_search`, busca: true },
  { nome: "Conexão simples (sem chave)", url: `${BASE}/`, busca: false },
];

export interface ResultadoAlvoDatajud {
  nome: string;
  ok: boolean;
  status: number | null;
  duracaoMs: number;
  contentType: string | null;
  hits: number | null;
  trecho: string | null;
  erro: string | null;
}

/** Troca qualquer ocorrência da chave por *** (a chave nunca sai do servidor). */
function ocultar(texto: string, chave: string): string {
  return chave ? texto.split(chave).join("***") : texto;
}

function contarHits(json: unknown): number | null {
  const hits = (json as { hits?: { hits?: unknown } } | null)?.hits?.hits;
  return Array.isArray(hits) ? hits.length : null;
}

async function testarAlvo(alvo: Alvo, chave: string): Promise<ResultadoAlvoDatajud> {
  const r: ResultadoAlvoDatajud = { nome: alvo.nome, ok: false, status: null, duracaoMs: 0, contentType: null, hits: null, trecho: null, erro: null };
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), tempoLimiteMs);
  const inicio = Date.now();
  try {
    const init: RequestInit = alvo.busca
      ? {
          method: "POST",
          headers: { Authorization: `APIKey ${chave}`, "Content-Type": "application/json", Accept: "application/json", "User-Agent": "advocacia.legal/diagnostico" },
          body: JSON.stringify({ size: 1, query: { match_all: {} } }),
          signal: controle.signal,
        }
      : { method: "GET", headers: { "User-Agent": "advocacia.legal/diagnostico" }, signal: controle.signal };
    const resp = await fetch(alvo.url, init);
    const texto = await resp.text();
    r.duracaoMs = Date.now() - inicio;
    r.status = resp.status;
    r.ok = resp.ok;
    r.contentType = resp.headers.get("content-type");
    if (resp.ok) {
      if (alvo.busca) {
        try {
          r.hits = contarHits(JSON.parse(texto));
        } catch {
          r.hits = null;
        }
      }
    } else {
      r.trecho = ocultar(texto.replace(/\s+/g, " ").trim(), chave).slice(0, 200);
    }
  } catch (e) {
    r.duracaoMs = Date.now() - inicio;
    if (controle.signal.aborted) {
      r.erro = "Tempo esgotado: sem resposta em 20 segundos.";
    } else {
      const nome = e instanceof Error ? e.name : "Erro";
      const msg = e instanceof Error ? e.message : "";
      r.erro = ocultar(`${nome}: ${msg}`, chave).slice(0, 150);
    }
  } finally {
    clearTimeout(relogio);
  }
  return r;
}

/**
 * Teste de conexão com o DataJud a partir do Worker (rota só do dono, já protegida por exigirSessao).
 * Três chamadas curtas em paralelo. Nunca devolve o conteúdo da resposta nem a chave.
 */
export function registrarDiagnosticoDatajud(rotas: Hono<{ Bindings: Env; Variables: Variaveis }>): void {
  rotas.post("/diagnostico/datajud", async (c) => {
    const { usuario } = c.get("sessao");
    const chave = (c.env.DATAJUD_CHAVE ?? "").trim();
    if (!chave) return respostaErro(c, 409, "A chave do DataJud não está configurada neste ambiente.");
    const tentativas = await criarAcessoAutenticacao(c.env.DB).contarTentativa(CHAVE_LIMITE, INTERVALO_MS);
    if (tentativas > 1) return respostaErro(c, 429, "Aguarde 10 segundos antes de testar de novo.");

    const cf = (c.req.raw as { cf?: { colo?: string; country?: string } }).cf;
    const resultados = await Promise.all(ALVOS.map((a) => testarAlvo(a, chave)));

    await auditar(c.env.DB, {
      tenantId: null,
      userId: usuario.id,
      acao: "diagnostico_datajud",
      entidade: "plataforma",
      detalhes: Object.fromEntries(resultados.flatMap((r, i) => [[`status${i + 1}`, r.status], [`duracaoMs${i + 1}`, r.duracaoMs]])),
      ip: ipDe(c),
    });
    return c.json({ colo: cf?.colo ?? null, pais: cf?.country ?? null, resultados });
  });
}
