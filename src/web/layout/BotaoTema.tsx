import { Monitor, Moon, Sun } from "lucide-react";
import { Botao } from "../ui";
import { useTema } from "../tema";
import type { PreferenciaTema } from "../tema";

const PROXIMO: Record<PreferenciaTema, PreferenciaTema> = { sistema: "claro", claro: "escuro", escuro: "sistema" };
const ROTULO: Record<PreferenciaTema, string> = { sistema: "Tema do sistema", claro: "Tema claro", escuro: "Tema escuro" };
const ICONE = { sistema: Monitor, claro: Sun, escuro: Moon };

/** Botão que alterna sistema, claro e escuro (usado nas telas de acesso). */
export function BotaoTema() {
  const { preferencia, definir } = useTema();
  const Icone = ICONE[preferencia];
  return (
    <Botao variante="fantasma" somenteIcone aria-label={`${ROTULO[preferencia]}. Alternar para ${ROTULO[PROXIMO[preferencia]].toLowerCase()}`} title={ROTULO[preferencia]} onClick={() => definir(PROXIMO[preferencia])}>
      <Icone size={20} aria-hidden="true" />
    </Botao>
  );
}
