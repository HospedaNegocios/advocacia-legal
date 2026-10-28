import type { Ctx } from "../contexto";
import { criarRepositorio } from "../db/repositorio";
import type { EntidadeAnexo, LinhaAnexo, Repositorio } from "../db/repositorio";
import { auditar } from "../auditoria";
import { criarLinkAnexo, verificarLinkAnexo, VALIDADE_LINK_ANEXO_MS } from "../auth/cripto";
import { MIME_POR_TIPO, TAMANHO_MAXIMO_ANEXO, cabecalhoDownload, detectarTipo, extensaoCombina, extensaoDe, limparNomeArquivo, montarChaveR2 } from "../anexos";
import { ipDe } from "../sessao";
import { respostaErro } from "../validacao";

// Peças compartilhadas pelas rotas de Clientes e de Processos.

/** O escritório vem SEMPRE da sessão. */
export function repoDaSessao(c: Ctx): Repositorio {
  return criarRepositorio(c.env.DB, c.get("sessao").tenantId as string);
}

export function ehConflitoDeUnicidade(e: unknown): boolean {
  return e instanceof Error && /UNIQUE/i.test(e.message);
}

export async function registrar(c: Ctx, acao: string, entidade: string, entidadeId: string, detalhes?: Record<string, string | number | boolean | null>) {
  const sessao = c.get("sessao");
  await auditar(c.env.DB, {
    tenantId: sessao.tenantId,
    userId: sessao.usuario.id,
    acao,
    entidade,
    entidadeId,
    ...(detalhes ? { detalhes } : {}),
    ip: ipDe(c),
  });
}

export function numeroPositivo(v: string | undefined, padrao: number, maximo: number): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, maximo) : padrao;
}

export const anexoPublico = (l: LinhaAnexo) => ({ id: l.id, nome: l.nome_original, tipo_mime: l.tipo_mime, tamanho_bytes: l.tamanho_bytes, enviado_por: l.enviado_por, criado_em: l.criado_em, compartilhado_cliente: l.compartilhado_cliente === 1 });

// ---------- Anexos (iguais para cliente e processo) ----------

/** Download por link temporário. Confere assinatura (escritório + anexo + validade), depois busca já filtrando pelo escritório e pela entidade. */
export async function baixarAnexo(c: Ctx, entidade: EntidadeAnexo): Promise<Response> {
  const sessao = c.get("sessao");
  const token = c.req.query("token") ?? "";
  const anexoId = c.req.param("anexoId") ?? "";
  const tenantId = sessao.tenantId as string;
  if (!(await verificarLinkAnexo(token, tenantId, anexoId, c.env.CHAVE_CRIPTO))) {
    return respostaErro(c, 403, "Link inválido ou expirado. Volte à tela anterior e gere um novo.");
  }
  const repo = repoDaSessao(c);
  const anexo = await repo.anexos.buscar(anexoId);
  if (!anexo || anexo.entidade !== entidade || !anexo.chave_r2.startsWith(`${tenantId}/`)) return respostaErro(c, 404, "Arquivo não encontrado.");
  const objeto = await c.env.ARQUIVOS.get(anexo.chave_r2);
  if (!objeto) return respostaErro(c, 404, "Arquivo não encontrado.");
  await registrar(c, "anexo_baixado", "anexos", anexo.id, { entidade: anexo.entidade, entidade_id: anexo.entidade_id });
  return new Response(objeto.body, {
    headers: {
      "Content-Type": anexo.tipo_mime,
      "Content-Length": String(anexo.tamanho_bytes),
      "Content-Disposition": cabecalhoDownload(anexo.nome_original),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}

export async function listarAnexos(c: Ctx, repo: Repositorio, entidade: EntidadeAnexo, entidadeId: string) {
  const lista = await repo.anexos.listar({ entidade, entidade_id: entidadeId }, { limite: 200 });
  return c.json({ ok: true, anexos: lista.map(anexoPublico), tamanho_maximo: TAMANHO_MAXIMO_ANEXO });
}

/** Envio: corpo = bytes do arquivo; nome em X-Nome-Arquivo (codificado com encodeURIComponent). */
export async function enviarAnexo(c: Ctx, repo: Repositorio, entidade: EntidadeAnexo, entidadeId: string) {
  const limiteMb = TAMANHO_MAXIMO_ANEXO / 1024 / 1024;
  const msgTamanho = `O arquivo é maior que ${limiteMb} MB. Reduza o arquivo e tente de novo.`;
  // Recusa pelo tamanho declarado antes de ler o corpo; depois confere o tamanho real.
  const declarado = Number(c.req.header("Content-Length"));
  if (!Number.isInteger(declarado) || declarado <= 0) return respostaErro(c, 400, "Envie o arquivo com o tamanho informado.");
  if (declarado > TAMANHO_MAXIMO_ANEXO) return respostaErro(c, 413, msgTamanho);
  let nome = "";
  try {
    nome = limparNomeArquivo(decodeURIComponent(c.req.header("X-Nome-Arquivo") ?? ""));
  } catch {
    nome = "";
  }
  if (!nome) return respostaErro(c, 400, "Informe o nome do arquivo.");
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  if (bytes.length === 0) return respostaErro(c, 400, "O arquivo está vazio.");
  if (bytes.length > TAMANHO_MAXIMO_ANEXO) return respostaErro(c, 413, msgTamanho);
  const extensao = extensaoDe(nome);
  const tipo = detectarTipo(bytes, extensao);
  if (!tipo || !extensaoCombina(tipo, extensao)) {
    return respostaErro(c, 400, "Tipo de arquivo não aceito. Envie PDF, imagem (JPEG, PNG ou WEBP), Word (.doc, .docx) ou Excel (.xls, .xlsx).");
  }
  const mime = MIME_POR_TIPO[tipo];
  const chave = montarChaveR2(repo.tenantId, entidade, entidadeId);
  await c.env.ARQUIVOS.put(chave, bytes, { httpMetadata: { contentType: mime } });
  let id: string;
  try {
    id = await repo.anexos.inserir({
      entidade,
      entidade_id: entidadeId,
      nome_original: nome,
      tipo_mime: mime,
      tamanho_bytes: bytes.length,
      chave_r2: chave,
      enviado_por: c.get("sessao").usuario.id,
    });
  } catch (e) {
    await c.env.ARQUIVOS.delete(chave);
    throw e;
  }
  await registrar(c, "anexo_enviado", "anexos", id, { entidade, entidade_id: entidadeId, tamanho_bytes: bytes.length, tipo });
  const novo = await repo.anexos.buscar(id);
  return c.json({ ok: true, anexo: novo ? anexoPublico(novo) : null }, 201);
}

export async function anexoDaEntidade(c: Ctx, repo: Repositorio, entidade: EntidadeAnexo, entidadeId: string): Promise<LinhaAnexo | null> {
  const a = await repo.anexos.buscar(c.req.param("anexoId") ?? "");
  return a && a.entidade === entidade && a.entidade_id === entidadeId ? a : null;
}

/** Gera o link temporário (5 minutos). `prefixo` é a rota de download do módulo (ex.: /api/processos). */
export async function linkDoAnexo(c: Ctx, repo: Repositorio, anexo: LinhaAnexo, prefixo: string) {
  const token = await criarLinkAnexo(repo.tenantId, anexo.id, c.env.CHAVE_CRIPTO);
  return c.json({ ok: true, url: `${prefixo}/anexos/${anexo.id}/arquivo?token=${token}`, validade_segundos: VALIDADE_LINK_ANEXO_MS / 1000 });
}

export async function apagarAnexo(c: Ctx, repo: Repositorio, anexo: LinhaAnexo, entidade: EntidadeAnexo, entidadeId: string) {
  await repo.anexos.excluir(anexo.id);
  // Se a remoção no R2 falhar, o registro já saiu do sistema e o arquivo fica inacessível (sem link possível).
  await c.env.ARQUIVOS.delete(anexo.chave_r2);
  await registrar(c, "anexo_excluido", "anexos", anexo.id, { entidade, entidade_id: entidadeId });
  return c.json({ ok: true });
}
