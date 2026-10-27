import { BellRing } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { assinaturaDosPrazos, deveAvisar, gravarDispensa, lerDispensa } from "../alertas-prazos";
import type { RespostaAlertas } from "../alertas-prazos";
import { SeloPrazo, dataFatalTexto } from "../paginas/agenda-comum";
import { cnjFormatado } from "../paginas/processos-comum";
import { Link } from "../roteador";
import { Botao, Modal } from "../ui";
import { classeBotao } from "../ui/Botao";

const INTERVALO_MS = 15 * 60 * 1000;
const MIN_ENTRE_CONSULTAS_MS = 30 * 1000;

/**
 * Consulta os prazos do usuário ao abrir, a cada 15 minutos e quando a aba volta a ter foco.
 * `aberto` diz se o aviso deve aparecer; `dispensar` guarda no navegador (por usuário e dia) o que ele já viu.
 */
export function useAlertasPrazos(ativo: boolean, usuarioId: string) {
  const [dados, setDados] = useState<RespostaAlertas | null>(null);
  const [aberto, setAberto] = useState(false);
  const ultima = useRef(0);
  // Se o navegador não guarda dados, lembramos pelo menos durante esta visita.
  const naMemoria = useRef<string | null>(null);

  const consultar = useCallback(async () => {
    ultima.current = Date.now();
    try {
      const r = await api<RespostaAlertas & { ok: boolean }>("GET", "/api/alertas/prazos");
      setDados({ hoje: r.hoje, total: r.total, prazos: r.prazos });
      const dispensada = naMemoria.current ?? lerDispensa(usuarioId, r.hoje);
      if (deveAvisar(r.prazos, dispensada)) setAberto(true);
      else if (r.prazos.length === 0) setAberto(false);
    } catch {
      /* o aviso é um extra: se falhar, tenta de novo na próxima vez */
    }
  }, [usuarioId]);

  useEffect(() => {
    if (!ativo) return;
    void consultar();
    const relogio = window.setInterval(() => void consultar(), INTERVALO_MS);
    const aoVoltar = () => {
      if (document.visibilityState === "visible" && Date.now() - ultima.current > MIN_ENTRE_CONSULTAS_MS) void consultar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      window.clearInterval(relogio);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [ativo, consultar]);

  const dispensar = useCallback(() => {
    setAberto(false);
    if (!dados) return;
    const assinatura = assinaturaDosPrazos(dados.prazos);
    naMemoria.current = assinatura;
    gravarDispensa(usuarioId, dados.hoje, assinatura);
  }, [dados, usuarioId]);

  return { dados, aberto: aberto && !!dados && dados.prazos.length > 0, dispensar, contagem: dados?.total ?? 0 };
}

export function AvisoDePrazos({ dados, aberto, aoFechar }: { dados: RespostaAlertas | null; aberto: boolean; aoFechar: () => void }) {
  if (!dados) return null;
  const { prazos, total } = dados;
  const resto = total - prazos.length;
  return (
    <Modal aberto={aberto} aoFechar={aoFechar} titulo="Prazos que pedem a sua atenção" descricao={`${total === 1 ? "1 prazo seu está vencido ou vence" : `${total} prazos seus estão vencidos ou vencem`} hoje ou amanhã.`}>
      <ul className="inicio-lista" aria-label="Prazos que pedem atenção">
        {prazos.map((p) => (
          <li key={p.id} className="inicio-item">
            <div className="inicio-item-texto">
              <strong>{p.titulo}</strong>
              <small>
                {dataFatalTexto(p)}
                {p.processo_numero && p.processo_id ? (
                  <>
                    {" · "}
                    <Link para={`/processos/${p.processo_id}`} aoNavegar={aoFechar}>
                      Processo {cnjFormatado(p.processo_numero)}
                    </Link>
                  </>
                ) : null}
              </small>
            </div>
            <SeloPrazo prazo={p} />
          </li>
        ))}
      </ul>
      {resto > 0 && <p className="inicio-vazio">E mais {resto === 1 ? "1 prazo" : `${resto} prazos`}. Veja todos na tela de prazos.</p>}
      <div className="modal-rodape">
        <Botao variante="secundario" onClick={aoFechar}>
          Entendi
        </Botao>
        <Link para="/prazos" className={classeBotao("primario", "medio", false, false)} aoNavegar={aoFechar}>
          <BellRing size={16} aria-hidden="true" />
          Ver meus prazos
        </Link>
      </div>
    </Modal>
  );
}
