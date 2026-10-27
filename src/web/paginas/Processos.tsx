import { Activity, Briefcase, CircleCheck, CirclePause, Plus, Search, UserX, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ErroApi, api, formatarDia } from "../api";
import { navegar } from "../roteador";
import { Barras, Botao, CabecalhoPagina, Cartao, Entrada, EsqueletoKpi, EsqueletoLinhas, EstadoErro, EstadoVazio, Indicador, Selecao, Selo, Tabela, useToast } from "../ui";
import type { Coluna } from "../ui";
import type { Cliente } from "./clientes-comum";
import { SeloFase } from "./ProcessoFase";
import { ProcessoFormulario } from "./ProcessoFormulario";
import { FASES, cnjFormatado, resumoPartes } from "./processos-comum";
import type { Fase, Processo, UsuarioDisponivel } from "./processos-comum";

interface Resumo {
  total_ativos: number;
  por_fase: Record<Fase, number>;
  sem_responsavel: number;
  andamentos_30_dias: number;
}
const POR_PAGINA = 20;

export function Processos() {
  const { avisar } = useToast();
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [lista, setLista] = useState<{ processos: Processo[]; total: number } | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioDisponivel[]>([]);
  const [erro, setErro] = useState("");
  const [texto, setTexto] = useState("");
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState("ativos");
  const [fase, setFase] = useState("");
  const [responsavel, setResponsavel] = useState("");
  // Filtro por cliente vem do link da tela do cliente (/processos?cliente=...).
  const [clienteId, setClienteId] = useState(() => new URLSearchParams(window.location.search).get("cliente") ?? "");
  const [clienteNome, setClienteNome] = useState("");
  const [pagina, setPagina] = useState(1);
  const [novo, setNovo] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setBusca(texto);
      setPagina(1);
    }, 300);
    return () => clearTimeout(t);
  }, [texto]);

  const carregarResumo = useCallback(() => {
    api<{ resumo: Resumo }>("GET", "/api/processos/resumo")
      .then((r) => setResumo(r.resumo))
      .catch(() => setResumo(null));
  }, []);
  useEffect(carregarResumo, [carregarResumo]);

  useEffect(() => {
    api<{ usuarios: UsuarioDisponivel[] }>("GET", "/api/processos/responsaveis-disponiveis")
      .then((r) => setUsuarios(r.usuarios))
      .catch(() => setUsuarios([]));
  }, []);

  useEffect(() => {
    if (!clienteId) {
      setClienteNome("");
      return;
    }
    api<{ cliente: Cliente }>("GET", `/api/clientes/${clienteId}`)
      .then((r) => setClienteNome(r.cliente.nome))
      .catch(() => setClienteNome("cliente não encontrado"));
  }, [clienteId]);

  const carregar = useCallback(async () => {
    try {
      const q = new URLSearchParams({ situacao, pagina: String(pagina), por_pagina: String(POR_PAGINA) });
      if (busca.trim()) q.set("busca", busca.trim());
      if (fase) q.set("fase", fase);
      if (responsavel) q.set("responsavel", responsavel);
      if (clienteId) q.set("cliente_id", clienteId);
      const r = await api<{ processos: Processo[]; total: number }>("GET", `/api/processos?${q.toString()}`);
      setLista(r);
      setErro("");
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  }, [busca, situacao, fase, responsavel, clienteId, pagina]);
  useEffect(() => void carregar(), [carregar]);

  const filtrando = busca.trim() !== "" || fase !== "" || responsavel !== "" || clienteId !== "" || situacao !== "ativos";
  const totalPaginas = lista ? Math.max(1, Math.ceil(lista.total / POR_PAGINA)) : 1;

  const colunas: Coluna<Processo>[] = [
    {
      chave: "numero",
      titulo: "Processo",
      principal: true,
      render: (p) => (
        <div className="celula-principal">
          <div>
            <a
              href={`/processos/${p.id}`}
              onClick={(e) => {
                e.preventDefault();
                navegar(`/processos/${p.id}`);
              }}
            >
              <strong className="numero-cnj">{cnjFormatado(p.numero_cnj)}</strong>
            </a>
            <small>{[p.classe, p.assunto].filter(Boolean).join(" · ") || [p.tribunal, p.comarca].filter(Boolean).join(" · ") || "Sem classe informada"}</small>
          </div>
        </div>
      ),
    },
    {
      chave: "partes",
      titulo: "Partes",
      render: (p) => {
        const r = resumoPartes(p.partes);
        if (p.partes.length === 0) return <span className="texto-pequeno">Nenhuma parte</span>;
        return (
          <div className="partes-resumo">
            <span>{r.ativo}</span>
            <small>contra {r.passivo}</small>
          </div>
        );
      },
    },
    { chave: "fase", titulo: "Fase", render: (p) => <SeloFase fase={p.fase} /> },
    {
      chave: "responsaveis",
      titulo: "Responsáveis",
      render: (p) =>
        p.responsaveis.length === 0 ? (
          <Selo tom="aviso" icone={UserX}>
            Sem responsável
          </Selo>
        ) : (
          p.responsaveis.map((r) => r.nome).join(", ")
        ),
    },
    {
      chave: "situacao",
      titulo: "Situação",
      render: (p) =>
        p.ativo ? (
          <Selo tom="bom" icone={CircleCheck}>
            Ativo
          </Selo>
        ) : (
          <Selo icone={CirclePause}>Desativado</Selo>
        ),
    },
    { chave: "criado", titulo: "Cadastro", render: (p) => formatarDia(p.criado_em), nowrap: true },
  ];

  const botaoNovo = (
    <Botao onClick={() => setNovo(true)}>
      <Plus size={18} aria-hidden="true" />
      Novo processo
    </Botao>
  );

  return (
    <>
      <CabecalhoPagina titulo="Processos" descricao="Processos do escritório pelo número CNJ, com partes, responsáveis e andamentos." migalhas={[{ rotulo: "Início", para: "/" }, { rotulo: "Processos" }]} acoes={botaoNovo} />

      <section aria-label="Resumo dos processos" className="grade grade-kpi" style={{ marginBottom: "var(--e-4)" }}>
        {resumo ? (
          <>
            <Indicador rotulo="Processos ativos" valor={resumo.total_ativos} icone={Briefcase} />
            <Indicador rotulo="Sem responsável" valor={resumo.sem_responsavel} icone={UserX} nota="processos ativos" />
            <Indicador rotulo="Andamentos" valor={resumo.andamentos_30_dias} icone={Activity} nota="nos últimos 30 dias" />
          </>
        ) : (
          <>
            <EsqueletoKpi />
            <EsqueletoKpi />
            <EsqueletoKpi />
          </>
        )}
      </section>

      {resumo && resumo.total_ativos > 0 && (
        <div style={{ marginBottom: "var(--e-4)" }}>
          <Cartao>
            <Barras
              titulo="Processos ativos por fase"
              subtitulo="Quantidade de processos em cada fase"
              medida="Processos"
              categoria="Fase"
              dados={FASES.map((f) => ({ chave: f, rotulo: f, valor: resumo.por_fase[f] }))}
            />
          </Cartao>
        </div>
      )}

      <Cartao semPadding>
        {clienteId && (
          <div className="filtro-ativo">
            <span>
              Processos do cliente <strong>{clienteNome || "…"}</strong>
            </span>
            <Botao
              variante="fantasma"
              tamanho="pequeno"
              onClick={() => {
                setClienteId("");
                setPagina(1);
                navegar("/processos", true);
              }}
            >
              <X size={16} aria-hidden="true" />
              Remover filtro
            </Botao>
          </div>
        )}
        <div className="barra-filtros barra-filtros-4">
          <div className="barra-filtros-busca">
            <Entrada rotulo="Buscar por número ou nome da parte" type="search" autoComplete="off" placeholder="Número CNJ ou nome da parte" value={texto} onChange={(e) => setTexto(e.target.value)} />
          </div>
          <Selecao rotulo="Fase" value={fase} onChange={(e) => (setFase(e.target.value), setPagina(1))}>
            <option value="">Todas</option>
            {FASES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Selecao>
          <Selecao rotulo="Responsável" value={responsavel} onChange={(e) => (setResponsavel(e.target.value), setPagina(1))}>
            <option value="">Todos</option>
            <option value="sem">Sem responsável</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </Selecao>
          <Selecao rotulo="Situação" value={situacao} onChange={(e) => (setSituacao(e.target.value), setPagina(1))}>
            <option value="ativos">Ativos</option>
            <option value="inativos">Desativados</option>
            <option value="todos">Todos</option>
          </Selecao>
        </div>
        {erro ? (
          <EstadoErro acao={<Botao variante="secundario" onClick={() => void carregar()}>Tentar de novo</Botao>}>{erro}</EstadoErro>
        ) : lista === null ? (
          <div style={{ padding: "var(--e-4)" }}>
            <EsqueletoLinhas linhas={5} />
          </div>
        ) : lista.processos.length === 0 ? (
          filtrando ? (
            <EstadoVazio icone={Search} titulo="Nenhum processo encontrado">
              Tente outro número, outro nome ou mude os filtros.
            </EstadoVazio>
          ) : (
            <EstadoVazio icone={Briefcase} titulo="Nenhum processo cadastrado" acao={botaoNovo}>
              Cadastre o primeiro processo pelo número CNJ para começar.
            </EstadoVazio>
          )
        ) : (
          <>
            <Tabela colunas={colunas} linhas={lista.processos} chaveLinha={(p) => p.id} legenda="Processos do escritório" />
            <div className="paginacao">
              <span className="texto-pequeno" role="status">
                {lista.total} {lista.total === 1 ? "processo" : "processos"} · página {pagina} de {totalPaginas}
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

      <ProcessoFormulario
        aberto={novo}
        processo={null}
        aoFechar={() => setNovo(false)}
        aoSalvar={(p) => {
          setNovo(false);
          avisar("Processo cadastrado.");
          navegar(`/processos/${p.id}`);
        }}
      />
    </>
  );
}
