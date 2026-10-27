import type { ReactNode } from "react";

export interface Coluna<T> {
  chave: string;
  titulo: string;
  render: (linha: T) => ReactNode;
  /** Alinha à direita e usa algarismos tabulares. */
  numerica?: boolean;
  /** Célula de destaque: no celular ocupa a largura toda, sem rótulo. */
  principal?: boolean;
  /** Coluna de botões: no celular ocupa a largura toda, sem rótulo. */
  acoes?: boolean;
  /** Não quebra a linha da célula (datas). */
  nowrap?: boolean;
}

/**
 * Tabela responsiva: até 767px cada linha vira um cartão empilhado com o título da coluna como rótulo.
 * `legenda` é lida por leitores de tela (a tela não mostra).
 */
export function Tabela<T>({ colunas, linhas, chaveLinha, legenda }: { colunas: Coluna<T>[]; linhas: T[]; chaveLinha: (l: T) => string; legenda: string }) {
  return (
    <div className="tabela-envolve">
      <table className="tabela tabela-cartoes">
        <caption className="so-leitor">{legenda}</caption>
        <thead>
          <tr>
            {colunas.map((c) => (
              <th key={c.chave} scope="col" className={c.numerica ? "num" : undefined}>
                {c.acoes ? <span className="so-leitor">{c.titulo}</span> : c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={chaveLinha(l)}>
              {colunas.map((c) => (
                <td
                  key={c.chave}
                  className={[c.numerica ? "num" : "", c.nowrap ? "nowrap" : ""].filter(Boolean).join(" ") || undefined}
                  {...(c.principal ? { "data-principal": "" } : c.acoes ? { "data-acoes": "" } : { "data-rotulo": c.titulo })}
                >
                  {c.render(l)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
