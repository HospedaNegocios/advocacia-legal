import { Mail, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ErroApi, api } from "../api";
import { Link } from "../roteador";
import { useSessao } from "../sessao";
import { Aviso, Botao, CabecalhoPagina, CampoMarcar, Cartao, EstadoErro, Esqueleto, useToast } from "../ui";

interface Preferencias {
  alerta_email: boolean;
  envio_habilitado: boolean;
}

/** Preferências da própria conta. Hoje: receber por e-mail o resumo diário de prazos (padrão desligado). */
export function MinhaConta() {
  const { eu } = useSessao();
  const { avisar } = useToast();
  const [pref, setPref] = useState<Preferencias | null>(null);
  const [erroCarga, setErroCarga] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setErroCarga(false);
    try {
      setPref(await api<Preferencias>("GET", "/api/eu/preferencias"));
    } catch {
      setErroCarga(true);
    }
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const alterar = async (ligado: boolean) => {
    setErro("");
    setSalvando(true);
    try {
      const r = await api<Preferencias>("PUT", "/api/eu/preferencias", { alerta_email: ligado });
      setPref(r);
      avisar(ligado ? "Pronto. Você vai receber o resumo diário de prazos por e-mail." : "Pronto. Você não vai mais receber o resumo por e-mail.");
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <CabecalhoPagina titulo="Minha conta" descricao="Escolhas pessoais, só para você." migalhas={[{ rotulo: "Início", para: "/" }, { rotulo: "Minha conta" }]} />
      <div className="pilha" style={{ maxWidth: "36rem" }}>
        <Cartao titulo="Avisos por e-mail" subtitulo={`Enviados para ${eu?.usuario.email ?? "o seu e-mail"}`}>
          {erroCarga ? (
            <EstadoErro acao={<Botao variante="secundario" onClick={() => void carregar()}>Tentar de novo</Botao>} />
          ) : !pref ? (
            <Esqueleto altura={44} />
          ) : (
            <div className="pilha">
              <CampoMarcar checked={pref.alerta_email} disabled={salvando} onChange={(e) => void alterar(e.target.checked)}>
                <Mail size={16} aria-hidden="true" style={{ verticalAlign: "-3px", marginRight: "var(--e-2)" }} />
                Receber por e-mail o resumo diário de prazos às 07:00
              </CampoMarcar>
              <p className="texto-pequeno" style={{ margin: 0 }}>
                Você recebe só os seus prazos: vencidos, de hoje e dos próximos 3 dias. Se não houver nenhum, não enviamos nada. O aviso na tela continua funcionando de qualquer jeito.
              </p>
              {!pref.envio_habilitado && <Aviso tipo="info">O envio de e-mails ainda não foi habilitado pelo administrador. Sua escolha fica salva e vale assim que for habilitado.</Aviso>}
              {erro && <Aviso>{erro}</Aviso>}
            </div>
          )}
        </Cartao>
        <Cartao titulo="Segurança">
          <Link para="/seguranca" className="menu-item">
            <ShieldCheck size={18} aria-hidden="true" />
            Verificação em duas etapas
          </Link>
        </Cartao>
      </div>
    </>
  );
}
