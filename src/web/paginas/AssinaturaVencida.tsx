import { Mail, MessageCircle } from "lucide-react";
import { useSessao } from "../sessao";
import { navegar } from "../roteador";
import { Aviso, Botao } from "../ui";
import { TelaAcesso } from "../layout/TelaAcesso";

/** Escritório bloqueado (teste vencido há mais de 10 dias): sem dados do escritório, só como falar com o suporte. */
export function AssinaturaVencida() {
  const { sair } = useSessao();
  return (
    <TelaAcesso titulo="Assinatura vencida" descricao="O acesso ao seu escritório está bloqueado. Fale com o suporte para reativar.">
      <div className="pilha">
        <Aviso tipo="atencao">Os dados do seu escritório continuam guardados. Assim que a assinatura for ativada, o acesso volta ao normal.</Aviso>
        <p style={{ margin: 0 }}>
          <MessageCircle size={16} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> WhatsApp: <a href="https://wa.me/5512992198038">(12) 99219-8038</a>
        </p>
        <p style={{ margin: 0 }}>
          <Mail size={16} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> E-mail: <a href="mailto:comercial@advocacia.legal">comercial@advocacia.legal</a>
        </p>
        <Botao variante="secundario" bloco onClick={() => void sair().then(() => navegar("/entrar", true))}>
          Sair
        </Botao>
      </div>
    </TelaAcesso>
  );
}
