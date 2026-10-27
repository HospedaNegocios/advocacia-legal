import { useEffect, useState } from "react";
import { ErroApi, api } from "../api";
import { useSessao } from "../sessao";
import { AreaTexto, Aviso, Botao, Entrada, Formulario, Modal, Selecao, SeletorBusca } from "../ui";
import { buscarProcessos } from "./buscas";
import type { Prazo, UsuarioBasico } from "./agenda-comum";
import { cnjFormatado } from "./processos-comum";

interface Campos {
  titulo: string;
  data_fatal: string;
  hora: string;
  responsavel_id: string;
  processo_id: string | null;
  processo_rotulo: string;
  descricao: string;
}

/**
 * Prazo novo ou em edição, em janela. `processoFixo` trava o processo (quando aberto pela aba do processo).
 * O servidor confere responsável e processo (do mesmo escritório, ativos).
 */
export function PrazoFormulario({ aberto, prazo, processoFixo, usuarios, aoFechar, aoSalvar }: { aberto: boolean; prazo: Prazo | null; processoFixo?: { id: string; numero_cnj: string } | undefined; usuarios: UsuarioBasico[]; aoFechar: () => void; aoSalvar: (p: Prazo) => void }) {
  const { eu } = useSessao();
  const [f, setF] = useState<Campos>({ titulo: "", data_fatal: "", hora: "", responsavel_id: "", processo_id: null, processo_rotulo: "", descricao: "" });
  const [erro, setErro] = useState("");
  const [tentou, setTentou] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setF({
      titulo: prazo?.titulo ?? "",
      data_fatal: prazo?.data_fatal ?? "",
      hora: prazo?.hora ?? "",
      responsavel_id: prazo?.responsavel_id ?? eu?.usuario.id ?? "",
      processo_id: prazo ? prazo.processo_id : (processoFixo?.id ?? null),
      processo_rotulo: prazo?.processo_numero ? cnjFormatado(prazo.processo_numero) : processoFixo ? cnjFormatado(processoFixo.numero_cnj) : "",
      descricao: prazo?.descricao ?? "",
    });
    setErro("");
    setTentou(false);
  }, [aberto, prazo, processoFixo, eu?.usuario.id]);

  const erros = {
    titulo: f.titulo.trim() ? undefined : "Informe o título do prazo.",
    data_fatal: f.data_fatal ? undefined : "Informe a data fatal.",
    responsavel_id: f.responsavel_id ? undefined : "Escolha o responsável.",
  };
  const mostrar = (k: keyof typeof erros) => (tentou ? erros[k] : undefined);

  const salvar = async () => {
    setTentou(true);
    setErro("");
    if (Object.values(erros).some(Boolean)) return;
    setSalvando(true);
    try {
      const corpo = { titulo: f.titulo, data_fatal: f.data_fatal, hora: f.hora || null, responsavel_id: f.responsavel_id, processo_id: f.processo_id, descricao: f.descricao || null };
      const r = prazo ? await api<{ prazo: Prazo }>("PUT", `/api/prazos/${prazo.id}`, corpo) : await api<{ prazo: Prazo }>("POST", "/api/prazos", corpo);
      aoSalvar(r.prazo);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={prazo ? "Editar prazo" : "Novo prazo"} descricao="Título, data fatal e responsável são obrigatórios. Os dias são contados no calendário comum, sem descontar feriados.">
      <Formulario aoEnviar={() => void salvar()}>
        <Entrada rotulo="Título" required maxLength={200} autoComplete="off" placeholder="Ex.: Contestação" erro={mostrar("titulo")} value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} />
        <div className="grade grade-2">
          <Entrada rotulo="Data fatal" type="date" required erro={mostrar("data_fatal")} value={f.data_fatal} onChange={(e) => setF({ ...f, data_fatal: e.target.value })} />
          <Entrada rotulo="Hora (opcional)" type="time" value={f.hora} onChange={(e) => setF({ ...f, hora: e.target.value })} />
        </div>
        <Selecao rotulo="Responsável" required erro={mostrar("responsavel_id")} value={f.responsavel_id} onChange={(e) => setF({ ...f, responsavel_id: e.target.value })}>
          <option value="">Selecione</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome}
            </option>
          ))}
        </Selecao>
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
        <AreaTexto rotulo="Descrição (opcional)" maxLength={2000} rows={3} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
        {erro && <Aviso>{erro}</Aviso>}
        <div className="modal-rodape">
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" carregando={salvando}>
            Salvar prazo
          </Botao>
        </div>
      </Formulario>
    </Modal>
  );
}
