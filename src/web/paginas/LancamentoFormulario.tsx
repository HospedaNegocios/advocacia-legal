import { useEffect, useState } from "react";
import { ErroApi, api } from "../api";
import { DESCRICAO_MAXIMA_GRUPO, PARCELAS_MAXIMO, PARCELAS_MINIMO, dividirEmParcelas, somarMeses } from "../../comum/parcelas";
import { centavosParaMoeda, mascaraMoeda, moedaParaCentavos } from "../mascaras";
import { AreaTexto, Aviso, Botao, Entrada, Formulario, Modal, Selecao, SeletorBusca } from "../ui";
import type { OpcaoBusca } from "../ui";
import { buscarClientes, buscarProcessos } from "./buscas";
import { formatarDataCivil, formatarReais, rotuloProcesso } from "./financeiro-comum";
import type { Lancamento, TipoLancamento } from "./financeiro-comum";

interface Campos {
  tipo: TipoLancamento;
  descricao: string;
  valor: string;
  vencimento: string;
  categoria: string;
  cliente_id: string | null;
  cliente_rotulo: string;
  processo_id: string | null;
  processo_rotulo: string;
  observacoes: string;
  /** Só em lançamento novo: uma vez, parcelar o valor total ou repetir o mesmo valor todo mês. */
  repeticao: "unico" | "parcelas" | "repetir";
  quantidade: string;
}

const VALOR_MAXIMO_CENTAVOS = 99_999_999_999;

/**
 * Lançamento novo ou em edição (só enquanto está em aberto), em janela.
 * Honorário é uma receita ligada a um cliente e/ou processo; a categoria é texto livre (sugere as já usadas).
 */
export function LancamentoFormulario({ aberto, lancamento, tipoInicial, categorias, clienteInicial, processoInicial, aoFechar, aoSalvar }: { aberto: boolean; lancamento: Lancamento | null; tipoInicial: TipoLancamento; categorias: string[]; clienteInicial?: OpcaoBusca | undefined; processoInicial?: OpcaoBusca | undefined; aoFechar: () => void; aoSalvar: (l: Lancamento) => void }) {
  const [f, setF] = useState<Campos>({ tipo: tipoInicial, descricao: "", valor: "", vencimento: "", categoria: "", cliente_id: null, cliente_rotulo: "", processo_id: null, processo_rotulo: "", observacoes: "", repeticao: "unico", quantidade: "2" });
  const [erro, setErro] = useState("");
  const [tentou, setTentou] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setF({
      tipo: lancamento?.tipo ?? tipoInicial,
      descricao: lancamento?.descricao ?? "",
      valor: lancamento ? centavosParaMoeda(lancamento.valor_centavos) : "",
      vencimento: lancamento?.vencimento ?? "",
      categoria: lancamento?.categoria ?? "",
      cliente_id: lancamento ? lancamento.cliente_id : (clienteInicial?.id ?? null),
      cliente_rotulo: lancamento ? (lancamento.cliente_nome ?? "") : (clienteInicial?.rotulo ?? ""),
      processo_id: lancamento ? lancamento.processo_id : (processoInicial?.id ?? null),
      processo_rotulo: lancamento ? rotuloProcesso(lancamento.processo_numero ?? null) : (processoInicial?.rotulo ?? ""),
      observacoes: lancamento?.observacoes ?? "",
      repeticao: "unico",
      quantidade: "2",
    });
    setErro("");
    setTentou(false);
  }, [aberto, lancamento, tipoInicial, clienteInicial, processoInicial]);

  const centavos = moedaParaCentavos(f.valor);
  const quantidade = /^\d+$/.test(f.quantidade) ? Number(f.quantidade) : NaN;
  const agrupado = !lancamento && f.repeticao !== "unico";
  const erros = {
    quantidade: !agrupado ? undefined : !Number.isInteger(quantidade) || quantidade < PARCELAS_MINIMO || quantidade > PARCELAS_MAXIMO ? `Informe de ${PARCELAS_MINIMO} a ${PARCELAS_MAXIMO}.` : f.repeticao === "parcelas" && centavos !== null && centavos < quantidade ? "O valor total é pequeno demais para essa quantidade de parcelas." : undefined,
    descricao: !f.descricao.trim() ? "Informe a descrição." : agrupado && f.descricao.trim().length > DESCRICAO_MAXIMA_GRUPO ? `Com parcelas ou repetição, use no máximo ${DESCRICAO_MAXIMA_GRUPO} caracteres (o sistema acrescenta o número, como "(1/12)").` : undefined,
    valor: centavos === null || centavos <= 0 ? "Informe um valor maior que zero." : centavos > VALOR_MAXIMO_CENTAVOS ? "Valor alto demais. O máximo é R$ 999.999.999,99." : undefined,
    vencimento: f.vencimento ? undefined : "Informe a data de vencimento.",
  };
  const mostrar = (k: keyof typeof erros) => (tentou ? erros[k] : undefined);

  const salvar = async () => {
    setTentou(true);
    setErro("");
    if (Object.values(erros).some(Boolean)) return;
    setSalvando(true);
    try {
      const repetir = agrupado ? (f.repeticao === "parcelas" ? { parcelas: quantidade } : { repetir_meses: quantidade }) : {};
      const corpo = { tipo: f.tipo, descricao: f.descricao, valor_centavos: centavos, vencimento: f.vencimento, categoria: f.categoria || null, cliente_id: f.cliente_id, processo_id: f.processo_id, observacoes: f.observacoes || null, ...repetir };
      const r = lancamento ? await api<{ lancamento: Lancamento }>("PUT", `/api/financeiro/${lancamento.id}`, corpo) : await api<{ lancamento: Lancamento }>("POST", "/api/financeiro", corpo);
      aoSalvar(r.lancamento);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    } finally {
      setSalvando(false);
    }
  };

  const receita = f.tipo === "receita";
  const previa = agrupado ? resumoDoGrupo(f.repeticao, centavos, f.vencimento, quantidade) : "";
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={lancamento ? "Editar lançamento" : receita ? "Nova receita" : "Nova despesa"} descricao="Honorários são receitas: ligue a receita ao cliente e, se quiser, ao processo.">
      <Formulario aoEnviar={() => void salvar()}>
        <Selecao rotulo="Tipo" value={f.tipo} disabled={lancamento !== null} ajuda={lancamento ? "O tipo não muda depois de criado." : ""} onChange={(e) => setF({ ...f, tipo: e.target.value as TipoLancamento })}>
          <option value="receita">Receita (a receber)</option>
          <option value="despesa">Despesa (a pagar)</option>
        </Selecao>
        <Entrada rotulo="Descrição" required maxLength={200} autoComplete="off" placeholder={receita ? "Ex.: Honorários da ação de cobrança" : "Ex.: Custas do processo"} erro={mostrar("descricao")} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
        <div className="grade grade-2">
          <Entrada rotulo={f.repeticao === "parcelas" && !lancamento ? "Valor total (R$)" : f.repeticao === "repetir" && !lancamento ? "Valor de cada mês (R$)" : "Valor (R$)"} required inputMode="numeric" autoComplete="off" placeholder="0,00" erro={mostrar("valor")} value={f.valor} onChange={(e) => setF({ ...f, valor: mascaraMoeda(e.target.value) })} />
          <Entrada rotulo={agrupado ? "Primeiro vencimento" : "Vencimento"} type="date" required erro={mostrar("vencimento")} value={f.vencimento} onChange={(e) => setF({ ...f, vencimento: e.target.value })} />
        </div>
        {!lancamento && (
          <>
            <Selecao rotulo="Como lançar" value={f.repeticao} ajuda="Parcelas e repetições viram lançamentos separados: pagar ou editar um não muda os outros." onChange={(e) => setF({ ...f, repeticao: e.target.value as Campos["repeticao"] })}>
              <option value="unico">Uma vez só</option>
              <option value="parcelas">Parcelar o valor em várias vezes</option>
              <option value="repetir">Repetir o mesmo valor todo mês</option>
            </Selecao>
            {agrupado && (
              <>
                <Entrada rotulo={f.repeticao === "parcelas" ? "Número de parcelas" : "Repetir por quantos meses"} type="number" inputMode="numeric" min={PARCELAS_MINIMO} max={PARCELAS_MAXIMO} step={1} required autoComplete="off" ajuda={`De ${PARCELAS_MINIMO} a ${PARCELAS_MAXIMO}. O primeiro vencimento é a data acima; os próximos vencem no mesmo dia dos meses seguintes (mês mais curto: último dia do mês).`} erro={mostrar("quantidade")} value={f.quantidade} onChange={(e) => setF({ ...f, quantidade: e.target.value })} />
                {previa && <Aviso tipo="info">{previa}</Aviso>}
              </>
            )}
          </>
        )}
        <Entrada rotulo="Categoria (opcional)" maxLength={60} autoComplete="off" list="categorias-financeiro" ajuda={categorias.length ? "Escolha uma já usada ou digite uma nova." : "Texto livre. Ex.: Honorário contratual."} value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} />
        <datalist id="categorias-financeiro">
          {categorias.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <SeletorBusca rotulo="Cliente (opcional)" valor={f.cliente_id} rotuloAtual={f.cliente_rotulo} buscar={buscarClientes} vazio="Nenhum cliente ativo encontrado." aoMudar={(o) => setF({ ...f, cliente_id: o?.id ?? null, cliente_rotulo: o?.rotulo ?? "" })} />
        <SeletorBusca rotulo="Processo (opcional)" valor={f.processo_id} rotuloAtual={f.processo_rotulo} buscar={buscarProcessos} vazio="Nenhum processo ativo encontrado." ajuda="Busque pelo número ou pelo nome de uma parte." aoMudar={(o) => setF({ ...f, processo_id: o?.id ?? null, processo_rotulo: o?.rotulo ?? "" })} />
        <AreaTexto rotulo="Observações (opcional)" maxLength={2000} rows={3} value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} />
        {erro && <Aviso>{erro}</Aviso>}
        <div className="modal-rodape">
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" carregando={salvando}>
            Salvar lançamento
          </Botao>
        </div>
      </Formulario>
    </Modal>
  );
}

/** Prévia do que será criado (a mesma conta do servidor: `dividirEmParcelas` e `somarMeses`). */
function resumoDoGrupo(repeticao: "parcelas" | "repetir" | "unico", centavos: number | null, primeiro: string, n: number): string {
  if (centavos === null || centavos <= 0 || !primeiro || !Number.isInteger(n) || n < PARCELAS_MINIMO || n > PARCELAS_MAXIMO) return "";
  const ultimo = formatarDataCivil(somarMeses(primeiro, n - 1));
  const periodo = `de ${formatarDataCivil(primeiro)} a ${ultimo}`;
  if (repeticao === "repetir") return `${n} lançamentos de ${formatarReais(centavos)}, um por mês, ${periodo}. Total: ${formatarReais(centavos * n)}.`;
  if (centavos < n) return "";
  const p = dividirEmParcelas(centavos, n);
  const base = p[0] as number;
  const ultima = p[n - 1] as number;
  const valores = ultima === base ? `${n} parcelas de ${formatarReais(base)}` : `${n - 1} parcelas de ${formatarReais(base)} e a última de ${formatarReais(ultima)}`;
  return `${valores}, ${periodo}. Total: ${formatarReais(centavos)}.`;
}
