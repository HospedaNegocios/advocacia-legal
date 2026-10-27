import { Building2, CircleCheck, CirclePause, Plus, Search, UserPlus, UserRound, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ErroApi, api, formatarDia } from "../api";
import { navegar } from "../roteador";
import { Botao, CabecalhoPagina, Cartao, Empilhada, Entrada, EsqueletoKpi, EsqueletoLinhas, EstadoErro, EstadoVazio, Indicador, Selecao, Selo, Tabela, useToast } from "../ui";
import type { Coluna } from "../ui";
import { ClienteFormulario } from "./ClienteFormulario";
import { ROTULO_TIPO, documentoFormatado, telefoneFormatado } from "./clientes-comum";
import type { Cliente } from "./clientes-comum";

interface Resumo {
  ativos: number;
  pf: number;
  pj: number;
  novos_30_dias: number;
}
const POR_PAGINA = 20;

export function Clientes() {
  const { avisar } = useToast();
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [lista, setLista] = useState<{ clientes: Cliente[]; total: number } | null>(null);
  const [erro, setErro] = useState("");
  const [texto, setTexto] = useState("");
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState("ativos");
  const [tipo, setTipo] = useState("");
  const [pagina, setPagina] = useState(1);
  const [novo, setNovo] = useState(false);

  // A busca espera o usuário parar de digitar.
  useEffect(() => {
    const t = setTimeout(() => {
      setBusca(texto);
      setPagina(1);
    }, 300);
    return () => clearTimeout(t);
  }, [texto]);

  const carregarResumo = useCallback(() => {
    api<{ resumo: Resumo }>("GET", "/api/clientes/resumo")
      .then((r) => setResumo(r.resumo))
      .catch(() => setResumo(null));
  }, []);
  useEffect(carregarResumo, [carregarResumo]);

  const carregar = useCallback(async () => {
    try {
      const q = new URLSearchParams({ situacao, pagina: String(pagina), por_pagina: String(POR_PAGINA) });
      if (busca.trim()) q.set("busca", busca.trim());
      if (tipo) q.set("tipo", tipo);
      const r = await api<{ clientes: Cliente[]; total: number }>("GET", `/api/clientes?${q.toString()}`);
      setLista(r);
      setErro("");
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  }, [busca, situacao, tipo, pagina]);
  useEffect(() => void carregar(), [carregar]);

  const filtrando = busca.trim() !== "" || tipo !== "" || situacao !== "ativos";
  const totalPaginas = lista ? Math.max(1, Math.ceil(lista.total / POR_PAGINA)) : 1;

  const colunas: Coluna<Cliente>[] = [
    {
      chave: "nome",
      titulo: "Cliente",
      principal: true,
      render: (c) => (
        <div className="celula-principal">
          <div>
            <a
              href={`/clientes/${c.id}`}
              onClick={(e) => {
                e.preventDefault();
                navegar(`/clientes/${c.id}`);
              }}
            >
              <strong>{c.nome}</strong>
            </a>
            <small>{ROTULO_TIPO[c.tipo]}</small>
          </div>
        </div>
      ),
    },
    { chave: "doc", titulo: "CPF/CNPJ", render: (c) => documentoFormatado(c), nowrap: true },
    { chave: "contato", titulo: "Contato", render: (c) => (c.celular || c.telefone ? telefoneFormatado(c.celular ?? c.telefone) : (c.email ?? "—")) },
    {
      chave: "situacao",
      titulo: "Situação",
      render: (c) =>
        c.ativo ? (
          <Selo tom="bom" icone={CircleCheck}>
            Ativo
          </Selo>
        ) : (
          <Selo icone={CirclePause}>Desativado</Selo>
        ),
    },
    { chave: "criado", titulo: "Cadastro", render: (c) => formatarDia(c.criado_em), nowrap: true },
  ];

  const botaoNovo = (
    <Botao onClick={() => setNovo(true)}>
      <Plus size={18} aria-hidden="true" />
      Novo cliente
    </Botao>
  );

  return (
    <>
      <CabecalhoPagina titulo="Clientes" descricao="Cadastro de pessoas físicas e jurídicas atendidas pelo escritório." migalhas={[{ rotulo: "Início", para: "/" }, { rotulo: "Clientes" }]} acoes={botaoNovo} />

      <section aria-label="Resumo dos clientes" className="grade grade-kpi" style={{ marginBottom: "var(--e-4)" }}>
        {resumo ? (
          <>
            <Indicador rotulo="Clientes ativos" valor={resumo.ativos} icone={Users} />
            <Indicador rotulo="Novos nos últimos 30 dias" valor={resumo.novos_30_dias} icone={UserPlus} />
            <Indicador rotulo="Pessoas físicas" valor={resumo.pf} icone={UserRound} nota="clientes ativos" />
            <Indicador rotulo="Pessoas jurídicas" valor={resumo.pj} icone={Building2} nota="clientes ativos" />
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

      {resumo && resumo.ativos > 0 && (
        <div style={{ marginBottom: "var(--e-4)" }}>
          <Cartao>
            <Empilhada
              titulo="Clientes ativos por tipo"
              subtitulo="Pessoa física e pessoa jurídica"
              medida="Clientes"
              categoria="Tipo"
              segmentos={[
                { chave: "pf", rotulo: "Pessoa física", valor: resumo.pf, cor: "var(--serie-1)" },
                { chave: "pj", rotulo: "Pessoa jurídica", valor: resumo.pj, cor: "var(--serie-2)", textoEscuro: true },
              ]}
            />
          </Cartao>
        </div>
      )}

      <Cartao semPadding>
        <div className="barra-filtros">
          <div className="barra-filtros-busca">
            <Entrada rotulo="Buscar por nome ou CPF/CNPJ" type="search" autoComplete="off" placeholder="Digite parte do nome ou do documento" value={texto} onChange={(e) => setTexto(e.target.value)} />
          </div>
          <Selecao rotulo="Situação" value={situacao} onChange={(e) => (setSituacao(e.target.value), setPagina(1))}>
            <option value="ativos">Ativos</option>
            <option value="inativos">Desativados</option>
            <option value="todos">Todos</option>
          </Selecao>
          <Selecao rotulo="Tipo" value={tipo} onChange={(e) => (setTipo(e.target.value), setPagina(1))}>
            <option value="">Todos</option>
            <option value="pf">Pessoa física</option>
            <option value="pj">Pessoa jurídica</option>
          </Selecao>
        </div>
        {erro ? (
          <EstadoErro acao={<Botao variante="secundario" onClick={() => void carregar()}>Tentar de novo</Botao>}>{erro}</EstadoErro>
        ) : lista === null ? (
          <div style={{ padding: "var(--e-4)" }}>
            <EsqueletoLinhas linhas={5} />
          </div>
        ) : lista.clientes.length === 0 ? (
          filtrando ? (
            <EstadoVazio icone={Search} titulo="Nenhum cliente encontrado">
              Tente outro nome, outro documento ou mude os filtros.
            </EstadoVazio>
          ) : (
            <EstadoVazio icone={Users} titulo="Nenhum cliente cadastrado" acao={botaoNovo}>
              Cadastre o primeiro cliente para começar.
            </EstadoVazio>
          )
        ) : (
          <>
            <Tabela colunas={colunas} linhas={lista.clientes} chaveLinha={(c) => c.id} legenda="Clientes do escritório" />
            <div className="paginacao">
              <span className="texto-pequeno" role="status">
                {lista.total} {lista.total === 1 ? "cliente" : "clientes"} · página {pagina} de {totalPaginas}
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

      <ClienteFormulario
        aberto={novo}
        cliente={null}
        aoFechar={() => setNovo(false)}
        aoSalvar={(c) => {
          setNovo(false);
          avisar("Cliente cadastrado.");
          navegar(`/clientes/${c.id}`);
        }}
      />
    </>
  );
}
