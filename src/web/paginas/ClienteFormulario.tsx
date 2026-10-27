import { useEffect, useState } from "react";
import { ErroApi, api } from "../api";
import { mascaraCep, mascaraDocumento, mascaraTelefone, soDigitos } from "../mascaras";
import { AreaTexto, Aviso, Botao, Entrada, Formulario, Modal, Selecao } from "../ui";
import { UFS, cepFormatado, documentoFormatado, telefoneFormatado } from "./clientes-comum";
import type { Cliente } from "./clientes-comum";

type Campos = {
  tipo: "pf" | "pj";
  nome: string;
  nome_fantasia: string;
  documento: string;
  rg: string;
  inscricao_estadual: string;
  data_nascimento: string;
  email: string;
  telefone: string;
  celular: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  observacoes: string;
};

function inicial(c: Cliente | null): Campos {
  return {
    tipo: c?.tipo ?? "pf",
    nome: c?.nome ?? "",
    nome_fantasia: c?.nome_fantasia ?? "",
    documento: c?.documento ? documentoFormatado(c) : "",
    rg: c?.rg ?? "",
    inscricao_estadual: c?.inscricao_estadual ?? "",
    data_nascimento: c?.data_nascimento ?? "",
    email: c?.email ?? "",
    telefone: c ? telefoneFormatado(c.telefone).replace("—", "") : "",
    celular: c ? telefoneFormatado(c.celular).replace("—", "") : "",
    cep: c ? cepFormatado(c.cep) : "",
    logradouro: c?.logradouro ?? "",
    numero: c?.numero ?? "",
    complemento: c?.complemento ?? "",
    bairro: c?.bairro ?? "",
    cidade: c?.cidade ?? "",
    uf: c?.uf ?? "",
    observacoes: c?.observacoes ?? "",
  };
}

/** Cadastro de cliente (novo ou edição) em janela. Devolve o cliente salvo. */
export function ClienteFormulario({ aberto, cliente, aoFechar, aoSalvar }: { aberto: boolean; cliente: Cliente | null; aoFechar: () => void; aoSalvar: (c: Cliente) => void }) {
  const [f, setF] = useState<Campos>(inicial(cliente));
  const [erro, setErro] = useState("");
  const [tentou, setTentou] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (aberto) {
      setF(inicial(cliente));
      setErro("");
      setTentou(false);
    }
  }, [aberto, cliente]);

  const pf = f.tipo === "pf";
  const d = soDigitos;
  const erros = {
    nome: f.nome.trim() ? undefined : pf ? "Informe o nome completo." : "Informe a razão social.",
    documento: f.documento && d(f.documento).length !== (pf ? 11 : 14) ? (pf ? "O CPF tem 11 dígitos." : "O CNPJ tem 14 dígitos.") : undefined,
    telefone: f.telefone && ![10, 11].includes(d(f.telefone).length) ? "Informe o DDD e o número." : undefined,
    celular: f.celular && ![10, 11].includes(d(f.celular).length) ? "Informe o DDD e o número." : undefined,
    cep: f.cep && d(f.cep).length !== 8 ? "O CEP tem 8 dígitos." : undefined,
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
      const r = cliente ? await api<{ cliente: Cliente }>("PUT", `/api/clientes/${cliente.id}`, f) : await api<{ cliente: Cliente }>("POST", "/api/clientes", f);
      aoSalvar(r.cliente);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : "Algo deu errado.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo={cliente ? "Editar cliente" : "Novo cliente"} descricao="Só o nome é obrigatório. Os outros dados podem ser preenchidos depois.">
      <Formulario aoEnviar={() => void salvar()}>
        <Selecao rotulo="Tipo de cliente" value={f.tipo} disabled={cliente !== null} ajuda={cliente ? "O tipo não pode ser trocado depois de salvo." : undefined} onChange={(e) => setF({ ...f, tipo: e.target.value === "pj" ? "pj" : "pf", documento: "" })}>
          <option value="pf">Pessoa física</option>
          <option value="pj">Pessoa jurídica</option>
        </Selecao>
        <div className="grade grade-2">
          <Entrada rotulo={pf ? "Nome completo" : "Razão social"} required maxLength={150} autoComplete="off" erro={mostrar("nome")} {...campo("nome")} />
          {pf ? <Entrada rotulo="CPF (opcional)" inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" erro={mostrar("documento")} {...campo("documento", mascaraDocumento)} /> : <Entrada rotulo="CNPJ (opcional)" inputMode="numeric" autoComplete="off" placeholder="00.000.000/0000-00" erro={mostrar("documento")} {...campo("documento", mascaraDocumento)} />}
          {pf ? (
            <>
              <Entrada rotulo="RG (opcional)" maxLength={30} {...campo("rg")} />
              <Entrada rotulo="Data de nascimento (opcional)" type="date" max={new Date().toISOString().slice(0, 10)} {...campo("data_nascimento")} />
            </>
          ) : (
            <>
              <Entrada rotulo="Nome fantasia (opcional)" maxLength={150} {...campo("nome_fantasia")} />
              <Entrada rotulo="Inscrição estadual (opcional)" maxLength={30} {...campo("inscricao_estadual")} />
            </>
          )}
          <Entrada rotulo="E-mail (opcional)" type="email" autoComplete="off" maxLength={254} {...campo("email")} />
          <Entrada rotulo="Telefone (opcional)" type="tel" inputMode="tel" autoComplete="off" placeholder="(00) 0000-0000" erro={mostrar("telefone")} {...campo("telefone", mascaraTelefone)} />
          <Entrada rotulo="Celular (opcional)" type="tel" inputMode="tel" autoComplete="off" placeholder="(00) 00000-0000" erro={mostrar("celular")} {...campo("celular", mascaraTelefone)} />
        </div>
        <h3 className="subtitulo-form">Endereço</h3>
        <div className="grade grade-2">
          <Entrada rotulo="CEP" inputMode="numeric" autoComplete="off" placeholder="00000-000" erro={mostrar("cep")} {...campo("cep", mascaraCep)} />
          <Entrada rotulo="Logradouro" maxLength={150} autoComplete="off" {...campo("logradouro")} />
          <Entrada rotulo="Número" maxLength={20} autoComplete="off" {...campo("numero")} />
          <Entrada rotulo="Complemento" maxLength={80} autoComplete="off" {...campo("complemento")} />
          <Entrada rotulo="Bairro" maxLength={80} autoComplete="off" {...campo("bairro")} />
          <Entrada rotulo="Cidade" maxLength={80} autoComplete="off" {...campo("cidade")} />
          <Selecao rotulo="UF" value={f.uf} onChange={(e) => setF({ ...f, uf: e.target.value })}>
            <option value="">Selecione</option>
            {UFS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Selecao>
        </div>
        <AreaTexto rotulo="Observações (opcional)" maxLength={2000} {...campo("observacoes")} />
        {erro && <Aviso>{erro}</Aviso>}
        <div className="modal-rodape">
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" carregando={salvando}>
            Salvar cliente
          </Botao>
        </div>
      </Formulario>
    </Modal>
  );
}
