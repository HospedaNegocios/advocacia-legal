import { Ban, CircleCheck, CirclePause, Eye, History, Pencil, Plus, RotateCcw, Trash2, UserCheck, UserPlus, UserX, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ErroApi, api, formatarData } from "../api";
import { Link } from "../roteador";
import { useSessao } from "../sessao";
import { Abas, AreaTexto, Aviso, Botao, CabecalhoPagina, Cartao, CampoMarcar, Confirmar, Entrada, EsqueletoLinhas, EstadoErro, EstadoVazio, Formulario, Modal, Selecao, Selo, useToast } from "../ui";
import { AbaDocumentos, Dado } from "./abas-comuns";
import { AbaAgenda, AbaPrazos } from "./AbasAgendaProcesso";
import { AbaIntimacoes } from "./AbaIntimacoes";
import { BotaoAndamentoPortal, CartaoPortalProcesso } from "./PortalGestao";
import { diaBr, hojeIso } from "./clientes-comum";
import type { Cliente } from "./clientes-comum";
import { SeloFase } from "./ProcessoFase";
import { ProcessoFormulario } from "./ProcessoFormulario";
import { ROTULO_POLO, cnjFormatado, reais } from "./processos-comum";
import type { Andamento, Parte, Polo, Processo, Responsavel, UsuarioDisponivel } from "./processos-comum";

function AbaDados({ p, aoEditar, aoPortal }: { p: Processo; aoEditar: () => void; aoPortal: (visivel: boolean) => void }) {
  return (
    <div className="pilha">
      <CartaoPortalProcesso p={p} aoMudar={aoPortal} />
      <div className="abas-acao">
        <h3 className="subtitulo-form" style={{ margin: 0 }}>
          Dados do processo
        </h3>
        {p.ativo && (
          <Botao variante="secundario" onClick={aoEditar}>
            <Pencil size={16} aria-hidden="true" />
            Editar
          </Botao>
        )}
      </div>
      <dl className="lista-dados">
        <Dado rotulo="Número (CNJ)" valor={cnjFormatado(p.numero_cnj)} />
        <Dado rotulo="Fase" valor={p.fase} />
        <Dado rotulo="Tribunal" valor={p.tribunal} />
        <Dado rotulo="Comarca" valor={p.comarca} />
        <Dado rotulo="Órgão ou vara" valor={p.orgao} />
        <Dado rotulo="Área" valor={p.area} />
        <Dado rotulo="Classe" valor={p.classe} />
        <Dado rotulo="Assunto" valor={p.assunto} />
        <Dado rotulo="Valor da causa" valor={p.valor_causa_centavos === null ? null : reais(p.valor_causa_centavos)} />
        <Dado rotulo="Data de distribuição" valor={p.data_distribuicao ? diaBr(p.data_distribuicao) : null} />
      </dl>
      <h3 className="subtitulo-form">Observações</h3>
      <dl className="lista-dados">
        <Dado rotulo="Anotações internas" valor={p.observacoes} />
      </dl>
    </div>
  );
}

const POLOS: Polo[] = ["ativo", "passivo", "terceiro"];

function AbaPartes({ p }: { p: Processo }) {
  const { avisar } = useToast();
  const [lista, setLista] = useState<Parte[] | null>(null);
  const [erroCarga, setErroCarga] = useState("");
  const [editando, setEditando] = useState<Parte | "nova" | null>(null);
  const [removendo, setRemovendo] = useState<Parte | null>(null);
  const [modo, setModo] = useState<"cliente" | "nome">("cliente");
  const [f, setF] = useState({ polo: "ativo" as Polo, nome: "", cliente_escritorio: false, cliente_id: "" });
  const [buscaCliente, setBuscaCliente] = useState("");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await api<{ partes: Parte[] }>("GET", `/api/processos/${p.id}/partes`);
      setLista(r.partes);
      setErroCarga("");
    } catch (e) {
      setErroCarga(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  }, [p.id]);
  useEffect(() => void carregar(), [carregar]);

  // Busca de clientes ativos enquanto digita (só quando a janela de nova parte está aberta).
  useEffect(() => {
    if (editando !== "nova" || modo !== "cliente") return;
    const t = setTimeout(() => {
      const q = new URLSearchParams({ situacao: "ativos", por_pagina: "20" });
      if (buscaCliente.trim()) q.set("busca", buscaCliente.trim());
      api<{ clientes: Cliente[] }>("GET", `/api/clientes?${q.toString()}`)
        .then((r) => setClientes(r.clientes))
        .catch(() => setClientes([]));
    }, 250);
    return () => clearTimeout(t);
  }, [editando, modo, buscaCliente]);

  const abrir = (x: Parte | "nova") => {
    setErro("");
    setBuscaCliente("");
    setClientes([]);
    if (x === "nova") {
      setModo("cliente");
      setF({ polo: "ativo", nome: "", cliente_escritorio: false, cliente_id: "" });
    } else {
      setModo(x.cliente_id ? "cliente" : "nome");
      setF({ polo: x.polo, nome: x.cliente_id ? "" : x.nome, cliente_escritorio: x.cliente_escritorio, cliente_id: x.cliente_id ?? "" });
    }
    setEditando(x);
  };

  const salvar = async () => {
    if (!editando) return;
    setSalvando(true);
    setErro("");
    try {
      if (editando === "nova") {
        const corpo = modo === "cliente" ? { cliente_id: f.cliente_id, polo: f.polo } : { nome: f.nome, polo: f.polo, cliente_escritorio: f.cliente_escritorio };
        if (modo === "cliente" && !f.cliente_id) {
          setErro("Escolha um cliente da lista.");
          setSalvando(false);
          return;
        }
        await api("POST", `/api/processos/${p.id}/partes`, corpo);
        avisar("Parte adicionada.");
      } else {
        await api("PUT", `/api/processos/${p.id}/partes/${editando.id}`, editando.cliente_id ? { polo: f.polo } : { polo: f.polo, nome: f.nome, cliente_escritorio: f.cliente_escritorio });
        avisar("Parte atualizada.");
      }
      setEditando(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    } finally {
      setSalvando(false);
    }
  };

  const remover = async (x: Parte) => {
    setRemovendo(null);
    try {
      await api("DELETE", `/api/processos/${p.id}/partes/${x.id}`);
      avisar("Parte removida.");
    } catch (e) {
      avisar(e instanceof ErroApi ? e.message : "Algo deu errado.", "erro");
    }
    await carregar();
  };

  if (erroCarga) return <EstadoErro acao={<Botao variante="secundario" onClick={() => void carregar()}>Tentar de novo</Botao>}>{erroCarga}</EstadoErro>;
  if (lista === null) return <EsqueletoLinhas linhas={3} />;

  const botaoNova = p.ativo ? (
    <Botao onClick={() => abrir("nova")}>
      <Plus size={18} aria-hidden="true" />
      Adicionar parte
    </Botao>
  ) : null;
  const novaCliente = editando === "nova" && modo === "cliente";
  const parteDeCliente = editando !== null && editando !== "nova" && editando.cliente_id !== null;

  return (
    <div className="pilha">
      <div className="abas-acao">
        <p className="texto-pequeno" style={{ margin: 0 }}>
          Quem participa do processo: clientes do escritório ou pessoas e empresas digitadas (como a parte contrária).
        </p>
        {lista.length > 0 && botaoNova}
      </div>
      {lista.length === 0 ? (
        <EstadoVazio icone={Users} titulo="Nenhuma parte cadastrada" {...(botaoNova ? { acao: botaoNova } : {})}>
          Adicione o cliente do escritório e a parte contrária.
        </EstadoVazio>
      ) : (
        POLOS.filter((polo) => lista.some((x) => x.polo === polo)).map((polo) => (
          <section key={polo} aria-label={ROTULO_POLO[polo]} className="pilha" style={{ gap: "var(--e-2)" }}>
            <h3 className="subtitulo-form" style={{ margin: 0 }}>
              {ROTULO_POLO[polo]}
            </h3>
            <ul className="lista-simples" aria-label={`Partes: ${ROTULO_POLO[polo]}`}>
              {lista
                .filter((x) => x.polo === polo)
                .map((x) => (
                  <li key={x.id} className="item-lista">
                    <div className="item-lista-texto">
                      {x.cliente_id ? (
                        <Link para={`/clientes/${x.cliente_id}`}>
                          <strong>{x.nome}</strong>
                        </Link>
                      ) : (
                        <strong>{x.nome}</strong>
                      )}
                      {x.cliente_escritorio && (
                        <span>
                          <Selo tom="info" icone={UserCheck}>
                            Cliente do escritório
                          </Selo>
                        </span>
                      )}
                    </div>
                    {p.ativo && (
                      <div className="tabela-acoes">
                        <Botao tamanho="pequeno" variante="secundario" onClick={() => abrir(x)} aria-label={`Editar parte ${x.nome}`}>
                          <Pencil size={16} aria-hidden="true" />
                          Editar
                        </Botao>
                        <Botao tamanho="pequeno" variante="perigo" onClick={() => setRemovendo(x)} aria-label={`Remover parte ${x.nome}`}>
                          <Trash2 size={16} aria-hidden="true" />
                          Remover
                        </Botao>
                      </div>
                    )}
                  </li>
                ))}
            </ul>
          </section>
        ))
      )}

      <Modal aberto={editando !== null} aoFechar={() => setEditando(null)} titulo={editando === "nova" ? "Adicionar parte" : "Editar parte"}>
        <Formulario aoEnviar={() => void salvar()}>
          {editando === "nova" && (
            <Selecao rotulo="Tipo de parte" value={modo} onChange={(e) => setModo(e.target.value === "nome" ? "nome" : "cliente")}>
              <option value="cliente">Cliente cadastrado no escritório</option>
              <option value="nome">Outra pessoa ou empresa (digitar o nome)</option>
            </Selecao>
          )}
          {novaCliente && (
            <>
              <Entrada rotulo="Buscar cliente" type="search" autoComplete="off" placeholder="Digite parte do nome ou do documento" value={buscaCliente} onChange={(e) => setBuscaCliente(e.target.value)} />
              <Selecao rotulo="Cliente" required value={f.cliente_id} onChange={(e) => setF({ ...f, cliente_id: e.target.value })} ajuda={clientes.length === 0 ? "Nenhum cliente ativo encontrado." : undefined}>
                <option value="">Selecione</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Selecao>
            </>
          )}
          {parteDeCliente && <p className="texto-pequeno" style={{ margin: 0 }}>Parte ligada a um cliente cadastrado: só o polo pode ser alterado.</p>}
          {!novaCliente && !parteDeCliente && (
            <>
              <Entrada rotulo="Nome" required maxLength={150} autoComplete="off" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
              <CampoMarcar checked={f.cliente_escritorio} onChange={(e) => setF({ ...f, cliente_escritorio: e.target.checked })}>
                É cliente do escritório (ainda sem cadastro)
              </CampoMarcar>
            </>
          )}
          <Selecao rotulo="Polo" value={f.polo} onChange={(e) => setF({ ...f, polo: e.target.value as Polo })}>
            {POLOS.map((polo) => (
              <option key={polo} value={polo}>
                {ROTULO_POLO[polo]}
              </option>
            ))}
          </Selecao>
          {erro && <Aviso>{erro}</Aviso>}
          <div className="modal-rodape">
            <Botao variante="secundario" onClick={() => setEditando(null)}>
              Cancelar
            </Botao>
            <Botao type="submit" carregando={salvando}>
              Salvar
            </Botao>
          </div>
        </Formulario>
      </Modal>
      <Confirmar aberto={removendo !== null} aoFechar={() => setRemovendo(null)} titulo="Remover parte" rotuloConfirmar="Remover" perigo aoConfirmar={() => removendo && void remover(removendo)}>
        Remover {removendo?.nome} deste processo? O cadastro do cliente não é afetado.
      </Confirmar>
    </div>
  );
}

function AbaResponsaveis({ p }: { p: Processo }) {
  const { avisar } = useToast();
  const [lista, setLista] = useState<Responsavel[] | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioDisponivel[]>([]);
  const [escolhido, setEscolhido] = useState("");
  const [erroCarga, setErroCarga] = useState("");
  const [adicionando, setAdicionando] = useState(false);
  const [removendo, setRemovendo] = useState<Responsavel | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [r, u] = await Promise.all([api<{ responsaveis: Responsavel[] }>("GET", `/api/processos/${p.id}/responsaveis`), api<{ usuarios: UsuarioDisponivel[] }>("GET", "/api/processos/responsaveis-disponiveis")]);
      setLista(r.responsaveis);
      setUsuarios(u.usuarios);
      setErroCarga("");
    } catch (e) {
      setErroCarga(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  }, [p.id]);
  useEffect(() => void carregar(), [carregar]);

  const adicionar = async () => {
    if (!escolhido) return;
    setAdicionando(true);
    try {
      await api("POST", `/api/processos/${p.id}/responsaveis`, { user_id: escolhido });
      avisar("Responsável adicionado.");
      setEscolhido("");
      await carregar();
    } catch (e) {
      avisar(e instanceof ErroApi ? e.message : "Algo deu errado.", "erro");
    } finally {
      setAdicionando(false);
    }
  };

  const remover = async (r: Responsavel) => {
    setRemovendo(null);
    try {
      await api("DELETE", `/api/processos/${p.id}/responsaveis/${r.user_id}`);
      avisar("Responsável removido.");
    } catch (e) {
      avisar(e instanceof ErroApi ? e.message : "Algo deu errado.", "erro");
    }
    await carregar();
  };

  if (erroCarga) return <EstadoErro acao={<Botao variante="secundario" onClick={() => void carregar()}>Tentar de novo</Botao>}>{erroCarga}</EstadoErro>;
  if (lista === null) return <EsqueletoLinhas linhas={3} />;

  const livres = usuarios.filter((u) => !lista.some((r) => r.user_id === u.id));

  return (
    <div className="pilha">
      <p className="texto-pequeno" style={{ margin: 0 }}>
        Pessoas da equipe que cuidam deste processo.
      </p>
      {p.ativo && (
        <div className="linha-adicionar">
          <Selecao rotulo="Adicionar responsável" value={escolhido} onChange={(e) => setEscolhido(e.target.value)} ajuda={livres.length === 0 ? "Todos os usuários ativos já são responsáveis." : undefined}>
            <option value="">Selecione</option>
            {livres.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </Selecao>
          <Botao carregando={adicionando} disabled={!escolhido} onClick={() => void adicionar()}>
            <UserPlus size={18} aria-hidden="true" />
            Adicionar
          </Botao>
        </div>
      )}
      {lista.length === 0 ? (
        <EstadoVazio icone={UserX} titulo="Sem responsável" compacto>
          Este processo ainda não tem responsável definido.
        </EstadoVazio>
      ) : (
        <ul className="lista-simples" aria-label="Responsáveis pelo processo">
          {lista.map((r) => (
            <li key={r.user_id} className="item-lista">
              <div className="item-lista-texto">
                <strong>{r.nome}</strong>
                {!r.ativo && <small>Usuário desativado</small>}
              </div>
              {p.ativo && (
                <div className="tabela-acoes">
                  <Botao tamanho="pequeno" variante="perigo" onClick={() => setRemovendo(r)} aria-label={`Remover responsável ${r.nome}`}>
                    <Trash2 size={16} aria-hidden="true" />
                    Remover
                  </Botao>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <Confirmar aberto={removendo !== null} aoFechar={() => setRemovendo(null)} titulo="Remover responsável" rotuloConfirmar="Remover" perigo aoConfirmar={() => removendo && void remover(removendo)}>
        Remover {removendo?.nome} dos responsáveis por este processo?
      </Confirmar>
    </div>
  );
}

const POR_PAGINA_ANDAMENTOS = 30;

function AbaAndamentos({ p, ehSocio }: { p: Processo; ehSocio: boolean }) {
  const { avisar } = useToast();
  const [itens, setItens] = useState<Andamento[] | null>(null);
  const [total, setTotal] = useState(0);
  const [erroCarga, setErroCarga] = useState("");
  const [novo, setNovo] = useState(false);
  const [apagando, setApagando] = useState<Andamento | null>(null);
  const [f, setF] = useState({ data: hojeIso(), descricao: "" });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await api<{ andamentos: Andamento[]; total: number }>("GET", `/api/processos/${p.id}/andamentos?por_pagina=${POR_PAGINA_ANDAMENTOS}`);
      setItens(r.andamentos);
      setTotal(r.total);
      setErroCarga("");
    } catch (e) {
      setErroCarga(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  }, [p.id]);
  useEffect(() => void carregar(), [carregar]);

  const maisAntigos = async () => {
    if (!itens) return;
    setCarregandoMais(true);
    try {
      const pagina = Math.floor(itens.length / POR_PAGINA_ANDAMENTOS) + 1;
      const r = await api<{ andamentos: Andamento[]; total: number }>("GET", `/api/processos/${p.id}/andamentos?por_pagina=${POR_PAGINA_ANDAMENTOS}&pagina=${pagina}`);
      setItens([...itens, ...r.andamentos.filter((a) => !itens.some((i) => i.id === a.id))]);
      setTotal(r.total);
    } catch (e) {
      avisar(e instanceof ErroApi ? e.message : "Algo deu errado.", "erro");
    } finally {
      setCarregandoMais(false);
    }
  };

  const salvar = async () => {
    setSalvando(true);
    setErro("");
    try {
      await api("POST", `/api/processos/${p.id}/andamentos`, f);
      avisar("Andamento registrado.");
      setNovo(false);
      await carregar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    } finally {
      setSalvando(false);
    }
  };

  const apagar = async (a: Andamento) => {
    setApagando(null);
    try {
      await api("DELETE", `/api/processos/${p.id}/andamentos/${a.id}`);
      avisar("Andamento apagado.");
    } catch (e) {
      avisar(e instanceof ErroApi ? e.message : "Algo deu errado.", "erro");
    }
    await carregar();
  };

  if (erroCarga) return <EstadoErro acao={<Botao variante="secundario" onClick={() => void carregar()}>Tentar de novo</Botao>}>{erroCarga}</EstadoErro>;
  if (itens === null) return <EsqueletoLinhas linhas={3} />;

  const botaoNovo = p.ativo ? (
    <Botao
      onClick={() => {
        setF({ data: hojeIso(), descricao: "" });
        setErro("");
        setNovo(true);
      }}
    >
      <Plus size={18} aria-hidden="true" />
      Registrar andamento
    </Botao>
  ) : null;

  return (
    <div className="pilha">
      <div className="abas-acao">
        <p className="texto-pequeno" style={{ margin: 0 }}>
          Histórico do processo, do mais recente ao mais antigo. Depois de salvo, o andamento não pode ser editado{ehSocio ? "" : "; só o sócio pode apagá-lo"}.
        </p>
        {itens.length > 0 && botaoNovo}
      </div>
      {itens.length === 0 ? (
        <EstadoVazio icone={History} titulo="Nenhum andamento registrado" {...(botaoNovo ? { acao: botaoNovo } : {})}>
          Registre despachos, audiências, decisões e outras movimentações.
        </EstadoVazio>
      ) : (
        <>
          <ol className="linha-tempo" aria-label="Andamentos do processo">
            {itens.map((a) => (
              <li key={a.id} className="linha-tempo-item">
                <div className="linha-tempo-data">
                  <time dateTime={a.data}>{diaBr(a.data)}</time>
                </div>
                <div className="linha-tempo-corpo">
                  <p>{a.descricao}</p>
                  <small>
                    Registrado por {a.registrado_por_nome ?? "usuário removido"} em {formatarData(a.criado_em)}
                  </small>
                  {a.visivel_portal && (
                    <span>
                      <Selo tom="info" icone={Eye}>
                        Visível ao cliente
                      </Selo>
                    </span>
                  )}
                  <div>
                    <BotaoAndamentoPortal p={p} andamentoId={a.id} visivel={a.visivel_portal} aoMudar={(v) => setItens((lista) => lista && lista.map((x) => (x.id === a.id ? { ...x, visivel_portal: v } : x)))} />
                  </div>
                  {ehSocio && p.ativo && (
                    <div>
                      <Botao tamanho="pequeno" variante="perigo" onClick={() => setApagando(a)} aria-label={`Apagar andamento de ${diaBr(a.data)}`}>
                        <Trash2 size={16} aria-hidden="true" />
                        Apagar
                      </Botao>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {itens.length < total && (
            <div>
              <Botao variante="secundario" carregando={carregandoMais} onClick={() => void maisAntigos()}>
                Ver andamentos mais antigos ({total - itens.length})
              </Botao>
            </div>
          )}
        </>
      )}

      <Modal aberto={novo} aoFechar={() => setNovo(false)} titulo="Registrar andamento" descricao="Depois de salvo, o andamento não poderá ser editado.">
        <Formulario aoEnviar={() => void salvar()}>
          <Entrada rotulo="Data do andamento" type="date" required max={hojeIso()} value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} />
          <AreaTexto rotulo="Descrição" required maxLength={2000} rows={5} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
          {erro && <Aviso>{erro}</Aviso>}
          <div className="modal-rodape">
            <Botao variante="secundario" onClick={() => setNovo(false)}>
              Cancelar
            </Botao>
            <Botao type="submit" carregando={salvando}>
              Registrar
            </Botao>
          </div>
        </Formulario>
      </Modal>
      <Confirmar aberto={apagando !== null} aoFechar={() => setApagando(null)} titulo="Apagar andamento" rotuloConfirmar="Apagar" perigo aoConfirmar={() => apagando && void apagar(apagando)}>
        Apagar o andamento de {apagando ? diaBr(apagando.data) : ""}? Essa ação fica registrada na auditoria e não pode ser desfeita.
      </Confirmar>
    </div>
  );
}

export function ProcessoDetalhe({ id }: { id: string }) {
  const { avisar } = useToast();
  const { eu } = useSessao();
  const ehSocio = eu?.usuario.perfil === "socio";
  const [p, setP] = useState<Processo | null>(null);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await api<{ processo: Processo }>("GET", `/api/processos/${id}`);
      setP(r.processo);
      setErro("");
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  }, [id]);
  useEffect(() => void carregar(), [carregar]);

  const migalhas = [{ rotulo: "Início", para: "/" }, { rotulo: "Processos", para: "/processos" }, { rotulo: p ? cnjFormatado(p.numero_cnj) : "Processo" }];
  if (erro) {
    return (
      <>
        <CabecalhoPagina titulo="Processo" migalhas={migalhas} />
        <EstadoErro acao={<Link para="/processos">Voltar para os processos</Link>}>{erro}</EstadoErro>
      </>
    );
  }
  if (!p) {
    return (
      <>
        <CabecalhoPagina titulo="Processo" migalhas={migalhas} />
        <EsqueletoLinhas linhas={4} />
      </>
    );
  }

  const mudarSituacao = async (ativo: boolean) => {
    setConfirmando(false);
    try {
      const r = await api<{ processo: Processo }>("POST", `/api/processos/${p.id}/situacao`, { ativo });
      setP(r.processo);
      avisar(ativo ? "Processo reativado." : "Processo desativado.");
    } catch (e) {
      avisar(e instanceof ErroApi ? e.message : "Algo deu errado.", "erro");
    }
  };

  const acoes = ehSocio ? (
    p.ativo ? (
      <Botao variante="perigo" onClick={() => setConfirmando(true)}>
        <Ban size={16} aria-hidden="true" />
        Desativar
      </Botao>
    ) : (
      <Botao onClick={() => void mudarSituacao(true)}>
        <RotateCcw size={16} aria-hidden="true" />
        Reativar
      </Botao>
    )
  ) : undefined;

  return (
    <>
      <CabecalhoPagina titulo={cnjFormatado(p.numero_cnj)} descricao={[p.classe, p.assunto, p.tribunal].filter(Boolean).join(" · ") || "Processo judicial"} migalhas={migalhas} acoes={acoes} />
      {!p.ativo && (
        <div style={{ marginBottom: "var(--e-4)" }}>
          <Aviso tipo="atencao">
            <span style={{ display: "inline-flex", gap: "var(--e-2)", alignItems: "center" }}>
              <CirclePause size={16} aria-hidden="true" />
              Processo desativado. Os dados ficam guardados, mas só podem ser alterados depois de reativado{ehSocio ? "" : " pelo sócio"}.
            </span>
          </Aviso>
        </div>
      )}
      <p className="linha-flex" style={{ margin: "0 0 var(--e-4)" }}>
        <SeloFase fase={p.fase} />
        {p.ativo && (
          <Selo tom="bom" icone={CircleCheck}>
            Processo ativo
          </Selo>
        )}
      </p>
      <Cartao>
        <Abas
          abas={[
            { id: "dados", rotulo: "Dados", conteudo: <AbaDados p={p} aoEditar={() => setEditando(true)} aoPortal={(visivel) => setP({ ...p, visivel_portal: visivel })} /> },
            { id: "partes", rotulo: "Partes", conteudo: <AbaPartes p={p} /> },
            { id: "responsaveis", rotulo: "Responsáveis", conteudo: <AbaResponsaveis p={p} /> },
            { id: "andamentos", rotulo: "Andamentos", conteudo: <AbaAndamentos p={p} ehSocio={ehSocio} /> },
            { id: "prazos", rotulo: "Prazos", conteudo: <AbaPrazos p={p} /> },
            { id: "agenda", rotulo: "Agenda", conteudo: <AbaAgenda p={p} /> },
            { id: "intimacoes", rotulo: "Intimações", conteudo: <AbaIntimacoes p={p} /> },
            { id: "documentos", rotulo: "Documentos", conteudo: <AbaDocumentos base={`/api/processos/${p.id}`} editavel={p.ativo} ehSocio={ehSocio} texto={{ vazio: "Guarde aqui petições, decisões e outros documentos deste processo.", lista: "Documentos do processo" }} /> },
          ]}
        />
      </Cartao>
      <ProcessoFormulario
        aberto={editando}
        processo={p}
        aoFechar={() => setEditando(false)}
        aoSalvar={(novo) => {
          setP(novo);
          setEditando(false);
          avisar("Processo atualizado.");
        }}
      />
      <Confirmar aberto={confirmando} aoFechar={() => setConfirmando(false)} titulo="Desativar processo" rotuloConfirmar="Desativar" perigo aoConfirmar={() => void mudarSituacao(false)}>
        Desativar este processo? Ele some da lista padrão e não poderá ser alterado, mas nada é apagado. Você pode reativar depois.
      </Confirmar>
    </>
  );
}

