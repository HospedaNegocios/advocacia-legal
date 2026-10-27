import { useState } from "react";
import QRCode from "qrcode";
import { ErroApi, api } from "../api";
import { Aviso, Cartao, Formulario } from "../componentes";
import { navegar } from "../roteador";
import { useSessao } from "../sessao";

export function Configurar2fa({ obrigatorio }: { obrigatorio: boolean }) {
  const { recarregar, sair } = useSessao();
  const [qr, setQr] = useState<string | null>(null);
  const [segredo, setSegredo] = useState("");
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  const iniciar = async () => {
    setErro("");
    setEnviando(true);
    try {
      const r = await api<{ otpauth: string }>("POST", "/api/2fa/iniciar");
      setSegredo(new URL(r.otpauth).searchParams.get("secret") ?? "");
      setQr(await QRCode.toDataURL(r.otpauth, { margin: 1, width: 220 }));
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    } finally {
      setEnviando(false);
    }
  };

  const confirmar = async () => {
    setErro("");
    setEnviando(true);
    try {
      await api("POST", "/api/2fa/confirmar", { codigo });
      await recarregar();
      navegar("/", true);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Cartao titulo="Verificação em duas etapas">
      {obrigatorio && <p>Para continuar, é obrigatório ativar a verificação em duas etapas na sua conta.</p>}
      {!qr ? (
        <>
          <p>
            Você vai precisar de um aplicativo autenticador no celular (por exemplo, Google Authenticator, Microsoft Authenticator
            ou Authy).
          </p>
          {erro && <Aviso>{erro}</Aviso>}
          <button type="button" onClick={() => void iniciar()} disabled={enviando}>
            Gerar QR code
          </button>
        </>
      ) : (
        <>
          <ol>
            <li>No aplicativo, escolha adicionar conta e leia o QR code abaixo.</li>
            <li>Digite aqui o código de 6 dígitos que o aplicativo mostrar.</li>
          </ol>
          <img src={qr} alt="QR code para o aplicativo autenticador" width={220} height={220} className="qr" />
          <p className="pequeno">
            Se não conseguir ler o QR code, digite esta chave no aplicativo: <code>{segredo}</code>
          </p>
          <Formulario aoEnviar={() => void confirmar()}>
            <label>
              Código
              <input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                required
              />
            </label>
            {erro && <Aviso>{erro}</Aviso>}
            <button type="submit" disabled={enviando || codigo.length !== 6}>
              Ativar
            </button>
          </Formulario>
        </>
      )}
      {obrigatorio && (
        <button type="button" className="secundario" onClick={() => void sair()}>
          Sair
        </button>
      )}
    </Cartao>
  );
}
