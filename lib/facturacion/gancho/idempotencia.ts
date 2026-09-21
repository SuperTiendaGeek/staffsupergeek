import "server-only";

import {
  fetchOrden, fetchOperacion, fetchReserva,
  fetchFacturasVinculadas, fetchRecibosVinculados, linkedIds,
} from "./airtableGancho";
import type { FacturaVinculadaGancho, ReciboVinculadoGancho } from "./airtableGancho";
import type { OrigenGancho } from "../emitirFactura";

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
  | { tipo: "factura"; factura: FacturaVinculadaGancho }
  | { tipo: "recibo";  recibo:  ReciboVinculadoGancho };

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
  const [factura, recibo] = await Promise.all([
    buscarFacturaBloqueante(origen),
    buscarReciboBloqueante(origen),
  ]);
  if (factura) return { tipo: "factura", factura };
  if (recibo)  return { tipo: "recibo",  recibo };
  return null;
}
