import type { ReactNode } from "react";
import { Botao } from "./Botao";
import { Modal } from "./Modal";

/** Confirmação de ação destrutiva ou irreversível (substitui window.confirm). */
export function Confirmar({ aberto, titulo, children, rotuloConfirmar, perigo, carregando, aoConfirmar, aoFechar }: { aberto: boolean; titulo: string; children: ReactNode; rotuloConfirmar: string; perigo?: boolean; carregando?: boolean; aoConfirmar: () => void; aoFechar: () => void }) {
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={titulo}>
      <p style={{ margin: 0 }}>{children}</p>
      <div className="modal-rodape">
        <Botao variante="secundario" onClick={aoFechar}>
          Voltar
        </Botao>
        <Botao variante={perigo ? "perigo" : "primario"} carregando={carregando ?? false} onClick={aoConfirmar}>
          {rotuloConfirmar}
        </Botao>
      </div>
    </Modal>
  );
}
