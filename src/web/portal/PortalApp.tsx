import { LogOut } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ErroApi, api } from "../api";
import { BotaoTema } from "../layout/BotaoTema";
import { Link, navegar, useCaminho } from "../roteador";
import { Aviso, Botao, Esqueleto, Marca } from "../ui";
import { PortalConvite } from "./PortalConvite";
import { PortalLogin } from "./PortalLogin";
import { PortalProcesso } from "./PortalProcesso";
import { PortalProcessos } from "./PortalProcessos";

export interface EuPortal {
  email: string;
  cliente: { nome: string };
  escritorio: { nome: string };
}

/** Texto fixo do portal: aparece em todas as telas depois do login. */
export const AVISO_PORTAL = "As informações são um resumo. Em caso de dúvida, fale com seu advogado.";

function Ir({ para }: { para: string }) {
  useEffect(() => navegar(para, true), [para]);
  return null;
}

function CascaPortal({ eu, aoSair, children }: { eu: EuPortal; aoSair: () => void; children: ReactNode }) {
  return (
    <div className="portal">
      <a className="pular-conteudo" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="portal-topo">
        <div className="portal-topo-in">
          <Link para="/portal" className="marca-logo portal-marca">
            <Marca />
          </Link>
          <span className="portal-topo-espaco" />
          <span className="portal-quem">
            <strong>{eu.cliente.nome}</strong>
            <small>{eu.escritorio.nome}</small>
          </span>
          <BotaoTema />
          <Botao variante="secundario" onClick={aoSair}>
            <LogOut size={16} aria-hidden="true" />
            Sair
          </Botao>
        </div>
      </header>
      <main className="portal-miolo" id="conteudo">
        <Aviso tipo="info">{AVISO_PORTAL}</Aviso>
        {children}
      </main>
    </div>
  );
}

/** Portal do cliente: telas, sessão e cookie próprios (nada em comum com o login do escritório). Só a marca advocacia.legal. */
export function PortalApp() {
  const caminho = useCaminho();
  const [eu, setEu] = useState<EuPortal | null | undefined>(undefined);

  const carregar = useCallback(async () => {
    try {
      const r = await api<EuPortal & { ok: boolean }>("GET", "/api/portal/eu");
      setEu({ email: r.email, cliente: r.cliente, escritorio: r.escritorio });
    } catch (e) {
      // 401 = sem sessão. Outro erro (rede) também cai na tela de entrada, que mostra o problema ao tentar entrar.
      if (!(e instanceof ErroApi)) throw e;
      setEu(null);
    }
  }, []);
  useEffect(() => void carregar(), [carregar]);

  const sair = async () => {
    try {
      await api("POST", "/api/portal/sair");
    } finally {
      setEu(null);
      navegar("/portal/entrar", true);
    }
  };

  if (caminho === "/portal/convite") return <PortalConvite aoConcluir={async () => { await carregar(); navegar("/portal", true); }} />;
  if (eu === undefined) {
    return (
      <div className="portal-acesso" role="status" aria-label="Carregando">
        <div className="portal-acesso-caixa">
          <Esqueleto altura={44} />
          <Esqueleto altura={44} />
        </div>
      </div>
    );
  }
  if (eu === null) {
    return (
      <>
        {caminho !== "/portal/entrar" && <Ir para="/portal/entrar" />}
        <PortalLogin aoEntrar={async () => { await carregar(); navegar("/portal", true); }} />
      </>
    );
  }
  if (caminho === "/portal/entrar") return <Ir para="/portal" />;

  const prefixo = "/portal/processos/";
  const conteudo = caminho.startsWith(prefixo) ? <PortalProcesso id={caminho.slice(prefixo.length)} aoSessaoExpirada={() => setEu(null)} /> : <PortalProcessos aoSessaoExpirada={() => setEu(null)} />;
  return (
    <CascaPortal eu={eu} aoSair={() => void sair()}>
      {conteudo}
    </CascaPortal>
  );
}
