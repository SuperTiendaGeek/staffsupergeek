import "server-only";

// Liberar una reserva: UN solo camino para la acción manual (botón "Liberar")
// y para el proceso diario que libera las vencidas (punto 6 de la auditoría
// Shipping V2, 9-oct-2026). Devuelve la unidad al artículo y deja lo abonado
// como SALDO A FAVOR del cliente.

import { obtenerReservaPorId, marcarReservaLiberada } from "./airtable";
import { liberarItem } from "./efectos";

/** Línea de bitácora con fecha y hora de Ecuador. */
export function lineaHistorialReserva(texto: string, usuario: string, ahora: Date = new Date()): string {
  const f = new Date(ahora.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ");
  return `[${f}] ${usuario}: ${texto}`;
}

export async function liberarReserva(
  recordId: string,
  opts: { usuario: string; motivo: string }
): Promise<{ saldoAFavor: number; numero: string }> {
  const reserva = await obtenerReservaPorId(recordId);
  if (!reserva) throw new Error("Reserva no encontrada");
  if (reserva.estado !== "Activa") throw new Error(`La reserva ya está ${reserva.estado.toLowerCase()}`);

  // Devolver la unidad (best-effort: si falla, la reserva igual se libera y
  // el artículo se puede destrabar desde su ficha).
  if (reserva.shippingItemId) {
    try { await liberarItem(reserva.shippingItemId); }
    catch (e) { console.error("[reservas liberar] inventario:", e); }
  }
  const texto = `${opts.motivo} Saldo a favor: $${reserva.totalAbonado.toFixed(2)}.`;
  await marcarReservaLiberada(recordId, reserva.totalAbonado, lineaHistorialReserva(texto, opts.usuario));
  return { saldoAFavor: reserva.totalAbonado, numero: reserva.numero };
}
