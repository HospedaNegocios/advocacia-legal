import { ArrowDownToLine, ArrowUpFromLine, Landmark, Scale, TriangleAlert, Wallet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ErroApi, api } from "../api";
import { Botao, BarrasAgrupadas, Cartao, EsqueletoKpi, EstadoErro, EstadoVazio, Indicador, Selo } from "../ui";
import { formatarReais, mesCurto, mesPorExtenso } from "./financeiro-comum";
import type { RespostaResumo } from "./financeiro-comum";

const qtd = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Aba "Visão geral": indicadores do mês e gráfico recebido × pago dos últimos 6 meses. */
export function FinanceiroVisaoGeral({ versao }: { versao: number }) {
  const [dados, setDados] = useState<RespostaResumo | null>(null);
  const [erro, setErro] = useState("");
  const carregar = useCallback(async () => {
    try {
      setDados(await api<RespostaResumo>("GET", "/api/financeiro/resumo"));
      setErro("");
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar, versao]);

  if (erro) return <EstadoErro acao={<Botao variante="secundario" onClick={() => void carregar()}>Tentar de novo</Botao>}>{erro}</EstadoErro>;
  if (!dados) {
    return (
      <section aria-label="Carregando indicadores" className="grade grade-kpi kpi-fin kpi-fin-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <EsqueletoKpi key={i} />
        ))}
      </section>
    );
  }
  const { resumo: r, serie_mensal: serie } = dados;
  const mesAtual = mesPorExtenso(dados.periodo.de.slice(0, 7));
  const temMovimento = serie.some((p) => p.recebido_centavos > 0 || p.pago_centavos > 0);
  const saldoNegativo = r.saldo_periodo_centavos < 0;

  return (
    <div style={{ display: "grid", gap: "var(--e-4)" }}>
      <section aria-label="Indicadores do financeiro" className="grade grade-kpi kpi-fin kpi-fin-3">
        <Indicador rotulo="A receber" valor={formatarReais(r.a_receber_centavos)} icone={ArrowDownToLine} nota={qtd(r.a_receber_qtd, "lançamento em aberto", "lançamentos em aberto")} />
        <Indicador rotulo="Vencido a receber" valor={formatarReais(r.vencido_receber_centavos)} icone={TriangleAlert} nota={r.vencido_receber_qtd === 0 ? "Nada em atraso" : undefined}>
          {r.vencido_receber_qtd > 0 && (
            <div style={{ marginTop: "var(--e-2)" }}>
              <Selo tom="critico" icone={TriangleAlert}>
                {`${r.vencido_receber_qtd} em atraso`}
              </Selo>
            </div>
          )}
        </Indicador>
        <Indicador rotulo="Recebido no mês" valor={formatarReais(r.recebido_periodo_centavos)} icone={Wallet} nota={mesAtual} />
        <Indicador rotulo="Saldo de caixa do mês" valor={formatarReais(r.saldo_periodo_centavos)} icone={Scale} nota={saldoNegativo ? "Saídas maiores que entradas" : `Acumulado: ${formatarReais(r.saldo_acumulado_centavos)}`} />
        <Indicador rotulo="A pagar" valor={formatarReais(r.a_pagar_centavos)} icone={ArrowUpFromLine} nota={r.vencido_pagar_qtd > 0 ? `${formatarReais(r.vencido_pagar_centavos)} vencido (${qtd(r.vencido_pagar_qtd, "lançamento", "lançamentos")})` : qtd(r.a_pagar_qtd, "lançamento em aberto", "lançamentos em aberto")} />
        <Indicador rotulo="Pago no mês" valor={formatarReais(r.pago_periodo_centavos)} icone={Landmark} nota={mesAtual} />
      </section>
      <Cartao>
        {temMovimento ? (
          <BarrasAgrupadas
            titulo="Recebido e pago nos últimos 6 meses"
            subtitulo="Pelo dia em que o dinheiro entrou ou saiu do caixa. Valores em reais."
            nomeCategoria="Mês"
            categorias={serie.map((p) => ({ chave: p.mes, rotulo: mesCurto(p.mes) }))}
            series={[
              { chave: "recebido", nome: "Recebido", cor: "var(--serie-1)", valores: serie.map((p) => p.recebido_centavos) },
              { chave: "pago", nome: "Pago", cor: "var(--serie-2)", valores: serie.map((p) => p.pago_centavos) },
            ]}
            formatar={formatarReais}
            formatarEixoY={(v) => (v === 0 ? "0" : new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(v / 100))}
          />
        ) : (
          <EstadoVazio compacto icone={Wallet} titulo="Nenhum recebimento ou pagamento nos últimos 6 meses">
            Quando você registrar recebimentos e pagamentos, o gráfico aparece aqui.
          </EstadoVazio>
        )}
      </Cartao>
    </div>
  );
}
