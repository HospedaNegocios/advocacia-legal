import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSessao } from "../sessao";
import { Abas, Aviso, Botao, CabecalhoPagina, useToast } from "../ui";
import { carregarCategorias, podeEditarFinanceiro } from "./financeiro-comum";
import type { TipoLancamento } from "./financeiro-comum";
import { FinanceiroCaixa } from "./FinanceiroCaixa";
import { FinanceiroContas } from "./FinanceiroContas";
import { FinanceiroVisaoGeral } from "./FinanceiroVisaoGeral";
import { LancamentoFormulario } from "./LancamentoFormulario";

/** Financeiro: visão geral, contas a receber, contas a pagar e caixa. O acesso é conferido pelo servidor a cada requisição. */
export function Financeiro() {
  const { eu } = useSessao();
  const { avisar } = useToast();
  const podeEditar = podeEditarFinanceiro(eu?.permissoes.financeiro);
  const [versao, setVersao] = useState(0);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [novo, setNovo] = useState<TipoLancamento | null>(null);

  useEffect(() => {
    void carregarCategorias().then(setCategorias);
  }, [versao]);
  const aoMudar = useCallback(() => setVersao((v) => v + 1), []);

  const acoes = podeEditar ? (
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

  return (
    <>
      <CabecalhoPagina titulo="Financeiro" descricao="Honorários, contas a receber e a pagar e o caixa do escritório." migalhas={[{ rotulo: "Início", para: "/" }, { rotulo: "Financeiro" }]} acoes={acoes} />
      {!podeEditar && (
        <div style={{ marginBottom: "var(--e-4)" }}>
          <Aviso tipo="info">Você pode apenas consultar o financeiro. Para lançar ou alterar valores, peça a um sócio para liberar a edição.</Aviso>
        </div>
      )}
      <Abas
        abas={[
          { id: "geral", rotulo: "Visão geral", conteudo: <FinanceiroVisaoGeral versao={versao} /> },
          { id: "receber", rotulo: "Contas a receber", conteudo: <FinanceiroContas tipo="receita" versao={versao} categorias={categorias} aoNovo={setNovo} aoMudar={aoMudar} /> },
          { id: "pagar", rotulo: "Contas a pagar", conteudo: <FinanceiroContas tipo="despesa" versao={versao} categorias={categorias} aoNovo={setNovo} aoMudar={aoMudar} /> },
          { id: "caixa", rotulo: "Caixa", conteudo: <FinanceiroCaixa versao={versao} categorias={categorias} aoMudar={aoMudar} /> },
        ]}
      />
      <LancamentoFormulario
        aberto={novo !== null}
        lancamento={null}
        tipoInicial={novo ?? "receita"}
        categorias={categorias}
        aoFechar={() => setNovo(null)}
        aoSalvar={() => {
          setNovo(null);
          avisar("Lançamento criado.");
          aoMudar();
        }}
      />
    </>
  );
}
