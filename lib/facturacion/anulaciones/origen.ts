import "server-only";

// Auditoría Shipping V2, punto 7 (9-oct-2026): al ANULAR una factura o un
// recibo que venía de un origen, ese origen vuelve a quedar abierto para
// emitir el documento correcto:
//   · reserva   → vuelve a "Activa" (con sus abonos).
//   · orden u operación → los pedidos de la cuenta que se cerraron con el
//     documento vuelven a "Pedido" (auditoría ops, punto 2).
// La unidad apartada la devuelve el reverso de inventario (reapartar).
// Best-effort: nunca lanza.

import { reabrirReservaTrasAnulacion } from "../reservas/airtable";
import { lineaHistorialReserva } from "../reservas/liberar";
import { reabrirOperacionesDeLaCuenta } from "../gancho/cierreCuenta";

export type OrigenDocumento = { tipo: "orden" | "operacion" | "reserva"; recordId: string };

export function leerOrigenDeLineas(raw: unknown): OrigenDocumento | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = (raw as { origen?: unknown }).origen as Record<string, unknown> | undefined;
  if (!o || typeof o !== "object") return null;
  if ((o.tipo === "orden" || o.tipo === "operacion" || o.tipo === "reserva") && typeof o.recordId === "string" && o.recordId.startsWith("rec")) {
    return { tipo: o.tipo, recordId: o.recordId };
  }
  return null;
}

export async function reabrirOrigenTrasAnulacion(origen: OrigenDocumento | null | undefined, documento: string, usuario: string): Promise<string | null> {
  if (!origen) return null;
  try {
    if (origen.tipo === "reserva") {
      await reabrirReservaTrasAnulacion(origen.recordId, lineaHistorialReserva(`Se anuló ${documento}: la reserva vuelve a Activa y el artículo vuelve a quedar apartado.`, usuario));
    } else {
      // Auditoría ops, punto 2: los pedidos de la cuenta (orden u operación)
      // que se cerraron con el documento vuelven juntos a "Pedido".
      const { errores } = await reabrirOperacionesDeLaCuenta(origen);
      if (errores.length) throw new Error(errores.join(" "));
    }
    return null;
  } catch (e) {
    console.error("[anulación] reabrir origen:", e);
    return `No se pudo reabrir el origen (${origen.tipo}): ${e instanceof Error ? e.message : String(e)}. Revísalo a mano.`;
  }
}
