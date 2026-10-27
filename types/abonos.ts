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
  "DeUna",
] as const;

export type MetodoPagoAbono = (typeof METODOS_PAGO_ABONO)[number];

export function esMetodoPagoAbonoValido(valor: string): valor is MetodoPagoAbono {
  return (METODOS_PAGO_ABONO as readonly string[]).includes(valor);
}

/**
 * Métodos para los que el número de transacción es obligatorio (decisión de
 * Alex, 2026-08-16): Transferencia y DeUna dejan un comprobante/rastro
 * bancario verificable con el que se puede conciliar la cuenta destino — a
 * diferencia de Efectivo (nada que conciliar) o Tarjeta (se concilia con el
 * lote del POS, no con un número suelto). El resto de métodos sigue
 * opcional. Aplica solo hacia adelante: los abonos ya guardados sin número
 * no se tocan ni se marcan.
 */
const METODOS_QUE_EXIGEN_NUMERO_TRANSACCION = new Set<MetodoPagoAbono>(["Transferencia", "DeUna"]);

export function requiereNumeroTransaccion(metodo: string): boolean {
  return esMetodoPagoAbonoValido(metodo) && METODOS_QUE_EXIGEN_NUMERO_TRANSACCION.has(metodo);
}

/**
 * Auditoría Técnicos y Operaciones, punto 1 (decisión del dueño, 27-oct-2026):
 * todo cobro nuevo entra a una cuenta real. "Otro" no dice a qué cuenta entró
 * el dinero, así que ya no se ofrece para cobros nuevos (sigue siendo válido
 * para leer abonos viejos). La cuenta de cada método vive en
 * lib/finanzas/puentes/abonos.ts (MAPA_METODO_PAGO_ABONO).
 */
export const METODOS_COBRO_NUEVO = METODOS_PAGO_ABONO.filter(
  (m): m is Exclude<MetodoPagoAbono, "Otro"> => m !== "Otro"
);

export function esMetodoCobroNuevoValido(valor: string): valor is Exclude<MetodoPagoAbono, "Otro"> {
  return (METODOS_COBRO_NUEVO as readonly string[]).includes(valor);
}

/**
 * Cómo se muestra cada método en las pantallas, con la cuenta a la que entra
 * el dinero. Transferencia y DeUna son ambas transferencias, pero llegan a
 * cuentas distintas: por eso se nombran por su destino (pedido del dueño).
 * El valor guardado en Airtable no cambia (sigue siendo "Transferencia").
 */
export const ETIQUETA_METODO_PAGO: Record<MetodoPagoAbono, string> = {
  Efectivo: "Efectivo → Caja Registradora",
  Transferencia: "Transferencia Banco Pichincha → SGINGRESOS",
  Tarjeta: "Tarjeta → Tarjetas en Tránsito",
  Depósito: "Depósito Banco Pichincha → SGINGRESOS",
  PayPal: "PayPal → cuenta PayPal",
  PayPhone: "PayPhone → Tarjetas en Tránsito",
  Otro: "Otro (sin cuenta)",
  DeUna: "DeUna → cuenta DeUna (no es Banco Pichincha)",
};

export function etiquetaMetodoPago(metodo: string): string {
  return esMetodoPagoAbonoValido(metodo) ? ETIQUETA_METODO_PAGO[metodo] : metodo;
}
