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
