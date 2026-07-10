import "server-only";

import { fetchOrden, fetchOperacion, fetchFacturasVinculadas, linkedIds } from "./airtableGancho";
import type { FacturaVinculadaGancho } from "./airtableGancho";
import type { OrigenGancho } from "../emitirFactura";

// BORRADOR y ANULADA no bloquean: un borrador se puede seguir editando, y
// una factura anulada no representa una emisión vigente sobre el origen.
const ESTADOS_NO_BLOQUEANTES = new Set(["BORRADOR", "ANULADA"]);

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
  const registro =
    origen.tipo === "orden"
      ? await fetchOrden(origen.recordId)
      : await fetchOperacion(origen.recordId);
  if (!registro) return null;

  const facturaIds = linkedIds(registro.fields["Facturas Electrónicas"]);
  if (facturaIds.length === 0) return null;

  const facturas = await fetchFacturasVinculadas(facturaIds);
  return facturas.find((f) => !ESTADOS_NO_BLOQUEANTES.has(f.estado)) ?? null;
}
