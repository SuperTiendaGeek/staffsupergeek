/**
 * Aprobado sin artículo — regla pura (presupuesto único, fase 3b).
 *
 * Regla del dueño (27-sep): lo que el cliente aprueba suma a la cuenta desde la
 * aprobación, pero la factura y el recibo SIEMPRE esperan a que exista el
 * artículo (repuesto bajo pedido pedido y recibido, stock reservado, código
 * digital asignado). La UI ya lo bloquea vía la pre-factura
 * (PRESUPUESTO_PENDIENTE); esto es la re-verificación server-side en
 * /api/facturacion/emitir y /api/facturacion/recibos, para que la regla no se
 * pueda saltar con un request directo — mismo criterio que la idempotencia.
 *
 * Fail-closed: si no se pudo leer la cuenta, NO se emite.
 */

export type LineaSinArticulo = { nombre: string };

export const MENSAJE_NO_SE_PUDO_VERIFICAR =
  "No se pudo verificar si la orden tiene líneas aprobadas sin su artículo. Intenta de nuevo.";

/** null = se puede emitir. Si no, el mensaje para el usuario. */
export function mensajeAprobadoSinArticulo(pendientes: LineaSinArticulo[], documento: "factura" | "recibo"): string | null {
  if (pendientes.length === 0) return null;
  const nombres = pendientes.map((p) => p.nombre.trim() || "línea sin descripción").join(", ");
  return `No se puede emitir ${documento === "factura" ? "la factura" : "el recibo"} todavía: el cliente aprobó y aún falta el artículo de ${nombres}. Espera a que exista el artículo, o quita la línea si el cliente desistió.`;
}
