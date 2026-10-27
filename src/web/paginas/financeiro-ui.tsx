import { Ban, CircleCheck, CircleDot, Clock, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ErroApi, api } from "../api";
import { Botao, Selo } from "../ui";
import { textoAtraso } from "./financeiro-comum";
import type { Lancamento, RespostaLista } from "./financeiro-comum";

/** Situação do lançamento: sempre ícone + texto (vencido nunca é só cor). */
export function SeloLancamento({ l, hoje }: { l: Lancamento; hoje: string }) {
  if (l.status === "cancelado") return <Selo icone={Ban}>Cancelado</Selo>;
  if (l.status === "pago") return <Selo tom="bom" icone={CircleCheck}>{l.tipo === "receita" ? "Recebido" : "Pago"}</Selo>;
  if (l.vencido) return <Selo tom="critico" icone={TriangleAlert}>{textoAtraso(l.dias_atraso)}</Selo>;
  if (l.vencimento === hoje) return <Selo tom="aviso" icone={Clock}>Vence hoje</Selo>;
  return <Selo tom="info" icone={CircleDot}>Em aberto</Selo>;
}

/** Carrega a lista da API; recarrega quando os parâmetros ou a `versao` mudam. */
export function useLancamentos(parametros: string | null, versao: number) {
  const [lista, setLista] = useState<RespostaLista | null>(null);
  const [erro, setErro] = useState("");
  const carregar = useCallback(async () => {
    if (parametros === null) return;
    try {
      setLista(await api<RespostaLista>("GET", `/api/financeiro?${parametros}`));
      setErro("");
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  }, [parametros]);
  useEffect(() => {
    void carregar();
  }, [carregar, versao]);
  return { lista, erro, recarregar: carregar };
}

export function Paginacao({ total, pagina, porPagina, substantivo, aoMudar }: { total: number; pagina: number; porPagina: number; substantivo: [string, string]; aoMudar: (p: number) => void }) {
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  return (
    <div className="paginacao">
      <span className="texto-pequeno" role="status">
        {total} {total === 1 ? substantivo[0] : substantivo[1]} · página {pagina} de {totalPaginas}
      </span>
      <div className="paginacao-botoes">
        <Botao variante="secundario" tamanho="pequeno" disabled={pagina <= 1} onClick={() => aoMudar(pagina - 1)}>
          Anterior
        </Botao>
        <Botao variante="secundario" tamanho="pequeno" disabled={pagina >= totalPaginas} onClick={() => aoMudar(pagina + 1)}>
          Próxima
        </Botao>
      </div>
    </div>
  );
}

/** Texto de busca com atraso (não consulta a cada tecla). */
export function useBuscaComAtraso(aoMudar: () => void): [string, string, (v: string) => void] {
  const [texto, setTexto] = useState("");
  const [busca, setBusca] = useState("");
  useEffect(() => {
    const t = setTimeout(() => {
      setBusca(texto);
      aoMudar();
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);
  return [texto, busca, setTexto];
}
