import { CalendarDays, CalendarRange, Gavel, Link2Off, Mail, MailOpen, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ErroApi, api, formatarData } from "../api";
import { Link } from "../roteador";
import { useSessao } from "../sessao";
import { Aviso, Botao, CabecalhoPagina, Cartao, Entrada, EsqueletoKpi, EsqueletoLinhas, EstadoErro, EstadoVazio, Indicador, Selecao, Tabela, useToast } from "../ui";
import type { Coluna } from "../ui";
import { AVISO_VALOR_LEGAL, IntimacaoDetalhe, SeloLida, SeloVinculo, avisarMudancaIntimacoes, diaBr, numeroIntimacao, rotuloOab } from "./intimacoes-comum";
import type { Intimacao, OabIntimacao } from "./intimacoes-comum";

interface Resumo {
  total: number;
  nao_lidas: number;
  hoje: number;
  ultimos_7_dias: number;
  sem_processo: number;
}
interface RespostaResumo {
  resumo: Resumo;
  tribunais: string[];
  oabs: (OabIntimacao & { ativo: boolean })[];
  busca: { ultima_sucesso_em: string | null; ultima: { resultado: "sucesso" | "erro" | "bloqueado" | null; em: string | null; origem: string } | null };
}
const POR_PAGINA = 20;

export function Intimacoes() {
  const { eu } = useSessao();
  const { avisar } = useToast();
  const ehSocio = eu?.usuario.perfil === "socio";
  const [resumo, setResumo] = useState<RespostaResumo | null>(null);
  const [lista, setLista] = useState<{ intimacoes: Intimacao[]; total: number } | null>(null);
  const [erro, setErro] = useState("");
  const [texto, setTexto] = useState("");
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState("nao_lidas");
  const [tribunal, setTribunal] = useState("");
  const [oab, setOab] = useState("");
  const [vinculo, setVinculo] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [pagina, setPagina] = useState(1);
  const [aberta, setAberta] = useState<Intimacao | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [marcando, setMarcando] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setBusca(texto);
      setPagina(1);
    }, 300);
    return () => clearTimeout(t);
  }, [texto]);

  const carregarResumo = useCallback(() => {
    api<RespostaResumo>("GET", "/api/intimacoes/resumo")
      .then(setResumo)
      .catch(() => setResumo(null));
  }, []);
  useEffect(carregarResumo, [carregarResumo]);

  const carregar = useCallback(async () => {
    try {
      const q = new URLSearchParams({ situacao, pagina: String(pagina), por_pagina: String(POR_PAGINA) });
      if (busca.trim()) q.set("busca", busca.trim());
      if (tribunal) q.set("tribunal", tribunal);
      if (oab) q.set("oab_id", oab);
      if (vinculo) q.set("vinculo", vinculo);
      if (de) q.set("de", de);
      if (ate) q.set("ate", ate);
      setLista(await api<{ intimacoes: Intimacao[]; total: number }>("GET", `/api/intimacoes?${q.toString()}`));
      setErro("");
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  }, [busca, situacao, tribunal, oab, vinculo, de, ate, pagina]);
  useEffect(() => void carregar(), [carregar]);

  const atualizarTudo = () => {
    carregarResumo();
    void carregar();
    avisarMudancaIntimacoes();
  };

  const filtrando = busca.trim() !== "" || tribunal !== "" || oab !== "" || vinculo !== "" || de !== "" || ate !== "" || situacao !== "nao_lidas";
  const totalPaginas = lista ? Math.max(1, Math.ceil(lista.total / POR_PAGINA)) : 1;
  const semOab = resumo !== null && resumo.oabs.filter((o) => o.ativo).length === 0;

  const buscarAgora = async () => {
    setBuscando(true);
    try {
      const r = await api<{ resultado: { novas: number; bloqueado: boolean; erro: number; sucesso: number } }>("POST", "/api/intimacoes/buscar");
      const x = r.resultado;
      if (x.bloqueado) avisar("O DJEN recusou a consulta. Tentaremos de novo amanhã.", "erro");
      else if (x.erro > 0 && x.sucesso === 0) avisar("Não foi possível buscar agora. Tentaremos de novo amanhã.", "erro");
      else avisar(x.novas === 0 ? "Busca concluída. Nenhuma intimação nova." : x.novas === 1 ? "Busca concluída. 1 intimação nova." : `Busca concluída. ${x.novas} intimações novas.`);
      setPagina(1);
      atualizarTudo();
    } catch (e) {
      avisar(e instanceof ErroApi ? e.message : "Algo deu errado.", "erro");
    } finally {
      setBuscando(false);
    }
  };

  const marcarPagina = async () => {
    if (!lista) return;
    const ids = lista.intimacoes.filter((i) => !i.lida).map((i) => i.id);
    if (ids.length === 0) return;
    setMarcando(true);
    try {
      await api("POST", "/api/intimacoes/lidas", { ids });
      avisar(ids.length === 1 ? "1 intimação marcada como lida." : `${ids.length} intimações marcadas como lidas.`);
      atualizarTudo();
    } catch (e) {
      avisar(e instanceof ErroApi ? e.message : "Algo deu errado.", "erro");
    } finally {
      setMarcando(false);
    }
  };

  const marcarUma = async (i: Intimacao) => {
    try {
      await api("POST", `/api/intimacoes/${i.id}/lida`);
      atualizarTudo();
    } catch (e) {
      avisar(e instanceof ErroApi ? e.message : "Algo deu errado.", "erro");
    }
  };

  const colunas: Coluna<Intimacao>[] = [
    { chave: "data", titulo: "Publicada em", render: (i) => diaBr(i.data_disponibilizacao), nowrap: true },
    {
      chave: "intimacao",
      titulo: "Intimação",
      principal: true,
      render: (i) => (
        <div className="intimacao-celula">
          <strong className="numero-cnj">{numeroIntimacao(i.numero_processo)}</strong>
          <small>{[i.tipo, i.orgao, i.tribunal].filter(Boolean).join(" · ") || "Sem detalhes do órgão"}</small>
          {i.previa && <span className="intimacao-previa">{i.previa}</span>}
        </div>
      ),
    },
    {
      chave: "situacao",
      titulo: "Situação",
      render: (i) => (
        <div className="intimacao-selos">
          <SeloLida i={i} />
          <SeloVinculo i={i} />
        </div>
      ),
    },
    {
      chave: "acoes",
      titulo: "Ações",
      acoes: true,
      render: (i) => (
        <div className="linha-flex">
          <Botao variante="secundario" tamanho="pequeno" onClick={() => setAberta(i)}>
            Abrir
          </Botao>
          {!i.lida && (
            <Botao variante="fantasma" tamanho="pequeno" onClick={() => void marcarUma(i)}>
              <MailOpen size={16} aria-hidden="true" />
              Marcar como lida
            </Botao>
          )}
        </div>
      ),
    },
  ];

  const ultima = resumo?.busca.ultima;
  const botaoBuscar = ehSocio ? (
    <Botao variante="secundario" carregando={buscando} disabled={semOab} onClick={() => void buscarAgora()}>
      <RefreshCw size={18} aria-hidden="true" />
      {buscando ? "Buscando..." : "Buscar agora"}
    </Botao>
  ) : null;

  return (
    <>
      <CabecalhoPagina titulo="Intimações" descricao="Publicações do Diário de Justiça Eletrônico Nacional (DJEN) das OABs do escritório, buscadas todo dia de manhã." migalhas={[{ rotulo: "Início", para: "/" }, { rotulo: "Intimações" }]} acoes={botaoBuscar} />

      <Aviso tipo="atencao">{AVISO_VALOR_LEGAL}</Aviso>
      {semOab && (
        <Aviso tipo="info">
          Nenhuma OAB ativa cadastrada. <Link para="/escritorio">Cadastre a OAB na tela Escritório</Link> para começar a receber as intimações.
        </Aviso>
      )}
      {ultima?.resultado === "bloqueado" && <Aviso tipo="atencao">A última busca foi recusada pelo DJEN. O sistema tentará de novo na próxima busca diária.</Aviso>}
      {ultima?.resultado === "erro" && <Aviso tipo="atencao">A última busca não foi concluída (o DJEN não respondeu como esperado). O sistema tentará de novo na próxima busca diária.</Aviso>}

      <section aria-label="Resumo das intimações" className="grade grade-kpi" style={{ margin: "var(--e-4) 0" }}>
        {resumo ? (
          <>
            <Indicador rotulo="Não lidas" valor={resumo.resumo.nao_lidas} icone={Mail} nota={`de ${resumo.resumo.total} no total`} />
            <Indicador rotulo="Publicadas hoje" valor={resumo.resumo.hoje} icone={CalendarDays} />
            <Indicador rotulo="Últimos 7 dias" valor={resumo.resumo.ultimos_7_dias} icone={CalendarRange} nota="incluindo hoje" />
            <Indicador rotulo="Sem processo" valor={resumo.resumo.sem_processo} icone={Link2Off} nota="número não encontrado nos processos" />
          </>
        ) : (
          <>
            <EsqueletoKpi />
            <EsqueletoKpi />
            <EsqueletoKpi />
            <EsqueletoKpi />
          </>
        )}
      </section>
      {resumo && <p className="texto-pequeno" role="status">{resumo.busca.ultima_sucesso_em ? `Última busca concluída em ${formatarData(resumo.busca.ultima_sucesso_em)}.` : "Nenhuma busca concluída ainda."}</p>}

      <Cartao semPadding>
        <div className="barra-filtros barra-filtros-4">
          <div className="barra-filtros-busca">
            <Entrada rotulo="Buscar por número ou texto" type="search" autoComplete="off" placeholder="Número ou palavra" value={texto} onChange={(e) => setTexto(e.target.value)} />
          </div>
          <Selecao rotulo="Situação" value={situacao} onChange={(e) => (setSituacao(e.target.value), setPagina(1))}>
            <option value="nao_lidas">Não lidas</option>
            <option value="lidas">Lidas</option>
            <option value="todas">Todas</option>
          </Selecao>
          <Selecao rotulo="Tribunal" value={tribunal} onChange={(e) => (setTribunal(e.target.value), setPagina(1))}>
            <option value="">Todos</option>
            {resumo?.tribunais.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Selecao>
          <Selecao rotulo="OAB" value={oab} onChange={(e) => (setOab(e.target.value), setPagina(1))}>
            <option value="">Todas</option>
            {resumo?.oabs.map((o) => (
              <option key={o.id} value={o.id}>
                {rotuloOab(o)} · {o.advogado_nome}
              </option>
            ))}
          </Selecao>
          <Selecao rotulo="Processo" value={vinculo} onChange={(e) => (setVinculo(e.target.value), setPagina(1))}>
            <option value="">Todos</option>
            <option value="com">Com processo vinculado</option>
            <option value="sem">Sem processo vinculado</option>
          </Selecao>
          <Entrada rotulo="Publicada a partir de" type="date" value={de} onChange={(e) => (setDe(e.target.value), setPagina(1))} />
          <Entrada rotulo="Publicada até" type="date" value={ate} onChange={(e) => (setAte(e.target.value), setPagina(1))} />
        </div>
        {erro ? (
          <EstadoErro acao={<Botao variante="secundario" onClick={() => void carregar()}>Tentar de novo</Botao>}>{erro}</EstadoErro>
        ) : lista === null ? (
          <div style={{ padding: "var(--e-4)" }}>
            <EsqueletoLinhas linhas={5} />
          </div>
        ) : lista.intimacoes.length === 0 ? (
          filtrando ? (
            <EstadoVazio icone={Search} titulo="Nenhuma intimação encontrada">
              Tente outro número, outra palavra ou mude os filtros.
            </EstadoVazio>
          ) : (
            <EstadoVazio icone={Gavel} titulo="Nenhuma intimação não lida">
              {resumo && resumo.resumo.total > 0 ? "Você está em dia. Escolha \"Todas\" em Situação para rever as anteriores." : "As publicações das OABs do escritório aparecem aqui depois da próxima busca diária."}
            </EstadoVazio>
          )
        ) : (
          <>
            <div className="intimacoes-acoes-lista">
              <Botao variante="secundario" tamanho="pequeno" carregando={marcando} disabled={!lista.intimacoes.some((i) => !i.lida)} onClick={() => void marcarPagina()}>
                <MailOpen size={16} aria-hidden="true" />
                Marcar esta página como lida
              </Botao>
            </div>
            <Tabela colunas={colunas} linhas={lista.intimacoes} chaveLinha={(i) => i.id} legenda="Intimações do DJEN" />
            <div className="paginacao">
              <span className="texto-pequeno" role="status">
                {lista.total} {lista.total === 1 ? "intimação" : "intimações"} · página {pagina} de {totalPaginas}
              </span>
              <div className="paginacao-botoes">
                <Botao variante="secundario" tamanho="pequeno" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>
                  Anterior
                </Botao>
                <Botao variante="secundario" tamanho="pequeno" disabled={pagina >= totalPaginas} onClick={() => setPagina(pagina + 1)}>
                  Próxima
                </Botao>
              </div>
            </div>
          </>
        )}
      </Cartao>

      <DetalheCarregado resumida={aberta} aoFechar={() => setAberta(null)} aoMudar={atualizarTudo} />
    </>
  );
}

/** Busca o texto integral ao abrir (a lista só traz a prévia). */
function DetalheCarregado({ resumida, aoFechar, aoMudar }: { resumida: Intimacao | null; aoFechar: () => void; aoMudar: () => void }) {
  const { avisar } = useToast();
  const [completa, setCompleta] = useState<Intimacao | null>(null);
  const id = resumida?.id ?? null;
  useEffect(() => {
    setCompleta(null);
    if (!id) return;
    let ativo = true;
    api<{ intimacao: Intimacao }>("GET", `/api/intimacoes/${id}`)
      .then((r) => ativo && setCompleta(r.intimacao))
      .catch((e) => {
        if (!ativo) return;
        avisar(e instanceof ErroApi ? e.message : "Algo deu errado.", "erro");
        aoFechar();
      });
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  if (!resumida || !completa) return null;
  return (
    <IntimacaoDetalhe
      intimacao={completa}
      aberto
      aoFechar={aoFechar}
      aoMudar={(i) => {
        setCompleta(i);
        aoMudar();
      }}
    />
  );
}
