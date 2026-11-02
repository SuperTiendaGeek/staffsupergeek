import "server-only";

// Lectura y escritura de la tabla "Solicitudes de Compra" (auditoría ops,
// Fase 2). Regla de la casa: nunca filtrar por campo de link; las solicitudes
// de una orden, operación o artículo se leen desde su campo inverso
// "Solicitudes de Compra" y luego por RECORD_ID().

import {
  airtableMutation,
  airtableRequest,
  compactFields,
  escapeFormulaString,
  fetchRecordById,
  fetchRecordsByIds,
  firstNumber,
  linkedIds,
  tableUrl,
  type AirtableRecord,
} from "@/lib/finanzas/airtable-client";
import type { EstadoSolicitud, SolicitudBase } from "./reglas";

export const TABLA_SOLICITUDES = "Solicitudes de Compra";
/** Campo inverso en Órdenes, Operación Comercial, Shipping Items, Opciones, OC y Proveedores. */
export const CAMPO_INVERSO = "Solicitudes de Compra";
/** Campo inverso en "Presupuesto por Orden" (una línea, una solicitud). */
export const CAMPO_EN_LINEA = "Solicitud de compra";

export type Solicitud = SolicitudBase & {
  clave: string;
  categoria: string;
  costoCotizado: number | null;
  urlProveedor: string;
  tiempoEstimado: string;
  proveedorId: string | null;
  ordenId: string | null;
  lineaId: string | null;
  operacionId: string | null;
  opcionId: string | null;
  itemId: string | null;
  ordenCompraId: string | null;
  fechaCompra: string;
  historial: string;
  registradoPor: string;
};

function texto(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "name" in v) return String((v as { name: unknown }).name ?? "");
  return "";
}

export function solicitudDesdeAirtable(r: AirtableRecord): Solicitud {
  const f = r.fields;
  return {
    id: r.id,
    codigo: texto(f["Código"]),
    descripcion: texto(f["Descripción"]),
    estado: (texto(f["Estado"]) || "Por comprar") as EstadoSolicitud,
    clave: texto(f["Clave"]),
    cantidad: firstNumber(f["Cantidad"]) ?? 1,
    categoria: texto(f["Categoría"]),
    precioCliente: firstNumber(f["Precio cliente"]) ?? 0,
    costoCotizado: firstNumber(f["Costo cotizado"]),
    urlProveedor: texto(f["URL proveedor"]),
    tiempoEstimado: texto(f["Tiempo estimado"]),
    proveedorId: linkedIds(f["Proveedor sugerido"])[0] ?? null,
    ordenId: linkedIds(f["Orden"])[0] ?? null,
    lineaId: linkedIds(f["Línea de presupuesto"])[0] ?? null,
    operacionId: linkedIds(f["Operación"])[0] ?? null,
    opcionId: linkedIds(f["Opción"])[0] ?? null,
    itemId: linkedIds(f["Artículo"])[0] ?? null,
    ordenCompraId: linkedIds(f["Orden de compra"])[0] ?? null,
    fechaAprobacion: texto(f["Fecha aprobación"]) || r.createdTime || "",
    fechaCompra: texto(f["Fecha compra"]),
    motivo: texto(f["Motivo"]),
    historial: texto(f["Historial"]),
    registradoPor: texto(f["Registrado por"]),
  };
}

export async function solicitudPorId(id: string): Promise<Solicitud | null> {
  const r = await fetchRecordById(TABLA_SOLICITUDES, id);
  return r ? solicitudDesdeAirtable(r) : null;
}

export async function solicitudesPorIds(ids: string[]): Promise<Solicitud[]> {
  const unicos = [...new Set(ids)].filter(Boolean);
  if (!unicos.length) return [];
  return (await fetchRecordsByIds(TABLA_SOLICITUDES, unicos)).map(solicitudDesdeAirtable);
}

/** Las solicitudes enlazadas a un registro (orden, operación, artículo…) por su campo inverso. */
export async function solicitudesDe(tabla: string, recordId: string, campo = CAMPO_INVERSO): Promise<Solicitud[]> {
  const r = await fetchRecordById(tabla, recordId);
  if (!r) return [];
  return solicitudesPorIds(linkedIds(r.fields[campo]));
}

/** Busca por la clave única (linea:recX / opcion:recX). La clave es texto, no link. */
export async function solicitudPorClave(clave: string): Promise<Solicitud | null> {
  const u = new URL(tableUrl(TABLA_SOLICITUDES));
  u.searchParams.set("pageSize", "1");
  u.searchParams.set("filterByFormula", `{Clave}='${escapeFormulaString(clave)}'`);
  const data = await airtableRequest<{ records?: AirtableRecord[] }>(u.toString());
  const r = data.records?.[0];
  return r ? solicitudDesdeAirtable(r) : null;
}

/** Todas las solicitudes en un estado (la bandeja). El estado es un select, no un link. */
export async function solicitudesEnEstados(estados: EstadoSolicitud[]): Promise<Solicitud[]> {
  const out: Solicitud[] = [];
  let offset: string | undefined;
  const formula = estados.length === 1
    ? `{Estado}='${estados[0]}'`
    : `OR(${estados.map((e) => `{Estado}='${e}'`).join(",")})`;
  do {
    const u = new URL(tableUrl(TABLA_SOLICITUDES));
    u.searchParams.set("pageSize", "100");
    u.searchParams.set("filterByFormula", formula);
    if (offset) u.searchParams.set("offset", offset);
    const data = await airtableRequest<{ records?: AirtableRecord[]; offset?: string }>(u.toString());
    out.push(...(data.records ?? []).map(solicitudDesdeAirtable));
    offset = data.offset;
  } while (offset);
  return out;
}

export type NuevaSolicitud = {
  descripcion: string;
  clave: string;
  cantidad: number;
  categoria?: string;
  precioCliente: number;
  costoCotizado?: number | null;
  urlProveedor?: string;
  tiempoEstimado?: string;
  proveedorId?: string | null;
  ordenId?: string | null;
  lineaId?: string | null;
  operacionId?: string | null;
  opcionId?: string | null;
  fechaAprobacion: string;
  historial: string;
  registradoPor: string;
};

export async function crearSolicitud(s: NuevaSolicitud): Promise<Solicitud> {
  const fields = compactFields({
    "Descripción": s.descripcion,
    Estado: "Por comprar",
    Clave: s.clave,
    Cantidad: s.cantidad,
    "Categoría": s.categoria || undefined,
    "Precio cliente": Math.round((s.precioCliente + Number.EPSILON) * 100) / 100,
    "Costo cotizado": s.costoCotizado ?? undefined,
    "URL proveedor": s.urlProveedor || undefined,
    "Tiempo estimado": s.tiempoEstimado || undefined,
    "Proveedor sugerido": s.proveedorId ? [s.proveedorId] : undefined,
    Orden: s.ordenId ? [s.ordenId] : undefined,
    "Línea de presupuesto": s.lineaId ? [s.lineaId] : undefined,
    "Operación": s.operacionId ? [s.operacionId] : undefined,
    "Opción": s.opcionId ? [s.opcionId] : undefined,
    "Fecha aprobación": s.fechaAprobacion,
    Historial: s.historial,
    "Registrado por": s.registradoPor,
  });
  const data = await airtableMutation<{ records?: AirtableRecord[] }>(tableUrl(TABLA_SOLICITUDES), {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });
  const creado = data.records?.[0];
  if (!creado) throw new Error("Airtable no devolvió la solicitud de compra creada.");
  return solicitudDesdeAirtable(creado);
}

export async function actualizarSolicitud(id: string, fields: Record<string, unknown>): Promise<void> {
  await airtableMutation(tableUrl(TABLA_SOLICITUDES), {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id, fields }], typecast: true }),
  });
}
