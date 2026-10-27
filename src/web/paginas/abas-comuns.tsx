import { Download, FileText, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ErroApi, api, enviarArquivo, formatarData } from "../api";
import { Botao, Confirmar, EsqueletoLinhas, EstadoErro, EstadoVazio, useToast } from "../ui";
import { tamanhoLegivel } from "./clientes-comum";
import type { Anexo } from "./clientes-comum";

/** Par rótulo/valor das telas de detalhe. Valor vazio aparece como "—". */
export function Dado({ rotulo, valor }: { rotulo: string; valor: string | null | undefined }) {
  return (
    <div>
      <dt>{rotulo}</dt>
      <dd>{valor && valor.trim() !== "" ? valor : "—"}</dd>
    </div>
  );
}

/**
 * Aba de documentos, igual para cliente e processo. `base` é a rota do registro (ex.: /api/clientes/ID).
 * `editavel` é falso quando o registro está desativado (somente leitura). Só o sócio apaga.
 */
export function AbaDocumentos({ base, editavel, ehSocio, texto }: { base: string; editavel: boolean; ehSocio: boolean; texto: { vazio: string; lista: string } }) {
  const { avisar } = useToast();
  const [lista, setLista] = useState<Anexo[] | null>(null);
  const [maximo, setMaximo] = useState(7 * 1024 * 1024);
  const [erroCarga, setErroCarga] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [apagando, setApagando] = useState<Anexo | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await api<{ anexos: Anexo[]; tamanho_maximo: number }>("GET", `${base}/anexos`);
      setLista(r.anexos);
      setMaximo(r.tamanho_maximo);
      setErroCarga("");
    } catch (e) {
      setErroCarga(e instanceof ErroApi ? e.message : "Algo deu errado.");
    }
  }, [base]);
  useEffect(() => void carregar(), [carregar]);

  const enviar = async (arquivo: File | undefined) => {
    if (!arquivo) return;
    if (arquivo.size > maximo) {
      avisar(`O arquivo é maior que ${maximo / 1024 / 1024} MB. Reduza o arquivo e tente de novo.`, "erro");
      return;
    }
    setEnviando(true);
    try {
      await enviarArquivo(`${base}/anexos`, arquivo);
      avisar("Documento enviado.");
      await carregar();
    } catch (e) {
      avisar(e instanceof ErroApi ? e.message : "Algo deu errado.", "erro");
    } finally {
      setEnviando(false);
      if (entrada.current) entrada.current.value = "";
    }
  };

  const baixar = async (a: Anexo) => {
    try {
      // O link vale 5 minutos; o navegador baixa o arquivo sem sair da tela.
      const r = await api<{ url: string }>("GET", `${base}/anexos/${a.id}/link`);
      window.location.assign(r.url);
    } catch (e) {
      avisar(e instanceof ErroApi ? e.message : "Algo deu errado.", "erro");
    }
  };

  const apagar = async (a: Anexo) => {
    setApagando(null);
    try {
      await api("DELETE", `${base}/anexos/${a.id}`);
      avisar("Documento apagado.");
    } catch (e) {
      avisar(e instanceof ErroApi ? e.message : "Algo deu errado.", "erro");
    }
    await carregar();
  };

  if (erroCarga) return <EstadoErro acao={<Botao variante="secundario" onClick={() => void carregar()}>Tentar de novo</Botao>}>{erroCarga}</EstadoErro>;
  if (lista === null) return <EsqueletoLinhas linhas={3} />;

  const botaoEnviar = editavel ? (
    <>
      <input ref={entrada} className="so-leitor-input" type="file" tabIndex={-1} aria-hidden="true" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx" onChange={(e) => void enviar(e.target.files?.[0])} />
      <Botao carregando={enviando} onClick={() => entrada.current?.click()}>
        <Upload size={18} aria-hidden="true" />
        Enviar documento
      </Botao>
    </>
  ) : null;

  return (
    <div className="pilha">
      <div className="abas-acao">
        <p className="texto-pequeno" style={{ margin: 0 }}>
          PDF, imagem (JPEG, PNG, WEBP), Word ou Excel, de até {maximo / 1024 / 1024} MB cada.
        </p>
        {lista.length > 0 && botaoEnviar}
      </div>
      {lista.length === 0 ? (
        <EstadoVazio icone={FileText} titulo="Nenhum documento enviado" {...(botaoEnviar ? { acao: botaoEnviar } : {})}>
          {texto.vazio}
        </EstadoVazio>
      ) : (
        <ul className="lista-simples" aria-label={texto.lista}>
          {lista.map((a) => (
            <li key={a.id} className="item-lista">
              <div className="item-lista-texto">
                <strong>{a.nome}</strong>
                <small>
                  {tamanhoLegivel(a.tamanho_bytes)} · enviado em {formatarData(a.criado_em)}
                </small>
              </div>
              <div className="tabela-acoes">
                <Botao tamanho="pequeno" variante="secundario" onClick={() => void baixar(a)} aria-label={`Baixar ${a.nome}`}>
                  <Download size={16} aria-hidden="true" />
                  Baixar
                </Botao>
                {ehSocio && editavel && (
                  <Botao tamanho="pequeno" variante="perigo" onClick={() => setApagando(a)} aria-label={`Apagar ${a.nome}`}>
                    <Trash2 size={16} aria-hidden="true" />
                    Apagar
                  </Botao>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Confirmar aberto={apagando !== null} aoFechar={() => setApagando(null)} titulo="Apagar documento" rotuloConfirmar="Apagar" perigo aoConfirmar={() => apagando && void apagar(apagando)}>
        Apagar {apagando?.nome}? O arquivo é removido de vez e essa ação não pode ser desfeita.
      </Confirmar>
    </div>
  );
}
