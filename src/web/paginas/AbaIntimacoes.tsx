import { Gavel } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ErroApi, api } from "../api";
import { Link } from "../roteador";
import { Aviso, Botao, EsqueletoLinhas, EstadoErro, EstadoVazio } from "../ui";
import { AVISO_VALOR_LEGAL, IntimacaoDetalhe, SeloLida, avisarMudancaIntimacoes, diaBr } from "./intimacoes-comum";
import type { Intimacao } from "./intimacoes-comum";
import type { Processo } from "./processos-comum";

/** Aba "Intimações" do processo: as publicações do DJEN ligadas a ele, da mais recente para a mais antiga. */
export function AbaIntimacoes({ p }: { p: Processo }) {
  const [lista, setLista] = useState<{ intimacoes: Intimacao[]; total: number } | null>(null);
  const [erro, setErro] = useState("");
  const [aberta, setAberta] = useState<Intimacao | null>(null);

  const carregar = useCallback(async () => {
    try {
      setLista(await api<{ intimacoes: Intimacao[]; total: number }>("GET", `/api/intimacoes?processo_id=${p.id}&situacao=todas&por_pagina=50`));
      setErro("");
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  }, [p.id]);
  useEffect(() => void carregar(), [carregar]);

  const abrir = async (i: Intimacao) => {
    try {
      setAberta((await api<{ intimacao: Intimacao }>("GET", `/api/intimacoes/${i.id}`)).intimacao);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  };

  if (erro) return <EstadoErro acao={<Botao variante="secundario" onClick={() => void carregar()}>Tentar de novo</Botao>}>{erro}</EstadoErro>;
  if (lista === null) return <EsqueletoLinhas linhas={3} />;
  return (
    <div className="pilha">
      <Aviso tipo="atencao">{AVISO_VALOR_LEGAL}</Aviso>
      {lista.intimacoes.length === 0 ? (
        <EstadoVazio compacto icone={Gavel} titulo="Nenhuma intimação neste processo" acao={<Link para="/intimacoes">Abrir as intimações</Link>}>
          As publicações do DJEN que citarem o número deste processo aparecem aqui.
        </EstadoVazio>
      ) : (
        <ul className="lista-simples" aria-label="Intimações do processo">
          {lista.intimacoes.map((i) => (
            <li key={i.id} className="item-lista">
              <div className="item-lista-texto">
                <strong>
                  {diaBr(i.data_disponibilizacao)} · {i.tipo ?? "Publicação"}
                </strong>
                <small>{[i.orgao, i.tribunal].filter(Boolean).join(" · ") || "Sem detalhes do órgão"}</small>
              </div>
              <div className="linha-flex">
                <SeloLida i={i} />
                <Botao variante="secundario" tamanho="pequeno" onClick={() => void abrir(i)}>
                  Abrir
                </Botao>
              </div>
            </li>
          ))}
        </ul>
      )}
      {lista.total > lista.intimacoes.length && (
        <p className="texto-pequeno">
          Mostrando {lista.intimacoes.length} de {lista.total}. <Link para="/intimacoes">Ver todas nas Intimações</Link>
        </p>
      )}
      <IntimacaoDetalhe
        intimacao={aberta}
        aberto={aberta !== null}
        aoFechar={() => setAberta(null)}
        aoMudar={(i) => {
          setAberta(i);
          avisarMudancaIntimacoes();
          void carregar();
        }}
      />
    </div>
  );
}
