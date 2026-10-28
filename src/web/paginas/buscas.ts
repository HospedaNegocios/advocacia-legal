import { api } from "../api";
import type { OpcaoBusca } from "../ui";
import type { Cliente } from "./clientes-comum";
import { cnjFormatado, resumoPartes } from "./processos-comum";
import type { Processo } from "./processos-comum";

// Buscas usadas pelos seletores de processo e cliente (só registros ativos do escritório da sessão).

export async function buscarProcessos(texto: string): Promise<OpcaoBusca[]> {
  const q = new URLSearchParams({ situacao: "ativos", por_pagina: "8" });
  if (texto) q.set("busca", texto);
  const r = await api<{ processos: Processo[] }>("GET", `/api/processos?${q.toString()}`);
  return r.processos.map((p) => {
    const partes = resumoPartes(p.partes);
    return { id: p.id, rotulo: cnjFormatado(p.numero_cnj), detalhe: p.partes.length ? `${partes.ativo} x ${partes.passivo}` : undefined };
  });
}

export async function buscarClientes(texto: string): Promise<OpcaoBusca[]> {
  const q = new URLSearchParams({ situacao: "ativos", por_pagina: "8" });
  if (texto) q.set("busca", texto);
  const r = await api<{ clientes: Cliente[] }>("GET", `/api/clientes?${q.toString()}`);
  return r.clientes.map((c) => ({ id: c.id, rotulo: c.nome }));
}

/** Para filtros de consulta: inclui desativados (o lançamento antigo continua existindo). */
export async function buscarProcessosTodos(texto: string): Promise<OpcaoBusca[]> {
  const q = new URLSearchParams({ situacao: "todos", por_pagina: "8" });
  if (texto) q.set("busca", texto);
  const r = await api<{ processos: Processo[] }>("GET", `/api/processos?${q.toString()}`);
  return r.processos.map((p) => ({ id: p.id, rotulo: cnjFormatado(p.numero_cnj) }));
}

export async function buscarClientesTodos(texto: string): Promise<OpcaoBusca[]> {
  const q = new URLSearchParams({ situacao: "todos", por_pagina: "8" });
  if (texto) q.set("busca", texto);
  const r = await api<{ clientes: Cliente[] }>("GET", `/api/clientes?${q.toString()}`);
  return r.clientes.map((c) => ({ id: c.id, rotulo: c.nome }));
}
