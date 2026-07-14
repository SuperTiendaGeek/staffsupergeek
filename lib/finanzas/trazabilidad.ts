import "server-only";

import type { Movimiento } from "@/types/finanzas";
import { cleanString, fetchRecordById, firstLinkedId, type AirtableRecord } from "./airtable-client";
import { fetchCuentaById } from "./cuentas";
import { fetchMovimientoById } from "./movimientos";

const ORDEN_TABLE = "Órdenes de Reparación";
const OPERACION_TABLE = "Operación Comercial";
const ABONOS_TABLE = "Abonos";

function firstString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export type TrazabilidadMovimiento = {
  ordenId: string | null;
  ordenCodigo: string | null;
  operacionId: string | null;
  operacionCodigo: string | null;
  clienteId: string | null;
  clienteNombre: string | null;
  facturaId: string | null;
  facturaNumero: string | null;
  pagoShippingId: string | null;
  pagoShippingCodigo: string | null;
  cuentaOrigenNombre: string | null;
  cuentaDestinoNombre: string | null;
  movimientosCompensadores: Array<{ id: string; movimientoId: string; tipo: string; categoria: string; monto: number }>;
  compensaA: { id: string; movimientoId: string } | null;
  // Fase 20.4 — si este movimiento es el ajuste de un cuadre de caja.
  cuadreOrigenId: string | null;
  cuadreOrigenCodigo: string | null;
};

/**
 * Fase 20.3 §2.1 — resuelve las referencias legibles de un movimiento para
 * su pantalla de detalle. Patrón seguro en todos los saltos: nunca se filtra
 * ninguna tabla por campo de link, solo `fetchRecordById`/`fetchMovimientoById`
 * a partir de ids que el propio movimiento (o el Abono que ya se trajo) ya
 * trae en sus propios campos.
 */
export async function fetchMovimientoConTrazabilidad(
  id: string
): Promise<{ movimiento: Movimiento; trazabilidad: TrazabilidadMovimiento } | null> {
  const movimiento = await fetchMovimientoById(id);
  if (!movimiento) return null;

  const abonoId = movimiento.abonoIds[0] ?? null;
  const facturaId = movimiento.facturaElectronicaIds[0] ?? null;
  const pagoShippingId = movimiento.pagoShippingIds[0] ?? null;
  let clienteId: string | null = movimiento.clienteIds[0] ?? null;

  let ordenId: string | null = null;
  let ordenCodigo: string | null = null;
  let operacionId: string | null = null;
  let operacionCodigo: string | null = null;

  const [abono, factura, pagoShipping, cuentaOrigen, cuentaDestino, original, hijos, cuadreOrigen] = await Promise.all([
    abonoId ? fetchRecordById(ABONOS_TABLE, abonoId) : Promise.resolve(null),
    facturaId ? fetchRecordById("Facturas Electrónicas", facturaId) : Promise.resolve(null),
    pagoShippingId ? fetchRecordById("Shipping Pagos", pagoShippingId) : Promise.resolve(null),
    movimiento.cuentaOrigenId ? fetchCuentaById(movimiento.cuentaOrigenId) : Promise.resolve(null),
    movimiento.cuentaDestinoId ? fetchCuentaById(movimiento.cuentaDestinoId) : Promise.resolve(null),
    movimiento.reversaAId ? fetchMovimientoById(movimiento.reversaAId) : Promise.resolve(null),
    Promise.all(movimiento.compensadoPorIds.map((cid) => fetchMovimientoById(cid))),
    movimiento.cuadreDeCajaId ? fetchRecordById("Finanzas Cuadres", movimiento.cuadreDeCajaId) : Promise.resolve(null),
  ]);

  if (abono) {
    ordenId = firstLinkedId(abono.fields["Aplicado a: Orden"]);
    operacionId = firstLinkedId(abono.fields["Aplicado a: Operación"]);
    if (!clienteId) clienteId = firstLinkedId(abono.fields["Cliente"]);
  }

  const [ordenRecord, operacionRecord]: [AirtableRecord | null, AirtableRecord | null] = await Promise.all([
    ordenId ? fetchRecordById(ORDEN_TABLE, ordenId) : Promise.resolve(null),
    operacionId ? fetchRecordById(OPERACION_TABLE, operacionId) : Promise.resolve(null),
  ]);
  if (ordenRecord) {
    ordenCodigo = firstString(ordenRecord.fields["ID"]) || ordenId;
    if (!clienteId) clienteId = firstLinkedId(ordenRecord.fields["Cliente"]);
  }
  if (operacionRecord) {
    operacionCodigo = firstString(operacionRecord.fields["Código Operación"]) || operacionId;
    if (!clienteId) clienteId = firstLinkedId(operacionRecord.fields["Cliente"]);
  }

  const cliente = clienteId ? await fetchRecordById("Clientes", clienteId) : null;

  const trazabilidad: TrazabilidadMovimiento = {
    ordenId,
    ordenCodigo,
    operacionId,
    operacionCodigo,
    clienteId,
    clienteNombre: cliente ? cleanString(cliente.fields["Nombre"]) || null : null,
    facturaId,
    facturaNumero: factura ? cleanString(factura.fields["Número de Factura"]) || cleanString(factura.fields["Clave de Acceso"]) || null : null,
    pagoShippingId,
    pagoShippingCodigo: pagoShipping ? cleanString(pagoShipping.fields["Pago ID"]) || null : null,
    cuentaOrigenNombre: cuentaOrigen?.nombre ?? null,
    cuentaDestinoNombre: cuentaDestino?.nombre ?? null,
    movimientosCompensadores: hijos
      .filter((h): h is Movimiento => !!h)
      .map((h) => ({ id: h.id, movimientoId: h.movimientoId, tipo: h.tipo, categoria: h.categoria, monto: h.monto })),
    compensaA: original ? { id: original.id, movimientoId: original.movimientoId } : null,
    cuadreOrigenId: movimiento.cuadreDeCajaId,
    cuadreOrigenCodigo: cuadreOrigen ? cleanString(cuadreOrigen.fields["Cuadre ID"]) || null : null,
  };

  return { movimiento, trazabilidad };
}
