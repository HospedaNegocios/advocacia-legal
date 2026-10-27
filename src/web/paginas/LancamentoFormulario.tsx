import { useEffect, useState } from "react";
import { ErroApi, api } from "../api";
import { centavosParaMoeda, mascaraMoeda, moedaParaCentavos } from "../mascaras";
import { AreaTexto, Aviso, Botao, Entrada, Formulario, Modal, Selecao, SeletorBusca } from "../ui";
import { buscarClientes, buscarProcessos } from "./buscas";
import { rotuloProcesso } from "./financeiro-comum";
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
}

const VALOR_MAXIMO_CENTAVOS = 99_999_999_999;

/**
 * Lançamento novo ou em edição (só enquanto está em aberto), em janela.
 * Honorário é uma receita ligada a um cliente e/ou processo; a categoria é texto livre (sugere as já usadas).
 */
export function LancamentoFormulario({ aberto, lancamento, tipoInicial, categorias, aoFechar, aoSalvar }: { aberto: boolean; lancamento: Lancamento | null; tipoInicial: TipoLancamento; categorias: string[]; aoFechar: () => void; aoSalvar: (l: Lancamento) => void }) {
  const [f, setF] = useState<Campos>({ tipo: tipoInicial, descricao: "", valor: "", vencimento: "", categoria: "", cliente_id: null, cliente_rotulo: "", processo_id: null, processo_rotulo: "", observacoes: "" });
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
      cliente_id: lancamento?.cliente_id ?? null,
      cliente_rotulo: lancamento?.cliente_nome ?? "",
      processo_id: lancamento?.processo_id ?? null,
      processo_rotulo: rotuloProcesso(lancamento?.processo_numero ?? null),
      observacoes: lancamento?.observacoes ?? "",
    });
    setErro("");
    setTentou(false);
  }, [aberto, lancamento, tipoInicial]);

  const centavos = moedaParaCentavos(f.valor);
  const erros = {
    descricao: f.descricao.trim() ? undefined : "Informe a descrição.",
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
      const corpo = { tipo: f.tipo, descricao: f.descricao, valor_centavos: centavos, vencimento: f.vencimento, categoria: f.categoria || null, cliente_id: f.cliente_id, processo_id: f.processo_id, observacoes: f.observacoes || null };
      const r = lancamento ? await api<{ lancamento: Lancamento }>("PUT", `/api/financeiro/${lancamento.id}`, corpo) : await api<{ lancamento: Lancamento }>("POST", "/api/financeiro", corpo);
      aoSalvar(r.lancamento);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    } finally {
      setSalvando(false);
    }
  };

  const receita = f.tipo === "receita";
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={lancamento ? "Editar lançamento" : receita ? "Nova receita" : "Nova despesa"} descricao="Honorários são receitas: ligue a receita ao cliente e, se quiser, ao processo.">
      <Formulario aoEnviar={() => void salvar()}>
        <Selecao rotulo="Tipo" value={f.tipo} disabled={lancamento !== null} ajuda={lancamento ? "O tipo não muda depois de criado." : ""} onChange={(e) => setF({ ...f, tipo: e.target.value as TipoLancamento })}>
          <option value="receita">Receita (a receber)</option>
          <option value="despesa">Despesa (a pagar)</option>
        </Selecao>
        <Entrada rotulo="Descrição" required maxLength={200} autoComplete="off" placeholder={receita ? "Ex.: Honorários da ação de cobrança" : "Ex.: Custas do processo"} erro={mostrar("descricao")} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
        <div className="grade grade-2">
          <Entrada rotulo="Valor (R$)" required inputMode="numeric" autoComplete="off" placeholder="0,00" erro={mostrar("valor")} value={f.valor} onChange={(e) => setF({ ...f, valor: mascaraMoeda(e.target.value) })} />
          <Entrada rotulo="Vencimento" type="date" required erro={mostrar("vencimento")} value={f.vencimento} onChange={(e) => setF({ ...f, vencimento: e.target.value })} />
        </div>
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
