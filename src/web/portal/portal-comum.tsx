import { Download, FileText } from "lucide-react";
import { ErroApi, api, formatarData } from "../api";
import { tamanhoLegivel } from "../paginas/clientes-comum";
import { Botao, EstadoVazio, useToast } from "../ui";

export interface ProcessoPortal {
  id: string;
  numero_cnj: string;
  fase: "Conhecimento" | "Recursal" | "Execução" | "Suspenso" | "Arquivado";
  tribunal: string | null;
  orgao: string | null;
}
export interface DocumentoPortal {
  id: string;
  nome: string;
  tipo_mime: string;
  tamanho_bytes: number;
  criado_em: string;
}

/** Lista de documentos compartilhados. O link de download vale 5 minutos e é gerado a cada clique. */
export function ListaDocumentos({ documentos, vazio, rotulo, aoSessaoExpirada }: { documentos: DocumentoPortal[]; vazio: string; rotulo: string; aoSessaoExpirada: () => void }) {
  const { avisar } = useToast();
  const baixar = async (d: DocumentoPortal) => {
    try {
      const r = await api<{ url: string }>("GET", `/api/portal/anexos/${d.id}/link`);
      window.location.assign(r.url);
    } catch (e) {
      if (e instanceof ErroApi && e.status === 401) return aoSessaoExpirada();
      avisar(e instanceof ErroApi ? e.message : "Algo deu errado.", "erro");
    }
  };
  if (documentos.length === 0) {
    return (
      <EstadoVazio icone={FileText} titulo="Nenhum documento" compacto>
        {vazio}
      </EstadoVazio>
    );
  }
  return (
    <ul className="lista-simples" aria-label={rotulo}>
      {documentos.map((d) => (
        <li key={d.id} className="item-lista">
          <div className="item-lista-texto">
            <strong>{d.nome}</strong>
            <small>
              {tamanhoLegivel(d.tamanho_bytes)} · adicionado em {formatarData(d.criado_em)}
            </small>
          </div>
          <Botao tamanho="pequeno" variante="secundario" onClick={() => void baixar(d)} aria-label={`Baixar ${d.nome}`}>
            <Download size={16} aria-hidden="true" />
            Baixar
          </Botao>
        </li>
      ))}
    </ul>
  );
}
