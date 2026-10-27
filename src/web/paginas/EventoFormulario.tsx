import { useEffect, useState } from "react";
import { FUSOS_ACEITOS, FUSO_PADRAO, instanteLocal, limitesDoDia, partesLocais } from "../../comum/fuso";
import { ErroApi, api } from "../api";
import { AreaTexto, Aviso, Botao, CampoMarcar, Entrada, Formulario, Modal, Selecao, SeletorBusca } from "../ui";
import { ROTULO_FUSO, ROTULO_TIPO_EVENTO, TIPOS_EVENTO } from "./agenda-comum";
import type { Evento, TipoEvento, UsuarioBasico } from "./agenda-comum";
import { buscarClientes, buscarProcessos } from "./buscas";
import { cnjFormatado } from "./processos-comum";

interface Campos {
  titulo: string;
  tipo: TipoEvento | "";
  fuso: string;
  dia_inteiro: boolean;
  data_inicio: string;
  hora_inicio: string;
  data_fim: string;
  hora_fim: string;
  local: string;
  descricao: string;
  processo_id: string | null;
  processo_rotulo: string;
  cliente_id: string | null;
  cliente_rotulo: string;
  participantes: string[];
}

function inicial(e: Evento | null, dataPadrao: string, processoFixo?: { id: string; numero_cnj: string }): Campos {
  if (e) {
    const i = partesLocais(Date.parse(e.inicio), e.fuso);
    const f = partesLocais(Date.parse(e.fim), e.fuso);
    return {
      titulo: e.titulo,
      tipo: e.tipo,
      fuso: e.fuso,
      dia_inteiro: e.dia_inteiro,
      data_inicio: i.data,
      hora_inicio: i.hora,
      data_fim: f.data,
      hora_fim: f.hora,
      local: e.local ?? "",
      descricao: e.descricao ?? "",
      processo_id: e.processo_id,
      processo_rotulo: e.processo_numero ? cnjFormatado(e.processo_numero) : "",
      cliente_id: e.cliente_id,
      cliente_rotulo: e.cliente_nome ?? "",
      participantes: e.participantes.filter((p) => p.ativo).map((p) => p.user_id),
    };
  }
  return {
    titulo: "",
    tipo: "",
    fuso: FUSO_PADRAO,
    dia_inteiro: false,
    data_inicio: dataPadrao,
    hora_inicio: "09:00",
    data_fim: dataPadrao,
    hora_fim: "10:00",
    local: "",
    descricao: "",
    processo_id: processoFixo?.id ?? null,
    processo_rotulo: processoFixo ? cnjFormatado(processoFixo.numero_cnj) : "",
    cliente_id: null,
    cliente_rotulo: "",
    participantes: [],
  };
}

/** Evento novo ou em edição, em janela. Os horários são enviados como instantes com o fuso escolhido. */
export function EventoFormulario({ aberto, evento, dataPadrao, processoFixo, usuarios, aoFechar, aoSalvar }: { aberto: boolean; evento: Evento | null; dataPadrao: string; processoFixo?: { id: string; numero_cnj: string } | undefined; usuarios: UsuarioBasico[]; aoFechar: () => void; aoSalvar: (e: Evento) => void }) {
  const [f, setF] = useState<Campos>(() => inicial(evento, dataPadrao, processoFixo));
  const [erro, setErro] = useState("");
  const [tentou, setTentou] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (aberto) {
      setF(inicial(evento, dataPadrao, processoFixo));
      setErro("");
      setTentou(false);
    }
  }, [aberto, evento, dataPadrao, processoFixo]);

  const fimAntes = f.data_fim && f.data_inicio && (f.dia_inteiro ? f.data_fim < f.data_inicio : `${f.data_fim}T${f.hora_fim}` < `${f.data_inicio}T${f.hora_inicio}`);
  const erros = {
    titulo: f.titulo.trim() ? undefined : "Informe o título do evento.",
    tipo: f.tipo ? undefined : "Escolha o tipo do evento.",
    data_inicio: f.data_inicio ? undefined : "Informe a data de início.",
    data_fim: !f.data_fim ? "Informe a data de fim." : fimAntes ? "O fim não pode ser antes do início." : undefined,
    hora_inicio: f.dia_inteiro || f.hora_inicio ? undefined : "Informe a hora de início.",
    hora_fim: f.dia_inteiro || f.hora_fim ? undefined : "Informe a hora de fim.",
  };
  const mostrar = (k: keyof typeof erros) => (tentou ? erros[k] : undefined);

  const salvar = async () => {
    setTentou(true);
    setErro("");
    if (Object.values(erros).some(Boolean)) return;
    setSalvando(true);
    try {
      const inicio = f.dia_inteiro ? limitesDoDia(f.data_inicio, f.fuso).inicio : instanteLocal(f.data_inicio, f.hora_inicio, f.fuso);
      const fim = f.dia_inteiro ? limitesDoDia(f.data_fim, f.fuso).fim : instanteLocal(f.data_fim, f.hora_fim, f.fuso);
      const corpo = {
        titulo: f.titulo,
        tipo: f.tipo,
        fuso: f.fuso,
        dia_inteiro: f.dia_inteiro,
        inicio: new Date(inicio).toISOString(),
        fim: new Date(fim).toISOString(),
        local: f.local || null,
        descricao: f.descricao || null,
        processo_id: f.processo_id,
        cliente_id: f.cliente_id,
        participantes: f.participantes,
      };
      const r = evento ? await api<{ evento: Evento }>("PUT", `/api/agenda/${evento.id}`, corpo) : await api<{ evento: Evento }>("POST", "/api/agenda", corpo);
      aoSalvar(r.evento);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    } finally {
      setSalvando(false);
    }
  };

  const alternarParticipante = (id: string, marcado: boolean) => setF({ ...f, participantes: marcado ? [...f.participantes, id] : f.participantes.filter((x) => x !== id) });
  // Usuários desativados que já participam continuam aparecendo para poderem ser removidos.
  const lista: UsuarioBasico[] = [...usuarios, ...(evento?.participantes ?? []).filter((p) => !usuarios.some((u) => u.id === p.user_id)).map((p) => ({ id: p.user_id, nome: `${p.nome} (desativado)`, perfil: null }))];

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={evento ? "Editar evento" : "Novo evento"} descricao="Audiências, reuniões e diligências aparecem na agenda de todo o escritório.">
      <Formulario aoEnviar={() => void salvar()}>
        <Entrada rotulo="Título" required maxLength={200} autoComplete="off" placeholder="Ex.: Audiência de instrução" erro={mostrar("titulo")} value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} />
        <Selecao rotulo="Tipo" required erro={mostrar("tipo")} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as TipoEvento | "" })}>
          <option value="">Selecione</option>
          {TIPOS_EVENTO.map((t) => (
            <option key={t} value={t}>
              {ROTULO_TIPO_EVENTO[t]}
            </option>
          ))}
        </Selecao>
        <CampoMarcar checked={f.dia_inteiro} onChange={(e) => setF({ ...f, dia_inteiro: e.target.checked })}>
          Dia inteiro
        </CampoMarcar>
        <div className="grade grade-2">
          <Entrada rotulo="Data de início" type="date" required erro={mostrar("data_inicio")} value={f.data_inicio} onChange={(e) => setF({ ...f, data_inicio: e.target.value, data_fim: f.data_fim < e.target.value ? e.target.value : f.data_fim })} />
          {!f.dia_inteiro && <Entrada rotulo="Hora de início" type="time" required erro={mostrar("hora_inicio")} value={f.hora_inicio} onChange={(e) => setF({ ...f, hora_inicio: e.target.value })} />}
          <Entrada rotulo="Data de fim" type="date" required erro={mostrar("data_fim")} value={f.data_fim} onChange={(e) => setF({ ...f, data_fim: e.target.value })} />
          {!f.dia_inteiro && <Entrada rotulo="Hora de fim" type="time" required erro={mostrar("hora_fim")} value={f.hora_fim} onChange={(e) => setF({ ...f, hora_fim: e.target.value })} />}
        </div>
        <Selecao rotulo="Fuso horário" value={f.fuso} onChange={(e) => setF({ ...f, fuso: e.target.value })} ajuda="Use o fuso do local do evento. O padrão é o horário de Brasília.">
          {FUSOS_ACEITOS.map((z) => (
            <option key={z} value={z}>
              {ROTULO_FUSO[z] ?? z}
            </option>
          ))}
        </Selecao>
        <Entrada rotulo="Local (opcional)" maxLength={200} autoComplete="off" placeholder="Ex.: Fórum Central, sala 4, ou link da videochamada" value={f.local} onChange={(e) => setF({ ...f, local: e.target.value })} />
        <SeletorBusca
          rotulo="Processo (opcional)"
          valor={f.processo_id}
          rotuloAtual={f.processo_rotulo}
          buscar={buscarProcessos}
          desativado={processoFixo !== undefined}
          vazio="Nenhum processo ativo encontrado."
          ajuda="Busque pelo número ou pelo nome de uma parte."
          aoMudar={(o) => setF({ ...f, processo_id: o?.id ?? null, processo_rotulo: o?.rotulo ?? "" })}
        />
        <SeletorBusca rotulo="Cliente (opcional)" valor={f.cliente_id} rotuloAtual={f.cliente_rotulo} buscar={buscarClientes} vazio="Nenhum cliente ativo encontrado." ajuda="Busque pelo nome do cliente." aoMudar={(o) => setF({ ...f, cliente_id: o?.id ?? null, cliente_rotulo: o?.rotulo ?? "" })} />
        <fieldset className="campo-grupo">
          <legend className="campo-rotulo">Participantes (opcional)</legend>
          {lista.length === 0 ? (
            <p className="texto-pequeno">Nenhum usuário disponível.</p>
          ) : (
            lista.map((u) => (
              <CampoMarcar key={u.id} checked={f.participantes.includes(u.id)} onChange={(e) => alternarParticipante(u.id, e.target.checked)}>
                {u.nome}
              </CampoMarcar>
            ))
          )}
        </fieldset>
        <AreaTexto rotulo="Descrição (opcional)" maxLength={2000} rows={3} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
        {erro && <Aviso>{erro}</Aviso>}
        <div className="modal-rodape">
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" carregando={salvando}>
            Salvar evento
          </Botao>
        </div>
      </Formulario>
    </Modal>
  );
}
