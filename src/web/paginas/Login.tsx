import { ArrowLeft, Building2 } from "lucide-react";
import { useState } from "react";
import { ErroApi, api } from "../api";
import { TelaAcesso } from "../layout/TelaAcesso";
import { navegar } from "../roteador";
import { useSessao } from "../sessao";
import { Aviso, Botao, Entrada, Formulario } from "../ui";

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
      <TelaAcesso titulo="Verificação em duas etapas" descricao="Digite o código de 6 dígitos do seu aplicativo autenticador.">
        <Formulario
          aoEnviar={() =>
            void executar(async () => {
              await tratar(await api<RespostaLogin>("POST", "/api/auth/2fa", { desafio, codigo }));
            })
          }
        >
          <Entrada rotulo="Código" codigo value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" autoFocus required />
          {erro && <Aviso>{erro}</Aviso>}
          <Botao type="submit" tamanho="grande" bloco carregando={enviando} disabled={codigo.length !== 6}>
            Confirmar
          </Botao>
          <Botao
            variante="fantasma"
            bloco
            onClick={() => {
              setDesafio(null);
              setCodigo("");
              setSenha("");
              setErro("");
            }}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Voltar
          </Botao>
        </Formulario>
      </TelaAcesso>
    );
  }

  if (escritorios) {
    return (
      <TelaAcesso titulo="Escolha o escritório" descricao="Este e-mail e esta senha valem em mais de um acesso. Em qual você quer entrar?">
        {erro && <Aviso>{erro}</Aviso>}
        <ul className="lista-escolha">
          {escritorios.map((e) => (
            <li key={e.id}>
              <Botao variante="secundario" tamanho="grande" bloco disabled={enviando} onClick={() => void entrar(e.id)}>
                <Building2 size={18} aria-hidden="true" />
                {e.nome}
              </Botao>
            </li>
          ))}
        </ul>
        <Botao variante="fantasma" bloco onClick={() => setEscritorios(null)}>
          <ArrowLeft size={16} aria-hidden="true" />
          Voltar
        </Botao>
      </TelaAcesso>
    );
  }

  return (
    <TelaAcesso titulo="Entrar" descricao="Acesse o sistema com o seu e-mail e a sua senha.">
      <Formulario aoEnviar={() => void entrar()}>
        <Entrada rotulo="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="voce@escritorio.com.br" autoFocus required />
        <Entrada rotulo="Senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" required />
        {erro && <Aviso>{erro}</Aviso>}
        <Botao type="submit" tamanho="grande" bloco carregando={enviando}>
          {enviando ? "Entrando..." : "Entrar"}
        </Botao>
      </Formulario>
    </TelaAcesso>
  );
}
