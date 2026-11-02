import "server-only";

// Lectura y escritura de la tabla "Saldo a Favor" (auditoría ops, punto 13B).
// Regla de la casa: nunca filtrar por campo de link. Los movimientos de un
// cliente se leen desde su campo inverso "Saldo a Favor" (Clientes) y luego
// por RECORD_ID().

import {
  airtableMutation,
  airtableRequest,
  compactFields,
  fetchRecordById,
  fetchRecordsByIds,
  firstNumber,
  linkedIds,
  tableUrl,
  type AirtableRecord,
} from "@/lib/finanzas/airtable-client";
import type { MovimientoSaldo, TipoMovimientoSaldo } from "./reglas";

export const TABLA_SALDO_A_FAVOR = "Saldo a Favor";
/** Campo inverso en Clientes, Abonos, Reservas, Órdenes, etc. */
export const CAMPO_INVERSO = "Saldo a Favor";

export type RegistroSaldo = MovimientoSaldo & {
  codigo: string;
  clienteId: string | null;
  abonoIds: string[];
  ordenIds: string[];
  operacionIds: string[];
  reservaIds: string[];
  notaCreditoIds: string[];
  facturaIds: string[];
  reciboIds: string[];
  movimientoIds: string[];
};

function texto(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && "name" in v) return String((v as { name: unknown }).name ?? "");
  return "";
}

export function registroDesdeAirtable(r: AirtableRecord): RegistroSaldo {
  const f = r.fields;
  return {
    id: r.id,
    codigo: texto(f["Código"]),
    tipo: texto(f["Tipo"]) as TipoMovimientoSaldo,
    monto: firstNumber(f["Monto"]) ?? 0,
    fecha: texto(f["Fecha"]) || r.createdTime || "",
    vence: texto(f["Vence"]) || null,
    estado: texto(f["Estado"]) || "Vigente",
    clienteId: linkedIds(f["Cliente"])[0] ?? null,
    abonoIds: linkedIds(f["Abono"]),
    ordenIds: linkedIds(f["Orden"]),
    operacionIds: linkedIds(f["Operación"]),
    reservaIds: linkedIds(f["Reserva"]),
    notaCreditoIds: linkedIds(f["Nota de Crédito"]),
    facturaIds: linkedIds(f["Factura"]),
    reciboIds: linkedIds(f["Recibo"]),
    movimientoIds: linkedIds(f["Movimiento Financiero"]),
  };
}

/** Todos los movimientos de un cliente (incluye anulados, con su estado). */
export async function movimientosDeCliente(clienteId: string): Promise<RegistroSaldo[]> {
  const cliente = await fetchRecordById("Clientes", clienteId);
  if (!cliente) return [];
  const ids = linkedIds(cliente.fields[CAMPO_INVERSO]);
  return (await fetchRecordsByIds(TABLA_SALDO_A_FAVOR, ids)).map(registroDesdeAirtable);
}

/** Todos los movimientos (la tabla es chica: un registro por movimiento de saldo). */
export async function todosLosMovimientos(): Promise<RegistroSaldo[]> {
  const out: RegistroSaldo[] = [];
  let offset: string | undefined;
  do {
    const u = new URL(tableUrl(TABLA_SALDO_A_FAVOR));
    u.searchParams.set("pageSize", "100");
    if (offset) u.searchParams.set("offset", offset);
    const data = await airtableRequest<{ records?: AirtableRecord[]; offset?: string }>(u.toString());
    out.push(...(data.records ?? []).map(registroDesdeAirtable));
    offset = data.offset;
  } while (offset);
  return out;
}

/** Movimientos por sus ids (p. ej. desde el campo inverso de un abono o una reserva). */
export async function movimientosPorIds(ids: string[]): Promise<RegistroSaldo[]> {
  return (await fetchRecordsByIds(TABLA_SALDO_A_FAVOR, ids)).map(registroDesdeAirtable);
}

export type NuevoMovimientoSaldo = {
  descripcion: string;
  clienteId: string;
  tipo: TipoMovimientoSaldo;
  monto: number;
  fecha: string;
  vence?: string | null;
  ordenId?: string | null;
  operacionId?: string | null;
  reservaId?: string | null;
  notaCreditoId?: string | null;
  facturaId?: string | null;
  reciboId?: string | null;
  abonoId?: string | null;
  movimientoId?: string | null;
  motivo?: string | null;
  registradoPor: string;
};

export async function crearMovimientoSaldo(m: NuevoMovimientoSaldo): Promise<RegistroSaldo> {
  const fields = compactFields({
    "Descripción": m.descripcion,
    Cliente: [m.clienteId],
    Tipo: m.tipo,
    Monto: Math.round((m.monto + Number.EPSILON) * 100) / 100,
    Fecha: m.fecha,
    Vence: m.vence ?? undefined,
    Orden: m.ordenId ? [m.ordenId] : undefined,
    "Operación": m.operacionId ? [m.operacionId] : undefined,
    Reserva: m.reservaId ? [m.reservaId] : undefined,
    "Nota de Crédito": m.notaCreditoId ? [m.notaCreditoId] : undefined,
    Factura: m.facturaId ? [m.facturaId] : undefined,
    Recibo: m.reciboId ? [m.reciboId] : undefined,
    Abono: m.abonoId ? [m.abonoId] : undefined,
    "Movimiento Financiero": m.movimientoId ? [m.movimientoId] : undefined,
    Motivo: m.motivo ?? undefined,
    "Registrado por": m.registradoPor,
    Estado: "Vigente",
  });
  const data = await airtableMutation<{ records?: AirtableRecord[] }>(tableUrl(TABLA_SALDO_A_FAVOR), {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });
  const creado = data.records?.[0];
  if (!creado) throw new Error("Airtable no devolvió el movimiento de saldo a favor creado.");
  return registroDesdeAirtable(creado);
}

export async function actualizarMovimientoSaldo(id: string, fields: Record<string, unknown>): Promise<void> {
  await airtableMutation(tableUrl(TABLA_SALDO_A_FAVOR), {
    method: "PATCH",
    body: JSON.stringify({ records: [{ id, fields }], typecast: true }),
  });
}

/** Anula (no borra) un movimiento, con su motivo en la constancia. */
export async function anularMovimientoSaldo(id: string, motivo: string): Promise<void> {
  const actual = await fetchRecordById(TABLA_SALDO_A_FAVOR, id);
  const previo = texto(actual?.fields["Motivo"]);
  await actualizarMovimientoSaldo(id, {
    Estado: "Anulado",
    Motivo: [previo, `Anulado: ${motivo}`].filter(Boolean).join("\n"),
  });
}
