// Reglas PURAS de validación de una opción de cotización (sin Airtable, sin
// React, testeables).
//
// Por qué importa ahora: desde que el "Total Cotizado" de la operación se
// deriva de la opción elegida, una opción sin precio hace que la operación
// muestre total 0 y el tablero diga "Sin cotizar" aunque ya se le haya pasado
// una propuesta al cliente. Antes no se validaba nada al crear una opción y en
// producción quedaron dos casos: una llamada literalmente
// "NO ELEGIBLE (ELIMINAR)" y otra sin precio.

export type ErrorOpcion = string | null;

const MAX_DESCRIPCION = 500;

/**
 * Valida los datos de una opción antes de guardarla.
 * Devuelve el mensaje de error, o null si está bien.
 */
export function validarOpcion(input: {
  productoDescripcion?: string | null;
  precioVentaCliente?: number | null;
  costoProveedor?: number | null;
}): ErrorOpcion {
  const descripcion = (input.productoDescripcion ?? "").trim();
  if (!descripcion) return "Describe el producto que estás cotizando.";
  if (descripcion.length > MAX_DESCRIPCION) {
    return `La descripción no puede pasar de ${MAX_DESCRIPCION} caracteres.`;
  }

  const precio = input.precioVentaCliente;
  if (precio == null || !Number.isFinite(precio)) {
    return "Falta el precio de venta al cliente. Es lo que se le va a cobrar y define el total de la operación.";
  }
  if (precio <= 0) return "El precio de venta al cliente debe ser mayor a 0.";

  const costo = input.costoProveedor;
  if (costo != null) {
    if (!Number.isFinite(costo)) return "El costo del proveedor no es un número válido.";
    if (costo < 0) return "El costo del proveedor no puede ser negativo.";
  }

  return null;
}

// ─── Cantidad y precio unitario (sept-2026) ──────────────────────────────────
//
// Antes una opción no tenía cantidad: "4 cámaras Yi Home — $120" se guardaba
// como UN artículo de $120, y al pasar a Pedido nacía en inventario con
// Cantidad 1 y precio $120 (caso OP-2026-000060 / OTR-000187).
//
// Ahora la opción guarda "Cantidad" y "Precio unitario cliente". "Precio Venta
// Cliente" sigue siendo el TOTAL de la opción —así lo leen el tablero, el
// cobro, el WhatsApp y la cuenta del cliente— y lo calcula el portal:
//   total = cantidad × precio unitario.
// Opciones anteriores (sin cantidad) valen como 1 unidad a su precio total.

export const MAX_CANTIDAD_OPCION = 9999;

const redondear2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Cantidad de una opción: vacío/0/inválido → 1 (dato anterior al campo). */
export function cantidadDeOpcion(valor: unknown): number {
  const n = typeof valor === "number" ? valor : parseFloat(String(valor ?? ""));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

/**
 * Precio de UNA unidad. Si la opción ya guarda el unitario se usa; si no
 * (opciones anteriores) se deriva del total.
 */
export function precioUnitarioDeOpcion(opcion: {
  cantidad?: unknown;
  precioUnitarioCliente?: number | null;
  precioVentaCliente?: number | null;
}): number | null {
  if (typeof opcion.precioUnitarioCliente === "number" && Number.isFinite(opcion.precioUnitarioCliente)) {
    return opcion.precioUnitarioCliente;
  }
  if (typeof opcion.precioVentaCliente !== "number" || !Number.isFinite(opcion.precioVentaCliente)) return null;
  return redondear2(opcion.precioVentaCliente / cantidadDeOpcion(opcion.cantidad));
}

/** Valida la cantidad que escribió el usuario (no la de datos viejos). */
export function validarCantidadOpcion(valor: unknown): ErrorOpcion {
  if (valor === undefined || valor === null || valor === "") return null; // vacío = 1
  const n = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return "La cantidad debe ser un número entero.";
  if (n < 1) return "La cantidad debe ser al menos 1.";
  if (n > MAX_CANTIDAD_OPCION) return `La cantidad no puede pasar de ${MAX_CANTIDAD_OPCION}.`;
  return null;
}

/**
 * Resuelve los tres valores que se guardan juntos. Acepta el precio como
 * unitario (lo normal desde la pantalla) o, por compatibilidad, como total.
 * Devuelve null en los precios si no hay ninguno (quien llama valida).
 */
export function resolverPreciosOpcion(input: {
  cantidad?: unknown;
  precioUnitarioCliente?: number | null;
  precioVentaCliente?: number | null;
}): { cantidad: number; precioUnitario: number | null; total: number | null } {
  const cantidad = cantidadDeOpcion(input.cantidad);
  const unitario = typeof input.precioUnitarioCliente === "number" && Number.isFinite(input.precioUnitarioCliente)
    ? input.precioUnitarioCliente
    : null;
  if (unitario !== null) {
    return { cantidad, precioUnitario: redondear2(unitario), total: redondear2(unitario * cantidad) };
  }
  const total = typeof input.precioVentaCliente === "number" && Number.isFinite(input.precioVentaCliente)
    ? input.precioVentaCliente
    : null;
  if (total === null) return { cantidad, precioUnitario: null, total: null };
  return { cantidad, precioUnitario: redondear2(total / cantidad), total: redondear2(total) };
}
