import { History, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ErroApi, api, formatarData } from "../api";
import { diaBr } from "../paginas/clientes-comum";
import { SeloFase } from "../paginas/ProcessoFase";
import { cnjFormatado } from "../paginas/processos-comum";
import { Botao, Cartao, CabecalhoPagina, EsqueletoLinhas, EstadoErro, EstadoVazio } from "../ui";
import { ListaDocumentos } from "./portal-comum";
import type { DocumentoPortal, ProcessoPortal } from "./portal-comum";

interface Detalhe {
  processo: ProcessoPortal;
  andamentos: { id: string; data: string; descricao: string }[];
  resumos: { texto: string; data_disponibilizacao: string | null; publicado_em: string }[];
  documentos: DocumentoPortal[];
}

export function PortalProcesso({ id, aoSessaoExpirada }: { id: string; aoSessaoExpirada: () => void }) {
  const [d, setD] = useState<Detalhe | null>(null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    try {
      setD(await api<Detalhe>("GET", `/api/portal/processos/${encodeURIComponent(id)}`));
      setErro("");
    } catch (e) {
      if (e instanceof ErroApi && e.status === 401) return aoSessaoExpirada();
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  }, [id, aoSessaoExpirada]);
  useEffect(() => void carregar(), [carregar]);

  const migalhas = [{ rotulo: "Seus processos", para: "/portal" }, { rotulo: "Processo" }];
  if (erro) {
    return (
      <div className="pilha">
        <CabecalhoPagina titulo="Processo" migalhas={migalhas} />
        <EstadoErro acao={<Botao variante="secundario" onClick={() => void carregar()}>Tentar de novo</Botao>}>{erro}</EstadoErro>
      </div>
    );
  }
  if (!d) {
    return (
      <div className="pilha">
        <CabecalhoPagina titulo="Processo" migalhas={migalhas} />
        <EsqueletoLinhas linhas={4} />
      </div>
    );
  }
  const p = d.processo;
  return (
    <div className="pilha">
      <CabecalhoPagina titulo={cnjFormatado(p.numero_cnj)} descricao={[p.tribunal, p.orgao].filter(Boolean).join(" · ") || "Processo judicial"} migalhas={migalhas} />
      <p className="linha-flex" style={{ margin: 0 }}>
        <SeloFase fase={p.fase} />
      </p>

      <Cartao titulo="Resumos das publicações" subtitulo="Explicações em linguagem simples, revisadas pelo seu advogado.">
        {d.resumos.length === 0 ? (
          <EstadoVazio icone={Sparkles} titulo="Nenhum resumo publicado" compacto>
            Quando o seu advogado publicar um resumo, ele aparece aqui.
          </EstadoVazio>
        ) : (
          <ul className="lista-simples" aria-label="Resumos das publicações">
            {d.resumos.map((r, i) => (
              <li key={`${r.publicado_em}-${i}`} className="portal-resumo">
                <p className="portal-resumo-texto">{r.texto}</p>
                <small>{r.data_disponibilizacao ? `Publicação de ${diaBr(r.data_disponibilizacao)}` : `Publicado em ${formatarData(r.publicado_em)}`}</small>
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Cartao titulo="Andamentos">
        {d.andamentos.length === 0 ? (
          <EstadoVazio icone={History} titulo="Nenhum andamento compartilhado" compacto>
            O seu advogado escolhe quais andamentos mostrar aqui.
          </EstadoVazio>
        ) : (
          <ol className="linha-tempo" aria-label="Andamentos do processo">
            {d.andamentos.map((a) => (
              <li key={a.id} className="linha-tempo-item">
                <div className="linha-tempo-data">
                  <time dateTime={a.data}>{diaBr(a.data)}</time>
                </div>
                <div className="linha-tempo-corpo">
                  <p className="portal-texto-livre">{a.descricao}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Cartao>

      <Cartao titulo="Documentos">
        <ListaDocumentos documentos={d.documentos} vazio="Os documentos que o escritório compartilhar sobre este processo aparecem aqui." rotulo="Documentos do processo" aoSessaoExpirada={aoSessaoExpirada} />
      </Cartao>
    </div>
  );
}
