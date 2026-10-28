import { useEffect } from "react";
import { Casca } from "./layout/Casca";
import { TelaAcesso } from "./layout/TelaAcesso";
import { AceitarAcesso } from "./paginas/AceitarAcesso";
import { Configurar2fa } from "./paginas/Configurar2fa";
import { ClienteDetalhe } from "./paginas/ClienteDetalhe";
import { Clientes } from "./paginas/Clientes";
import { ProcessoDetalhe } from "./paginas/ProcessoDetalhe";
import { Processos } from "./paginas/Processos";
import { Agenda } from "./paginas/Agenda";
import { Financeiro } from "./paginas/Financeiro";
import { Recibo } from "./paginas/Recibo";
import { Intimacoes } from "./paginas/Intimacoes";
import { Prazos } from "./paginas/Prazos";
import { Diagnostico } from "./paginas/Diagnostico";
import { Equipe } from "./paginas/Equipe";
import { Escritorio } from "./paginas/Escritorio";
import { Escritorios } from "./paginas/Escritorios";
import { Inicio } from "./paginas/Inicio";
import { Login } from "./paginas/Login";
import { Painel } from "./paginas/Painel";
import { navegar, useCaminho } from "./roteador";
import { ProvedorSessao, useSessao } from "./sessao";
import { ProvedorTema } from "./tema";
import { ProvedorToast, Esqueleto } from "./ui";
import { AssinaturaVencida } from "./paginas/AssinaturaVencida";
import { PortalApp } from "./portal/PortalApp";

function Ir({ para }: { para: string }) {
  useEffect(() => navegar(para, true), [para]);
  return null;
}

function Rotas() {
  const caminho = useCaminho();
  const { carregando, eu } = useSessao();

  // Links de acesso funcionam com ou sem sessão aberta.
  if (caminho === "/primeiro-acesso" || caminho === "/convite") return <AceitarAcesso />;
  if (carregando) {
    return (
      <TelaAcesso titulo="Carregando...">
        <div role="status" aria-label="Carregando" style={{ display: "grid", gap: "var(--e-3)" }}>
          <Esqueleto altura={44} />
          <Esqueleto altura={44} />
        </div>
      </TelaAcesso>
    );
  }
  if (!eu) {
    return (
      <>
        {caminho !== "/entrar" && <Ir para="/entrar" />}
        <Login />
      </>
    );
  }
  if (eu.pendente_2fa) return <Configurar2fa obrigatorio />;
  if (caminho === "/entrar") return <Ir para="/" />;

  const dono = eu.usuario.dono_plataforma;
  // Teste vencido há mais de 10 dias: só a tela "Assinatura vencida" (o servidor recusa todo o resto).
  if (!dono && eu.assinatura?.situacao === "bloqueado") return <AssinaturaVencida />;
  if (dono && caminho === "/plataforma") return <Ir para="/" />;

  let conteudo = dono ? <Painel /> : <Inicio />;
  if (caminho === "/escritorios" && dono) conteudo = <Escritorios />;
  else if (caminho === "/diagnostico" && dono) conteudo = <Diagnostico />;
  else if (caminho === "/equipe" && eu.usuario.perfil === "socio") conteudo = <Equipe />;
  else if (caminho === "/escritorio" && !dono) conteudo = <Escritorio />;
  else if (caminho === "/clientes" && !dono) conteudo = <Clientes />;
  else if (caminho.startsWith("/clientes/") && !dono) conteudo = <ClienteDetalhe id={caminho.slice("/clientes/".length)} />;
  else if (caminho === "/processos" && !dono) conteudo = <Processos />;
  else if (caminho.startsWith("/processos/") && !dono) conteudo = <ProcessoDetalhe id={caminho.slice("/processos/".length)} />;
  else if (caminho === "/prazos" && !dono) conteudo = <Prazos />;
  else if (caminho === "/agenda" && !dono) conteudo = <Agenda />;
  else if (caminho === "/intimacoes" && !dono) conteudo = <Intimacoes />;
  else if (caminho === "/financeiro" && !dono && eu.permissoes.financeiro !== "nenhum") conteudo = <Financeiro />;
  else if (/^\/financeiro\/[^/]+\/recibo$/.test(caminho) && !dono && eu.permissoes.financeiro !== "nenhum") conteudo = <Recibo id={caminho.split("/")[2] as string} />;
  else if (caminho === "/seguranca") conteudo = <Configurar2fa obrigatorio={false} />;
  return <Casca>{conteudo}</Casca>;
}

/** O portal do cliente (/portal) tem sessão própria e nunca consulta a sessão do escritório. */
function Raiz() {
  const caminho = useCaminho();
  if (caminho === "/portal" || caminho.startsWith("/portal/")) return <PortalApp />;
  return (
    <ProvedorSessao>
      <Rotas />
    </ProvedorSessao>
  );
}

export function App() {
  return (
    <ProvedorTema>
      <ProvedorToast>
        <Raiz />
      </ProvedorToast>
    </ProvedorTema>
  );
}
