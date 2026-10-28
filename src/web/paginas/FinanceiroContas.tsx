import { Plus, Search, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useSessao } from "../sessao";
import { Botao, Cartao, Entrada, EsqueletoKpi, EsqueletoLinhas, EstadoErro, EstadoVazio, Indicador, Selecao, SeletorBusca, Tabela } from "../ui";
import type { Coluna, OpcaoBusca } from "../ui";
import { buscarClientesTodos, buscarProcessosTodos } from "./buscas";
import { formatarDataCivil, formatarReais, podeEditarFinanceiro } from "./financeiro-comum";
import type { Lancamento, RespostaResumo, TipoLancamento } from "./financeiro-comum";
import { Paginacao, SeloLancamento, useBuscaComAtraso, useLancamentos } from "./financeiro-ui";
import { LancamentoAcoes } from "./LancamentoAcoes";
import type { ModoLancamento } from "./LancamentoAcoes";

const POR_PAGINA = 20;

/** Aba "Contas a receber" (receitas) ou "Contas a pagar" (despesas): lista com filtros e ação de registrar pagamento. */
export function FinanceiroContas({ tipo, versao, categorias, aoNovo, aoMudar }: { tipo: TipoLancamento; versao: number; categorias: string[]; aoNovo: (tipo: TipoLancamento) => void; aoMudar: () => void }) {
  const { eu } = useSessao();
  const podeEditar = podeEditarFinanceiro(eu?.permissoes.financeiro);
  const receita = tipo === "receita";
  const [situacao, setSituacao] = useState("aberto");
  const [categoria, setCategoria] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [pagina, setPagina] = useState(1);
  const [clienteFiltro, setClienteFiltro] = useState<OpcaoBusca | null>(null);
  const [processoFiltro, setProcessoFiltro] = useState<OpcaoBusca | null>(null);
  const [texto, busca, setTexto] = useBuscaComAtraso(() => setPagina(1));
  const [resumo, setResumo] = useState<RespostaResumo | null>(null);
  const [selecionado, setSelecionado] = useState<{ l: Lancamento; modo: ModoLancamento } | null>(null);

  const parametros = useMemo(() => {
    const q = new URLSearchParams({ tipo, pagina: String(pagina), por_pagina: String(POR_PAGINA) });
    if (situacao !== "todos") q.set("status", situacao);
    q.set("ordem", situacao === "aberto" || situacao === "vencido" ? "vencimento" : "vencimento_desc");
    if (busca.trim()) q.set("busca", busca.trim());
    if (categoria) q.set("categoria", categoria);
    if (clienteFiltro) q.set("cliente_id", clienteFiltro.id);
    if (processoFiltro) q.set("processo_id", processoFiltro.id);
    if (de) q.set("de", de);
    if (ate) q.set("ate", ate);
    return q.toString();
  }, [tipo, situacao, busca, categoria, de, ate, pagina, clienteFiltro, processoFiltro]);
  const { lista, erro, recarregar } = useLancamentos(parametros, versao);

  useEffect(() => {
    api<RespostaResumo>("GET", "/api/financeiro/resumo")
      .then(setResumo)
      .catch(() => setResumo(null));
  }, [versao]);

  const filtrando = busca.trim() !== "" || categoria !== "" || clienteFiltro !== null || processoFiltro !== null || de !== "" || ate !== "" || situacao !== "aberto";
  const hoje = lista?.hoje ?? resumo?.hoje ?? "";
  const verbo = receita ? "Registrar recebimento" : "Registrar pagamento";

  const colunas: Coluna<Lancamento>[] = [
    { chave: "vencimento", titulo: "Vencimento", nowrap: true, render: (l) => formatarDataCivil(l.vencimento) },
    {
      chave: "descricao",
      titulo: "Descrição",
      principal: true,
      render: (l) => (
        <div className="celula-principal">
          <div>
            <strong>{l.descricao}</strong>
            <small>{[l.categoria, l.cliente_nome].filter(Boolean).join(" · ") || "Sem categoria nem cliente"}</small>
          </div>
        </div>
      ),
    },
    {
      chave: "valor",
      titulo: "Valor",
      numerica: true,
      nowrap: true,
      render: (l) => (
        <>
          {formatarReais(l.valor_centavos)}
          {l.status === "pago" && l.valor_pago_centavos !== l.valor_centavos && <small className="texto-pequeno" style={{ display: "block" }}>{receita ? "Recebido" : "Pago"}: {formatarReais(l.valor_pago_centavos ?? 0)}</small>}
        </>
      ),
    },
    { chave: "situacao", titulo: "Situação", render: (l) => <SeloLancamento l={l} hoje={hoje} /> },
    {
      chave: "acoes",
      titulo: "Ações",
      acoes: true,
      render: (l) => (
        <div className="acoes-linha">
          {podeEditar && l.status === "aberto" && (
            <Botao tamanho="pequeno" onClick={() => setSelecionado({ l, modo: "pagar" })}>
              {verbo}
            </Botao>
          )}
          <Botao variante="secundario" tamanho="pequeno" onClick={() => setSelecionado({ l, modo: "detalhe" })}>
            Detalhes
          </Botao>
        </div>
      ),
    },
  ];

  const botaoNovo = podeEditar ? (
    <Botao onClick={() => aoNovo(tipo)}>
      <Plus size={18} aria-hidden="true" />
      {receita ? "Nova receita" : "Nova despesa"}
    </Botao>
  ) : null;

  const rotuloPago = receita ? "Recebidas" : "Pagas";
  return (
    <div style={{ display: "grid", gap: "var(--e-4)" }}>
      <section aria-label={receita ? "Resumo das contas a receber" : "Resumo das contas a pagar"} className="grade grade-kpi kpi-fin">
        {resumo ? (
          <>
            <Indicador rotulo={receita ? "A receber em aberto" : "A pagar em aberto"} valor={formatarReais(receita ? resumo.resumo.a_receber_centavos : resumo.resumo.a_pagar_centavos)} nota={`${receita ? resumo.resumo.a_receber_qtd : resumo.resumo.a_pagar_qtd} em aberto`} />
            <Indicador rotulo="Vencido" valor={formatarReais(receita ? resumo.resumo.vencido_receber_centavos : resumo.resumo.vencido_pagar_centavos)} nota={`${receita ? resumo.resumo.vencido_receber_qtd : resumo.resumo.vencido_pagar_qtd} em atraso`} />
          </>
        ) : (
          <>
            <EsqueletoKpi />
            <EsqueletoKpi />
          </>
        )}
      </section>
      <Cartao semPadding titulo={receita ? "Contas a receber" : "Contas a pagar"} subtitulo={receita ? "Honorários e outras receitas" : "Custas e outras despesas"} acoes={botaoNovo}>
        <div className="barra-filtros barra-filtros-prazos">
          <Entrada rotulo="Buscar na descrição" type="search" autoComplete="off" placeholder="Parte da descrição" value={texto} onChange={(e) => setTexto(e.target.value)} />
          <Selecao rotulo="Situação" value={situacao} onChange={(e) => (setSituacao(e.target.value), setPagina(1))}>
            <option value="aberto">Em aberto</option>
            <option value="vencido">Vencidas</option>
            <option value="pago">{rotuloPago}</option>
            <option value="cancelado">Canceladas</option>
            <option value="todos">Todas</option>
          </Selecao>
          <Selecao rotulo="Categoria" value={categoria} onChange={(e) => (setCategoria(e.target.value), setPagina(1))}>
            <option value="">Todas</option>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Selecao>
          <Entrada rotulo="Vencimento de" type="date" value={de} onChange={(e) => (setDe(e.target.value), setPagina(1))} />
          <Entrada rotulo="Vencimento até" type="date" value={ate} onChange={(e) => (setAte(e.target.value), setPagina(1))} />
        </div>
        <div className="barra-filtros barra-filtros-vinculos">
          <SeletorBusca rotulo="Cliente" valor={clienteFiltro?.id ?? null} rotuloAtual={clienteFiltro?.rotulo ?? ""} buscar={buscarClientesTodos} vazio="Nenhum cliente encontrado." aoMudar={(o) => (setClienteFiltro(o), setPagina(1))} />
          <SeletorBusca rotulo="Processo" valor={processoFiltro?.id ?? null} rotuloAtual={processoFiltro?.rotulo ?? ""} buscar={buscarProcessosTodos} vazio="Nenhum processo encontrado." ajuda="Busque pelo número ou pelo nome de uma parte." aoMudar={(o) => (setProcessoFiltro(o), setPagina(1))} />
        </div>
        {erro ? (
          <EstadoErro acao={<Botao variante="secundario" onClick={() => void recarregar()}>Tentar de novo</Botao>}>{erro}</EstadoErro>
        ) : lista === null ? (
          <div style={{ padding: "var(--e-4)" }}>
            <EsqueletoLinhas linhas={5} />
          </div>
        ) : lista.lancamentos.length === 0 ? (
          filtrando ? (
            <EstadoVazio icone={Search} titulo="Nenhum lançamento encontrado">
              Tente outra busca ou mude os filtros.
            </EstadoVazio>
          ) : (
            <EstadoVazio icone={Wallet} titulo={receita ? "Nada a receber em aberto" : "Nada a pagar em aberto"} {...(botaoNovo ? { acao: botaoNovo } : {})}>
              {receita ? "Lance honorários e outras receitas para acompanhar o que falta receber." : "Lance custas e outras despesas para acompanhar o que falta pagar."}
            </EstadoVazio>
          )
        ) : (
          <>
            <Tabela colunas={colunas} linhas={lista.lancamentos} chaveLinha={(l) => l.id} legenda={receita ? "Contas a receber" : "Contas a pagar"} />
            <Paginacao total={lista.total} pagina={pagina} porPagina={POR_PAGINA} substantivo={["lançamento", "lançamentos"]} aoMudar={setPagina} />
          </>
        )}
      </Cartao>
      {selecionado && (
        <LancamentoAcoes
          lancamento={selecionado.l}
          modo={selecionado.modo}
          hoje={hoje}
          categorias={categorias}
          aoEscolher={(modo) => setSelecionado({ l: selecionado.l, modo })}
          aoFechar={() => setSelecionado(null)}
          aoMudar={() => {
            setSelecionado(null);
            aoMudar();
          }}
        />
      )}
    </div>
  );
}
