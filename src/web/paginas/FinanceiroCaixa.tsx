import { ArrowDownToLine, ArrowUpFromLine, Landmark, Scale, Search, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ErroApi, api } from "../api";
import { hojeEm } from "../../comum/fuso";
import { primeiroDiaDoMes, ultimoDiaDoMes } from "../../comum/periodo";
import { Botao, Cartao, Entrada, EsqueletoKpi, EsqueletoLinhas, EstadoErro, EstadoVazio, Indicador, Selo, Tabela } from "../ui";
import type { Coluna } from "../ui";
import { formatarDataCivil, formatarReais } from "./financeiro-comum";
import type { Lancamento, RespostaResumo } from "./financeiro-comum";
import { Paginacao, useLancamentos } from "./financeiro-ui";
import { LancamentoAcoes } from "./LancamentoAcoes";
import type { ModoLancamento } from "./LancamentoAcoes";

const POR_PAGINA = 20;

/** Aba "Caixa": movimentações já pagas (entradas e saídas) em um período, com o saldo do período e o acumulado. */
export function FinanceiroCaixa({ versao, categorias, aoMudar }: { versao: number; categorias: string[]; aoMudar: () => void }) {
  const [de, setDe] = useState(() => primeiroDiaDoMes(hojeEm()));
  const [ate, setAte] = useState(() => ultimoDiaDoMes(hojeEm()));
  const [pagina, setPagina] = useState(1);
  const [resumo, setResumo] = useState<RespostaResumo | null>(null);
  const [erroResumo, setErroResumo] = useState("");
  const [selecionado, setSelecionado] = useState<{ l: Lancamento; modo: ModoLancamento } | null>(null);

  const periodoValido = de !== "" && ate !== "" && de <= ate;
  const parametros = useMemo(() => new URLSearchParams({ status: "pago", ordem: "pago_em_desc", pago_de: de, pago_ate: ate, pagina: String(pagina), por_pagina: String(POR_PAGINA) }).toString(), [de, ate, pagina]);
  const { lista, erro, recarregar } = useLancamentos(periodoValido ? parametros : null, versao);

  const carregarResumo = useCallback(async () => {
    if (!periodoValido) return;
    try {
      setResumo(await api<RespostaResumo>("GET", `/api/financeiro/resumo?de=${de}&ate=${ate}`));
      setErroResumo("");
    } catch (e) {
      setErroResumo(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  }, [de, ate, periodoValido]);
  useEffect(() => {
    void carregarResumo();
  }, [carregarResumo, versao]);

  const escolher = (a: string, b: string) => {
    setDe(a);
    setAte(b);
    setPagina(1);
  };
  const mesAnterior = () => {
    const [ano, mes] = hojeEm().split("-").map(Number) as [number, number];
    const ref = new Date(Date.UTC(ano, mes - 2, 1)).toISOString().slice(0, 10);
    escolher(primeiroDiaDoMes(ref), ultimoDiaDoMes(ref));
  };

  const hoje = lista?.hoje ?? resumo?.hoje ?? "";
  const r = resumo?.resumo;
  const colunas: Coluna<Lancamento>[] = [
    { chave: "data", titulo: "Data", nowrap: true, render: (l) => formatarDataCivil(l.pago_em) },
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
      chave: "movimento",
      titulo: "Movimento",
      render: (l) =>
        l.tipo === "receita" ? (
          <Selo tom="bom" icone={ArrowDownToLine}>
            Entrada
          </Selo>
        ) : (
          <Selo icone={ArrowUpFromLine}>Saída</Selo>
        ),
    },
    {
      chave: "valor",
      titulo: "Valor",
      numerica: true,
      nowrap: true,
      render: (l) => (
        <>
          <span>
            {l.tipo === "receita" ? "+ " : "− "}
            {formatarReais(l.valor_pago_centavos ?? 0)}
          </span>
          {l.valor_pago_centavos !== l.valor_centavos && <small className="texto-pequeno" style={{ display: "block" }}>Previsto: {formatarReais(l.valor_centavos)}</small>}
        </>
      ),
    },
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
      <Cartao semPadding titulo="Período" subtitulo="O caixa mostra só o que já foi pago ou recebido, pela data do pagamento.">
        <div className="barra-filtros barra-filtros-caixa">
          <Entrada rotulo="De" type="date" value={de} erro={de && ate && de > ate ? "O início não pode ser depois do fim." : undefined} onChange={(e) => escolher(e.target.value, ate)} />
          <Entrada rotulo="Até" type="date" value={ate} onChange={(e) => escolher(de, e.target.value)} />
          <div className="filtro-atalhos">
            <Botao variante="secundario" onClick={() => escolher(primeiroDiaDoMes(hojeEm()), ultimoDiaDoMes(hojeEm()))}>
              Este mês
            </Botao>
            <Botao variante="secundario" onClick={mesAnterior}>
              Mês anterior
            </Botao>
          </div>
        </div>
      </Cartao>
      <section aria-label="Resumo do caixa" className="grade grade-kpi kpi-fin">
        {r ? (
          <>
            <Indicador rotulo="Entradas" valor={formatarReais(r.recebido_periodo_centavos)} icone={ArrowDownToLine} nota="recebido no período" />
            <Indicador rotulo="Saídas" valor={formatarReais(r.pago_periodo_centavos)} icone={ArrowUpFromLine} nota="pago no período" />
            <Indicador rotulo="Saldo do período" valor={formatarReais(r.saldo_periodo_centavos)} icone={Scale} nota={r.saldo_periodo_centavos < 0 ? "Saídas maiores que entradas" : "Entradas menos saídas"} />
            <Indicador rotulo="Saldo acumulado" valor={formatarReais(r.saldo_acumulado_centavos)} icone={Landmark} nota={`até ${formatarDataCivil(ate)}`} />
          </>
        ) : erroResumo ? null : (
          [0, 1, 2, 3].map((i) => <EsqueletoKpi key={i} />)
        )}
      </section>
      {erroResumo && <EstadoErro acao={<Botao variante="secundario" onClick={() => void carregarResumo()}>Tentar de novo</Botao>}>{erroResumo}</EstadoErro>}
      <Cartao semPadding titulo="Movimentações" subtitulo="Mais recentes primeiro.">
        {!periodoValido ? (
          <EstadoVazio icone={Search} titulo="Escolha um período">
            Informe a data inicial e a data final, com o início antes do fim.
          </EstadoVazio>
        ) : erro ? (
          <EstadoErro acao={<Botao variante="secundario" onClick={() => void recarregar()}>Tentar de novo</Botao>}>{erro}</EstadoErro>
        ) : lista === null ? (
          <div style={{ padding: "var(--e-4)" }}>
            <EsqueletoLinhas linhas={5} />
          </div>
        ) : lista.lancamentos.length === 0 ? (
          <EstadoVazio icone={Wallet} titulo="Nenhuma movimentação neste período">
            Recebimentos e pagamentos registrados entre {formatarDataCivil(de)} e {formatarDataCivil(ate)} aparecem aqui.
          </EstadoVazio>
        ) : (
          <>
            <Tabela colunas={colunas} linhas={lista.lancamentos} chaveLinha={(l) => l.id} legenda="Movimentações do caixa" />
            <Paginacao total={lista.total} pagina={pagina} porPagina={POR_PAGINA} substantivo={["movimentação", "movimentações"]} aoMudar={setPagina} />
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
