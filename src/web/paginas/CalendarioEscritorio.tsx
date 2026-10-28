import { CalendarOff, CircleCheck, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ErroApi, api } from "../api";
import { AVISO_CONFERENCIA } from "../../comum/prazos-uteis";
import type { Feriado, SugestaoMovel, TipoDiaSemExpediente } from "../../comum/prazos-uteis";
import { hojeEm } from "../../comum/fuso";
import { Aviso, Botao, Confirmar, Entrada, EsqueletoLinhas, EstadoErro, EstadoVazio, Formulario, Modal, Selecao, Selo, Tabela, useToast } from "../ui";
import type { Coluna } from "../ui";
import { diaBr } from "./clientes-comum";

interface Dia {
  id: string;
  data: string;
  descricao: string;
  tipo: TipoDiaSemExpediente;
}
interface Dados {
  ano: number;
  dias: Dia[];
  nacionais: Feriado[];
  sugestoes: SugestaoMovel[];
}

const ROTULO_TIPO: Record<TipoDiaSemExpediente, string> = { feriado_local: "Feriado local", suspensao_tribunal: "Suspensão de tribunal", outro: "Outro" };

/** Aba "Calendário" do Escritório: dias sem expediente usados na contagem de prazos em dias úteis. */
export function AbaCalendario({ podeEditar }: { podeEditar: boolean }) {
  const { avisar } = useToast();
  const anoAtual = Number(hojeEm().slice(0, 4));
  const [ano, setAno] = useState(anoAtual);
  const [dados, setDados] = useState<Dados | null>(null);
  const [erroCarga, setErroCarga] = useState("");
  const [novo, setNovo] = useState<{ data: string; descricao: string; tipo: TipoDiaSemExpediente } | null>(null);
  const [erroForm, setErroForm] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [removendo, setRemovendo] = useState<Dia | null>(null);

  const carregar = useCallback(async () => {
    try {
      setDados(await api<Dados>("GET", `/api/calendario?ano=${ano}`));
      setErroCarga("");
    } catch (e) {
      setErroCarga(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  }, [ano]);
  useEffect(() => {
    setDados(null);
    void carregar();
  }, [carregar]);

  const adicionar = async (corpo: { data: string; descricao: string; tipo: TipoDiaSemExpediente }, fecharForm: boolean) => {
    setSalvando(true);
    setErroForm("");
    try {
      await api("POST", "/api/calendario", corpo);
      avisar("Dia adicionado ao calendário.");
      if (fecharForm) setNovo(null);
      await carregar();
    } catch (e) {
      const msg = e instanceof ErroApi ? e.message : "Algo deu errado.";
      if (fecharForm) setErroForm(msg);
      else avisar(msg, "erro");
    } finally {
      setSalvando(false);
    }
  };

  const remover = async (d: Dia) => {
    try {
      await api("DELETE", `/api/calendario/${d.id}`);
      avisar("Dia removido do calendário.");
    } catch (e) {
      avisar(e instanceof ErroApi ? e.message : "Algo deu errado.", "erro");
    }
    await carregar();
  };

  if (erroCarga) return <EstadoErro acao={<Botao variante="secundario" onClick={() => void carregar()}>Tentar de novo</Botao>}>{erroCarga}</EstadoErro>;

  const botaoAdicionar = (
    <Botao onClick={() => (setErroForm(""), setNovo({ data: "", descricao: "", tipo: "feriado_local" }))}>
      <Plus size={18} aria-hidden="true" />
      Adicionar dia
    </Botao>
  );

  const colunasDias: Coluna<Dia>[] = [
    { chave: "data", titulo: "Data", principal: true, nowrap: true, render: (d) => <strong>{diaBr(d.data)}</strong> },
    { chave: "descricao", titulo: "Descrição", render: (d) => d.descricao },
    { chave: "tipo", titulo: "Tipo", render: (d) => ROTULO_TIPO[d.tipo] },
    ...(podeEditar
      ? [
          {
            chave: "acoes",
            titulo: "Ações",
            acoes: true,
            render: (d: Dia) => (
              <div className="tabela-acoes">
                <Botao tamanho="pequeno" variante="perigo" onClick={() => setRemovendo(d)} aria-label={`Remover ${diaBr(d.data)} do calendário`}>
                  <Trash2 size={16} aria-hidden="true" />
                  Remover
                </Botao>
              </div>
            ),
          } satisfies Coluna<Dia>,
        ]
      : []),
  ];

  const cadastradas = new Set(dados?.dias.map((d) => d.data));

  return (
    <div className="pilha">
      <Aviso tipo="atencao">{AVISO_CONFERENCIA}</Aviso>
      <p className="texto-pequeno" style={{ margin: 0 }}>
        A contagem em dias úteis pula sábados, domingos, os feriados nacionais por lei (lista abaixo) e os dias que você cadastrar aqui. Feriados locais, Carnaval, Corpus Christi e suspensões de tribunal só entram na conta se estiverem cadastrados.
      </p>
      <div className="barra-calendario">
        <Selecao rotulo="Ano" value={String(ano)} onChange={(e) => setAno(Number(e.target.value))}>
          {Array.from({ length: 6 }, (_, i) => anoAtual - 1 + i).map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Selecao>
        {podeEditar && botaoAdicionar}
      </div>

      {dados === null ? (
        <EsqueletoLinhas linhas={3} />
      ) : (
        <>
          <h3 className="calc-titulo-secao">Dias sem expediente do escritório</h3>
          {dados.dias.length === 0 ? (
            <EstadoVazio icone={CalendarOff} titulo={`Nenhum dia cadastrado em ${ano}`} {...(podeEditar ? { acao: botaoAdicionar } : {})}>
              {podeEditar ? "Cadastre feriados locais e suspensões do seu tribunal para a contagem de prazos considerá-los." : "Sócio ou advogado cadastra os dias sem expediente."}
            </EstadoVazio>
          ) : (
            <div className="tabela-borda-total">
              <Tabela colunas={colunasDias} linhas={dados.dias} chaveLinha={(d) => d.id} legenda={`Dias sem expediente cadastrados em ${ano}`} />
            </div>
          )}

          <h3 className="calc-titulo-secao">Sugestões de dias móveis em {ano}</h3>
          <p className="texto-pequeno" style={{ margin: 0 }}>
            Não são feriados nacionais por lei e não entram na conta sozinhos. Confira no calendário do seu tribunal e cadastre só os que valem para você.
          </p>
          <div className="tabela-borda-total">
            <Tabela
              legenda={`Sugestões de dias móveis em ${ano}`}
              chaveLinha={(s) => s.data}
              linhas={dados.sugestoes}
              colunas={[
                { chave: "data", titulo: "Data", principal: true, nowrap: true, render: (s: SugestaoMovel) => <strong>{diaBr(s.data)}</strong> },
                { chave: "descricao", titulo: "Dia", render: (s: SugestaoMovel) => s.descricao },
                { chave: "base", titulo: "Em que se baseia", render: (s: SugestaoMovel) => <span className="texto-pequeno">{s.base}</span> },
                ...(podeEditar
                  ? [
                      {
                        chave: "acoes",
                        titulo: "Ações",
                        acoes: true,
                        render: (s: SugestaoMovel) =>
                          cadastradas.has(s.data) ? (
                            <Selo tom="bom" icone={CircleCheck}>
                              Já cadastrado
                            </Selo>
                          ) : (
                            <Botao tamanho="pequeno" variante="secundario" disabled={salvando} onClick={() => void adicionar({ data: s.data, descricao: s.descricao, tipo: "outro" }, false)} aria-label={`Cadastrar ${s.descricao}, ${diaBr(s.data)}`}>
                              <Plus size={16} aria-hidden="true" />
                              Cadastrar
                            </Botao>
                          ),
                      } satisfies Coluna<SugestaoMovel>,
                    ]
                  : []),
              ]}
            />
          </div>

          <h3 className="calc-titulo-secao">Feriados nacionais por lei (já considerados)</h3>
          <ul className="lista-feriados">
            {dados.nacionais.map((f) => (
              <li key={f.data}>
                <strong>{diaBr(f.data)}</strong> {f.descricao} <span className="texto-pequeno">({f.lei})</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <Modal aberto={novo !== null} aoFechar={() => setNovo(null)} titulo="Adicionar dia sem expediente" descricao="Feriado local, suspensão do tribunal ou outro dia em que não há expediente.">
        {novo && (
          <Formulario aoEnviar={() => void adicionar(novo, true)}>
            <Entrada rotulo="Data" type="date" required value={novo.data} onChange={(e) => setNovo({ ...novo, data: e.target.value })} />
            <Entrada rotulo="Descrição" required maxLength={200} autoComplete="off" placeholder="Ex.: Aniversário da cidade" value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} />
            <Selecao rotulo="Tipo" value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value as TipoDiaSemExpediente })}>
              {(Object.keys(ROTULO_TIPO) as TipoDiaSemExpediente[]).map((t) => (
                <option key={t} value={t}>
                  {ROTULO_TIPO[t]}
                </option>
              ))}
            </Selecao>
            {erroForm && <Aviso>{erroForm}</Aviso>}
            <div className="modal-rodape">
              <Botao variante="secundario" onClick={() => setNovo(null)}>
                Cancelar
              </Botao>
              <Botao type="submit" carregando={salvando}>
                Salvar
              </Botao>
            </div>
          </Formulario>
        )}
      </Modal>

      <Confirmar
        aberto={removendo !== null}
        aoFechar={() => setRemovendo(null)}
        titulo="Remover dia do calendário"
        rotuloConfirmar="Remover"
        perigo
        aoConfirmar={() => {
          const d = removendo;
          setRemovendo(null);
          if (d) void remover(d);
        }}
      >
        Remover {removendo ? `${diaBr(removendo.data)} (${removendo.descricao})` : ""}? Cálculos futuros voltam a contar esse dia. Prazos já cadastrados não mudam.
      </Confirmar>
    </div>
  );
}
