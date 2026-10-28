import { Briefcase, Contact, Building2, CalendarDays, ChevronsLeft, ChevronsRight, Gavel, House, Stethoscope, LayoutDashboard, Menu, Scale, Users, Wallet, X, Bell } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Aviso, Marca } from "../ui";
import { Link, navegar, useCaminho } from "../roteador";
import { useSessao } from "../sessao";
import { ProvedorSomenteLeitura } from "../somente-leitura";
import { formatarDiaCivil } from "../api";
import { FAIXA_TITULO, textoFaixaLeitura } from "../../comum/textos-assinatura";
import { BannerTeste } from "./BannerTeste";
import { MenuUsuario } from "./MenuUsuario";
import { AvisoDePrazos, useAlertasPrazos } from "./AlertasPrazos";
import { useContagemIntimacoes } from "./contagem-intimacoes";

export interface ItemMenu {
  para?: string;
  rotulo: string;
  icone: LucideIcon;
  /** Módulo ainda não construído (docs/MVP.md): aparece desativado com "Em breve". */
  emBreve?: boolean;
  descricao?: string;
  /** Contagem exibida em um selo ao lado do nome (ex.: prazos que pedem atenção). */
  contagem?: number;
  /** Texto para leitor de tela da contagem: [no singular, no plural]. */
  contagemTexto?: [string, string];
}

const MENU_DONO: ItemMenu[] = [
  { para: "/", rotulo: "Painel", icone: LayoutDashboard },
  { para: "/escritorios", rotulo: "Escritórios", icone: Building2 },
  { para: "/diagnostico", rotulo: "Diagnóstico", icone: Stethoscope },
];

// Módulos ainda não construídos (aparecem desativados com "Em breve"). Hoje não há nenhum.
const MODULOS_BREVE: ItemMenu[] = [];

export const MODULOS_EM_BREVE: readonly ItemMenu[] = MODULOS_BREVE;

function lerRecolhida(): boolean {
  try {
    return localStorage.getItem("lateral") === "recolhida";
  } catch {
    return false;
  }
}

export function Casca({ children }: { children: ReactNode }) {
  const { eu, sair } = useSessao();
  const caminho = useCaminho();
  const [recolhida, setRecolhida] = useState(lerRecolhida);
  const [gavetaAberta, setGavetaAberta] = useState(false);
  const botaoMenu = useRef<HTMLButtonElement>(null);
  const primeiraVez = useRef(true);
  const ehEscritorio = !!eu && !eu.usuario.dono_plataforma;
  const alertas = useAlertasPrazos(ehEscritorio, eu?.usuario.id ?? "");
  const naoLidas = useContagemIntimacoes(ehEscritorio);

  useEffect(() => {
    setGavetaAberta(false);
    if (primeiraVez.current) {
      primeiraVez.current = false;
      return;
    }
    document.getElementById("titulo-pagina")?.focus({ preventScroll: true });
  }, [caminho]);

  useEffect(() => {
    if (!gavetaAberta) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setGavetaAberta(false);
        botaoMenu.current?.focus();
      }
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [gavetaAberta]);

  if (!eu) return null;
  const { usuario, escritorio } = eu;
  const somenteLeitura = ehEscritorio && eu.assinatura?.situacao === "leitura";

  const alternarRecolhida = () => {
    setRecolhida((v) => {
      try {
        localStorage.setItem("lateral", v ? "aberta" : "recolhida");
      } catch {
        /* sem armazenamento: vale só nesta visita */
      }
      return !v;
    });
  };

  const principais: ItemMenu[] = usuario.dono_plataforma
    ? MENU_DONO
    : [{ para: "/", rotulo: "Início", icone: House }, { para: "/clientes", rotulo: "Clientes", icone: Contact }, { para: "/processos", rotulo: "Processos", icone: Briefcase }, { para: "/prazos", rotulo: "Prazos", icone: Bell, contagem: alertas.contagem, contagemTexto: ["prazo pede atenção", "prazos pedem atenção"] }, { para: "/agenda", rotulo: "Agenda", icone: CalendarDays }, { para: "/intimacoes", rotulo: "Intimações", icone: Gavel, contagem: naoLidas, contagemTexto: ["intimação não lida", "intimações não lidas"] }, ...(eu.permissoes.financeiro !== "nenhum" ? [{ para: "/financeiro", rotulo: "Financeiro", icone: Wallet }] : []), { para: "/escritorio", rotulo: "Escritório", icone: Building2 }, ...(usuario.perfil === "socio" ? [{ para: "/equipe", rotulo: "Equipe", icone: Users }] : [])];
  const futuros = usuario.dono_plataforma ? [] : MODULOS_BREVE;

  const renderItem = (item: ItemMenu) => {
    const Icone = item.icone;
    if (item.emBreve || !item.para) {
      return (
        <li key={item.rotulo}>
          <div className="nav-item" aria-disabled="true" title={`${item.rotulo}: em breve`}>
            <Icone size={20} aria-hidden="true" />
            <span className="nav-texto">{item.rotulo}</span>
            <span className="nav-breve">Em breve</span>
            <span className="so-leitor">(em breve)</span>
          </div>
        </li>
      );
    }
    const atual = item.para === "/" ? caminho === "/" : caminho === item.para || caminho.startsWith(`${item.para}/`);
    return (
      <li key={item.rotulo}>
        <Link para={item.para} className="nav-item" atual={atual}>
          <Icone size={20} aria-hidden="true" />
          <span className="nav-texto">{item.rotulo}</span>
          {item.contagem ? (
            <>
              <span className="nav-contagem" aria-hidden="true">
                {item.contagem > 99 ? "99+" : item.contagem}
              </span>
              <span className="so-leitor">({item.contagem} {(item.contagemTexto ?? ["pendência", "pendências"])[item.contagem === 1 ? 0 : 1]})</span>
            </>
          ) : null}
          {recolhida && <span className="so-leitor">{item.rotulo}</span>}
        </Link>
      </li>
    );
  };

  return (
    <div className={`casca${recolhida ? " recolhida" : ""}`}>
      <a href="#conteudo" className="pular-conteudo">
        Pular para o conteúdo
      </a>
      {gavetaAberta && <div className="gaveta-fundo" onClick={() => setGavetaAberta(false)} aria-hidden="true" />}
      <aside className={`lateral${gavetaAberta ? " aberta" : ""}`} id="menu-lateral" aria-label="Menu principal">
        <div className="lateral-topo">
          <Link para="/" className="marca-logo">
            <Marca />
          </Link>
          <button type="button" className="btn btn-fantasma btn-icone botao-fechar-gaveta" aria-label="Fechar menu" onClick={() => setGavetaAberta(false)}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <nav className="lateral-nav" aria-label="Seções">
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--e-1)" }}>
            <li className="nav-rotulo" aria-hidden="true">
              {usuario.dono_plataforma ? "Plataforma" : "Escritório"}
            </li>
            {principais.map(renderItem)}
            {futuros.length > 0 && (
              <li className="nav-rotulo" aria-hidden="true">
                Módulos
              </li>
            )}
            {futuros.map(renderItem)}
          </ul>
        </nav>
      </aside>

      <div className="principal">
        <header className="topo">
          <button ref={botaoMenu} type="button" className="btn btn-fantasma btn-icone botao-menu-mobile" aria-label="Abrir menu" aria-expanded={gavetaAberta} aria-controls="menu-lateral" onClick={() => setGavetaAberta(true)}>
            <Menu size={22} aria-hidden="true" />
          </button>
          <button type="button" className="btn btn-fantasma btn-icone botao-recolher" aria-label={recolhida ? "Expandir menu lateral" : "Recolher menu lateral"} aria-controls="menu-lateral" onClick={alternarRecolhida}>
            {recolhida ? <ChevronsRight size={20} aria-hidden="true" /> : <ChevronsLeft size={20} aria-hidden="true" />}
          </button>
          <Link para="/" className="marca-logo topo-marca">
            <Marca />
          </Link>
          <div className="topo-escritorio">
            <Scale size={16} aria-hidden="true" />
            <span>{usuario.dono_plataforma ? "Administração da plataforma" : (escritorio?.nome ?? "")}</span>
          </div>
          <span className="topo-espaco" />
          <MenuUsuario
            aoSair={() => {
              void sair().then(() => navegar("/entrar", true));
            }}
          />
        </header>
        {somenteLeitura && (
          <div className="faixa-assinatura">
            <Aviso tipo="atencao">
              <strong>{FAIXA_TITULO}</strong>{" "}
              {textoFaixaLeitura(
                eu.assinatura?.ultimo_dia_teste ? formatarDiaCivil(eu.assinatura.ultimo_dia_teste) : null,
                eu.assinatura?.bloqueio_desde ? formatarDiaCivil(eu.assinatura.bloqueio_desde) : null,
                eu.assinatura?.dias_para_bloqueio ?? null,
              )}
            </Aviso>
          </div>
        )}
        {ehEscritorio && escritorio?.status === "teste" && eu.assinatura?.situacao === "normal" && typeof eu.assinatura.dias_para_fim_teste === "number" && (
          <BannerTeste usuarioId={usuario.id} dias={eu.assinatura.dias_para_fim_teste} />
        )}
        <main className="conteudo" id="conteudo" tabIndex={-1}>
          <ProvedorSomenteLeitura value={somenteLeitura}>{children}</ProvedorSomenteLeitura>
        </main>
        {ehEscritorio && <AvisoDePrazos dados={alertas.dados} aberto={alertas.aberto} aoFechar={alertas.dispensar} />}
      </div>
    </div>
  );
}
