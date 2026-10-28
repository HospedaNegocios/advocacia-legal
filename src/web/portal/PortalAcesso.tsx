import type { ReactNode } from "react";
import { BotaoTema } from "../layout/BotaoTema";
import { Marca } from "../ui";

/** Moldura das telas de entrada do portal (login e convite). Só a marca advocacia.legal. */
export function PortalAcesso({ titulo, descricao, children }: { titulo: string; descricao?: string | undefined; children: ReactNode }) {
  return (
    <div className="portal-acesso">
      <div className="portal-acesso-tema">
        <BotaoTema />
      </div>
      <main className="portal-acesso-caixa" id="conteudo">
        <span className="marca-logo portal-marca">
          <Marca />
        </span>
        <div>
          <h1>{titulo}</h1>
          {descricao && <p className="portal-acesso-desc">{descricao}</p>}
        </div>
        {children}
      </main>
    </div>
  );
}
