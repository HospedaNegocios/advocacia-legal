import { useEffect, useState } from "react";
import { ErroApi, api } from "../api";
import { centavosParaMoeda, mascaraCnj, mascaraMoeda, moedaParaCentavos, soDigitos } from "../mascaras";
import { AreaTexto, Aviso, Botao, Entrada, Formulario, Modal, Selecao } from "../ui";
import { hojeIso } from "./clientes-comum";
import { FASES } from "./processos-comum";
import type { Processo } from "./processos-comum";

type Campos = {
  numero_cnj: string;
  fase: string;
  tribunal: string;
  orgao: string;
  comarca: string;
  area: string;
  classe: string;
  assunto: string;
  valor: string;
  data_distribuicao: string;
  observacoes: string;
};

function inicial(p: Processo | null): Campos {
  return {
    numero_cnj: p ? mascaraCnj(p.numero_cnj) : "",
    fase: p?.fase ?? "",
    tribunal: p?.tribunal ?? "",
    orgao: p?.orgao ?? "",
    comarca: p?.comarca ?? "",
    area: p?.area ?? "",
    classe: p?.classe ?? "",
    assunto: p?.assunto ?? "",
    valor: p ? centavosParaMoeda(p.valor_causa_centavos) : "",
    data_distribuicao: p?.data_distribuicao ?? "",
    observacoes: p?.observacoes ?? "",
  };
}

/** Cadastro de processo (novo ou edição) em janela. O servidor confere o dígito verificador do número CNJ. */
export function ProcessoFormulario({ aberto, processo, aoFechar, aoSalvar }: { aberto: boolean; processo: Processo | null; aoFechar: () => void; aoSalvar: (p: Processo) => void }) {
  const [f, setF] = useState<Campos>(inicial(processo));
  const [erro, setErro] = useState("");
  const [tentou, setTentou] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (aberto) {
      setF(inicial(processo));
      setErro("");
      setTentou(false);
    }
  }, [aberto, processo]);

  const erros = {
    numero_cnj: soDigitos(f.numero_cnj).length === 20 ? undefined : "O número CNJ tem 20 dígitos (NNNNNNN-DD.AAAA.J.TR.OOOO).",
    fase: f.fase ? undefined : "Escolha a fase do processo.",
  };
  const temErro = Object.values(erros).some(Boolean);
  const mostrar = (k: keyof typeof erros) => (tentou ? erros[k] : undefined);
  const campo = (k: keyof Campos, aplicar: (v: string) => string = (v) => v) => ({ value: f[k], onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: aplicar(e.target.value) }) });

  const salvar = async () => {
    setTentou(true);
    setErro("");
    if (temErro) return;
    setSalvando(true);
    try {
      const { valor, ...resto } = f;
      const corpo = { ...resto, valor_causa_centavos: moedaParaCentavos(valor) };
      const r = processo ? await api<{ processo: Processo }>("PUT", `/api/processos/${processo.id}`, corpo) : await api<{ processo: Processo }>("POST", "/api/processos", corpo);
      aoSalvar(r.processo);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={processo ? "Editar processo" : "Novo processo"} descricao="Número CNJ e fase são obrigatórios. As partes, os responsáveis e os andamentos são adicionados depois de salvar.">
      <Formulario aoEnviar={() => void salvar()}>
        <Entrada rotulo="Número do processo (CNJ)" required inputMode="numeric" autoComplete="off" placeholder="0000000-00.0000.0.00.0000" erro={mostrar("numero_cnj")} ajuda="Pode digitar só os números; os pontos e o traço entram sozinhos." {...campo("numero_cnj", mascaraCnj)} />
        <div className="grade grade-2">
          <Selecao rotulo="Fase" required erro={mostrar("fase")} {...campo("fase")}>
            <option value="">Selecione</option>
            {FASES.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </Selecao>
          <Entrada rotulo="Data de distribuição (opcional)" type="date" max={hojeIso()} {...campo("data_distribuicao")} />
          <Entrada rotulo="Tribunal (opcional)" maxLength={100} autoComplete="off" placeholder="Ex.: TJSP" {...campo("tribunal")} />
          <Entrada rotulo="Comarca (opcional)" maxLength={100} autoComplete="off" {...campo("comarca")} />
          <Entrada rotulo="Órgão ou vara (opcional)" maxLength={150} autoComplete="off" {...campo("orgao")} />
          <Entrada rotulo="Área (opcional)" maxLength={80} autoComplete="off" {...campo("area")} />
          <Entrada rotulo="Classe (opcional)" maxLength={150} autoComplete="off" {...campo("classe")} />
          <Entrada rotulo="Assunto (opcional)" maxLength={200} autoComplete="off" {...campo("assunto")} />
          <Entrada rotulo="Valor da causa em R$ (opcional)" inputMode="numeric" autoComplete="off" placeholder="0,00" {...campo("valor", mascaraMoeda)} />
        </div>
        <AreaTexto rotulo="Observações (opcional)" maxLength={2000} {...campo("observacoes")} />
        {erro && <Aviso>{erro}</Aviso>}
        <div className="modal-rodape">
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" carregando={salvando}>
            Salvar processo
          </Botao>
        </div>
      </Formulario>
    </Modal>
  );
}
