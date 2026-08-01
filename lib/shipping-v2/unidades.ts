// F-42 — unidades libres de un registro de Shipping Items.
//
// Un registro puede representar varias unidades físicas iguales (`Cantidad`).
// Hasta ahora, comprometer UNA unidad —apartarla para un cliente o montarla
// como repuesto en una orden— marcaba `Reservado = true` y
// `Disponible para venta = false` en el registro ENTERO, dejando invendibles
// las demás. Con REP-000017 (52 unidades) eso significaba congelar 52 por
// comprometer 1.
//
// `Cantidad Reservada` cuenta cuántas unidades están comprometidas pero aún
// no vendidas. Comprometer ya NO descuenta inventario: la pieza sigue siendo
// tuya y sigue contando en el stock. Solo una factura o un recibo reducen
// `Cantidad` (postEmision / descontarInventarioRecibo).
//
// Este módulo es aritmética pura, sin red, para poder probarlo entero.

/** Lo mínimo que hace falta saber de un item para razonar sobre sus unidades. */
export type UnidadesItem = {
  cantidad?: number | null;
  cantidadReservada?: number | null;
  /** Bandera vieja por registro. Solo se usa para leer datos anteriores al campo. */
  reservado?: boolean | null;
};

/**
 * Normaliza un número de unidades. Vacío, texto, negativo o decimal → entero
 * ≥ 0. Fail-closed en la cantidad total: un item sin cantidad definida se
 * trata como sin stock, nunca al revés.
 */
export function normalizarUnidades(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/**
 * Unidades comprometidas de un item.
 *
 * Compatibilidad con datos anteriores al campo: si `Cantidad Reservada` está
 * vacío pero la bandera `Reservado` está encendida, se asume **1 unidad**
 * comprometida, no el registro entero. Es la lectura conservadora: el modelo
 * viejo solo permitía un compromiso a la vez por registro, así que 1 es el
 * número correcto, y suponer más bloquearía stock que sí está libre.
 */
export function unidadesReservadas(item: UnidadesItem): number {
  const explicita = normalizarUnidades(item.cantidadReservada);
  if (explicita > 0) return explicita;
  if (item.reservado === true) return 1;
  return 0;
}

/**
 * Unidades realmente disponibles para comprometer o vender.
 * Nunca negativo: si los datos están descuadrados (más reservadas que
 * existentes) se devuelve 0 en vez de un número imposible.
 */
export function unidadesLibres(item: UnidadesItem): number {
  return Math.max(0, normalizarUnidades(item.cantidad) - unidadesReservadas(item));
}

/** ¿Están todas las unidades comprometidas? */
export function totalmenteReservado(item: UnidadesItem): boolean {
  const total = normalizarUnidades(item.cantidad);
  return total > 0 && unidadesLibres(item) === 0;
}

export type ResultadoComprometer =
  | { ok: true; cantidadReservada: number; reservado: boolean; disponibleVenta: boolean }
  | { ok: false; motivo: string };

/**
 * Calcula el nuevo estado al comprometer `unidades` de un item.
 *
 * `Reservado` y `Disponible para venta` dejan de ser decisiones propias y
 * pasan a DERIVARSE de las unidades: reservado del todo solo cuando no queda
 * ninguna libre. Así las dos banderas y la cantidad no pueden volver a
 * contradecirse (era parte de F-15/F-28).
 */
export function comprometerUnidades(item: UnidadesItem, unidades = 1): ResultadoComprometer {
  const pedidas = normalizarUnidades(unidades);
  if (pedidas < 1) return { ok: false, motivo: "Hay que comprometer al menos 1 unidad." };

  const total = normalizarUnidades(item.cantidad);
  if (total < 1) return { ok: false, motivo: "Este artículo no tiene unidades en stock." };

  const libres = unidadesLibres(item);
  if (libres < pedidas) {
    return {
      ok: false,
      motivo:
        libres === 0
          ? "Todas las unidades de este artículo ya están comprometidas."
          : `Solo quedan ${libres} unidad(es) libres de ${total}; se pidieron ${pedidas}.`,
    };
  }

  const nuevaReservada = unidadesReservadas(item) + pedidas;
  const quedanLibres = total - nuevaReservada;
  return {
    ok: true,
    cantidadReservada: nuevaReservada,
    reservado: quedanLibres === 0,
    disponibleVenta: quedanLibres > 0,
  };
}

/**
 * Calcula el nuevo estado al liberar `unidades`. Idempotente y tolerante:
 * liberar más de lo comprometido deja el contador en 0 en vez de fallar —
 * soltar stock nunca debe romperse, a diferencia de comprometerlo.
 */
export function liberarUnidades(item: UnidadesItem, unidades = 1): {
  cantidadReservada: number;
  reservado: boolean;
  disponibleVenta: boolean;
} {
  const total = normalizarUnidades(item.cantidad);
  const nuevaReservada = Math.max(0, unidadesReservadas(item) - Math.max(1, normalizarUnidades(unidades)));
  const quedanLibres = Math.max(0, total - nuevaReservada);
  return {
    cantidadReservada: nuevaReservada,
    reservado: total > 0 && quedanLibres === 0,
    disponibleVenta: quedanLibres > 0,
  };
}
