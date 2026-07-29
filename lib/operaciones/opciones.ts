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
