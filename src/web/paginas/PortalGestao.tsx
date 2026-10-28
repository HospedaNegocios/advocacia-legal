import { Eye, EyeOff, Link2, UserCheck, UserX } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ErroApi, api, formatarData } from "../api";
import { useSessao } from "../sessao";
import { Aviso, Botao, Confirmar, CopiarLink, Entrada, EsqueletoLinhas, EstadoErro, Formulario, Selo, useToast } from "../ui";
import type { Cliente } from "./clientes-comum";
import type { Processo } from "./processos-comum";

/** Sócio e advogado decidem o que o cliente enxerga no portal (a API confere de novo). */
export function useGestorDoPortal(): boolean {
  const { eu } = useSessao();
  return eu?.usuario.perfil === "socio" || eu?.usuario.perfil === "advogado";
}

/** Cartão da aba Dados do processo: mostrar ou ocultar o processo no portal do cliente. */
export function CartaoPortalProcesso({ p, aoMudar }: { p: Processo; aoMudar: (visivel: boolean) => void }) {
  const gestor = useGestorDoPortal();
  const { avisar } = useToast();
  const [ocupado, setOcupado] = useState(false);
  if (!gestor) return null;

  const mudar = async (visivel: boolean) => {
    setOcupado(true);
    try {
      await api("PUT", `/api/portal-gestao/processos/${p.id}/visibilidade`, { visivel });
      aoMudar(visivel);
      avisar(visivel ? "Processo publicado no portal do cliente." : "Processo retirado do portal do cliente.");
    } catch (e) {
      avisar(e instanceof ErroApi ? e.message : "Algo deu errado.", "erro");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section className="portal-gestao-cartao" aria-labelledby={`portal-proc-${p.id}`}>
      <div className="abas-acao">
        <h3 id={`portal-proc-${p.id}`} className="subtitulo-form" style={{ margin: 0 }}>
          Portal do cliente
        </h3>
        {p.visivel_portal ? (
          <Selo tom="info" icone={Eye}>
            Visível no portal
          </Selo>
        ) : (
          <Selo tom="neutro" icone={EyeOff}>
            Oculto do cliente
          </Selo>
        )}
      </div>
      <p className="texto-pequeno" style={{ margin: 0 }}>
        {p.visivel_portal
          ? "Os clientes que são parte deste processo veem o número, a fase, o tribunal e o órgão. Nada além disso aparece, a menos que você marque."
          : "Por padrão o cliente não vê nada. Ao publicar, os clientes que são parte deste processo e têm acesso ao portal passam a ver o número, a fase, o tribunal e o órgão."}{" "}
        Andamentos, documentos e resumos de intimações continuam ocultos até você marcar cada um.
      </p>
      <div>
        {p.visivel_portal ? (
          <Botao variante="secundario" carregando={ocupado} onClick={() => void mudar(false)}>
            <EyeOff size={16} aria-hidden="true" />
            Retirar do portal
          </Botao>
        ) : p.ativo ? (
          <Botao carregando={ocupado} onClick={() => void mudar(true)}>
            <Eye size={16} aria-hidden="true" />
            Publicar no portal do cliente
          </Botao>
        ) : (
          <p className="texto-pequeno" style={{ margin: 0 }}>Reative o processo para poder publicá-lo.</p>
        )}
      </div>
    </section>
  );
}

/** Botão de cada andamento: mostrar ou ocultar do cliente. */
export function BotaoAndamentoPortal({ p, andamentoId, visivel, aoMudar }: { p: Processo; andamentoId: string; visivel: boolean; aoMudar: (visivel: boolean) => void }) {
  const gestor = useGestorDoPortal();
  const { avisar } = useToast();
  const [ocupado, setOcupado] = useState(false);
  if (!gestor || (!p.ativo && !visivel)) return null;
  const mudar = async () => {
    setOcupado(true);
    try {
      await api("PUT", `/api/portal-gestao/processos/${p.id}/andamentos/${andamentoId}/visibilidade`, { visivel: !visivel });
      aoMudar(!visivel);
      avisar(!visivel ? "Andamento mostrado ao cliente (se o processo estiver publicado)." : "Andamento ocultado do cliente.");
    } catch (e) {
      avisar(e instanceof ErroApi ? e.message : "Algo deu errado.", "erro");
    } finally {
      setOcupado(false);
    }
  };
  return (
    <Botao tamanho="pequeno" variante="secundario" carregando={ocupado} onClick={() => void mudar()}>
      {visivel ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
      {visivel ? "Ocultar do cliente" : "Mostrar ao cliente"}
    </Botao>
  );
}

interface Acesso {
  id: string;
  email: string;
  ativo: boolean;
  convite_pendente: boolean;
  ultimo_acesso_em: string | null;
  criado_em: string;
}
interface Estado {
  cliente_ativo: boolean;
  consentimento_ativo: boolean;
  acessos: Acesso[];
}

/** Aba "Portal" do cliente: convidar, gerar novo link e desativar o acesso. */
export function AbaPortal({ c }: { c: Cliente }) {
  const { avisar } = useToast();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [erroCarga, setErroCarga] = useState("");
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [link, setLink] = useState<{ url: string; expira: string; email: string } | null>(null);
  const [desativando, setDesativando] = useState<Acesso | null>(null);

  const carregar = useCallback(async () => {
    try {
      setEstado(await api<Estado>("GET", `/api/portal-gestao/clientes/${c.id}`));
      setErroCarga("");
    } catch (e) {
      setErroCarga(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  }, [c.id]);
  useEffect(() => void carregar(), [carregar]);

  const convidar = async (emailAlvo: string) => {
    setErro("");
    setEnviando(true);
    try {
      const r = await api<{ link: string; expira_em: string }>("POST", `/api/portal-gestao/clientes/${c.id}/convites`, { email: emailAlvo });
      setLink({ url: r.link, expira: r.expira_em, email: emailAlvo });
      setEmail("");
      await carregar();
    } catch (e) {
      const msg = e instanceof ErroApi ? e.message : "Algo deu errado.";
      setErro(msg);
      avisar(msg, "erro");
    } finally {
      setEnviando(false);
    }
  };

  const situacao = async (a: Acesso, ativo: boolean) => {
    setDesativando(null);
    try {
      await api("POST", `/api/portal-gestao/acessos/${a.id}/situacao`, { ativo });
      avisar(ativo ? "Acesso reativado." : "Acesso desativado. A pessoa foi desconectada.");
    } catch (e) {
      avisar(e instanceof ErroApi ? e.message : "Algo deu errado.", "erro");
    }
    await carregar();
  };

  if (erroCarga) return <EstadoErro acao={<Botao variante="secundario" onClick={() => void carregar()}>Tentar de novo</Botao>}>{erroCarga}</EstadoErro>;
  if (!estado) return <EsqueletoLinhas linhas={3} />;

  const podeConvidar = estado.cliente_ativo && estado.consentimento_ativo;

  return (
    <div className="pilha">
      <p className="texto-pequeno" style={{ margin: 0 }}>
        O portal é a área onde o cliente acompanha o que você publicar. Ele nunca vê nada por padrão: processos, andamentos, documentos e resumos precisam ser marcados um a um.
      </p>
      {!estado.cliente_ativo && <Aviso tipo="atencao">Este cliente está desativado. Reative o cliente para dar acesso ao portal.</Aviso>}
      {estado.cliente_ativo && !estado.consentimento_ativo && <Aviso tipo="atencao">Registre o consentimento LGPD do cliente na aba LGPD antes de dar acesso ao portal. Sem consentimento em vigor, o acesso fica bloqueado.</Aviso>}

      {podeConvidar && (
        <Formulario aoEnviar={() => void convidar(email)}>
          <Entrada rotulo="E-mail do cliente" type="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} ajuda="Você recebe um link de uso único (vale 7 dias) para enviar ao cliente, por exemplo pelo WhatsApp. O cliente cria a própria senha." />
          {erro && <Aviso>{erro}</Aviso>}
          <div>
            <Botao type="submit" carregando={enviando}>
              <Link2 size={16} aria-hidden="true" />
              Gerar link de acesso
            </Botao>
          </div>
        </Formulario>
      )}

      {link && (
        <div className="pilha" role="status">
          <Aviso tipo="ok">Link gerado para {link.email}. Ele aparece só agora: copie e envie ao cliente. Vale até {formatarData(link.expira)} e só funciona uma vez.</Aviso>
          <CopiarLink link={link.url} />
        </div>
      )}

      <h3 className="subtitulo-form">Acessos deste cliente</h3>
      {estado.acessos.length === 0 ? (
        <p className="texto-pequeno" style={{ margin: 0 }}>Nenhum acesso criado ainda.</p>
      ) : (
        <ul className="lista-simples" aria-label="Acessos ao portal">
          {estado.acessos.map((a) => (
            <li key={a.id} className="item-lista">
              <div className="item-lista-texto">
                <strong>{a.email}</strong>
                <small>{a.convite_pendente ? "Convite ainda não aceito" : a.ultimo_acesso_em ? `Último acesso em ${formatarData(a.ultimo_acesso_em)}` : "Ainda não entrou"}</small>
                <span>
                  {a.ativo ? (
                    <Selo tom="bom" icone={UserCheck}>
                      Acesso ativo
                    </Selo>
                  ) : (
                    <Selo tom="neutro" icone={UserX}>
                      Acesso desativado
                    </Selo>
                  )}
                </span>
              </div>
              <div className="tabela-acoes">
                {a.ativo && podeConvidar && (
                  <Botao tamanho="pequeno" variante="secundario" carregando={enviando} onClick={() => void convidar(a.email)}>
                    <Link2 size={16} aria-hidden="true" />
                    {a.convite_pendente ? "Gerar novo link" : "Novo link (esqueceu a senha)"}
                  </Botao>
                )}
                {a.ativo ? (
                  <Botao tamanho="pequeno" variante="perigo" onClick={() => setDesativando(a)} aria-label={`Desativar o acesso de ${a.email}`}>
                    <UserX size={16} aria-hidden="true" />
                    Desativar
                  </Botao>
                ) : (
                  <Botao tamanho="pequeno" variante="secundario" onClick={() => void situacao(a, true)} aria-label={`Reativar o acesso de ${a.email}`}>
                    <UserCheck size={16} aria-hidden="true" />
                    Reativar
                  </Botao>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Confirmar aberto={desativando !== null} aoFechar={() => setDesativando(null)} titulo="Desativar acesso" rotuloConfirmar="Desativar" perigo aoConfirmar={() => desativando && void situacao(desativando, false)}>
        Desativar o acesso de {desativando?.email}? A pessoa é desconectada na hora e não consegue entrar até você reativar.
      </Confirmar>
    </div>
  );
}
