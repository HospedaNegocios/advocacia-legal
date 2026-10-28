import { Mail, MessageCircle } from "lucide-react";
import { CONTATO_SUPORTE, TELA_VENCIDA } from "../../comum/textos-assinatura";
import { useSessao } from "../sessao";
import { navegar } from "../roteador";
import { Aviso, Botao } from "../ui";
import { TelaAcesso } from "../layout/TelaAcesso";

/** Escritório bloqueado (teste vencido há mais de 10 dias): sem dados do escritório, só como falar com o suporte. */
export function AssinaturaVencida() {
  const { sair } = useSessao();
  return (
    <TelaAcesso titulo={TELA_VENCIDA.titulo} descricao={TELA_VENCIDA.descricao}>
      <div className="pilha">
        <Aviso tipo="atencao">{TELA_VENCIDA.aviso}</Aviso>
        <p style={{ margin: 0 }}>
          <MessageCircle size={16} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> WhatsApp: <a href={CONTATO_SUPORTE.whatsappLink}>{CONTATO_SUPORTE.whatsappTexto}</a>
        </p>
        <p style={{ margin: 0 }}>
          <Mail size={16} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> E-mail: <a href={CONTATO_SUPORTE.emailLink}>{CONTATO_SUPORTE.email}</a>
        </p>
        <Botao variante="secundario" bloco onClick={() => void sair().then(() => navegar("/entrar", true))}>
          Sair
        </Botao>
      </div>
    </TelaAcesso>
  );
}
