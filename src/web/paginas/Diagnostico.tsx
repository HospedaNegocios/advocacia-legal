import { CircleCheck, CircleX, ShieldBan, Stethoscope } from "lucide-react";
import { useState } from "react";
import { ErroApi, api } from "../api";
import { Aviso, Botao, CabecalhoPagina, Cartao, EstadoVazio, Selo, Tabela } from "../ui";
import type { Coluna, TomSelo } from "../ui";
import type { LucideIcon } from "lucide-react";

interface Resultado {
  ok: boolean;
  status: number | null;
  statusText: string | null;
  duracaoMs: number;
  colo: string | null;
  pais: string | null;
  itens: number | null;
  contentType: string | null;
  trecho: string | null;
  erro: string | null;
  quando: string;
}

interface AlvoDatajud {
  nome: string;
  ok: boolean;
  status: number | null;
  duracaoMs: number;
  hits: number | null;
  trecho: string | null;
  erro: string | null;
}
interface ResultadoDatajud {
  colo: string | null;
  pais: string | null;
  resultados: AlvoDatajud[];
}

function segundos(ms: number): string {
  return (ms / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Frase simples para uma linha do teste do DataJud. */
function fraseDatajud(a: AlvoDatajud): string {
  const nome = a.nome.startsWith("Conexão") ? "Conexão simples" : a.nome;
  if (a.status === null) {
    return a.erro?.startsWith("Tempo esgotado") ? `${nome}: não respondeu em 20 s` : `${nome}: falha de rede em ${segundos(a.duracaoMs)} s${a.erro ? ` (${a.erro})` : ""}`;
  }
  return `${nome}: respondeu em ${segundos(a.duracaoMs)} s (código ${a.status})${a.hits !== null ? `, ${a.hits} item(ns)` : ""}`;
}

type Situacao = "sucesso" | "bloqueado" | "erro";

function situacaoDe(r: Resultado): Situacao {
  if (r.ok) return "sucesso";
  if (r.status === 403 || r.status === 401) return "bloqueado";
  return "erro";
}

const SELO: Record<Situacao, { tom: TomSelo; icone: LucideIcon; rotulo: string }> = {
  sucesso: { tom: "bom", icone: CircleCheck, rotulo: "Funcionou" },
  bloqueado: { tom: "critico", icone: ShieldBan, rotulo: "Bloqueado" },
  erro: { tom: "aviso", icone: CircleX, rotulo: "Erro" },
};

function SeloResultado({ r }: { r: Resultado }) {
  const s = SELO[situacaoDe(r)];
  return (
    <Selo tom={s.tom} icone={s.icone}>
      {s.rotulo}
    </Selo>
  );
}

const COLUNAS: Coluna<Resultado>[] = [
  { chave: "hora", titulo: "Hora", render: (r) => r.quando },
  { chave: "situacao", titulo: "Situação", render: (r) => <SeloResultado r={r} /> },
  { chave: "codigo", titulo: "Código", render: (r) => r.status ?? "—" },
  { chave: "tempo", titulo: "Tempo", numerica: true, render: (r) => `${r.duracaoMs} ms` },
];

export function Diagnostico() {
  const [testando, setTestando] = useState(false);
  const [erro, setErro] = useState("");
  const [historico, setHistorico] = useState<Resultado[]>([]);

  const testar = async () => {
    setErro("");
    setTestando(true);
    try {
      const r = await api<Omit<Resultado, "quando">>("POST", "/api/plataforma/diagnostico/djen");
      setHistorico((h) => [{ ...r, quando: new Date().toLocaleTimeString("pt-BR") }, ...h].slice(0, 10));
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    } finally {
      setTestando(false);
    }
  };

  const [testandoDj, setTestandoDj] = useState(false);
  const [erroDj, setErroDj] = useState("");
  const [datajud, setDatajud] = useState<ResultadoDatajud | null>(null);

  const testarDatajud = async () => {
    setErroDj("");
    setTestandoDj(true);
    try {
      setDatajud(await api<ResultadoDatajud>("POST", "/api/plataforma/diagnostico/datajud"));
    } catch (e) {
      setErroDj(e instanceof ErroApi ? e.message : "Algo deu errado.");
    } finally {
      setTestandoDj(false);
    }
  };

  const ultimo = historico[0];
  return (
    <>
      <CabecalhoPagina titulo="Diagnóstico" descricao="Testes de conexão da plataforma com serviços externos." />
      <div style={{ display: "grid", gap: "var(--e-4)" }}>
        <Cartao titulo="Conexão com o DJEN" subtitulo="Verifica se o DJEN aceita chamadas vindas do servidor do sistema.">
          <p style={{ marginTop: 0 }}>
            O DJEN é o Diário de Justiça Eletrônico, de onde virão as intimações. Este teste pede ao DJEN cinco publicações de hoje do TJSP, a partir do servidor do sistema, para saber se ele aceita a conexão ou se
            bloqueia (há relatos de bloqueio a servidores fora do Brasil). Nada da resposta é guardado.
          </p>
          <Botao carregando={testando} onClick={() => void testar()}>
            {testando ? "Testando..." : "Testar agora"}
          </Botao>
          {erro && (
            <div style={{ marginTop: "var(--e-3)" }}>
              <Aviso>{erro}</Aviso>
            </div>
          )}
        </Cartao>

        <Cartao titulo="DataJud (CNJ)" subtitulo="Verifica se o DataJud responde a chamadas vindas do servidor do sistema.">
          <p style={{ marginTop: 0 }}>
            O teste faz três chamadas ao mesmo tempo, com limite de 20 segundos cada: uma busca de 1 item no TJDFT e outra no TJSP (com a chave do sistema) e uma conexão simples, sem chave. Nada da resposta é guardado e a chave nunca é mostrada.
          </p>
          <Botao carregando={testandoDj} onClick={() => void testarDatajud()}>
            {testandoDj ? "Testando..." : "Testar DataJud"}
          </Botao>
          {erroDj && (
            <div style={{ marginTop: "var(--e-3)" }}>
              <Aviso>{erroDj}</Aviso>
            </div>
          )}
          {datajud && (
            <div aria-live="polite" style={{ marginTop: "var(--e-3)" }}>
              <ul>
                {datajud.resultados.map((a) => (
                  <li key={a.nome}>
                    <Selo tom={a.ok ? "bom" : a.status === 401 || a.status === 403 ? "critico" : "aviso"} icone={a.ok ? CircleCheck : CircleX}>
                      {a.ok ? "Funcionou" : "Problema"}
                    </Selo>{" "}
                    {fraseDatajud(a)}
                    {a.trecho && <pre className="bloco-codigo">{a.trecho}</pre>}
                  </li>
                ))}
              </ul>
              <p>
                Data center da Cloudflare: {datajud.colo ?? "—"}
                {datajud.pais ? ` (${datajud.pais})` : ""}
              </p>
            </div>
          )}
        </Cartao>

        {ultimo ? (
          <Cartao titulo="Resultado" acoes={<SeloResultado r={ultimo} />}>
            <div aria-live="polite">
              <dl className="dados">
                <dt>Código de resposta</dt>
                <dd>{ultimo.status === null ? "—" : `${ultimo.status} ${ultimo.statusText ?? ""}`}</dd>
                <dt>Tempo de resposta</dt>
                <dd>{ultimo.duracaoMs} ms</dd>
                <dt>Data center da Cloudflare</dt>
                <dd>
                  {ultimo.colo ?? "—"}
                  {ultimo.pais ? ` (${ultimo.pais})` : ""}
                </dd>
                <dt>Quantidade de itens</dt>
                <dd>{ultimo.itens === null ? "—" : ultimo.itens}</dd>
              </dl>
              {ultimo.erro && (
                <div style={{ marginTop: "var(--e-3)" }}>
                  <Aviso>{ultimo.erro}</Aviso>
                </div>
              )}
              {ultimo.trecho && <pre className="bloco-codigo">{ultimo.trecho}</pre>}
            </div>
          </Cartao>
        ) : (
          <EstadoVazio icone={Stethoscope} titulo="Nenhum teste feito ainda">
            Clique em “Testar agora” para ver o resultado aqui.
          </EstadoVazio>
        )}

        {historico.length > 1 && (
          <Cartao titulo="Testes anteriores" semPadding>
            <Tabela colunas={COLUNAS} linhas={historico.slice(1)} chaveLinha={(r) => r.quando + r.duracaoMs} legenda="Testes anteriores" />
          </Cartao>
        )}
      </div>
    </>
  );
}
