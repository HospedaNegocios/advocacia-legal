import { CircleAlert, Info, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { BANNER_CONVITE, BANNER_DISPENSAR, CONTATO_SUPORTE, nivelDoBanner, podeDispensarBanner, textoBannerTeste } from "../../comum/textos-assinatura";

const chave = (usuarioId: string) => `banner-teste:${usuarioId}`;

// Guarda, por usuário, o número de dias restantes em que o aviso foi dispensado: no dia seguinte o número muda e o aviso volta.
function foiDispensado(usuarioId: string, dias: number): boolean {
  try {
    return localStorage.getItem(chave(usuarioId)) === String(dias);
  } catch {
    return false;
  }
}
function gravarDispensa(usuarioId: string, dias: number): void {
  try {
    localStorage.setItem(chave(usuarioId), String(dias));
  } catch {
    /* sem armazenamento: vale só até recarregar a página */
  }
}

const ICONE = { info: Info, atencao: TriangleAlert, urgente: CircleAlert };
const CLASSE = { info: "", atencao: " aviso-atencao", urgente: " aviso-erro" };

/** Faixa "Seu teste grátis termina em N dias" (só escritório em teste, ainda dentro do prazo). Dispensável por dia, exceto quando urgente. */
export function BannerTeste({ usuarioId, dias }: { usuarioId: string; dias: number }) {
  const nivel = nivelDoBanner(dias);
  const [dispensado, setDispensado] = useState(() => podeDispensarBanner(nivel) && foiDispensado(usuarioId, dias));
  if (dispensado) return null;
  const Icone = ICONE[nivel];
  return (
    <div className="faixa-assinatura">
      <div className={`aviso banner-teste${CLASSE[nivel]}`} role="status" data-nivel={nivel}>
        <Icone size={18} aria-hidden="true" />
        <span className="banner-teste-texto">
          <strong>{textoBannerTeste(dias)}.</strong> {BANNER_CONVITE}{" "}
          <a href={CONTATO_SUPORTE.whatsappLink}>WhatsApp {CONTATO_SUPORTE.whatsappTexto}</a> ou <a href={CONTATO_SUPORTE.emailLink}>{CONTATO_SUPORTE.email}</a>.
        </span>
        {podeDispensarBanner(nivel) && (
          <button
            type="button"
            className="btn btn-fantasma btn-icone banner-teste-fechar"
            aria-label={BANNER_DISPENSAR}
            title={BANNER_DISPENSAR}
            onClick={() => {
              gravarDispensa(usuarioId, dias);
              setDispensado(true);
            }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
