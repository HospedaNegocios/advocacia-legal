import { AlarmClock, AlarmClockOff, CalendarClock, CircleCheck, LayoutGrid, List, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { ErroApi, api } from "../api";
import { Link } from "../roteador";
import { useSessao } from "../sessao";
import { Botao, CabecalhoPagina, Cartao, Confirmar, Entrada, EsqueletoKpi, EsqueletoLinhas, EstadoErro, EstadoVazio, Indicador, Selecao, SelecaoCompacta, SeletorBusca, Selo, Tabela, useToast } from "../ui";
import type { Coluna } from "../ui";
import { ICONE_STATUS_PRAZO, ROTULO_STATUS_PRAZO, STATUS_PRAZO, SeloPrazo, dataFatalTexto } from "./agenda-comum";
import type { Prazo, StatusPrazo, UsuarioBasico } from "./agenda-comum";
import { buscarProcessos } from "./buscas";
import { PrazoFormulario } from "./PrazoFormulario";
import { cnjFormatado } from "./processos-comum";

interface Resumo {
  hoje: string;
  vencidos: number;
  vencem_hoje: number;
  proximos_7_dias: number;
  por_status: Record<StatusPrazo, number>;
}

type Visao = "quadro" | "lista";
const LIMITE = 200;

function lerVisao(): Visao {
  try {
    return localStorage.getItem("prazos-visao") === "lista" ? "lista" : "quadro";
  } catch {
    return "quadro";
  }
}

/** Texto curto do cartão: processo e responsável. */
function MetaPrazo({ p }: { p: Prazo }) {
  return (
    <>
      {p.processo_id && p.processo_numero && (
        <small>
          Processo <Link para={`/processos/${p.processo_id}`}>{cnjFormatado(p.processo_numero)}</Link>
        </small>
      )}
      <small>Responsável: {p.responsavel_nome}</small>
    </>
  );
}

export function Prazos() {
  const { avisar } = useToast();
  const { eu } = useSessao();
  const ehSocio = eu?.usuario.perfil === "socio";
  const [visao, setVisaoEstado] = useState<Visao>(lerVisao);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [prazos, setPrazos] = useState<Prazo[] | null>(null);
  const [total, setTotal] = useState(0);
  const [usuarios, setUsuarios] = useState<UsuarioBasico[]>([]);
  const [erro, setErro] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [status, setStatus] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [processoId, setProcessoId] = useState(() => new URLSearchParams(window.location.search).get("processo") ?? "");
  const [processoRotulo, setProcessoRotulo] = useState("");
  const [colunaMovel, setColunaMovel] = useState<StatusPrazo>("a_fazer");
  const [formulario, setFormulario] = useState<{ prazo: Prazo | null } | null>(null);
  const [apagando, setApagando] = useState<Prazo | null>(null);
  const [apagandoCarregando, setApagandoCarregando] = useState(false);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<StatusPrazo | null>(null);
  const anunciar = useRef<HTMLDivElement>(null);

  const setVisao = (v: Visao) => {
    setVisaoEstado(v);
    try {
      localStorage.setItem("prazos-visao", v);
    } catch {
      /* sem armazenamento: vale só nesta visita */
    }
  };

  const carregarResumo = useCallback(() => {
    api<{ resumo: Resumo }>("GET", "/api/prazos/resumo")
      .then((r) => setResumo(r.resumo))
      .catch(() => setResumo(null));
  }, []);
  useEffect(carregarResumo, [carregarResumo]);

  useEffect(() => {
    api<{ usuarios: UsuarioBasico[] }>("GET", "/api/processos/responsaveis-disponiveis")
      .then((r) => setUsuarios(r.usuarios))
      .catch(() => setUsuarios([]));
  }, []);

  // Rótulo do processo vindo do link da tela do processo (/prazos?processo=ID).
  useEffect(() => {
    if (!processoId || processoRotulo) return;
    api<{ processo: { numero_cnj: string } }>("GET", `/api/processos/${processoId}`)
      .then((r) => setProcessoRotulo(cnjFormatado(r.processo.numero_cnj)))
      .catch(() => setProcessoRotulo("processo não encontrado"));
  }, [processoId, processoRotulo]);

  const carregar = useCallback(async () => {
    try {
      const q = new URLSearchParams({ por_pagina: String(LIMITE) });
      if (responsavel) q.set("responsavel", responsavel);
      if (status) q.set("status", status);
      if (de) q.set("de", de);
      if (ate) q.set("ate", ate);
      if (processoId) q.set("processo_id", processoId);
      // No quadro, concluídos antigos saem da coluna "Concluído" (só os últimos 30 dias), a menos que o filtro peça concluídos.
      if (visao === "quadro" && status !== "concluido") q.set("concluidos_dias", "30");
      const r = await api<{ prazos: Prazo[]; total: number }>("GET", `/api/prazos?${q.toString()}`);
      setPrazos(r.prazos);
      setTotal(r.total);
      setErro("");
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  }, [responsavel, status, de, ate, processoId, visao]);
  useEffect(() => void carregar(), [carregar]);

  const filtrando = responsavel !== "" || status !== "" || de !== "" || ate !== "" || processoId !== "";
  const limparFiltros = () => {
    setResponsavel("");
    setStatus("");
    setDe("");
    setAte("");
    setProcessoId("");
    setProcessoRotulo("");
    if (window.location.search) window.history.replaceState(null, "", "/prazos");
  };

  const mover = async (p: Prazo, novo: StatusPrazo) => {
    if (p.status === novo) return;
    const anterior = prazos;
    setPrazos((lista) => lista?.map((x) => (x.id === p.id ? { ...x, status: novo, situacao: novo === "concluido" ? "concluido" : x.situacao === "concluido" ? (x.dias_para_vencer < 0 ? "vencido" : x.dias_para_vencer === 0 ? "hoje" : "futuro") : x.situacao } : x)) ?? null);
    try {
      const r = await api<{ prazo: Prazo }>("POST", `/api/prazos/${p.id}/status`, { status: novo });
      setPrazos((lista) => lista?.map((x) => (x.id === p.id ? r.prazo : x)) ?? null);
      carregarResumo();
      if (anunciar.current) anunciar.current.textContent = `Prazo ${p.titulo} movido para ${ROTULO_STATUS_PRAZO[novo]}.`;
      avisar(`Prazo movido para ${ROTULO_STATUS_PRAZO[novo]}.`);
    } catch (e) {
      setPrazos(anterior);
      avisar(e instanceof ErroApi ? e.message : "Não foi possível mover o prazo.", "erro");
    }
  };

  const apagar = async () => {
    if (!apagando) return;
    setApagandoCarregando(true);
    try {
      await api("DELETE", `/api/prazos/${apagando.id}`);
      setApagando(null);
      avisar("Prazo apagado.");
      void carregar();
      carregarResumo();
    } catch (e) {
      avisar(e instanceof ErroApi ? e.message : "Algo deu errado.", "erro");
    } finally {
      setApagandoCarregando(false);
    }
  };

  const aoSoltar = (e: DragEvent, alvo: StatusPrazo) => {
    e.preventDefault();
    setSobre(null);
    const id = e.dataTransfer.getData("text/plain") || arrastando;
    setArrastando(null);
    const p = prazos?.find((x) => x.id === id);
    if (p) void mover(p, alvo);
  };

  const botaoNovo = (
    <Botao onClick={() => setFormulario({ prazo: null })}>
      <Plus size={18} aria-hidden="true" />
      Novo prazo
    </Botao>
  );

  const acoesPrazo = (p: Prazo) => (
    <>
      <Botao variante="secundario" tamanho="pequeno" onClick={() => setFormulario({ prazo: p })} aria-label={`Editar prazo ${p.titulo}`}>
        <Pencil size={16} aria-hidden="true" />
        Editar
      </Botao>
      {ehSocio && (
        <Botao variante="perigo" tamanho="pequeno" onClick={() => setApagando(p)} aria-label={`Apagar prazo ${p.titulo}`}>
          <Trash2 size={16} aria-hidden="true" />
          Apagar
        </Botao>
      )}
    </>
  );

  const seletorMover = (p: Prazo) => (
    <SelecaoCompacta aria-label={`Mover o prazo ${p.titulo} para`} value={p.status} onChange={(e) => void mover(p, e.target.value as StatusPrazo)}>
      {STATUS_PRAZO.map((s) => (
        <option key={s} value={s}>
          {ROTULO_STATUS_PRAZO[s]}
        </option>
      ))}
    </SelecaoCompacta>
  );

  const colunasLista: Coluna<Prazo>[] = [
    {
      chave: "titulo",
      titulo: "Prazo",
      principal: true,
      render: (p) => (
        <div className="celula-principal">
          <div>
            <strong>{p.titulo}</strong>
            <small>{p.processo_numero ? `Processo ${cnjFormatado(p.processo_numero)}` : "Sem processo"}</small>
          </div>
        </div>
      ),
    },
    { chave: "data", titulo: "Data fatal", render: (p) => dataFatalTexto(p), nowrap: true },
    { chave: "situacao", titulo: "Situação", render: (p) => <SeloPrazo prazo={p} /> },
    { chave: "responsavel", titulo: "Responsável", render: (p) => p.responsavel_nome },
    { chave: "status", titulo: "Status", render: (p) => seletorMover(p) },
    { chave: "acoes", titulo: "Ações", acoes: true, render: (p) => <div className="tabela-acoes">{acoesPrazo(p)}</div> },
  ];

  const porStatus = (s: StatusPrazo) => (prazos ?? []).filter((p) => p.status === s);

  return (
    <>
      <CabecalhoPagina titulo="Prazos" descricao="Prazos fatais do escritório em quadro por situação. A data fatal é digitada pelo advogado; ao criar um prazo você pode calcular a data em dias úteis." migalhas={[{ rotulo: "Início", para: "/" }, { rotulo: "Prazos" }]} acoes={botaoNovo} />

      <section aria-label="Resumo dos prazos" className="grade grade-kpi">
        {resumo ? (
          <>
            <Indicador rotulo="Vencidos" valor={resumo.vencidos} icone={AlarmClockOff} nota="não concluídos">
              {resumo.vencidos > 0 && (
                <div>
                  <Selo tom="critico" icone={AlarmClockOff}>
                    Atrasados
                  </Selo>
                </div>
              )}
            </Indicador>
            <Indicador rotulo="Vencem hoje" valor={resumo.vencem_hoje} icone={AlarmClock} nota="não concluídos">
              {resumo.vencem_hoje > 0 && (
                <div>
                  <Selo tom="aviso" icone={AlarmClock}>
                    Vence hoje
                  </Selo>
                </div>
              )}
            </Indicador>
            <Indicador rotulo="Próximos 7 dias" valor={resumo.proximos_7_dias} icone={CalendarClock} nota="a partir de amanhã" />
            <Indicador rotulo="Concluídos" valor={resumo.por_status.concluido} icone={CircleCheck} nota="no total" />
          </>
        ) : (
          <>
            <EsqueletoKpi />
            <EsqueletoKpi />
            <EsqueletoKpi />
            <EsqueletoKpi />
          </>
        )}
      </section>

      <Cartao semPadding>
        <div className="barra-filtros barra-filtros-prazos">
          <Selecao rotulo="Responsável" value={responsavel} onChange={(e) => setResponsavel(e.target.value)}>
            <option value="">Todos</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.id === eu?.usuario.id ? `${u.nome} (eu)` : u.nome}
              </option>
            ))}
          </Selecao>
          <Selecao rotulo="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            {STATUS_PRAZO.map((s) => (
              <option key={s} value={s}>
                {ROTULO_STATUS_PRAZO[s]}
              </option>
            ))}
          </Selecao>
          <Entrada rotulo="Data fatal a partir de" type="date" value={de} max={ate || undefined} onChange={(e) => setDe(e.target.value)} />
          <Entrada rotulo="Data fatal até" type="date" value={ate} min={de || undefined} onChange={(e) => setAte(e.target.value)} />
          <SeletorBusca rotulo="Processo" valor={processoId || null} rotuloAtual={processoRotulo} buscar={buscarProcessos} vazio="Nenhum processo ativo encontrado." aoMudar={(o) => (setProcessoId(o?.id ?? ""), setProcessoRotulo(o?.rotulo ?? ""))} />
        </div>
        <div className="barra-visao">
          <div className="grupo-botoes" role="group" aria-label="Forma de exibição">
            <Botao variante={visao === "quadro" ? "primario" : "secundario"} tamanho="pequeno" aria-pressed={visao === "quadro"} onClick={() => setVisao("quadro")}>
              <LayoutGrid size={16} aria-hidden="true" />
              Quadro
            </Botao>
            <Botao variante={visao === "lista" ? "primario" : "secundario"} tamanho="pequeno" aria-pressed={visao === "lista"} onClick={() => setVisao("lista")}>
              <List size={16} aria-hidden="true" />
              Lista
            </Botao>
          </div>
          {filtrando && (
            <Botao variante="fantasma" tamanho="pequeno" onClick={limparFiltros}>
              Limpar filtros
            </Botao>
          )}
        </div>

        <div ref={anunciar} className="so-leitor" role="status" aria-live="polite" />

        {erro ? (
          <EstadoErro acao={<Botao variante="secundario" onClick={() => void carregar()}>Tentar de novo</Botao>}>{erro}</EstadoErro>
        ) : prazos === null ? (
          <div style={{ padding: "var(--e-4)" }}>
            <EsqueletoLinhas linhas={5} />
          </div>
        ) : visao === "lista" ? (
          prazos.length === 0 ? (
            filtrando ? (
              <EstadoVazio icone={Search} titulo="Nenhum prazo encontrado">
                Tente outro período ou mude os filtros.
              </EstadoVazio>
            ) : (
              <EstadoVazio icone={CalendarClock} titulo="Nenhum prazo cadastrado" acao={botaoNovo}>
                Cadastre o primeiro prazo para acompanhar a data fatal.
              </EstadoVazio>
            )
          ) : (
            <>
              <Tabela colunas={colunasLista} linhas={prazos} chaveLinha={(p) => p.id} legenda="Prazos do escritório, ordenados pela data fatal" />
              {total > prazos.length && (
                <p className="texto-pequeno paginacao" role="status">
                  Mostrando os {prazos.length} primeiros de {total} prazos. Use os filtros para ver os demais.
                </p>
              )}
            </>
          )
        ) : (
          <div className="kanban-envolve">
            <div className="kanban-abas" role="tablist" aria-label="Colunas do quadro">
              {STATUS_PRAZO.map((s) => {
                const Icone = ICONE_STATUS_PRAZO[s];
                return (
                  <button key={s} type="button" role="tab" id={`kanban-aba-${s}`} aria-selected={colunaMovel === s} aria-controls={`kanban-col-${s}`} className="kanban-aba" onClick={() => setColunaMovel(s)}>
                    <Icone size={16} aria-hidden="true" />
                    <span>{ROTULO_STATUS_PRAZO[s]}</span>
                    <span className="kanban-contagem">{porStatus(s).length}</span>
                  </button>
                );
              })}
            </div>
            <div className="kanban">
              {STATUS_PRAZO.map((s) => {
                const Icone = ICONE_STATUS_PRAZO[s];
                const itens = porStatus(s);
                return (
                  <section
                    key={s}
                    id={`kanban-col-${s}`}
                    className="kanban-coluna"
                    data-ativa={colunaMovel === s}
                    data-sobre={sobre === s}
                    aria-labelledby={`kanban-titulo-${s}`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setSobre(s);
                    }}
                    onDragLeave={() => setSobre((v) => (v === s ? null : v))}
                    onDrop={(e) => aoSoltar(e, s)}
                  >
                    <header className="kanban-cabeca">
                      <h3 id={`kanban-titulo-${s}`}>
                        <Icone size={16} aria-hidden="true" /> {ROTULO_STATUS_PRAZO[s]}
                      </h3>
                      <span className="kanban-contagem" aria-label={`${itens.length} ${itens.length === 1 ? "prazo" : "prazos"}`}>
                        {itens.length}
                      </span>
                    </header>
                    {s === "concluido" && status !== "concluido" && <p className="texto-pequeno kanban-nota">Concluídos nos últimos 30 dias.</p>}
                    {itens.length === 0 ? (
                      <p className="kanban-vazio">{filtrando ? "Nenhum prazo com estes filtros." : "Nenhum prazo aqui."}</p>
                    ) : (
                      <ul className="kanban-lista" aria-label={`Prazos: ${ROTULO_STATUS_PRAZO[s]}`}>
                        {itens.map((p) => (
                          <li
                            key={p.id}
                            className="kanban-cartao"
                            data-situacao={p.situacao}
                            data-arrastando={arrastando === p.id}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/plain", p.id);
                              e.dataTransfer.effectAllowed = "move";
                              setArrastando(p.id);
                            }}
                            onDragEnd={() => {
                              setArrastando(null);
                              setSobre(null);
                            }}
                          >
                            <strong className="kanban-titulo">{p.titulo}</strong>
                            <div>
                              <SeloPrazo prazo={p} />
                            </div>
                            <small>Data fatal: {dataFatalTexto(p)}</small>
                            <MetaPrazo p={p} />
                            <div className="kanban-mover">{seletorMover(p)}</div>
                            <div className="kanban-acoes">{acoesPrazo(p)}</div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
            {total > prazos.length && (
              <p className="texto-pequeno paginacao" role="status">
                Mostrando os {prazos.length} primeiros de {total} prazos. Use os filtros para ver os demais.
              </p>
            )}
          </div>
        )}
      </Cartao>

      <PrazoFormulario
        aberto={formulario !== null}
        prazo={formulario?.prazo ?? null}
        usuarios={usuarios}
        aoFechar={() => setFormulario(null)}
        aoSalvar={() => {
          const novo = formulario?.prazo === null;
          setFormulario(null);
          avisar(novo ? "Prazo cadastrado." : "Prazo atualizado.");
          void carregar();
          carregarResumo();
        }}
      />
      <Confirmar aberto={apagando !== null} aoFechar={() => setApagando(null)} titulo="Apagar prazo" rotuloConfirmar="Apagar" perigo carregando={apagandoCarregando} aoConfirmar={() => void apagar()}>
        Apagar o prazo “{apagando?.titulo}”? Essa ação fica registrada na auditoria e não pode ser desfeita.
      </Confirmar>
    </>
  );
}
