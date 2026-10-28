import { useEffect, useState } from "react";
import { ErroApi, api } from "../api";
import { navegar } from "../roteador";
import { Aviso, Botao, Entrada, Formulario } from "../ui";
import { PortalAcesso } from "./PortalAcesso";

/** /portal/convite#TOKEN. O token vem no fragmento (#) e é tirado da barra de endereço logo ao abrir. */
export function PortalConvite({ aoConcluir }: { aoConcluir: () => Promise<void> }) {
  const [token] = useState(() => window.location.hash.slice(1));
  const [dados, setDados] = useState<{ email: string; escritorio: string } | null>(null);
  const [erro, setErro] = useState("");
  const [senha, setSenha] = useState("");
  const [repetir, setRepetir] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (window.location.hash) history.replaceState(null, "", window.location.pathname);
    if (!token) {
      setErro("Link incompleto. Abra o link exatamente como foi enviado.");
      return;
    }
    api<{ email: string; escritorio: string }>("POST", "/api/portal/convite/validar", { token })
      .then(setDados)
      .catch((e) => setErro(e instanceof ErroApi ? e.message : "Algo deu errado."));
  }, [token]);

  const enviar = async () => {
    setErro("");
    if (senha.length < 10) return setErro("A senha deve ter pelo menos 10 caracteres.");
    if (senha !== repetir) return setErro("As senhas não são iguais.");
    setEnviando(true);
    try {
      await api("POST", "/api/portal/convite/concluir", { token, senha });
      await aoConcluir();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    } finally {
      setEnviando(false);
    }
  };

  if (!dados) {
    return (
      <PortalAcesso titulo="Portal do cliente" descricao={erro ? undefined : "Verificando o link..."}>
        {erro && <Aviso>{erro}</Aviso>}
        {erro && (
          <Botao variante="secundario" bloco onClick={() => navegar("/portal/entrar")}>
            Ir para a tela de entrada
          </Botao>
        )}
      </PortalAcesso>
    );
  }
  return (
    <PortalAcesso titulo="Crie a sua senha" descricao={`${dados.escritorio} deu a você acesso ao portal.`}>
      <dl className="dados">
        <dt>E-mail</dt>
        <dd>
          <strong>{dados.email}</strong>
        </dd>
      </dl>
      <Formulario aoEnviar={() => void enviar()}>
        <Entrada rotulo="Crie uma senha" ajuda="Mínimo de 10 caracteres." type="password" value={senha} onChange={(e) => setSenha(e.target.value)} minLength={10} autoComplete="new-password" required />
        <Entrada rotulo="Repita a senha" type="password" value={repetir} onChange={(e) => setRepetir(e.target.value)} autoComplete="new-password" required />
        {erro && <Aviso>{erro}</Aviso>}
        <Botao type="submit" tamanho="grande" bloco carregando={enviando}>
          Salvar e entrar
        </Botao>
      </Formulario>
    </PortalAcesso>
  );
}
