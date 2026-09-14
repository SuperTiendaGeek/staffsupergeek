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
  /** Cuántos registros usaron unidades estimadas en vez de la Cantidad actual. */
  referenciasConUnidadesEstimadas: number;
  /** Aviso por registro con unidades estimadas, para mostrarlo en pantalla. */
  advertenciasUnidades: string[];
};

export type ShippingV2PackingItemUnits = {
  unidades: number;
  /** true cuando la Cantidad actual del item ya no sirve como dato histórico. */
  estimada: boolean;
  advertencia: string;
};

function itemLabel(item: ShippingV2PackingProviderCostItemLike) {
  return item.sku || item.id || "Item";
}

/**
 * Unidades que viajaron dentro del packing.
 *
 * `Cantidad` en Shipping Items es STOCK ACTUAL, no un dato histórico: una
 * factura o un recibo lo descuentan (postEmision / descontarInventarioRecibo).
 * Cuando el artículo ya se vendió, `Cantidad` llega a 0 — y eso NO significa
 * que la caja viajara vacía.
 *
 * Un packing es un registro histórico de solo lectura, así que esta función
 * NUNCA lanza: si la Cantidad actual ya no sirve como referencia se asume
 * 1 unidad por registro (el mismo criterio que usa el propio Airtable en
 * "Cantidad Items Packing", que es un count de registros vinculados) y se
 * marca como estimada para que la pantalla pueda advertirlo.
 *
 * Para validar una ESCRITURA (crear un pago, por ejemplo) no se usa esto:
 * ahí sí hace falta rechazar, y para eso está
 * `assertShippingV2PackingItemQuantity`.
 */
export function resolveShippingV2PackingItemUnits(
  item: ShippingV2PackingProviderCostItemLike
): ShippingV2PackingItemUnits {
  const cantidad = item.cantidad;
  if (typeof cantidad === "number" && Number.isInteger(cantidad) && cantidad > 0) {
    return { unidades: cantidad, estimada: false, advertencia: "" };
  }
  const detalle = cantidad === null || cantidad === undefined
    ? "no tiene Cantidad registrada"
    : cantidad === 0
      ? "ya no tiene unidades en stock (vendido o consumido)"
      : `tiene una Cantidad no válida para inventario (${cantidad})`;
  return {
    unidades: 1,
    estimada: true,
    advertencia: `${itemLabel(item)} ${detalle}; el histórico del packing se calcula con 1 unidad.`,
  };
}

/**
 * Validación estricta para rutas de ESCRITURA. Lanza si la cantidad no sirve.
 * No usar al leer packings ya cerrados: ver resolveShippingV2PackingItemUnits.
 */
export function assertShippingV2PackingItemQuantity(item: ShippingV2PackingProviderCostItemLike): number {
  const cantidad = item.cantidad;
  if (typeof cantidad !== "number" || !Number.isInteger(cantidad) || cantidad <= 0) {
    throw new Error(`Cantidad inválida para ${itemLabel(item)}: debe ser un entero mayor a 0.`);
  }
  return cantidad;
}

export function getShippingV2PackingItemQuantity(item: ShippingV2PackingProviderCostItemLike): number {
  return resolveShippingV2PackingItemUnits(item).unidades;
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
): T & { subtotalProveedorPacking: number; unidadesPacking: number; unidadesPackingEstimadas: boolean } {
  const unidades = resolveShippingV2PackingItemUnits(item);
  return {
    ...item,
    subtotalProveedorPacking: calculateShippingV2PackingProviderItemSubtotal(item),
    unidadesPacking: unidades.unidades,
    unidadesPackingEstimadas: unidades.estimada,
  };
}

export function calculateShippingV2PackingProviderCostSummary(
  items: ShippingV2PackingProviderCostItemLike[]
): ShippingV2PackingProviderCostSummary {
  const unidadesPorItem = items.map((item) => resolveShippingV2PackingItemUnits(item));
  return {
    costoTotalProveedorItems: round2(items.reduce((sum, item) => sum + calculateShippingV2PackingProviderItemSubtotal(item), 0)),
    referenciasIncluidas: items.length,
    unidadesTotales: unidadesPorItem.reduce((sum, unidades) => sum + unidades.unidades, 0),
    referenciasConUnidadesEstimadas: unidadesPorItem.filter((unidades) => unidades.estimada).length,
    advertenciasUnidades: unidadesPorItem.filter((unidades) => unidades.estimada).map((unidades) => unidades.advertencia),
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
