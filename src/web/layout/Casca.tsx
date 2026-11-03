import { Briefcase, Contact, Building2, CalendarClock, CalendarDays, ChevronsLeft, ChevronsRight, FolderPlus, Gavel, House, Stethoscope, LayoutDashboard, LayoutGrid, Menu, Plus, Scale, UserPlus, Users, Wallet, X, Bell } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Aviso, Marca, Modal } from "../ui";
import { Link, navegar, useCaminho } from "../roteador";
import { useSessao } from "../sessao";
import { ProvedorSomenteLeitura, TEXTO_SOMENTE_LEITURA } from "../somente-leitura";
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
  /** Selo vermelho (urgência): usado nos prazos. */
  alerta?: boolean;
}

interface GrupoMenu {
  rotulo: string;
  itens: ItemMenu[];
}

const MENU_DONO: ItemMenu[] = [
  { para: "/", rotulo: "Painel", icone: LayoutDashboard },
  { para: "/escritorios", rotulo: "Escritórios", icone: Building2 },
  { para: "/diagnostico", rotulo: "Diagnóstico", icone: Stethoscope },
];

// Módulos ainda não construídos (aparecem desativados com "Em breve"). Hoje não há nenhum.
const MODULOS_BREVE: ItemMenu[] = [];

export const MODULOS_EM_BREVE: readonly ItemMenu[] = MODULOS_BREVE;

/** Atalhos da folha "Criar" (celular). `?novo=1` abre o formulário "novo" da página (ver `useParametroNovo` em roteador.tsx). */
const ACOES_CRIAR: { rotulo: string; para: string; icone: LucideIcon }[] = [
  { rotulo: "Prazo", para: "/prazos?novo=1", icone: CalendarClock },
  { rotulo: "Compromisso", para: "/agenda?novo=1", icone: CalendarDays },
  { rotulo: "Cliente", para: "/clientes?novo=1", icone: UserPlus },
  { rotulo: "Processo", para: "/processos?novo=1", icone: FolderPlus },
];

function lerRecolhida(): boolean {
  try {
    return localStorage.getItem("lateral") === "recolhida";
  } catch {
    return false;
  }
}

const textoContagem = (item: ItemMenu) => (item.contagem ? ` (${item.contagem} ${(item.contagemTexto ?? ["pendência", "pendências"])[item.contagem === 1 ? 0 : 1]})` : "");

export function Casca({ children }: { children: ReactNode }) {
  const { eu, sair } = useSessao();
  const caminho = useCaminho();
  const [recolhida, setRecolhida] = useState(lerRecolhida);
  const [gavetaAberta, setGavetaAberta] = useState(false);
  const [folhaAberta, setFolhaAberta] = useState(false);
  const abridorGaveta = useRef<HTMLElement | null>(null);
  const primeiraVez = useRef(true);
  const ehEscritorio = !!eu && !eu.usuario.dono_plataforma;
  const alertas = useAlertasPrazos(ehEscritorio, eu?.usuario.id ?? "");
  const naoLidas = useContagemIntimacoes(ehEscritorio);

  useEffect(() => {
    setGavetaAberta(false);
    setFolhaAberta(false);
    if (primeiraVez.current) {
      primeiraVez.current = false;
      return;
    }
    document.getElementById("titulo-pagina")?.focus({ preventScroll: true });
  }, [caminho]);

  const abrirGaveta = (origem: HTMLElement) => {
    abridorGaveta.current = origem;
    setGavetaAberta(true);
  };
  const fecharGaveta = () => {
    setGavetaAberta(false);
    abridorGaveta.current?.focus();
  };

  useEffect(() => {
    if (!gavetaAberta) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setGavetaAberta(false);
        abridorGaveta.current?.focus();
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

  const prazos: ItemMenu = { para: "/prazos", rotulo: "Prazos", icone: Bell, contagem: alertas.contagem, alerta: true, contagemTexto: ["prazo pede atenção", "prazos pedem atenção"] };
  const intimacoes: ItemMenu = { para: "/intimacoes", rotulo: "Intimações", icone: Gavel, contagem: naoLidas, contagemTexto: ["intimação não lida", "intimações não lidas"] };
  const grupos: GrupoMenu[] = usuario.dono_plataforma
    ? [{ rotulo: "Plataforma", itens: MENU_DONO }]
    : [
        { rotulo: "Escritório", itens: [{ para: "/", rotulo: "Início", icone: House }, prazos, { para: "/agenda", rotulo: "Agenda", icone: CalendarDays }, intimacoes] },
        { rotulo: "Cadastros", itens: [{ para: "/clientes", rotulo: "Clientes", icone: Contact }, { para: "/processos", rotulo: "Processos", icone: Briefcase }, ...(eu.permissoes.financeiro !== "nenhum" ? [{ para: "/financeiro", rotulo: "Financeiro", icone: Wallet }] : [])] },
        { rotulo: "Administração", itens: [{ para: "/escritorio", rotulo: "Escritório", icone: Building2 }, ...(usuario.perfil === "socio" ? [{ para: "/equipe", rotulo: "Equipe", icone: Users }] : [])] },
      ];
  const futuros = usuario.dono_plataforma ? [] : MODULOS_BREVE;
  if (futuros.length > 0) grupos.push({ rotulo: "Módulos", itens: [...futuros] });

  const ativo = (para: string) => (para === "/" ? caminho === "/" : caminho === para || caminho.startsWith(`${para}/`));

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
    return (
      <li key={item.rotulo}>
        <Link para={item.para} className="nav-item" atual={ativo(item.para)}>
          <Icone size={20} aria-hidden="true" />
          <span className="nav-texto">{item.rotulo}</span>
          {item.contagem ? (
            <>
              <span className={`nav-contagem${item.alerta ? " alerta" : ""}`} aria-hidden="true">
                {item.contagem > 99 ? "99+" : item.contagem}
              </span>
              <span className="so-leitor">{textoContagem(item)}</span>
            </>
          ) : null}
          <span className="nav-dica" aria-hidden="true">
            {item.rotulo}
          </span>
        </Link>
      </li>
    );
  };

  const itemBarra = (item: ItemMenu, Icone: LucideIcon) => (
    <Link para={item.para ?? "/"} atual={ativo(item.para ?? "/")}>
      <Icone size={22} aria-hidden="true" />
      {item.rotulo}
      {item.contagem ? (
        <>
          <span className={`barra-contagem${item.alerta ? " alerta" : ""}`} aria-hidden="true">
            {item.contagem > 99 ? "99+" : item.contagem}
          </span>
          <span className="so-leitor">{textoContagem(item)}</span>
        </>
      ) : null}
    </Link>
  );

  return (
    <div className={`casca${recolhida ? " recolhida" : ""}${ehEscritorio ? "" : " casca-sem-barra"}`}>
      <a href="#conteudo" className="pular-conteudo">
        Pular para o conteúdo
      </a>
      {gavetaAberta && <div className="gaveta-fundo" onClick={fecharGaveta} aria-hidden="true" />}
      <aside className={`lateral${gavetaAberta ? " aberta" : ""}`} id="menu-lateral" aria-label="Menu principal">
        <div className="lateral-topo">
          <Link para="/" className="marca-logo">
            <Marca />
          </Link>
          <button type="button" className="btn btn-fantasma btn-icone botao-fechar-gaveta" aria-label="Fechar menu" onClick={fecharGaveta}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <nav className="lateral-nav" aria-label="Seções">
          <ul>
            {grupos.flatMap((g) => [
              <li key={`rotulo-${g.rotulo}`} className="nav-rotulo" aria-hidden="true">
                {g.rotulo}
              </li>,
              ...g.itens.map(renderItem),
            ])}
          </ul>
        </nav>
        <div className="lateral-rodape">
          <button type="button" className="botao-recolher-lateral" aria-label={recolhida ? "Expandir menu lateral" : "Recolher menu lateral"} aria-controls="menu-lateral" onClick={alternarRecolhida}>
            {recolhida ? <ChevronsRight size={20} aria-hidden="true" /> : <ChevronsLeft size={20} aria-hidden="true" />}
            <span className="botao-recolher-texto" aria-hidden="true">
              {recolhida ? "Expandir menu" : "Recolher menu"}
            </span>
            <span className="nav-dica" aria-hidden="true">
              Expandir menu
            </span>
          </button>
        </div>
      </aside>

      <div className="principal">
        <header className="topo">
          <button type="button" className="btn btn-fantasma btn-icone botao-menu-mobile" aria-label="Abrir menu" aria-expanded={gavetaAberta} aria-controls="menu-lateral" onClick={(e) => abrirGaveta(e.currentTarget)}>
            <Menu size={22} aria-hidden="true" />
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

      {ehEscritorio && (
        <>
          <nav className="barra-inferior" aria-label="Atalhos">
            <div className="barra-inferior-caixa">
              {itemBarra({ para: "/", rotulo: "Início", icone: House }, House)}
              {itemBarra(prazos, Bell)}
              <button
                type="button"
                className="barra-fab"
                aria-label="Criar"
                aria-haspopup="dialog"
                aria-disabled={somenteLeitura || undefined}
                title={somenteLeitura ? TEXTO_SOMENTE_LEITURA : undefined}
                onClick={() => {
                  if (!somenteLeitura) setFolhaAberta(true);
                }}
              >
                <Plus size={26} aria-hidden="true" />
              </button>
              {itemBarra(intimacoes, Gavel)}
              <button type="button" className="barra-item" aria-expanded={gavetaAberta} aria-controls="menu-lateral" onClick={(e) => abrirGaveta(e.currentTarget)}>
                <LayoutGrid size={22} aria-hidden="true" />
                Menu
              </button>
            </div>
          </nav>
          <Modal aberto={folhaAberta} aoFechar={() => setFolhaAberta(false)} titulo="Criar" classe="modal-folha">
            <div className="folha-grade">
              {ACOES_CRIAR.map(({ rotulo, para, icone: Icone }) => (
                <Link key={rotulo} para={para} aoNavegar={() => setFolhaAberta(false)}>
                  <Icone size={22} aria-hidden="true" />
                  {rotulo}
                </Link>
              ))}
            </div>
          </Modal>
        </>
      )}
    </div>
  );
}
