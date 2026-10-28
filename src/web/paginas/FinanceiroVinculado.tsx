import { Plus, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ErroApi, api } from "../api";
import { useSessao } from "../sessao";
import { Botao, Cartao, EsqueletoKpi, EsqueletoLinhas, EstadoErro, EstadoVazio, Indicador, Tabela } from "../ui";
import type { Coluna, OpcaoBusca } from "../ui";
import { carregarCategorias, formatarDataCivil, formatarReais, podeEditarFinanceiro, textoDoGrupo } from "./financeiro-comum";
import type { Lancamento, TipoLancamento, TotaisVinculo } from "./financeiro-comum";
import { Paginacao, SeloLancamento, useLancamentos } from "./financeiro-ui";
import { LancamentoAcoes } from "./LancamentoAcoes";
import type { ModoLancamento } from "./LancamentoAcoes";
import { LancamentoFormulario } from "./LancamentoFormulario";

const POR_PAGINA = 10;

/**
 * Aba "Financeiro" do cliente ou do processo: lançamentos ligados a ele e os totais.
 * Só aparece (nas telas de detalhe) para quem tem permissão de leitura do financeiro; o servidor confere de novo a cada requisição.
 * `ativo` falso (cliente ou processo desativado): sem botão de lançamento novo (o servidor também recusa, 409).
 */
export function AbaFinanceiro({ cliente: clienteProp, processo: processoProp, ativo }: { cliente?: OpcaoBusca; processo?: OpcaoBusca; ativo: boolean }) {
  const { eu } = useSessao();
  // Mesma identidade enquanto id e rótulo não mudam (o formulário reinicia quando estes objetos mudam).
  const cliente = useMemo(() => clienteProp, [clienteProp?.id, clienteProp?.rotulo]); // eslint-disable-line react-hooks/exhaustive-deps
  const processo = useMemo(() => processoProp, [processoProp?.id, processoProp?.rotulo]); // eslint-disable-line react-hooks/exhaustive-deps
  const podeEditar = podeEditarFinanceiro(eu?.permissoes.financeiro);
  const [versao, setVersao] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [totais, setTotais] = useState<TotaisVinculo | null>(null);
  const [erroTotais, setErroTotais] = useState("");
  const [categorias, setCategorias] = useState<string[]>([]);
  const [novo, setNovo] = useState<TipoLancamento | null>(null);
  const [selecionado, setSelecionado] = useState<{ l: Lancamento; modo: ModoLancamento } | null>(null);

  const filtro = cliente ? `cliente_id=${encodeURIComponent(cliente.id)}` : `processo_id=${encodeURIComponent(processo?.id ?? "")}`;
  const parametros = useMemo(() => `${filtro}&ordem=vencimento_desc&pagina=${pagina}&por_pagina=${POR_PAGINA}`, [filtro, pagina]);
  const { lista, erro, recarregar } = useLancamentos(parametros, versao);

  const carregarTotais = useCallback(async () => {
    try {
      setTotais((await api<{ totais: TotaisVinculo }>("GET", `/api/financeiro/totais?${filtro}`)).totais);
      setErroTotais("");
    } catch (e) {
      setErroTotais(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  }, [filtro]);
  useEffect(() => {
    void carregarTotais();
    void carregarCategorias().then(setCategorias);
  }, [carregarTotais, versao]);

  const aoMudar = () => setVersao((v) => v + 1);
  const hoje = lista?.hoje ?? "";
  const botoesNovo =
    podeEditar && ativo ? (
      <>
        <Botao onClick={() => setNovo("receita")}>
          <Plus size={18} aria-hidden="true" />
          Nova receita
        </Botao>
        <Botao variante="secundario" onClick={() => setNovo("despesa")}>
          <Plus size={18} aria-hidden="true" />
          Nova despesa
        </Botao>
      </>
    ) : null;

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
            <small>{[l.tipo === "receita" ? "Receita" : "Despesa", l.categoria, textoDoGrupo(l)].filter(Boolean).join(" · ")}</small>
          </div>
        </div>
      ),
    },
    { chave: "valor", titulo: "Valor", numerica: true, nowrap: true, render: (l) => formatarReais(l.status === "pago" ? (l.valor_pago_centavos ?? l.valor_centavos) : l.valor_centavos) },
    { chave: "situacao", titulo: "Situação", render: (l) => <SeloLancamento l={l} hoje={hoje} /> },
    {
      chave: "acoes",
      titulo: "Ações",
      acoes: true,
      render: (l) => (
        <div className="acoes-linha">
          <Botao variante="secundario" tamanho="pequeno" onClick={() => setSelecionado({ l, modo: "detalhe" })}>
            Detalhes
          </Botao>
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: "grid", gap: "var(--e-4)" }}>
      <section aria-label="Totais do financeiro" className="grade grade-kpi kpi-fin">
        {totais ? (
          <>
            <Indicador rotulo="A receber em aberto" valor={formatarReais(totais.receita_aberta_centavos)} nota={`${totais.receita_aberta_qtd} em aberto · vencido ${formatarReais(totais.receita_vencida_centavos)}`} />
            <Indicador rotulo="Já recebido" valor={formatarReais(totais.receita_paga_centavos)} nota="receitas pagas" />
            <Indicador rotulo="A pagar em aberto" valor={formatarReais(totais.despesa_aberta_centavos)} nota={`${totais.despesa_aberta_qtd} em aberto · vencido ${formatarReais(totais.despesa_vencida_centavos)}`} />
            <Indicador rotulo="Já pago" valor={formatarReais(totais.despesa_paga_centavos)} nota="despesas pagas" />
          </>
        ) : erroTotais ? null : (
          [0, 1, 2, 3].map((i) => <EsqueletoKpi key={i} />)
        )}
      </section>
      {erroTotais && <EstadoErro acao={<Botao variante="secundario" onClick={() => void carregarTotais()}>Tentar de novo</Botao>}>{erroTotais}</EstadoErro>}
      <Cartao semPadding titulo="Lançamentos" subtitulo="Mais recentes primeiro. Cancelados não entram nos totais." acoes={botoesNovo}>
        {erro ? (
          <EstadoErro acao={<Botao variante="secundario" onClick={() => void recarregar()}>Tentar de novo</Botao>}>{erro}</EstadoErro>
        ) : lista === null ? (
          <div style={{ padding: "var(--e-4)" }}>
            <EsqueletoLinhas linhas={4} />
          </div>
        ) : lista.lancamentos.length === 0 ? (
          <EstadoVazio icone={Wallet} titulo="Nenhum lançamento ligado a este registro" {...(botoesNovo ? { acao: botoesNovo } : {})}>
            {podeEditar ? (ativo ? "Lance honorários, custas e outros valores para acompanhá-los aqui." : "Este registro está desativado: reative-o para lançar valores.") : "Ainda não há valores lançados."}
          </EstadoVazio>
        ) : (
          <>
            <Tabela colunas={colunas} linhas={lista.lancamentos} chaveLinha={(l) => l.id} legenda="Lançamentos financeiros" />
            <Paginacao total={lista.total} pagina={pagina} porPagina={POR_PAGINA} substantivo={["lançamento", "lançamentos"]} aoMudar={setPagina} />
          </>
        )}
      </Cartao>
      <LancamentoFormulario
        aberto={novo !== null}
        lancamento={null}
        tipoInicial={novo ?? "receita"}
        categorias={categorias}
        clienteInicial={cliente}
        processoInicial={processo}
        aoFechar={() => setNovo(null)}
        aoSalvar={() => {
          setNovo(null);
          setPagina(1);
          aoMudar();
        }}
      />
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
