import { useCallback, useEffect, useState } from "react";
import { ErroApi, ROTULO_PERFIL, api, formatarData } from "../api";
import type { Perfil } from "../api";
import { Aviso, CopiarLink, Formulario } from "../componentes";
import { useSessao } from "../sessao";

interface Membro {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
  convite_pendente: boolean;
  totp_ativo: boolean;
}
interface Acesso {
  id: string;
  acao: string;
  ip: string | null;
  criado_em: string;
  usuario_nome: string | null;
  usuario_email: string | null;
}

const ROTULO_ACAO: Record<string, string> = {
  login_sucesso: "Entrou",
  login_falha: "Tentativa de entrada recusada",
  logout: "Saiu",
};
const PERFIS = Object.keys(ROTULO_PERFIL) as Perfil[];

export function Equipe() {
  const { eu } = useSessao();
  const [membros, setMembros] = useState<Membro[]>([]);
  const [exigir2fa, setExigir2fa] = useState(false);
  const [erro, setErro] = useState("");
  const [email, setEmail] = useState("");
  const [perfil, setPerfil] = useState<Perfil>("advogado");
  const [link, setLink] = useState("");
  const [acessos, setAcessos] = useState<Acesso[]>([]);
  const [pagina, setPagina] = useState(1);
  const [temProxima, setTemProxima] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await api<{ usuarios: Membro[]; exigir_2fa: boolean }>("GET", "/api/equipe/usuarios");
      setMembros(r.usuarios);
      setExigir2fa(r.exigir_2fa);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  }, []);
  const carregarAcessos = useCallback(async (p: number) => {
    try {
      const r = await api<{ itens: Acesso[]; tem_proxima: boolean }>("GET", `/api/equipe/acessos?pagina=${p}`);
      setAcessos(r.itens);
      setTemProxima(r.tem_proxima);
      setPagina(p);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  }, []);
  useEffect(() => {
    void carregar();
    void carregarAcessos(1);
  }, [carregar, carregarAcessos]);

  const executar = async (acao: () => Promise<void>) => {
    setErro("");
    try {
      await acao();
      await carregar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  };

  return (
    <>
      <section className="cartao">
        <h2>Equipe</h2>
        {erro && <Aviso>{erro}</Aviso>}
        <div className="tabela-rolavel">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Perfil</th>
                <th>Situação</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {membros.map((m) => {
                const euMesmo = m.id === eu?.usuario.id;
                return (
                  <tr key={m.id}>
                    <td>{m.nome}</td>
                    <td>{m.email}</td>
                    <td>
                      <select
                        value={m.perfil}
                        disabled={euMesmo}
                        aria-label={`Perfil de ${m.nome}`}
                        onChange={(ev) => void executar(async () => void (await api("PATCH", `/api/equipe/usuarios/${m.id}`, { perfil: ev.target.value })))}
                      >
                        {PERFIS.map((p) => (
                          <option key={p} value={p}>
                            {ROTULO_PERFIL[p]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{!m.ativo ? "Desativado" : m.convite_pendente ? "Convite pendente" : "Ativo"}</td>
                    <td className="acoes">
                      {m.ativo && !euMesmo && (
                        <button
                          type="button"
                          className="perigo"
                          onClick={() => {
                            if (window.confirm(`Desativar ${m.nome}? Ele será desconectado e não poderá mais entrar.`)) {
                              void executar(async () => void (await api("POST", `/api/equipe/usuarios/${m.id}/desativar`)));
                            }
                          }}
                        >
                          Desativar
                        </button>
                      )}
                      {!m.ativo && (
                        <button type="button" onClick={() => void executar(async () => void (await api("POST", `/api/equipe/usuarios/${m.id}/reativar`)))}>
                          Reativar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="cartao">
        <h2>Convidar usuário</h2>
        <Formulario
          aoEnviar={() =>
            void executar(async () => {
              const r = await api<{ link: string }>("POST", "/api/equipe/convites", { email, perfil });
              setLink(r.link);
              setEmail("");
            })
          }
        >
          <label>
            E-mail
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Perfil
            <select value={perfil} onChange={(e) => setPerfil(e.target.value as Perfil)}>
              {PERFIS.map((p) => (
                <option key={p} value={p}>
                  {ROTULO_PERFIL[p]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Gerar link do convite</button>
        </Formulario>
        {link && (
          <>
            <p>O sistema ainda não envia e-mails. Copie o link e envie à pessoa (vale 7 dias e só pode ser usado uma vez):</p>
            <CopiarLink link={link} />
          </>
        )}
      </section>

      <section className="cartao">
        <h2>Segurança do escritório</h2>
        <label className="linha">
          <input
            type="checkbox"
            checked={exigir2fa}
            onChange={(e) =>
              void executar(async () => {
                await api("PUT", "/api/equipe/configuracao", { exigir_2fa: e.target.checked });
              })
            }
          />
          Exigir verificação em duas etapas de todos os usuários
        </label>
      </section>

      <section className="cartao">
        <h2>Log de acessos</h2>
        <div className="tabela-rolavel">
          <table>
            <thead>
              <tr>
                <th>Quando</th>
                <th>Usuário</th>
                <th>O que aconteceu</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {acessos.map((a) => (
                <tr key={a.id}>
                  <td>{formatarData(a.criado_em)}</td>
                  <td>{a.usuario_nome ? `${a.usuario_nome} (${a.usuario_email})` : "—"}</td>
                  <td>{ROTULO_ACAO[a.acao] ?? a.acao}</td>
                  <td>{a.ip ?? "—"}</td>
                </tr>
              ))}
              {acessos.length === 0 && (
                <tr>
                  <td colSpan={4}>Nenhum registro ainda.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="paginacao">
          <button type="button" className="secundario" disabled={pagina <= 1} onClick={() => void carregarAcessos(pagina - 1)}>
            Anterior
          </button>
          <span>Página {pagina}</span>
          <button type="button" className="secundario" disabled={!temProxima} onClick={() => void carregarAcessos(pagina + 1)}>
            Próxima
          </button>
        </div>
      </section>
    </>
  );
}
