// Cliente HTTP da API pública do DJEN. Fica atrás de uma interface para os testes nunca chamarem a rede.

export const URL_DJEN = "https://comunicaapi.pje.jus.br/api/v1/comunicacao";
const TEMPO_LIMITE_MS = 15_000;

export interface ParametrosDjen {
  /** Número da OAB: só dígitos, sem zeros à esquerda. */
  numeroOab: string;
  ufOab: string;
  /** AAAA-MM-DD. */
  dataInicio: string;
  dataFim: string;
  pagina: number;
  itensPorPagina: number;
}

export type RespostaDjen =
  | { tipo: "ok"; status: number; itens: unknown[]; total: number | null }
  /** 403, 429, login, CAPTCHA ou resposta que não é JSON: a coleta inteira para. */
  | { tipo: "bloqueado"; status: number | null; motivo: string }
  /** `status` nulo = falha de rede ou tempo esgotado. 5xx e nulo podem ser repetidos; o resto não. */
  | { tipo: "erro"; status: number | null; motivo: string };

export interface ClienteDjen {
  consultar(p: ParametrosDjen): Promise<RespostaDjen>;
}

export function montarUrl(p: ParametrosDjen): string {
  const u = new URL(URL_DJEN);
  u.search = new URLSearchParams({
    numeroOab: p.numeroOab,
    ufOab: p.ufOab,
    dataDisponibilizacaoInicio: p.dataInicio,
    dataDisponibilizacaoFim: p.dataFim,
    pagina: String(p.pagina),
    itensPorPagina: String(p.itensPorPagina),
  }).toString();
  return u.toString();
}

export function criarClienteHttp(): ClienteDjen {
  return {
    async consultar(p) {
      const controle = new AbortController();
      const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
      try {
        // redirect "manual": um redirecionamento (ex.: para uma tela de login) é tratado como bloqueio.
        const r = await fetch(montarUrl(p), {
          method: "GET",
          redirect: "manual",
          headers: { Accept: "application/json", "User-Agent": "advocacia.legal/1.0 (consulta de intimacoes)" },
          signal: controle.signal,
        });
        if (r.status === 403 || r.status === 429) return { tipo: "bloqueado", status: r.status, motivo: "recusado" };
        if (r.status === 401 || (r.status >= 300 && r.status < 400) || r.type === "opaqueredirect") return { tipo: "bloqueado", status: r.status, motivo: "login_ou_redirecionamento" };
        if (r.status >= 500) return { tipo: "erro", status: r.status, motivo: "servidor" };
        if (!r.ok) return { tipo: "erro", status: r.status, motivo: "recusada" };
        const tipo = r.headers.get("content-type") ?? "";
        if (!/json/i.test(tipo)) return { tipo: "bloqueado", status: r.status, motivo: "resposta_nao_json" };
        let json: unknown;
        try {
          json = await r.json();
        } catch {
          return { tipo: "bloqueado", status: r.status, motivo: "resposta_nao_json" };
        }
        const itens = Array.isArray(json) ? json : json && typeof json === "object" && Array.isArray((json as { items?: unknown }).items) ? (json as { items: unknown[] }).items : null;
        if (!itens) return { tipo: "erro", status: r.status, motivo: "formato_inesperado" };
        const count = json && typeof json === "object" ? (json as { count?: unknown }).count : undefined;
        return { tipo: "ok", status: r.status, itens, total: typeof count === "number" && Number.isFinite(count) ? count : null };
      } catch (e) {
        return { tipo: "erro", status: null, motivo: controle.signal.aborted ? "tempo_esgotado" : `rede_${e instanceof Error ? e.name : "desconhecida"}` };
      } finally {
        clearTimeout(relogio);
      }
    },
  };
}
