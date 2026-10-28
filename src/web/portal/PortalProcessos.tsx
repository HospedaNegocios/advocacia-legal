import { ChevronRight, Scale } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ErroApi, api } from "../api";
import { SeloFase } from "../paginas/ProcessoFase";
import { cnjFormatado } from "../paginas/processos-comum";
import { Link } from "../roteador";
import { Botao, Cartao, CabecalhoPagina, EsqueletoLinhas, EstadoErro, EstadoVazio } from "../ui";
import { ListaDocumentos } from "./portal-comum";
import type { DocumentoPortal, ProcessoPortal } from "./portal-comum";

export function PortalProcessos({ aoSessaoExpirada }: { aoSessaoExpirada: () => void }) {
  const [processos, setProcessos] = useState<ProcessoPortal[] | null>(null);
  const [documentos, setDocumentos] = useState<DocumentoPortal[]>([]);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    try {
      const [p, d] = await Promise.all([api<{ processos: ProcessoPortal[] }>("GET", "/api/portal/processos"), api<{ documentos: DocumentoPortal[] }>("GET", "/api/portal/documentos")]);
      setProcessos(p.processos);
      setDocumentos(d.documentos);
      setErro("");
    } catch (e) {
      if (e instanceof ErroApi && e.status === 401) return aoSessaoExpirada();
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  }, [aoSessaoExpirada]);
  useEffect(() => void carregar(), [carregar]);

  return (
    <div className="pilha">
      <CabecalhoPagina titulo="Seus processos" descricao="Aqui aparece somente o que o seu escritório escolheu compartilhar com você." />
      {erro ? (
        <EstadoErro acao={<Botao variante="secundario" onClick={() => void carregar()}>Tentar de novo</Botao>}>{erro}</EstadoErro>
      ) : processos === null ? (
        <EsqueletoLinhas linhas={3} />
      ) : (
        <>
          <Cartao semPadding>
            {processos.length === 0 ? (
              <EstadoVazio icone={Scale} titulo="Nenhum processo compartilhado ainda">
                Quando o seu escritório publicar um processo, ele aparece aqui. Em caso de dúvida, fale com o seu advogado.
              </EstadoVazio>
            ) : (
              <ul className="portal-lista" aria-label="Seus processos">
                {processos.map((p) => (
                  <li key={p.id}>
                    <Link para={`/portal/processos/${p.id}`} className="portal-processo">
                      <span className="portal-processo-texto">
                        <strong>{cnjFormatado(p.numero_cnj)}</strong>
                        <small>{[p.tribunal, p.orgao].filter(Boolean).join(" · ") || "Processo judicial"}</small>
                      </span>
                      <SeloFase fase={p.fase} />
                      <ChevronRight size={18} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
          {documentos.length > 0 && (
            <Cartao titulo="Documentos compartilhados com você" subtitulo="Arquivos do seu cadastro que o escritório liberou.">
              <ListaDocumentos documentos={documentos} vazio="" rotulo="Documentos compartilhados" aoSessaoExpirada={aoSessaoExpirada} />
            </Cartao>
          )}
        </>
      )}
    </div>
  );
}
