import { SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { criarAcessoPlataforma, criarRepositorio } from "../src/server/db/repositorio";
import type { NovaIntimacao } from "../src/server/db/repositorio";
import { normalizarItem } from "../src/server/djen/formato";
import { prepararBanco } from "./aplicar-migracoes";
import { ORIGEM, chamar, criarEscritorio, novoIp, sessaoDeUsuario } from "./ajuda";
import { criarOab, item } from "./djen-ajuda";

prepararBanco();

const MOTIVO = "Cadastrado por engano, número digitado errado.";
const TUDO = { justificativa: MOTIVO, apagar_prazos: true, apagar_eventos: true, apagar_lancamentos: true };
const NADA = { justificativa: MOTIVO, apagar_prazos: false, apagar_eventos: false, apagar_lancamentos: false };

let seq = 0;
/** Número de 20 dígitos único (a API confere o dígito verificador, mas o repositório não). */
const numeroUnico = () => `${String(2000000 + ++seq).padStart(7, "0")}002020${"8260100"}`.slice(0, 20);

const PDF = () => new TextEncoder().encode("%PDF-1.4\nconteudo de teste\n%%EOF");

async function enviarAnexo(cookie: string, processoId: string) {
  const r = await SELF.fetch(`${ORIGEM}/api/processos/${processoId}/anexos`, {
    method: "POST",
    headers: { Origin: ORIGEM, "X-Requested-With": "advocacia", Cookie: cookie, "CF-Connecting-IP": novoIp(), "X-Nome-Arquivo": encodeURIComponent("peticao.pdf"), "Content-Type": "application/octet-stream" },
    body: PDF() as BodyInit,
  });
  expect(r.status).toBe(201);
  await r.arrayBuffer();
}

/** Escritório com um processo cheio: partes, responsável, andamento, anexo, DataJud, prazo, evento, lançamento e intimação. */
async function montar() {
  const t = await criarEscritorio("escritorio");
  const socio = await sessaoDeUsuario(t, "socio");
  const repo = criarRepositorio(env.DB, t);
  const numero = numeroUnico();
  const processoId = await repo.processos.inserir({ numero_cnj: numero, fase: "Conhecimento", assunto: "Cobrança", ativo: 1 });
  const clienteId = await repo.clientes.inserir({ tipo: "pf", nome: "Maria da Silva", nome_busca: "maria da silva", ativo: 1 } as never);
  await repo.processoPartes.inserir({ processo_id: processoId, cliente_id: clienteId, nome: null, polo: "ativo", cliente_escritorio: 1 });
  await repo.processoPartes.inserir({ processo_id: processoId, cliente_id: null, nome: "Empresa X", polo: "passivo", cliente_escritorio: 0 });
  await repo.processoResponsaveis.inserir({ processo_id: processoId, user_id: socio.id });
  await repo.andamentos.inserir({ processo_id: processoId, data: "2026-10-01", descricao: "Petição inicial", registrado_por: socio.id } as never);
  await enviarAnexo(socio.cookie, processoId);
  await repo.datajud.registrarConsulta(processoId, { consultado_em: "2026-10-20T10:00:00.000Z", resultado: "ok", status_http: 200, alias: "tjsp" });
  await repo.datajud.inserirMovimentos(processoId, [{ chave: "chave-movimento-1", data_hora: "2026-10-10T10:00:00", codigo: "26", nome: "Distribuição", complementos: null, orgao: null, grau: "G1" }]);
  const prazoId = await repo.prazos.inserir({ titulo: "Contestação", data_fatal: "2030-01-10", responsavel_id: socio.id, descricao: null, hora: null, processo_id: processoId, status: "a_fazer" } as never);
  const eventoId = await repo.eventos.criarComParticipantes(
    { titulo: "Audiência", tipo: "audiencia", inicio: "2030-01-10T13:00:00.000Z", fim: "2030-01-10T14:00:00.000Z", fuso: "America/Sao_Paulo", dia_inteiro: 0, local: null, descricao: null, processo_id: processoId, cliente_id: null },
    socio.id,
    [socio.id],
  );
  const lancamentoId = await repo.lancamentos.inserir({ tipo: "receita", descricao: "Honorários", categoria: null, valor_centavos: 10000, vencimento: "2030-01-10", status: "aberto", cliente_id: null, processo_id: processoId, observacoes: null, criado_por: socio.id } as never);
  const oab = await criarOab(t);
  // O número bate com o do processo: a coleta já vincula a intimação ao processo (vínculo "cnj").
  const nova: NovaIntimacao = normalizarItem(item(900 + seq, { numero_processo: numero, numeroprocessocommascara: numero }))!;
  await repo.intimacoes.inserirDaColeta(oab.id, [nova]);
  const intimacaoId = (await repo.intimacoes.pesquisar({})).itens[0]!.id;
  const anexo = await env.DB.prepare("SELECT id, chave_r2 FROM anexos WHERE tenant_id = ? AND entidade_id = ?").bind(t, processoId).first<{ id: string; chave_r2: string }>();
  return { t, socio, repo, processoId, prazoId, eventoId, lancamentoId, intimacaoId, chaveR2: anexo!.chave_r2 };
}

const contar = async (tabela: string, t: string, coluna: string, id: string) =>
  (await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${tabela} WHERE tenant_id = ? AND ${coluna} = ?`).bind(t, id).first<{ n: number }>())!.n;

describe("permissão: só o sócio", () => {
  for (const perfil of ["advogado", "estagiario", "secretaria"] as const) {
    it(`${perfil} recebe 403 nas duas rotas e o processo continua`, async () => {
      const c = await montar();
      const u = await sessaoDeUsuario(c.t, perfil);
      expect((await chamar("GET", `/api/processos/${c.processoId}/exclusao`, { cookie: u.cookie })).status).toBe(403);
      expect((await chamar("POST", `/api/processos/${c.processoId}/exclusao`, { cookie: u.cookie, corpo: TUDO })).status).toBe(403);
      expect(await c.repo.processos.buscar(c.processoId)).not.toBeNull();
      expect(await contar("prazos", c.t, "processo_id", c.processoId)).toBe(1);
    });
  }
});

describe("justificativa e opções", () => {
  it("recusa motivo ausente, curto (depois de aparar) e longo demais; o processo continua", async () => {
    const c = await montar();
    const url = `/api/processos/${c.processoId}/exclusao`;
    for (const corpo of [{ ...NADA, justificativa: undefined }, { ...NADA, justificativa: "curto" }, { ...NADA, justificativa: "   123456789   " }, { ...NADA, justificativa: 12345678901234 }, { ...NADA, justificativa: "x".repeat(501) }]) {
      const r = await chamar("POST", url, { cookie: c.socio.cookie, corpo });
      expect(r.status, JSON.stringify(corpo)).toBe(400);
      expect(r.json.erro).toMatch(/motivo/);
    }
    expect((await chamar("POST", url, { cookie: c.socio.cookie, corpo: { ...NADA, justificativa: "x".repeat(500) } })).status).toBe(200);
  });

  it("recusa opções que não são verdadeiro/falso", async () => {
    const c = await montar();
    const url = `/api/processos/${c.processoId}/exclusao`;
    for (const extra of [{ apagar_prazos: "sim" }, { apagar_eventos: 1 }, { apagar_lancamentos: null }]) {
      expect((await chamar("POST", url, { cookie: c.socio.cookie, corpo: { ...NADA, ...extra } })).status).toBe(400);
    }
    expect(await c.repo.processos.buscar(c.processoId)).not.toBeNull();
  });

  it("opções ausentes valem como falso", async () => {
    const c = await montar();
    const r = await chamar("POST", `/api/processos/${c.processoId}/exclusao`, { cookie: c.socio.cookie, corpo: { justificativa: MOTIVO } });
    expect(r.status).toBe(200);
    expect(await c.repo.prazos.buscar(c.prazoId)).toMatchObject({ processo_id: null });
  });
});

describe("contagem para a confirmação", () => {
  it("GET /exclusao devolve o que está ligado ao processo", async () => {
    const c = await montar();
    const r = await chamar("GET", `/api/processos/${c.processoId}/exclusao`, { cookie: c.socio.cookie });
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ ok: true, vinculos: { partes: 2, responsaveis: 1, andamentos: 1, anexos: 1, movimentacoes: 1, prazos: 1, eventos: 1, lancamentos: 1, intimacoes: 1 } });
  });
});

describe("exclusão completa", () => {
  it("com todas as opções: apaga o processo e tudo o que depende dele; a intimação fica sem processo", async () => {
    const c = await montar();
    expect(await env.ARQUIVOS.head(c.chaveR2)).not.toBeNull();
    const r = await chamar("POST", `/api/processos/${c.processoId}/exclusao`, { cookie: c.socio.cookie, corpo: TUDO });
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json).toEqual({ ok: true });
    expect(await c.repo.processos.buscar(c.processoId)).toBeNull();
    for (const [tabela, coluna] of [["processos_partes", "processo_id"], ["processos_responsaveis", "processo_id"], ["processos_andamentos", "processo_id"], ["datajud_consultas", "processo_id"], ["datajud_movimentos", "processo_id"], ["anexos", "entidade_id"], ["prazos", "processo_id"], ["eventos_agenda", "processo_id"], ["lancamentos", "processo_id"]] as const) {
      expect(await contar(tabela, c.t, coluna, c.processoId), tabela).toBe(0);
    }
    expect(await c.repo.prazos.buscar(c.prazoId)).toBeNull();
    expect(await c.repo.eventos.buscar(c.eventoId)).toBeNull();
    expect(await contar("eventos_participantes", c.t, "evento_id", c.eventoId)).toBe(0);
    expect(await c.repo.lancamentos.buscar(c.lancamentoId)).toBeNull();
    expect(await env.ARQUIVOS.head(c.chaveR2)).toBeNull();
    const intimacao = await c.repo.intimacoes.buscarDetalhada(c.intimacaoId);
    expect(intimacao).toMatchObject({ processo_id: null, vinculo: null });
    // a rota de detalhe responde 404
    expect((await chamar("GET", `/api/processos/${c.processoId}`, { cookie: c.socio.cookie })).status).toBe(404);
  });

  it("sem as opções: prazos, compromissos e lançamentos ficam, sem processo", async () => {
    const c = await montar();
    const r = await chamar("POST", `/api/processos/${c.processoId}/exclusao`, { cookie: c.socio.cookie, corpo: NADA });
    expect(r.status).toBe(200);
    expect(await c.repo.processos.buscar(c.processoId)).toBeNull();
    expect(await c.repo.prazos.buscar(c.prazoId)).toMatchObject({ processo_id: null, titulo: "Contestação" });
    expect(await c.repo.eventos.buscar(c.eventoId)).toMatchObject({ processo_id: null, titulo: "Audiência" });
    expect(await contar("eventos_participantes", c.t, "evento_id", c.eventoId)).toBe(1);
    expect(await c.repo.lancamentos.buscar(c.lancamentoId)).toMatchObject({ processo_id: null, descricao: "Honorários" });
    expect(await c.repo.intimacoes.buscarDetalhada(c.intimacaoId)).toMatchObject({ processo_id: null, vinculo: null });
    expect(await env.ARQUIVOS.head(c.chaveR2)).toBeNull();
  });

  it("escolhas independentes: só apaga o que foi marcado", async () => {
    const c = await montar();
    const r = await chamar("POST", `/api/processos/${c.processoId}/exclusao`, { cookie: c.socio.cookie, corpo: { ...NADA, apagar_prazos: true } });
    expect(r.status).toBe(200);
    expect(await c.repo.prazos.buscar(c.prazoId)).toBeNull();
    expect(await c.repo.eventos.buscar(c.eventoId)).not.toBeNull();
    expect(await c.repo.lancamentos.buscar(c.lancamentoId)).not.toBeNull();
  });

  it("funciona também com o processo desativado", async () => {
    const c = await montar();
    await c.repo.processos.atualizar(c.processoId, { ativo: 0 });
    expect((await chamar("POST", `/api/processos/${c.processoId}/exclusao`, { cookie: c.socio.cookie, corpo: NADA })).status).toBe(200);
    expect(await c.repo.processos.buscar(c.processoId)).toBeNull();
  });

  it("registra na auditoria, com o motivo, a identificação, as contagens e as opções", async () => {
    const c = await montar();
    const antes = await c.repo.processos.buscar(c.processoId);
    await chamar("POST", `/api/processos/${c.processoId}/exclusao`, { cookie: c.socio.cookie, corpo: { ...NADA, apagar_prazos: true } });
    const log = await env.DB.prepare("SELECT user_id, entidade, entidade_id, detalhes FROM audit_log WHERE tenant_id = ? AND acao = 'processo_excluido'").bind(c.t).all<{ user_id: string; entidade: string; entidade_id: string; detalhes: string }>();
    expect(log.results).toHaveLength(1);
    const e = log.results[0]!;
    expect(e).toMatchObject({ user_id: c.socio.id, entidade: "processos", entidade_id: c.processoId });
    const d = JSON.parse(e.detalhes);
    expect(d).toMatchObject({
      justificativa: MOTIVO,
      numero_cnj: antes!.numero_cnj,
      assunto: "Cobrança",
      tinha_partes: 2,
      tinha_anexos: 1,
      tinha_prazos: 1,
      tinha_eventos: 1,
      tinha_lancamentos: 1,
      tinha_intimacoes: 1,
      apagar_prazos: true,
      apagar_eventos: false,
      apagar_lancamentos: false,
    });
    expect(e.detalhes).not.toContain("Petição inicial");
  });

  it("segunda tentativa devolve 404", async () => {
    const c = await montar();
    await chamar("POST", `/api/processos/${c.processoId}/exclusao`, { cookie: c.socio.cookie, corpo: NADA });
    expect((await chamar("POST", `/api/processos/${c.processoId}/exclusao`, { cookie: c.socio.cookie, corpo: NADA })).status).toBe(404);
  });
});

describe("isolamento entre escritórios", () => {
  it("sócio de outro escritório recebe 404 e nada do primeiro muda", async () => {
    const a = await montar();
    const b = await montar();
    expect((await chamar("GET", `/api/processos/${a.processoId}/exclusao`, { cookie: b.socio.cookie })).status).toBe(404);
    const r = await chamar("POST", `/api/processos/${a.processoId}/exclusao`, { cookie: b.socio.cookie, corpo: TUDO });
    expect(r.status).toBe(404);
    expect(await a.repo.processos.buscar(a.processoId)).not.toBeNull();
    expect(await contar("processos_partes", a.t, "processo_id", a.processoId)).toBe(2);
    expect(await contar("datajud_movimentos", a.t, "processo_id", a.processoId)).toBe(1);
    expect(await a.repo.prazos.buscar(a.prazoId)).toMatchObject({ processo_id: a.processoId });
    expect(await a.repo.eventos.buscar(a.eventoId)).toMatchObject({ processo_id: a.processoId });
    expect(await a.repo.lancamentos.buscar(a.lancamentoId)).toMatchObject({ processo_id: a.processoId });
    expect(await a.repo.intimacoes.buscarDetalhada(a.intimacaoId)).toMatchObject({ processo_id: a.processoId, vinculo: "cnj" });
    expect(await env.ARQUIVOS.head(a.chaveR2)).not.toBeNull();
  });

  it("a camada de dados também não apaga processo de outro escritório", async () => {
    const a = await montar();
    const outro = await criarEscritorio("escritorio");
    expect(await criarRepositorio(env.DB, outro).processos.excluirCompleto(a.processoId, { apagar_prazos: true, apagar_eventos: true, apagar_lancamentos: true })).toBeNull();
    expect(await a.repo.processos.buscar(a.processoId)).not.toBeNull();
    expect(await a.repo.prazos.buscar(a.prazoId)).not.toBeNull();
  });
});

describe("somente leitura (teste vencido)", () => {
  it("bloqueia a exclusão com 402 e o processo continua", async () => {
    const c = await montar();
    await criarAcessoPlataforma(env.DB).atualizarEscritorio(c.t, { teste_ate: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString() });
    const lista = await chamar("GET", `/api/processos/${c.processoId}/exclusao`, { cookie: c.socio.cookie });
    expect(lista.status).toBe(200);
    const r = await chamar("POST", `/api/processos/${c.processoId}/exclusao`, { cookie: c.socio.cookie, corpo: TUDO });
    expect(r.status).toBe(402);
    expect(r.json).toMatchObject({ ok: false, codigo: "assinatura_somente_leitura" });
    expect(await c.repo.processos.buscar(c.processoId)).not.toBeNull();
  });
});
