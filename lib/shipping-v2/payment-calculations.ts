import { round2 } from "@/lib/finanzas/validaciones";

export const SHIPPING_V2_ACTIVE_PAYMENT_ITEM_LOCK_MESSAGE =
  "Este Item está relacionado con un Pago activo. No se puede modificar su cantidad o costo proveedor.";

export type ShippingV2PaymentItemLike = {
  id?: string;
  sku?: string;
  cantidad?: number | null;
  costoProveedor?: number | null;
  esRegalo?: boolean | null;
};

function itemLabel(item: ShippingV2PaymentItemLike) {
  return item.sku || item.id || "Item";
}

export function calculateShippingV2PaymentItemSubtotal(item: ShippingV2PaymentItemLike): number {
  if (item.esRegalo) return 0;
  const cantidad = item.cantidad;
  const costoProveedor = item.costoProveedor;

  if (!Number.isInteger(cantidad) || cantidad === null || cantidad === undefined || cantidad <= 0) {
    throw new Error(`Cantidad inválida para ${itemLabel(item)}: debe ser un entero mayor a 0.`);
  }

  if (typeof costoProveedor !== "number" || !Number.isFinite(costoProveedor) || costoProveedor <= 0) {
    throw new Error(`Costo proveedor inválido para ${itemLabel(item)}: debe ser mayor a 0.`);
  }

  return round2(cantidad * costoProveedor);
}

export function calculateShippingV2PaymentItemsTotal(items: ShippingV2PaymentItemLike[]): number {
  return round2(items.reduce((sum, item) => sum + calculateShippingV2PaymentItemSubtotal(item), 0));
}
