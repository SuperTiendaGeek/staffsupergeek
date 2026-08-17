/**
 * Catálogo de "Método de Pago" de la tabla `Abonos` — fuente única.
 *
 * Antes de esta fase la lista vivía copiada a mano en 4 sitios: dos
 * pantallas (`OrdenDetalleClient.tsx`, `RegistrarAbonoModal.tsx`), un
 * endpoint (`app/api/tecnicos/ordenes/[id]/abonos/route.ts`, que además de
 * la propia pantalla repetía su propia validación server) y el mapeo del
 * puente a Finanzas (`lib/finanzas/puentes/abonos.ts`). Los cuatro leen de
 * aquí — un método nuevo (o quitado) se declara en un solo lugar.
 *
 * El orden importa: es el orden en que aparecen en los `<select>` de las
 * pantallas — no reordenar sin querer cambiar la UI.
 */
export const METODOS_PAGO_ABONO = [
  "Efectivo",
  "Transferencia",
  "Tarjeta",
  "Depósito",
  "PayPal",
  "PayPhone",
  "Otro",
] as const;

export type MetodoPagoAbono = (typeof METODOS_PAGO_ABONO)[number];

export function esMetodoPagoAbonoValido(valor: string): valor is MetodoPagoAbono {
  return (METODOS_PAGO_ABONO as readonly string[]).includes(valor);
}

/**
 * Métodos para los que el número de transacción es obligatorio. Hoy
 * ninguno — el campo es opcional para los 7 métodos existentes. (Vacío a
 * propósito en esta primera centralización, que no cambia comportamiento;
 * una fase posterior puede poblar este conjunto.)
 */
const METODOS_QUE_EXIGEN_NUMERO_TRANSACCION = new Set<MetodoPagoAbono>([]);

export function requiereNumeroTransaccion(metodo: string): boolean {
  return esMetodoPagoAbonoValido(metodo) && METODOS_QUE_EXIGEN_NUMERO_TRANSACCION.has(metodo);
}
