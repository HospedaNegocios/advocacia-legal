import { bytesAleatorios, bytesParaBase64Url } from "./auth/codificacao";

// Regras dos anexos: até 7 MB; PDF, imagens (JPEG, PNG, WEBP), Word e Excel.
// O tipo é decidido pelos primeiros bytes do arquivo, nunca pelo Content-Type do navegador.
export const TAMANHO_MAXIMO_ANEXO = 7 * 1024 * 1024;

export type TipoAnexo = "pdf" | "jpeg" | "png" | "webp" | "doc" | "docx" | "xls" | "xlsx";

export const MIME_POR_TIPO: Readonly<Record<TipoAnexo, string>> = {
  pdf: "application/pdf",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const EXTENSOES: Readonly<Record<string, TipoAnexo>> = {
  pdf: "pdf", jpg: "jpeg", jpeg: "jpeg", png: "png", webp: "webp", doc: "doc", docx: "docx", xls: "xls", xlsx: "xlsx",
};

function comeca(b: Uint8Array, assinatura: number[], deslocamento = 0): boolean {
  return assinatura.every((v, i) => b[deslocamento + i] === v);
}

function contemTexto(b: Uint8Array, texto: string): boolean {
  const alvo = new TextEncoder().encode(texto);
  for (let i = 0; i + alvo.length <= b.length; i++) {
    let ok = true;
    for (let j = 0; j < alvo.length; j++) {
      if (b[i + j] !== alvo[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/** Tipo real do arquivo pelos bytes iniciais, ou null se não for um dos formatos aceitos. */
export function detectarTipo(b: Uint8Array, extensao: string): TipoAnexo | null {
  if (comeca(b, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf";
  if (comeca(b, [0xff, 0xd8, 0xff])) return "jpeg";
  if (comeca(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (comeca(b, [0x52, 0x49, 0x46, 0x46]) && comeca(b, [0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  // Word/Excel modernos são ZIP; o conteúdo interno diz qual é.
  if (comeca(b, [0x50, 0x4b, 0x03, 0x04])) {
    if (contemTexto(b, "word/document.xml")) return "docx";
    if (contemTexto(b, "xl/workbook.xml")) return "xlsx";
    return null;
  }
  // Word/Excel antigos (OLE2): os bytes iniciais não separam .doc de .xls (nem de outros formatos antigos),
  // então a extensão informada decide, mas só entre esses dois.
  if (comeca(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    const t = EXTENSOES[extensao];
    return t === "doc" || t === "xls" ? t : null;
  }
  return null;
}

export function extensaoDe(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i < 0 ? "" : nome.slice(i + 1).toLowerCase();
}

/** A extensão do nome precisa combinar com o tipo detectado. */
export function extensaoCombina(tipo: TipoAnexo, extensao: string): boolean {
  return EXTENSOES[extensao] === tipo;
}

/** Nome seguro para guardar e exibir: sem caminho, sem caracteres de controle ou de direção de texto. */
export function limparNomeArquivo(bruto: string): string {
  const base = bruto.split(/[\\/]/).pop() ?? "";
  const limpo = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩"<>:|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (limpo.length <= 120) return limpo;
  const ext = extensaoDe(limpo);
  return limpo.slice(0, 115 - ext.length).trimEnd() + "." + ext;
}

/** Chave no R2: `<tenant_id>/<entidade>/<entidade_id>/<aleatório>`. O nome original nunca entra na chave. */
export function montarChaveR2(tenantId: string, entidade: string, entidadeId: string): string {
  return `${tenantId}/${entidade}/${entidadeId}/${bytesParaBase64Url(bytesAleatorios(24))}`;
}

/** Content-Disposition de download: sempre attachment, com nome em ASCII e em UTF-8. */
export function cabecalhoDownload(nome: string): string {
  const ascii = nome.replace(/[^\x20-\x7e]/g, "_").replace(/[\\"]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}
