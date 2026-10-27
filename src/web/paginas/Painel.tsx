import { Building2, CircleCheck, CirclePause, CircleX, FlaskConical, Plus, TriangleAlert, UsersRound } from "lucide-react";
import { ROTULO_PLANO, formatarDia } from "../api";
import type { Plano } from "../api";
import { contarPorPlano, contarPorStatus, novosNosUltimosDias, serieMensal, testesVencendo, totalUsuarios } from "../painel";
import { Link } from "../roteador";
import { Abas, Barras, Botao, CabecalhoPagina, Cartao, EsqueletoKpi, EsqueletoLinhas, EstadoErro, EstadoVazio, Empilhada, Indicador, Linha, Medidor, Selo, Sparkline } from "../ui";
import { TabelaEscritorios, useEscritorios, useModaisEscritorios } from "./escritorios-comum";

const ORDEM_PLANOS: Plano[] = ["solo", "escritorio", "banca"];
// Planos têm ordem natural (Individual < Equipe < Sociedade): usam a rampa ORDINAL, não cores de identidade.
const COR_PLANO: Record<Plano, string> = { solo: "var(--ordinal-1)", escritorio: "var(--ordinal-2)", banca: "var(--ordinal-3)" };

export function Painel() {
  const g = useEscritorios();
  const m = useModaisEscritorios(g);
  const agora = new Date();
  const { lista, estado } = g;

  const porStatus = contarPorStatus(lista);
  const porPlano = contarPorPlano(lista);
  const usuarios = totalUsuarios(lista);
  const serie = serieMensal(lista, agora, 12);
  const ultimos6 = serie.slice(-6);
  const novos30 = novosNosUltimosDias(lista, agora);
  const vencendo = testesVencendo(lista, agora);
  const encerrados = porStatus.suspenso + porStatus.cancelado;
  const pctAtivos = lista.length > 0 ? Math.round((porStatus.ativo / lista.length) * 100) : 0;

  const acoes = (
    <Botao onClick={m.abrirNovo}>
      <Plus size={18} aria-hidden="true" />
      Novo escritório
    </Botao>
  );

  return (
    <>
      <CabecalhoPagina titulo="Painel" descricao="Visão geral dos escritórios da plataforma." acoes={acoes} />

      {estado === "erro" ? (
        <Cartao>
          <EstadoErro acao={<Botao variante="secundario" onClick={() => void g.recarregar()}>Tentar de novo</Botao>}>{g.mensagemErro}</EstadoErro>
        </Cartao>
      ) : (
        <>
          <section aria-label="Indicadores" className="grade grade-kpi">
            {estado === "carregando" ? (
              Array.from({ length: 5 }, (_, i) => <EsqueletoKpi key={i} />)
            ) : (
              <>
                <Indicador
                  rotulo="Total de escritórios"
                  valor={lista.length}
                  icone={Building2}
                  variacao={{ valor: novos30, periodo: "em 30 dias" }}
                  tendencia={<Sparkline valores={serie.map((p) => p.acumulado)} rotulo={`Total de escritórios nos últimos 12 meses: de ${serie[0]?.acumulado ?? 0} para ${lista.length}`} />}
                />
                <Indicador rotulo="Ativos" valor={porStatus.ativo} icone={CircleCheck}>
                  <Medidor rotulo="Do total de escritórios" valor={porStatus.ativo} maximo={Math.max(1, lista.length)} texto={`${pctAtivos}%`} />
                </Indicador>
                <Indicador rotulo="Em teste" valor={porStatus.teste} icone={FlaskConical} nota={vencendo.length > 0 ? `${vencendo.length} vencem em até 7 dias` : "Nenhum vence em 7 dias"} />
                <Indicador rotulo="Suspensos ou cancelados" valor={encerrados} icone={CirclePause} nota={`${porStatus.suspenso} suspensos · ${porStatus.cancelado} cancelados`} />
                <Indicador rotulo="Total de usuários" valor={usuarios} icone={UsersRound} nota={lista.length > 0 ? `Em ${lista.length} escritórios` : undefined} />
              </>
            )}
          </section>

          {estado === "ok" && lista.length === 0 ? (
            <Cartao>
              <EstadoVazio icone={Building2} titulo="Nenhum escritório cadastrado ainda" acao={acoes}>
                Crie o primeiro escritório para ver os indicadores e gráficos aqui.
              </EstadoVazio>
            </Cartao>
          ) : (
            <>
              <div className="grade grade-2">
                <Cartao>
                  <Barras
                    titulo="Escritórios por plano"
                    subtitulo="Quantidade de escritórios em cada plano"
                    medida="Escritórios"
                    categoria="Plano"
                    dados={ORDEM_PLANOS.map((p) => ({ chave: p, rotulo: ROTULO_PLANO[p], valor: porPlano[p], cor: COR_PLANO[p] }))}
                  />
                </Cartao>
                <Cartao>
                  <Empilhada
                    titulo="Escritórios por situação"
                    subtitulo="Como a base está distribuída hoje"
                    medida="Escritórios"
                    categoria="Situação"
                    segmentos={[
                      { chave: "ativo", rotulo: "Ativos", valor: porStatus.ativo, cor: "var(--grafico-bom)", icone: CircleCheck },
                      { chave: "teste", rotulo: "Em teste", valor: porStatus.teste, cor: "var(--grafico-neutro)", icone: FlaskConical, textoEscuro: true },
                      { chave: "suspenso", rotulo: "Suspensos", valor: porStatus.suspenso, cor: "var(--grafico-aviso)", icone: CirclePause, textoEscuro: true },
                      { chave: "cancelado", rotulo: "Cancelados", valor: porStatus.cancelado, cor: "var(--grafico-critico)", icone: CircleX },
                    ]}
                  />
                </Cartao>
              </div>

              <div className="grade grade-60-40">
                <Cartao>
                  <Abas
                    abas={[
                      {
                        id: "mes",
                        rotulo: "Criados por mês",
                        conteudo: (
                          <Barras
                            titulo="Escritórios criados por mês"
                            subtitulo="Últimos 6 meses, pela data de criação"
                            medida="Escritórios criados"
                            categoria="Mês"
                            orientacao="vertical"
                            dados={ultimos6.map((p) => ({ chave: p.chave, rotulo: p.curto, valor: p.criados }))}
                          />
                        ),
                      },
                      {
                        id: "acumulado",
                        rotulo: "Total acumulado",
                        conteudo: (
                          <Linha
                            titulo="Escritórios cadastrados (acumulado)"
                            subtitulo="Últimos 12 meses. Não desconta os cancelados."
                            categoria="Mês"
                            categorias={serie.map((p) => p.curto)}
                            categoriasLongas={serie.map((p) => p.longo)}
                            area
                            series={[{ chave: "total", rotulo: "Escritórios", cor: "var(--serie-1)", valores: serie.map((p) => p.acumulado) }]}
                          />
                        ),
                      },
                    ]}
                  />
                </Cartao>
                <Cartao titulo="Testes que vencem nos próximos 7 dias" subtitulo="Escritórios em teste grátis perto do fim" semPadding>
                  {estado === "carregando" ? (
                    <EsqueletoLinhas linhas={3} />
                  ) : vencendo.length === 0 ? (
                    <EstadoVazio compacto icone={CircleCheck} titulo="Nenhum teste vence nos próximos 7 dias" />
                  ) : (
                    <ul className="lista-linhas">
                      {vencendo.map(({ escritorio, dias }) => (
                        <li key={escritorio.id}>
                          <div style={{ minWidth: 0 }}>
                            <strong style={{ display: "block", overflowWrap: "anywhere" }}>{escritorio.nome}</strong>
                            <small className="texto-pequeno">Teste até {formatarDia(escritorio.teste_ate)}</small>
                          </div>
                          {dias < 0 ? (
                            <Selo tom="critico" icone={TriangleAlert}>
                              Vencido há {Math.abs(dias)} {Math.abs(dias) === 1 ? "dia" : "dias"}
                            </Selo>
                          ) : dias === 0 ? (
                            <Selo tom="aviso" icone={TriangleAlert}>
                              Vence hoje
                            </Selo>
                          ) : (
                            <Selo tom="aviso" icone={FlaskConical}>
                              {dias} {dias === 1 ? "dia" : "dias"}
                            </Selo>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </Cartao>
              </div>

              <Cartao titulo="Escritórios" subtitulo="Os cinco mais recentes" acoes={<Link para="/escritorios" className="btn btn-secundario btn-pequeno">Ver todos</Link>} semPadding>
                {estado === "carregando" ? <EsqueletoLinhas linhas={4} /> : <TabelaEscritorios linhas={[...lista].sort((a, b) => b.criado_em.localeCompare(a.criado_em)).slice(0, 5)} g={g} m={m} />}
              </Cartao>
            </>
          )}
        </>
      )}
      {m.modais}
    </>
  );
}
