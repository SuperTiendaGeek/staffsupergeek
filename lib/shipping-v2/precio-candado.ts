// Punto 18 (decisión del dueño, 25-oct-2026): el precio de venta de un
// artículo que YA existe solo lo cambia el Administrador. Es un candado
// absoluto, igual que "Cantidad": no depende de la configuración por persona
// ("Campos restringidos") y se valida en el servidor.
//
// Lo que NO toca este candado (también decidido el 25-oct):
// - Poner el precio al CREAR: Registrar compra, pieza de despiece o la pieza
//   que sale de una mejora. Lo sigue haciendo el personal.
// - La decisión "Se vende con descuento" de una novedad (punto 8), que tiene
//   su propio permiso y queda en el historial de la novedad.
//
// Puro, sin red: se prueba en __tests__/precio-candado.test.ts.

import { SHIPPING_V2_ITEM_FIELDS } from "@/lib/shipping-v2/schema.generated";

export const MENSAJE_PRECIO_SOLO_ADMIN = "Solo el Administrador cambia el precio de venta de un artículo.";

/** Claves de la ficha (config.key) y nombres de campo de Airtable del precio de venta. */
const CAMPOS_PRECIO = new Set<string>([
  "precioVenta",
  "precioVentaSugerido",
  "precioVentaFinal",
  SHIPPING_V2_ITEM_FIELDS.precioVentaFinal,
  SHIPPING_V2_ITEM_FIELDS.precioVentaSugerido,
]);

export function esCampoPrecioVenta(campo: string): boolean {
  return CAMPOS_PRECIO.has(String(campo ?? "").trim());
}

function aCentavos(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

type Precios = { precioVenta?: unknown; precioVentaSugerido?: unknown };

/**
 * ¿Este cambio toca el precio sin ser Administrador? Devuelve el mensaje de
 * error, o null si se puede guardar.
 */
export function cambioDePrecioBloqueado(input: { esAdmin: boolean; antes: Precios; despues: Precios }): string | null {
  if (input.esAdmin) return null;
  const cambio = (["precioVenta", "precioVentaSugerido"] as const).some((clave) => {
    if (!(clave in input.despues)) return false;
    return aCentavos(input.despues[clave]) !== aCentavos(input.antes[clave]);
  });
  return cambio ? MENSAJE_PRECIO_SOLO_ADMIN : null;
}
