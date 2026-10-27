import { Search, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Botao } from "./Botao";
import { Entrada } from "./Campos";

export interface OpcaoBusca {
  id: string;
  rotulo: string;
  detalhe?: string | undefined;
}

/**
 * Escolha de um registro por busca (processo, cliente...). Sem escolha: campo de busca com lista de resultados.
 * Com escolha: mostra o item escolhido e o botão de trocar. Tudo por teclado.
 */
export function SeletorBusca({ rotulo, ajuda, valor, rotuloAtual, buscar, aoMudar, desativado, vazio }: { rotulo: string; ajuda?: string; valor: string | null; rotuloAtual: string; buscar: (texto: string) => Promise<OpcaoBusca[]>; aoMudar: (opcao: OpcaoBusca | null) => void; desativado?: boolean; vazio?: string }) {
  const idLista = useId();
  const [texto, setTexto] = useState("");
  const [opcoes, setOpcoes] = useState<OpcaoBusca[] | null>(null);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (valor || !aberto) return;
    let ativo = true;
    const t = setTimeout(() => {
      buscar(texto.trim())
        .then((r) => ativo && setOpcoes(r))
        .catch(() => ativo && setOpcoes([]));
    }, 250);
    return () => {
      ativo = false;
      clearTimeout(t);
    };
  }, [texto, valor, aberto, buscar]);

  if (valor) {
    return (
      <div className="campo">
        <span className="campo-rotulo">{rotulo}</span>
        <div className="seletor-escolhido">
          <span>{rotuloAtual}</span>
          {!desativado && (
            <Botao variante="fantasma" tamanho="pequeno" somenteIcone aria-label={`Remover ${rotulo.toLowerCase()}`} onClick={() => aoMudar(null)}>
              <X size={16} aria-hidden="true" />
            </Botao>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="campo">
      <Entrada rotulo={rotulo} type="search" autoComplete="off" placeholder="Digite para buscar" ajuda={ajuda ?? ""} value={texto} onChange={(e) => setTexto(e.target.value)} onFocus={() => setAberto(true)} aria-controls={idLista} />
      {aberto && (
        <ul className="seletor-lista" id={idLista} aria-label={`Resultados para ${rotulo.toLowerCase()}`}>
          {opcoes === null && <li className="seletor-aviso">Buscando...</li>}
          {opcoes?.length === 0 && (
            <li className="seletor-aviso">
              <Search size={14} aria-hidden="true" /> {vazio ?? "Nada encontrado."}
            </li>
          )}
          {opcoes?.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className="seletor-opcao"
                onClick={() => {
                  aoMudar(o);
                  setTexto("");
                  setAberto(false);
                }}
              >
                <strong>{o.rotulo}</strong>
                {o.detalhe && <small>{o.detalhe}</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
