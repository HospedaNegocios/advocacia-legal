import { Calculator, CalendarCheck } from "lucide-react";
import { useState } from "react";
import { ErroApi, api } from "../api";
import { AVISO_CONFERENCIA, DIAS_MAXIMO, dataPorExtenso } from "../../comum/prazos-uteis";
import type { IntervaloPulado, TipoContagem, TipoInicio } from "../../comum/prazos-uteis";
import { Aviso, Botao, CampoMarcar, Entrada, Selecao } from "../ui";

interface Resultado {
  data_final: string;
  dia_do_comeco: string;
  primeiro_dia_contado: string;
  dias_contados: string[];
  pulados: IntervaloPulado[];
  passos: string[];
  avisos: string[];
}

const ROTULO_INICIO: Record<TipoInicio, string> = {
  disponibilizacao: "Disponibilização no Diário da Justiça eletrônico",
  publicacao: "Publicação no Diário",
  consulta_eletronica: "Consulta à intimação eletrônica",
  dia_do_comeco: "Dia do começo do prazo (ex.: juntada do mandado ou do aviso de recebimento)",
};

/**
 * Calculadora de data final do prazo. Só calcula (não grava): o advogado confere a explicação e decide se usa a data.
 * A data fatal continua sendo um campo comum, sempre editável à mão.
 */
export function CalculoPrazo({ aoUsar }: { aoUsar: (dataFinal: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [tipoInicio, setTipoInicio] = useState<TipoInicio>("disponibilizacao");
  const [data, setData] = useState("");
  const [dias, setDias] = useState("15");
  const [contagem, setContagem] = useState<TipoContagem>("uteis");
  const [suspensao, setSuspensao] = useState(true);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [erro, setErro] = useState("");
  const [calculando, setCalculando] = useState(false);
  const [usada, setUsada] = useState(false);

  const mudou = () => {
    setResultado(null);
    setUsada(false);
  };

  const calcular = async () => {
    setErro("");
    mudou();
    const n = Number(dias);
    if (!data) return setErro("Informe a data de início.");
    if (!Number.isInteger(n) || n < 1 || n > DIAS_MAXIMO) return setErro(`Informe a quantidade de dias (de 1 a ${DIAS_MAXIMO}).`);
    setCalculando(true);
    try {
      const r = await api<{ resultado: Resultado }>("POST", "/api/prazos/calcular", { data, tipo_inicio: tipoInicio, dias: n, contagem, aplicar_suspensao: suspensao });
      setResultado(r.resultado);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    } finally {
      setCalculando(false);
    }
  };

  if (!aberto) {
    return (
      <div className="calc-prazo-abrir">
        <Botao variante="secundario" onClick={() => setAberto(true)}>
          <Calculator size={18} aria-hidden="true" />
          Calcular data final
        </Botao>
        <span className="texto-pequeno">Opcional. Conta dias úteis ou corridos e explica o cálculo.</span>
      </div>
    );
  }

  return (
    <section className="calc-prazo" aria-label="Calcular data final do prazo">
      <div className="calc-prazo-cabeca">
        <h3>
          <Calculator size={18} aria-hidden="true" /> Calcular data final
        </h3>
        <Botao variante="fantasma" tamanho="pequeno" onClick={() => setAberto(false)}>
          Fechar
        </Botao>
      </div>
      <Aviso tipo="atencao">{AVISO_CONFERENCIA}</Aviso>
      <Selecao rotulo="A data informada é" value={tipoInicio} onChange={(e) => (setTipoInicio(e.target.value as TipoInicio), mudou())}>
        {(Object.keys(ROTULO_INICIO) as TipoInicio[]).map((k) => (
          <option key={k} value={k}>
            {ROTULO_INICIO[k]}
          </option>
        ))}
      </Selecao>
      <div className="grade grade-3">
        <Entrada rotulo="Data de início" type="date" value={data} onChange={(e) => (setData(e.target.value), mudou())} />
        <Entrada rotulo="Quantidade de dias" type="number" inputMode="numeric" min={1} max={DIAS_MAXIMO} value={dias} onChange={(e) => (setDias(e.target.value), mudou())} />
        <Selecao rotulo="Contagem" value={contagem} onChange={(e) => (setContagem(e.target.value as TipoContagem), mudou())}>
          <option value="uteis">Dias úteis (CPC art. 219)</option>
          <option value="corridos">Dias corridos</option>
        </Selecao>
      </div>
      <CampoMarcar checked={suspensao} onChange={(e) => (setSuspensao(e.target.checked), mudou())}>
        Suspender o prazo de 20/12 a 20/01 (CPC art. 220)
      </CampoMarcar>
      <div>
        <Botao carregando={calculando} onClick={() => void calcular()}>
          Calcular
        </Botao>
      </div>
      {erro && <Aviso>{erro}</Aviso>}
      {resultado && (
        <div className="calc-resultado" aria-live="polite">
          <p className="calc-final">
            <span>Último dia do prazo</span>
            <strong>{dataPorExtenso(resultado.data_final)}</strong>
          </p>
          <Botao
            onClick={() => {
              aoUsar(resultado.data_final);
              setUsada(true);
            }}
          >
            <CalendarCheck size={18} aria-hidden="true" />
            Usar como data fatal
          </Botao>
          {usada && <Aviso tipo="ok">Data fatal preenchida. Você ainda pode alterá-la à mão.</Aviso>}
          <h4>Como foi calculado</h4>
          <ul className="calc-passos">
            {resultado.passos.map((p, i) => (
              <li key={i} className={p.startsWith("  ") ? "calc-passo-sub" : undefined}>
                {p.trim()}
              </li>
            ))}
          </ul>
          {resultado.avisos.slice(1).map((a) => (
            <p key={a} className="texto-pequeno">
              {a}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
