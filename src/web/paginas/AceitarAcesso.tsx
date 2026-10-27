import { useEffect, useState } from "react";
import { ErroApi, api } from "../api";
import { Aviso, Cartao, Formulario } from "../componentes";
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
      <Cartao titulo="Acesso">
        {erro ? <Aviso>{erro}</Aviso> : <p>Verificando o link...</p>}
      </Cartao>
    );
  }
  return (
    <Cartao titulo={dados.tipo === "convite" ? "Você foi convidado" : "Primeiro acesso"}>
      <p>
        {dados.escritorio ? <>Escritório: <strong>{dados.escritorio}</strong><br /></> : null}
        E-mail: <strong>{dados.email}</strong>
      </p>
      <Formulario aoEnviar={() => void enviar()}>
        <label>
          Seu nome {dados.tipo === "convite" ? "" : "(opcional)"}
          <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} autoComplete="name" required={dados.tipo === "convite"} />
        </label>
        <label>
          Crie uma senha (mínimo 10 caracteres)
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} minLength={10} autoComplete="new-password" required />
        </label>
        <label>
          Repita a senha
          <input type="password" value={repetir} onChange={(e) => setRepetir(e.target.value)} autoComplete="new-password" required />
        </label>
        {erro && <Aviso>{erro}</Aviso>}
        <button type="submit" disabled={enviando}>
          Salvar e continuar
        </button>
      </Formulario>
    </Cartao>
  );
}
