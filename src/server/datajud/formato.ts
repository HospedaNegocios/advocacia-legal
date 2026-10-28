import type { NovoMovimentoDatajud } from "../db/repositorio";

// Leitura tolerante dos hits da API Pública do DataJud (resposta no estilo Elasticsearch: hits.hits[]._source).
// O formato real NÃO foi confirmado por chamada de verdade (docs/DATAJUD.md): todo campo é opcional e de tipo não garantido.

const CAMPO_MAXIMO = 300;
const COMPLEMENTOS_MAXIMO = 600;
const MAX_MOVIMENTOS_POR_HIT = 5000;

function texto(v: unknown, maximo = CAMPO_MAXIMO): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t.slice(0, maximo);
}

function objeto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Data e hora como texto: "AAAAMMDDHHMMSS" vira "AAAA-MM-DDTHH:MM:SS"; texto que o JavaScript entende como data é mantido; o resto vira null. */
export function normalizarDataHora(v: unknown): string | null {
  const t = texto(v, 40);
  if (!t) return null;
  const compacto = t.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (compacto && /^\d{14}$/.test(t)) return `${compacto[1]}-${compacto[2]}-${compacto[3]}T${compacto[4]}:${compacto[5]}:${compacto[6]}`;
  return /^\d{4}-\d{2}-\d{2}/.test(t) && !Number.isNaN(Date.parse(t)) ? t : null;
}

async function sha256Hex(entrada: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(entrada));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Chave estável do movimento: o mesmo movimento, lido de novo, dá sempre a mesma chave. */
export async function chaveDoMovimento(m: { grau: string | null; codigo: string | null; data_hora: string | null; nome: string | null; orgao: string | null }): Promise<string> {
  return (await sha256Hex([m.grau, m.codigo, m.data_hora, m.nome, m.orgao].map((x) => x ?? "").join("\u001f"))).slice(0, 40);
}

/** Texto simples dos complementos tabelados: "Nome: descrição" (ou só um dos dois, ou o valor), separados por "; ". */
export function textoDosComplementos(v: unknown): string | null {
  if (!Array.isArray(v)) return null;
  const partes: string[] = [];
  for (const bruto of v) {
    const c = objeto(bruto);
    if (!c) continue;
    const nome = texto(c["nome"], 120);
    const detalhe = texto(c["descricao"], 200) ?? texto(c["valor"], 200);
    const parte = nome && detalhe && nome !== detalhe ? `${nome}: ${detalhe}` : (detalhe ?? nome);
    if (parte) partes.push(parte);
  }
  return partes.length === 0 ? null : partes.join("; ").slice(0, COMPLEMENTOS_MAXIMO);
}

export interface ProcessoLidoDatajud {
  /** Quantos hits tinham `_source` utilizável (e do número pedido). */
  hits_lidos: number;
  ultima_atualizacao_fonte: string | null;
  classe: string | null;
  orgao: string | null;
  grau: string | null;
  /** Sem repetição (mesma chave), de todos os hits. */
  movimentos: NovoMovimentoDatajud[];
}

/**
 * Junta os hits (um por grau/sistema) de um processo. Hits sem `_source` objeto, ou de OUTRO número de processo, são ignorados.
 * Os dados do cabeçalho (classe, órgão, grau, última atualização) vêm do hit atualizado mais recentemente.
 */
export async function lerHits(hits: unknown[], numeroCnj: string): Promise<ProcessoLidoDatajud> {
  const r: ProcessoLidoDatajud = { hits_lidos: 0, ultima_atualizacao_fonte: null, classe: null, orgao: null, grau: null, movimentos: [] };
  const vistas = new Set<string>();
  let melhorAtualizacao: string | null = null;
  for (const hit of hits) {
    const fonte = objeto(objeto(hit)?.["_source"]);
    if (!fonte) continue;
    const numero = texto(fonte["numeroProcesso"], 60)?.replace(/\D/g, "");
    if (numero && numero !== numeroCnj) continue;
    r.hits_lidos += 1;
    const grau = texto(fonte["grau"], 20);
    const atualizacao = normalizarDataHora(fonte["dataHoraUltimaAtualizacao"]);
    if (r.hits_lidos === 1 || (atualizacao !== null && (melhorAtualizacao === null || atualizacao > melhorAtualizacao))) {
      melhorAtualizacao = atualizacao ?? melhorAtualizacao;
      r.ultima_atualizacao_fonte = atualizacao;
      r.classe = texto(objeto(fonte["classe"])?.["nome"]);
      r.orgao = texto(objeto(fonte["orgaoJulgador"])?.["nome"]);
      r.grau = grau;
    }
    const movimentos = Array.isArray(fonte["movimentos"]) ? fonte["movimentos"].slice(0, MAX_MOVIMENTOS_POR_HIT) : [];
    for (const bruto of movimentos) {
      const m = objeto(bruto);
      if (!m) continue;
      const base = {
        data_hora: normalizarDataHora(m["dataHora"]),
        codigo: texto(m["codigo"], 30),
        nome: texto(m["nome"]),
        orgao: texto(objeto(m["orgaoJulgador"])?.["nomeOrgao"]) ?? texto(objeto(m["orgaoJulgador"])?.["nome"]),
        grau,
      };
      // Sem código, nome nem data não há o que mostrar.
      if (!base.codigo && !base.nome && !base.data_hora) continue;
      const chave = await chaveDoMovimento(base);
      if (vistas.has(chave)) continue;
      vistas.add(chave);
      r.movimentos.push({ chave, ...base, complementos: textoDosComplementos(m["complementosTabelados"]) });
    }
  }
  return r;
}
