import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { criarAcessoPlataforma, criarRepositorio } from "../src/server/db/repositorio";
import type { Repositorio } from "../src/server/db/repositorio";
import { prepararBanco } from "./aplicar-migracoes";

prepararBanco();

describe("isolamento: perfil do escritório e OABs", () => {
  let idA = "";
  let idB = "";
  let repoA: Repositorio;
  let repoB: Repositorio;
  let oabB = "";
  let userB = "";

  beforeAll(async () => {
    const plataforma = criarAcessoPlataforma(env.DB);
    idA = await plataforma.criarEscritorio({ nome: "A", plano: "banca" });
    idB = await plataforma.criarEscritorio({ nome: "B", plano: "banca" });
    repoA = criarRepositorio(env.DB, idA);
    repoB = criarRepositorio(env.DB, idB);
    userB = await repoB.users.inserir({ perfil: "advogado", nome: "B", email: "b@b.test", senha_hash: "h", senha_salt: "s" });
    await repoA.perfil.salvar({ razao_social: "A Advogados" });
    await repoB.perfil.salvar({ razao_social: "B Advogados", cidade: "Santos" });
    await repoA.oabs.inserir({ numero: "1", uf: "SP", advogado_nome: "Ana" });
    oabB = await repoB.oabs.inserir({ numero: "1", uf: "SP", advogado_nome: "Beto", user_id: userB });
  });

  it("perfis são independentes e o salvar substitui só o do próprio escritório", async () => {
    expect((await repoA.perfil.buscar())?.razao_social).toBe("A Advogados");
    expect((await repoB.perfil.buscar())?.cidade).toBe("Santos");
    await repoA.perfil.salvar({ razao_social: "A Novo" });
    expect((await repoA.perfil.buscar())?.cidade).toBeNull();
    expect((await repoB.perfil.buscar())?.razao_social).toBe("B Advogados");
  });

  it("perfil recusa coluna fora da lista", async () => {
    await expect(repoA.perfil.salvar({ tenant_id: idB } as never)).rejects.toThrow();
  });

  it("A não lê, lista, altera, reativa nem exclui OAB de B", async () => {
    expect(await repoA.oabs.buscar(oabB)).toBeNull();
    expect((await repoA.oabs.listar()).every((o) => o.tenant_id === idA)).toBe(true);
    expect(await repoA.oabs.listar({ numero: "1" })).toHaveLength(1);
    expect(await repoA.oabs.atualizar(oabB, { advogado_nome: "Invadido" })).toBe(false);
    expect(await repoA.oabs.reativarRespeitandoLimite(oabB, null)).toBe(false);
    expect(await repoA.oabs.excluir(oabB)).toBe(false);
    expect((await repoB.oabs.buscar(oabB))?.advogado_nome).toBe("Beto");
  });

  it("mesma OAB pode existir em dois escritórios, mas não duas vezes no mesmo (nem sem sufixo)", async () => {
    await expect(repoA.oabs.inserir({ numero: "1", uf: "SP", advogado_nome: "Outra" })).rejects.toThrow();
    await repoA.oabs.inserir({ numero: "1", sufixo: "A", uf: "SP", advogado_nome: "Com sufixo" });
    await expect(repoA.oabs.inserir({ numero: "1", sufixo: "A", uf: "SP", advogado_nome: "Dup" })).rejects.toThrow();
  });

  it("OAB de A não pode apontar para usuário de B (nem pelo banco)", async () => {
    await expect(repoA.oabs.inserir({ numero: "77", uf: "SP", advogado_nome: "X", user_id: userB })).rejects.toThrow();
  });

  it("tenant_id nos dados é ignorado e colunas fora da lista são recusadas", async () => {
    const id = await repoA.oabs.inserir({ numero: "5", uf: "MG", advogado_nome: "Z", tenant_id: idB } as never);
    expect((await repoA.oabs.buscar(id))?.tenant_id).toBe(idA);
    await expect(repoA.oabs.inserir({ numero: "6", uf: "MG", advogado_nome: "Z", criado_em: "x", foo: "bar" } as never)).rejects.toThrow();
  });

  it("contagem e limite consideram só o próprio escritório", async () => {
    const antes = await repoB.oabs.contarAtivas();
    await repoA.oabs.inserirRespeitandoLimite({ numero: "900", uf: "AC", advogado_nome: "Y" }, null);
    expect(await repoB.oabs.contarAtivas()).toBe(antes);
    expect(await repoB.oabs.inserirRespeitandoLimite({ numero: "901", uf: "AC", advogado_nome: "Y" }, antes)).toBeNull();
    expect(await repoB.oabs.inserirRespeitandoLimite({ numero: "901", uf: "AC", advogado_nome: "Y" }, antes + 1)).not.toBeNull();
  });
});
