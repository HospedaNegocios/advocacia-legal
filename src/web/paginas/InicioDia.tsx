import { CalendarDays } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { FUSO_PADRAO, partesLocais } from "../../comum/fuso";
import { Link } from "../roteador";
import { Cartao, EstadoVazio } from "../ui";
import { diasDoEvento, horarioEvento } from "./agenda-comum";
import type { Evento, Prazo } from "./agenda-comum";
import { cnjFormatado } from "./processos-comum";

// "Seu dia": régua de horas com os compromissos e prazos de hoje (Início). Tudo no calendário de São Paulo.

const minutos = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hh = (h: number) => `${String(h).padStart(2, "0")}h`;

interface Bloco {
  id: string;
  tipo: "evento" | "prazo";
  titulo: string;
  detalhe: string;
  ini: number; // minutos desde 00:00
  fim: number;
  passado: boolean;
  faixa: number; // linha de empilhamento dentro do tipo
  evento?: Evento;
  prazo?: Prazo;
}

/** Empilha blocos que se sobrepõem em faixas (a primeira faixa livre). Devolve o total de faixas. */
function empilhar(blocos: Bloco[]): number {
  const fins: number[] = [];
  for (const b of [...blocos].sort((x, y) => x.ini - y.ini || x.fim - y.fim)) {
    let f = fins.findIndex((fim) => fim <= b.ini);
    if (f < 0) f = fins.length;
    fins[f] = b.fim;
    b.faixa = f;
  }
  return Math.max(1, fins.length);
}

/** Minuto atual em São Paulo, atualizado a cada minuto. */
function useAgora(): { data: string; min: number } {
  const ler = () => {
    const p = partesLocais(Date.now(), FUSO_PADRAO);
    return { data: p.data, min: minutos(p.hora) };
  };
  const [agora, setAgora] = useState(ler);
  useEffect(() => {
    const t = window.setInterval(() => setAgora(ler()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return agora;
}

const ALTURA_EVENTO = 66;
const ALTURA_PRAZO = 46;
const FOLGA = 6;
const TOPO = 26;

export function SeuDia({ hoje, eventos, prazos, aoAbrirEvento }: { hoje: string; eventos: Evento[]; prazos: Prazo[]; aoAbrirEvento: (e: Evento) => void }) {
  const agora = useAgora();
  const ehHoje = agora.data === hoje;

  const { blocos, inicio, fim, faixasEv, faixasPz, proximos } = useMemo(() => {
    const evs: Bloco[] = [];
    const prs: Bloco[] = [];
    const futuros: Evento[] = [];
    for (const e of eventos) {
      const d = diasDoEvento(e);
      if (d.primeiro > hoje) futuros.push(e);
      if (d.primeiro > hoje || d.ultimo < hoje) continue;
      const a = partesLocais(Date.parse(e.inicio), FUSO_PADRAO);
      const b = partesLocais(Date.parse(e.fim), FUSO_PADRAO);
      let ini = a.data < hoje ? 0 : minutos(a.hora);
      let fimMin = b.data > hoje ? 24 * 60 : minutos(b.hora);
      if (e.dia_inteiro) {
        ini = 0;
        fimMin = 24 * 60;
      }
      if (fimMin <= ini) fimMin = Math.min(24 * 60, ini + 30);
      evs.push({ id: `e-${e.id}`, tipo: "evento", titulo: e.titulo, detalhe: [horarioEvento(e), e.local].filter(Boolean).join(" · "), ini, fim: fimMin, passado: false, faixa: 0, evento: e });
    }
    for (const p of prazos) {
      const limite = p.hora ? minutos(p.hora) : null;
      prs.push({ id: `p-${p.id}`, tipo: "prazo", titulo: p.titulo, detalhe: limite === null ? "até o fim do dia" : `até ${p.hora}`, ini: 0, fim: limite ?? 24 * 60, passado: false, faixa: 0, prazo: p });
    }
    // Faixa de horas: 08h–20h, ampliada se algo de hoje cair fora.
    let i0 = 8;
    let f0 = 20;
    for (const b of evs) {
      if (b.evento?.dia_inteiro) continue;
      i0 = Math.min(i0, Math.floor(b.ini / 60));
      f0 = Math.max(f0, Math.ceil(b.fim / 60));
    }
    for (const b of prs) {
      if (!b.prazo?.hora) continue;
      f0 = Math.max(f0, Math.ceil(b.fim / 60));
      i0 = Math.min(i0, Math.floor(b.fim / 60));
    }
    i0 = Math.max(0, i0);
    f0 = Math.min(24, Math.max(f0, i0 + 1));
    const ini0 = i0 * 60;
    for (const b of prs) {
      // Prazo com hora termina nela; começa agora (ou no início da régua). Sem hora, vai até o fim da régua.
      const fimPrazo = b.prazo?.hora ? b.fim : f0 * 60;
      const inicioPrazo = ehHoje ? Math.min(Math.max(agora.min, ini0), fimPrazo - 30) : ini0;
      b.ini = Math.max(ini0, Math.min(inicioPrazo, fimPrazo - 30));
      b.fim = Math.max(b.ini + 30, fimPrazo);
    }
    for (const b of evs) {
      b.ini = Math.max(b.ini, ini0);
      b.fim = Math.min(b.fim, f0 * 60);
      if (b.fim <= b.ini) b.fim = Math.min(f0 * 60, b.ini + 30);
    }
    const todos = [...evs, ...prs];
    if (ehHoje) for (const b of todos) b.passado = b.fim < agora.min && !(b.tipo === "prazo" && !b.prazo?.hora);
    return { blocos: todos, inicio: i0, fim: f0, faixasEv: empilhar(evs), faixasPz: empilhar(prs), proximos: futuros.slice(0, 3) };
  }, [eventos, prazos, hoje, ehHoje, agora.min]);

  const horas = Array.from({ length: fim - inicio }, (_, i) => inicio + i);
  const total = (fim - inicio) * 60;
  const pos = (m: number) => `${(((m - inicio * 60) / total) * 100).toFixed(3)}%`;
  const larg = (a: number, b: number) => `${(((b - a) / total) * 100).toFixed(3)}%`;
  const altEv = faixasEv * (ALTURA_EVENTO + FOLGA);
  const topoPrazos = TOPO + (blocos.some((b) => b.tipo === "evento") ? altEv : 0) + FOLGA;
  const altTotal = topoPrazos + faixasPz * (ALTURA_PRAZO + FOLGA);
  const vazio = blocos.length === 0;
  const agoraVisivel = ehHoje && agora.min >= inicio * 60 && agora.min <= fim * 60;

  return (
    <Cartao titulo="Seu dia" subtitulo="Compromissos e prazos de hoje, hora a hora" acoes={<Legenda />} rotuloId="titulo-seu-dia">
      {vazio ? (
        <EstadoVazio compacto icone={CalendarDays} titulo="Nada marcado para hoje" acao={<Link para="/agenda">Abrir a agenda</Link>}>
          {proximos.length > 0 ? "Seus próximos compromissos:" : "Os compromissos e prazos de hoje aparecem aqui, hora a hora."}
        </EstadoVazio>
      ) : (
        <>
          <ul className="so-leitor" aria-label="Hoje, em texto">
            {blocos.map((b) => (
              <li key={b.id}>
                {b.tipo === "evento" ? "Compromisso" : "Prazo"}: {b.titulo}, {b.detalhe}
                {b.prazo?.processo_numero ? `, processo ${cnjFormatado(b.prazo.processo_numero)}` : ""}
              </li>
            ))}
          </ul>
          <div className="regua-rolagem" tabIndex={0} role="group" aria-label="Linha do tempo de hoje (role para os lados no celular)">
            <div className="regua" style={{ height: altTotal }}>
              <div className="regua-horas" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${horas.length}, 1fr)` }}>
                {horas.map((h) => (
                  <span key={h}>{hh(h)}</span>
                ))}
              </div>
              {blocos.map((b) => {
                const estilo = {
                  left: pos(b.ini),
                  width: larg(b.ini, b.fim),
                  top: b.tipo === "evento" ? TOPO + b.faixa * (ALTURA_EVENTO + FOLGA) : topoPrazos + b.faixa * (ALTURA_PRAZO + FOLGA),
                  height: b.tipo === "evento" ? ALTURA_EVENTO : ALTURA_PRAZO,
                };
                const classe = `bloco bloco-${b.tipo}${b.passado ? " passado" : ""}`;
                const conteudo = (
                  <>
                    <b>{b.titulo}</b>
                    <small>{b.detalhe}</small>
                  </>
                );
                if (b.evento) {
                  const ev = b.evento;
                  return (
                    <button key={b.id} type="button" className={classe} style={estilo} onClick={() => aoAbrirEvento(ev)} aria-label={`Compromisso: ${b.titulo}, ${b.detalhe}. Abrir detalhes`}>
                      {conteudo}
                    </button>
                  );
                }
                const destino = b.prazo?.processo_id ? `/processos/${b.prazo.processo_id}` : "/prazos";
                return (
                  <Link key={b.id} para={destino} className={classe} aria-label={`Prazo: ${b.titulo}, ${b.detalhe}`} style={estilo}>
                    {conteudo}
                  </Link>
                );
              })}
              {agoraVisivel && (
                <div className="regua-agora" style={{ left: pos(agora.min) }} aria-hidden="true">
                  <span>agora</span>
                </div>
              )}
            </div>
          </div>
        </>
      )}
      {vazio && proximos.length > 0 && (
        <ul className="inicio-proximos" aria-label="Próximos compromissos">
          {proximos.map((e) => {
            const d = partesLocais(Date.parse(e.inicio), e.fuso).data;
            return (
              <li key={e.id}>
                <button type="button" className="item-evento" onClick={() => aoAbrirEvento(e)}>
                  <span className="item-evento-hora">
                    <b>{`${d.slice(8, 10)}/${d.slice(5, 7)}`}</b>
                    <span>{horarioEvento(e)}</span>
                  </span>
                  <span className="item-evento-corpo">
                    <strong>{e.titulo}</strong>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Cartao>
  );
}

function Legenda() {
  return (
    <ul className="regua-legenda" aria-label="Legenda">
      <li>
        <i className="sw-evento" aria-hidden="true" />
        Compromisso
      </li>
      <li>
        <i className="sw-prazo" aria-hidden="true" />
        Prazo
      </li>
    </ul>
  );
}
