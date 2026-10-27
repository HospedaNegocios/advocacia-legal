import { Ban, Pencil, Plus, RotateCcw, Scale } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CircleCheck, CirclePause } from "lucide-react";
import { ErroApi, ROTULO_PLANO, api } from "../api";
import type { Plano } from "../api";
import { mascaraCep, mascaraDocumento, mascaraTelefone, soDigitos } from "../mascaras";
import { useSessao } from "../sessao";
import { Abas, Aviso, Botao, CabecalhoPagina, Cartao, Confirmar, Entrada, EsqueletoLinhas, EstadoErro, EstadoVazio, Formulario, Medidor, Modal, Selecao, Selo, Tabela, useToast } from "../ui";
import type { Coluna } from "../ui";

const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

interface Perfil {
  razao_social: string | null;
  documento: string | null;
  email_contato: string | null;
  telefone: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
}
type Texto = { [K in keyof Perfil]: string };

interface Oab {
  id: string;
  numero: string;
  sufixo: string | null;
  uf: string;
  advogado_nome: string;
  user_id: string | null;
  ativo: boolean;
}
interface Uso {
  plano: Plano;
  ativas: number;
  limite: number | null;
}
interface Membro {
  id: string;
  nome: string;
  ativo: boolean;
  convite_pendente: boolean;
}

function paraFormulario(p: Perfil): Texto {
  return {
    razao_social: p.razao_social ?? "",
    documento: p.documento ? mascaraDocumento(p.documento) : "",
    email_contato: p.email_contato ?? "",
    telefone: p.telefone ? mascaraTelefone(p.telefone) : "",
    cep: p.cep ? mascaraCep(p.cep) : "",
    logradouro: p.logradouro ?? "",
    numero: p.numero ?? "",
    complemento: p.complemento ?? "",
    bairro: p.bairro ?? "",
    cidade: p.cidade ?? "",
    uf: p.uf ?? "",
  };
}

function textoOab(o: Pick<Oab, "numero" | "sufixo">): string {
  return `${o.numero}${o.sufixo ? `-${o.sufixo}` : ""}`;
}

function AbaDados({ podeEditar }: { podeEditar: boolean }) {
  const { avisar } = useToast();
  const [nome, setNome] = useState("");
  const [plano, setPlano] = useState<Plano | null>(null);
  const [form, setForm] = useState<Texto | null>(null);
  const [erroCarga, setErroCarga] = useState("");
  const [erroSalvar, setErroSalvar] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [tentou, setTentou] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await api<{ nome: string; plano: Plano; perfil: Perfil }>("GET", "/api/escritorio/perfil");
      setNome(r.nome);
      setPlano(r.plano);
      setForm(paraFormulario(r.perfil));
      setErroCarga("");
    } catch (e) {
      setErroCarga(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  }, []);
  useEffect(() => void carregar(), [carregar]);

  if (erroCarga) return <EstadoErro acao={<Botao variante="secundario" onClick={() => void carregar()}>Tentar de novo</Botao>}>{erroCarga}</EstadoErro>;
  if (!form) return <EsqueletoLinhas linhas={4} />;

  const campo = (k: keyof Texto, aplicar: (v: string) => string = (v) => v) => ({
    value: form[k],
    readOnly: !podeEditar,
    onChange: (e: { target: { value: string } }) => setForm({ ...form, [k]: aplicar(e.target.value) }),
  });
  const d = soDigitos;
  const erros = {
    documento: form.documento && ![11, 14].includes(d(form.documento).length) ? "Informe 11 dígitos (CPF) ou 14 (CNPJ)." : undefined,
    telefone: form.telefone && ![10, 11].includes(d(form.telefone).length) ? "Informe o DDD e o número (10 ou 11 dígitos)." : undefined,
    cep: form.cep && d(form.cep).length !== 8 ? "O CEP tem 8 dígitos." : undefined,
  };
  const temErro = Object.values(erros).some(Boolean);

  const salvar = async () => {
    setTentou(true);
    setErroSalvar("");
    if (temErro) return;
    setSalvando(true);
    try {
      const r = await api<{ perfil: Perfil }>("PUT", "/api/escritorio/perfil", form);
      setForm(paraFormulario(r.perfil));
      setTentou(false);
      avisar("Dados do escritório salvos.");
    } catch (e) {
      setErroSalvar(e instanceof ErroApi ? e.message : "Algo deu errado.");
    } finally {
      setSalvando(false);
    }
  };
  const erro = (k: keyof typeof erros) => (tentou ? erros[k] : undefined);

  return (
    <Formulario aoEnviar={() => void salvar()}>
      {!podeEditar && <Aviso tipo="info">Somente o sócio pode alterar os dados do escritório.</Aviso>}
      <div className="grade grade-2">
        <Entrada rotulo="Nome de exibição" value={nome} readOnly ajuda={`Definido pela plataforma. Plano atual: ${plano ? ROTULO_PLANO[plano] : "—"}.`} />
        <Entrada rotulo="Razão social (opcional)" autoComplete="organization" maxLength={150} {...campo("razao_social")} />
        <Entrada rotulo="CPF ou CNPJ (opcional)" inputMode="numeric" autoComplete="off" placeholder="000.000.000-00 ou 00.000.000/0000-00" erro={erro("documento")} {...campo("documento", mascaraDocumento)} />
        <Entrada rotulo="E-mail de contato (opcional)" type="email" autoComplete="email" maxLength={254} {...campo("email_contato")} />
        <Entrada rotulo="Telefone (opcional)" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(00) 00000-0000" erro={erro("telefone")} {...campo("telefone", mascaraTelefone)} />
      </div>
      <h3 className="subtitulo-form">Endereço</h3>
      <div className="grade grade-2">
        <Entrada rotulo="CEP" inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" erro={erro("cep")} {...campo("cep", mascaraCep)} />
        <Entrada rotulo="Logradouro" autoComplete="address-line1" maxLength={150} {...campo("logradouro")} />
        <Entrada rotulo="Número" maxLength={20} {...campo("numero")} />
        <Entrada rotulo="Complemento" autoComplete="address-line2" maxLength={80} {...campo("complemento")} />
        <Entrada rotulo="Bairro" maxLength={80} {...campo("bairro")} />
        <Entrada rotulo="Cidade" autoComplete="address-level2" maxLength={80} {...campo("cidade")} />
        <Selecao rotulo="UF" value={form.uf} disabled={!podeEditar} onChange={(e) => setForm({ ...form, uf: e.target.value })}>
          <option value="">Selecione</option>
          {UFS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </Selecao>
      </div>
      {erroSalvar && <Aviso>{erroSalvar}</Aviso>}
      {podeEditar && (
        <div className="modal-rodape">
          <Botao type="submit" carregando={salvando}>
            Salvar dados
          </Botao>
        </div>
      )}
    </Formulario>
  );
}

function AbaOabs({ podeEditar }: { podeEditar: boolean }) {
  const { avisar } = useToast();
  const [oabs, setOabs] = useState<Oab[] | null>(null);
  const [uso, setUso] = useState<Uso | null>(null);
  const [erroCarga, setErroCarga] = useState("");
  const [membros, setMembros] = useState<Membro[]>([]);
  const [editando, setEditando] = useState<Oab | "nova" | null>(null);
  const [desativando, setDesativando] = useState<Oab | null>(null);
  const [form, setForm] = useState({ numero: "", sufixo: "", uf: "", advogado_nome: "", user_id: "" });
  const [erroForm, setErroForm] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await api<{ oabs: Oab[]; uso: Uso }>("GET", "/api/escritorio/oabs");
      setOabs(r.oabs);
      setUso(r.uso);
      setErroCarga("");
    } catch (e) {
      setErroCarga(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  }, []);
  useEffect(() => void carregar(), [carregar]);
  useEffect(() => {
    if (!podeEditar) return;
    api<{ usuarios: Membro[] }>("GET", "/api/equipe/usuarios")
      .then((r) => setMembros(r.usuarios.filter((u) => u.ativo && !u.convite_pendente)))
      .catch(() => setMembros([]));
  }, [podeEditar]);

  const limiteAtingido = uso !== null && uso.limite !== null && uso.ativas >= uso.limite;
  const nomePlano = uso ? ROTULO_PLANO[uso.plano] : "";

  const abrir = (o: Oab | "nova") => {
    setErroForm("");
    setForm(o === "nova" ? { numero: "", sufixo: "", uf: "", advogado_nome: "", user_id: "" } : { numero: o.numero, sufixo: o.sufixo ?? "", uf: o.uf, advogado_nome: o.advogado_nome, user_id: o.user_id ?? "" });
    setEditando(o);
  };

  const salvar = async () => {
    if (editando === null) return;
    setSalvando(true);
    setErroForm("");
    try {
      const corpo = { ...form, user_id: form.user_id || null };
      if (editando === "nova") await api("POST", "/api/escritorio/oabs", corpo);
      else await api("PUT", `/api/escritorio/oabs/${editando.id}`, corpo);
      avisar(editando === "nova" ? "OAB adicionada." : "OAB atualizada.");
      setEditando(null);
      await carregar();
    } catch (e) {
      setErroForm(e instanceof ErroApi ? e.message : "Algo deu errado.");
    } finally {
      setSalvando(false);
    }
  };

  const executar = async (acao: () => Promise<unknown>, sucesso: string) => {
    try {
      await acao();
      avisar(sucesso);
    } catch (e) {
      avisar(e instanceof ErroApi ? e.message : "Algo deu errado.", "erro");
    }
    await carregar();
  };

  const colunas: Coluna<Oab>[] = [
    {
      chave: "oab",
      titulo: "OAB",
      principal: true,
      render: (o) => (
        <div className="celula-principal">
          <div>
            <strong>
              {textoOab(o)}/{o.uf}
            </strong>
            <small>{o.advogado_nome}</small>
          </div>
        </div>
      ),
    },
    {
      chave: "usuario",
      titulo: "Usuário vinculado",
      render: (o) => membros.find((m) => m.id === o.user_id)?.nome ?? (o.user_id ? "Usuário do escritório" : "—"),
    },
    {
      chave: "situacao",
      titulo: "Situação",
      render: (o) =>
        o.ativo ? (
          <Selo tom="bom" icone={CircleCheck}>
            Monitorada
          </Selo>
        ) : (
          <Selo icone={CirclePause}>Desativada</Selo>
        ),
    },
    ...(podeEditar
      ? [
          {
            chave: "acoes",
            titulo: "Ações",
            acoes: true,
            render: (o: Oab) => (
              <div className="tabela-acoes">
                <Botao tamanho="pequeno" variante="secundario" onClick={() => abrir(o)} aria-label={`Editar OAB ${textoOab(o)}/${o.uf}`}>
                  <Pencil size={16} aria-hidden="true" />
                  Editar
                </Botao>
                {o.ativo ? (
                  <Botao tamanho="pequeno" variante="perigo" onClick={() => setDesativando(o)} aria-label={`Desativar OAB ${textoOab(o)}/${o.uf}`}>
                    <Ban size={16} aria-hidden="true" />
                    Desativar
                  </Botao>
                ) : (
                  <Botao tamanho="pequeno" disabled={limiteAtingido} title={limiteAtingido ? `Limite do plano ${nomePlano} atingido` : undefined} onClick={() => void executar(() => api("PUT", `/api/escritorio/oabs/${o.id}`, { numero: o.numero, sufixo: o.sufixo, uf: o.uf, advogado_nome: o.advogado_nome, user_id: o.user_id, ativo: true }), "OAB reativada.")} aria-label={`Reativar OAB ${textoOab(o)}/${o.uf}`}>
                    <RotateCcw size={16} aria-hidden="true" />
                    Reativar
                  </Botao>
                )}
              </div>
            ),
          } satisfies Coluna<Oab>,
        ]
      : []),
  ];

  if (erroCarga) return <EstadoErro acao={<Botao variante="secundario" onClick={() => void carregar()}>Tentar de novo</Botao>}>{erroCarga}</EstadoErro>;
  if (oabs === null || uso === null) return <EsqueletoLinhas linhas={3} />;

  const botaoAdicionar = (
    <Botao onClick={() => abrir("nova")} disabled={limiteAtingido} aria-describedby={limiteAtingido ? "motivo-limite" : undefined}>
      <Plus size={18} aria-hidden="true" />
      Adicionar OAB
    </Botao>
  );

  return (
    <div className="pilha">
      <div className="uso-oabs">
        {uso.limite === null ? (
          <p className="uso-oabs-texto">
            <b>{uso.ativas}</b> {uso.ativas === 1 ? "OAB ativa" : "OABs ativas"}. O plano {nomePlano} não tem limite de OABs.
          </p>
        ) : (
          <Medidor rotulo={`OABs ativas no plano ${nomePlano}`} valor={uso.ativas} maximo={uso.limite} texto={`${uso.ativas} de ${uso.limite} ${uso.limite === 1 ? "OAB" : "OABs"} do plano`} tom={uso.ativas > uso.limite ? "critico" : uso.ativas === uso.limite ? "aviso" : "padrao"} />
        )}
        {podeEditar && <div className="uso-oabs-acao">{botaoAdicionar}</div>}
      </div>
      {limiteAtingido && uso.limite !== null && (
        <div id="motivo-limite">
          <Aviso tipo="atencao">
            {uso.ativas > uso.limite
              ? `O plano ${nomePlano} permite ${uso.limite} OAB${uso.limite === 1 ? "" : "s"} ativa${uso.limite === 1 ? "" : "s"}, mas há ${uso.ativas}. As existentes continuam, mas não é possível adicionar ou reativar. Peça a troca de plano para ampliar.`
              : `Você usou todas as OABs do plano ${nomePlano}. Desative uma OAB ou peça a troca de plano para adicionar outra.`}
          </Aviso>
        </div>
      )}
      <p className="texto-pequeno" style={{ margin: 0 }}>
        As intimações do DJEN serão buscadas para as OABs monitoradas.
      </p>
      {oabs.length === 0 ? (
        <EstadoVazio icone={Scale} titulo="Nenhuma OAB cadastrada" {...(podeEditar ? { acao: botaoAdicionar } : {})}>
          {podeEditar ? "Cadastre as OABs dos advogados do escritório para monitorar intimações." : "O sócio ainda não cadastrou as OABs do escritório."}
        </EstadoVazio>
      ) : (
        <div className="tabela-borda-total">
          <Tabela colunas={colunas} linhas={oabs} chaveLinha={(o) => o.id} legenda="OABs do escritório" />
        </div>
      )}

      <Modal aberto={editando !== null} aoFechar={() => setEditando(null)} titulo={editando === "nova" ? "Adicionar OAB" : "Editar OAB"} descricao="Informe a OAB como aparece na carteira, por exemplo 12345-A de SP.">
        <Formulario aoEnviar={() => void salvar()}>
          <div className="grade grade-2">
            <Entrada rotulo="Número" inputMode="numeric" required maxLength={10} value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value.replace(/\D/g, "") })} />
            <Entrada rotulo="Sufixo (opcional)" maxLength={5} autoCapitalize="characters" ajuda="Letras depois do hífen, se houver." value={form.sufixo} onChange={(e) => setForm({ ...form, sufixo: e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase() })} />
          </div>
          <Selecao rotulo="UF" required value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value })}>
            <option value="">Selecione</option>
            {UFS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Selecao>
          <Entrada rotulo="Nome do advogado" required maxLength={120} autoComplete="off" value={form.advogado_nome} onChange={(e) => setForm({ ...form, advogado_nome: e.target.value })} />
          <Selecao rotulo="Usuário do sistema (opcional)" value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}>
            <option value="">Sem vínculo</option>
            {membros.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </Selecao>
          {erroForm && <Aviso>{erroForm}</Aviso>}
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

      <Confirmar
        aberto={desativando !== null}
        aoFechar={() => setDesativando(null)}
        titulo="Desativar OAB"
        rotuloConfirmar="Desativar"
        perigo
        aoConfirmar={() => {
          const o = desativando;
          if (!o) return;
          setDesativando(null);
          void executar(() => api("DELETE", `/api/escritorio/oabs/${o.id}`), "OAB desativada.");
        }}
      >
        Desativar a OAB {desativando ? `${textoOab(desativando)}/${desativando.uf}` : ""}? Ela deixa de ser monitorada e libera uma vaga no plano. Você pode reativá-la depois.
      </Confirmar>
    </div>
  );
}

export function Escritorio() {
  const { eu } = useSessao();
  const podeEditar = eu?.usuario.perfil === "socio";
  return (
    <>
      <CabecalhoPagina titulo="Escritório" descricao="Dados do escritório e as OABs monitoradas." migalhas={[{ rotulo: "Início", para: "/" }, { rotulo: "Escritório" }]} />
      <Cartao>
        <Abas
          abas={[
            { id: "dados", rotulo: "Dados", conteudo: <AbaDados podeEditar={podeEditar} /> },
            { id: "oabs", rotulo: "OABs", conteudo: <AbaOabs podeEditar={podeEditar} /> },
          ]}
        />
      </Cartao>
    </>
  );
}
