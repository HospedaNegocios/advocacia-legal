import { Smartphone } from "lucide-react";
import { useState } from "react";
import QRCode from "qrcode";
import { ErroApi, api } from "../api";
import { TelaAcesso } from "../layout/TelaAcesso";
import { navegar } from "../roteador";
import { useSessao } from "../sessao";
import { Aviso, Botao, CabecalhoPagina, Cartao, Entrada, Formulario, Passos, useToast } from "../ui";

const ETAPAS = ["Aplicativo", "QR code", "Confirmar"];

/** Em `obrigatorio`, ocupa a tela toda (conta ainda sem 2FA). Senão, aparece dentro do sistema. */
export function Configurar2fa({ obrigatorio }: { obrigatorio: boolean }) {
  const { recarregar, sair, eu } = useSessao();
  const { avisar } = useToast();
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
      avisar("Verificação em duas etapas ativada.");
      navegar("/", true);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    } finally {
      setEnviando(false);
    }
  };

  const ativo = eu?.usuario.totp_ativo === true;
  const etapa = !qr ? 1 : 2;

  const corpo = (
    <div className="pilha">
      <Passos etapas={ETAPAS} atual={etapa} />
      {obrigatorio && <Aviso tipo="atencao">Para continuar, é obrigatório ativar a verificação em duas etapas na sua conta.</Aviso>}
      {ativo && !obrigatorio && <Aviso tipo="info">A verificação em duas etapas já está ativa. Se gerar um novo QR code, o aplicativo anterior deixa de valer.</Aviso>}
      {!qr ? (
        <>
          <p style={{ margin: 0 }}>
            Você vai precisar de um aplicativo autenticador no celular, por exemplo Google Authenticator, Microsoft Authenticator ou Authy.
          </p>
          {erro && <Aviso>{erro}</Aviso>}
          <Botao tamanho="grande" bloco carregando={enviando} onClick={() => void iniciar()}>
            <Smartphone size={18} aria-hidden="true" />
            Gerar QR code
          </Botao>
        </>
      ) : (
        <>
          <ol style={{ margin: 0, paddingLeft: "1.25rem", display: "grid", gap: "var(--e-1)" }}>
            <li>No aplicativo, escolha adicionar conta e leia o QR code abaixo.</li>
            <li>Digite aqui o código de 6 dígitos que o aplicativo mostrar.</li>
          </ol>
          <img src={qr} alt="QR code para o aplicativo autenticador" width={220} height={220} className="qr" />
          <p className="texto-pequeno" style={{ margin: 0 }}>
            Se não conseguir ler o QR code, digite esta chave no aplicativo: <code>{segredo}</code>
          </p>
          <Formulario aoEnviar={() => void confirmar()}>
            <Entrada rotulo="Código de 6 dígitos" codigo value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" required />
            {erro && <Aviso>{erro}</Aviso>}
            <Botao type="submit" tamanho="grande" bloco carregando={enviando} disabled={codigo.length !== 6}>
              Ativar verificação
            </Botao>
          </Formulario>
        </>
      )}
      {obrigatorio && (
        <Botao variante="fantasma" bloco onClick={() => void sair()}>
          Sair
        </Botao>
      )}
    </div>
  );

  if (obrigatorio) {
    return (
      <TelaAcesso titulo="Proteja a sua conta" descricao="Falta só um passo: a verificação em duas etapas.">
        {corpo}
      </TelaAcesso>
    );
  }
  return (
    <>
      <CabecalhoPagina titulo="Verificação em duas etapas" descricao="Proteja a sua conta com um código gerado no celular." migalhas={[{ rotulo: "Início", para: "/" }, { rotulo: "Segurança" }]} />
      <div style={{ maxWidth: "30rem" }}>
        <Cartao>{corpo}</Cartao>
      </div>
    </>
  );
}
