import { KeyRound, ShieldCheck, UsersRound } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "../roteador";
import { BotaoTema } from "./BotaoTema";
import { Marca } from "./Marca";

/** Tela dividida das páginas de acesso: painel da marca (desktop) + formulário. */
export function TelaAcesso({ titulo, descricao, children }: { titulo: string; descricao?: string | undefined; children: ReactNode }) {
  return (
    <div className="acesso">
      <aside className="acesso-marca" aria-label="advocacia.legal">
        <Link para="/entrar" className="marca-logo">
          <Marca />
        </Link>
        <div style={{ position: "relative", zIndex: 1 }}>
          <h2>A gestão do seu escritório, com a clareza que o dia a dia pede.</h2>
          <p>Clientes, processos, prazos e agenda reunidos em um só lugar, para a sua equipe.</p>
        </div>
        <ul className="acesso-pontos">
          <li>
            <ShieldCheck size={20} aria-hidden="true" />
            Verificação em duas etapas para proteger cada conta
          </li>
          <li>
            <UsersRound size={20} aria-hidden="true" />
            Perfis de acesso para sócios, advogados, estagiários e secretaria
          </li>
          <li>
            <KeyRound size={20} aria-hidden="true" />
            Cada escritório enxerga somente os seus próprios dados
          </li>
        </ul>
      </aside>
      <main className="acesso-form" id="conteudo">
        <div className="acesso-tema">
          <BotaoTema />
        </div>
        <div className="acesso-caixa">
          <div className="acesso-caixa-topo">
            <Link para="/entrar" className="marca-logo acesso-logo-mobile">
              <Marca />
            </Link>
            <h1>{titulo}</h1>
            {descricao && <p>{descricao}</p>}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
