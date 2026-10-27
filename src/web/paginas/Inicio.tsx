import { AlarmClock, AlarmClockOff, Briefcase, CalendarClock, CalendarDays, Contact, Gavel } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ErroApi, api } from "../api";
import { MODULOS_EM_BREVE } from "../layout/Casca";
import { Link } from "../roteador";
import { useSessao } from "../sessao";
import { Aviso, Barras, Cartao, CabecalhoPagina, Botao, EsqueletoKpi, EsqueletoLinhas, EstadoErro, EstadoVazio, Indicador, Selo } from "../ui";
import { SeloPrazo, dataFatalTexto } from "./agenda-comum";
import type { Evento, Prazo, UsuarioBasico } from "./agenda-comum";
import { EventoDetalhe, ItemEvento } from "./EventoDetalhe";
import { EventoFormulario } from "./EventoFormulario";
import { cnjFormatado, FASES } from "./processos-comum";
import type { Fase } from "./processos-comum";

interface ResumoInicio {
  hoje: string;
  prazos: { vencidos: number; vencem_hoje: number; proximos_7_dias: number; lista_vencidos: Prazo[]; lista_hoje: Prazo[]; lista_proximos: Prazo[] };
  eventos: Evento[];
  processos: { ativos: number; por_fase: Record<Fase, number> };
  clientes: { ativos: number };
  intimacoes: { nao_lidas: number; sem_processo: number };
}

function ListaPrazos({ prazos, vazio, mostrarData }: { prazos: Prazo[]; vazio: string; mostrarData?: boolean }) {
  if (prazos.length === 0) return <p className="inicio-vazio">{vazio}</p>;
  return (
    <ul className="inicio-lista">
      {prazos.map((p) => (
        <li key={p.id} className="inicio-item">
          <div className="inicio-item-texto">
            <strong>{p.titulo}</strong>
            <small>
              {mostrarData ? `${dataFatalTexto(p)} · ` : p.hora ? `${p.hora} · ` : ""}
              {p.processo_numero ? `Processo ${cnjFormatado(p.processo_numero)} · ` : ""}
              {p.responsavel_nome}
            </small>
          </div>
          <SeloPrazo prazo={p} />
        </li>
      ))}
    </ul>
  );
}

export function Inicio() {
  const { eu } = useSessao();
  const [dados, setDados] = useState<ResumoInicio | null>(null);
  const [erro, setErro] = useState("");
  const [aberto, setAberto] = useState<Evento | null>(null);
  const [editando, setEditando] = useState<Evento | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioBasico[]>([]);

  useEffect(() => {
    api<{ usuarios: UsuarioBasico[] }>("GET", "/api/processos/responsaveis-disponiveis")
      .then((r) => setUsuarios(r.usuarios))
      .catch(() => setUsuarios([]));
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

  if (!eu) return null;
  const { usuario, escritorio } = eu;
  const primeiroNome = usuario.nome.trim().split(/\s+/)[0] ?? usuario.nome;
  const verPrazos = <Link para="/prazos">Ver todos os prazos</Link>;

  return (
    <>
      <CabecalhoPagina titulo={`Olá, ${primeiroNome}`} descricao={escritorio ? `Resumo do escritório ${escritorio.nome}.` : "Bem-vindo à advocacia.legal."} />

      {!usuario.totp_ativo && (
        <Aviso tipo="atencao">
          A verificação em duas etapas ainda não está ativa na sua conta. <Link para="/seguranca">Ativar agora</Link>
        </Aviso>
      )}

      {erro ? (
        <EstadoErro acao={<Botao variante="secundario" onClick={() => void carregar()}>Tentar de novo</Botao>}>{erro}</EstadoErro>
      ) : (
        <>
          <section aria-label="Resumo do escritório" className="grade grade-kpi">
            {dados ? (
              <>
                <Indicador rotulo="Prazos vencidos" valor={dados.prazos.vencidos} icone={AlarmClockOff} nota="não concluídos">
                  {dados.prazos.vencidos > 0 && (
                    <div>
                      <Selo tom="critico" icone={AlarmClockOff}>
                        Atenção
                      </Selo>
                    </div>
                  )}
                </Indicador>
                <Indicador rotulo="Vencem hoje" valor={dados.prazos.vencem_hoje} icone={AlarmClock} nota="não concluídos">
                  {dados.prazos.vencem_hoje > 0 && (
                    <div>
                      <Selo tom="aviso" icone={AlarmClock}>
                        Vence hoje
                      </Selo>
                    </div>
                  )}
                </Indicador>
                <Indicador rotulo="Próximos 7 dias" valor={dados.prazos.proximos_7_dias} icone={CalendarClock} nota="a partir de amanhã" />
                <Indicador rotulo="Intimações não lidas" valor={dados.intimacoes.nao_lidas} icone={Gavel} nota="publicações do DJEN">
                  {dados.intimacoes.nao_lidas > 0 && (
                    <div>
                      <Link para="/intimacoes">Ler agora</Link>
                    </div>
                  )}
                </Indicador>
                <Indicador rotulo="Processos ativos" valor={dados.processos.ativos} icone={Briefcase} />
                <Indicador rotulo="Clientes ativos" valor={dados.clientes.ativos} icone={Contact} />
              </>
            ) : (
              <>
                <EsqueletoKpi />
                <EsqueletoKpi />
                <EsqueletoKpi />
                <EsqueletoKpi />
                <EsqueletoKpi />
                <EsqueletoKpi />
              </>
            )}
          </section>

          {!dados ? (
            <EsqueletoLinhas linhas={4} />
          ) : (
            <>
              {dados.prazos.vencidos > 0 && (
                <Cartao titulo="Prazos vencidos" subtitulo="Ainda não concluídos, do mais antigo ao mais recente" acoes={verPrazos}>
                  <ListaPrazos prazos={dados.prazos.lista_vencidos} vazio="" mostrarData />
                  {dados.prazos.vencidos > dados.prazos.lista_vencidos.length && <p className="texto-pequeno">Mostrando {dados.prazos.lista_vencidos.length} de {dados.prazos.vencidos}.</p>}
                </Cartao>
              )}

              <div className="grade grade-2">
                <Cartao titulo="Vence hoje" subtitulo="Prazos com data fatal hoje" acoes={verPrazos}>
                  <ListaPrazos prazos={dados.prazos.lista_hoje} vazio="Nenhum prazo vence hoje." />
                </Cartao>
                <Cartao titulo="Próximos 7 dias" subtitulo="A partir de amanhã" acoes={verPrazos}>
                  <ListaPrazos prazos={dados.prazos.lista_proximos} vazio="Nenhum prazo nos próximos 7 dias." mostrarData />
                </Cartao>
              </div>

              <div className="grade grade-2">
                <Cartao titulo="Próximos compromissos" subtitulo="Audiências, reuniões e diligências" acoes={<Link para="/agenda">Abrir a agenda</Link>}>
                  {dados.eventos.length === 0 ? (
                    <EstadoVazio compacto icone={CalendarDays} titulo="Nenhum compromisso à vista">
                      Os eventos cadastrados na agenda aparecem aqui.
                    </EstadoVazio>
                  ) : (
                    <ul className="agenda-lista" aria-label="Próximos compromissos">
                      {dados.eventos.map((e) => (
                        <li key={e.id}>
                          <ItemEvento evento={e} aoAbrir={setAberto} mostrarData />
                        </li>
                      ))}
                    </ul>
                  )}
                </Cartao>
                <Cartao>
                  {dados.processos.ativos > 0 ? (
                    <Barras titulo="Processos ativos por fase" subtitulo="Quantidade de processos em cada fase" medida="Processos" categoria="Fase" dados={FASES.map((f) => ({ chave: f, rotulo: f, valor: dados.processos.por_fase[f] }))} />
                  ) : (
                    <EstadoVazio compacto icone={Briefcase} titulo="Nenhum processo ativo" acao={<Link para="/processos">Cadastrar processo</Link>}>
                      Quando houver processos, a distribuição por fase aparece aqui.
                    </EstadoVazio>
                  )}
                </Cartao>
              </div>
            </>
          )}
        </>
      )}

      {MODULOS_EM_BREVE.length > 0 && (
        <Cartao titulo="Em breve" subtitulo="Estes módulos estão sendo construídos e ficarão disponíveis aqui.">
          <div className="cartoes-modulos">
            {MODULOS_EM_BREVE.map(({ rotulo, icone: Icone, descricao }) => (
              <div className="modulo" key={rotulo}>
                <Icone size={22} aria-hidden="true" />
                <div>
                  <strong>{rotulo}</strong>
                  <small>{descricao} · em breve</small>
                </div>
              </div>
            ))}
          </div>
        </Cartao>
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
        dataPadrao={dados?.hoje ?? ""}
        usuarios={usuarios}
        aoFechar={() => setEditando(null)}
        aoSalvar={() => {
          setEditando(null);
          void carregar();
        }}
      />
    </>
  );
}
