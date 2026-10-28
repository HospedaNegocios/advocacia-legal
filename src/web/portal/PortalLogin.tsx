import { Building2 } from "lucide-react";
import { useState } from "react";
import { ErroApi, api } from "../api";
import { Aviso, Botao, Entrada, Formulario } from "../ui";
import { PortalAcesso } from "./PortalAcesso";

type Resposta = { etapa: "ok" } | { etapa: "escolher_escritorio"; escritorios: { id: string; nome: string }[] };

export function PortalLogin({ aoEntrar }: { aoEntrar: () => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [escritorios, setEscritorios] = useState<{ id: string; nome: string }[] | null>(null);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  const entrar = async (escritorioId?: string) => {
    setErro("");
    setEnviando(true);
    try {
      const corpo = escritorioId ? { email, senha, escritorio_id: escritorioId } : { email, senha };
      const r = await api<Resposta>("POST", "/api/portal/entrar", corpo);
      if (r.etapa === "escolher_escritorio") setEscritorios(r.escritorios);
      else await aoEntrar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  };

  if (escritorios) {
    return (
      <PortalAcesso titulo="Escolha o escritório" descricao="Este e-mail tem acesso a mais de um escritório.">
        <div className="pilha">
          {escritorios.map((e) => (
            <Botao key={e.id} variante="secundario" bloco tamanho="grande" onClick={() => void entrar(e.id)} carregando={enviando}>
              <Building2 size={18} aria-hidden="true" />
              {e.nome}
            </Botao>
          ))}
          {erro && <Aviso>{erro}</Aviso>}
        </div>
      </PortalAcesso>
    );
  }

  return (
    <PortalAcesso titulo="Portal do cliente" descricao="Acompanhe o que o seu escritório compartilhou com você.">
      <Formulario aoEnviar={() => void entrar()}>
        <Entrada rotulo="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
        <Entrada rotulo="Senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" required />
        {erro && <Aviso>{erro}</Aviso>}
        <Botao type="submit" tamanho="grande" bloco carregando={enviando}>
          Entrar
        </Botao>
      </Formulario>
      <p className="texto-pequeno" style={{ margin: 0 }}>
        Ainda não tem acesso, ou esqueceu a senha? Peça um novo link ao seu escritório.
      </p>
    </PortalAcesso>
  );
}
