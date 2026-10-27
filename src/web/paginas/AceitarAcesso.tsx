import { useEffect, useState } from "react";
import { ErroApi, api } from "../api";
import { TelaAcesso } from "../layout/TelaAcesso";
import { Aviso, Botao, Entrada, Formulario } from "../ui";
import { navegar } from "../roteador";
import { useSessao } from "../sessao";

interface Dados {
  tipo: "primeiro_acesso" | "convite";
  email: string;
  nome: string;
  escritorio: string | null;
}

/** Página de /primeiro-acesso e /convite. O token vem no fragmento (#) da URL e nunca vai ao servidor por GET. */
export function AceitarAcesso() {
  const { recarregar } = useSessao();
  const [token] = useState(() => window.location.hash.slice(1));
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [repetir, setRepetir] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    // Tira o token da barra de endereço (histórico e compartilhamento de tela).
    if (window.location.hash) history.replaceState(null, "", window.location.pathname);
    if (!token) {
      setErro("Link incompleto. Abra o link exatamente como foi enviado.");
      return;
    }
    api<Dados>("POST", "/api/acesso/validar", { token })
      .then(setDados)
      .catch((e) => setErro(e instanceof ErroApi ? e.message : "Algo deu errado."));
  }, [token]);

  const enviar = async () => {
    setErro("");
    if (senha.length < 10) return setErro("A senha deve ter pelo menos 10 caracteres.");
    if (senha !== repetir) return setErro("As senhas não são iguais.");
    setEnviando(true);
    try {
      const corpo = nome.trim() ? { token, nome: nome.trim(), senha } : { token, senha };
      const r = await api<{ etapa: "ok" | "configurar_2fa" | "entrar" }>("POST", "/api/acesso/concluir", corpo);
      if (r.etapa === "entrar") navegar("/entrar", true);
      else {
        await recarregar();
        navegar("/", true);
      }
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    } finally {
      setEnviando(false);
    }
  };

  if (!dados) {
    return (
      <TelaAcesso titulo="Acesso" descricao={erro ? undefined : "Verificando o link..."}>
        {erro && <Aviso>{erro}</Aviso>}
        {erro && (
          <Botao variante="secundario" bloco onClick={() => navegar("/entrar")}>
            Ir para a tela de entrada
          </Botao>
        )}
      </TelaAcesso>
    );
  }
  return (
    <TelaAcesso titulo={dados.tipo === "convite" ? "Você foi convidado" : "Primeiro acesso"} descricao="Crie a sua senha para começar a usar o sistema.">
      <dl className="dados">
        {dados.escritorio && (
          <>
            <dt>Escritório</dt>
            <dd>
              <strong>{dados.escritorio}</strong>
            </dd>
          </>
        )}
        <dt>E-mail</dt>
        <dd>
          <strong>{dados.email}</strong>
        </dd>
      </dl>
      <Formulario aoEnviar={() => void enviar()}>
        <Entrada rotulo={dados.tipo === "convite" ? "Seu nome" : "Seu nome (opcional)"} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} autoComplete="name" required={dados.tipo === "convite"} />
        <Entrada rotulo="Crie uma senha" ajuda="Mínimo de 10 caracteres." type="password" value={senha} onChange={(e) => setSenha(e.target.value)} minLength={10} autoComplete="new-password" required />
        <Entrada rotulo="Repita a senha" type="password" value={repetir} onChange={(e) => setRepetir(e.target.value)} autoComplete="new-password" required />
        {erro && <Aviso>{erro}</Aviso>}
        <Botao type="submit" tamanho="grande" bloco carregando={enviando}>
          Salvar e continuar
        </Botao>
      </Formulario>
    </TelaAcesso>
  );
}
