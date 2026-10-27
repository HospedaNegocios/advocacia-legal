import { env } from "cloudflare:workers";
import { criarRepositorio } from "../src/server/db/repositorio";
import type { ClienteDjen, ParametrosDjen, RespostaDjen } from "../src/server/djen/cliente";
import type { Relogio } from "../src/server/djen/coleta";
import { unico } from "./ajuda";

// Ajudas dos testes do DJEN. A rede NUNCA é chamada: o cliente é simulado e o relógio é falso.

export const INICIO_RELOGIO = Date.parse("2026-10-27T13:00:00Z"); // 10:00 em São Paulo
export const HOJE = "2026-10-27";

export function relogioFalso(inicio = INICIO_RELOGIO): Relogio & { dormidos: number[] } {
  let agora = inicio;
  const dormidos: number[] = [];
  return {
    dormidos,
    agora: () => agora,
    async dormir(ms) {
      dormidos.push(ms);
      agora += ms;
    },
  };
}

export interface ChamadaDjen {
  p: ParametrosDjen;
  em: number;
}

/** Cliente simulado: `responder` decide a resposta de cada chamada; registra parâmetros e o instante (do relógio falso). */
export function clienteSimulado(relogio: Relogio, responder: (p: ParametrosDjen, n: number) => RespostaDjen): ClienteDjen & { chamadas: ChamadaDjen[] } {
  const chamadas: ChamadaDjen[] = [];
  return {
    chamadas,
    async consultar(p) {
      chamadas.push({ p, em: relogio.agora() });
      // A resposta real leva algum tempo.
      return responder(p, chamadas.length);
    },
  };
}

export const ok = (itens: unknown[], total: number | null = itens.length): RespostaDjen => ({ tipo: "ok", status: 200, itens, total });

export function item(id: number | string, extra: Record<string, unknown> = {}) {
  return {
    id,
    hash: `h${id}`,
    numero_processo: "00000017820208260100",
    numeroprocessocommascara: "0000001-78.2020.8.26.0100",
    siglaTribunal: "TJSP",
    nomeOrgao: "1ª Vara Cível de XXXX",
    tipoComunicacao: "Intimação",
    tipoDocumento: "Despacho",
    nomeClasse: "Procedimento Comum Cível",
    data_disponibilizacao: HOJE,
    texto: `Texto XXXX da publicação ${id}`,
    link: "https://exemplo.test/XXXX",
    ...extra,
  };
}

export async function criarOab(tenantId: string, extra: { ativo?: number; uf?: string } = {}) {
  const numero = String(100000 + Math.floor(Math.random() * 800000));
  const id = await criarRepositorio(env.DB, tenantId).oabs.inserir({ numero, uf: extra.uf ?? "SP", advogado_nome: unico("Advogado "), ativo: extra.ativo ?? 1 });
  return { id, numero, uf: extra.uf ?? "SP" };
}

export const alvo = (tenantId: string, o: { id: string; numero: string; uf: string }) => ({ tenant_id: tenantId, oab_id: o.id, numero: o.numero, uf: o.uf });
