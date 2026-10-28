import { useEffect, useState } from "react";
import { ErroApi, api } from "../api";
import { navegar } from "../roteador";
import { AreaTexto, Aviso, Botao, CampoMarcar, EsqueletoLinhas, Formulario, Modal, useToast } from "../ui";

interface Vinculos {
  partes: number;
  responsaveis: number;
  andamentos: number;
  anexos: number;
  movimentacoes: number;
  prazos: number;
  eventos: number;
  lancamentos: number;
  intimacoes: number;
}

const MIN_MOTIVO = 10;
const MAX_MOTIVO = 500;

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Exclusão definitiva de um processo cadastrado por engano (só o sócio). Processo encerrado deve ser desativado. */
export function ApagarProcesso({ processoId, aberto, aoFechar }: { processoId: string; aberto: boolean; aoFechar: () => void }) {
  const { avisar } = useToast();
  const [vinculos, setVinculos] = useState<Vinculos | null>(null);
  const [erro, setErro] = useState("");
  const [motivo, setMotivo] = useState("");
  const [prazos, setPrazos] = useState(false);
  const [eventos, setEventos] = useState(false);
  const [lancamentos, setLancamentos] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setVinculos(null);
    setErro("");
    setMotivo("");
    setPrazos(false);
    setEventos(false);
    setLancamentos(false);
    api<{ vinculos: Vinculos }>("GET", `/api/processos/${processoId}/exclusao`)
      .then((r) => setVinculos(r.vinculos))
      .catch((e) => setErro(e instanceof ErroApi ? e.message : "Algo deu errado."));
  }, [aberto, processoId]);

  const valido = motivo.trim().length >= MIN_MOTIVO;

  const apagar = async () => {
    if (!valido || enviando) return;
    setEnviando(true);
    setErro("");
    try {
      await api("POST", `/api/processos/${processoId}/exclusao`, { justificativa: motivo.trim(), apagar_prazos: prazos, apagar_eventos: eventos, apagar_lancamentos: lancamentos });
      avisar("Processo apagado.");
      navegar("/processos");
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
      setEnviando(false);
    }
  };

  const sempre = vinculos
    ? [
        vinculos.partes > 0 && plural(vinculos.partes, "parte", "partes"),
        vinculos.responsaveis > 0 && plural(vinculos.responsaveis, "responsável", "responsáveis"),
        vinculos.andamentos > 0 && plural(vinculos.andamentos, "andamento", "andamentos"),
        vinculos.anexos > 0 && plural(vinculos.anexos, "documento", "documentos"),
        vinculos.movimentacoes > 0 && plural(vinculos.movimentacoes, "movimentação do DataJud", "movimentações do DataJud"),
      ].filter((x): x is string => x !== false)
    : [];

  return (
    <Modal aberto={aberto} aoFechar={enviando ? () => undefined : aoFechar} titulo="Apagar processo">
      <Formulario aoEnviar={() => void apagar()}>
        <Aviso tipo="atencao">
          Isto apaga o processo de forma definitiva e não pode ser desfeito. Se o processo apenas terminou ou foi arquivado, use &quot;Desativar&quot;: nada é perdido.
        </Aviso>
        {vinculos === null && !erro && <EsqueletoLinhas linhas={3} />}
        {vinculos && (
          <>
            <div>
              <strong>Será apagado junto com o processo:</strong>
              {sempre.length > 0 ? (
                <ul style={{ margin: "var(--e-2) 0 0", paddingLeft: "var(--e-5)" }}>
                  {sempre.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              ) : (
                <p style={{ margin: "var(--e-2) 0 0" }}>Nenhum dado além do cadastro do processo.</p>
              )}
            </div>
            {vinculos.intimacoes > 0 && (
              <p style={{ margin: 0 }}>
                {plural(vinculos.intimacoes, "intimação continua", "intimações continuam")} na lista de Intimações, sem processo.
              </p>
            )}
            {(vinculos.prazos > 0 || vinculos.eventos > 0 || vinculos.lancamentos > 0) && (
              <div className="pilha">
                {vinculos.prazos > 0 && (
                  <CampoMarcar checked={prazos} onChange={(e) => setPrazos(e.target.checked)}>
                    Apagar também {plural(vinculos.prazos, "prazo", "prazos")}
                  </CampoMarcar>
                )}
                {vinculos.eventos > 0 && (
                  <CampoMarcar checked={eventos} onChange={(e) => setEventos(e.target.checked)}>
                    Apagar também {plural(vinculos.eventos, "compromisso da agenda", "compromissos da agenda")}
                  </CampoMarcar>
                )}
                {vinculos.lancamentos > 0 && (
                  <CampoMarcar checked={lancamentos} onChange={(e) => setLancamentos(e.target.checked)}>
                    Apagar também {plural(vinculos.lancamentos, "lançamento do financeiro", "lançamentos do financeiro")}
                  </CampoMarcar>
                )}
                <p style={{ margin: 0, color: "var(--cor-texto-2)", fontSize: "var(--texto-sm)" }}>O que ficar desmarcado é mantido, apenas sem ligação com este processo.</p>
              </div>
            )}
          </>
        )}
        <AreaTexto
          rotulo="Motivo da exclusão"
          ajuda="Fica registrado no histórico do escritório."
          required
          minLength={MIN_MOTIVO}
          maxLength={MAX_MOTIVO}
          rows={3}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
        {erro && <Aviso>{erro}</Aviso>}
        <div className="modal-rodape">
          <Botao variante="secundario" onClick={aoFechar} disabled={enviando}>
            Cancelar
          </Botao>
          <Botao type="submit" variante="perigo" carregando={enviando} disabled={!valido || vinculos === null}>
            Apagar definitivamente
          </Botao>
        </div>
      </Formulario>
    </Modal>
  );
}
