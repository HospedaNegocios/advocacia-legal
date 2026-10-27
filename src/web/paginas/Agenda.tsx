import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { hojeEm } from "../../comum/fuso";
import { ErroApi, api } from "../api";
import { Botao, CabecalhoPagina, Cartao, EsqueletoLinhas, EstadoErro, EstadoVazio, useToast } from "../ui";
import { ICONE_TIPO_EVENTO, diasDoEvento, horarioEvento } from "./agenda-comum";
import type { Evento, UsuarioBasico } from "./agenda-comum";
import { DIAS_SEMANA_CURTO, deslocarAncora, diaDaSemana, diaPorExtenso, diasDaVisao, janelaDaVisao, numeroDoDia, tituloDaVisao } from "./agenda-calendario";
import type { VisaoAgenda } from "./agenda-calendario";
import { EventoDetalhe, ItemEvento } from "./EventoDetalhe";
import { EventoFormulario } from "./EventoFormulario";

const VISOES: { id: VisaoAgenda; rotulo: string }[] = [
  { id: "dia", rotulo: "Dia" },
  { id: "semana", rotulo: "Semana" },
  { id: "mes", rotulo: "Mês" },
];

function visaoInicial(): VisaoAgenda {
  // No celular o padrão é o dia; no computador, a semana.
  return window.matchMedia("(max-width: 767.98px)").matches ? "dia" : "semana";
}

/** Eventos ordenados que tocam o dia, no calendário de Brasília. */
function eventosDoDia(eventos: Evento[], dia: string): Evento[] {
  return eventos.filter((e) => {
    const { primeiro, ultimo } = diasDoEvento(e);
    return primeiro <= dia && dia <= ultimo;
  });
}

export function Agenda() {
  const { avisar } = useToast();
  const hoje = hojeEm();
  const [visao, setVisao] = useState<VisaoAgenda>(visaoInicial);
  const [ancora, setAncora] = useState(hoje);
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  const [erro, setErro] = useState("");
  const [usuarios, setUsuarios] = useState<UsuarioBasico[]>([]);
  const [aberto, setAberto] = useState<Evento | null>(null);
  const [formulario, setFormulario] = useState<{ evento: Evento | null; data: string } | null>(null);

  const { de, ate } = useMemo(() => janelaDaVisao(visao, ancora), [visao, ancora]);
  const dias = useMemo(() => diasDaVisao(visao, ancora), [visao, ancora]);

  useEffect(() => {
    api<{ usuarios: UsuarioBasico[] }>("GET", "/api/processos/responsaveis-disponiveis")
      .then((r) => setUsuarios(r.usuarios))
      .catch(() => setUsuarios([]));
  }, []);

  const carregar = useCallback(async () => {
    try {
      const r = await api<{ eventos: Evento[] }>("GET", `/api/agenda?de=${de}&ate=${ate}`);
      setEventos(r.eventos);
      setErro("");
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  }, [de, ate]);
  useEffect(() => void carregar(), [carregar]);

  const irParaDia = (d: string) => {
    setAncora(d);
    setVisao("dia");
  };

  const botaoNovo = (
    <Botao onClick={() => setFormulario({ evento: null, data: visao === "dia" ? ancora : hoje })}>
      <Plus size={18} aria-hidden="true" />
      Novo evento
    </Botao>
  );

  const titulo = tituloDaVisao(visao, ancora);
  const lista = eventos ?? [];

  const cabecalhoDia = (d: string) => (
    <>
      <span className="agenda-dia-semana">{DIAS_SEMANA_CURTO[diaDaSemana(d)]}</span>
      <span className="agenda-dia-numero">{numeroDoDia(d)}</span>
      {d === hoje && <span className="agenda-hoje">Hoje</span>}
    </>
  );

  return (
    <>
      <CabecalhoPagina titulo="Agenda" descricao="Audiências, reuniões e diligências de todo o escritório. Os horários seguem o fuso de cada evento (padrão: Brasília)." migalhas={[{ rotulo: "Início", para: "/" }, { rotulo: "Agenda" }]} acoes={botaoNovo} />

      <Cartao semPadding>
        <div className="agenda-barra">
          <div className="grupo-botoes" role="group" aria-label="Navegar no calendário">
            <Botao variante="secundario" onClick={() => setAncora(deslocarAncora(visao, ancora, -1))} aria-label="Período anterior">
              <ChevronLeft size={18} aria-hidden="true" />
              <span className="agenda-texto-nav">Anterior</span>
            </Botao>
            <Botao variante="secundario" onClick={() => setAncora(hoje)}>
              Hoje
            </Botao>
            <Botao variante="secundario" onClick={() => setAncora(deslocarAncora(visao, ancora, 1))} aria-label="Próximo período">
              <span className="agenda-texto-nav">Próximo</span>
              <ChevronRight size={18} aria-hidden="true" />
            </Botao>
          </div>
          <h2 className="agenda-titulo" aria-live="polite">
            {titulo}
          </h2>
          <div className="grupo-botoes" role="group" aria-label="Forma de exibição">
            {VISOES.map((v) => (
              <Botao key={v.id} variante={visao === v.id ? "primario" : "secundario"} aria-pressed={visao === v.id} onClick={() => setVisao(v.id)}>
                {v.rotulo}
              </Botao>
            ))}
          </div>
        </div>

        {erro ? (
          <EstadoErro acao={<Botao variante="secundario" onClick={() => void carregar()}>Tentar de novo</Botao>}>{erro}</EstadoErro>
        ) : eventos === null ? (
          <div style={{ padding: "var(--e-4)" }}>
            <EsqueletoLinhas linhas={4} />
          </div>
        ) : visao === "dia" ? (
          <div className="agenda-corpo">
            {eventosDoDia(lista, ancora).length === 0 ? (
              <EstadoVazio icone={CalendarDays} titulo="Nenhum evento neste dia" acao={botaoNovo}>
                {diaPorExtenso(ancora)}
              </EstadoVazio>
            ) : (
              <ul className="agenda-lista" aria-label={`Eventos de ${diaPorExtenso(ancora)}`}>
                {eventosDoDia(lista, ancora).map((e) => (
                  <li key={e.id}>
                    <ItemEvento evento={e} aoAbrir={setAberto} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : visao === "semana" ? (
          <div className="agenda-semana">
            {dias.map((d) => {
              const doDia = eventosDoDia(lista, d);
              return (
                <section key={d} className="agenda-dia" data-hoje={d === hoje} aria-label={diaPorExtenso(d)}>
                  <header className="agenda-dia-cabeca">{cabecalhoDia(d)}</header>
                  {doDia.length === 0 ? (
                    <p className="agenda-sem-eventos">Sem eventos</p>
                  ) : (
                    <ul className="agenda-lista">
                      {doDia.map((e) => (
                        <li key={e.id}>
                          <ItemEvento evento={e} aoAbrir={setAberto} />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        ) : (
          <div className="agenda-mes" role="grid" aria-label={`Calendário de ${titulo}`}>
            <div className="agenda-mes-semana" role="row">
              {DIAS_SEMANA_CURTO.map((s) => (
                <span key={s} className="agenda-mes-titulo" role="columnheader">
                  {s}
                </span>
              ))}
            </div>
            <div className="agenda-mes-grade">
              {dias.map((d) => {
                const doDia = eventosDoDia(lista, d);
                const foraDoMes = d.slice(0, 7) !== ancora.slice(0, 7);
                return (
                  <div key={d} className="agenda-celula" role="gridcell" data-hoje={d === hoje} data-fora={foraDoMes}>
                    <button type="button" className="agenda-celula-dia" onClick={() => irParaDia(d)} aria-label={`${diaPorExtenso(d)}${d === hoje ? ", hoje" : ""}. ${doDia.length === 0 ? "Sem eventos" : `${doDia.length} ${doDia.length === 1 ? "evento" : "eventos"}`}. Abrir o dia`}>
                      <span className="agenda-celula-numero">{numeroDoDia(d)}</span>
                      {d === hoje && <span className="agenda-hoje">Hoje</span>}
                      {doDia.length > 0 && <span className="agenda-celula-contagem">{doDia.length}</span>}
                    </button>
                    <ul className="agenda-celula-eventos">
                      {doDia.slice(0, 3).map((e) => {
                        const Icone = ICONE_TIPO_EVENTO[e.tipo];
                        return (
                          <li key={e.id}>
                            <button type="button" className="agenda-chip" onClick={() => setAberto(e)} aria-label={`${e.titulo}, ${horarioEvento(e)}. Abrir detalhes`}>
                              <Icone size={12} aria-hidden="true" />
                              <span>{e.titulo}</span>
                            </button>
                          </li>
                        );
                      })}
                      {doDia.length > 3 && (
                        <li>
                          <button type="button" className="agenda-mais" onClick={() => irParaDia(d)}>
                            +{doDia.length - 3} {doDia.length - 3 === 1 ? "evento" : "eventos"}
                          </button>
                        </li>
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Cartao>

      <EventoDetalhe
        evento={aberto}
        aoFechar={() => setAberto(null)}
        aoEditar={(e) => {
          setAberto(null);
          setFormulario({ evento: e, data: hoje });
        }}
        aoApagado={() => {
          setAberto(null);
          void carregar();
        }}
      />
      <EventoFormulario
        aberto={formulario !== null}
        evento={formulario?.evento ?? null}
        dataPadrao={formulario?.data ?? hoje}
        usuarios={usuarios}
        aoFechar={() => setFormulario(null)}
        aoSalvar={() => {
          const novo = formulario?.evento === null;
          setFormulario(null);
          avisar(novo ? "Evento cadastrado." : "Evento atualizado.");
          void carregar();
        }}
      />
    </>
  );
}
