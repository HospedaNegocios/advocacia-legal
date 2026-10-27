import { useEffect } from "react";
import { Cartao } from "./componentes";
import { AceitarAcesso } from "./paginas/AceitarAcesso";
import { Configurar2fa } from "./paginas/Configurar2fa";
import { Equipe } from "./paginas/Equipe";
import { Inicio } from "./paginas/Inicio";
import { Login } from "./paginas/Login";
import { Plataforma } from "./paginas/Plataforma";
import { Link, navegar, useCaminho } from "./roteador";
import { ProvedorSessao, useSessao } from "./sessao";

function Estrutura({ children }: { children: React.ReactNode }) {
  const { eu, sair } = useSessao();
  return (
    <div className="pagina">
      <header className="topo">
        <strong className="marca-topo">advocacia.legal</strong>
        <nav>
          <Link para="/">Início</Link>
          {eu?.usuario.dono_plataforma && <Link para="/plataforma">Escritórios</Link>}
          {eu?.usuario.perfil === "socio" && <Link para="/equipe">Equipe</Link>}
        </nav>
        <button
          type="button"
          className="secundario"
          onClick={() => {
            void sair().then(() => navegar("/entrar", true));
          }}
        >
          Sair
        </button>
      </header>
      <main className="conteudo">{children}</main>
    </div>
  );
}

function Ir({ para }: { para: string }) {
  useEffect(() => navegar(para, true), [para]);
  return null;
}

function Rotas() {
  const caminho = useCaminho();
  const { carregando, eu } = useSessao();

  // Links de acesso funcionam com ou sem sessão aberta.
  if (caminho === "/primeiro-acesso" || caminho === "/convite") return <AceitarAcesso />;
  if (carregando) return <Cartao titulo="Carregando...">{null}</Cartao>;
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

  let conteudo = <Inicio />;
  if (caminho === "/plataforma" && eu.usuario.dono_plataforma) conteudo = <Plataforma />;
  else if (caminho === "/equipe" && eu.usuario.perfil === "socio") conteudo = <Equipe />;
  else if (caminho === "/seguranca") conteudo = <Configurar2fa obrigatorio={false} />;
  return <Estrutura>{conteudo}</Estrutura>;
}

export function App() {
  return (
    <ProvedorSessao>
      <Rotas />
    </ProvedorSessao>
  );
}
