import { CircleCheck, ExternalLink, Link2, MailOpen, Mail, Scale } from "lucide-react";
import { useState } from "react";
import { ErroApi, api, formatarData } from "../api";
import { Link } from "../roteador";
import { Aviso, Botao, Modal, Selo, SeletorBusca, useToast } from "../ui";
import { Dado } from "./abas-comuns";
import { buscarProcessos } from "./buscas";
import { cnjFormatado } from "./processos-comum";
import { ResumoIntimacao } from "./ResumoIntimacao";

export interface OabIntimacao {
  id: string;
  numero: string;
  sufixo: string | null;
  uf: string;
  advogado_nome: string;
}

export interface Intimacao {
  id: string;
  numero_processo: string | null;
  tribunal: string | null;
  orgao: string | null;
  tipo: string | null;
  tipo_documento: string | null;
  classe: string | null;
  data_disponibilizacao: string | null;
  link: string | null;
  cancelada: boolean;
  processo_id: string | null;
  processo_cnj: string | null;
  vinculo: "cnj" | "manual" | null;
  lida: boolean;
  lida_em: string | null;
  oabs: OabIntimacao[];
  /** Só na lista. */
  previa?: string;
  /** Só no detalhe. */
  texto?: string;
}

export const AVISO_VALOR_LEGAL = "O texto com valor legal é o publicado no Diário. O sistema é um auxílio.";

/** Avisa o menu lateral (selo de não lidas) de que a contagem mudou. */
export const EVENTO_INTIMACOES = "intimacoes:mudou";
export const avisarMudancaIntimacoes = () => window.dispatchEvent(new Event(EVENTO_INTIMACOES));

export function diaBr(d: string | null): string {
  return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—";
}

/** Número do processo para exibir: com máscara se tiver 20 dígitos; senão, como veio no Diário. */
export function numeroIntimacao(n: string | null): string {
  if (!n) return "Sem número informado";
  return /^\d{20}$/.test(n) ? cnjFormatado(n) : n;
}

export const rotuloOab = (o: OabIntimacao) => `OAB ${o.numero}${o.sufixo ?? ""}/${o.uf}`;

export function SeloLida({ i }: { i: Pick<Intimacao, "lida"> }) {
  return i.lida ? (
    <Selo icone={MailOpen}>Lida</Selo>
  ) : (
    <Selo tom="info" icone={Mail}>
      Nova
    </Selo>
  );
}

export function SeloVinculo({ i }: { i: Pick<Intimacao, "processo_id"> }) {
  return i.processo_id ? (
    <Selo tom="bom" icone={CircleCheck}>
      No processo
    </Selo>
  ) : (
    <Selo tom="aviso" icone={Link2}>
      Sem processo
    </Selo>
  );
}

/**
 * Painel com o texto integral da intimação. Marcar como lida/não lida e vincular a processo (só se o número não bateu).
 * O texto é mostrado como texto puro (nunca como HTML).
 */
export function IntimacaoDetalhe({ intimacao, aberto, aoFechar, aoMudar }: { intimacao: Intimacao | null; aberto: boolean; aoFechar: () => void; aoMudar: (i: Intimacao) => void }) {
  const { avisar } = useToast();
  const [ocupado, setOcupado] = useState(false);
  const [vinculando, setVinculando] = useState(false);
  const [escolhido, setEscolhido] = useState<{ id: string; rotulo: string } | null>(null);
  const [erro, setErro] = useState("");

  if (!intimacao) return null;
  const i = intimacao;

  const chamar = async (caminho: string, corpo?: unknown, mensagem?: string) => {
    setOcupado(true);
    setErro("");
    try {
      const r = await api<{ intimacao: Intimacao }>("POST", `/api/intimacoes/${i.id}/${caminho}`, corpo);
      aoMudar(r.intimacao);
      avisarMudancaIntimacoes();
      if (mensagem) avisar(mensagem);
      return true;
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const fechar = () => {
    setVinculando(false);
    setEscolhido(null);
    setErro("");
    aoFechar();
  };

  return (
    <Modal aberto={aberto} aoFechar={fechar} titulo="Intimação" descricao={`${numeroIntimacao(i.numero_processo)} · ${diaBr(i.data_disponibilizacao)}`}>
      <div className="intimacao-detalhe">
        <p className="linha-flex" style={{ margin: 0 }}>
          <SeloLida i={i} />
          <SeloVinculo i={i} />
          {i.cancelada && (
            <Selo tom="critico" icone={Scale}>
              Cancelada no Diário
            </Selo>
          )}
        </p>
        <Aviso tipo="atencao">{AVISO_VALOR_LEGAL}</Aviso>
        <dl className="lista-dados">
          <Dado rotulo="Disponibilizada em" valor={diaBr(i.data_disponibilizacao)} />
          <Dado rotulo="Tribunal" valor={i.tribunal} />
          <Dado rotulo="Órgão" valor={i.orgao} />
          <Dado rotulo="Tipo" valor={[i.tipo, i.tipo_documento].filter(Boolean).join(" · ")} />
          <Dado rotulo="Classe" valor={i.classe} />
          <Dado rotulo="Encontrada na" valor={i.oabs.map(rotuloOab).join(", ")} />
        </dl>
        <section aria-label="Texto da publicação">
          <h3 className="intimacao-titulo-texto">Texto publicado</h3>
          {i.texto ? <div className="intimacao-texto" tabIndex={0}>{i.texto}</div> : <p className="texto-pequeno">A publicação não trouxe texto.</p>}
        </section>
        <ResumoIntimacao intimacaoId={i.id} temTexto={Boolean(i.texto && i.texto.trim())} />
        {i.link && (
          <p style={{ margin: 0 }}>
            <a href={i.link} target="_blank" rel="noopener noreferrer">
              Abrir a publicação no site do tribunal <ExternalLink size={14} aria-hidden="true" />
            </a>
          </p>
        )}

        {i.processo_id ? (
          <p style={{ margin: 0 }}>
            Processo: <Link para={`/processos/${i.processo_id}`}>{numeroIntimacao(i.processo_cnj)}</Link>
            {i.vinculo === "manual" ? " (vinculado por você ou pela equipe)" : ""}
          </p>
        ) : vinculando ? (
          <div className="pilha">
            <SeletorBusca rotulo="Processo do escritório" ajuda="Escolha o processo a que esta intimação pertence." valor={escolhido?.id ?? null} rotuloAtual={escolhido?.rotulo ?? ""} buscar={buscarProcessos} aoMudar={(o) => setEscolhido(o ? { id: o.id, rotulo: o.rotulo } : null)} vazio="Nenhum processo ativo encontrado. Cadastre o processo primeiro." />
            <div className="linha-flex">
              <Botao carregando={ocupado} disabled={!escolhido} onClick={() => void chamar("processo", { processo_id: escolhido?.id }, "Intimação vinculada ao processo.").then((ok) => ok && setVinculando(false))}>
                Vincular
              </Botao>
              <Botao variante="fantasma" onClick={() => setVinculando(false)}>
                Cancelar
              </Botao>
            </div>
          </div>
        ) : (
          <p className="linha-flex" style={{ margin: 0 }}>
            <span className="texto-pequeno">O número desta intimação não bateu com nenhum processo cadastrado.</span>
            <Botao variante="secundario" tamanho="pequeno" onClick={() => setVinculando(true)}>
              <Link2 size={16} aria-hidden="true" />
              Vincular a um processo
            </Botao>
          </p>
        )}

        {erro && <Aviso>{erro}</Aviso>}
        <div className="modal-rodape">
          <Botao variante="fantasma" onClick={fechar}>
            Fechar
          </Botao>
          {i.lida ? (
            <Botao variante="secundario" carregando={ocupado} onClick={() => void chamar("nao-lida", undefined, "Marcada como não lida.")}>
              <Mail size={18} aria-hidden="true" />
              Marcar como não lida
            </Botao>
          ) : (
            <Botao carregando={ocupado} onClick={() => void chamar("lida", undefined, "Marcada como lida.")}>
              <MailOpen size={18} aria-hidden="true" />
              Marcar como lida
            </Botao>
          )}
        </div>
        {i.lida && i.lida_em && <p className="texto-pequeno" style={{ margin: 0 }}>Lida em {formatarData(i.lida_em)}.</p>}
      </div>
    </Modal>
  );
}
