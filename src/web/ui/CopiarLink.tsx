import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Botao } from "./Botao";
import { useToast } from "./Toast";

/** Campo somente leitura com o link e botão de copiar. */
export function CopiarLink({ link }: { link: string }) {
  const [copiado, setCopiado] = useState(false);
  const { avisar } = useToast();
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      avisar("Link copiado.");
    } catch {
      setCopiado(false);
      avisar("Não foi possível copiar. Selecione o link e copie manualmente.", "erro");
    }
  };
  return (
    <div className="link-copiavel">
      <input className="entrada" readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Link do convite" />
      <Botao variante="secundario" onClick={() => void copiar()}>
        {copiado ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
        {copiado ? "Copiado" : "Copiar link"}
      </Botao>
    </div>
  );
}
