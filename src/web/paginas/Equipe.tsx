import { CircleCheck, CircleX, Clock, Lock, LogIn, LogOut, Plus, ShieldAlert, ShieldCheck, UsersRound, MailQuestion, UserX } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ErroApi, ROTULO_NIVEL_ACESSO, ROTULO_PERFIL, api, formatarData } from "../api";
import type { NivelAcesso, Perfil } from "../api";
import { useSessao } from "../sessao";
import { Abas, Avatar, Botao, CabecalhoPagina, Cartao, CampoMarcar, Confirmar, CopiarLink, EsqueletoKpi, EsqueletoLinhas, EstadoErro, EstadoVazio, Entrada, Formulario, Indicador, Medidor, Modal, Selecao, SelecaoCompacta, Selo, Tabela, useToast } from "../ui";
import type { Coluna, TomSelo } from "../ui";
import type { LucideIcon } from "lucide-react";

interface Membro {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
  convite_pendente: boolean;
  totp_ativo: boolean;
}
interface MembroAcesso {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  convite_pendente: boolean;
  /** Sócio: acesso total, não pode ser alterado. */
  fixo: boolean;
  financeiro: NivelAcesso;
}
const NIVEIS: NivelAcesso[] = ["nenhum", "leitura", "edicao"];
interface Acesso {
  id: string;
  acao: string;
  ip: string | null;
  criado_em: string;
  usuario_nome: string | null;
  usuario_email: string | null;
}

const ROTULO_ACAO: Record<string, { texto: string; tom: TomSelo; icone: LucideIcon }> = {
  login_sucesso: { texto: "Entrou", tom: "bom", icone: LogIn },
  login_falha: { texto: "Tentativa de entrada recusada", tom: "critico", icone: CircleX },
  logout: { texto: "Saiu", tom: "neutro", icone: LogOut },
};
const PERFIS = Object.keys(ROTULO_PERFIL) as Perfil[];

export function Equipe() {
  const { eu } = useSessao();
  const { avisar } = useToast();
  const [membros, setMembros] = useState<Membro[] | null>(null);
  const [exigir2fa, setExigir2fa] = useState(false);
  const [erroLista, setErroLista] = useState("");
  const [acessos, setAcessos] = useState<Acesso[] | null>(null);
  const [erroAcessos, setErroAcessos] = useState("");
  const [pagina, setPagina] = useState(1);
  const [temProxima, setTemProxima] = useState(false);
  const [conviteAberto, setConviteAberto] = useState(false);
  const [email, setEmail] = useState("");
  const [perfil, setPerfil] = useState<Perfil>("advogado");
  const [link, setLink] = useState("");
  const [erroConvite, setErroConvite] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [permissoes, setPermissoes] = useState<MembroAcesso[] | null>(null);
  const [erroPermissoes, setErroPermissoes] = useState("");
  const [salvando, setSalvando] = useState<string | null>(null);
  const [desativando, setDesativando] = useState<Membro | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await api<{ usuarios: Membro[]; exigir_2fa: boolean }>("GET", "/api/equipe/usuarios");
      setMembros(r.usuarios);
      setExigir2fa(r.exigir_2fa);
      setErroLista("");
    } catch (e) {
      setErroLista(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  }, []);
  const carregarAcessos = useCallback(async (p: number) => {
    try {
      const r = await api<{ itens: Acesso[]; tem_proxima: boolean }>("GET", `/api/equipe/acessos?pagina=${p}`);
      setAcessos(r.itens);
      setTemProxima(r.tem_proxima);
      setPagina(p);
      setErroAcessos("");
    } catch (e) {
      setErroAcessos(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  }, []);
  const carregarPermissoes = useCallback(async () => {
    try {
      const r = await api<{ usuarios: MembroAcesso[] }>("GET", "/api/equipe/permissoes");
      setPermissoes(r.usuarios);
      setErroPermissoes("");
    } catch (e) {
      setErroPermissoes(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  }, []);
  useEffect(() => {
    void carregar();
    void carregarAcessos(1);
    void carregarPermissoes();
  }, [carregar, carregarAcessos, carregarPermissoes]);

  /** Salva ao escolher. Em caso de erro, recarrega a lista para mostrar o que realmente está gravado. */
  const mudarAcessoFinanceiro = async (m: MembroAcesso, nivel: NivelAcesso) => {
    setSalvando(m.id);
    try {
      await api("PUT", `/api/equipe/${m.id}/permissoes/financeiro`, { nivel });
      setPermissoes((atual) => (atual ?? []).map((x) => (x.id === m.id ? { ...x, financeiro: nivel } : x)));
      avisar(`Acesso de ${m.nome} ao financeiro: ${ROTULO_NIVEL_ACESSO[nivel].toLowerCase()}.`);
    } catch (e) {
      avisar(e instanceof ErroApi ? e.message : "Algo deu errado.", "erro");
      await carregarPermissoes();
    } finally {
      setSalvando(null);
    }
  };

  const executar = async (acao: () => Promise<void>, sucesso?: string) => {
    try {
      await acao();
      if (sucesso) avisar(sucesso);
      await carregar();
    } catch (e) {
      avisar(e instanceof ErroApi ? e.message : "Algo deu errado.", "erro");
    }
  };

  const convidar = async () => {
    setEnviando(true);
    setErroConvite("");
    try {
      const r = await api<{ link: string }>("POST", "/api/equipe/convites", { email, perfil });
      setLink(r.link);
      setEmail("");
      await carregar();
    } catch (e) {
      setErroConvite(e instanceof ErroApi ? e.message : "Algo deu errado.");
    } finally {
      setEnviando(false);
    }
  };

  const ativos = (membros ?? []).filter((m) => m.ativo && !m.convite_pendente);
  const pendentes = (membros ?? []).filter((m) => m.ativo && m.convite_pendente);
  const com2fa = ativos.filter((m) => m.totp_ativo).length;

  const colunasMembros: Coluna<Membro>[] = [
    {
      chave: "nome",
      titulo: "Nome",
      principal: true,
      render: (m) => (
        <div className="celula-principal">
          <Avatar nome={m.nome} />
          <div>
            <strong>{m.nome}</strong>
            <small>{m.email}</small>
          </div>
        </div>
      ),
    },
    {
      chave: "perfil",
      titulo: "Perfil",
      render: (m) => (
        <SelecaoCompacta
          value={m.perfil}
          disabled={m.id === eu?.usuario.id}
          aria-label={`Perfil de ${m.nome}`}
          onChange={(ev) => void executar(async () => void (await api("PATCH", `/api/equipe/usuarios/${m.id}`, { perfil: ev.target.value })), `Perfil de ${m.nome} alterado.`)}
        >
          {PERFIS.map((p) => (
            <option key={p} value={p}>
              {ROTULO_PERFIL[p]}
            </option>
          ))}
        </SelecaoCompacta>
      ),
    },
    {
      chave: "situacao",
      titulo: "Situação",
      render: (m) =>
        !m.ativo ? (
          <Selo icone={UserX}>Desativado</Selo>
        ) : m.convite_pendente ? (
          <Selo tom="aviso" icone={Clock}>
            Convite pendente
          </Selo>
        ) : (
          <Selo tom="bom" icone={CircleCheck}>
            Ativo
          </Selo>
        ),
    },
    {
      chave: "2fa",
      titulo: "2 etapas",
      render: (m) =>
        m.totp_ativo ? (
          <Selo tom="bom" icone={ShieldCheck}>
            Ativa
          </Selo>
        ) : (
          <Selo icone={ShieldAlert}>Não ativada</Selo>
        ),
    },
    {
      chave: "acoes",
      titulo: "Ações",
      acoes: true,
      render: (m) => {
        const euMesmo = m.id === eu?.usuario.id;
        if (m.ativo && !euMesmo)
          return (
            <div className="tabela-acoes">
              <Botao tamanho="pequeno" variante="perigo" onClick={() => setDesativando(m)}>
                Desativar
              </Botao>
            </div>
          );
        if (!m.ativo)
          return (
            <div className="tabela-acoes">
              <Botao tamanho="pequeno" onClick={() => void executar(async () => void (await api("POST", `/api/equipe/usuarios/${m.id}/reativar`)), `${m.nome} reativado.`)}>
                Reativar
              </Botao>
            </div>
          );
        return null;
      },
    },
  ];

  const colunasAcessos: Coluna<Acesso>[] = [
    { chave: "quando", titulo: "Quando", render: (a) => formatarData(a.criado_em) },
    { chave: "usuario", titulo: "Usuário", principal: true, render: (a) => (a.usuario_nome ? <div className="celula-principal"><Avatar nome={a.usuario_nome} tamanho="pequeno" /><div><strong>{a.usuario_nome}</strong><small>{a.usuario_email}</small></div></div> : "—") },
    {
      chave: "acao",
      titulo: "O que aconteceu",
      render: (a) => {
        const r = ROTULO_ACAO[a.acao];
        return r ? <Selo tom={r.tom} icone={r.icone}>{r.texto}</Selo> : a.acao;
      },
    },
    { chave: "ip", titulo: "IP", render: (a) => a.ip ?? "—" },
  ];

  const abaMembros = erroLista ? (
    <EstadoErro acao={<Botao variante="secundario" onClick={() => void carregar()}>Tentar de novo</Botao>}>{erroLista}</EstadoErro>
  ) : membros === null ? (
    <EsqueletoLinhas linhas={4} />
  ) : membros.length === 0 ? (
    <EstadoVazio icone={UsersRound} titulo="Nenhum usuário ainda" acao={<Botao onClick={() => setConviteAberto(true)}>Convidar usuário</Botao>}>
      Convide a sua equipe para usar o sistema.
    </EstadoVazio>
  ) : (
    <Tabela colunas={colunasMembros} linhas={membros} chaveLinha={(m) => m.id} legenda="Membros da equipe" />
  );

  const abaLog = erroAcessos ? (
    <EstadoErro acao={<Botao variante="secundario" onClick={() => void carregarAcessos(pagina)}>Tentar de novo</Botao>}>{erroAcessos}</EstadoErro>
  ) : acessos === null ? (
    <EsqueletoLinhas linhas={5} />
  ) : acessos.length === 0 ? (
    <EstadoVazio compacto titulo="Nenhum registro ainda">Entradas e saídas da equipe aparecem aqui.</EstadoVazio>
  ) : (
    <>
      <Tabela colunas={colunasAcessos} linhas={acessos} chaveLinha={(a) => a.id} legenda="Log de acessos" />
      <div className="paginacao">
        <Botao variante="secundario" tamanho="pequeno" disabled={pagina <= 1} onClick={() => void carregarAcessos(pagina - 1)}>
          Anterior
        </Botao>
        <span>Página {pagina}</span>
        <Botao variante="secundario" tamanho="pequeno" disabled={!temProxima} onClick={() => void carregarAcessos(pagina + 1)}>
          Próxima
        </Botao>
      </div>
    </>
  );

  const colunasPermissoes: Coluna<MembroAcesso>[] = [
    {
      chave: "nome",
      titulo: "Nome",
      principal: true,
      render: (m) => (
        <div className="celula-principal">
          <Avatar nome={m.nome} />
          <div>
            <strong>{m.nome}</strong>
            <small>{m.email}</small>
          </div>
        </div>
      ),
    },
    { chave: "perfil", titulo: "Perfil", render: (m) => ROTULO_PERFIL[m.perfil] },
    {
      chave: "financeiro",
      titulo: "Acesso ao financeiro",
      render: (m) =>
        m.fixo ? (
          <Selo tom="info" icone={Lock}>
            Acesso total
          </Selo>
        ) : (
          <SelecaoCompacta
            value={m.financeiro}
            disabled={salvando === m.id}
            aria-label={`Acesso de ${m.nome} ao financeiro`}
            onChange={(ev) => void mudarAcessoFinanceiro(m, ev.target.value as NivelAcesso)}
          >
            {NIVEIS.map((n) => (
              <option key={n} value={n}>
                {ROTULO_NIVEL_ACESSO[n]}
              </option>
            ))}
          </SelecaoCompacta>
        ),
    },
  ];

  const abaFinanceiro = erroPermissoes ? (
    <EstadoErro acao={<Botao variante="secundario" onClick={() => void carregarPermissoes()}>Tentar de novo</Botao>}>{erroPermissoes}</EstadoErro>
  ) : permissoes === null ? (
    <EsqueletoLinhas linhas={4} />
  ) : (
    <>
      <p className="texto-pequeno" style={{ margin: 0, padding: "var(--e-4) var(--e-5) 0" }}>
        Escolha quem pode ver o financeiro e quem também pode alterar. Por padrão, ninguém além dos sócios tem acesso. A mudança vale na hora e fica registrada.
      </p>
      <Tabela colunas={colunasPermissoes} linhas={permissoes} chaveLinha={(m) => m.id} legenda="Acesso de cada pessoa ao financeiro" />
    </>
  );

  const abaSeguranca = (
    <div className="pilha" style={{ padding: "var(--e-5)" }}>
      <CampoMarcar checked={exigir2fa} onChange={(e) => void executar(async () => void (await api("PUT", "/api/equipe/configuracao", { exigir_2fa: e.target.checked })), e.target.checked ? "Verificação em duas etapas agora é obrigatória." : "Verificação em duas etapas deixou de ser obrigatória.")}>
        <strong>Exigir verificação em duas etapas de todos os usuários</strong>
        <br />
        <span className="texto-pequeno">Quem ainda não ativou precisará configurar no próximo acesso.</span>
      </CampoMarcar>
    </div>
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Equipe"
        descricao="Quem usa o sistema no seu escritório, com o perfil de cada pessoa."
        migalhas={[{ rotulo: "Início", para: "/" }, { rotulo: "Equipe" }]}
        acoes={
          <Botao
            onClick={() => {
              setLink("");
              setErroConvite("");
              setConviteAberto(true);
            }}
          >
            <Plus size={18} aria-hidden="true" />
            Convidar usuário
          </Botao>
        }
      />

      <section aria-label="Indicadores" className="grade grade-kpi">
        {membros === null ? (
          Array.from({ length: 3 }, (_, i) => <EsqueletoKpi key={i} />)
        ) : (
          <>
            <Indicador rotulo="Usuários ativos" valor={ativos.length} icone={UsersRound} />
            <Indicador rotulo="Convites pendentes" valor={pendentes.length} icone={MailQuestion} nota={pendentes.length ? "Aguardando a pessoa criar a senha" : "Nenhum convite aguardando"} />
            <Indicador rotulo="Com verificação em 2 etapas" valor={ativos.length > 0 ? `${Math.round((com2fa / ativos.length) * 100)}%` : "—"} icone={ShieldCheck}>
              <Medidor rotulo="Usuários protegidos" valor={com2fa} maximo={Math.max(1, ativos.length)} />
            </Indicador>
          </>
        )}
      </section>

      <Cartao semPadding>
        <div style={{ padding: "0 var(--e-4)" }}>
          <Abas
            abas={[
              { id: "membros", rotulo: "Membros", conteudo: <div style={{ margin: "0 calc(var(--e-4) * -1)" }}>{abaMembros}</div> },
              { id: "financeiro", rotulo: "Acesso ao financeiro", conteudo: <div style={{ margin: "0 calc(var(--e-4) * -1)" }}>{abaFinanceiro}</div> },
              { id: "log", rotulo: "Log de acessos", conteudo: <div style={{ margin: "0 calc(var(--e-4) * -1)" }}>{abaLog}</div> },
              { id: "seguranca", rotulo: "Segurança", conteudo: <div style={{ margin: "0 calc(var(--e-4) * -1)" }}>{abaSeguranca}</div> },
            ]}
          />
        </div>
      </Cartao>

      <Modal aberto={conviteAberto} aoFechar={() => setConviteAberto(false)} titulo="Convidar usuário" descricao="O sistema ainda não envia e-mails: copie o link e envie à pessoa.">
        <Formulario aoEnviar={() => void convidar()}>
          <Entrada rotulo="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Selecao rotulo="Perfil" value={perfil} onChange={(e) => setPerfil(e.target.value as Perfil)}>
            {PERFIS.map((p) => (
              <option key={p} value={p}>
                {ROTULO_PERFIL[p]}
              </option>
            ))}
          </Selecao>
          {erroConvite && (
            <p className="aviso aviso-erro" role="alert">
              {erroConvite}
            </p>
          )}
          <div className="modal-rodape">
            <Botao variante="secundario" onClick={() => setConviteAberto(false)}>
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
              O link vale 7 dias e só pode ser usado uma vez.
            </p>
            <CopiarLink link={link} />
          </div>
        )}
      </Modal>

      <Confirmar
        aberto={desativando !== null}
        aoFechar={() => setDesativando(null)}
        titulo="Desativar usuário"
        rotuloConfirmar="Desativar"
        perigo
        aoConfirmar={() => {
          const m = desativando;
          if (!m) return;
          setDesativando(null);
          void executar(async () => void (await api("POST", `/api/equipe/usuarios/${m.id}/desativar`)), `${m.nome} desativado.`);
        }}
      >
        Desativar {desativando?.nome}? A pessoa será desconectada e não poderá mais entrar.
      </Confirmar>
    </>
  );
}
