import type { NovaIntimacao } from "../db/repositorio";
import { htmlParaTexto } from "../../comum/html";

// Leitura defensiva de um item da API pública do DJEN (formato em docs/DJEN.md).
// Os nomes dos campos vêm de relatos de terceiros e do diagnóstico do Worker: o CNJ não publicou um esquema oficial.
// Por isso só `id` (ou `hash`) é exigido; todo o resto é opcional e aceito em mais de uma grafia.

export const TEXTO_MAXIMO = 300_000;
const CAMPO_MAXIMO = 300;
const LINK_MAXIMO = 1000;

function texto(v: unknown, maximo = CAMPO_MAXIMO): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t.slice(0, maximo);
}

/** 20 dígitos (número CNJ sem máscara) se o texto tiver exatamente 20 dígitos; senão o texto original. */
export function normalizarNumeroProcesso(v: unknown): string | null {
  const t = texto(v, 60);
  if (!t) return null;
  const digitos = t.replace(/\D/g, "");
  return digitos.length === 20 ? digitos : t;
}

/** AAAA-MM-DD a partir de "AAAA-MM-DD...", "DD/MM/AAAA..." ou null. Não confere se o dia existe no calendário. */
export function normalizarData(v: unknown): string | null {
  const t = texto(v, 40);
  if (!t) return null;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}

function linkSeguro(v: unknown): string | null {
  const t = texto(v, LINK_MAXIMO);
  return t && /^https?:\/\//i.test(t) ? t : null;
}

/** Devolve a publicação normalizada, ou null se o item não traz `id` nem `hash` (não dá para evitar duplicidade). */
export function normalizarItem(bruto: unknown): NovaIntimacao | null {
  if (!bruto || typeof bruto !== "object") return null;
  const i = bruto as Record<string, unknown>;
  const hash = texto(i["hash"]);
  const id = texto(i["id"]) ?? hash;
  if (!id) return null;
  const conteudo = typeof i["texto"] === "string" ? i["texto"] : "";
  return {
    comunicacao_id: id,
    hash,
    numero_processo: normalizarNumeroProcesso(i["numero_processo"] ?? i["numeroprocessocommascara"]),
    tribunal: texto(i["siglaTribunal"], 20),
    orgao: texto(i["nomeOrgao"]),
    tipo: texto(i["tipoComunicacao"]),
    tipo_documento: texto(i["tipoDocumento"]),
    classe: texto(i["nomeClasse"]),
    data_disponibilizacao: normalizarData(i["data_disponibilizacao"] ?? i["datadisponibilizacao"]),
    texto: htmlParaTexto(conteudo).slice(0, TEXTO_MAXIMO),
    link: linkSeguro(i["link"]),
    cancelada_em: texto(i["data_cancelamento"], 40),
  };
}
