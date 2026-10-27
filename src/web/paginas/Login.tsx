import { useState } from "react";
import { ErroApi, api } from "../api";
import { Aviso, Cartao, Formulario } from "../componentes";
import { navegar } from "../roteador";
import { useSessao } from "../sessao";

type RespostaLogin =
  | { etapa: "ok" | "configurar_2fa" }
  | { etapa: "2fa"; desafio: string }
  | { etapa: "escolher_escritorio"; escritorios: { id: string; nome: string }[] };

export function Login() {
  const { recarregar } = useSessao();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [escritorios, setEscritorios] = useState<{ id: string; nome: string }[] | null>(null);
  const [desafio, setDesafio] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  const concluir = async () => {
    await recarregar();
    navegar("/", true);
  };

  const tratar = async (r: RespostaLogin) => {
    if (r.etapa === "escolher_escritorio") setEscritorios(r.escritorios);
    else if (r.etapa === "2fa") setDesafio(r.desafio);
    else await concluir();
  };

  const executar = async (acao: () => Promise<void>) => {
    setErro("");
    setEnviando(true);
    try {
      await acao();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  };

  const entrar = (escritorioId?: string) =>
    executar(async () => {
      const corpo = escritorioId ? { email, senha, escritorio_id: escritorioId } : { email, senha };
      await tratar(await api<RespostaLogin>("POST", "/api/auth/login", corpo));
    });

  if (desafio) {
    return (
      <Cartao titulo="Verificação em duas etapas">
        <p>Digite o código de 6 dígitos do seu aplicativo autenticador.</p>
        <Formulario
          aoEnviar={() =>
            executar(async () => {
              await tratar(await api<RespostaLogin>("POST", "/api/auth/2fa", { desafio, codigo }));
            })
          }
        >
          <label>
            Código
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
            />
          </label>
          {erro && <Aviso>{erro}</Aviso>}
          <button type="submit" disabled={enviando || codigo.length !== 6}>
            Confirmar
          </button>
          <button
            type="button"
            className="secundario"
            onClick={() => {
              setDesafio(null);
              setCodigo("");
              setSenha("");
              setErro("");
            }}
          >
            Voltar
          </button>
        </Formulario>
      </Cartao>
    );
  }

  if (escritorios) {
    return (
      <Cartao titulo="Escolha o escritório">
        <p>Este e-mail e esta senha valem em mais de um acesso. Em qual você quer entrar?</p>
        {erro && <Aviso>{erro}</Aviso>}
        <ul className="lista-escolha">
          {escritorios.map((e) => (
            <li key={e.id}>
              <button type="button" disabled={enviando} onClick={() => void entrar(e.id)}>
                {e.nome}
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="secundario" onClick={() => setEscritorios(null)}>
          Voltar
        </button>
      </Cartao>
    );
  }

  return (
    <Cartao titulo="Entrar">
      <Formulario aoEnviar={() => void entrar()}>
        <label>
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus required />
        </label>
        <label>
          Senha
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" required />
        </label>
        {erro && <Aviso>{erro}</Aviso>}
        <button type="submit" disabled={enviando}>
          {enviando ? "Entrando..." : "Entrar"}
        </button>
      </Formulario>
    </Cartao>
  );
}
