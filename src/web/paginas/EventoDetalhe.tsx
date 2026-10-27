import { CalendarDays, Clock, Contact, Briefcase, MapPin, Pencil, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { FUSO_PADRAO, partesLocais } from "../../comum/fuso";
import { ErroApi, api } from "../api";
import { Link } from "../roteador";
import { Botao, Confirmar, Modal, useToast } from "../ui";
import { SeloTipoEvento, horarioEvento } from "./agenda-comum";
import type { Evento } from "./agenda-comum";
import { diaBr } from "./clientes-comum";
import { cnjFormatado } from "./processos-comum";

/** Período por extenso: "10/11/2026" ou "10/11/2026 a 12/11/2026". */
export function periodoEvento(e: Evento): string {
  const a = partesLocais(Date.parse(e.inicio), e.fuso).data;
  const b = partesLocais(Date.parse(e.fim), e.fuso).data;
  return a === b ? diaBr(a) : `${diaBr(a)} a ${diaBr(b)}`;
}

/** Cartão compacto de um evento (lista do dia, início, aba do processo). Clicar abre os detalhes. */
export function ItemEvento({ evento, aoAbrir, mostrarData }: { evento: Evento; aoAbrir: (e: Evento) => void; mostrarData?: boolean }) {
  return (
    <button type="button" className="item-evento" onClick={() => aoAbrir(evento)} aria-label={`${evento.titulo}, ${mostrarData ? `${diaBr(partesLocais(Date.parse(evento.inicio), evento.fuso).data)}, ` : ""}${horarioEvento(evento)}. Abrir detalhes`}>
      <span className="item-evento-hora">
        {mostrarData && <b>{diaBr(partesLocais(Date.parse(evento.inicio), evento.fuso).data).slice(0, 5)}</b>}
        <span>{horarioEvento(evento)}</span>
      </span>
      <span className="item-evento-corpo">
        <strong>{evento.titulo}</strong>
        <span className="item-evento-meta">
          <SeloTipoEvento tipo={evento.tipo} />
          {evento.local && (
            <small>
              <MapPin size={12} aria-hidden="true" /> {evento.local}
            </small>
          )}
        </span>
      </span>
    </button>
  );
}

/** Detalhes do evento em janela. Editar e apagar só aparecem para quem pode (quem criou ou o sócio). */
export function EventoDetalhe({ evento, aoFechar, aoEditar, aoApagado }: { evento: Evento | null; aoFechar: () => void; aoEditar: (e: Evento) => void; aoApagado: () => void }) {
  const { avisar } = useToast();
  const [apagando, setApagando] = useState(false);
  const [carregando, setCarregando] = useState(false);

  const apagar = async () => {
    if (!evento) return;
    setCarregando(true);
    try {
      await api("DELETE", `/api/agenda/${evento.id}`);
      setApagando(false);
      avisar("Evento apagado.");
      aoApagado();
    } catch (e) {
      avisar(e instanceof ErroApi ? e.message : "Algo deu errado.", "erro");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <>
      <Modal aberto={evento !== null && !apagando} aoFechar={aoFechar} titulo={evento?.titulo ?? ""}>
        {evento && (
          <>
            <div>
              <SeloTipoEvento tipo={evento.tipo} />
            </div>
            <dl className="lista-dados lista-dados-estreita">
              <div>
                <dt>
                  <CalendarDays size={14} aria-hidden="true" /> Data
                </dt>
                <dd>{periodoEvento(evento)}</dd>
              </div>
              <div>
                <dt>
                  <Clock size={14} aria-hidden="true" /> Horário
                </dt>
                <dd>{horarioEvento(evento)}</dd>
              </div>
              {evento.local && (
                <div>
                  <dt>
                    <MapPin size={14} aria-hidden="true" /> Local
                  </dt>
                  <dd>{evento.local}</dd>
                </div>
              )}
              {evento.processo_id && evento.processo_numero && (
                <div>
                  <dt>
                    <Briefcase size={14} aria-hidden="true" /> Processo
                  </dt>
                  <dd>
                    <Link para={`/processos/${evento.processo_id}`}>{cnjFormatado(evento.processo_numero)}</Link>
                  </dd>
                </div>
              )}
              {evento.cliente_id && evento.cliente_nome && (
                <div>
                  <dt>
                    <Contact size={14} aria-hidden="true" /> Cliente
                  </dt>
                  <dd>
                    <Link para={`/clientes/${evento.cliente_id}`}>{evento.cliente_nome}</Link>
                  </dd>
                </div>
              )}
              {evento.participantes.length > 0 && (
                <div>
                  <dt>
                    <Users size={14} aria-hidden="true" /> Participantes
                  </dt>
                  <dd>{evento.participantes.map((p) => p.nome).join(", ")}</dd>
                </div>
              )}
              {evento.descricao && (
                <div>
                  <dt>Descrição</dt>
                  <dd>{evento.descricao}</dd>
                </div>
              )}
            </dl>
            {evento.fuso !== FUSO_PADRAO && <p className="texto-pequeno">Horário no fuso do local do evento.</p>}
            <div className="modal-rodape">
              {evento.pode_alterar ? (
                <>
                  <Botao variante="perigo" onClick={() => setApagando(true)}>
                    <Trash2 size={16} aria-hidden="true" />
                    Apagar
                  </Botao>
                  <Botao variante="secundario" onClick={() => aoEditar(evento)}>
                    <Pencil size={16} aria-hidden="true" />
                    Editar
                  </Botao>
                </>
              ) : (
                <p className="texto-pequeno" style={{ margin: 0, marginRight: "auto" }}>
                  Só quem criou o evento ou o sócio pode alterá-lo.
                </p>
              )}
              <Botao variante="secundario" onClick={aoFechar}>
                Fechar
              </Botao>
            </div>
          </>
        )}
      </Modal>
      <Confirmar aberto={apagando} aoFechar={() => setApagando(false)} titulo="Apagar evento" rotuloConfirmar="Apagar" perigo carregando={carregando} aoConfirmar={() => void apagar()}>
        Apagar o evento “{evento?.titulo}”? Essa ação fica registrada na auditoria e não pode ser desfeita.
      </Confirmar>
    </>
  );
}
