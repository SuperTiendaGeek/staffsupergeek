import { createShippingV2ProveedorLabelMap, resolveShippingV2ProveedorLabel } from "@/lib/shipping-v2/provider-labels";
import type { ShippingV2Item, ShippingV2Proveedor } from "@/types/shipping-v2";

export const SHIPPING_V2_ALL_FILTER = "Todos";

export type ShippingV2ItemSortKey =
  | "newest"
  | "oldest"
  | "sku-asc"
  | "sku-desc"
  | "name-asc"
  | "name-desc"
  | "estado"
  | "proveedor-compra"
  | "costo-desc"
  | "precio-desc";

export type ShippingV2ItemGroupKey =
  | "none"
  | "estado"
  | "proveedor-compra"
  | "proveedor-logistico"
  | "packing"
  | "tipo-operacion"
  | "categoria";

export type ShippingV2ResolvedItem = ShippingV2Item & {
  proveedorCompraDisplay: string;
  proveedorLogisticoDisplay: string;
  packingLabel?: string;
};

export type ShippingV2ItemGroup<TItem extends ShippingV2ResolvedItem = ShippingV2ResolvedItem> = {
  key: string;
  label: string;
  items: TItem[];
};

export type ShippingV2ItemFilterState = {
  search: string;
  estado: string;
  tipoOperacion: string;
  proveedorCompra: string;
  tipoItem: string;
};

export const shippingV2ItemSortOptions: Array<{ value: ShippingV2ItemSortKey; label: string }> = [
  { value: "newest", label: "Más nuevos primero" },
  { value: "oldest", label: "Más antiguos primero" },
  { value: "sku-asc", label: "SKU A-Z" },
  { value: "sku-desc", label: "SKU Z-A" },
  { value: "name-asc", label: "Nombre A-Z" },
  { value: "name-desc", label: "Nombre Z-A" },
  { value: "estado", label: "Estado" },
  { value: "proveedor-compra", label: "Proveedor de compra" },
  { value: "costo-desc", label: "Costo mayor a menor" },
  { value: "precio-desc", label: "Precio mayor a menor" },
];

export const shippingV2ItemGroupOptions: Array<{ value: ShippingV2ItemGroupKey; label: string }> = [
  { value: "none", label: "Sin agrupar" },
  { value: "estado", label: "Estado Item" },
  { value: "proveedor-compra", label: "Proveedor de compra" },
  { value: "proveedor-logistico", label: "Proveedor logístico / intermediario" },
  { value: "packing", label: "Packing relacionado" },
  { value: "tipo-operacion", label: "Tipo de operación" },
  { value: "categoria", label: "Categoría" },
];

export function normalizeShippingV2ListText(value?: string | null) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function displayShippingV2ListValue(value?: string | number | null, fallback = "—") {
  if (value === null || value === undefined) return fallback;
  const stringValue = String(value).trim();
  return stringValue || fallback;
}

export function getShippingV2ItemQuantity(item: Pick<ShippingV2Item, "cantidad" | "qty">) {
  if (typeof item.cantidad === "number" && Number.isFinite(item.cantidad)) return item.cantidad;
  if (typeof item.qty === "number" && Number.isFinite(item.qty)) return item.qty;
  return null;
}

export function formatShippingV2ItemQuantity(item: Pick<ShippingV2Item, "cantidad" | "qty">, fallback = "—") {
  const quantity = getShippingV2ItemQuantity(item);
  if (quantity === null) return fallback;
  return new Intl.NumberFormat("es-EC", { maximumFractionDigits: Number.isInteger(quantity) ? 0 : 2 }).format(quantity);
}

export function resolveShippingV2Items<TItem extends ShippingV2Item>(
  items: TItem[],
  proveedores: ShippingV2Proveedor[]
): Array<TItem & ShippingV2ResolvedItem> {
  const providerLabelsById = createShippingV2ProveedorLabelMap(proveedores);
  return items.map((item) => ({
    ...item,
    proveedorCompraDisplay: resolveShippingV2ProveedorLabel(item.proveedorId, providerLabelsById),
    proveedorLogisticoDisplay: resolveShippingV2ProveedorLabel(item.proveedorLogisticoId, providerLabelsById),
  }));
}

export function shippingV2PackingLabel(item: ShippingV2ResolvedItem) {
  return item.packingLabel || item.packingId || "";
}

export function uniqueShippingV2ItemValues<TItem extends ShippingV2ResolvedItem>(
  items: TItem[],
  getValue: (item: TItem) => string | undefined
) {
  return Array.from(
    new Set(items.map(getValue).map((value) => value?.trim()).filter((value): value is string => Boolean(value)))
  ).sort((a, b) => a.localeCompare(b, "es"));
}

export function getShippingV2ItemFilterOptions<TItem extends ShippingV2ResolvedItem>(items: TItem[]) {
  return {
    estados: uniqueShippingV2ItemValues(items, (item) => item.estado),
    operaciones: uniqueShippingV2ItemValues(items, (item) => item.tipoOperacion),
    proveedores: uniqueShippingV2ItemValues(items, (item) => item.proveedorCompraDisplay),
    tipos: uniqueShippingV2ItemValues(items, (item) => item.tipoItem),
  };
}

export function filterShippingV2Items<TItem extends ShippingV2ResolvedItem>(
  items: TItem[],
  filters: ShippingV2ItemFilterState
) {
  const query = normalizeShippingV2ListText(filters.search);
  const tokens = query.split(" ").filter(Boolean);

  return items.filter((item) => {
    const searchText = [
      item.sku,
      item.skuProveedor,
      item.nombre,
      item.modelo,
      item.marca,
      item.numeroSerie,
      item.proveedorCompraDisplay,
      item.proveedorLogisticoDisplay,
      shippingV2PackingLabel(item),
      item.trackingDirecto,
      item.trackingHaciaIntermediario,
      item.trackingDesdeIntermediario,
      item.trackingUsa,
      item.trackingEc,
      item.estado,
      item.tipoOperacion,
    ].map((value) => normalizeShippingV2ListText(value ?? "")).join(" ");

    return (
      (!query || tokens.every((token) => searchText.includes(token))) &&
      (filters.estado === SHIPPING_V2_ALL_FILTER || item.estado === filters.estado) &&
      (filters.tipoOperacion === SHIPPING_V2_ALL_FILTER || item.tipoOperacion === filters.tipoOperacion) &&
      (filters.proveedorCompra === SHIPPING_V2_ALL_FILTER || item.proveedorCompraDisplay === filters.proveedorCompra) &&
      (filters.tipoItem === SHIPPING_V2_ALL_FILTER || item.tipoItem === filters.tipoItem)
    );
  });
}

function timestampValue(item: ShippingV2ResolvedItem) {
  const parsed = Date.parse(item.fechaRegistro || item.createdTime || "");
  return Number.isNaN(parsed) ? -Infinity : parsed;
}

function compareText(a: string | null | undefined, b: string | null | undefined) {
  return displayShippingV2ListValue(a, "").localeCompare(displayShippingV2ListValue(b, ""), "es", {
    numeric: true,
    sensitivity: "base",
  });
}

function compareNumberDesc(a: number | null | undefined, b: number | null | undefined) {
  return (b ?? -Infinity) - (a ?? -Infinity);
}

export function sortShippingV2Items<TItem extends ShippingV2ResolvedItem>(
  items: TItem[],
  sortBy: ShippingV2ItemSortKey
) {
  return [...items].sort((a, b) => {
    const byNewest = timestampValue(b) - timestampValue(a);
    const byOldest = timestampValue(a) - timestampValue(b);

    switch (sortBy) {
      case "oldest":
        return byOldest || compareText(a.sku, b.sku);
      case "sku-asc":
        return compareText(a.sku, b.sku) || byNewest;
      case "sku-desc":
        return compareText(b.sku, a.sku) || byNewest;
      case "name-asc":
        return compareText(a.nombre, b.nombre) || byNewest;
      case "name-desc":
        return compareText(b.nombre, a.nombre) || byNewest;
      case "estado":
        return compareText(a.estado, b.estado) || byNewest;
      case "proveedor-compra":
        return compareText(a.proveedorCompraDisplay, b.proveedorCompraDisplay) || byNewest;
      case "costo-desc":
        return compareNumberDesc(a.costoProveedor, b.costoProveedor) || byNewest;
      case "precio-desc":
        return compareNumberDesc(a.precioVenta, b.precioVenta) || byNewest;
      case "newest":
      default:
        return byNewest || compareText(a.sku, b.sku);
    }
  });
}

function groupValue(item: ShippingV2ResolvedItem, groupBy: ShippingV2ItemGroupKey) {
  switch (groupBy) {
    case "estado":
      return item.estado;
    case "proveedor-compra":
      return item.proveedorCompraDisplay;
    case "proveedor-logistico":
      return item.proveedorLogisticoDisplay;
    case "packing":
      return shippingV2PackingLabel(item);
    case "tipo-operacion":
      return item.tipoOperacion;
    case "categoria":
      return item.categoria;
    case "none":
    default:
      return "";
  }
}

export function groupShippingV2Items<TItem extends ShippingV2ResolvedItem>(
  items: TItem[],
  groupBy: ShippingV2ItemGroupKey
): Array<ShippingV2ItemGroup<TItem>> {
  if (groupBy === "none") return [{ key: "all", label: "", items }];

  const groups = new Map<string, ShippingV2ItemGroup<TItem>>();
  items.forEach((item) => {
    const rawLabel = displayShippingV2ListValue(groupValue(item, groupBy), "Sin dato");
    const label = rawLabel === "—" ? "Sin dato" : rawLabel;
    const key = normalizeShippingV2ListText(label) || "sin-dato";
    const group = groups.get(key) || { key, label, items: [] };
    group.items.push(item);
    groups.set(key, group);
  });

  return Array.from(groups.values());
}

export function getShippingV2SortOptions(canViewCosts: boolean, canViewProviderCost: boolean) {
  return shippingV2ItemSortOptions.filter((option) => {
    if (option.value === "costo-desc") return canViewProviderCost;
    if (option.value === "precio-desc") return canViewCosts;
    return true;
  });
}

export function sanitizeShippingV2ProviderSort(
  sortBy: ShippingV2ItemSortKey,
  canViewCosts: boolean,
  canViewProviderCost: boolean
): ShippingV2ItemSortKey {
  if (sortBy === "costo-desc" && !canViewProviderCost) return "newest";
  if (sortBy === "precio-desc" && !canViewCosts) return "newest";
  return sortBy;
}
