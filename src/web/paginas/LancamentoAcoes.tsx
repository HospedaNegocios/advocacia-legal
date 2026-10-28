import { Ban, CircleCheck, Pencil, Receipt, RotateCcw, Trash2, Undo2 } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { ErroApi, api } from "../api";
import { centavosParaMoeda, mascaraMoeda, moedaParaCentavos } from "../mascaras";
import { navegar } from "../roteador";
import { useSessao } from "../sessao";
import { Aviso, Botao, Confirmar, Entrada, Formulario, Modal, useToast } from "../ui";
import { formatarDataCivil, formatarReais, podeEditarFinanceiro, rotuloProcesso, textoDoGrupo } from "./financeiro-comum";
import type { Lancamento } from "./financeiro-comum";
import { SeloLancamento } from "./financeiro-ui";
import { LancamentoFormulario } from "./LancamentoFormulario";

export type ModoLancamento = "detalhe" | "editar" | "pagar" | "estornar" | "cancelar" | "reabrir" | "apagar" | "cancelar_grupo";

interface Props {
  lancamento: Lancamento;
  modo: ModoLancamento;
  hoje: string;
  categorias: string[];
  aoEscolher: (modo: ModoLancamento) => void;
  aoFechar: () => void;
  /** Chamado depois de qualquer mudança que deu certo (a tela recarrega a lista e o resumo). */
  aoMudar: () => void;
}

const MENSAGENS = {
  estornar: { titulo: "Estornar pagamento", texto: "O lançamento volta para \"em aberto\" e o valor sai do caixa. Depois você pode registrar o pagamento de novo ou editar o lançamento.", botao: "Estornar", ok: "Pagamento estornado." },
  cancelar: { titulo: "Cancelar lançamento", texto: "O lançamento deixa de contar como valor a receber ou a pagar, mas continua guardado e pode ser reaberto.", botao: "Cancelar lançamento", ok: "Lançamento cancelado." },
  reabrir: { titulo: "Reabrir lançamento", texto: "O lançamento volta para \"em aberto\".", botao: "Reabrir", ok: "Lançamento reaberto." },
  cancelar_grupo: { titulo: "Cancelar parcelas em aberto", texto: "Todas as parcelas (ou ocorrências) deste grupo que ainda estão em aberto, inclusive esta, serão canceladas. As que já foram pagas ou recebidas não mudam. Cada uma pode ser reaberta depois, individualmente.", botao: "Cancelar parcelas em aberto", ok: "Parcelas em aberto canceladas." },
  apagar: { titulo: "Apagar lançamento", texto: "O lançamento será apagado para sempre. Esta ação não pode ser desfeita. Só o sócio pode apagar, e a exclusão fica registrada.", botao: "Apagar para sempre", ok: "Lançamento apagado." },
} as const;

/** Janelas de um lançamento: detalhes, edição, registrar pagamento e confirmações (estornar, cancelar, reabrir, apagar). */
export function LancamentoAcoes({ lancamento: l, modo, hoje, categorias, aoEscolher, aoFechar, aoMudar }: Props) {
  const { avisar } = useToast();
  const [executando, setExecutando] = useState(false);

  const executar = async (metodo: string, caminho: string, mensagem: string) => {
    setExecutando(true);
    try {
      await api(metodo, caminho);
      avisar(mensagem);
      aoMudar();
    } catch (e) {
      avisar(e instanceof ErroApi ? e.message : "Algo deu errado.", "erro");
    } finally {
      setExecutando(false);
    }
  };

  if (modo === "detalhe") return <Detalhe l={l} hoje={hoje} aoEscolher={aoEscolher} aoFechar={aoFechar} />;
  if (modo === "editar") {
    return (
      <LancamentoFormulario
        aberto
        lancamento={l}
        tipoInicial={l.tipo}
        categorias={categorias}
        aoFechar={aoFechar}
        aoSalvar={() => {
          avisar("Lançamento atualizado.");
          aoMudar();
        }}
      />
    );
  }
  if (modo === "pagar") {
    return (
      <PagamentoModal
        l={l}
        hoje={hoje}
        aoFechar={aoFechar}
        aoPagar={() => {
          avisar(l.tipo === "receita" ? "Recebimento registrado." : "Pagamento registrado.");
          aoMudar();
        }}
      />
    );
  }
  const m = MENSAGENS[modo];
  const caminho = modo === "apagar" ? `/api/financeiro/${l.id}` : modo === "cancelar_grupo" ? `/api/financeiro/grupos/${l.grupo_id}/cancelar-abertas` : `/api/financeiro/${l.id}/${modo}`;
  return (
    <Confirmar aberto titulo={m.titulo} rotuloConfirmar={m.botao} perigo={modo === "apagar" || modo === "cancelar" || modo === "cancelar_grupo"} carregando={executando} aoFechar={aoFechar} aoConfirmar={() => void executar(modo === "apagar" ? "DELETE" : "POST", caminho, m.ok)}>
      {m.texto}
    </Confirmar>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="detalhe-linha">
      <dt>{rotulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Detalhe({ l, hoje, aoEscolher, aoFechar }: { l: Lancamento; hoje: string; aoEscolher: (m: ModoLancamento) => void; aoFechar: () => void }) {
  const { eu } = useSessao();
  const podeEditar = podeEditarFinanceiro(eu?.permissoes.financeiro);
  const ehSocio = eu?.usuario.perfil === "socio";
  const receita = l.tipo === "receita";
  return (
    <Modal aberto aoFechar={aoFechar} titulo={receita ? "Receita" : "Despesa"} descricao={l.descricao}>
      <dl className="detalhe-lista">
        <Linha rotulo="Situação">
          <SeloLancamento l={l} hoje={hoje} />
        </Linha>
        <Linha rotulo="Valor">{formatarReais(l.valor_centavos)}</Linha>
        <Linha rotulo="Vencimento">{formatarDataCivil(l.vencimento)}</Linha>
        {textoDoGrupo(l) && <Linha rotulo="Parcelamento">{textoDoGrupo(l)}</Linha>}
        {l.status === "pago" && (
          <>
            <Linha rotulo={receita ? "Recebido em" : "Pago em"}>{formatarDataCivil(l.pago_em)}</Linha>
            <Linha rotulo={receita ? "Valor recebido" : "Valor pago"}>
              {formatarReais(l.valor_pago_centavos ?? 0)}
              {l.valor_pago_centavos !== l.valor_centavos && <small className="texto-pequeno"> (previsto {formatarReais(l.valor_centavos)})</small>}
            </Linha>
          </>
        )}
        {l.categoria && <Linha rotulo="Categoria">{l.categoria}</Linha>}
        {l.cliente_nome && <Linha rotulo="Cliente">{l.cliente_nome}</Linha>}
        {l.processo_numero && <Linha rotulo="Processo">{rotuloProcesso(l.processo_numero)}</Linha>}
        {l.observacoes && <Linha rotulo="Observações">{l.observacoes}</Linha>}
      </dl>
      {l.status !== "aberto" && podeEditar && <Aviso tipo="info">{l.status === "pago" ? "Lançamento pago não pode ser editado. Estorne o pagamento para alterá-lo." : "Lançamento cancelado não pode ser editado. Reabra-o para alterá-lo."}</Aviso>}
      <div className="modal-rodape">
        {podeEditar && l.status === "aberto" && (
          <>
            <Botao variante="secundario" onClick={() => aoEscolher("cancelar")}>
              <Ban size={16} aria-hidden="true" />
              Cancelar lançamento
            </Botao>
            <Botao variante="secundario" onClick={() => aoEscolher("editar")}>
              <Pencil size={16} aria-hidden="true" />
              Editar
            </Botao>
            <Botao onClick={() => aoEscolher("pagar")}>
              <CircleCheck size={16} aria-hidden="true" />
              {receita ? "Registrar recebimento" : "Registrar pagamento"}
            </Botao>
          </>
        )}
        {podeEditar && l.status === "aberto" && l.grupo_id && (
          <Botao variante="secundario" onClick={() => aoEscolher("cancelar_grupo")}>
            <Ban size={16} aria-hidden="true" />
            Cancelar parcelas em aberto
          </Botao>
        )}
        {receita && l.status === "pago" && (
          <Botao variante="secundario" leitura onClick={() => navegar(`/financeiro/${l.id}/recibo`)}>
            <Receipt size={16} aria-hidden="true" />
            Emitir recibo
          </Botao>
        )}
        {podeEditar && l.status === "pago" && (
          <Botao variante="secundario" onClick={() => aoEscolher("estornar")}>
            <Undo2 size={16} aria-hidden="true" />
            Estornar pagamento
          </Botao>
        )}
        {podeEditar && l.status === "cancelado" && (
          <Botao variante="secundario" onClick={() => aoEscolher("reabrir")}>
            <RotateCcw size={16} aria-hidden="true" />
            Reabrir
          </Botao>
        )}
        {ehSocio && (
          <Botao variante="perigo" onClick={() => aoEscolher("apagar")}>
            <Trash2 size={16} aria-hidden="true" />
            Apagar
          </Botao>
        )}
        <Botao variante="fantasma" onClick={aoFechar}>
          Fechar
        </Botao>
      </div>
    </Modal>
  );
}

function PagamentoModal({ l, hoje, aoFechar, aoPagar }: { l: Lancamento; hoje: string; aoFechar: () => void; aoPagar: () => void }) {
  const receita = l.tipo === "receita";
  const [data, setData] = useState(hoje);
  const [valor, setValor] = useState(centavosParaMoeda(l.valor_centavos));
  const [erro, setErro] = useState("");
  const [tentou, setTentou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const centavos = moedaParaCentavos(valor);
  const erros = {
    data: !data ? "Informe a data." : data > hoje ? "A data não pode ser no futuro." : undefined,
    valor: centavos === null || centavos <= 0 ? "Informe um valor maior que zero." : undefined,
  };
  const salvar = async () => {
    setTentou(true);
    setErro("");
    if (Object.values(erros).some(Boolean)) return;
    setSalvando(true);
    try {
      await api("POST", `/api/financeiro/${l.id}/pagar`, { pago_em: data, valor_pago_centavos: centavos });
      aoPagar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    } finally {
      setSalvando(false);
    }
  };
  return (
    <Modal aberto aoFechar={aoFechar} titulo={receita ? "Registrar recebimento" : "Registrar pagamento"} descricao={`${l.descricao} · previsto ${formatarReais(l.valor_centavos)}`}>
      <Formulario aoEnviar={() => void salvar()}>
        <div className="grade grade-2">
          <Entrada rotulo={receita ? "Data do recebimento" : "Data do pagamento"} type="date" required max={hoje} erro={tentou ? erros.data : undefined} value={data} onChange={(e) => setData(e.target.value)} />
          <Entrada rotulo={receita ? "Valor recebido (R$)" : "Valor pago (R$)"} inputMode="numeric" autoComplete="off" required ajuda="Pode ser diferente do previsto." erro={tentou ? erros.valor : undefined} value={valor} onChange={(e) => setValor(mascaraMoeda(e.target.value))} />
        </div>
        {erro && <Aviso>{erro}</Aviso>}
        <div className="modal-rodape">
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" carregando={salvando}>
            Confirmar
          </Botao>
        </div>
      </Formulario>
    </Modal>
  );
}
