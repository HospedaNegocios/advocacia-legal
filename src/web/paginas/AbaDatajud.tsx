import { CircleAlert, CircleCheck, CircleHelp, Clock, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ErroApi, api, formatarData } from "../api";
import { Aviso, Botao, EsqueletoLinhas, EstadoErro, EstadoVazio, Selo, useToast } from "../ui";
import type { TomSelo } from "../ui";
import type { Processo } from "./processos-comum";

/** Aba "Movimentações": o que o DataJud (CNJ) informa sobre o processo. Só aparece quando o recurso está ligado no ambiente. */

type Situacao = "ok" | "nao_encontrado" | "sem_tribunal" | "erro" | "bloqueado";

interface Consulta {
  situacao: Situacao;
  consultado_em: string;
  tribunal: string | null;
  observacao?: string | null;
  ultima_atualizacao_fonte: string | null;
  classe: string | null;
  orgao: string | null;
  grau: string | null;
  total_movimentos: number;
}

interface Movimento {
  id: string;
  data_hora: string | null;
  codigo: string | null;
  nome: string | null;
  complementos: string | null;
  orgao: string | null;
  grau: string | null;
}

interface RespostaDatajud {
  disponivel: boolean;
  consulta: Consulta | null;
  movimentos: Movimento[];
  total: number;
  resultado?: Situacao;
  novos?: number;
}

const POR_PAGINA = 20;

export const AVISO_DATAJUD =
  "Fonte: DataJud (CNJ). Os dados podem chegar com atraso e processos em segredo de justiça não aparecem. A informação oficial é a dos autos.";

const SITUACAO: Record<Situacao, { tom: TomSelo; icone: typeof CircleCheck; titulo: string; texto: string }> = {
  ok: { tom: "bom", icone: CircleCheck, titulo: "Consulta feita", texto: "As movimentações abaixo foram lidas do DataJud." },
  nao_encontrado: {
    tom: "aviso",
    icone: CircleHelp,
    titulo: "Processo não encontrado",
    texto: "O DataJud não tem este processo. Ele pode estar em segredo de justiça ou o tribunal ainda não enviou os dados.",
  },
  sem_tribunal: { tom: "neutro", icone: CircleHelp, titulo: "Tribunal não coberto", texto: "O DataJud não cobre o tribunal deste número de processo." },
  erro: { tom: "aviso", icone: CircleAlert, titulo: "Falha temporária", texto: "Não foi possível consultar o DataJud agora. Tente de novo mais tarde." },
  bloqueado: { tom: "critico", icone: CircleAlert, titulo: "Consulta recusada", texto: "O DataJud recusou a consulta. Tente de novo mais tarde; se continuar, avise o administrador." },
};

export function AbaDatajud({ p }: { p: Processo }) {
  const { avisar } = useToast();
  const [consulta, setConsulta] = useState<Consulta | null>(null);
  const [itens, setItens] = useState<Movimento[] | null>(null);
  const [total, setTotal] = useState(0);
  const [erro, setErro] = useState("");
  const [atualizando, setAtualizando] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [indisponivel, setIndisponivel] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await api<RespostaDatajud>("GET", `/api/processos/${p.id}/datajud?por_pagina=${POR_PAGINA}`);
      setIndisponivel(!r.disponivel);
      setConsulta(r.consulta);
      setItens(r.movimentos);
      setTotal(r.total);
      setErro("");
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  }, [p.id]);
  useEffect(() => void carregar(), [carregar]);

  const atualizar = async () => {
    setAtualizando(true);
    try {
      const r = await api<RespostaDatajud>("POST", `/api/processos/${p.id}/datajud/atualizar`);
      setConsulta(r.consulta);
      setItens(r.movimentos);
      setTotal(r.total);
      if (r.resultado === "ok") avisar(r.novos ? `${r.novos} ${r.novos === 1 ? "movimentação nova" : "movimentações novas"}.` : "Nenhuma movimentação nova.");
      else if (r.resultado) avisar(SITUACAO[r.resultado].titulo + ".", "erro");
    } catch (e) {
      avisar(e instanceof ErroApi ? e.message : "Algo deu errado.", "erro");
    } finally {
      setAtualizando(false);
    }
  };

  const verMais = async () => {
    if (!itens) return;
    setCarregandoMais(true);
    try {
      const pagina = Math.floor(itens.length / POR_PAGINA) + 1;
      const r = await api<RespostaDatajud>("GET", `/api/processos/${p.id}/datajud?por_pagina=${POR_PAGINA}&pagina=${pagina}`);
      setItens([...itens, ...r.movimentos.filter((m) => !itens.some((i) => i.id === m.id))]);
      setTotal(r.total);
    } catch (e) {
      avisar(e instanceof ErroApi ? e.message : "Algo deu errado.", "erro");
    } finally {
      setCarregandoMais(false);
    }
  };

  if (erro) return <EstadoErro acao={<Botao variante="secundario" onClick={() => void carregar()}>Tentar de novo</Botao>}>{erro}</EstadoErro>;
  if (itens === null) return <EsqueletoLinhas linhas={3} />;
  if (indisponivel) return <Aviso tipo="atencao">A consulta ao DataJud não está disponível neste ambiente.</Aviso>;

  const s = consulta ? SITUACAO[consulta.situacao] : null;
  return (
    <div className="pilha">
      <Aviso tipo="atencao">{AVISO_DATAJUD}</Aviso>
      <div className="abas-acao">
        <div className="pilha" style={{ gap: "var(--espaco-1, 4px)" }}>
          {consulta && s ? (
            <>
              <span>
                <Selo tom={s.tom} icone={s.icone}>
                  {s.titulo}
                </Selo>
              </span>
              <p className="texto-pequeno" style={{ margin: 0 }}>
                Última consulta: {formatarData(consulta.consultado_em)}. {s.texto}
              </p>
              {(consulta.situacao === "erro" || consulta.situacao === "bloqueado") && consulta.observacao && (
                <p className="texto-pequeno" style={{ margin: 0 }}>
                  Detalhe técnico: {consulta.observacao}
                </p>
              )}
              {consulta.situacao === "ok" && (
                <p className="texto-pequeno" style={{ margin: 0 }}>
                  {[consulta.classe, consulta.orgao, consulta.grau ? `Grau ${consulta.grau}` : null].filter(Boolean).join(" · ")}
                  {consulta.ultima_atualizacao_fonte ? ` · Atualizado no tribunal em ${formatarData(consulta.ultima_atualizacao_fonte)}` : ""}
                </p>
              )}
            </>
          ) : (
            <p className="texto-pequeno" style={{ margin: 0 }}>
              Este processo ainda não foi consultado. A consulta automática roda uma vez por dia.
            </p>
          )}
        </div>
        {p.ativo && (
          <Botao carregando={atualizando} onClick={() => void atualizar()}>
            <RefreshCw size={18} aria-hidden="true" />
            Atualizar agora
          </Botao>
        )}
      </div>
      {itens.length === 0 ? (
        <EstadoVazio compacto icone={Clock} titulo="Nenhuma movimentação do DataJud">
          Quando o DataJud tiver movimentações deste processo, elas aparecem aqui.
        </EstadoVazio>
      ) : (
        <>
          <ol className="linha-tempo" aria-label="Movimentações do DataJud">
            {itens.map((m) => (
              <li key={m.id} className="linha-tempo-item">
                <div className="linha-tempo-data">{m.data_hora ? <time dateTime={m.data_hora}>{formatarData(m.data_hora)}</time> : "Sem data"}</div>
                <div className="linha-tempo-corpo">
                  <p>{m.nome ?? "Movimentação"}</p>
                  {m.complementos && <small>{m.complementos}</small>}
                  {(m.orgao || m.grau) && <small>{[m.orgao, m.grau ? `Grau ${m.grau}` : null].filter(Boolean).join(" · ")}</small>}
                </div>
              </li>
            ))}
          </ol>
          {itens.length < total && (
            <div>
              <Botao variante="secundario" carregando={carregandoMais} onClick={() => void verMais()}>
                Ver mais ({total - itens.length})
              </Botao>
            </div>
          )}
        </>
      )}
    </div>
  );
}
