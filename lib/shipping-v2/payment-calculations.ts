import { round2 } from "@/lib/finanzas/validaciones";

export const SHIPPING_V2_ACTIVE_PAYMENT_ITEM_LOCK_MESSAGE =
  "Este Item está relacionado con un Pago activo. No se puede modificar su cantidad o costo proveedor.";

export type ShippingV2PaymentItemLike = {
  id?: string;
  sku?: string;
  cantidad?: number | null;
  costoProveedor?: number | null;
  esRegalo?: boolean | null;
  /** Punto 9b: unidades COMPRADAS (no cambian al vender). */
  unidadesCompradas?: number | null;
  /** Unidades que viajaron en la caja (respaldo para datos anteriores). */
  unidadesEnPacking?: number | null;
};

/**
 * Punto 9b (12-oct-2026): el pago se calcula con las unidades COMPRADAS, no
 * con las que quedan en la tienda. Antes un artículo vendido (Cantidad 0)
 * daba "Cantidad inválida" y bloqueaba el pago de toda su caja.
 * Datos anteriores sin "Unidades compradas": se usa lo mayor entre la
 * Cantidad actual y las unidades que viajaron en la caja.
 */
export function unidadesParaPago(item: ShippingV2PaymentItemLike): number | null {
  const compradas = Number(item.unidadesCompradas);
  if (Number.isInteger(compradas) && compradas > 0) return compradas;
  const respaldo = Math.max(Number(item.cantidad) || 0, Number(item.unidadesEnPacking) || 0);
  return Number.isInteger(respaldo) && respaldo > 0 ? respaldo : null;
}

function itemLabel(item: ShippingV2PaymentItemLike) {
  return item.sku || item.id || "Item";
}

export function calculateShippingV2PaymentItemSubtotal(item: ShippingV2PaymentItemLike): number {
  if (item.esRegalo) return 0;
  const cantidad = unidadesParaPago(item);
  const costoProveedor = item.costoProveedor;

  if (cantidad === null) {
    throw new Error(`${itemLabel(item)}: faltan las unidades compradas.`);
  }

  if (typeof costoProveedor !== "number" || !Number.isFinite(costoProveedor) || costoProveedor <= 0) {
    throw new Error(`${itemLabel(item)} no tiene costo: ponle costo o márcalo como regalo.`);
  }

  return round2(cantidad * costoProveedor);
}

export function calculateShippingV2PaymentItemsTotal(items: ShippingV2PaymentItemLike[]): number {
  return round2(items.reduce((sum, item) => sum + calculateShippingV2PaymentItemSubtotal(item), 0));
}
