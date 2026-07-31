import { round2 } from "@/lib/finanzas/validaciones";

export type ShippingV2PackingProviderCostItemLike = {
  id?: string;
  sku?: string;
  cantidad?: number | null;
  costoProveedor?: number | null;
  esRegalo?: boolean | null;
  costoFleteAsignado?: number | null;
  costoArancelAsignado?: number | null;
  otrosCostosAsignados?: number | null;
  costoLogisticoAsignado?: number | null;
  costoTotalUnidad?: number | null;
};

export type ShippingV2PackingProviderCostSummary = {
  costoTotalProveedorItems: number;
  referenciasIncluidas: number;
  unidadesTotales: number;
};

function itemLabel(item: ShippingV2PackingProviderCostItemLike) {
  return item.sku || item.id || "Item";
}

export function getShippingV2PackingItemQuantity(item: ShippingV2PackingProviderCostItemLike): number {
  const cantidad = item.cantidad;
  if (!Number.isInteger(cantidad) || cantidad === null || cantidad === undefined || cantidad <= 0) {
    throw new Error(`Cantidad inválida para ${itemLabel(item)}: debe ser un entero mayor a 0.`);
  }
  return cantidad;
}

export function calculateShippingV2PackingProviderItemSubtotal(item: ShippingV2PackingProviderCostItemLike): number {
  const cantidad = getShippingV2PackingItemQuantity(item);
  if (item.esRegalo) return 0;

  const costoProveedor = item.costoProveedor;
  if (costoProveedor === null || costoProveedor === undefined || costoProveedor === 0) return 0;
  if (typeof costoProveedor !== "number" || !Number.isFinite(costoProveedor) || costoProveedor < 0) {
    throw new Error(`Costo proveedor inválido para ${itemLabel(item)}: debe ser mayor o igual a 0.`);
  }

  return round2(cantidad * costoProveedor);
}

export function withShippingV2PackingProviderItemSubtotal<T extends ShippingV2PackingProviderCostItemLike>(
  item: T
): T & { subtotalProveedorPacking: number } {
  return {
    ...item,
    subtotalProveedorPacking: calculateShippingV2PackingProviderItemSubtotal(item),
  };
}

export function calculateShippingV2PackingProviderCostSummary(
  items: ShippingV2PackingProviderCostItemLike[]
): ShippingV2PackingProviderCostSummary {
  return {
    costoTotalProveedorItems: round2(items.reduce((sum, item) => sum + calculateShippingV2PackingProviderItemSubtotal(item), 0)),
    referenciasIncluidas: items.length,
    unidadesTotales: items.reduce((sum, item) => sum + getShippingV2PackingItemQuantity(item), 0),
  };
}

export function formatShippingV2PackingItemsUnitsSummary(
  summary: Pick<ShippingV2PackingProviderCostSummary, "referenciasIncluidas" | "unidadesTotales">
): string {
  const itemLabel = summary.referenciasIncluidas === 1 ? "ítem" : "ítems";
  const unitLabel = summary.unidadesTotales === 1 ? "unidad" : "unidades";
  return `${summary.referenciasIncluidas} ${itemLabel} · ${summary.unidadesTotales} ${unitLabel}`;
}

export function withShippingV2PackingProviderCostSummary<T extends { items: ShippingV2PackingProviderCostItemLike[] }>(
  packing: T
): T & ShippingV2PackingProviderCostSummary & { items: Array<T["items"][number] & { subtotalProveedorPacking: number }> } {
  const items = packing.items.map((item) => withShippingV2PackingProviderItemSubtotal(item));
  const summary = calculateShippingV2PackingProviderCostSummary(items);
  return {
    ...packing,
    ...summary,
    items,
  };
}
