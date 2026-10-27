import { LogOut, Monitor, Moon, ShieldCheck, Sun, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ROTULO_PERFIL } from "../api";
import { Link } from "../roteador";
import { useSessao } from "../sessao";
import { useTema } from "../tema";
import type { PreferenciaTema } from "../tema";
import { Avatar } from "../ui";

const OPCOES: { valor: PreferenciaTema; rotulo: string; icone: typeof Sun }[] = [
  { valor: "sistema", rotulo: "Sistema", icone: Monitor },
  { valor: "claro", rotulo: "Claro", icone: Sun },
  { valor: "escuro", rotulo: "Escuro", icone: Moon },
];

export function MenuUsuario({ aoSair }: { aoSair: () => void }) {
  const { eu } = useSessao();
  const { preferencia, definir } = useTema();
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAberto(false);
        botao.current?.focus();
      }
    };
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  if (!eu) return null;
  const { usuario } = eu;
  const perfil = usuario.dono_plataforma ? "Dono da plataforma" : usuario.perfil ? ROTULO_PERFIL[usuario.perfil] : "";

  return (
    <div className="menu-usuario" ref={raiz}>
      <button ref={botao} type="button" className="menu-usuario-botao" aria-expanded={aberto} aria-haspopup="true" aria-controls="menu-usuario" onClick={() => setAberto((v) => !v)}>
        <Avatar nome={usuario.nome} />
        <span className="menu-usuario-nome">
          <strong>{usuario.nome}</strong>
          <small>{perfil}</small>
        </span>
        <ChevronDown size={16} aria-hidden="true" />
        <span className="so-leitor">Menu da conta</span>
      </button>
      {aberto && (
        <div className="menu-flutuante" id="menu-usuario">
          <div className="menu-cabeca">
            <strong>{usuario.nome}</strong>
            <span>{usuario.email}</span>
            <span>{perfil}</span>
          </div>
          <div className="menu-grupo-rotulo" id="rotulo-tema">
            Aparência
          </div>
          <div className="menu-tema" role="group" aria-labelledby="rotulo-tema">
            {OPCOES.map(({ valor, rotulo, icone: Icone }) => (
              <button key={valor} type="button" aria-pressed={preferencia === valor} onClick={() => definir(valor)}>
                <Icone size={18} aria-hidden="true" />
                {rotulo}
              </button>
            ))}
          </div>
          <Link para="/seguranca" className="menu-item" aoNavegar={() => setAberto(false)}>
            <ShieldCheck size={18} aria-hidden="true" />
            Segurança (2 etapas)
          </Link>
          <button type="button" className="menu-item" onClick={aoSair}>
            <LogOut size={18} aria-hidden="true" />
            Sair
          </button>
        </div>
      )}
    </div>
  );
}
