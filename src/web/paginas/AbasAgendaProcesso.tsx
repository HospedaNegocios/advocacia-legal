import { CalendarClock, CalendarDays, Pencil, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { hojeEm } from "../../comum/fuso";
import { ErroApi, api } from "../api";
import { Link } from "../roteador";
import { Botao, EsqueletoLinhas, EstadoErro, EstadoVazio, useToast } from "../ui";
import { ROTULO_STATUS_PRAZO, SeloPrazo, dataFatalTexto } from "./agenda-comum";
import type { Evento, Prazo, UsuarioBasico } from "./agenda-comum";
import { EventoDetalhe, ItemEvento } from "./EventoDetalhe";
import { EventoFormulario } from "./EventoFormulario";
import { PrazoFormulario } from "./PrazoFormulario";
import type { Processo } from "./processos-comum";

function useUsuarios(): UsuarioBasico[] {
  const [usuarios, setUsuarios] = useState<UsuarioBasico[]>([]);
  useEffect(() => {
    api<{ usuarios: UsuarioBasico[] }>("GET", "/api/processos/responsaveis-disponiveis")
      .then((r) => setUsuarios(r.usuarios))
      .catch(() => setUsuarios([]));
  }, []);
  return usuarios;
}

/** Aba "Prazos" do processo. Processo desativado: só leitura. */
export function AbaPrazos({ p }: { p: Processo }) {
  const { avisar } = useToast();
  const usuarios = useUsuarios();
  const [lista, setLista] = useState<Prazo[] | null>(null);
  const [erro, setErro] = useState("");
  const [formulario, setFormulario] = useState<{ prazo: Prazo | null } | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await api<{ prazos: Prazo[] }>("GET", `/api/processos/${p.id}/prazos`);
      setLista(r.prazos);
      setErro("");
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  }, [p.id]);
  useEffect(() => void carregar(), [carregar]);

  const botaoNovo = p.ativo ? (
    <Botao onClick={() => setFormulario({ prazo: null })}>
      <Plus size={18} aria-hidden="true" />
      Novo prazo
    </Botao>
  ) : null;

  if (erro) return <EstadoErro acao={<Botao variante="secundario" onClick={() => void carregar()}>Tentar de novo</Botao>}>{erro}</EstadoErro>;
  if (lista === null) return <EsqueletoLinhas linhas={3} />;

  return (
    <div className="pilha">
      <div className="abas-acao">
        <p className="texto-pequeno" style={{ margin: 0 }}>
          Prazos deste processo, pela data fatal. <Link para={`/prazos?processo=${p.id}`}>Abrir no quadro de prazos</Link>
        </p>
        {lista.length > 0 && botaoNovo}
      </div>
      {lista.length === 0 ? (
        <EstadoVazio icone={CalendarClock} titulo="Nenhum prazo neste processo" {...(botaoNovo ? { acao: botaoNovo } : {})}>
          Cadastre os prazos fatais para acompanhá-los no quadro e na tela inicial.
        </EstadoVazio>
      ) : (
        <ul className="lista-simples" aria-label="Prazos do processo">
          {lista.map((x) => (
            <li key={x.id} className="item-lista">
              <div className="item-lista-texto">
                <strong>{x.titulo}</strong>
                <small>
                  Data fatal: {dataFatalTexto(x)} · {ROTULO_STATUS_PRAZO[x.status]} · {x.responsavel_nome}
                </small>
              </div>
              <div className="linha-flex">
                <SeloPrazo prazo={x} />
                <Botao variante="secundario" tamanho="pequeno" onClick={() => setFormulario({ prazo: x })} aria-label={`Editar prazo ${x.titulo}`}>
                  <Pencil size={16} aria-hidden="true" />
                  Editar
                </Botao>
              </div>
            </li>
          ))}
        </ul>
      )}
      <PrazoFormulario
        aberto={formulario !== null}
        prazo={formulario?.prazo ?? null}
        processoFixo={{ id: p.id, numero_cnj: p.numero_cnj }}
        usuarios={usuarios}
        aoFechar={() => setFormulario(null)}
        aoSalvar={() => {
          const novo = formulario?.prazo === null;
          setFormulario(null);
          avisar(novo ? "Prazo cadastrado." : "Prazo atualizado.");
          void carregar();
        }}
      />
    </div>
  );
}

/** Aba "Agenda" do processo: audiências, reuniões e diligências ligadas a ele. */
export function AbaAgenda({ p }: { p: Processo }) {
  const { avisar } = useToast();
  const usuarios = useUsuarios();
  const [lista, setLista] = useState<Evento[] | null>(null);
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState<Evento | null>(null);
  const [formulario, setFormulario] = useState<{ evento: Evento | null } | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await api<{ eventos: Evento[] }>("GET", `/api/processos/${p.id}/eventos`);
      setLista(r.eventos);
      setErro("");
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  }, [p.id]);
  useEffect(() => void carregar(), [carregar]);

  const botaoNovo = p.ativo ? (
    <Botao onClick={() => setFormulario({ evento: null })}>
      <Plus size={18} aria-hidden="true" />
      Novo evento
    </Botao>
  ) : null;

  if (erro) return <EstadoErro acao={<Botao variante="secundario" onClick={() => void carregar()}>Tentar de novo</Botao>}>{erro}</EstadoErro>;
  if (lista === null) return <EsqueletoLinhas linhas={3} />;

  return (
    <div className="pilha">
      <div className="abas-acao">
        <p className="texto-pequeno" style={{ margin: 0 }}>
          Eventos ligados a este processo, em ordem de data. <Link para="/agenda">Abrir a agenda</Link>
        </p>
        {lista.length > 0 && botaoNovo}
      </div>
      {lista.length === 0 ? (
        <EstadoVazio icone={CalendarDays} titulo="Nenhum evento neste processo" {...(botaoNovo ? { acao: botaoNovo } : {})}>
          Cadastre audiências, reuniões e diligências deste processo.
        </EstadoVazio>
      ) : (
        <ul className="agenda-lista" aria-label="Eventos do processo">
          {lista.map((e) => (
            <li key={e.id}>
              <ItemEvento evento={e} aoAbrir={setAberto} mostrarData />
            </li>
          ))}
        </ul>
      )}
      <EventoDetalhe
        evento={aberto}
        aoFechar={() => setAberto(null)}
        aoEditar={(e) => {
          setAberto(null);
          setFormulario({ evento: e });
        }}
        aoApagado={() => {
          setAberto(null);
          void carregar();
        }}
      />
      <EventoFormulario
        aberto={formulario !== null}
        evento={formulario?.evento ?? null}
        dataPadrao={hojeEm()}
        processoFixo={{ id: p.id, numero_cnj: p.numero_cnj }}
        usuarios={usuarios}
        aoFechar={() => setFormulario(null)}
        aoSalvar={() => {
          const novo = formulario?.evento === null;
          setFormulario(null);
          avisar(novo ? "Evento cadastrado." : "Evento atualizado.");
          void carregar();
        }}
      />
    </div>
  );
}
