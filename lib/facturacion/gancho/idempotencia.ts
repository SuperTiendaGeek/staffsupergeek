import "server-only";

import {
  fetchOrden, fetchOperacion, fetchReserva,
  fetchFacturasVinculadas, fetchRecibosVinculados, linkedIds,
} from "./airtableGancho";
import type { FacturaVinculadaGancho, ReciboVinculadoGancho } from "./airtableGancho";
import type { OrigenGancho } from "../emitirFactura";
import { armarRegistrosDeLaCuenta } from "@/lib/operaciones/cierre";

// BORRADOR y ANULADA no bloquean: un borrador se puede seguir editando, y
// una factura anulada no representa una emisión vigente sobre el origen.
const ESTADOS_NO_BLOQUEANTES = new Set(["BORRADOR", "ANULADA"]);

// Recibos: el único estado que libera el origen es "Anulado" (ver
// marcarReciboAnulado en lib/facturacion/recibos/airtable.ts, que además
// revierte inventario e ingreso). "Vigente" bloquea.
const ESTADOS_RECIBO_NO_BLOQUEANTES = new Set(["Anulado"]);

async function fetchRegistroOrigen(origen: OrigenGancho) {
  return origen.tipo === "orden"
    ? fetchOrden(origen.recordId)
    : origen.tipo === "operacion"
    ? fetchOperacion(origen.recordId)
    : fetchReserva(origen.recordId);
}

/**
 * Busca si el origen (orden u operación) ya tiene una factura vinculada en
 * un estado que impide emitir otra — vía el campo inverso "Facturas
 * Electrónicas" (regla de la casa: nunca filtrar por campo link, se lee el
 * inverso ya presente en el registro y se hace fetch por RECORD_ID()).
 *
 * Devuelve la factura bloqueante, o `null` si no hay ninguna.
 *
 * Si Airtable no responde, LANZA (ErrorLecturaAirtable): "no pude leer" nunca
 * significa "no hay factura". Los llamadores deben tratar el error como
 * bloqueo (ver /api/facturacion/emitir y /api/facturacion/recibos).
 */
export async function buscarFacturaBloqueante(
  origen: OrigenGancho
): Promise<FacturaVinculadaGancho | null> {
  const registro = await fetchRegistroOrigen(origen);
  if (!registro) return null;

  // La reserva vincula su factura en el campo "Factura" (no "Facturas
  // Electrónicas"); órdenes y operaciones usan el inverso "Facturas
  // Electrónicas". En ambos casos se lee el link ya presente en el registro.
  const facturaIds =
    origen.tipo === "reserva"
      ? linkedIds(registro.fields["Factura"])
      : linkedIds(registro.fields["Facturas Electrónicas"]);
  if (facturaIds.length === 0) return null;

  const facturas = await fetchFacturasVinculadas(facturaIds);
  return facturas.find((f) => !ESTADOS_NO_BLOQUEANTES.has(f.estado)) ?? null;
}

/**
 * Igual que buscarFacturaBloqueante, pero para el recibo interno. Las
 * reservas todavía no tienen campo inverso de recibos, así que ahí devuelve
 * null (no hay forma de emitir un recibo desde una reserva hoy).
 */
export async function buscarReciboBloqueante(
  origen: OrigenGancho
): Promise<ReciboVinculadoGancho | null> {
  if (origen.tipo === "reserva") return null;
  const registro = await fetchRegistroOrigen(origen);
  if (!registro) return null;

  const reciboIds = linkedIds(registro.fields["Recibos"]);
  if (reciboIds.length === 0) return null;

  const recibos = await fetchRecibosVinculados(reciboIds);
  return recibos.find((r) => !ESTADOS_RECIBO_NO_BLOQUEANTES.has(r.estado)) ?? null;
}

export type DocumentoBloqueante =
  | { tipo: "factura"; factura: FacturaVinculadaGancho; en?: OrigenGancho }
  | { tipo: "recibo";  recibo:  ReciboVinculadoGancho; en?: OrigenGancho };

/**
 * Auditoría ops, punto 2 (parche provisional, 27-oct-2026): la cuenta es la
 * orden + todas sus operaciones (ver armarRegistrosDeLaCuenta en
 * lib/operaciones/cierre.ts). Lanza si Airtable falla (fail-closed).
 */
export async function registrosDeLaCuenta(origen: OrigenGancho): Promise<OrigenGancho[]> {
  if (origen.tipo === "reserva") return [origen];
  let ordenId: string | null = null;
  let operacionIdsDeLaOrden: string[] = [];
  if (origen.tipo === "orden") {
    const orden = await fetchOrden(origen.recordId);
    ordenId = origen.recordId;
    operacionIdsDeLaOrden = orden ? linkedIds(orden.fields["Operaciones Comerciales"]) : [];
  } else {
    const operacion = await fetchOperacion(origen.recordId);
    ordenId = operacion ? linkedIds(operacion.fields["Orden de Reparación"])[0] ?? null : null;
    if (ordenId) {
      const orden = await fetchOrden(ordenId);
      operacionIdsDeLaOrden = orden ? linkedIds(orden.fields["Operaciones Comerciales"]) : [];
    }
  }
  const base = { tipo: origen.tipo === "orden" ? "orden" as const : "operacion" as const, recordId: origen.recordId };
  return armarRegistrosDeLaCuenta({ origen: base, ordenId, operacionIdsDeLaOrden });
}

/**
 * Bloqueo cruzado: una orden/operación se cierra con UN solo documento de
 * venta. Factura y recibo tienen el mismo efecto real sobre la cuenta
 * (descuentan inventario y registran el ingreso), así que cualquiera de los
 * dos, vigente, impide emitir el otro. Sin esto, cerrar una orden con recibo
 * y después con factura descontaría el stock dos veces y duplicaría el
 * ingreso en /finanzas.
 *
 * Se consultan en paralelo: son dos tablas distintas y ninguna depende de la
 * otra.
 */
export async function buscarDocumentoBloqueante(
  origen: OrigenGancho
): Promise<DocumentoBloqueante | null> {
  // Punto 2: se revisa la cuenta COMPLETA (orden + operaciones), no solo el
  // registro desde el que se emite. Así una orden ya documentada bloquea a su
  // operación, y al revés.
  for (const registro of await registrosDeLaCuenta(origen)) {
    const [factura, recibo] = await Promise.all([
      buscarFacturaBloqueante(registro),
      buscarReciboBloqueante(registro),
    ]);
    const en = registro.recordId === origen.recordId ? undefined : registro;
    if (factura) return { tipo: "factura", factura, en };
    if (recibo)  return { tipo: "recibo",  recibo, en };
  }
  return null;
}

/** "la operación vinculada" / "la orden vinculada" cuando el documento está en el par. */
export function etiquetaDondeEstaElDocumento(b: DocumentoBloqueante): string {
  if (!b.en) return "";
  return b.en.tipo === "orden" ? " (en la orden vinculada)" : " (en la operación vinculada)";
}
