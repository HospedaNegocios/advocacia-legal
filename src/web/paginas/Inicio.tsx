import { AlarmClockOff, ArrowRight, Check, Gavel, FileText, Plus, Wallet } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { FUSO_PADRAO, partesLocais } from "../../comum/fuso";
import { ErroApi, api } from "../api";
import { Link, navegar } from "../roteador";
import { useSessao } from "../sessao";
import { TEXTO_SOMENTE_LEITURA, useSomenteLeitura } from "../somente-leitura";
import { Anel, Aviso, Barras, Botao, Cartao, Esqueleto, EsqueletoLinhas, EstadoErro, EstadoVazio, Selo, useToast } from "../ui";
import { diasDoEvento } from "./agenda-comum";
import type { Evento, Prazo, StatusPrazo, UsuarioBasico } from "./agenda-comum";
import { EventoDetalhe } from "./EventoDetalhe";
import { EventoFormulario } from "./EventoFormulario";
import { formatarReais } from "./financeiro-comum";
import type { RespostaResumo } from "./financeiro-comum";
import { IntimacaoDetalhe, diaBr } from "./intimacoes-comum";
import type { Intimacao } from "./intimacoes-comum";
import { cnjFormatado, FASES } from "./processos-comum";
import type { Fase } from "./processos-comum";
import { SeuDia } from "./InicioDia";

interface ResumoInicio {
  hoje: string;
  prazos: { vencidos: number; vencem_hoje: number; proximos_7_dias: number; lista_vencidos: Prazo[]; lista_hoje: Prazo[]; lista_proximos: Prazo[] };
  eventos: Evento[];
  processos: { ativos: number; por_fase: Record<Fase, number> };
  clientes: { ativos: number };
  intimacoes: { nao_lidas: number; sem_processo: number };
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const LIMITE_COLUNA = 5;

function saudacao(): string {
  const h = Number(partesLocais(Date.now(), FUSO_PADRAO).hora.slice(0, 2));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

/** "TERÇA-FEIRA, 3 DE NOVEMBRO" a partir de AAAA-MM-DD. */
function dataPorExtenso(hoje: string): string {
  return new Date(`${hoje}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

/** Quando o prazo vence, em palavras. */
function quando(p: Prazo): string {
  if (p.situacao === "vencido") return `Venceu há ${plural(-p.dias_para_vencer, "dia", "dias")}`;
  if (p.situacao === "hoje") return p.hora ? `Hoje, até ${p.hora}` : "Hoje";
  if (p.dias_para_vencer === 1) return p.hora ? `Amanhã, até ${p.hora}` : "Amanhã";
  return `Em ${p.dias_para_vencer} dias`;
}

type Tom = "vencido" | "hoje" | "breve";

function CartaoPrazo({ prazo, tom, feito, saindo, aoConcluir }: { prazo: Prazo; tom: Tom; feito: boolean; saindo: boolean; aoConcluir: (p: Prazo) => void }) {
  const somenteLeitura = useSomenteLeitura();
  const destino = prazo.processo_id ? `/processos/${prazo.processo_id}` : "/prazos";
  return (
    <li className={`ini-prazo ini-${tom}${feito ? " feito" : ""}${saindo ? " saindo" : ""}`}>
      <span className="ini-quando">{quando(prazo)}</span>
      <Link para={destino} className="ini-prazo-titulo">
        {prazo.titulo}
      </Link>
      {prazo.processo_numero && <small>Processo {cnjFormatado(prazo.processo_numero)}</small>}
      <small>{prazo.responsavel_nome}</small>
      <button type="button" className="ini-ok" aria-label={`Concluir o prazo ${prazo.titulo}`} title={somenteLeitura ? TEXTO_SOMENTE_LEITURA : "Marcar como concluído"} disabled={somenteLeitura || feito} onClick={() => aoConcluir(prazo)}>
        <Check size={15} strokeWidth={3} aria-hidden="true" />
      </button>
    </li>
  );
}

function ColunaPrazos({ titulo, tom, total, prazos, vazio, feitos, saindo, aoConcluir }: { titulo: string; tom: Tom; total: number; prazos: Prazo[]; vazio: string; feitos: Set<string>; saindo: Set<string>; aoConcluir: (p: Prazo) => void }) {
  const mostrados = prazos.slice(0, LIMITE_COLUNA);
  return (
    <div className={`ini-coluna ini-${tom}`}>
      <h3 className="ini-coluna-cab">
        <i aria-hidden="true" />
        {titulo}
        <span className="ini-n" aria-label={plural(total, "prazo", "prazos")}>
          {total}
        </span>
      </h3>
      {mostrados.length === 0 ? (
        <p className="ini-livre">{vazio}</p>
      ) : (
        <ul className="ini-prazos">
          {mostrados.map((p) => (
            <CartaoPrazo key={p.id} prazo={p} tom={tom} feito={feitos.has(p.id)} saindo={saindo.has(p.id)} aoConcluir={aoConcluir} />
          ))}
        </ul>
      )}
      {total > mostrados.length && (
        <Link para="/prazos" className="ini-mais">
          + {total - mostrados.length} no quadro
        </Link>
      )}
    </div>
  );
}

export function Inicio() {
  const { eu } = useSessao();
  const { avisar } = useToast();
  const somenteLeitura = useSomenteLeitura();
  const [dados, setDados] = useState<ResumoInicio | null>(null);
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState<Evento | null>(null);
  const [editando, setEditando] = useState<Evento | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioBasico[]>([]);
  const [feitos, setFeitos] = useState<Set<string>>(new Set());
  const [saindo, setSaindo] = useState<Set<string>>(new Set());
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const [intimacoes, setIntimacoes] = useState<Intimacao[] | null>(null);
  const [erroIntim, setErroIntim] = useState(false);
  const [intimAberta, setIntimAberta] = useState<Intimacao | null>(null);
  const [fin, setFin] = useState<RespostaResumo | null>(null);
  const [erroFin, setErroFin] = useState(false);
  const temporizadores = useRef<number[]>([]);
  const podeFinanceiro = eu !== null && eu.permissoes.financeiro !== "nenhum";

  useEffect(() => {
    api<{ usuarios: UsuarioBasico[] }>("GET", "/api/processos/responsaveis-disponiveis")
      .then((r) => setUsuarios(r.usuarios))
      .catch(() => setUsuarios([]));
    const t = temporizadores.current;
    return () => t.forEach((x) => window.clearTimeout(x));
  }, []);

  const carregar = useCallback(async () => {
    try {
      setDados(await api<ResumoInicio>("GET", "/api/inicio"));
      setErro("");
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  }, []);
  useEffect(() => void carregar(), [carregar]);

  const carregarIntimacoes = useCallback(() => {
    api<{ intimacoes: Intimacao[] }>("GET", "/api/intimacoes?situacao=nao_lidas&por_pagina=3")
      .then((r) => {
        setIntimacoes(r.intimacoes);
        setErroIntim(false);
      })
      .catch(() => setErroIntim(true));
  }, []);
  useEffect(carregarIntimacoes, [carregarIntimacoes]);

  useEffect(() => {
    if (!podeFinanceiro) return;
    api<RespostaResumo>("GET", "/api/financeiro/resumo")
      .then((r) => {
        setFin(r);
        setErroFin(false);
      })
      .catch(() => setErroFin(true));
  }, [podeFinanceiro]);

  const mudarStatus = async (p: Prazo, status: StatusPrazo) => {
    await api("POST", `/api/prazos/${p.id}/status`, { status });
  };

  const concluir = async (p: Prazo) => {
    if (somenteLeitura || feitos.has(p.id)) return;
    setFeitos((s) => new Set(s).add(p.id));
    try {
      await mudarStatus(p, "concluido");
    } catch (e) {
      setFeitos((s) => {
        const n = new Set(s);
        n.delete(p.id);
        return n;
      });
      avisar(e instanceof ErroApi ? e.message : "Não foi possível concluir o prazo.", "erro");
      return;
    }
    // Animação: marca feita, depois o cartão sai; só então some da lista.
    temporizadores.current.push(
      window.setTimeout(() => setSaindo((s) => new Set(s).add(p.id)), 450),
      window.setTimeout(() => {
        setOcultos((s) => new Set(s).add(p.id));
        void carregar();
      }, 950),
    );
    avisar("Prazo concluído.", "ok", {
      rotulo: "Desfazer",
      aoClicar: () => {
        mudarStatus(p, p.status)
          .then(() => {
            for (const set of [setFeitos, setSaindo, setOcultos]) {
              set((s) => {
                const n = new Set(s);
                n.delete(p.id);
                return n;
              });
            }
            void carregar();
            avisar("Prazo reaberto.");
          })
          .catch((e) => avisar(e instanceof ErroApi ? e.message : "Não foi possível desfazer.", "erro"));
      },
    });
  };

  if (!eu) return null;
  const { usuario } = eu;
  const primeiroNome = usuario.nome.trim().split(/\s+/)[0] ?? usuario.nome;
  const hoje = dados?.hoje ?? partesLocais(Date.now(), FUSO_PADRAO).data;
  const visiveis = (l: Prazo[]) => l.filter((p) => !ocultos.has(p.id));
  const vencidos = dados ? visiveis(dados.prazos.lista_vencidos) : [];
  const deHoje = dados ? visiveis(dados.prazos.lista_hoje) : [];
  const proximos = dados ? visiveis(dados.prazos.lista_proximos) : [];
  const total = (cheio: number, lista: Prazo[], toda: Prazo[]) => Math.max(0, cheio - (toda.length - lista.length));
  const nVencidos = dados ? total(dados.prazos.vencidos, vencidos, dados.prazos.lista_vencidos) : 0;
  const nHoje = dados ? total(dados.prazos.vencem_hoje, deHoje, dados.prazos.lista_hoje) : 0;
  const nProximos = dados ? total(dados.prazos.proximos_7_dias, proximos, dados.prazos.lista_proximos) : 0;
  const compromissosHoje = dados ? dados.eventos.filter((e) => { const d = diasDoEvento(e); return d.primeiro <= hoje && d.ultimo >= hoje; }) : [];

  const resumoDia = dados && (
    <p>
      {nHoje === 0 && compromissosHoje.length === 0 ? "Nada marcado para hoje." : `Hoje: ${plural(nHoje, "prazo", "prazos")} e ${plural(compromissosHoje.length, "compromisso", "compromissos")}.`}
      {nVencidos > 0 && (
        <>
          {" "}
          <b className="ini-alerta">{plural(nVencidos, "prazo vencido", "prazos vencidos")}</b> pedem atenção.
        </>
      )}
    </p>
  );

  return (
    <>
      <header className="ini-cab">
        <div>
          <div className="ini-data">{dataPorExtenso(hoje)}</div>
          <h1 tabIndex={-1} id="titulo-pagina">{`${saudacao()}, ${primeiroNome}`}</h1>
          {dados ? resumoDia : <Esqueleto largura="22rem" altura={18} estilo={{ marginTop: "var(--e-3)", maxWidth: "100%" }} />}
        </div>
        <div className="ini-acoes">
          <Botao variante="secundario" disabled={somenteLeitura} title={somenteLeitura ? TEXTO_SOMENTE_LEITURA : undefined} onClick={() => navegar("/agenda?novo=1")}>
            <Plus size={18} aria-hidden="true" />
            Compromisso
          </Botao>
          <Botao onClick={() => navegar("/prazos?novo=1")}>
            <Plus size={18} aria-hidden="true" />
            Novo prazo
          </Botao>
        </div>
      </header>

      {!usuario.totp_ativo && (
        <Aviso tipo="atencao">
          A verificação em duas etapas ainda não está ativa na sua conta. <Link para="/seguranca">Ativar agora</Link>
        </Aviso>
      )}

      {erro ? (
        <EstadoErro acao={<Botao variante="secundario" onClick={() => void carregar()}>Tentar de novo</Botao>}>{erro}</EstadoErro>
      ) : !dados ? (
        <>
          <div className="cartao" style={{ padding: "var(--e-5)" }}>
            <EsqueletoLinhas linhas={4} />
          </div>
          <div className="ini-numeros" role="status" aria-label="Carregando números">
            {[0, 1, 2, 3].map((i) => (
              <div className="ini-numero" key={i}>
                <Esqueleto largura="60%" altura={13} />
                <Esqueleto largura="35%" altura={30} />
              </div>
            ))}
          </div>
          <div className="cartao" style={{ padding: "var(--e-5)" }}>
            <EsqueletoLinhas linhas={5} />
          </div>
        </>
      ) : (
        <>
          <SeuDia hoje={hoje} eventos={dados.eventos} prazos={deHoje} aoAbrirEvento={setAberto} />

          <nav className="ini-numeros" aria-label="Números do escritório">
            <Link para="/processos" className="ini-numero">
              <span>Processos ativos</span>
              <strong>{dados.processos.ativos}</strong>
            </Link>
            <Link para="/clientes" className="ini-numero">
              <span>Clientes ativos</span>
              <strong>{dados.clientes.ativos}</strong>
            </Link>
            <Link para="/intimacoes" className="ini-numero">
              <span>Intimações não lidas</span>
              <strong>{dados.intimacoes.nao_lidas}</strong>
              {dados.intimacoes.sem_processo > 0 && <small>{dados.intimacoes.sem_processo} sem processo</small>}
            </Link>
            <Link para="/prazos" className="ini-numero">
              <span>Prazos nos próximos 7 dias</span>
              <strong>{dados.prazos.proximos_7_dias}</strong>
              <small>a partir de amanhã</small>
            </Link>
          </nav>

          <div className="ini-duas">
            <Cartao titulo="Prazos" subtitulo="Não concluídos, por urgência" acoes={<Link para="/prazos" className="ini-link">Abrir quadro <ArrowRight size={16} aria-hidden="true" /></Link>}>
              <div className="ini-semaforo">
                <ColunaPrazos titulo="Vencidos" tom="vencido" total={nVencidos} prazos={vencidos} vazio="Nada vencido. Tudo em dia." feitos={feitos} saindo={saindo} aoConcluir={concluir} />
                <ColunaPrazos titulo="Hoje" tom="hoje" total={nHoje} prazos={deHoje} vazio="Nenhum prazo vence hoje." feitos={feitos} saindo={saindo} aoConcluir={concluir} />
                <ColunaPrazos titulo="Próximos dias" tom="breve" total={nProximos} prazos={proximos} vazio="Nenhum prazo nos próximos 7 dias." feitos={feitos} saindo={saindo} aoConcluir={concluir} />
              </div>
            </Cartao>

            <div className="ini-lateral">
              <Cartao titulo="Intimações novas" subtitulo="Publicações ainda não lidas" acoes={<Link para="/intimacoes" className="ini-link">Ver todas <ArrowRight size={16} aria-hidden="true" /></Link>}>
                {erroIntim ? (
                  <p className="texto-pequeno" role="alert">Não foi possível carregar as intimações. <button type="button" className="ini-reler" onClick={carregarIntimacoes}>Tentar de novo</button></p>
                ) : intimacoes === null ? (
                  <EsqueletoLinhas linhas={3} />
                ) : intimacoes.length === 0 ? (
                  <EstadoVazio compacto icone={Gavel} titulo="Nenhuma intimação nova">
                    Você está em dia com as publicações.
                  </EstadoVazio>
                ) : (
                  <ul className="ini-intims">
                    {intimacoes.map((i) => (
                      <li key={i.id}>
                        <button type="button" className="ini-intim" onClick={() => setIntimAberta(i)} aria-label={`Abrir intimação de ${i.tribunal ?? "tribunal não informado"}, ${diaBr(i.data_disponibilizacao)}`}>
                          <span className="ini-intim-topo">
                            <b>{[i.tribunal, i.orgao].filter(Boolean).join(" · ") || "Tribunal não informado"}</b>
                            <span>{diaBr(i.data_disponibilizacao)}</span>
                          </span>
                          {i.previa && (
                            <span className="ini-intim-texto">
                              <FileText size={15} aria-hidden="true" />
                              <span>{i.previa}</span>
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Cartao>

              {podeFinanceiro && (
                <Cartao titulo="Recebimentos do mês" subtitulo="Mês atual" acoes={<Link para="/financeiro" className="ini-link">Financeiro <ArrowRight size={16} aria-hidden="true" /></Link>}>
                  {erroFin ? (
                    <p className="texto-pequeno" role="alert">Não foi possível carregar o financeiro.</p>
                  ) : !fin ? (
                    <EsqueletoLinhas linhas={3} />
                  ) : fin.resumo.recebido_periodo_centavos + fin.resumo.a_receber_centavos === 0 ? (
                    <EstadoVazio compacto icone={Wallet} titulo="Nada a receber">
                      Sem recebimentos no mês nem lançamentos em aberto.
                    </EstadoVazio>
                  ) : (
                    <div className="ini-fin">
                      <Anel rotulo="Recebido sobre recebido mais a receber em aberto" valor={fin.resumo.recebido_periodo_centavos} maximo={fin.resumo.recebido_periodo_centavos + fin.resumo.a_receber_centavos} legenda="recebido" />
                      <dl>
                        <div>
                          <dt>Recebido no mês</dt>
                          <dd>{formatarReais(fin.resumo.recebido_periodo_centavos)}</dd>
                        </div>
                        <div>
                          <dt>A receber (em aberto)</dt>
                          <dd>{formatarReais(fin.resumo.a_receber_centavos)}</dd>
                        </div>
                        {fin.resumo.vencido_receber_qtd > 0 && (
                          <div>
                            <dt>Vencido a receber</dt>
                            <dd>
                              <Selo tom="critico" icone={AlarmClockOff}>{formatarReais(fin.resumo.vencido_receber_centavos)}</Selo>
                            </dd>
                          </div>
                        )}
                      </dl>
                    </div>
                  )}
                  {fin && <p className="texto-pequeno ini-fin-nota">O anel é o recebido no mês sobre (recebido no mês + tudo o que está a receber em aberto).</p>}
                </Cartao>
              )}
            </div>
          </div>

          <Cartao>
            {dados.processos.ativos > 0 ? (
              <Barras titulo="Processos ativos por fase" subtitulo="Quantidade de processos em cada fase" medida="Processos" categoria="Fase" dados={FASES.map((f) => ({ chave: f, rotulo: f, valor: dados.processos.por_fase[f] }))} />
            ) : (
              <EstadoVazio compacto titulo="Nenhum processo ativo" acao={<Link para="/processos">Cadastrar processo</Link>}>
                Quando houver processos, a distribuição por fase aparece aqui.
              </EstadoVazio>
            )}
          </Cartao>
        </>
      )}

      <EventoDetalhe
        evento={aberto}
        aoFechar={() => setAberto(null)}
        aoEditar={(e) => {
          setAberto(null);
          setEditando(e);
        }}
        aoApagado={() => {
          setAberto(null);
          void carregar();
        }}
      />
      <EventoFormulario
        aberto={editando !== null}
        evento={editando}
        dataPadrao={hoje}
        usuarios={usuarios}
        aoFechar={() => setEditando(null)}
        aoSalvar={() => {
          setEditando(null);
          void carregar();
        }}
      />
      <IntimacaoDetalhe
        intimacao={intimAberta}
        aberto={intimAberta !== null}
        aoFechar={() => setIntimAberta(null)}
        aoMudar={(i) => {
          setIntimAberta(i);
          carregarIntimacoes();
          void carregar();
        }}
      />
    </>
  );
}
