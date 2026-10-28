import { CircleCheck, CircleX, FilePen, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ErroApi, api, formatarData } from "../api";
import { useSessao } from "../sessao";
import { Aviso, AreaTexto, Botao, Confirmar, Selo, useToast } from "../ui";

export interface ResumoIa {
  id: string;
  texto: string;
  modelo: string;
  situacao: "rascunho" | "aprovado" | "rejeitado";
  decidido_em: string | null;
  atualizado_em: string;
}
interface UsoIa {
  usado: number;
  limite: number;
  restante: number;
}
interface Estado {
  resumo: ResumoIa | null;
  uso: UsoIa;
  texto_cortado?: boolean;
}

const LIMITE_TEXTO = 4000;

function SeloResumo({ situacao }: { situacao: ResumoIa["situacao"] }) {
  if (situacao === "aprovado") return <Selo tom="bom" icone={CircleCheck}>Aprovado</Selo>;
  if (situacao === "rejeitado") return <Selo tom="neutro" icone={CircleX}>Rejeitado</Selo>;
  return <Selo tom="aviso" icone={FilePen}>Rascunho: falta revisar</Selo>;
}

/** Seção "Resumo em linguagem simples" do painel da intimação. Só um resumo aprovado poderá ir ao portal do cliente (futuro). */
export function ResumoIntimacao({ intimacaoId, temTexto }: { intimacaoId: string; temTexto: boolean }) {
  const { eu } = useSessao();
  const { avisar } = useToast();
  const perfil = eu?.usuario.perfil;
  const podeRevisar = perfil === "socio" || perfil === "advogado";
  const [estado, setEstado] = useState<Estado | null>(null);
  const [carregandoInicial, setCarregandoInicial] = useState(true);
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState<"" | "gerar" | "salvar" | "aprovar" | "rejeitar">("");
  const [erro, setErro] = useState("");
  const [cortado, setCortado] = useState(false);
  const [confirmandoRetirada, setConfirmandoRetirada] = useState(false);

  const aplicar = (e: Estado) => {
    setEstado(e);
    setTexto(e.resumo?.texto ?? "");
  };

  const carregar = useCallback(() => {
    setCarregandoInicial(true);
    setErro("");
    api<Estado>("GET", `/api/intimacoes/${intimacaoId}/resumo`)
      .then(aplicar)
      .catch((e) => setErro(e instanceof ErroApi ? e.message : "Não foi possível carregar o resumo."))
      .finally(() => setCarregandoInicial(false));
  }, [intimacaoId]);

  useEffect(() => {
    setCortado(false);
    carregar();
  }, [carregar]);

  const executar = async (qual: typeof ocupado, metodo: string, caminho: string, corpo?: unknown, mensagem?: string) => {
    setOcupado(qual);
    setErro("");
    try {
      const r = await api<Estado>(metodo, `/api/intimacoes/${intimacaoId}/resumo${caminho}`, corpo);
      aplicar(r);
      if (qual === "gerar") setCortado(r.texto_cortado === true);
      if (mensagem) avisar(mensagem);
      return true;
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado. Tente novamente.");
      // Cota esgotada ou outra mudança no servidor: atualiza o contador.
      if (e instanceof ErroApi && e.status === 429) carregar();
      return false;
    } finally {
      setOcupado("");
    }
  };

  const resumo = estado?.resumo ?? null;
  const uso = estado?.uso;
  const semIa = uso !== undefined && uso.limite === 0;
  const alterado = resumo !== null && texto.trim() !== resumo.texto;

  const aprovar = async () => {
    // Aprova o que está na tela: se o texto foi mexido, salva antes.
    if (alterado && !(await executar("salvar", "PUT", "", { texto }))) return;
    await executar("aprovar", "POST", "/aprovar", undefined, "Resumo aprovado.");
  };

  return (
    <section className="resumo-ia" aria-labelledby={`resumo-ia-${intimacaoId}`}>
      <div className="resumo-ia-cabecalho">
        <h3 id={`resumo-ia-${intimacaoId}`} className="intimacao-titulo-texto" style={{ margin: 0 }}>
          Resumo em linguagem simples
        </h3>
        {resumo && <SeloResumo situacao={resumo.situacao} />}
      </div>

      {carregandoInicial && <p className="texto-pequeno" role="status">Carregando...</p>}

      {!carregandoInicial && semIa && <Aviso tipo="info">O plano do seu escritório não inclui resumos por IA. Peça a troca de plano para usar este recurso.</Aviso>}

      {!carregandoInicial && !semIa && uso && (
        <p className="texto-pequeno resumo-ia-uso" role="status">
          Hoje: {uso.usado} de {uso.limite} resumos por IA usados ({uso.restante} restantes).
        </p>
      )}

      {!carregandoInicial && !semIa && !resumo && (
        <p className="texto-pequeno" style={{ margin: 0 }}>
          {temTexto ? "Ainda não há resumo. A IA lê o texto publicado e escreve uma explicação curta para o cliente leigo." : "A publicação não trouxe texto para resumir."}
        </p>
      )}

      {resumo && (
        <>
          {resumo.situacao !== "rejeitado" && <Aviso tipo="atencao">Revise antes de aprovar; a IA pode errar. Não é aconselhamento jurídico.</Aviso>}
          {resumo.situacao === "rascunho" && podeRevisar ? (
            <AreaTexto rotulo="Texto do resumo" rows={7} maxLength={LIMITE_TEXTO} value={texto} onChange={(e) => setTexto(e.target.value)} ajuda={`${texto.length} de ${LIMITE_TEXTO} caracteres. Você pode corrigir o texto antes de aprovar.`} />
          ) : (
            <div className="intimacao-texto resumo-ia-texto" tabIndex={0} aria-label="Texto do resumo">
              {resumo.texto}
            </div>
          )}
          {cortado && <Aviso tipo="info">A publicação é muito longa: a IA leu só o começo do texto.</Aviso>}
          {resumo.situacao === "aprovado" && resumo.decidido_em && (
            <p className="texto-pequeno" style={{ margin: 0 }}>
              Aprovado em {formatarData(resumo.decidido_em)}. Quando o portal do cliente existir, só resumos aprovados poderão ser publicados nele.
            </p>
          )}
          {resumo.situacao === "rejeitado" && <p className="texto-pequeno" style={{ margin: 0 }}>Este resumo foi rejeitado e não será usado. Você pode gerar outro.</p>}
        </>
      )}

      {erro && <Aviso>{erro}</Aviso>}

      {!carregandoInicial && !semIa && !podeRevisar && (
        <p className="texto-pequeno" style={{ margin: 0 }}>Só sócio ou advogado pode gerar e aprovar resumos.</p>
      )}

      {!carregandoInicial && !semIa && podeRevisar && (
        <div className="linha-flex resumo-ia-acoes">
          {resumo?.situacao === "rascunho" && (
            <>
              <Botao carregando={ocupado === "aprovar" || ocupado === "salvar"} disabled={texto.trim().length === 0 || ocupado !== ""} onClick={() => void aprovar()}>
                <CircleCheck size={18} aria-hidden="true" />
                Aprovar
              </Botao>
              <Botao variante="secundario" carregando={ocupado === "salvar"} disabled={!alterado || texto.trim().length === 0 || ocupado !== ""} onClick={() => void executar("salvar", "PUT", "", { texto }, "Texto salvo.")}>
                Salvar texto
              </Botao>
              <Botao variante="secundario" carregando={ocupado === "rejeitar"} disabled={ocupado !== ""} onClick={() => void executar("rejeitar", "POST", "/rejeitar", undefined, "Resumo rejeitado.")}>
                <CircleX size={18} aria-hidden="true" />
                Rejeitar
              </Botao>
            </>
          )}
          {resumo?.situacao === "aprovado" && (
            <Botao variante="secundario" disabled={ocupado !== ""} onClick={() => setConfirmandoRetirada(true)}>
              Retirar aprovação
            </Botao>
          )}
          {resumo?.situacao !== "aprovado" && (
            <Botao
              variante={resumo ? "fantasma" : "primario"}
              carregando={ocupado === "gerar"}
              disabled={!temTexto || ocupado !== "" || (uso !== undefined && uso.restante === 0)}
              onClick={() => void executar("gerar", "POST", "/gerar", undefined, "Resumo gerado. Revise antes de aprovar.")}
            >
              <Sparkles size={18} aria-hidden="true" />
              {resumo ? "Gerar outro resumo" : "Gerar resumo"}
            </Botao>
          )}
        </div>
      )}
      {uso !== undefined && uso.restante === 0 && !semIa && <Aviso tipo="atencao">A cota de hoje acabou. Ela volta amanhã, à meia-noite (horário de Brasília).</Aviso>}

      <Confirmar
        aberto={confirmandoRetirada}
        titulo="Retirar a aprovação?"
        rotuloConfirmar="Retirar aprovação"
        perigo
        carregando={ocupado === "rejeitar"}
        aoFechar={() => setConfirmandoRetirada(false)}
        aoConfirmar={() => void executar("rejeitar", "POST", "/rejeitar", undefined, "Aprovação retirada.").then(() => setConfirmandoRetirada(false))}
      >
        O resumo passa a ficar como rejeitado e deixa de poder ser publicado. Você poderá gerar outro.
      </Confirmar>
    </section>
  );
}
