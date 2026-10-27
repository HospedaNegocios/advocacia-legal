import { useCallback, useEffect, useState } from "react";
import { ErroApi, ROTULO_PLANO, ROTULO_STATUS, api, formatarData } from "../api";
import type { Plano, Status } from "../api";
import { Aviso, CopiarLink, Formulario } from "../componentes";

interface Escritorio {
  id: string;
  nome: string;
  plano: Plano;
  status: Status;
  teste_ate: string | null;
  exigir_2fa: boolean;
  criado_em: string;
  usuarios: number;
}

export function Plataforma() {
  const [lista, setLista] = useState<Escritorio[]>([]);
  const [erro, setErro] = useState("");
  const [nome, setNome] = useState("");
  const [plano, setPlano] = useState<Plano>("solo");
  const [conviteDe, setConviteDe] = useState<string | null>(null);
  const [emailConvite, setEmailConvite] = useState("");
  const [link, setLink] = useState("");

  const carregar = useCallback(async () => {
    try {
      setLista((await api<{ escritorios: Escritorio[] }>("GET", "/api/plataforma/escritorios")).escritorios);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const executar = async (acao: () => Promise<void>) => {
    setErro("");
    try {
      await acao();
      await carregar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  };

  const alterar = (id: string, mudanca: { plano?: Plano; status?: Status }, confirmacao?: string) => {
    if (confirmacao && !window.confirm(confirmacao)) return;
    void executar(async () => {
      await api("PATCH", `/api/plataforma/escritorios/${id}`, mudanca);
    });
  };

  return (
    <>
      <section className="cartao">
        <h2>Escritórios</h2>
        {erro && <Aviso>{erro}</Aviso>}
        <div className="tabela-rolavel">
          <table>
            <thead>
              <tr>
                <th>Escritório</th>
                <th>Plano</th>
                <th>Situação</th>
                <th>Usuários</th>
                <th>Teste até</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((e) => (
                <tr key={e.id}>
                  <td>{e.nome}</td>
                  <td>
                    <select value={e.plano} aria-label={`Plano de ${e.nome}`} onChange={(ev) => alterar(e.id, { plano: ev.target.value as Plano })}>
                      {(Object.keys(ROTULO_PLANO) as Plano[]).map((p) => (
                        <option key={p} value={p}>
                          {ROTULO_PLANO[p]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span className={`selo ${e.status}`}>{ROTULO_STATUS[e.status]}</span>
                  </td>
                  <td>{e.usuarios}</td>
                  <td>{e.status === "teste" ? formatarData(e.teste_ate) : "—"}</td>
                  <td className="acoes">
                    {e.status === "teste" && (
                      <button type="button" onClick={() => alterar(e.id, { status: "ativo" })}>
                        Ativar
                      </button>
                    )}
                    {(e.status === "suspenso" || e.status === "cancelado") && (
                      <button type="button" onClick={() => alterar(e.id, { status: "ativo" })}>
                        Reativar
                      </button>
                    )}
                    {(e.status === "ativo" || e.status === "teste") && (
                      <button
                        type="button"
                        className="secundario"
                        onClick={() => alterar(e.id, { status: "suspenso" }, `Suspender ${e.nome}? Todos os usuários serão desconectados.`)}
                      >
                        Suspender
                      </button>
                    )}
                    {e.status !== "cancelado" && (
                      <button
                        type="button"
                        className="perigo"
                        onClick={() => alterar(e.id, { status: "cancelado" }, `Cancelar ${e.nome}? Todos os usuários serão desconectados.`)}
                      >
                        Cancelar
                      </button>
                    )}
                    <button
                      type="button"
                      className="secundario"
                      onClick={() => {
                        setConviteDe(e.id);
                        setLink("");
                        setEmailConvite("");
                      }}
                    >
                      Convidar sócio
                    </button>
                  </td>
                </tr>
              ))}
              {lista.length === 0 && (
                <tr>
                  <td colSpan={6}>Nenhum escritório cadastrado ainda.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {conviteDe && (
        <section className="cartao">
          <h2>Convite do primeiro sócio</h2>
          <p>Escritório: <strong>{lista.find((x) => x.id === conviteDe)?.nome}</strong></p>
          <Formulario
            aoEnviar={() =>
              void executar(async () => {
                const r = await api<{ link: string }>("POST", `/api/plataforma/escritorios/${conviteDe}/convite-socio`, { email: emailConvite });
                setLink(r.link);
              })
            }
          >
            <label>
              E-mail do sócio
              <input type="email" value={emailConvite} onChange={(e) => setEmailConvite(e.target.value)} required />
            </label>
            <button type="submit">Gerar link do convite</button>
          </Formulario>
          {link && (
            <>
              <p>Envie este link ao sócio (vale 7 dias e só pode ser usado uma vez):</p>
              <CopiarLink link={link} />
            </>
          )}
          <button type="button" className="secundario" onClick={() => setConviteDe(null)}>
            Fechar
          </button>
        </section>
      )}

      <section className="cartao">
        <h2>Novo escritório</h2>
        <p>O escritório começa em teste grátis de 14 dias.</p>
        <Formulario
          aoEnviar={() =>
            void executar(async () => {
              await api("POST", "/api/plataforma/escritorios", { nome, plano });
              setNome("");
            })
          }
        >
          <label>
            Nome do escritório
            <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} required />
          </label>
          <label>
            Plano
            <select value={plano} onChange={(e) => setPlano(e.target.value as Plano)}>
              {(Object.keys(ROTULO_PLANO) as Plano[]).map((p) => (
                <option key={p} value={p}>
                  {ROTULO_PLANO[p]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Criar escritório</button>
        </Formulario>
      </section>
    </>
  );
}
