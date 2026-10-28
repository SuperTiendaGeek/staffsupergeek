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
// Auditoría ops, punto 7 (28-oct-2026): el catálogo vive en
// lib/cobros/metodos.ts (método → cuenta, estado, código SRI). Aquí solo se
// re-exporta con los nombres de siempre para no tocar a quien ya lo usa.
import {
  METODOS_COBRO,
  METODOS_VIGENTES,
  TODOS_LOS_METODOS,
  esMetodoCobro,
  esMetodoVigente,
  etiquetaMetodo,
  exigeReferencia,
  type MetodoCobro,
} from "@/lib/cobros/metodos";

export const METODOS_PAGO_ABONO = TODOS_LOS_METODOS;

export type MetodoPagoAbono = MetodoCobro;

export function esMetodoPagoAbonoValido(valor: string): valor is MetodoPagoAbono {
  return esMetodoCobro(valor);
}

/** Número de transacción obligatorio (Transferencia, Produbanco, DeUna, Mercado Libre). */
export function requiereNumeroTransaccion(metodo: string): boolean {
  return exigeReferencia(metodo);
}

/**
 * Métodos que se ofrecen para cobros nuevos: todos entran a una cuenta real.
 * "Otro" y "Tarjeta" genérica ya no se ofrecen (siguen siendo legibles).
 */
export const METODOS_COBRO_NUEVO = METODOS_VIGENTES;

export function esMetodoCobroNuevoValido(valor: string): valor is MetodoPagoAbono {
  return esMetodoVigente(valor);
}

/** Cómo se muestra cada método, con la cuenta a la que entra el dinero. */
export const ETIQUETA_METODO_PAGO: Record<MetodoPagoAbono, string> = Object.fromEntries(
  TODOS_LOS_METODOS.map((m) => [m, METODOS_COBRO[m].etiqueta])
) as Record<MetodoPagoAbono, string>;

export function etiquetaMetodoPago(metodo: string): string {
  return etiquetaMetodo(metodo);
}
