import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { EVENTO_INTIMACOES } from "../paginas/intimacoes-comum";

const INTERVALO_MS = 5 * 60 * 1000;
const MIN_ENTRE_CONSULTAS_MS = 30 * 1000;

/** Quantidade de intimações não lidas (selo do menu). Consulta ao abrir, a cada 5 minutos, ao voltar o foco e quando uma tela marca algo como lido. Sem popup. */
export function useContagemIntimacoes(ativo: boolean): number {
  const [total, setTotal] = useState(0);
  const ultima = useRef(0);

  const consultar = useCallback(async () => {
    ultima.current = Date.now();
    try {
      const r = await api<{ nao_lidas: number }>("GET", "/api/intimacoes/contagem");
      setTotal(r.nao_lidas);
    } catch {
      /* o selo é um extra: tenta de novo na próxima vez */
    }
  }, []);

  useEffect(() => {
    if (!ativo) return;
    void consultar();
    const relogio = window.setInterval(() => void consultar(), INTERVALO_MS);
    const aoVoltar = () => {
      if (document.visibilityState === "visible" && Date.now() - ultima.current > MIN_ENTRE_CONSULTAS_MS) void consultar();
    };
    const aoMudar = () => void consultar();
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    window.addEventListener(EVENTO_INTIMACOES, aoMudar);
    return () => {
      window.clearInterval(relogio);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
      window.removeEventListener(EVENTO_INTIMACOES, aoMudar);
    };
  }, [ativo, consultar]);

  return total;
}
