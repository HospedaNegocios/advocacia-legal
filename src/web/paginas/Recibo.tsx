import { Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { ErroApi, api } from "../api";
import { mascaraCep, mascaraDocumento, mascaraTelefone } from "../mascaras";
import { Botao, CabecalhoPagina, EsqueletoLinhas, EstadoErro, Marca } from "../ui";
import { dataPorExtenso, formatarDataCivil, formatarReais, rotuloProcesso } from "./financeiro-comum";
import type { Recibo as DadosRecibo } from "./financeiro-comum";

function enderecoDoEscritorio(e: DadosRecibo["escritorio"]): string {
  const rua = [e.logradouro, e.numero, e.complemento].filter(Boolean).join(", ");
  const cidade = [e.cidade, e.uf].filter(Boolean).join("/");
  return [rua, e.bairro, cidade, e.cep ? `CEP ${mascaraCep(e.cep)}` : ""].filter(Boolean).join(" · ");
}

/**
 * Recibo de uma receita paga, para imprimir ou salvar em PDF pelo navegador (Imprimir → "Salvar como PDF").
 * Texto simples, sem cláusulas: "Recebi de ... a quantia de ... referente a ...". Na impressão só o recibo aparece (ver financeiro.css).
 */
export function Recibo({ id }: { id: string }) {
  const [recibo, setRecibo] = useState<DadosRecibo | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    setRecibo(null);
    setErro("");
    api<{ recibo: DadosRecibo }>("GET", `/api/financeiro/${id}/recibo`)
      .then((r) => ativo && setRecibo(r.recibo))
      .catch((e) => ativo && setErro(e instanceof ErroApi ? e.message : "Algo deu errado."));
    return () => {
      ativo = false;
    };
  }, [id]);

  const imprimir = (
    <Botao leitura disabled={!recibo} onClick={() => window.print()}>
      <Printer size={18} aria-hidden="true" />
      Imprimir ou salvar em PDF
    </Botao>
  );

  return (
    <>
      <div className="recibo-cabecalho-tela">
        <CabecalhoPagina titulo="Recibo" descricao="Confira os dados e use o botão para imprimir ou salvar em PDF." migalhas={[{ rotulo: "Início", para: "/" }, { rotulo: "Financeiro", para: "/financeiro" }, { rotulo: "Recibo" }]} acoes={imprimir} />
      </div>
      {erro ? (
        <EstadoErro>{erro}</EstadoErro>
      ) : !recibo ? (
        <EsqueletoLinhas linhas={6} />
      ) : (
        <ReciboPagina r={recibo} />
      )}
    </>
  );
}

function ReciboPagina({ r }: { r: DadosRecibo }) {
  const e = r.escritorio;
  const nomeEscritorio = e.razao_social || e.nome;
  const endereco = enderecoDoEscritorio(e);
  const contato = [e.telefone ? mascaraTelefone(e.telefone) : "", e.email_contato].filter(Boolean).join(" · ");
  return (
    <article className="recibo" aria-label="Recibo">
      <header className="recibo-topo">
        <div className="recibo-escritorio">
          <strong>{nomeEscritorio}</strong>
          {e.documento && <span>{mascaraDocumento(e.documento)}</span>}
          {endereco && <span>{endereco}</span>}
          {contato && <span>{contato}</span>}
        </div>
        <div className="recibo-marca" aria-label="advocacia.legal">
          <span className="marca-logo">
            <Marca tamanhoSelo={16} />
          </span>
        </div>
      </header>
      <h2 className="recibo-titulo">Recibo</h2>
      <p className="recibo-valor">{formatarReais(r.valor_centavos)}</p>
      <p className="recibo-texto">
        Recebi de{" "}
        {r.pagador ? (
          <strong>
            {r.pagador.nome}
            {r.pagador.documento ? `, ${mascaraDocumento(r.pagador.documento)}` : ""}
          </strong>
        ) : (
          <span className="recibo-lacuna" aria-label="nome do pagador em branco" />
        )}
        , a quantia de{" "}
        <strong>
          {formatarReais(r.valor_centavos)} ({r.valor_extenso})
        </strong>
        , referente a <strong>{r.descricao}</strong>
        {r.processo_numero ? <>, processo nº {rotuloProcesso(r.processo_numero)}</> : null}.
      </p>
      <p className="recibo-texto">
        Data do pagamento: <strong>{formatarDataCivil(r.pago_em)}</strong> ({dataPorExtenso(r.pago_em)}).
      </p>
      <div className="recibo-assinatura">
        <div className="recibo-linha" />
        <span>{nomeEscritorio}</span>
        {e.documento && <span>{mascaraDocumento(e.documento)}</span>}
      </div>
      <footer className="recibo-rodape">Referência {r.referencia} · documento gerado por advocacia.legal</footer>
    </article>
  );
}
