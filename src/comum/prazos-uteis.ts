// Contagem de prazos em dias úteis ou corridos, com explicação passo a passo.
// Módulo puro (sem banco, sem rede, sem biblioteca de datas): só Intl, como src/comum/fuso.ts.
// As regras e as fontes estão em docs/PRAZOS.md. REGRA 1 do CLAUDE.md: nada aqui é suposição jurídica.
// O resultado é um APOIO ao advogado, que sempre confere no calendário do tribunal e responde pelo prazo.

import { dataCivilValida, diferencaDias, somarDias } from "./fuso";

export type TipoContagem = "uteis" | "corridos";

/**
 * O que a data informada significa:
 * - `disponibilizacao`: data em que a intimação foi disponibilizada no Diário da Justiça eletrônico.
 *   A publicação é o primeiro dia útil seguinte (CPC art. 224 § 2º) e a contagem começa no primeiro dia útil
 *   depois da publicação (art. 224 § 3º).
 * - `publicacao`: data da publicação. A contagem começa no primeiro dia útil seguinte (art. 224 § 3º).
 * - `dia_do_comeco`: o "dia do começo do prazo" já definido pelo art. 231 (ex.: juntada do mandado ou do aviso
 *   de recebimento aos autos). O dia do começo é excluído (art. 224 caput).
 * - `consulta_eletronica`: data em que o intimado consultou a intimação eletrônica; o dia do começo é o
 *   dia útil seguinte à consulta (art. 231 V).
 */
export type TipoInicio = "disponibilizacao" | "publicacao" | "dia_do_comeco" | "consulta_eletronica";
export const TIPOS_INICIO: readonly TipoInicio[] = ["disponibilizacao", "publicacao", "dia_do_comeco", "consulta_eletronica"];

export type TipoDiaSemExpediente = "feriado_local" | "suspensao_tribunal" | "outro";
export const TIPOS_DIA_SEM_EXPEDIENTE: readonly TipoDiaSemExpediente[] = ["feriado_local", "suspensao_tribunal", "outro"];

export interface DiaSemExpediente {
  data: string;
  descricao: string;
  tipo: TipoDiaSemExpediente;
}

export type MotivoPulo = "fim_de_semana" | "feriado_nacional" | "dia_sem_expediente" | "suspensao_cpc";

export interface IntervaloPulado {
  de: string;
  ate: string;
  dias: number;
  motivo: MotivoPulo;
  descricao: string;
}

export interface EntradaCalculo {
  /** AAAA-MM-DD */
  data: string;
  tipoInicio: TipoInicio;
  dias: number;
  contagem: TipoContagem;
  /** Dias sem expediente cadastrados pelo escritório (feriado local, suspensão de tribunal etc.). */
  calendario?: readonly DiaSemExpediente[];
  /** Suspensão de 20/12 a 20/01 (CPC art. 220). Padrão: ligada. */
  aplicarSuspensao?: boolean;
}

export interface ResultadoCalculo {
  dataFinal: string;
  diaDoComeco: string;
  primeiroDiaContado: string;
  /** Datas contadas, na ordem (a última é o dia do vencimento, antes de eventual prorrogação). */
  diasContados: string[];
  /** Datas ignoradas desde a data informada até o vencimento, agrupadas em intervalos. */
  pulados: IntervaloPulado[];
  /** Explicação passo a passo em português. */
  passos: string[];
  /** Avisos fixos para o advogado conferir. */
  avisos: string[];
}

export type ResultadoOuErro = { ok: true; resultado: ResultadoCalculo } | { ok: false; erro: string };

export const DIAS_MAXIMO = 365;
export const ANO_MINIMO = 2016; // CPC/2015 em vigor desde 18/03/2016
export const ANO_MAXIMO = 2099;

export const AVISO_CONFERENCIA = "Confira o resultado com o calendário do seu tribunal; a responsabilidade pelo prazo é do advogado.";

// ---------- Feriados nacionais por lei ----------

export interface Feriado {
  data: string;
  descricao: string;
  /** Lei que institui o feriado nacional. */
  lei: string;
}

interface FeriadoFixo {
  mes: number;
  dia: number;
  descricao: string;
  lei: string;
  /** Primeiro ano em que vale na lista (quando a lei é recente). */
  desde: number;
}

// Fonte (todas em planalto.gov.br): Lei 662/1949 art. 1º (redação da Lei 10.607/2002), Lei 6.802/1980 e Lei 14.759/2023.
// Sexta-feira Santa, Carnaval e Corpus Christi NÃO estão aqui: não são feriados nacionais por lei (ver docs/PRAZOS.md).
const FERIADOS_FIXOS: readonly FeriadoFixo[] = [
  { mes: 1, dia: 1, descricao: "Confraternização Universal", lei: "Lei 662/1949", desde: ANO_MINIMO },
  { mes: 4, dia: 21, descricao: "Tiradentes", lei: "Lei 662/1949 (redação da Lei 10.607/2002)", desde: ANO_MINIMO },
  { mes: 5, dia: 1, descricao: "Dia do Trabalho", lei: "Lei 662/1949", desde: ANO_MINIMO },
  { mes: 9, dia: 7, descricao: "Independência do Brasil", lei: "Lei 662/1949", desde: ANO_MINIMO },
  { mes: 10, dia: 12, descricao: "Nossa Senhora Aparecida", lei: "Lei 6.802/1980", desde: ANO_MINIMO },
  { mes: 11, dia: 2, descricao: "Finados", lei: "Lei 662/1949 (redação da Lei 10.607/2002)", desde: ANO_MINIMO },
  { mes: 11, dia: 15, descricao: "Proclamação da República", lei: "Lei 662/1949", desde: ANO_MINIMO },
  // Lei 14.759, de 21/12/2023, em vigor na publicação (22/12/2023): o primeiro 20 de novembro afetado é o de 2024.
  { mes: 11, dia: 20, descricao: "Dia Nacional de Zumbi e da Consciência Negra", lei: "Lei 14.759/2023", desde: 2024 },
  { mes: 12, dia: 25, descricao: "Natal", lei: "Lei 662/1949", desde: ANO_MINIMO },
];

const dois = (n: number) => String(n).padStart(2, "0");

/** Feriados nacionais por lei federal no ano (ordenados por data). */
export function feriadosNacionais(ano: number): Feriado[] {
  return FERIADOS_FIXOS.filter((f) => ano >= f.desde).map((f) => ({ data: `${ano}-${dois(f.mes)}-${dois(f.dia)}`, descricao: f.descricao, lei: f.lei }));
}

// ---------- Dias móveis (Páscoa) — apenas SUGESTÕES para o calendário do escritório ----------

/** Domingo de Páscoa (calendário gregoriano; algoritmo de Meeus/Jones/Butcher), AAAA-MM-DD. */
export function pascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${dois(mes)}-${dois(dia)}`;
}

export interface SugestaoMovel {
  data: string;
  descricao: string;
  /** Em que se baseia a sugestão. NÃO é feriado nacional: o advogado confere e decide se adota. */
  base: string;
}

/**
 * Dias móveis que tribunais costumam tratar como sem expediente. NÃO entram no cálculo sozinhos:
 * o escritório escolhe quais cadastrar no calendário.
 * Bases: Lei 5.010/1966 art. 62 II e III (Justiça Federal: Semana Santa de quarta a domingo; segunda e terça de Carnaval);
 * Lei 9.093/1995 art. 2º (Sexta-Feira da Paixão como feriado religioso conforme a lei local); Corpus Christi sem lei nacional.
 */
export function sugestoesMoveis(ano: number): SugestaoMovel[] {
  const p = pascoa(ano);
  const JF = "Justiça Federal: Lei 5.010/1966, art. 62";
  return [
    { data: somarDias(p, -48), descricao: "Segunda-feira de Carnaval", base: `${JF}, III. Nos demais tribunais, depende de ato do tribunal` },
    { data: somarDias(p, -47), descricao: "Terça-feira de Carnaval", base: `${JF}, III. Nos demais tribunais, depende de ato do tribunal` },
    { data: somarDias(p, -4), descricao: "Quarta-feira da Semana Santa", base: `${JF}, II. Nos demais tribunais, depende de ato do tribunal` },
    { data: somarDias(p, -3), descricao: "Quinta-feira da Semana Santa", base: `${JF}, II. Nos demais tribunais, depende de ato do tribunal` },
    { data: somarDias(p, -2), descricao: "Sexta-feira Santa (Paixão)", base: `Lei 9.093/1995, art. 2º (feriado religioso conforme a lei local) e ${JF}, II` },
    { data: somarDias(p, 60), descricao: "Corpus Christi", base: "Sem lei nacional: depende de lei local ou de ato do tribunal" },
  ];
}

// ---------- Cálculo ----------

const NOMES_DIA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

function diaDaSemana(data: string): number {
  const [a, m, d] = data.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/** "sexta-feira, 03/10/2025" */
export function dataPorExtenso(data: string): string {
  const [a, m, d] = data.split("-");
  return `${NOMES_DIA[diaDaSemana(data)]}, ${d}/${m}/${a}`;
}

function dentroDaSuspensao(data: string): boolean {
  const mes = Number(data.slice(5, 7));
  const dia = Number(data.slice(8, 10));
  return (mes === 12 && dia >= 20) || (mes === 1 && dia <= 20);
}

interface Classe {
  motivo: MotivoPulo;
  descricao: string;
}

function criarClassificador(calendario: readonly DiaSemExpediente[]) {
  const proprios = new Map<string, DiaSemExpediente>();
  for (const d of calendario) if (dataCivilValida(d.data)) proprios.set(d.data, d);
  const nacionais = new Map<string, Feriado[]>();
  /** Por que o dia NÃO é dia útil (null = é dia útil). Suspensão do CPC não entra aqui: ela suspende o prazo, não o expediente. */
  const naoUtil = (data: string): Classe | null => {
    const dow = diaDaSemana(data);
    if (dow === 0 || dow === 6) return { motivo: "fim_de_semana", descricao: "Sábado e domingo (CPC art. 216)" };
    const ano = Number(data.slice(0, 4));
    let lista = nacionais.get(String(ano));
    if (!lista) {
      lista = feriadosNacionais(ano);
      nacionais.set(String(ano), lista);
    }
    const f = lista.find((x) => x.data === data);
    if (f) return { motivo: "feriado_nacional", descricao: `${f.descricao} (${f.lei})` };
    const p = proprios.get(data);
    if (p) return { motivo: "dia_sem_expediente", descricao: p.descricao };
    return null;
  };
  return naoUtil;
}

function proximoUtil(data: string, naoUtil: (d: string) => Classe | null): string {
  let d = somarDias(data, 1);
  while (naoUtil(d)) d = somarDias(d, 1);
  return d;
}

function agrupar(itens: { data: string; classe: Classe }[]): IntervaloPulado[] {
  const saida: IntervaloPulado[] = [];
  for (const { data, classe } of itens) {
    const ultimo = saida[saida.length - 1];
    if (ultimo && ultimo.motivo === classe.motivo && ultimo.descricao === classe.descricao && diferencaDias(ultimo.ate, data) === 1) {
      ultimo.ate = data;
      ultimo.dias += 1;
    } else {
      saida.push({ de: data, ate: data, dias: 1, motivo: classe.motivo, descricao: classe.descricao });
    }
  }
  return saida;
}

function validar(e: EntradaCalculo): string | null {
  if (!dataCivilValida(e.data)) return "Informe uma data válida.";
  const ano = Number(e.data.slice(0, 4));
  if (ano < ANO_MINIMO || ano > ANO_MAXIMO) return `A data deve estar entre ${ANO_MINIMO} e ${ANO_MAXIMO}.`;
  if (!TIPOS_INICIO.includes(e.tipoInicio)) return "Tipo de início inválido.";
  if (e.contagem !== "uteis" && e.contagem !== "corridos") return "Tipo de contagem inválido.";
  if (!Number.isInteger(e.dias) || e.dias < 1 || e.dias > DIAS_MAXIMO) return `A quantidade de dias deve ser um número inteiro de 1 a ${DIAS_MAXIMO}.`;
  return null;
}

/** Texto curto de intervalo para a explicação. */
function textoIntervalo(i: IntervaloPulado): string {
  const f = (d: string) => d.split("-").reverse().join("/");
  const quando = i.de === i.ate ? `${dataPorExtenso(i.de)}` : `de ${f(i.de)} a ${f(i.ate)} (${i.dias} dias)`;
  return `${quando}: ${i.descricao}`;
}

export function calcularPrazo(entrada: EntradaCalculo): ResultadoOuErro {
  const erro = validar(entrada);
  if (erro) return { ok: false, erro };
  const suspensao = entrada.aplicarSuspensao !== false;
  const naoUtil = criarClassificador(entrada.calendario ?? []);
  const passos: string[] = [];
  const todosPulados: { data: string; classe: Classe }[] = [];
  const registrarPulos = (de: string, ate: string) => {
    // dias estritamente entre `de` e `ate` que não são úteis
    for (let d = somarDias(de, 1); d < ate; d = somarDias(d, 1)) {
      const c = naoUtil(d);
      if (c) todosPulados.push({ data: d, classe: c });
    }
  };

  // 1) Dia do começo
  let diaDoComeco = entrada.data;
  if (entrada.tipoInicio === "disponibilizacao") {
    const publicacao = proximoUtil(entrada.data, naoUtil);
    passos.push(`Disponibilização no Diário da Justiça eletrônico: ${dataPorExtenso(entrada.data)}.`);
    passos.push(`Publicação: primeiro dia útil seguinte à disponibilização, ${dataPorExtenso(publicacao)} (CPC art. 224, § 2º).`);
    registrarPulos(entrada.data, publicacao);
    diaDoComeco = publicacao;
  } else if (entrada.tipoInicio === "consulta_eletronica") {
    diaDoComeco = proximoUtil(entrada.data, naoUtil);
    passos.push(`Consulta à intimação eletrônica: ${dataPorExtenso(entrada.data)}.`);
    passos.push(`Dia do começo do prazo: dia útil seguinte à consulta, ${dataPorExtenso(diaDoComeco)} (CPC art. 231, V).`);
    registrarPulos(entrada.data, diaDoComeco);
  } else if (entrada.tipoInicio === "publicacao") {
    passos.push(`Publicação: ${dataPorExtenso(entrada.data)}.`);
  } else {
    passos.push(`Dia do começo do prazo (art. 231): ${dataPorExtenso(entrada.data)}.`);
  }

  // 2) Primeiro dia da contagem: o dia do começo é excluído (art. 224 caput); a contagem começa no primeiro dia útil seguinte (art. 224 § 3º).
  const primeiro = proximoUtil(diaDoComeco, naoUtil);
  registrarPulos(diaDoComeco, primeiro);
  passos.push(`O dia do começo (${dataPorExtenso(diaDoComeco)}) não entra na conta (CPC art. 224, caput). A contagem começa no primeiro dia útil seguinte: ${dataPorExtenso(primeiro)}.`);

  // 3) Contagem
  const contados: string[] = [];
  let d = primeiro;
  while (contados.length < entrada.dias) {
    if (suspensao && dentroDaSuspensao(d)) {
      todosPulados.push({ data: d, classe: { motivo: "suspensao_cpc", descricao: "Suspensão do prazo de 20/12 a 20/01 (CPC art. 220)" } });
    } else if (entrada.contagem === "uteis") {
      const c = naoUtil(d);
      if (c) todosPulados.push({ data: d, classe: c });
      else contados.push(d);
    } else {
      contados.push(d);
    }
    if (contados.length < entrada.dias) d = somarDias(d, 1);
  }
  let vencimento = contados[contados.length - 1] as string;
  passos.push(
    entrada.contagem === "uteis"
      ? `Contagem de ${entrada.dias} ${entrada.dias === 1 ? "dia útil" : "dias úteis"} (CPC art. 219), sem sábados, domingos, feriados nacionais por lei e dias sem expediente do calendário do escritório${suspensao ? ", e sem os dias de 20/12 a 20/01 (art. 220)" : ""}.`
      : `Contagem de ${entrada.dias} ${entrada.dias === 1 ? "dia corrido" : "dias corridos"}, todos os dias do calendário${suspensao ? ", exceto os de 20/12 a 20/01 (art. 220)" : ""}.`,
  );

  // 4) Vencimento caindo em dia sem expediente → próximo dia útil
  let dataFinal = vencimento;
  const classeFinal = naoUtil(vencimento);
  if (classeFinal) {
    dataFinal = proximoUtil(vencimento, naoUtil);
    passos.push(`O último dia da contagem (${dataPorExtenso(vencimento)}) não é dia útil. O vencimento passa para o primeiro dia útil seguinte (CPC art. 224, § 1º).`);
    for (let x = vencimento; x < dataFinal; x = somarDias(x, 1)) {
      const c = naoUtil(x);
      if (c) todosPulados.push({ data: x, classe: c });
    }
    vencimento = dataFinal;
  }

  const ordenados = [...new Map(todosPulados.map((p) => [p.data, p])).values()].sort((a, b) => (a.data < b.data ? -1 : 1));
  // Só mostra o que está entre a data informada e o vencimento.
  const dentro = ordenados.filter((p) => p.data >= entrada.data && p.data <= dataFinal);
  const pulados = agrupar(dentro);
  if (pulados.length > 0) {
    passos.push("Dias ignorados na conta:");
    for (const i of pulados) passos.push(`  ${textoIntervalo(i)}.`);
  }
  passos.push(`Último dia do prazo: ${dataPorExtenso(dataFinal)}.`);

  const avisos = [AVISO_CONFERENCIA, "Considera apenas feriados nacionais por lei e os dias cadastrados no calendário do escritório. Feriados locais, Carnaval, Corpus Christi e suspensões do tribunal só entram se cadastrados."];
  if (suspensao && dentroDaSuspensao(dataFinal)) avisos.push("O vencimento caiu dentro do período de suspensão (20/12 a 20/01). Confirme com o tribunal como contar neste caso.");
  return { ok: true, resultado: { dataFinal, diaDoComeco, primeiroDiaContado: primeiro, diasContados: contados, pulados, passos, avisos } };
}
