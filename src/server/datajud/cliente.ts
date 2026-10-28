// Cliente HTTP da API Pública do DataJud (CNJ). Fica atrás de uma interface para os testes nunca chamarem a rede.
// A chave pública vem do Worker secret DATAJUD_CHAVE; nunca é gravada em código nem em log.

export const URL_BASE_DATAJUD = "https://api-publica.datajud.cnj.jus.br";
const TEMPO_LIMITE_MS = 15_000;

export type RespostaDatajud =
  | { tipo: "ok"; status: number; hits: unknown[] }
  /** 401, 403, 429, redirecionamento ou resposta que não é JSON: a rodada inteira para. */
  | { tipo: "bloqueado"; status: number | null; motivo: string }
  /** `status` nulo = falha de rede ou tempo esgotado. 5xx e nulo podem ser repetidos; o resto não. */
  | { tipo: "erro"; status: number | null; motivo: string };

export interface ClienteDatajud {
  /** `alias` vem de `aliasDoTribunal`; `numeroCnj` tem 20 dígitos. */
  consultar(alias: string, numeroCnj: string): Promise<RespostaDatajud>;
}

export function montarUrl(alias: string): string {
  return `${URL_BASE_DATAJUD}/api_publica_${encodeURIComponent(alias)}/_search`;
}

export function montarCorpo(numeroCnj: string): string {
  return JSON.stringify({ query: { match: { numeroProcesso: numeroCnj } }, size: 10 });
}

export function criarClienteHttp(chave: string): ClienteDatajud {
  return {
    async consultar(alias, numeroCnj) {
      const controle = new AbortController();
      const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
      try {
        // redirect "manual": um redirecionamento (ex.: para uma tela de login) é tratado como bloqueio.
        const r = await fetch(montarUrl(alias), {
          method: "POST",
          redirect: "manual",
          headers: {
            Authorization: `APIKey ${chave}`,
            "Content-Type": "application/json",
            Accept: "application/json",
            "User-Agent": "advocacia.legal/1.0 (consulta de movimentacoes)",
          },
          body: montarCorpo(numeroCnj),
          signal: controle.signal,
        });
        if (r.status === 401 || r.status === 403 || r.status === 429) return { tipo: "bloqueado", status: r.status, motivo: "recusado" };
        if ((r.status >= 300 && r.status < 400) || r.type === "opaqueredirect") return { tipo: "bloqueado", status: r.status, motivo: "login_ou_redirecionamento" };
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
        const externo = json && typeof json === "object" ? (json as { hits?: unknown }).hits : undefined;
        const hits = externo && typeof externo === "object" ? (externo as { hits?: unknown }).hits : undefined;
        if (!Array.isArray(hits)) return { tipo: "erro", status: r.status, motivo: "formato_inesperado" };
        return { tipo: "ok", status: r.status, hits };
      } catch (e) {
        return { tipo: "erro", status: null, motivo: controle.signal.aborted ? "tempo_esgotado" : `rede_${e instanceof Error ? e.name : "desconhecida"}` };
      } finally {
        clearTimeout(relogio);
      }
    },
  };
}
