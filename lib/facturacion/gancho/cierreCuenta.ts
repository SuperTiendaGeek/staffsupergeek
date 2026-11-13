import "server-only";

// Auditoría ops, punto 2 — parche provisional (27-oct-2026): las operaciones
// de una cuenta (orden + pedidos) se cierran y se reabren JUNTAS con su
// documento. Antes solo se cerraba la operación cuando el documento se emitía
// desde ella; emitido desde la orden, el pedido se quedaba en "Pedido" para
// siempre (OP-2026-000100/102/103/109). Reglas puras en lib/operaciones/cierre.ts.
//
// Best-effort: el documento ya existe cuando esto corre; un fallo se loguea y
// se informa, nunca revierte la emisión ni la anulación.

import { actualizarEstadoOperacion } from "@/lib/operaciones/airtable";
import { operacionSeCierraConLaCuenta, operacionSeReabreConLaCuenta } from "@/lib/operaciones/cierre";
import type { OrigenGancho } from "../emitirFactura";
import { fetchOperacion, firstString } from "./airtableGancho";
import { registrosDeLaCuenta } from "./idempotencia";
import { CAMPO_LINEAS_DEL_PEDIDO } from "@/lib/tecnicos/presupuesto/airtable";

async function moverOperacionesDeLaCuenta(
  origen: OrigenGancho,
  debeMoverse: (estado: string) => boolean,
  estadoNuevo: "Entregado" | "Pedido"
): Promise<{ movidas: string[]; errores: string[] }> {
  const movidas: string[] = [];
  const errores: string[] = [];
  if (origen.tipo !== "orden" && origen.tipo !== "operacion") return { movidas, errores };
  let registros: OrigenGancho[];
  try {
    registros = await registrosDeLaCuenta(origen);
  } catch (e) {
    return { movidas, errores: [`No se pudo leer la cuenta: ${e instanceof Error ? e.message : String(e)}`] };
  }
  for (const r of registros) {
    if (r.tipo !== "operacion") continue;
    try {
      const op = await fetchOperacion(r.recordId);
      if (!op) continue;
      // Punto 10C-2: un PEDIDO ESPECIAL (con líneas) no se cierra ni se
      // reabre con el documento: lo entrega "Entregar al cliente". Anular su
      // factura no lo devuelve al estado viejo "Pedido".
      if (Array.isArray(op.fields[CAMPO_LINEAS_DEL_PEDIDO]) && (op.fields[CAMPO_LINEAS_DEL_PEDIDO] as unknown[]).length > 0) continue;
      if (!debeMoverse(firstString(op.fields["Estado"]))) continue;
      await actualizarEstadoOperacion(r.recordId, estadoNuevo);
      movidas.push(firstString(op.fields["Código Operación"], r.recordId));
    } catch (e) {
      errores.push(`${r.recordId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (errores.length) console.error(`[cierreCuenta] operaciones → ${estadoNuevo} con errores`, { origen, errores });
  return { movidas, errores };
}

/** Al emitir el documento de la cuenta: sus pedidos vivos pasan a "Entregado". */
export function cerrarOperacionesDeLaCuenta(origen: OrigenGancho) {
  return moverOperacionesDeLaCuenta(origen, operacionSeCierraConLaCuenta, "Entregado");
}

/** Al anular el documento de la cuenta: lo que se cerró con él vuelve a "Pedido". */
export function reabrirOperacionesDeLaCuenta(origen: OrigenGancho) {
  return moverOperacionesDeLaCuenta(origen, operacionSeReabreConLaCuenta, "Pedido");
}
