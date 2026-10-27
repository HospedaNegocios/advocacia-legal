import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ErroApi, ROTULO_PLANO, api, formatarDia } from "../api";
import type { Plano, Status } from "../api";
import type { EscritorioResumo } from "../painel";
import { Avatar, Botao, Confirmar, CopiarLink, Entrada, Formulario, Modal, SelecaoCompacta, Selecao, SeloSituacao, Tabela, useToast } from "../ui";
import type { Coluna } from "../ui";

export interface Escritorio extends EscritorioResumo {
  exigir_2fa: boolean;
}

export type EstadoLista = "carregando" | "erro" | "ok";

/** Carrega a lista de escritórios (endpoint do dono) e expõe as ações de gestão. */
export function useEscritorios() {
  const { avisar } = useToast();
  const [lista, setLista] = useState<Escritorio[]>([]);
  const [estado, setEstado] = useState<EstadoLista>("carregando");
  const [mensagemErro, setMensagemErro] = useState("");

  const carregar = useCallback(async () => {
    try {
      const r = await api<{ escritorios: Escritorio[] }>("GET", "/api/plataforma/escritorios");
      setLista(r.escritorios);
      setEstado("ok");
    } catch (e) {
      setMensagemErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
      setEstado("erro");
    }
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const alterar = async (e: Escritorio, mudanca: { plano?: Plano; status?: Status }, sucesso: string) => {
    try {
      await api("PATCH", `/api/plataforma/escritorios/${e.id}`, mudanca);
      avisar(sucesso);
      await carregar();
    } catch (err) {
      avisar(err instanceof ErroApi ? err.message : "Algo deu errado.", "erro");
    }
  };

  return { lista, estado, mensagemErro, recarregar: carregar, alterar };
}
export type GestaoEscritorios = ReturnType<typeof useEscritorios>;

type Pendente = { tipo: "suspender" | "cancelar"; escritorio: Escritorio } | null;

/** Modais de criação, convite e confirmação. Os botões da tabela só chamam `abrirConvite` e `pedir`. */
export function useModaisEscritorios(g: GestaoEscritorios) {
  const { avisar } = useToast();
  const [novoAberto, setNovoAberto] = useState(false);
  const [conviteDe, setConviteDe] = useState<Escritorio | null>(null);
  const [pendente, setPendente] = useState<Pendente>(null);
  const [nome, setNome] = useState("");
  const [plano, setPlano] = useState<Plano>("solo");
  const [email, setEmail] = useState("");
  const [link, setLink] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const criar = async () => {
    setEnviando(true);
    setErro("");
    try {
      await api("POST", "/api/plataforma/escritorios", { nome, plano });
      avisar(`Escritório “${nome}” criado, com 14 dias de teste.`);
      setNovoAberto(false);
      setNome("");
      await g.recarregar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    } finally {
      setEnviando(false);
    }
  };
  const gerarConvite = async () => {
    if (!conviteDe) return;
    setEnviando(true);
    setErro("");
    try {
      const r = await api<{ link: string }>("POST", `/api/plataforma/escritorios/${conviteDe.id}/convite-socio`, { email });
      setLink(r.link);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    } finally {
      setEnviando(false);
    }
  };

  const abrirNovo = () => {
    setErro("");
    setNovoAberto(true);
  };
  const abrirConvite = (e: Escritorio) => {
    setErro("");
    setLink("");
    setEmail("");
    setConviteDe(e);
  };
  const pedir = (tipo: "suspender" | "cancelar", escritorio: Escritorio) => setPendente({ tipo, escritorio });

  const modais: ReactNode = (
    <>
      <Modal aberto={novoAberto} aoFechar={() => setNovoAberto(false)} titulo="Novo escritório" descricao="O escritório começa em teste grátis de 14 dias.">
        <Formulario aoEnviar={() => void criar()}>
          <Entrada rotulo="Nome do escritório" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} required />
          <Selecao rotulo="Plano" value={plano} onChange={(e) => setPlano(e.target.value as Plano)}>
            {(Object.keys(ROTULO_PLANO) as Plano[]).map((p) => (
              <option key={p} value={p}>
                {ROTULO_PLANO[p]}
              </option>
            ))}
          </Selecao>
          {erro && <p className="aviso aviso-erro" role="alert">{erro}</p>}
          <div className="modal-rodape">
            <Botao variante="secundario" onClick={() => setNovoAberto(false)}>
              Cancelar
            </Botao>
            <Botao type="submit" carregando={enviando}>
              Criar escritório
            </Botao>
          </div>
        </Formulario>
      </Modal>

      <Modal aberto={conviteDe !== null} aoFechar={() => setConviteDe(null)} titulo="Convite do primeiro sócio" descricao={conviteDe ? `Escritório: ${conviteDe.nome}` : undefined}>
        <Formulario aoEnviar={() => void gerarConvite()}>
          <Entrada rotulo="E-mail do sócio" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          {erro && <p className="aviso aviso-erro" role="alert">{erro}</p>}
          <div className="modal-rodape">
            <Botao variante="secundario" onClick={() => setConviteDe(null)}>
              Fechar
            </Botao>
            <Botao type="submit" carregando={enviando}>
              Gerar link do convite
            </Botao>
          </div>
        </Formulario>
        {link && (
          <div className="pilha">
            <p className="texto-pequeno" style={{ margin: 0 }}>
              Envie este link ao sócio. Ele vale 7 dias e só pode ser usado uma vez.
            </p>
            <CopiarLink link={link} />
          </div>
        )}
      </Modal>

      <Confirmar
        aberto={pendente !== null}
        aoFechar={() => setPendente(null)}
        titulo={pendente?.tipo === "cancelar" ? "Cancelar escritório" : "Suspender escritório"}
        rotuloConfirmar={pendente?.tipo === "cancelar" ? "Cancelar escritório" : "Suspender"}
        perigo
        aoConfirmar={() => {
          const p = pendente;
          if (!p) return;
          setPendente(null);
          void g.alterar(p.escritorio, { status: p.tipo === "cancelar" ? "cancelado" : "suspenso" }, `${p.escritorio.nome}: ${p.tipo === "cancelar" ? "cancelado" : "suspenso"}.`);
        }}
      >
        {pendente?.tipo === "cancelar" ? "Cancelar" : "Suspender"} {pendente?.escritorio.nome}? Todos os usuários serão desconectados.
      </Confirmar>
    </>
  );

  return { abrirNovo, abrirConvite, pedir, modais };
}
export type ModaisEscritorios = ReturnType<typeof useModaisEscritorios>;

/** Tabela de escritórios com ações. No celular cada linha vira um cartão. */
export function TabelaEscritorios({ linhas, g, m }: { linhas: Escritorio[]; g: GestaoEscritorios; m: ModaisEscritorios }) {
  const colunas: Coluna<Escritorio>[] = [
    {
      chave: "nome",
      titulo: "Escritório",
      principal: true,
      render: (e) => (
        <div className="celula-principal">
          <Avatar nome={e.nome} />
          <div>
            <strong>{e.nome}</strong>
            <small>Criado em {formatarDia(e.criado_em)}</small>
          </div>
        </div>
      ),
    },
    {
      chave: "plano",
      titulo: "Plano",
      render: (e) => (
        <SelecaoCompacta value={e.plano} aria-label={`Plano de ${e.nome}`} onChange={(ev) => void g.alterar(e, { plano: ev.target.value as Plano }, `Plano de ${e.nome}: ${ROTULO_PLANO[ev.target.value as Plano]}.`)}>
          {(Object.keys(ROTULO_PLANO) as Plano[]).map((p) => (
            <option key={p} value={p}>
              {ROTULO_PLANO[p]}
            </option>
          ))}
        </SelecaoCompacta>
      ),
    },
    { chave: "status", titulo: "Situação", render: (e) => <SeloSituacao status={e.status} /> },
    { chave: "usuarios", titulo: "Usuários", numerica: true, render: (e) => e.usuarios },
    { chave: "teste", titulo: "Teste até", nowrap: true, render: (e) => (e.status === "teste" ? formatarDia(e.teste_ate) : "—") },
    {
      chave: "acoes",
      titulo: "Ações",
      acoes: true,
      render: (e) => (
        <div className="tabela-acoes">
          {e.status === "teste" && (
            <Botao tamanho="pequeno" onClick={() => void g.alterar(e, { status: "ativo" }, `${e.nome}: ativado.`)}>
              Ativar
            </Botao>
          )}
          {(e.status === "suspenso" || e.status === "cancelado") && (
            <Botao tamanho="pequeno" onClick={() => void g.alterar(e, { status: "ativo" }, `${e.nome}: reativado.`)}>
              Reativar
            </Botao>
          )}
          <Botao tamanho="pequeno" variante="secundario" onClick={() => m.abrirConvite(e)}>
            Convidar sócio
          </Botao>
          {(e.status === "ativo" || e.status === "teste") && (
            <Botao tamanho="pequeno" variante="secundario" onClick={() => m.pedir("suspender", e)}>
              Suspender
            </Botao>
          )}
          {e.status !== "cancelado" && (
            <Botao tamanho="pequeno" variante="perigo" onClick={() => m.pedir("cancelar", e)}>
              Cancelar
            </Botao>
          )}
        </div>
      ),
    },
  ];
  return <Tabela colunas={colunas} linhas={linhas} chaveLinha={(e) => e.id} legenda="Escritórios cadastrados" />;
}
