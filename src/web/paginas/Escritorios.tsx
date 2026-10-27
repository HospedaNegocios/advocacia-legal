import { Building2, Plus, Search } from "lucide-react";
import { useState } from "react";
import { ROTULO_STATUS } from "../api";
import type { Status } from "../api";
import { Botao, CabecalhoPagina, Cartao, EsqueletoLinhas, EstadoErro, EstadoVazio, Entrada, Selecao } from "../ui";
import { TabelaEscritorios, useEscritorios, useModaisEscritorios } from "./escritorios-comum";

export function Escritorios() {
  const g = useEscritorios();
  const m = useModaisEscritorios(g);
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<Status | "todos">("todos");

  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const filtradas = g.lista.filter((e) => (situacao === "todos" || e.status === situacao) && (!termo || e.nome.toLocaleLowerCase("pt-BR").includes(termo)));
  const filtrando = termo !== "" || situacao !== "todos";

  return (
    <>
      <CabecalhoPagina
        titulo="Escritórios"
        descricao="Crie, ative, suspenda e convide os sócios dos escritórios."
        migalhas={[{ rotulo: "Painel", para: "/" }, { rotulo: "Escritórios" }]}
        acoes={
          <Botao onClick={m.abrirNovo}>
            <Plus size={18} aria-hidden="true" />
            Novo escritório
          </Botao>
        }
      />
      <Cartao semPadding>
        <div className="linha-flex" style={{ padding: "var(--e-4)", borderBottom: "1px solid var(--cor-borda)", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 14rem" }}>
            <Entrada rotulo="Buscar por nome" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome do escritório" type="search" />
          </div>
          <div style={{ flex: "0 1 12rem" }}>
            <Selecao rotulo="Situação" value={situacao} onChange={(e) => setSituacao(e.target.value as Status | "todos")}>
              <option value="todos">Todas</option>
              {(Object.keys(ROTULO_STATUS) as Status[]).map((s) => (
                <option key={s} value={s}>
                  {ROTULO_STATUS[s]}
                </option>
              ))}
            </Selecao>
          </div>
        </div>
        {g.estado === "carregando" ? (
          <EsqueletoLinhas linhas={5} />
        ) : g.estado === "erro" ? (
          <EstadoErro acao={<Botao variante="secundario" onClick={() => void g.recarregar()}>Tentar de novo</Botao>}>{g.mensagemErro}</EstadoErro>
        ) : filtradas.length === 0 ? (
          <EstadoVazio icone={filtrando ? Search : Building2} titulo={filtrando ? "Nenhum escritório encontrado" : "Nenhum escritório cadastrado ainda"} {...(filtrando ? {} : { acao: <Botao onClick={m.abrirNovo}>Novo escritório</Botao> })}>
            {filtrando ? "Tente outro nome ou limpe o filtro de situação." : "Crie o primeiro escritório para começar."}
          </EstadoVazio>
        ) : (
          <TabelaEscritorios linhas={filtradas} g={g} m={m} />
        )}
      </Cartao>
      {m.modais}
    </>
  );
}
