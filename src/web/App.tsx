import { useEffect } from "react";
import { Casca } from "./layout/Casca";
import { TelaAcesso } from "./layout/TelaAcesso";
import { AceitarAcesso } from "./paginas/AceitarAcesso";
import { Configurar2fa } from "./paginas/Configurar2fa";
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
  if (dono && caminho === "/plataforma") return <Ir para="/" />;

  let conteudo = dono ? <Painel /> : <Inicio />;
  if (caminho === "/escritorios" && dono) conteudo = <Escritorios />;
  else if (caminho === "/diagnostico" && dono) conteudo = <Diagnostico />;
  else if (caminho === "/equipe" && eu.usuario.perfil === "socio") conteudo = <Equipe />;
  else if (caminho === "/escritorio" && !dono) conteudo = <Escritorio />;
  else if (caminho === "/seguranca") conteudo = <Configurar2fa obrigatorio={false} />;
  return <Casca>{conteudo}</Casca>;
}

export function App() {
  return (
    <ProvedorTema>
      <ProvedorToast>
        <ProvedorSessao>
          <Rotas />
        </ProvedorSessao>
      </ProvedorToast>
    </ProvedorTema>
  );
}
