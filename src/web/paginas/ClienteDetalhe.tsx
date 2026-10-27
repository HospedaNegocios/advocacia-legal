import { Ban, CircleCheck, CirclePause, Download, FileText, Pencil, Plus, RotateCcw, ShieldCheck, ShieldOff, Trash2, Upload, UserRound } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ErroApi, api, enviarArquivo, formatarData } from "../api";
import { mascaraTelefone } from "../mascaras";
import { Link } from "../roteador";
import { useSessao } from "../sessao";
import { Abas, AreaTexto, Aviso, Botao, CabecalhoPagina, Cartao, Confirmar, Entrada, EsqueletoLinhas, EstadoErro, EstadoVazio, Formulario, Modal, Selo, useToast } from "../ui";
import { ClienteFormulario } from "./ClienteFormulario";
import { ROTULO_TIPO, cepFormatado, diaBr, documentoFormatado, hojeIso, tamanhoLegivel, telefoneFormatado } from "./clientes-comum";
import type { Anexo, Cliente, Consentimento, Contato } from "./clientes-comum";

function Dado({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  return (
    <div>
      <dt>{rotulo}</dt>
      <dd>{valor && valor.trim() !== "" ? valor : "—"}</dd>
    </div>
  );
}

function AbaDados({ c, aoEditar }: { c: Cliente; aoEditar: () => void }) {
  const pf = c.tipo === "pf";
  const endereco = [c.logradouro, c.numero, c.complemento, c.bairro].filter(Boolean).join(", ");
  const cidade = [c.cidade, c.uf].filter(Boolean).join("/");
  return (
    <div className="pilha">
      <div className="abas-acao">
        <h3 className="subtitulo-form" style={{ margin: 0 }}>
          Dados cadastrais
        </h3>
        {c.ativo && (
          <Botao variante="secundario" onClick={aoEditar}>
            <Pencil size={16} aria-hidden="true" />
            Editar
          </Botao>
        )}
      </div>
      <dl className="lista-dados">
        <Dado rotulo={pf ? "Nome completo" : "Razão social"} valor={c.nome} />
        <Dado rotulo={pf ? "CPF" : "CNPJ"} valor={c.documento ? documentoFormatado(c) : null} />
        {pf ? <Dado rotulo="RG" valor={c.rg} /> : <Dado rotulo="Nome fantasia" valor={c.nome_fantasia} />}
        {pf ? <Dado rotulo="Data de nascimento" valor={c.data_nascimento ? diaBr(c.data_nascimento) : null} /> : <Dado rotulo="Inscrição estadual" valor={c.inscricao_estadual} />}
        <Dado rotulo="E-mail" valor={c.email} />
        <Dado rotulo="Telefone" valor={c.telefone ? telefoneFormatado(c.telefone) : null} />
        <Dado rotulo="Celular" valor={c.celular ? telefoneFormatado(c.celular) : null} />
      </dl>
      <h3 className="subtitulo-form">Endereço</h3>
      <dl className="lista-dados">
        <Dado rotulo="CEP" valor={cepFormatado(c.cep)} />
        <Dado rotulo="Endereço" valor={endereco} />
        <Dado rotulo="Cidade/UF" valor={cidade} />
      </dl>
      <h3 className="subtitulo-form">Observações</h3>
      <dl className="lista-dados">
        <Dado rotulo="Anotações internas" valor={c.observacoes} />
      </dl>
    </div>
  );
}

function AbaContatos({ c }: { c: Cliente }) {
  const { avisar } = useToast();
  const [lista, setLista] = useState<Contato[] | null>(null);
  const [erroCarga, setErroCarga] = useState("");
  const [editando, setEditando] = useState<Contato | "novo" | null>(null);
  const [excluindo, setExcluindo] = useState<Contato | null>(null);
  const [f, setF] = useState({ nome: "", cargo: "", email: "", telefone: "" });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await api<{ contatos: Contato[] }>("GET", `/api/clientes/${c.id}/contatos`);
      setLista(r.contatos);
      setErroCarga("");
    } catch (e) {
      setErroCarga(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  }, [c.id]);
  useEffect(() => void carregar(), [carregar]);

  const abrir = (ct: Contato | "novo") => {
    setErro("");
    setF(ct === "novo" ? { nome: "", cargo: "", email: "", telefone: "" } : { nome: ct.nome, cargo: ct.cargo ?? "", email: ct.email ?? "", telefone: ct.telefone ? mascaraTelefone(ct.telefone) : "" });
    setEditando(ct);
  };

  const salvar = async () => {
    if (!editando) return;
    setSalvando(true);
    setErro("");
    try {
      if (editando === "novo") await api("POST", `/api/clientes/${c.id}/contatos`, f);
      else await api("PUT", `/api/clientes/${c.id}/contatos/${editando.id}`, f);
      avisar(editando === "novo" ? "Contato adicionado." : "Contato atualizado.");
      setEditando(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (ct: Contato) => {
    setExcluindo(null);
    try {
      await api("DELETE", `/api/clientes/${c.id}/contatos/${ct.id}`);
      avisar("Contato removido.");
    } catch (e) {
      avisar(e instanceof ErroApi ? e.message : "Algo deu errado.", "erro");
    }
    await carregar();
  };

  if (erroCarga) return <EstadoErro acao={<Botao variante="secundario" onClick={() => void carregar()}>Tentar de novo</Botao>}>{erroCarga}</EstadoErro>;
  if (lista === null) return <EsqueletoLinhas linhas={3} />;

  const botaoNovo = c.ativo ? (
    <Botao onClick={() => abrir("novo")}>
      <Plus size={18} aria-hidden="true" />
      Adicionar contato
    </Botao>
  ) : null;

  return (
    <div className="pilha">
      <div className="abas-acao">
        <p className="texto-pequeno" style={{ margin: 0 }}>
          Outras pessoas para falar sobre este cliente (representante, familiar, responsável financeiro).
        </p>
        {lista.length > 0 && botaoNovo}
      </div>
      {lista.length === 0 ? (
        <EstadoVazio icone={UserRound} titulo="Nenhum contato adicional" {...(botaoNovo ? { acao: botaoNovo } : {})}>
          Adicione pessoas de contato quando o cliente tiver mais de um responsável.
        </EstadoVazio>
      ) : (
        <ul className="lista-simples" aria-label="Contatos do cliente">
          {lista.map((ct) => (
            <li key={ct.id} className="item-lista">
              <div className="item-lista-texto">
                <strong>{ct.nome}</strong>
                <small>{[ct.cargo, ct.telefone ? telefoneFormatado(ct.telefone) : null, ct.email].filter(Boolean).join(" · ") || "Sem outros dados"}</small>
              </div>
              {c.ativo && (
                <div className="tabela-acoes">
                  <Botao tamanho="pequeno" variante="secundario" onClick={() => abrir(ct)} aria-label={`Editar contato ${ct.nome}`}>
                    <Pencil size={16} aria-hidden="true" />
                    Editar
                  </Botao>
                  <Botao tamanho="pequeno" variante="perigo" onClick={() => setExcluindo(ct)} aria-label={`Remover contato ${ct.nome}`}>
                    <Trash2 size={16} aria-hidden="true" />
                    Remover
                  </Botao>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal aberto={editando !== null} aoFechar={() => setEditando(null)} titulo={editando === "novo" ? "Adicionar contato" : "Editar contato"}>
        <Formulario aoEnviar={() => void salvar()}>
          <Entrada rotulo="Nome" required maxLength={120} autoComplete="off" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
          <Entrada rotulo="Cargo ou relação (opcional)" maxLength={80} autoComplete="off" value={f.cargo} onChange={(e) => setF({ ...f, cargo: e.target.value })} />
          <Entrada rotulo="Telefone (opcional)" type="tel" inputMode="tel" autoComplete="off" placeholder="(00) 00000-0000" value={f.telefone} onChange={(e) => setF({ ...f, telefone: mascaraTelefone(e.target.value) })} />
          <Entrada rotulo="E-mail (opcional)" type="email" autoComplete="off" maxLength={254} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
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
      <Confirmar aberto={excluindo !== null} aoFechar={() => setExcluindo(null)} titulo="Remover contato" rotuloConfirmar="Remover" perigo aoConfirmar={() => excluindo && void excluir(excluindo)}>
        Remover o contato {excluindo?.nome}? Essa ação não pode ser desfeita.
      </Confirmar>
    </div>
  );
}

function AbaDocumentos({ c, ehSocio }: { c: Cliente; ehSocio: boolean }) {
  const { avisar } = useToast();
  const [lista, setLista] = useState<Anexo[] | null>(null);
  const [maximo, setMaximo] = useState(7 * 1024 * 1024);
  const [erroCarga, setErroCarga] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [apagando, setApagando] = useState<Anexo | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await api<{ anexos: Anexo[]; tamanho_maximo: number }>("GET", `/api/clientes/${c.id}/anexos`);
      setLista(r.anexos);
      setMaximo(r.tamanho_maximo);
      setErroCarga("");
    } catch (e) {
      setErroCarga(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  }, [c.id]);
  useEffect(() => void carregar(), [carregar]);

  const enviar = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    if (arquivo.size > maximo) {
      avisar(`O arquivo é maior que ${maximo / 1024 / 1024} MB. Reduza o arquivo e tente de novo.`, "erro");
      return;
    }
    setEnviando(true);
    try {
      await enviarArquivo(`/api/clientes/${c.id}/anexos`, arquivo);
      avisar("Documento enviado.");
      await carregar();
    } catch (e) {
      avisar(e instanceof ErroApi ? e.message : "Algo deu errado.", "erro");
    } finally {
      setEnviando(false);
      if (entrada.current) entrada.current.value = "";
    }
  };

  const baixar = async (a: Anexo) => {
    try {
      // O link vale 5 minutos; o navegador baixa o arquivo sem sair da tela.
      const r = await api<{ url: string }>("GET", `/api/clientes/${c.id}/anexos/${a.id}/link`);
      window.location.assign(r.url);
    } catch (e) {
      avisar(e instanceof ErroApi ? e.message : "Algo deu errado.", "erro");
    }
  };

  const apagar = async (a: Anexo) => {
    setApagando(null);
    try {
      await api("DELETE", `/api/clientes/${c.id}/anexos/${a.id}`);
      avisar("Documento apagado.");
    } catch (e) {
      avisar(e instanceof ErroApi ? e.message : "Algo deu errado.", "erro");
    }
    await carregar();
  };

  if (erroCarga) return <EstadoErro acao={<Botao variante="secundario" onClick={() => void carregar()}>Tentar de novo</Botao>}>{erroCarga}</EstadoErro>;
  if (lista === null) return <EsqueletoLinhas linhas={3} />;

  const botaoEnviar = c.ativo ? (
    <>
      <input ref={entrada} className="so-leitor-input" type="file" id="arquivo-cliente" tabIndex={-1} accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx" onChange={(e) => void enviar(e.target.files?.[0])} />
      <Botao carregando={enviando} onClick={() => entrada.current?.click()}>
        <Upload size={18} aria-hidden="true" />
        Enviar documento
      </Botao>
    </>
  ) : null;

  return (
    <div className="pilha">
      <div className="abas-acao">
        <p className="texto-pequeno" style={{ margin: 0 }}>
          PDF, imagem (JPEG, PNG, WEBP), Word ou Excel, de até {maximo / 1024 / 1024} MB cada.
        </p>
        {lista.length > 0 && botaoEnviar}
      </div>
      {lista.length === 0 ? (
        <EstadoVazio icone={FileText} titulo="Nenhum documento enviado" {...(botaoEnviar ? { acao: botaoEnviar } : {})}>
          Guarde aqui procuração, documentos pessoais e contratos deste cliente.
        </EstadoVazio>
      ) : (
        <ul className="lista-simples" aria-label="Documentos do cliente">
          {lista.map((a) => (
            <li key={a.id} className="item-lista">
              <div className="item-lista-texto">
                <strong>{a.nome}</strong>
                <small>
                  {tamanhoLegivel(a.tamanho_bytes)} · enviado em {formatarData(a.criado_em)}
                </small>
              </div>
              <div className="tabela-acoes">
                <Botao tamanho="pequeno" variante="secundario" onClick={() => void baixar(a)} aria-label={`Baixar ${a.nome}`}>
                  <Download size={16} aria-hidden="true" />
                  Baixar
                </Botao>
                {ehSocio && (
                  <Botao tamanho="pequeno" variante="perigo" onClick={() => setApagando(a)} aria-label={`Apagar ${a.nome}`}>
                    <Trash2 size={16} aria-hidden="true" />
                    Apagar
                  </Botao>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Confirmar aberto={apagando !== null} aoFechar={() => setApagando(null)} titulo="Apagar documento" rotuloConfirmar="Apagar" perigo aoConfirmar={() => apagando && void apagar(apagando)}>
        Apagar {apagando?.nome}? O arquivo é removido de vez e essa ação não pode ser desfeita.
      </Confirmar>
    </div>
  );
}

function AbaLgpd({ c }: { c: Cliente }) {
  const { avisar } = useToast();
  const [lista, setLista] = useState<Consentimento[] | null>(null);
  const [erroCarga, setErroCarga] = useState("");
  const [novo, setNovo] = useState(false);
  const [revogando, setRevogando] = useState<Consentimento | null>(null);
  const [f, setF] = useState({ finalidade: "", base_legal: "", forma: "", data_consentimento: hojeIso() });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await api<{ consentimentos: Consentimento[] }>("GET", `/api/clientes/${c.id}/consentimentos`);
      setLista(r.consentimentos);
      setErroCarga("");
    } catch (e) {
      setErroCarga(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  }, [c.id]);
  useEffect(() => void carregar(), [carregar]);

  const salvar = async () => {
    setSalvando(true);
    setErro("");
    try {
      await api("POST", `/api/clientes/${c.id}/consentimentos`, f);
      avisar("Consentimento registrado.");
      setNovo(false);
      await carregar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    } finally {
      setSalvando(false);
    }
  };

  const revogar = async (k: Consentimento) => {
    setRevogando(null);
    try {
      await api("POST", `/api/clientes/${c.id}/consentimentos/${k.id}/revogar`);
      avisar("Consentimento revogado.");
    } catch (e) {
      avisar(e instanceof ErroApi ? e.message : "Algo deu errado.", "erro");
    }
    await carregar();
  };

  if (erroCarga) return <EstadoErro acao={<Botao variante="secundario" onClick={() => void carregar()}>Tentar de novo</Botao>}>{erroCarga}</EstadoErro>;
  if (lista === null) return <EsqueletoLinhas linhas={3} />;

  const botaoNovo = c.ativo ? (
    <Botao
      onClick={() => {
        setF({ finalidade: "", base_legal: "", forma: "", data_consentimento: hojeIso() });
        setErro("");
        setNovo(true);
      }}
    >
      <Plus size={18} aria-hidden="true" />
      Registrar consentimento
    </Botao>
  ) : null;

  return (
    <div className="pilha">
      <div className="abas-acao">
        <p className="texto-pequeno" style={{ margin: 0 }}>
          Registro do consentimento do cliente para o tratamento dos dados dele. Os textos são escritos pelo escritório.
        </p>
        {lista.length > 0 && botaoNovo}
      </div>
      {lista.length === 0 ? (
        <EstadoVazio icone={ShieldCheck} titulo="Nenhum consentimento registrado" {...(botaoNovo ? { acao: botaoNovo } : {})}>
          Registre quando e como o cliente autorizou o uso dos dados dele.
        </EstadoVazio>
      ) : (
        <ul className="lista-simples" aria-label="Consentimentos LGPD">
          {lista.map((k) => (
            <li key={k.id} className="item-lista">
              <div className="item-lista-texto">
                <strong>{k.finalidade}</strong>
                <small>
                  {diaBr(k.data_consentimento)} · {k.forma}
                  {k.base_legal ? ` · ${k.base_legal}` : ""}
                </small>
                {k.revogado_em && <small>Revogado em {formatarData(k.revogado_em)}</small>}
              </div>
              <div className="tabela-acoes">
                {k.revogado_em ? (
                  <Selo icone={ShieldOff}>Revogado</Selo>
                ) : (
                  <>
                    <Selo tom="bom" icone={ShieldCheck}>
                      Vigente
                    </Selo>
                    {c.ativo && (
                      <Botao tamanho="pequeno" variante="secundario" onClick={() => setRevogando(k)} aria-label={`Revogar consentimento: ${k.finalidade}`}>
                        <Ban size={16} aria-hidden="true" />
                        Revogar
                      </Botao>
                    )}
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal aberto={novo} aoFechar={() => setNovo(false)} titulo="Registrar consentimento" descricao="Descreva com as suas palavras o que o cliente autorizou.">
        <Formulario aoEnviar={() => void salvar()}>
          <AreaTexto rotulo="Finalidade" required maxLength={500} rows={3} ajuda="Para que os dados serão usados." value={f.finalidade} onChange={(e) => setF({ ...f, finalidade: e.target.value })} />
          <Entrada rotulo="Base legal (opcional)" maxLength={200} value={f.base_legal} onChange={(e) => setF({ ...f, base_legal: e.target.value })} />
          <Entrada rotulo="Como foi dado" required maxLength={200} ajuda="Por exemplo: termo assinado, e-mail, conversa por WhatsApp." value={f.forma} onChange={(e) => setF({ ...f, forma: e.target.value })} />
          <Entrada rotulo="Data do consentimento" type="date" required max={hojeIso()} value={f.data_consentimento} onChange={(e) => setF({ ...f, data_consentimento: e.target.value })} />
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
      <Confirmar aberto={revogando !== null} aoFechar={() => setRevogando(null)} titulo="Revogar consentimento" rotuloConfirmar="Revogar" perigo aoConfirmar={() => revogando && void revogar(revogando)}>
        Revogar este consentimento? A data fica registrada e a revogação não pode ser desfeita. Para um novo consentimento, registre outro.
      </Confirmar>
    </div>
  );
}

export function ClienteDetalhe({ id }: { id: string }) {
  const { avisar } = useToast();
  const { eu } = useSessao();
  const ehSocio = eu?.usuario.perfil === "socio";
  const [c, setC] = useState<Cliente | null>(null);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await api<{ cliente: Cliente }>("GET", `/api/clientes/${id}`);
      setC(r.cliente);
      setErro("");
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  }, [id]);
  useEffect(() => void carregar(), [carregar]);

  const migalhas = [{ rotulo: "Início", para: "/" }, { rotulo: "Clientes", para: "/clientes" }, { rotulo: c?.nome ?? "Cliente" }];
  if (erro) {
    return (
      <>
        <CabecalhoPagina titulo="Cliente" migalhas={migalhas} />
        <EstadoErro acao={<Link para="/clientes">Voltar para os clientes</Link>}>{erro}</EstadoErro>
      </>
    );
  }
  if (!c) {
    return (
      <>
        <CabecalhoPagina titulo="Cliente" migalhas={migalhas} />
        <EsqueletoLinhas linhas={4} />
      </>
    );
  }

  const mudarSituacao = async (ativo: boolean) => {
    setConfirmando(false);
    try {
      const r = await api<{ cliente: Cliente }>("POST", `/api/clientes/${c.id}/situacao`, { ativo });
      setC(r.cliente);
      avisar(ativo ? "Cliente reativado." : "Cliente desativado.");
    } catch (e) {
      avisar(e instanceof ErroApi ? e.message : "Algo deu errado.", "erro");
    }
  };

  const acoes = ehSocio ? (
    c.ativo ? (
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
      <CabecalhoPagina titulo={c.nome} descricao={`${ROTULO_TIPO[c.tipo]}${c.documento ? ` · ${documentoFormatado(c)}` : ""}`} migalhas={migalhas} acoes={acoes} />
      {!c.ativo && (
        <div style={{ marginBottom: "var(--e-4)" }}>
          <Aviso tipo="atencao">
            <span style={{ display: "inline-flex", gap: "var(--e-2)", alignItems: "center" }}>
              <CirclePause size={16} aria-hidden="true" />
              Cliente desativado. O cadastro fica guardado, mas só pode ser alterado depois de reativado{ehSocio ? "" : " pelo sócio"}.
            </span>
          </Aviso>
        </div>
      )}
      {c.ativo && (
        <p style={{ margin: "0 0 var(--e-4)" }}>
          <Selo tom="bom" icone={CircleCheck}>
            Cliente ativo
          </Selo>
        </p>
      )}
      <Cartao>
        <Abas
          abas={[
            { id: "dados", rotulo: "Dados", conteudo: <AbaDados c={c} aoEditar={() => setEditando(true)} /> },
            { id: "contatos", rotulo: "Contatos", conteudo: <AbaContatos c={c} /> },
            { id: "documentos", rotulo: "Documentos", conteudo: <AbaDocumentos c={c} ehSocio={ehSocio} /> },
            { id: "lgpd", rotulo: "LGPD", conteudo: <AbaLgpd c={c} /> },
          ]}
        />
      </Cartao>
      <ClienteFormulario
        aberto={editando}
        cliente={c}
        aoFechar={() => setEditando(false)}
        aoSalvar={(novo) => {
          setC(novo);
          setEditando(false);
          avisar("Cadastro atualizado.");
        }}
      />
      <Confirmar aberto={confirmando} aoFechar={() => setConfirmando(false)} titulo="Desativar cliente" rotuloConfirmar="Desativar" perigo aoConfirmar={() => void mudarSituacao(false)}>
        Desativar {c.nome}? O cliente some da lista padrão e o cadastro não poderá ser alterado, mas nada é apagado. Você pode reativar depois.
      </Confirmar>
    </>
  );
}
