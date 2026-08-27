"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from "react";
import { ArrowDownAZ, ArrowLeft, BadgeCheck, Check, ChevronLeft, ChevronRight, ChevronsLeft, FileText, ListFilter, Loader2, Printer, Rows3, Sparkles, Tag, X } from "lucide-react";
import { ItemPhotoViewer } from "@/components/shipping-v2/ItemPhotoViewer";
import { InlineEditableField } from "@/components/shipping-v2/InlineEditableField";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SHIPPING_V2_ITEM_EDIT_FIELDS, type ShippingV2ItemEditFieldConfig } from "@/lib/shipping-v2/item-edit-config";
import {
  SHIPPING_V2_ALL_FILTER,
  filterShippingV2Items,
  formatShippingV2ItemQuantity,
  getShippingV2ItemQuantity,
  getShippingV2ItemFilterOptions,
  getShippingV2SortOptions,
  groupShippingV2Items,
  normalizeShippingV2ListText,
  resolveShippingV2Items,
  sanitizeShippingV2ProviderSort,
  shippingV2ItemGroupOptions,
  sortShippingV2Items,
  type ShippingV2ItemGroupKey,
  type ShippingV2ItemSortKey,
  type ShippingV2ResolvedItem,
} from "@/lib/shipping-v2/item-list-view";
import {
  generateShippingV2FacebookTextOptions,
  getShippingV2FacebookPublicationBlockReason,
  getShippingV2FacebookTextGenerationBlockReason,
  hasShippingV2FacebookPrice,
  hasShippingV2FacebookText,
} from "@/lib/shipping-v2/facebook-super-geek-text";
import { createShippingV2ProveedorLabelMap, getShippingV2ProveedorLabel, resolveShippingV2ProveedorLabel } from "@/lib/shipping-v2/provider-labels";
import { canBeItemLogisticsProvider, canBePurchaseProvider } from "@/lib/shipping-v2/provider-rules";
import { ShippingV2DespieceTab } from "./ShippingV2DespieceTab";
import { isFichaGenerada } from "@/lib/shipping-v2/technical-sheet";
import { ShippingV2ItemsPredictiveSearch } from "./ShippingV2ItemsPredictiveSearch";
import {
  type ShippingV2Attachment,
  type ShippingV2Item,
  type ShippingV2AccessPermissions,
  type ShippingV2Novedad,
  type ShippingV2Packing,
  type ShippingV2Pago,
  type ShippingV2Proveedor,
} from "@/types/shipping-v2";

type Props = {
  items: ShippingV2Item[];
  proveedores: ShippingV2Proveedor[];
  error: string;
  permissions?: ShippingV2AccessPermissions | null;
  providerName?: string;
  initialSortBy: SortKey;
  pagination: {
    pageIndex: number;
    pageSize: number;
    firstHref: string;
    previousHref?: string;
    nextHref?: string;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
  };
};

type SortKey = ShippingV2ItemSortKey;
type GroupKey = ShippingV2ItemGroupKey;
type ToolbarMenuKey = "filters" | "sort" | "group";

export type ResolvedItem = ShippingV2ResolvedItem;

type DetailRow = {
  label: string;
  value: string | number | boolean | null | undefined;
  displayValue?: ReactNode;
  config?: ShippingV2ItemEditFieldConfig;
  readOnly?: boolean;
  options?: readonly string[] | readonly { value: string; label: string }[];
};

type ItemDetailTabKey = "general" | "costos" | "logistica" | "pago" | "packing" | "observaciones" | "despiece";

const ALL = SHIPPING_V2_ALL_FILTER;
const groupOptions = shippingV2ItemGroupOptions;
const normalizeText = normalizeShippingV2ListText;
const getSortOptions = getShippingV2SortOptions;
const sanitizeProviderSort = sanitizeShippingV2ProviderSort;
const sortItems = sortShippingV2Items;
const groupItems = groupShippingV2Items;

const COLUMN_WIDTHS_STORAGE_KEY = "shipping-v2-items-column-widths";
const TABLE_VIEW_STORAGE_KEY = "shipping-v2-items-table-view";

type ShippingV2ItemsColumnKey =
  | "sku"
  | "supplierSku"
  | "name"
  | "quantity"
  | "operationType"
  | "itemStatus"
  | "generalRole"
  | "category"
  | "purchaseProvider"
  | "logisticProvider"
  | "packing"
  | "providerCost"
  | "salePrice"
  | "createdAt"
  | "brand"
  | "model"
  | "serial"
  | "condition"
  | "location"
  | "triangulationStatus"
  | "reviewStatus"
  | "availability"
  | "facebookSuperGeek"
  | "requiresPayment"
  | "requiresPacking"
  | "physicalReview"
  | "notes";

type ShippingV2ItemsColumn = {
  key: ShippingV2ItemsColumnKey;
  label: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth?: number;
  align?: "left" | "right" | "center";
  defaultVisible: boolean;
  required?: boolean;
  category: "Principal" | "Compra" | "Logística" | "Inventario" | "Revisión" | "Sistema";
};

const AVAILABLE_COLUMNS: ShippingV2ItemsColumn[] = [
  { key: "sku", label: "SKU", defaultWidth: 110, minWidth: 90, defaultVisible: true, required: true, category: "Principal" },
  { key: "supplierSku", label: "SKU proveedor", defaultWidth: 140, minWidth: 110, defaultVisible: true, category: "Principal" },
  { key: "name", label: "Nombre", defaultWidth: 280, minWidth: 180, defaultVisible: true, required: true, category: "Principal" },
  { key: "quantity", label: "Cantidad", defaultWidth: 86, minWidth: 74, maxWidth: 110, align: "center", defaultVisible: true, required: true, category: "Principal" },
  { key: "operationType", label: "Tipo de operación", defaultWidth: 150, minWidth: 130, defaultVisible: true, category: "Compra" },
  { key: "itemStatus", label: "Estado item", defaultWidth: 140, minWidth: 120, defaultVisible: true, category: "Principal" },
  { key: "generalRole", label: "Rol general", defaultWidth: 140, minWidth: 120, defaultVisible: true, category: "Principal" },
  { key: "category", label: "Categoría", defaultWidth: 120, minWidth: 100, defaultVisible: true, category: "Principal" },
  { key: "purchaseProvider", label: "Proveedor compra", defaultWidth: 160, minWidth: 130, defaultVisible: true, category: "Compra" },
  { key: "logisticProvider", label: "Proveedor logístico", defaultWidth: 170, minWidth: 140, defaultVisible: true, category: "Logística" },
  { key: "packing", label: "Packing", defaultWidth: 120, minWidth: 100, defaultVisible: true, category: "Logística" },
  { key: "providerCost", label: "Costo proveedor", defaultWidth: 130, minWidth: 110, align: "right", defaultVisible: true, category: "Compra" },
  { key: "salePrice", label: "Precio venta unit.", defaultWidth: 130, minWidth: 120, align: "right", defaultVisible: true, category: "Inventario" },
  { key: "createdAt", label: "Fecha registro", defaultWidth: 150, minWidth: 130, defaultVisible: true, category: "Sistema" },
  { key: "brand", label: "Marca", defaultWidth: 120, minWidth: 100, defaultVisible: false, category: "Principal" },
  { key: "model", label: "Modelo", defaultWidth: 160, minWidth: 120, defaultVisible: false, category: "Principal" },
  { key: "serial", label: "Serie", defaultWidth: 150, minWidth: 120, defaultVisible: false, category: "Principal" },
  { key: "condition", label: "Condición", defaultWidth: 130, minWidth: 110, defaultVisible: false, category: "Inventario" },
  { key: "location", label: "Ubicación", defaultWidth: 140, minWidth: 110, defaultVisible: false, category: "Inventario" },
  { key: "triangulationStatus", label: "Triangulación", defaultWidth: 150, minWidth: 120, defaultVisible: false, category: "Logística" },
  { key: "reviewStatus", label: "Estado revisión", defaultWidth: 150, minWidth: 120, defaultVisible: false, category: "Revisión" },
  { key: "availability", label: "Disponibilidad", defaultWidth: 140, minWidth: 120, defaultVisible: false, category: "Inventario" },
  { key: "facebookSuperGeek", label: "Facebook SG", defaultWidth: 112, minWidth: 96, maxWidth: 132, align: "center", defaultVisible: true, category: "Inventario" },
  { key: "requiresPayment", label: "Requiere pago", defaultWidth: 130, minWidth: 110, defaultVisible: false, category: "Compra" },
  { key: "requiresPacking", label: "Requiere packing", defaultWidth: 140, minWidth: 120, defaultVisible: false, category: "Logística" },
  { key: "physicalReview", label: "Revisión física", defaultWidth: 140, minWidth: 120, defaultVisible: false, category: "Revisión" },
  { key: "notes", label: "Observaciones", defaultWidth: 260, minWidth: 180, defaultVisible: false, category: "Principal" },
];

const COLUMN_CATEGORIES: ShippingV2ItemsColumn["category"][] = ["Principal", "Compra", "Logística", "Inventario", "Revisión", "Sistema"];

type ShippingV2ItemsColumnWidths = Record<ShippingV2ItemsColumnKey, number>;

type ShippingV2ItemsTableViewConfig = {
  orderedColumnKeys: ShippingV2ItemsColumnKey[];
  visibleColumnKeys: ShippingV2ItemsColumnKey[];
};

type ItemCellRenderContext = {
  canEditFacebookSuperGeek: boolean;
  facebookSuperGeekBusyId: string;
  onFacebookSuperGeekChange: (item: ResolvedItem, value: boolean) => void;
};

function displayValue(value?: string | number | null, fallback = "—") {
  if (value === null || value === undefined) return fallback;
  const stringValue = String(value).trim();
  return stringValue || fallback;
}

function displayName(value?: string | null) {
  return displayValue(value, "Sin nombre");
}

function createDefaultColumnWidths(): ShippingV2ItemsColumnWidths {
  return AVAILABLE_COLUMNS.reduce((widths, column) => {
    widths[column.key] = column.defaultWidth;
    return widths;
  }, {} as ShippingV2ItemsColumnWidths);
}

function clampColumnWidth(width: number, column: ShippingV2ItemsColumn) {
  return Math.min(Math.max(width, column.minWidth), column.maxWidth ?? Number.POSITIVE_INFINITY);
}

function isColumnKey(value: unknown): value is ShippingV2ItemsColumnKey {
  return typeof value === "string" && AVAILABLE_COLUMNS.some((column) => column.key === value);
}

function createDefaultTableViewConfig(): ShippingV2ItemsTableViewConfig {
  return {
    orderedColumnKeys: AVAILABLE_COLUMNS.map((column) => column.key),
    visibleColumnKeys: AVAILABLE_COLUMNS.filter((column) => column.defaultVisible).map((column) => column.key),
  };
}

const restrictedInternalColumns = new Set<ShippingV2ItemsColumnKey>(["salePrice"]);

function getAvailableColumns(canViewCosts: boolean, canViewProviderCost: boolean) {
  return AVAILABLE_COLUMNS.filter((column) => {
    if (column.key === "providerCost") return canViewProviderCost;
    if (restrictedInternalColumns.has(column.key)) return canViewCosts;
    return true;
  });
}

function sanitizeTableViewConfig(input?: Partial<ShippingV2ItemsTableViewConfig> | null, availableColumns = AVAILABLE_COLUMNS): ShippingV2ItemsTableViewConfig {
  const defaults = createDefaultTableViewConfig();
  const availableColumnKeys = new Set(availableColumns.map((column) => column.key));
  const orderedFromInput = Array.isArray(input?.orderedColumnKeys)
    ? input.orderedColumnKeys.filter((key) => isColumnKey(key) && availableColumnKeys.has(key))
    : defaults.orderedColumnKeys.filter((key) => availableColumnKeys.has(key));
  const visibleFromInput = Array.isArray(input?.visibleColumnKeys)
    ? input.visibleColumnKeys.filter((key) => isColumnKey(key) && availableColumnKeys.has(key))
    : defaults.visibleColumnKeys.filter((key) => availableColumnKeys.has(key));

  let orderedColumnKeys = [
    ...orderedFromInput,
    ...availableColumns.map((column) => column.key).filter((key) => !orderedFromInput.includes(key)),
  ];

  if (!orderedFromInput.includes("quantity") && orderedColumnKeys.includes("quantity") && orderedColumnKeys.includes("name")) {
    orderedColumnKeys = orderedColumnKeys.filter((key) => key !== "quantity");
    const nameIndex = orderedColumnKeys.indexOf("name");
    orderedColumnKeys.splice(nameIndex + 1, 0, "quantity");
  }

  if (!orderedFromInput.includes("facebookSuperGeek") && orderedColumnKeys.includes("facebookSuperGeek") && orderedColumnKeys.includes("availability")) {
    orderedColumnKeys = orderedColumnKeys.filter((key) => key !== "facebookSuperGeek");
    const availabilityIndex = orderedColumnKeys.indexOf("availability");
    orderedColumnKeys.splice(availabilityIndex + 1, 0, "facebookSuperGeek");
  }

  const visibleColumnKeys = new Set<ShippingV2ItemsColumnKey>(visibleFromInput);

  availableColumns.forEach((column) => {
    if (column.required || (column.defaultVisible && !Array.isArray(input?.visibleColumnKeys))) {
      visibleColumnKeys.add(column.key);
    }
    if (column.defaultVisible && Array.isArray(input?.visibleColumnKeys) && !orderedFromInput.includes(column.key)) {
      visibleColumnKeys.add(column.key);
    }
  });

  return {
    orderedColumnKeys,
    visibleColumnKeys: orderedColumnKeys.filter((key) => visibleColumnKeys.has(key)),
  };
}

function moveColumnKey(
  keys: ShippingV2ItemsColumnKey[],
  draggedKey: ShippingV2ItemsColumnKey,
  targetKey: ShippingV2ItemsColumnKey,
  placement: "before" | "after"
) {
  if (draggedKey === targetKey) return keys;
  const withoutDragged = keys.filter((key) => key !== draggedKey);
  const targetIndex = withoutDragged.indexOf(targetKey);
  if (targetIndex === -1) return keys;
  const insertIndex = placement === "after" ? targetIndex + 1 : targetIndex;
  const next = [...withoutDragged];
  next.splice(insertIndex, 0, draggedKey);
  return next;
}

function displayBoolean(value: boolean | null) {
  if (value === null) return "—";
  return value ? "Si" : "No";
}

function formatCurrency(value: number | null) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function getItemStockQuantity(item: ShippingV2Item) {
  const cantidad = getShippingV2ItemQuantity(item);
  return cantidad !== null && cantidad > 0 ? cantidad : null;
}

function calculateItemUnitCost(item: ShippingV2Item) {
  return typeof item.costoTotalUnidad === "number" && Number.isFinite(item.costoTotalUnidad)
    ? item.costoTotalUnidad
    : typeof item.costoProveedor === "number" && Number.isFinite(item.costoProveedor)
      ? item.costoProveedor + (typeof item.costoLogisticoAsignado === "number" && Number.isFinite(item.costoLogisticoAsignado) ? item.costoLogisticoAsignado : 0)
      : null;
}

function calculateItemUnitProfit(item: ShippingV2Item) {
  if (typeof item.precioVenta !== "number" || !Number.isFinite(item.precioVenta)) return null;

  const costBasis = calculateItemUnitCost(item);
  return costBasis === null ? null : item.precioVenta - costBasis;
}

function calculateItemStockCost(item: ShippingV2Item) {
  const costBasis = calculateItemUnitCost(item);
  const cantidad = getItemStockQuantity(item);
  return costBasis === null || cantidad === null ? null : costBasis * cantidad;
}

function calculateItemStockProfit(item: ShippingV2Item) {
  const gananciaUnidad = calculateItemUnitProfit(item);
  const cantidad = getItemStockQuantity(item);
  return gananciaUnidad === null || cantidad === null ? null : gananciaUnidad * cantidad;
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-EC", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Guayaquil",
  }).format(date).replace(",", "");
}

function packingLabel(item: ResolvedItem) {
  return item.packingId || "";
}

function supplierSkuLabel(item: ResolvedItem) {
  return displayValue(item.skuProveedor);
}

function availabilityLabel(item: ResolvedItem) {
  if (item.conNovedad) return "Con novedad";
  if (item.reservado) return "Reservado";
  if (item.usoLocal) return "Uso local";
  // Manda Categoría, no la vieja casilla "Es repuesto" (ver item-edit-config).
  if (item.categoria === "Repuesto") return "Repuesto";
  if (item.disponibleVenta) return "Disponible para venta";
  return "No disponible";
}

function notesLabel(item: ResolvedItem) {
  return displayValue(item.observacionVenta || item.observacionRecepcion);
}

function getItemCellTitle(item: ResolvedItem, columnKey: ShippingV2ItemsColumnKey) {
  switch (columnKey) {
    case "sku":
      return displayValue(item.sku);
    case "supplierSku":
      return supplierSkuLabel(item);
    case "name":
      return displayName(item.nombre);
    case "quantity":
      return formatShippingV2ItemQuantity(item);
    case "generalRole":
      return displayValue(item.tipoItem);
    case "category":
      return displayValue(item.categoria);
    case "purchaseProvider":
      return displayValue(item.proveedorCompraDisplay);
    case "logisticProvider":
      return displayValue(item.proveedorLogisticoDisplay);
    case "packing":
      return displayValue(packingLabel(item));
    case "providerCost":
      return formatCurrency(item.costoProveedor);
    case "salePrice":
      return formatCurrency(item.precioVenta);
    case "createdAt":
      return formatDate(item.fechaRegistro || item.createdTime);
    case "brand":
      return displayValue(item.marca);
    case "model":
      return displayValue(item.modelo);
    case "serial":
      return displayValue(item.numeroSerie);
    case "condition":
      return displayValue(item.condicion);
    case "location":
      return displayValue(item.ubicacionActual);
    case "triangulationStatus":
      return displayValue(item.estadoTriangulacion);
    case "reviewStatus":
      return displayValue(item.estadoRevision);
    case "availability":
      return availabilityLabel(item);
    case "facebookSuperGeek":
      return item.facebookSuperGeek ? "Facebook Super Geek activo" : "Facebook Super Geek inactivo";
    case "requiresPayment":
      return displayBoolean(item.requierePago);
    case "requiresPacking":
      return displayBoolean(item.requierePacking);
    case "physicalReview":
      return displayBoolean(item.revisadoFisicamente);
    case "notes":
      return notesLabel(item);
    case "operationType":
    case "itemStatus":
    default:
      return undefined;
  }
}

function renderItemCell(item: ResolvedItem, columnKey: ShippingV2ItemsColumnKey, context: ItemCellRenderContext) {
  switch (columnKey) {
    case "sku":
      return displayValue(item.sku);
    case "supplierSku":
      return supplierSkuLabel(item);
    case "name":
      return <span className="block truncate">{displayName(item.nombre)}</span>;
    case "quantity":
      return (
        <span className="inline-flex min-w-9 justify-center rounded-full border border-[#D7FF4F]/30 bg-[#D7FF4F]/10 px-2 py-0.5 text-[12px] font-bold tabular-nums text-[#D7FF4F]">
          {formatShippingV2ItemQuantity(item)}
        </span>
      );
    case "operationType":
      return <OperationBadge value={item.tipoOperacion} />;
    case "itemStatus":
      return <EstadoBadge estado={item.estado} />;
    case "generalRole":
      return displayValue(item.tipoItem);
    case "category":
      return displayValue(item.categoria);
    case "purchaseProvider":
      return <span className="block truncate">{displayValue(item.proveedorCompraDisplay)}</span>;
    case "logisticProvider":
      return <span className="block truncate">{displayValue(item.proveedorLogisticoDisplay)}</span>;
    case "packing":
      return <span className="block truncate">{displayValue(packingLabel(item))}</span>;
    case "providerCost":
      return formatCurrency(item.costoProveedor);
    case "salePrice":
      return formatCurrency(item.precioVenta);
    case "createdAt":
      return formatDate(item.fechaRegistro || item.createdTime);
    case "brand":
      return displayValue(item.marca);
    case "model":
      return <span className="block truncate">{displayValue(item.modelo)}</span>;
    case "serial":
      return <span className="block truncate">{displayValue(item.numeroSerie)}</span>;
    case "condition":
      return displayValue(item.condicion);
    case "location":
      return <span className="block truncate">{displayValue(item.ubicacionActual)}</span>;
    case "triangulationStatus":
      return displayValue(item.estadoTriangulacion);
    case "reviewStatus":
      return displayValue(item.estadoRevision);
    case "availability":
      return <AvailabilityBadge item={item} />;
    case "facebookSuperGeek":
      return (
        <FacebookSuperGeekToggle
          item={item}
          canEdit={context.canEditFacebookSuperGeek}
          busy={context.facebookSuperGeekBusyId === item.id}
          onChange={context.onFacebookSuperGeekChange}
        />
      );
    case "requiresPayment":
      return displayBoolean(item.requierePago);
    case "requiresPacking":
      return displayBoolean(item.requierePacking);
    case "physicalReview":
      return displayBoolean(item.revisadoFisicamente);
    case "notes":
      return <span className="block truncate">{notesLabel(item)}</span>;
    default:
      return "—";
  }
}

function estadoTone(estado: string) {
  const normalized = normalizeText(estado);

  if (normalized.includes("disponible") || normalized.includes("pagado")) {
    return "border-[#D7FF4F]/35 bg-[#D7FF4F]/10 text-[#D7FF4F]";
  }
  if (normalized.includes("transito") || normalized.includes("camino")) {
    return "border-violet-300/25 bg-violet-300/10 text-violet-200";
  }
  if (normalized.includes("pendiente") || normalized.includes("borrador")) {
    return "border-yellow-300/25 bg-yellow-300/10 text-yellow-100";
  }
  if (normalized.includes("cancelado") || normalized.includes("observado") || normalized.includes("novedad")) {
    return "border-orange-300/25 bg-orange-300/10 text-orange-200";
  }
  return "border-[#3A3A36] bg-[#1E1E1E] text-[#A7A7A7]";
}

function operationTone(value: string) {
  const normalized = normalizeText(value);

  if (normalized.includes("stock") || normalized.includes("venta")) {
    return "border-[#CFFF3A]/35 bg-[#CFFF3A]/10 text-[#CFFF3A]";
  }
  if (normalized.includes("pedido") || normalized.includes("cliente")) {
    return "border-[#8B73FF]/35 bg-[#8B73FF]/12 text-[#C9BFFF]";
  }
  if (normalized.includes("garantia") || normalized.includes("novedad")) {
    return "border-[#FF914D]/35 bg-[#FF914D]/12 text-[#FFB07A]";
  }
  return "border-[#3A3A36] bg-[#1E1E1E] text-[#A7A7A7]";
}

function novedadTone(value: string) {
  const normalized = normalizeText(value);

  if (normalized.includes("cerrada") || normalized.includes("resuelta") || normalized.includes("rechazada")) {
    return "border-[#3A3A36] bg-[#1E1E1E] text-[#A7A7A7]";
  }
  if (normalized.includes("proveedor") || normalized.includes("respuesta") || normalized.includes("solucion") || normalized.includes("escalada")) {
    return "border-[#FF914D]/35 bg-[#FF914D]/12 text-[#FFB07A]";
  }
  if (normalized.includes("revision") || normalized.includes("abierta") || normalized.includes("esperando")) {
    return "border-[#D7FF4F]/35 bg-[#D7FF4F]/10 text-[#D7FF4F]";
  }
  return "border-[#4FC3FF]/35 bg-[#4FC3FF]/10 text-[#BDEAFF]";
}

function novedadTypeTone(value: string) {
  const normalized = normalizeText(value);

  if (normalized.includes("danado") || normalized.includes("faltante") || normalized.includes("incompleto") || normalized.includes("garantia")) {
    return "border-orange-300/25 bg-orange-300/10 text-orange-100";
  }
  if (normalized.includes("tracking") || normalized.includes("demora") || normalized.includes("aduana")) {
    return "border-violet-300/25 bg-violet-300/10 text-violet-200";
  }
  return "border-[#3A3A36] bg-[#151515] text-[#F5F5F5]";
}

function isOpenNovedadStatus(value: string) {
  const normalized = normalizeText(value);
  return !normalized.includes("cerrada") && !normalized.includes("resuelta") && !normalized.includes("rechazada") && !normalized.includes("cancelada");
}

function EstadoBadge({ estado }: { estado: string }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${estadoTone(estado)}`}>
      {displayValue(estado)}
    </span>
  );
}

function OperationBadge({ value }: { value: string }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${operationTone(value)}`}>
      {displayValue(value)}
    </span>
  );
}

function AvailabilityBadge({ item }: { item: ResolvedItem }) {
  let label = "No disponible";
  let tone = "border-[#3A3A36] bg-[#1E1E1E] text-[#A7A7A7]";

  if (item.conNovedad) {
    label = "Con novedad";
    tone = "border-[#FF914D]/35 bg-[#FF914D]/12 text-[#FFB07A]";
  } else if (item.reservado) {
    label = "Reservado";
    tone = "border-[#F4E85B]/35 bg-[#F4E85B]/12 text-[#F4E85B]";
  } else if (item.usoLocal) {
    label = "Uso local";
    tone = "border-[#8B73FF]/35 bg-[#8B73FF]/12 text-[#C9BFFF]";
  } else if (item.categoria === "Repuesto") {
    label = "Repuesto";
    tone = "border-[#8B73FF]/35 bg-[#8B73FF]/12 text-[#C9BFFF]";
  } else if (item.disponibleVenta) {
    label = "Disponible para venta";
    tone = "border-[#D7FF4F]/35 bg-[#D7FF4F]/12 text-[#D7FF4F]";
  }

  return <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${tone}`}>{label}</span>;
}

function FacebookSuperGeekToggle({
  item,
  canEdit,
  busy,
  onChange,
}: {
  item: ResolvedItem;
  canEdit: boolean;
  busy: boolean;
  onChange: (item: ResolvedItem, value: boolean) => void;
}) {
  const checked = item.facebookSuperGeek === true;
  const activationBlockReason = checked ? "" : getShippingV2FacebookPublicationBlockReason(item);
  const disabled = checked || !canEdit || busy || Boolean(activationBlockReason);
  const actionLabel = checked ? "Facebook Super Geek publicado" : "Activar Facebook Super Geek";
  const disabledTitle = checked ? "Publicación ya activada; no se puede desactivar desde el sistema." : activationBlockReason;

  return (
    <button
      type="button"
      aria-label={actionLabel}
      aria-pressed={checked}
      title={canEdit ? disabledTitle || actionLabel : "Facebook Super Geek"}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        if (!checked) onChange(item, true);
      }}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition focus:outline-none focus:ring-2 focus:ring-[#D7FF4F]/35 disabled:cursor-not-allowed ${checked ? "" : "disabled:opacity-55"} ${
        checked
          ? "border-[#D7FF4F]/55 bg-[#D7FF4F]/12 text-[#D7FF4F] shadow-lg shadow-[#D7FF4F]/10"
          : "border-[#3A3A36] bg-[#151613] text-[#A7A7A7] hover:border-[#D7FF4F]/45 hover:text-[#D7FF4F]"
      }`}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <BadgeCheck className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}

function FacebookSuperGeekDetailButton({
  item,
  checked,
  canEdit,
  busy,
  onOpen,
}: {
  item: ResolvedItem;
  checked: boolean;
  canEdit: boolean;
  busy: boolean;
  onOpen: () => void;
}) {
  const blockReason = getShippingV2FacebookPublicationBlockReason(item);
  const actionLabel = checked ? "Ver publicación Facebook SG" : "Preparar Facebook SG";
  const statusLabel = checked ? "Publicado" : blockReason ? "Pendiente" : "Listo";

  return (
    <button
      type="button"
      aria-label={actionLabel}
      aria-pressed={checked}
      title={canEdit || checked ? actionLabel : "Facebook Super Geek"}
      disabled={busy || (!canEdit && !checked)}
      onClick={onOpen}
      className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-[12px] font-bold transition focus:outline-none focus:ring-2 focus:ring-[#D7FF4F]/35 disabled:cursor-not-allowed disabled:opacity-55 ${
        checked
          ? "border-[#D7FF4F]/60 bg-[#D7FF4F]/12 text-[#D7FF4F] shadow-lg shadow-[#D7FF4F]/10"
          : "border-[#3A3A36] bg-[#20211D] text-[#A7A7A7] hover:border-[#D7FF4F]/55 hover:text-[#D7FF4F]"
      }`}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <BadgeCheck className="h-4 w-4" aria-hidden="true" />}
      <span>Facebook SG</span>
      <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${checked ? "bg-[#D7FF4F] text-[#151515]" : "bg-[#151515] text-[#8F908A]"}`}>
        {statusLabel}
      </span>
    </button>
  );
}

function FacebookSuperGeekTextModal({
  item,
  draft,
  canEdit,
  saving,
  activating,
  message,
  onDraftChange,
  onSave,
  onActivate,
  onClose,
}: {
  item: ResolvedItem;
  draft: string;
  canEdit: boolean;
  saving: boolean;
  activating: boolean;
  message: string;
  onDraftChange: (value: string) => void;
  onSave: () => void;
  onActivate: () => void;
  onClose: () => void;
}) {
  const [showOptions, setShowOptions] = useState(() => !hasShippingV2FacebookText(item));
  const generationBlockReason = getShippingV2FacebookTextGenerationBlockReason(item);
  const publicationBlockReason = getShippingV2FacebookPublicationBlockReason(item);
  const options = useMemo(() => generateShippingV2FacebookTextOptions(item), [item]);
  const savedText = item.textoFacebook?.trim() || "";
  const published = item.facebookSuperGeek === true;
  const hasPrice = hasShippingV2FacebookPrice(item);
  const hasSavedText = hasShippingV2FacebookText(item);
  const draftText = draft.trim();
  const isDirty = draftText !== savedText;
  const canSave = canEdit && !published && hasPrice && draftText.length > 0 && isDirty && !saving && !activating;
  const activationBlockReason = published
    ? "Publicación ya activada; no se puede desactivar ni editar desde el sistema."
    : isDirty
      ? "Guarda el texto revisado antes de activar Facebook SG."
      : publicationBlockReason;
  const canActivate = canEdit && !published && !saving && !activating && !activationBlockReason;
  const legacyText = item.textoFacebookLegacy?.trim() || "";

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving && !activating) onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activating, onClose, saving]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/75 px-3 py-5 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="facebook-super-geek-title"
      onClick={(event) => {
        if (event.target === event.currentTarget && !saving && !activating) onClose();
      }}
    >
      <section className="w-full max-w-5xl overflow-hidden rounded-xl border border-[#30312D] bg-[#11120F] shadow-2xl shadow-black/50">
        <header className="border-b border-[#30312D] bg-[#171814] px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-lg border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 text-[#D7FF4F]">
                  <BadgeCheck className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 id="facebook-super-geek-title" className="text-base font-semibold text-[#F5F5F5]">Publicación Facebook Super Geek</h2>
                  <p className="mt-0.5 truncate text-[12px] text-[#8F908A]">{displayValue(item.sku)} · {displayName(item.nombre)}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${hasPrice ? "border-[#D7FF4F]/35 bg-[#D7FF4F]/10 text-[#D7FF4F]" : "border-[#FF914D]/35 bg-[#FF914D]/10 text-[#FFB07A]"}`}>
                  Precio final: {hasPrice ? "listo" : "pendiente"}
                </span>
                <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${hasSavedText ? "border-[#D7FF4F]/35 bg-[#D7FF4F]/10 text-[#D7FF4F]" : "border-[#FF914D]/35 bg-[#FF914D]/10 text-[#FFB07A]"}`}>
                  Texto Facebook: {hasSavedText ? "guardado" : "pendiente"}
                </span>
                <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${published ? "border-[#D7FF4F]/35 bg-[#D7FF4F]/10 text-[#D7FF4F]" : publicationBlockReason || isDirty ? "border-[#3A3A36] bg-[#151515] text-[#A7A7A7]" : "border-[#D7FF4F]/35 bg-[#D7FF4F]/10 text-[#D7FF4F]"}`}>
                  Publicación: {published ? "activada" : publicationBlockReason || isDirty ? "bloqueada" : "lista"}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={saving || activating}
              aria-label="Cerrar publicación Facebook Super Geek"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#3A3A36] bg-[#20211D] text-[#A7A7A7] transition hover:border-[#D7FF4F]/55 hover:text-[#F5F5F5] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="grid max-h-[calc(100vh-9rem)] gap-0 overflow-y-auto lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="border-b border-[#30312D] bg-[#151613] p-4 lg:border-b-0 lg:border-r">
            <div className="rounded-lg border border-[#30312D] bg-[#10110F] p-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#D7FF4F]" aria-hidden="true" />
                <p className="text-sm font-semibold text-[#F5F5F5]">Versiones sugeridas</p>
              </div>
              <p className="mt-1 text-[12px] leading-5 text-[#8F908A]">Elige una base, ajústala y guarda el texto final antes de aprobar.</p>
              {generationBlockReason ? (
                <div className="mt-3 rounded-lg border border-[#FF914D]/35 bg-[#FF914D]/10 px-3 py-2 text-[12px] leading-5 text-[#FFB07A]">
                  {generationBlockReason}
                </div>
              ) : null}
              {published ? (
                <div className="mt-3 rounded-lg border border-[#D7FF4F]/30 bg-[#D7FF4F]/10 px-3 py-2 text-[12px] leading-5 text-[#D7FF4F]">
                  Esta publicación ya fue activada. El texto queda solo lectura.
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => setShowOptions((current) => !current)}
              disabled={!canEdit || published || Boolean(generationBlockReason)}
              title={generationBlockReason || "Mostrar opciones de texto"}
              className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-[#D7FF4F]/55 bg-[#D7FF4F]/10 px-3 text-[12px] font-bold text-[#D7FF4F] transition hover:bg-[#D7FF4F]/18 disabled:cursor-not-allowed disabled:border-[#3A3A36] disabled:bg-[#171814] disabled:text-[#6E6F68]"
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              {showOptions ? "Ocultar versiones" : "Ver versiones"}
            </button>

            {showOptions ? (
              <div className="mt-3 grid gap-2">
                {options.map((option) => (
                  <button
                    key={option.tone}
                    type="button"
                    onClick={() => onDraftChange(option.text)}
                    disabled={!canEdit || published}
                    className="rounded-lg border border-[#30312D] bg-[#171814] p-3 text-left transition hover:border-[#D7FF4F]/45 hover:bg-[#1D1E1A] disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    <span className="block text-sm font-semibold text-[#F5F5F5]">{option.label}</span>
                    <span className="mt-1 block text-[12px] leading-5 text-[#8F908A]">{option.description}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {legacyText ? (
              <details className="mt-3 rounded-lg border border-[#30312D] bg-[#171814] px-3 py-2">
                <summary className="cursor-pointer text-[12px] font-semibold text-[#A7A7A7]">Ver Texto Facebook legacy</summary>
                <pre className="mt-2 max-h-36 overflow-y-auto whitespace-pre-wrap text-[12px] leading-5 text-[#D8D8D3]">{legacyText}</pre>
              </details>
            ) : null}
          </aside>

          <main className="p-4">
            <label className="block">
              <span className="text-[12px] font-bold uppercase tracking-normal text-[#8F908A]">Texto revisado</span>
              <textarea
                value={draft}
                onChange={(event) => onDraftChange(event.target.value)}
                readOnly={published}
                disabled={!canEdit || !hasPrice}
                placeholder={hasPrice ? "Elige una versión o escribe el texto que se publicará..." : "Agrega Precio venta final para habilitar el texto."}
                className="mt-2 min-h-[420px] w-full resize-y rounded-lg border border-[#3A3A36] bg-[#10110F] px-3 py-2 text-sm leading-6 text-[#F5F5F5] outline-none transition placeholder:text-[#5E5F59] focus:border-[#D7FF4F]/70 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>

            <div className="mt-3 rounded-lg border border-[#30312D] bg-[#151613] px-3 py-2">
              <p className={`text-[12px] leading-5 ${message ? "text-[#D7FF4F]" : activationBlockReason ? "text-[#A7A7A7]" : "text-[#D7FF4F]"}`}>
                {message || activationBlockReason || "Texto guardado y listo para aprobación final."}
              </p>
            </div>

            <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={saving || activating}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-[#3A3A36] bg-[#20211D] px-3 text-sm font-bold text-[#F5F5F5] transition hover:border-[#D7FF4F]/55 hover:text-[#D7FF4F] disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={!canSave}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#3A3A36] bg-[#20211D] px-3 text-sm font-bold text-[#D7FF4F] transition hover:border-[#D7FF4F]/55 disabled:cursor-not-allowed disabled:text-[#6E6F68] disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                Guardar texto
              </button>
              <button
                type="button"
                onClick={onActivate}
                disabled={!canActivate}
                title={activationBlockReason || "Aprobar y activar Facebook Super Geek"}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-3 text-sm font-black text-[#151515] transition hover:brightness-105 disabled:cursor-not-allowed disabled:border-[#3A3A36] disabled:bg-[#20211D] disabled:text-[#6E6F68]"
              >
                {activating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <BadgeCheck className="h-4 w-4" aria-hidden="true" />}
                Aprobar y activar
              </button>
            </div>
          </main>
        </div>
      </section>
    </div>
  );
}

function FilterGroup({
  label,
  values,
  selected,
  onChange,
  className = "",
}: {
  label: string;
  values: string[];
  selected: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const options = [ALL, ...values];

  return (
    <div className={`min-w-0 space-y-1 ${className}`}>
      <p className="text-[12px] font-bold uppercase tracking-normal text-[#8F908A]">{label}</p>
      <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto pr-1">
        {options.map((value) => {
          const active = selected === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => onChange(value)}
              className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[12px] font-semibold transition ${active ? "border-[#D7FF4F] bg-[#D7FF4F] text-[#151515] shadow-lg shadow-[#D7FF4F]/10" : "border-[#3A3A36] bg-[#151613] text-[#D8D8D3] hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]"}`}
            >
              {value}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ToolbarIconButton({
  label,
  open,
  active,
  badge,
  onClick,
  children,
}: {
  label: string;
  open: boolean;
  active: boolean;
  badge?: number;
  onClick: () => void;
  children: ReactNode;
}) {
  const highlighted = open || active;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={onClick}
          className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition focus:outline-none focus:ring-2 focus:ring-[#D7FF4F]/35 ${
            highlighted
              ? "border-[#D7FF4F]/55 bg-[#D7FF4F]/10 text-[#D7FF4F] shadow-lg shadow-[#D7FF4F]/10"
              : "border-[#3A3A36] bg-[#10110F] text-[#A7A7A7] hover:border-[#D7FF4F]/45 hover:bg-[#1D1E1A] hover:text-[#D7FF4F]"
          }`}
        >
          {children}
          {badge ? (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#D7FF4F] px-1 text-[10px] font-black leading-none text-[#151515] shadow-md shadow-black/30">
              {badge}
            </span>
          ) : null}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="border border-[#30312D] bg-[#252622] text-[#F5F5F5]">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function ToolbarMenuOption<T extends string>({
  option,
  active,
  onSelect,
}: {
  option: { value: T; label: string };
  active: boolean;
  onSelect: (value: T) => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={active}
      onClick={() => onSelect(option.value)}
      className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition ${
        active
          ? "border-[#D7FF4F]/45 bg-[#D7FF4F]/10 text-[#F5F5F5]"
          : "border-transparent bg-transparent text-[#A7A7A7] hover:border-[#3A3A36] hover:bg-[#171814] hover:text-[#F5F5F5]"
      }`}
    >
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
          active ? "border-[#D7FF4F] bg-[#D7FF4F] text-[#151515]" : "border-[#3A3A36] text-transparent"
        }`}
      >
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span className="min-w-0 truncate font-semibold">{option.label}</span>
    </button>
  );
}

function PaginationLinkButton({
  href,
  disabled,
  ariaLabel,
  children,
}: {
  href?: string;
  disabled: boolean;
  ariaLabel: string;
  children: ReactNode;
}) {
  const className = `inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-lg border px-2 text-[12px] font-semibold transition ${
    disabled
      ? "cursor-not-allowed border-[#30312D] bg-[#11120F] text-[#5E5F59]"
      : "border-[#3A3A36] bg-[#151613] text-[#D8D8D3] hover:border-[#D7FF4F]/55 hover:text-[#D7FF4F] focus:outline-none focus:ring-2 focus:ring-[#D7FF4F]/35"
  }`;

  if (disabled || !href) {
    return (
      <span aria-label={ariaLabel} aria-disabled="true" className={className}>
        {children}
      </span>
    );
  }

  return (
    <Link href={href} aria-label={ariaLabel} className={className}>
      {children}
    </Link>
  );
}

function MiniMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "lime" | "yellow" | "purple" | "orange";
}) {
  const toneClass = {
    lime: "text-[#D7FF4F] bg-[#D7FF4F]",
    yellow: "text-[#F4E85B] bg-[#F4E85B]",
    purple: "text-[#B7A8FF] bg-[#8B73FF]",
    orange: "text-[#FFB07A] bg-[#FF914D]",
  }[tone];

  return (
    <Card className="rounded-xl border-[#30312D] bg-[#171814] px-3 py-2 shadow-lg shadow-black/10">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-bold uppercase tracking-normal text-[#8F908A]">{label}</p>
          <p className={`mt-0.5 text-lg font-semibold leading-none tabular-nums xl:text-xl ${toneClass.split(" ")[0]}`}>{value}</p>
        </div>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${toneClass.split(" ")[1]}`} />
      </div>
    </Card>
  );
}

function MobileItemCard({
  item,
  canViewCosts,
  canViewProviderCost,
  canEditFacebookSuperGeek,
  facebookSuperGeekBusy,
  onFacebookSuperGeekChange,
  onOpen,
}: {
  item: ResolvedItem;
  canViewCosts: boolean;
  canViewProviderCost: boolean;
  canEditFacebookSuperGeek: boolean;
  facebookSuperGeekBusy: boolean;
  onFacebookSuperGeekChange: (item: ResolvedItem, value: boolean) => void;
  onOpen: () => void;
}) {
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className="cursor-pointer rounded-[1.55rem] border border-[#3A3A36] bg-[#252622] p-4 shadow-xl shadow-black/20 transition hover:border-[#D7FF4F]/45 hover:bg-[#2A2B27]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-normal text-[#D7FF4F]">{displayValue(item.sku)}</p>
          <h3 className="mt-1 truncate text-base font-semibold text-[#F5F5F5]">{displayName(item.nombre)}</h3>
          <p className="mt-1 text-sm text-[#A7A7A7]">{displayValue(item.modelo || item.marca || item.tipoItem)}</p>
        </div>
        <EstadoBadge estado={item.estado} />
      </div>
      <dl className="mt-4 grid gap-2 text-sm">
        <div className="flex justify-between gap-4"><dt className="text-[#A7A7A7]">Operacion</dt><dd className="text-right text-[#F5F5F5]"><OperationBadge value={item.tipoOperacion} /></dd></div>
        <div className="flex justify-between gap-4"><dt className="text-[#A7A7A7]">Cantidad</dt><dd className="text-right font-semibold tabular-nums text-[#D7FF4F]">{formatShippingV2ItemQuantity(item)}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-[#A7A7A7]">Rol general</dt><dd className="text-right text-[#F5F5F5]">{displayValue(item.tipoItem)}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-[#A7A7A7]">Categoría</dt><dd className="text-right text-[#F5F5F5]">{displayValue(item.categoria)}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-[#A7A7A7]">Proveedor</dt><dd className="text-right text-[#F5F5F5]">{displayValue(item.proveedorCompraDisplay)}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-[#A7A7A7]">Packing</dt><dd className="text-right text-[#F5F5F5]">{displayValue(packingLabel(item))}</dd></div>
        {canViewProviderCost ? (
          <div className="flex justify-between gap-4"><dt className="text-[#A7A7A7]">Costo proveedor unitario</dt><dd className="text-right text-[#F5F5F5]">{formatCurrency(item.costoProveedor)}</dd></div>
        ) : null}
        {canViewCosts ? (
          <div className="flex justify-between gap-4"><dt className="text-[#A7A7A7]">Precio venta final unitario</dt><dd className="text-right text-[#F5F5F5]">{formatCurrency(item.precioVenta)}</dd></div>
        ) : null}
        <div className="flex items-center justify-between gap-4">
          <dt className="text-[#A7A7A7]">Facebook Super Geek</dt>
          <dd className="text-right text-[#F5F5F5]">
            <FacebookSuperGeekToggle
              item={item}
              canEdit={canEditFacebookSuperGeek}
              busy={facebookSuperGeekBusy}
              onChange={onFacebookSuperGeekChange}
            />
          </dd>
        </div>
        <div className="flex justify-between gap-4"><dt className="text-[#A7A7A7]">Fecha registro</dt><dd className="text-right text-[#F5F5F5]">{formatDate(item.fechaRegistro || item.createdTime)}</dd></div>
      </dl>
    </article>
  );
}

function DetailSection({
  title,
  accent,
  rows,
  onSave,
  esAdmin = false,
  canEdit = true,
}: {
  title: string;
  accent: "lime" | "purple" | "orange" | "yellow";
  rows: DetailRow[];
  onSave: (field: string, value: string | number | boolean | null) => Promise<void>;
  esAdmin?: boolean;
  canEdit?: boolean;
}) {
  const accentClass = {
    lime: "bg-[#D7FF4F]",
    purple: "bg-[#8B73FF]",
    orange: "bg-[#FF914D]",
    yellow: "bg-[#F4E85B]",
  }[accent];

  return (
    <section className="rounded-xl border border-[#30312D] bg-[#171814] p-3 shadow-lg shadow-black/10">
      <div className="mb-2.5 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${accentClass}`} />
        <h3 className="text-sm font-semibold text-[#F5F5F5]">{title}</h3>
      </div>
      <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {rows.map((row) => {
          // Los campos marcados adminOnly se ven siempre, pero solo administración
          // los puede editar (el servidor lo vuelve a validar).
          const bloqueadoPorRol = row.config?.adminOnly === true && !esAdmin;
          const soloLectura =
            !canEdit || (row.readOnly ?? !row.config) || row.config?.category === "readOnly" || bloqueadoPorRol;

          return (
            <InlineEditableField
              key={row.label}
              label={row.label}
              value={row.value}
              type={row.config?.type ?? "readOnly"}
              readOnly={soloLectura}
              options={row.options ?? row.config?.options}
              displayValue={row.displayValue}
              onSave={!soloLectura && row.config ? (value) => onSave(row.config!.field, value) : undefined}
            />
          );
        })}
      </dl>
    </section>
  );
}

function NovedadesVinculadasCard({
  novedades,
  providerLabelsById,
}: {
  novedades: ShippingV2Novedad[];
  providerLabelsById: Map<string, string>;
}) {
  const openCount = novedades.filter((novedad) => isOpenNovedadStatus(novedad.estado)).length;

  return (
    <section className="rounded-xl border border-[#30312D] bg-[#171814] p-3 shadow-lg shadow-black/10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#D7FF4F]" />
          <h3 className="text-sm font-semibold text-[#F5F5F5]">Novedades vinculadas</h3>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full border border-[#3A3A36] bg-[#11120F] px-2.5 py-0.5 text-[12px] font-semibold text-[#A7A7A7]">{novedades.length} total</span>
          {openCount ? <span className="rounded-full border border-[#FF914D]/35 bg-[#FF914D]/12 px-2.5 py-0.5 text-[12px] font-semibold text-[#FFB07A]">{openCount} abierta</span> : null}
        </div>
      </div>

      {!novedades.length ? (
        <div className="mt-3 rounded-lg border border-[#30312D] bg-[#11120F] px-3 py-4 text-sm text-[#A7A7A7]">
          Sin novedades registradas para este item.
        </div>
      ) : (
        <div className="mt-3 grid gap-2">
          {novedades.map((novedad) => {
            const isOpen = isOpenNovedadStatus(novedad.estado);
            const providerLabel = novedad.proveedorResponsableId ? providerLabelsById.get(novedad.proveedorResponsableId) : "";
            const description = displayValue(novedad.descripcion, "Sin descripción registrada.");

            return (
              <article key={novedad.id} className={`rounded-lg border p-3 ${isOpen ? "border-[#FF914D]/35 bg-[#FF914D]/10" : "border-[#30312D] bg-[#11120F]"}`}>
                <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-1.5">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${novedadTypeTone(novedad.tipo || novedad.titulo)}`}>{displayValue(novedad.tipo || novedad.titulo)}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${novedadTone(novedad.estado)}`}>{displayValue(novedad.estado)}</span>
                      {novedad.novedadId ? <span className="rounded-full border border-[#3A3A36] bg-[#151515] px-2 py-0.5 text-[11px] font-semibold text-[#8F908A]">{novedad.novedadId}</span> : null}
                    </div>
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#F5F5F5]">{description}</p>
                  </div>
                  <div className="grid shrink-0 gap-1 text-[12px] text-[#A7A7A7] lg:min-w-64">
                    <span>Fecha: <strong className="font-semibold text-[#F5F5F5]">{formatDate(novedad.fechaRegistro || novedad.createdTime)}</strong></span>
                    <span>Proveedor: <strong className="font-semibold text-[#F5F5F5]">{displayValue(providerLabel)}</strong></span>
                    <span>Registrado por: <strong className="font-semibold text-[#F5F5F5]">{displayValue(novedad.registradoPor)}</strong></span>
                  </div>
                </div>

                {(novedad.respuestaProveedor || novedad.solucion || novedad.fechaCierre || novedad.observacionFinal || novedad.evidencias.length) ? (
                  <div className="mt-3 grid gap-2 border-t border-[#30312D]/80 pt-3 text-[12px] text-[#A7A7A7] lg:grid-cols-2">
                    {novedad.respuestaProveedor ? <p>Respuesta proveedor: <span className="text-[#F5F5F5]">{novedad.respuestaProveedor}</span></p> : null}
                    {novedad.solucion ? <p>Solución: <span className="text-[#F5F5F5]">{novedad.solucion}</span></p> : null}
                    {novedad.fechaCierre ? <p>Fecha cierre: <span className="text-[#F5F5F5]">{formatDate(novedad.fechaCierre)}</span></p> : null}
                    {novedad.cerradoPor ? <p>Cerrado por: <span className="text-[#F5F5F5]">{novedad.cerradoPor}</span></p> : null}
                    {novedad.observacionFinal ? <p className="lg:col-span-2">Observación final: <span className="text-[#F5F5F5]">{novedad.observacionFinal}</span></p> : null}
                    {novedad.evidencias.length ? <div className="lg:col-span-2">{attachmentList(novedad.evidencias)}</div> : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function attachmentList(attachments: ShippingV2Attachment[]) {
  if (!attachments.length) return "—";
  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((attachment, index) => (
        <a
          key={attachment.id || attachment.url}
          href={attachment.url}
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-[#3A3A36] bg-[#151515] px-3 py-1 text-[13px] text-[#D7FF4F] transition hover:border-[#D7FF4F]"
        >
          {attachment.filename || `Archivo ${index + 1}`}
        </a>
      ))}
    </div>
  );
}

function DetailMetric({
  label,
  value,
  featured,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  featured?: boolean;
  tone?: "lime" | "orange" | "neutral";
}) {
  const valueClass = featured
    ? "text-[#151515]"
    : tone === "orange"
      ? "text-[#FFB07A]"
      : tone === "lime"
        ? "text-[#D7FF4F]"
        : "text-[#F5F5F5]";

  return (
    <article className={`rounded-xl border px-3 py-2 shadow-lg shadow-black/10 ${featured ? "border-[#D7FF4F] bg-[#D7FF4F]" : "border-[#30312D] bg-[#171814]"}`}>
      <p className={`truncate text-[11px] font-bold uppercase tracking-normal ${featured ? "text-[#151515]/70" : "text-[#8F908A]"}`}>{label}</p>
      <p className={`mt-1 text-lg font-semibold leading-none tabular-nums ${valueClass}`}>{value}</p>
    </article>
  );
}

function BooleanPill({ label, value }: { label: string; value: boolean | null }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${value ? "border-[#D7FF4F]/35 bg-[#D7FF4F]/10 text-[#D7FF4F]" : "border-[#3A3A36] bg-[#151515] text-[#A7A7A7]"}`}>
      {label}: {displayBoolean(value)}
    </span>
  );
}

function SmallDataRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#30312D]/80 py-2 last:border-b-0">
      <span className="text-[12px] font-semibold uppercase tracking-normal text-[#8F908A]">{label}</span>
      <span className="min-w-0 text-right text-sm font-medium text-[#F5F5F5]">{value}</span>
    </div>
  );
}

function shippingV2SkuLabelHref(itemId: string) {
  return `/shipping-v2/recepcion/etiqueta/${encodeURIComponent(itemId)}`;
}

function shippingV2TechnicalSheetHref(item: Pick<ShippingV2Item, "id" | "technicalSheet">) {
  return isFichaGenerada(item)
    ? `/shipping-v2/recepcion/ficha/${encodeURIComponent(item.id)}/print?print=1`
    : `/shipping-v2/recepcion/ficha/${encodeURIComponent(item.id)}`;
}

function ProviderDatum({
  label,
  value,
  featured,
}: {
  label: string;
  value: ReactNode;
  featured?: boolean;
}) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${featured ? "border-[#D7FF4F] bg-[#D7FF4F] text-[#151515]" : "border-[#30312D] bg-[#171814]"}`}>
      <p className={`text-[11px] font-bold uppercase tracking-normal ${featured ? "text-[#151515]/70" : "text-[#8F908A]"}`}>{label}</p>
      <div className={`mt-1 min-h-5 break-words text-sm font-semibold ${featured ? "text-[#151515]" : "text-[#F5F5F5]"}`}>{value}</div>
    </div>
  );
}

function ShippingV2ProviderItemDetailView({
  item,
  pago,
  packing,
  canEdit,
  canViewProviderCost,
  onSaveField,
  onSaved,
}: {
  item: ResolvedItem;
  pago?: ShippingV2Pago | null;
  packing?: ShippingV2Packing | null;
  canEdit: boolean;
  canViewProviderCost: boolean;
  onSaveField: (field: string, value: string | number | boolean | null) => Promise<void>;
  onSaved: (item: ShippingV2Item) => void;
}) {
  const C = SHIPPING_V2_ITEM_EDIT_FIELDS;
  const packingDisplay = packing?.packingId || item.packingId || "—";
  const paymentDisplay = pago?.pagoId || item.pagoId || "—";

  return (
    <div className="w-full max-w-none space-y-3">
      <section className="grid gap-3 xl:grid-cols-[minmax(520px,0.95fr)_minmax(0,1.05fr)] 2xl:grid-cols-[minmax(680px,1fr)_minmax(0,1.05fr)]">
        <article className="rounded-xl border border-[#30312D] bg-[#11120F] p-3 shadow-xl shadow-black/15 xl:sticky xl:top-24 xl:self-start">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-[#F5F5F5]">Fotos del item</h2>
            <span className="rounded-full border border-[#3A3A36] bg-[#151515] px-2.5 py-0.5 text-[12px] font-semibold text-[#A7A7A7]">{item.fotos.length} fotos</span>
          </div>
          <ItemPhotoViewer itemId={item.id} itemName={item.nombre} fotos={item.fotos} onUpdated={onSaved} canEdit={false} density="immersive" />
        </article>

        <main className="space-y-3">
          <article className="rounded-xl border border-[#30312D] bg-[#171814] p-4 shadow-xl shadow-black/15">
            <div className="flex flex-wrap gap-2">
              <EstadoBadge estado={item.estado} />
              <OperationBadge value={item.tipoOperacion} />
              <AvailabilityBadge item={item} />
            </div>

            <InlineEditableField
              label={C.nombre.label}
              value={item.nombre}
              type={C.nombre.type}
              displayValue={displayName(item.nombre)}
              hideLabel
              className="mt-3 rounded-lg transition"
              valueClassName="min-h-9 break-words text-2xl font-semibold leading-tight text-[#F5F5F5] lg:text-3xl"
              readOnly={!canEdit}
              onSave={(value) => onSaveField(C.nombre.field, value)}
            />

            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {canViewProviderCost ? <ProviderDatum label="Costo proveedor unitario" value={formatCurrency(item.costoProveedor)} featured /> : null}
              <ProviderDatum label="SKU proveedor" value={displayValue(item.skuProveedor)} />
              <ProviderDatum label="SKU" value={displayValue(item.sku)} />
              <ProviderDatum label="Categoría" value={displayValue(item.categoria)} />
              <ProviderDatum label="Estado item" value={<EstadoBadge estado={item.estado} />} />
              <ProviderDatum label="Packing" value={packingDisplay} />
              <ProviderDatum label="Pago" value={paymentDisplay} />
            </div>
          </article>

          <article className="rounded-xl border border-[#30312D] bg-[#11120F] p-3 shadow-xl shadow-black/15">
            <div className="mb-2 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#D7FF4F]" />
              <h2 className="text-sm font-semibold text-[#F5F5F5]">Observaciones internas</h2>
            </div>
            <InlineEditableField
              label={C.observacionesInternas.label}
              value={item.observacionesInternas}
              type={C.observacionesInternas.type}
              displayValue={displayValue(item.observacionesInternas, "Sin observaciones registradas.")}
              hideLabel
              className="rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 transition hover:border-[#D7FF4F]/35"
              valueClassName="min-h-24 break-words text-sm leading-6 text-[#F5F5F5]"
              readOnly={!canEdit}
              onSave={(value) => onSaveField(C.observacionesInternas.field, value)}
            />
          </article>
        </main>
      </section>
    </div>
  );
}

export function ShippingV2ItemDetailView({
  item: initialItem,
  proveedores,
  pago,
  packing,
  novedades,
  onSaved,
  esAdmin = false,
  permissions,
}: {
  item: ResolvedItem;
  proveedores: ShippingV2Proveedor[];
  pago?: ShippingV2Pago | null;
  packing?: ShippingV2Packing | null;
  novedades?: ShippingV2Novedad[];
  onSaved?: (item: ShippingV2Item) => void;
  /** Habilita los campos de corrección manual (config.adminOnly). */
  esAdmin?: boolean;
  permissions?: ShippingV2AccessPermissions | null;
}) {
  const providerLabelsById = useMemo(() => createShippingV2ProveedorLabelMap(proveedores), [proveedores]);
  const [item, setItem] = useState(initialItem);
  const [applyingAiName, setApplyingAiName] = useState(false);
  const [facebookSuperGeekModalOpen, setFacebookSuperGeekModalOpen] = useState(false);
  const [facebookSuperGeekDetailBusy, setFacebookSuperGeekDetailBusy] = useState(false);
  const [facebookTextDraft, setFacebookTextDraft] = useState(initialItem.textoFacebook ?? "");
  const [facebookTextSaving, setFacebookTextSaving] = useState(false);
  const [facebookTextMessage, setFacebookTextMessage] = useState("");
  const [ignoredAiName, setIgnoredAiName] = useState("");
  const [activeTab, setActiveTab] = useState<ItemDetailTabKey>("general");
  const purchaseProviderOptions = useMemo(
    () => proveedores.filter(canBePurchaseProvider).map((proveedor) => ({ value: proveedor.id, label: getShippingV2ProveedorLabel(proveedor) })),
    [proveedores]
  );
  const itemLogisticsProviderOptions = useMemo(
    () => proveedores.filter(canBeItemLogisticsProvider).map((proveedor) => ({ value: proveedor.id, label: getShippingV2ProveedorLabel(proveedor) })),
    [proveedores]
  );

  useEffect(() => {
    setItem(initialItem);
  }, [initialItem]);

  useEffect(() => {
    setFacebookTextDraft(item.textoFacebook ?? "");
  }, [item.id, item.textoFacebook]);

  function handleSaved(updatedItem: ShippingV2Item) {
    const resolved: ResolvedItem = {
      ...updatedItem,
      proveedorCompraDisplay: resolveShippingV2ProveedorLabel(updatedItem.proveedorId, providerLabelsById),
      proveedorLogisticoDisplay: resolveShippingV2ProveedorLabel(updatedItem.proveedorLogisticoId, providerLabelsById),
    };
    setItem(resolved);
    onSaved?.(updatedItem);
  }

  async function saveField(field: string, value: string | number | boolean | null) {
    const response = await fetch(`/api/shipping-v2/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field, value }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.success) {
      throw new Error(String(payload.error || "No se pudo actualizar el item."));
    }

    handleSaved(payload.data as ShippingV2Item);
  }

  async function applyAiNameSuggestion() {
    const suggestion = item.aiNombre?.trim();
    if (!suggestion || normalizeText(suggestion) === normalizeText(item.nombre)) return;

    setApplyingAiName(true);
    try {
      const response = await fetch(`/api/shipping-v2/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field: C.nombre.field,
          value: suggestion,
          eventDescription: "Nombre del item actualizado con sugerencia IA.",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(String(payload.error || "No se pudo aplicar la sugerencia IA."));
      }
      handleSaved(payload.data as ShippingV2Item);
      setIgnoredAiName("");
    } finally {
      setApplyingAiName(false);
    }
  }

  async function refreshItem() {
    const response = await fetch(`/api/shipping-v2/items/${item.id}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload.success) {
      handleSaved(payload.data as ShippingV2Item);
    }
  }

  useEffect(() => {
    setIgnoredAiName("");
    void refreshItem();
    const timeout = window.setTimeout(() => {
      void refreshItem();
    }, 4000);
    return () => window.clearTimeout(timeout);
  }, [item.id]);

  const C = SHIPPING_V2_ITEM_EDIT_FIELDS;
  const gananciaUnidad = calculateItemUnitProfit(item);
  const gananciaStock = calculateItemStockProfit(item);
  const costoStock = calculateItemStockCost(item);
  const aiNameSuggestion = item.aiNombre?.trim();
  const canEditItems = permissions?.canEditItems !== false;
  const canEditProviderItemFields = permissions?.canEditProviderItemFields === true;
  const canViewCosts = permissions?.canViewCosts !== false;
  const canViewProviderCost = canViewCosts || permissions?.canViewProviderCost !== false;
  const canUseRecepcion = permissions?.canUseRecepcion !== false;
  const isProviderDetail = !canEditItems && canEditProviderItemFields;
  const hasAiNameSuggestion = Boolean(aiNameSuggestion && normalizeText(aiNameSuggestion) !== normalizeText(item.nombre) && aiNameSuggestion !== ignoredAiName);

  async function toggleFacebookSuperGeek(value: boolean) {
    setFacebookSuperGeekDetailBusy(true);
    setFacebookTextMessage("");
    try {
      await saveField(C.facebookSuperGeek.field, value);
      setFacebookTextMessage("Facebook Super Geek activado. Airtable ya puede publicar este texto.");
    } catch (error) {
      setFacebookTextMessage(error instanceof Error ? error.message : "No se pudo actualizar Facebook Super Geek.");
    } finally {
      setFacebookSuperGeekDetailBusy(false);
    }
  }

  async function saveFacebookText() {
    setFacebookTextSaving(true);
    setFacebookTextMessage("");
    try {
      await saveField(C.textoFacebook.field, facebookTextDraft);
      setFacebookTextMessage("Texto Facebook guardado. Ya puedes aprobar la publicación.");
    } catch (error) {
      setFacebookTextMessage(error instanceof Error ? error.message : "No se pudo guardar Texto Facebook.");
    } finally {
      setFacebookTextSaving(false);
    }
  }

  function openFacebookSuperGeekModal() {
    setFacebookTextDraft(item.textoFacebook ?? "");
    setFacebookTextMessage("");
    setFacebookSuperGeekModalOpen(true);
  }

  if (isProviderDetail) {
    return (
      <ShippingV2ProviderItemDetailView
        item={item}
        pago={pago}
        packing={packing}
        canEdit={canEditProviderItemFields}
        canViewProviderCost={canViewProviderCost}
        onSaveField={saveField}
        onSaved={handleSaved}
      />
    );
  }

  const tabs: Array<{ key: ItemDetailTabKey; label: string; title: string; accent: "lime" | "purple" | "orange" | "yellow"; rows: DetailRow[] }> = [
    {
      key: "general",
      label: "General",
      title: "Datos generales",
      accent: "lime",
      rows: [
        { label: C.sku.label, value: item.sku, config: C.sku },
        { label: C.skuProveedor.label, value: item.skuProveedor, config: C.skuProveedor },
        { label: C.numeroSerie.label, value: item.numeroSerie, config: C.numeroSerie },
        { label: C.marca.label, value: item.marca, config: C.marca },
        { label: C.modelo.label, value: item.modelo, config: C.modelo },
        { label: C.categoria.label, value: item.categoria, config: C.categoria },
        { label: C.tipoItem.label, value: item.tipoItem, config: C.tipoItem },
        { label: C.condicion.label, value: item.condicion, config: C.condicion },
        { label: C.cantidad.label, value: item.cantidad ?? item.qty, config: C.cantidad },
        { label: C.unidad.label, value: item.unidad, config: C.unidad },
        { label: C.estadoItem.label, value: item.estado, displayValue: <EstadoBadge estado={item.estado} />, config: C.estadoItem },
        { label: C.estadoRevision.label, value: item.estadoRevision, config: C.estadoRevision },
        { label: C.afectaInventario.label, value: item.afectaInventario, displayValue: displayBoolean(item.afectaInventario), config: C.afectaInventario },
        { label: C.disponibleVenta.label, value: item.disponibleVenta, displayValue: displayBoolean(item.disponibleVenta), config: C.disponibleVenta },
        { label: C.reservado.label, value: item.reservado, config: C.reservado },
        { label: C.facebookSuperGeek.label, value: item.facebookSuperGeek, displayValue: displayBoolean(item.facebookSuperGeek), readOnly: true },
        { label: C.ubicacionActual.label, value: item.ubicacionActual, config: C.ubicacionActual },
        { label: "Origen físico actual", value: item.origenFisicoActual, readOnly: true },
      ],
    },
    ...(canViewCosts ? [{
      key: "costos",
      label: "Costos",
      title: "Costos y venta",
      accent: "lime",
      rows: [
        { label: C.costoProveedor.label, value: item.costoProveedor, displayValue: formatCurrency(item.costoProveedor), config: C.costoProveedor },
        { label: "Costo flete asignado", value: item.costoFleteAsignado, displayValue: formatCurrency(item.costoFleteAsignado), readOnly: true },
        { label: "Costo arancel asignado", value: item.costoArancelAsignado, displayValue: formatCurrency(item.costoArancelAsignado), readOnly: true },
        { label: "Otros costos asignados", value: item.otrosCostosAsignados, displayValue: formatCurrency(item.otrosCostosAsignados), readOnly: true },
        { label: "Costo logístico asignado", value: item.costoLogisticoAsignado, displayValue: formatCurrency(item.costoLogisticoAsignado), readOnly: true },
        { label: "Costo total unitario", value: item.costoTotalUnidad, displayValue: formatCurrency(item.costoTotalUnidad), readOnly: true },
        { label: "Costo total del stock", value: costoStock, displayValue: formatCurrency(costoStock), readOnly: true },
        { label: "Costo asignado despiece", value: item.costoAsignadoDespiece, displayValue: formatCurrency(item.costoAsignadoDespiece), readOnly: true },
        { label: "Costo total estimado", value: item.costoTotalEstimado, displayValue: formatCurrency(item.costoTotalEstimado), readOnly: true },
        { label: C.precioVentaSugerido.label, value: item.precioVentaSugerido, displayValue: formatCurrency(item.precioVentaSugerido), config: C.precioVentaSugerido },
        { label: C.precioVentaFinal.label, value: item.precioVenta, displayValue: formatCurrency(item.precioVenta), config: C.precioVentaFinal },
        { label: "Ganancia por unidad", value: gananciaUnidad, displayValue: formatCurrency(gananciaUnidad), readOnly: true },
        { label: "Ganancia total del stock", value: gananciaStock, displayValue: formatCurrency(gananciaStock), readOnly: true },
      ],
    } satisfies { key: ItemDetailTabKey; label: string; title: string; accent: "lime" | "purple" | "orange" | "yellow"; rows: DetailRow[] }] : []),
    {
      key: "logistica",
      label: "Logística",
      title: "Proveedores y logística",
      accent: "orange",
      rows: [
        { label: C.proveedorCompra.label, value: item.proveedorId, displayValue: displayValue(item.proveedorCompraDisplay), config: C.proveedorCompra, options: purchaseProviderOptions },
        { label: C.proveedorLogistico.label, value: item.proveedorLogisticoId, displayValue: displayValue(item.proveedorLogisticoDisplay), config: C.proveedorLogistico, options: itemLogisticsProviderOptions },
        { label: C.modoLogistico.label, value: item.modoLogistico, config: C.modoLogistico, readOnly: Boolean(item.packingId) },
        { label: "Tracking hacia intermediario", value: item.trackingHaciaIntermediario, readOnly: true },
        { label: "Tracking desde intermediario", value: item.trackingDesdeIntermediario, readOnly: true },
        { label: C.estadoTriangulacion.label, value: item.estadoTriangulacion, config: C.estadoTriangulacion },
        { label: C.estadoDespiece.label, value: item.estadoDespiece, config: C.estadoDespiece },
      ],
    },
    {
      key: "pago",
      label: "Pago",
      title: "Pago relacionado",
      accent: "yellow",
      rows: [
        { label: C.requierePago.label, value: item.requierePago, displayValue: displayBoolean(item.requierePago), config: C.requierePago },
        { label: "Pago Shipping V2 relacionado", value: item.pagoId, displayValue: pago?.pagoId || item.pagoId || "—", config: C.pagoRelacionado },
        { label: "Estado de pago", value: pago?.estadoPago, displayValue: pago?.estadoPago ? <EstadoBadge estado={pago.estadoPago} /> : "—", readOnly: true },
        { label: "Total del pago", value: pago?.totalAPagar ?? pago?.total, displayValue: formatCurrency(pago?.totalAPagar ?? pago?.total ?? null), readOnly: true },
        { label: "Fecha real de pago", value: pago?.fechaPagoReal, displayValue: formatDate(pago?.fechaPagoReal), readOnly: true },
        { label: "Pago legacy", value: item.legacyPagoRelacionadoIds.join(", "), readOnly: true },
      ],
    },
    {
      key: "packing",
      label: "Packing",
      title: "Packing y tracking",
      accent: "purple",
      rows: [
        { label: C.requierePacking.label, value: item.requierePacking, displayValue: displayBoolean(item.requierePacking), config: C.requierePacking },
        { label: C.packingRelacionado.label, value: item.packingId, displayValue: packing?.packingId || item.packingId || "—", config: C.packingRelacionado },
        { label: "Estado packing", value: packing?.estado, displayValue: packing?.estado ? <EstadoBadge estado={packing.estado} /> : "—", readOnly: true },
        { label: C.trackingDirecto.label, value: item.trackingDirecto, config: C.trackingDirecto, readOnly: item.modoLogistico !== "Tracking directo" },
        { label: "Tracking USA", value: packing?.trackingUsa || item.trackingUsa, readOnly: true },
        { label: "Tracking EC", value: packing?.trackingEc || item.trackingEc, readOnly: true },
        { label: "Peso", value: packing?.peso, displayValue: packing?.peso === null || packing?.peso === undefined ? "—" : `${packing.peso} kg`, readOnly: true },
      ],
    },
    {
      key: "observaciones",
      label: "Observaciones",
      title: "Observaciones y auditoría",
      accent: "orange",
      rows: [
        { label: C.observacionesInternas.label, value: item.observacionesInternas, config: C.observacionesInternas },
        { label: C.observacionVenta.label, value: item.observacionVenta, config: C.observacionVenta },
        { label: "Evidencias", value: "", displayValue: attachmentList(item.evidencias), readOnly: true },
        { label: C.itemPadre.label, value: item.itemPadreId, config: C.itemPadre },
        { label: C.itemsHijos.label, value: item.itemHijoIds.join(", "), displayValue: item.itemHijoIds.length ? item.itemHijoIds.join(", ") : "—", config: C.itemsHijos },
        { label: "Motivo despiece", value: item.motivoDespiece, readOnly: true },
        { label: "Fecha despiece", value: item.fechaDespiece, displayValue: formatDate(item.fechaDespiece), readOnly: true },
        { label: C.fechaRegistro.label, value: item.fechaRegistro || item.createdTime, displayValue: formatDate(item.fechaRegistro || item.createdTime), config: C.fechaRegistro },
        { label: C.registradoPor.label, value: item.registradoPor, config: C.registradoPor },
        { label: C.ultimaActualizacion.label, value: item.ultimaActualizacion, displayValue: formatDate(item.ultimaActualizacion), config: C.ultimaActualizacion },
        { label: C.actualizadoPor.label, value: item.actualizadoPor, config: C.actualizadoPor },
      ],
    },
    {
      // Esta pestaña no pinta campos: renderiza su propia tabla de piezas
      // (ver el bloque de render más abajo). `rows` va vacío a propósito.
      key: "despiece",
      label: "Despiece",
      title: "Despiece",
      accent: "purple",
      rows: [],
    },
  ];
  const activeSection = tabs.find((tab) => tab.key === activeTab) ?? tabs[0];
  const fichaGenerada = isFichaGenerada(item);
  const fichaHref = shippingV2TechnicalSheetHref(item);
  const skuLabelHref = shippingV2SkuLabelHref(item.id);
  return (
    <div className="w-full max-w-none space-y-3">
      <section className="grid w-full gap-3 xl:grid-cols-12">
        <aside className="space-y-3 xl:col-span-4 2xl:col-span-3">
          <article className="rounded-xl border border-[#30312D] bg-[#11120F] p-3 shadow-xl shadow-black/15">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-[#F5F5F5]">Fotos</h2>
              <span className="rounded-full border border-[#3A3A36] bg-[#151515] px-2.5 py-0.5 text-[12px] font-semibold text-[#A7A7A7]">{item.fotos.length} fotos</span>
            </div>
            <ItemPhotoViewer itemId={item.id} itemName={item.nombre} fotos={item.fotos} onUpdated={handleSaved} canEdit={canEditItems} density="compact" />
          </article>

          {canViewCosts ? <article className="rounded-xl border border-[#30312D] bg-[#11120F] p-3 shadow-xl shadow-black/15">
            <h2 className="text-sm font-semibold text-[#F5F5F5]">Resumen rápido</h2>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <InlineEditableField
                label={C.precioVentaFinal.label}
                value={item.precioVenta}
                type={C.precioVentaFinal.type}
                displayValue={formatCurrency(item.precioVenta)}
                className="rounded-xl border border-[#D7FF4F] bg-[#D7FF4F] px-3 py-2 text-[#151515] transition"
                labelClassName="text-[11px] font-bold uppercase tracking-normal text-[#151515]/70"
                valueClassName="mt-1 min-h-5 break-words text-lg font-semibold tabular-nums text-[#151515]"
                readOnly={!canEditItems}
                onSave={(value) => saveField(C.precioVentaFinal.field, value)}
              />
              <DetailMetric label="Costo total unitario" value={formatCurrency(item.costoTotalUnidad)} />
              <InlineEditableField
                label={C.costoProveedor.label}
                value={item.costoProveedor}
                type={C.costoProveedor.type}
                displayValue={formatCurrency(item.costoProveedor)}
                className="rounded-xl border border-[#30312D] bg-[#171814] px-3 py-2 transition"
                labelClassName="text-[11px] font-bold uppercase tracking-normal text-[#8F908A]"
                valueClassName="mt-1 min-h-5 break-words text-lg font-semibold tabular-nums text-[#F5F5F5]"
                readOnly={!canEditItems}
                onSave={(value) => saveField(C.costoProveedor.field, value)}
              />
              <DetailMetric label="Costo logístico" value={formatCurrency(item.costoLogisticoAsignado)} />
              <DetailMetric label="Costo total del stock" value={formatCurrency(costoStock)} />
              <DetailMetric label="Ganancia por unidad" value={formatCurrency(gananciaUnidad)} tone={gananciaUnidad !== null && gananciaUnidad < 0 ? "orange" : "lime"} />
              <DetailMetric label="Ganancia total del stock" value={formatCurrency(gananciaStock)} tone={gananciaStock !== null && gananciaStock < 0 ? "orange" : "lime"} />
            </div>
          </article> : null}

          <article className="rounded-xl border border-[#30312D] bg-[#11120F] p-3 shadow-xl shadow-black/15">
            <h2 className="text-sm font-semibold text-[#F5F5F5]">Estado y disponibilidad</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <EstadoBadge estado={item.estado} />
              <OperationBadge value={item.tipoOperacion} />
              <AvailabilityBadge item={item} />
              <BooleanPill label="Requiere pago" value={item.requierePago} />
              <BooleanPill label="Requiere packing" value={item.requierePacking} />
              <BooleanPill label="Disponible venta" value={item.disponibleVenta} />
              <BooleanPill label="Facebook SG" value={item.facebookSuperGeek} />
            </div>
            <div className="mt-3">
              <SmallDataRow label="Ubicación" value={displayValue(item.ubicacionActual)} />
              <SmallDataRow label="Packing" value={displayValue(packing?.packingId || item.packingId)} />
              <SmallDataRow label="Pago" value={displayValue(pago?.pagoId || item.pagoId)} />
            </div>
          </article>
        </aside>

        <main className="space-y-3 xl:col-span-8 2xl:col-span-9">
          <article className="rounded-xl border border-[#30312D] bg-[#171814] p-4 shadow-xl shadow-black/15">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap gap-2">
                  <EstadoBadge estado={item.estado} />
                  <OperationBadge value={item.tipoOperacion} />
                  <AvailabilityBadge item={item} />
                  {item.conNovedad ? <span className="rounded-full border border-[#FF914D]/35 bg-[#FF914D]/12 px-2.5 py-0.5 text-[12px] font-semibold text-[#FFB07A]">Con novedad</span> : null}
                </div>
                <InlineEditableField
                  label={C.nombre.label}
                  value={item.nombre}
                  type={C.nombre.type}
                  displayValue={displayName(item.nombre)}
                  hideLabel
                  className="mt-3 rounded-lg transition"
                  valueClassName="min-h-8 break-words text-2xl font-semibold leading-tight text-[#F5F5F5] lg:text-3xl"
                  readOnly={!canEditItems}
                  onSave={(value) => saveField(C.nombre.field, value)}
                />
                <InlineEditableField
                  label={C.descripcion.label}
                  value={item.descripcion}
                  type={C.descripcion.type}
                  displayValue={displayValue(item.descripcion, "Sin descripción registrada.")}
                  hideLabel
                  className="mt-2 rounded-lg transition"
                  valueClassName="min-h-5 break-words text-sm leading-6 text-[#A7A7A7]"
                  readOnly={!canEditItems}
                  onSave={(value) => saveField(C.descripcion.field, value)}
                />
              </div>
              <TooltipProvider delayDuration={200}>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 lg:self-center">
                  <FacebookSuperGeekDetailButton
                    item={item}
                    checked={item.facebookSuperGeek === true}
                    canEdit={canEditItems}
                    busy={facebookSuperGeekDetailBusy}
                    onOpen={openFacebookSuperGeekModal}
                  />
                  {canUseRecepcion ? <Tooltip>
                    <TooltipTrigger asChild>
                      <Link href={fichaHref} target={fichaGenerada ? "_blank" : undefined} rel={fichaGenerada ? "noreferrer" : undefined} aria-label={fichaGenerada ? "Imprimir ficha" : "Preparar ficha"} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#3A3A36] bg-[#20211D] text-[#F5F5F5] transition hover:border-[#D7FF4F]/55 hover:text-[#D7FF4F] focus:outline-none focus:ring-2 focus:ring-[#D7FF4F]/35">
                        <Printer className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="bg-[#252622] text-[#F5F5F5]">
                      {fichaGenerada ? "Imprimir ficha" : "Preparar ficha"}
                    </TooltipContent>
                  </Tooltip> : null}
                  {canUseRecepcion ? <Tooltip>
                    <TooltipTrigger asChild>
                      <Link href={skuLabelHref} target="_blank" rel="noreferrer" aria-label="Imprimir etiqueta SKU" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#3A3A36] bg-[#20211D] text-[#F5F5F5] transition hover:border-[#D7FF4F]/55 hover:text-[#D7FF4F] focus:outline-none focus:ring-2 focus:ring-[#D7FF4F]/35">
                        <Tag className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="bg-[#252622] text-[#F5F5F5]">
                      Imprimir etiqueta SKU
                    </TooltipContent>
                  </Tooltip> : null}
                </div>
              </TooltipProvider>
            </div>
          </article>

          {facebookSuperGeekModalOpen ? (
            <FacebookSuperGeekTextModal
              item={item}
              draft={facebookTextDraft}
              canEdit={canEditItems}
              saving={facebookTextSaving}
              activating={facebookSuperGeekDetailBusy}
              message={facebookTextMessage}
              onDraftChange={(value) => {
                setFacebookTextDraft(value);
                if (facebookTextMessage) setFacebookTextMessage("");
              }}
              onSave={() => void saveFacebookText()}
              onActivate={() => void toggleFacebookSuperGeek(true)}
              onClose={() => setFacebookSuperGeekModalOpen(false)}
            />
          ) : null}

          {hasAiNameSuggestion && canEditItems ? (
            <article className="rounded-xl border border-[#D7FF4F]/25 bg-[#151613] p-3 shadow-lg shadow-black/10">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#D7FF4F]">Sugerencia de nombre</p>
                  <div className="mt-2 grid gap-2 lg:grid-cols-2">
                    <div className="min-w-0 rounded-lg border border-[#30312D] bg-[#11120F] px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-normal text-[#8F908A]">Nombre actual</p>
                      <p className="mt-1 truncate text-sm text-[#F5F5F5]">{displayName(item.nombre)}</p>
                    </div>
                    <div className="min-w-0 rounded-lg border border-[#D7FF4F]/30 bg-[#11120F] px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-normal text-[#D7FF4F]">Nombre sugerido</p>
                      <p className="mt-1 truncate text-sm text-[#F5F5F5]">{aiNameSuggestion}</p>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  <button type="button" onClick={() => void applyAiNameSuggestion()} disabled={applyingAiName} className="rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-3 py-2 text-sm font-bold text-[#151515] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60">
                    {applyingAiName ? "Aplicando..." : "Aplicar"}
                  </button>
                  <button type="button" onClick={() => setIgnoredAiName(aiNameSuggestion || "")} disabled={applyingAiName} className="rounded-lg border border-[#3A3A36] bg-[#252622] px-3 py-2 text-sm font-semibold text-[#F5F5F5] transition hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F] disabled:opacity-60">
                    Ignorar
                  </button>
                  <button type="button" onClick={() => void refreshItem()} disabled={applyingAiName} className="rounded-lg border border-[#3A3A36] bg-[#11120F] px-3 py-2 text-sm font-semibold text-[#A7A7A7] transition hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F] disabled:opacity-60">
                    Actualizar
                  </button>
                </div>
              </div>
            </article>
          ) : null}

          <section className="rounded-xl border border-[#30312D] bg-[#11120F] p-2 shadow-xl shadow-black/15">
            <div className="flex gap-1 overflow-x-auto pb-1">
              {tabs.map((tab) => {
                const active = tab.key === activeTab;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`shrink-0 rounded-lg border px-3 py-2 text-sm font-semibold transition ${active ? "border-[#D7FF4F] bg-[#D7FF4F] text-[#151515]" : "border-[#30312D] bg-[#171814] text-[#A7A7A7] hover:border-[#D7FF4F]/45 hover:text-[#D7FF4F]"}`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
            <div className="mt-2">
              {activeTab === "despiece" ? (
                // El despiece no es una lista de campos sino una tabla donde se
                // van creando artículos hijos, así que no usa DetailSection.
                <ShippingV2DespieceTab itemId={item.id} canEdit={canEditItems} />
              ) : (
                <DetailSection title={activeSection.title} accent={activeSection.accent} rows={activeSection.rows} onSave={saveField} esAdmin={esAdmin} canEdit={canEditItems} />
              )}
            </div>
          </section>

          <NovedadesVinculadasCard novedades={novedades ?? []} providerLabelsById={providerLabelsById} />
        </main>
      </section>
    </div>
  );
}

export function ShippingV2ItemsClient({ items: initialItems, proveedores, error, permissions, providerName, initialSortBy, pagination }: Props) {
  const router = useRouter();
  const canEditItems = permissions?.canEditItems !== false;
  const canViewCosts = permissions?.canViewCosts !== false;
  const canViewProviderCost = canViewCosts || permissions?.canViewProviderCost !== false;
  const isProviderPortal = Boolean(providerName && permissions?.canEditItems === false);
  const availableColumns = useMemo(() => getAvailableColumns(canViewCosts, canViewProviderCost), [canViewCosts, canViewProviderCost]);
  const availableSortOptions = useMemo(() => getSortOptions(canViewCosts, canViewProviderCost), [canViewCosts, canViewProviderCost]);
  const [items, setItems] = useState(initialItems);
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState(ALL);
  const [tipoOperacion, setTipoOperacion] = useState(ALL);
  const [proveedorCompra, setProveedorCompra] = useState(ALL);
  const [tipoItem, setTipoItem] = useState(ALL);
  const [sortBy, setSortBy] = useState<SortKey>(() => sanitizeProviderSort(initialSortBy, canViewCosts, canViewProviderCost));
  const [groupBy, setGroupBy] = useState<GroupKey>("none");
  const [notice, setNotice] = useState("");
  const [columnWidths, setColumnWidths] = useState<ShippingV2ItemsColumnWidths>(() => createDefaultColumnWidths());
  const [tableView, setTableView] = useState<ShippingV2ItemsTableViewConfig>(() => createDefaultTableViewConfig());
  const [fieldsPanelOpen, setFieldsPanelOpen] = useState(false);
  const [toolbarMenuOpen, setToolbarMenuOpen] = useState<ToolbarMenuKey | null>(null);
  const [draggedColumnKey, setDraggedColumnKey] = useState<ShippingV2ItemsColumnKey | null>(null);
  const [facebookSuperGeekBusyId, setFacebookSuperGeekBusyId] = useState("");
  const toolbarMenuRef = useRef<HTMLDivElement>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    const storedNotice = window.sessionStorage.getItem("shipping-v2:notice");
    if (!storedNotice) return;
    window.sessionStorage.removeItem("shipping-v2:notice");
    setNotice(storedNotice);
  }, []);

  useEffect(() => {
    const storedWidths = window.localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY);
    if (!storedWidths) return;

    try {
      const parsed = JSON.parse(storedWidths) as Partial<Record<ShippingV2ItemsColumnKey, unknown>>;
      setColumnWidths((current) => {
        const next = { ...current };
        availableColumns.forEach((column) => {
          const savedWidth = parsed[column.key];
          if (typeof savedWidth === "number" && Number.isFinite(savedWidth)) {
            next[column.key] = clampColumnWidth(savedWidth, column);
          }
        });
        return next;
      });
    } catch {
      window.localStorage.removeItem(COLUMN_WIDTHS_STORAGE_KEY);
    }
  }, [availableColumns]);

  useEffect(() => {
    const storedView = window.localStorage.getItem(TABLE_VIEW_STORAGE_KEY);
    if (!storedView) return;

    try {
      const parsed = JSON.parse(storedView) as Partial<ShippingV2ItemsTableViewConfig>;
      setTableView(sanitizeTableViewConfig(parsed, availableColumns));
    } catch {
      window.localStorage.removeItem(TABLE_VIEW_STORAGE_KEY);
    }
  }, [availableColumns]);

  useEffect(() => {
    return () => {
      resizeCleanupRef.current?.();
    };
  }, []);

  useEffect(() => {
    setSortBy(sanitizeProviderSort(initialSortBy, canViewCosts, canViewProviderCost));
  }, [canViewCosts, canViewProviderCost, initialSortBy]);

  useEffect(() => {
    if (!toolbarMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (toolbarMenuRef.current?.contains(target)) return;
      setToolbarMenuOpen(null);
    };

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setToolbarMenuOpen(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [toolbarMenuOpen]);

  const persistColumnWidths = useCallback((widths: ShippingV2ItemsColumnWidths) => {
    window.localStorage.setItem(COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(widths));
  }, []);

  const persistTableView = useCallback((config: ShippingV2ItemsTableViewConfig) => {
    window.localStorage.setItem(TABLE_VIEW_STORAGE_KEY, JSON.stringify(config));
  }, []);

  const resetColumnWidths = useCallback(() => {
    const defaults = createDefaultColumnWidths();
    setColumnWidths(defaults);
    persistColumnWidths(defaults);
  }, [persistColumnWidths]);

  const updateTableView = useCallback((updater: (current: ShippingV2ItemsTableViewConfig) => ShippingV2ItemsTableViewConfig) => {
    setTableView((current) => {
      const next = sanitizeTableViewConfig(updater(current), availableColumns);
      persistTableView(next);
      return next;
    });
  }, [availableColumns, persistTableView]);

  const toggleColumnVisibility = useCallback((column: ShippingV2ItemsColumn) => {
    if (column.required) return;
    updateTableView((current) => {
      const visible = new Set(current.visibleColumnKeys);
      if (visible.has(column.key)) {
        visible.delete(column.key);
      } else {
        visible.add(column.key);
      }
      return {
        ...current,
        visibleColumnKeys: current.orderedColumnKeys.filter((key) => visible.has(key)),
      };
    });
  }, [updateTableView]);

  const startColumnResize = useCallback((event: MouseEvent<HTMLElement>, column: ShippingV2ItemsColumn) => {
    event.preventDefault();
    event.stopPropagation();

    resizeCleanupRef.current?.();

    const startX = event.clientX;
    const startWidth = columnWidths[column.key];
    const originalUserSelect = document.body.style.userSelect;
    const originalCursor = document.body.style.cursor;
    let latestWidths: ShippingV2ItemsColumnWidths | null = null;

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const nextWidth = clampColumnWidth(startWidth + delta, column);

      setColumnWidths((current) => {
        const next = { ...current, [column.key]: nextWidth };
        latestWidths = next;
        return next;
      });
    };

    const cleanup = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", cleanup);
      document.body.style.userSelect = originalUserSelect;
      document.body.style.cursor = originalCursor;
      if (latestWidths) {
        persistColumnWidths(latestWidths);
      }
      resizeCleanupRef.current = null;
    };

    resizeCleanupRef.current = cleanup;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", cleanup);
  }, [columnWidths, persistColumnWidths]);

  const handleColumnDragStart = useCallback((event: DragEvent<HTMLTableCellElement>, columnKey: ShippingV2ItemsColumnKey) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-column-resize-handle]")) {
      event.preventDefault();
      return;
    }
    setDraggedColumnKey(columnKey);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", columnKey);
  }, []);

  const handleColumnDrop = useCallback((event: DragEvent<HTMLTableCellElement>, targetKey: ShippingV2ItemsColumnKey) => {
    event.preventDefault();
    const droppedKey = draggedColumnKey ?? event.dataTransfer.getData("text/plain");
    if (!isColumnKey(droppedKey) || droppedKey === targetKey) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const placement = event.clientX > rect.left + rect.width / 2 ? "after" : "before";

    updateTableView((current) => ({
      ...current,
      orderedColumnKeys: moveColumnKey(current.orderedColumnKeys, droppedKey, targetKey, placement),
    }));
    setDraggedColumnKey(null);
  }, [draggedColumnKey, updateTableView]);

  const resolvedItems = useMemo<ResolvedItem[]>(() => resolveShippingV2Items(items, proveedores), [items, proveedores]);

  const filterOptions = useMemo(() => getShippingV2ItemFilterOptions(resolvedItems), [resolvedItems]);

  const filteredItems = useMemo(() => filterShippingV2Items(resolvedItems, {
    search,
    estado,
    tipoOperacion,
    proveedorCompra,
    tipoItem,
  }), [estado, proveedorCompra, resolvedItems, search, tipoItem, tipoOperacion]);

  const sortedItems = useMemo(() => sortItems(filteredItems, sortBy), [filteredItems, sortBy]);
  const groupedItems = useMemo(() => groupItems(sortedItems, groupBy), [groupBy, sortedItems]);
  const visibleGroupCount = groupBy === "none" ? 0 : groupedItems.length;
  const visibleColumns = useMemo(() => {
    const visibleKeys = new Set(tableView.visibleColumnKeys);
    return tableView.orderedColumnKeys
      .map((key) => availableColumns.find((column) => column.key === key))
      .filter((column): column is ShippingV2ItemsColumn => Boolean(column && visibleKeys.has(column.key)));
  }, [availableColumns, tableView]);
  const tableWidth = useMemo(() => visibleColumns.reduce((total, column) => total + columnWidths[column.key], 0), [columnWidths, visibleColumns]);

  const summary = useMemo(() => ({
    total: resolvedItems.length,
    disponibles: resolvedItems.filter((item) => normalizeText(item.estado).includes("disponible") || item.disponibleVenta === true).length,
    pendientesPago: resolvedItems.filter((item) => normalizeText(item.estado).includes("pendiente pago")).length,
    enTransito: resolvedItems.filter((item) => normalizeText(item.estado).includes("transito")).length,
    conNovedad: resolvedItems.filter((item) => item.conNovedad === true || normalizeText(item.estado).includes("novedad")).length,
  }), [resolvedItems]);

  const activeFilterCount = [estado, tipoOperacion, proveedorCompra, tipoItem].filter((value) => value !== ALL).length;
  const activeFilterLabel = activeFilterCount === 1 ? "1 filtro activo" : `${activeFilterCount} filtros activos`;
  const sortLabel = availableSortOptions.find((option) => option.value === sortBy)?.label ?? "Más nuevos primero";
  const groupLabel = groupOptions.find((option) => option.value === groupBy)?.label ?? "Sin agrupar";

  const resetFilters = useCallback(() => {
    setEstado(ALL);
    setTipoOperacion(ALL);
    setProveedorCompra(ALL);
    setTipoItem(ALL);
  }, []);

  const buildSortHref = useCallback((nextSortBy: SortKey) => {
    const params = new URLSearchParams();
    if (nextSortBy !== "newest") {
      params.set("sort", nextSortBy);
    }
    const query = params.toString();
    return `/shipping-v2/items${query ? `?${query}` : ""}`;
  }, []);

  const selectSortBy = useCallback((nextSortBy: SortKey) => {
    const safeSortBy = sanitizeProviderSort(nextSortBy, canViewCosts, canViewProviderCost);
    setSortBy(safeSortBy);
    setToolbarMenuOpen(null);
    router.push(buildSortHref(safeSortBy));
  }, [buildSortHref, canViewCosts, canViewProviderCost, router]);

  const toggleToolbarMenu = useCallback((menu: ToolbarMenuKey) => {
    setFieldsPanelOpen(false);
    setToolbarMenuOpen((current) => (current === menu ? null : menu));
  }, []);

  const updateFacebookSuperGeek = useCallback(async (item: ResolvedItem, value: boolean) => {
    if (!canEditItems) return;
    if (!value) {
      setNotice("Facebook Super Geek ya no se puede desactivar desde el sistema.");
      return;
    }

    setFacebookSuperGeekBusyId(item.id);
    setNotice("");
    try {
      const response = await fetch(`/api/shipping-v2/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field: SHIPPING_V2_ITEM_EDIT_FIELDS.facebookSuperGeek.field,
          value,
          eventDescription: "Facebook Super Geek activado desde listado de Items.",
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload.success) {
        throw new Error(String(payload.error || "No se pudo actualizar Facebook Super Geek."));
      }

      const updated = payload.data as ShippingV2Item;
      setItems((current) => current.map((currentItem) => currentItem.id === updated.id ? updated : currentItem));
      setNotice(`${updated.sku || updated.nombre}: Facebook Super Geek activado.`);
    } catch (updateError) {
      setNotice(updateError instanceof Error ? updateError.message : "Error inesperado al actualizar Facebook Super Geek.");
    } finally {
      setFacebookSuperGeekBusyId("");
    }
  }, [canEditItems]);

  function openItemFromRow(event: MouseEvent<HTMLElement>, item: ResolvedItem) {
    const target = event.target as HTMLElement;
    if (target.closest("a,button,input,select,textarea")) return;
    router.push(`/shipping-v2/items/${item.id}`);
  }

  return (
    <div className="w-full space-y-2.5">
      <section className="grid gap-3 rounded-xl border border-[#30312D] bg-[#151613] px-3 py-2 shadow-xl shadow-black/20 sm:grid-cols-[auto_minmax(0,740px)_auto] sm:items-center 2xl:px-4 2xl:py-3">
        <div className="flex justify-start">
          <Link
            href="/shipping-v2"
            aria-label="Volver al dashboard de Shipping V2"
            title="Volver al dashboard"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#A7A7A7] transition hover:bg-[#20211D] hover:text-[#D7FF4F] focus:outline-none focus:ring-2 focus:ring-[#D7FF4F]/35"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
        </div>
        <div className="w-full">
          <ShippingV2ItemsPredictiveSearch search={search} setSearch={setSearch} fallbackItems={resolvedItems} canViewCosts={canViewCosts} />
        </div>
        <div ref={toolbarMenuRef} className="relative flex shrink-0 items-center gap-1.5 justify-self-start">
          <TooltipProvider delayDuration={180}>
            <ToolbarIconButton
              label="Filtrar"
              open={toolbarMenuOpen === "filters"}
              active={activeFilterCount > 0}
              badge={activeFilterCount || undefined}
              onClick={() => toggleToolbarMenu("filters")}
            >
              <ListFilter className="h-[18px] w-[18px]" aria-hidden="true" />
            </ToolbarIconButton>
            <ToolbarIconButton
              label={`Ordenar: ${sortLabel}`}
              open={toolbarMenuOpen === "sort"}
              active={sortBy !== "newest"}
              onClick={() => toggleToolbarMenu("sort")}
            >
              <ArrowDownAZ className="h-[18px] w-[18px]" aria-hidden="true" />
            </ToolbarIconButton>
            <ToolbarIconButton
              label={`Agrupar: ${groupLabel}`}
              open={toolbarMenuOpen === "group"}
              active={groupBy !== "none"}
              onClick={() => toggleToolbarMenu("group")}
            >
              <Rows3 className="h-[18px] w-[18px]" aria-hidden="true" />
            </ToolbarIconButton>
          </TooltipProvider>

          {canEditItems ? (
            <Button asChild size="sm" className="h-10 w-10 rounded-lg bg-[#D7FF4F] p-0 text-lg font-black text-[#151515] hover:bg-[#D7FF4F]/90">
              <Link href="/shipping-v2/items/nuevo" aria-label="Nuevo Item">+</Link>
            </Button>
          ) : null}

          {toolbarMenuOpen ? (
            <div
              role="menu"
              className={`absolute right-0 top-full z-50 mt-2 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-[#30312D] bg-[#11120F] shadow-2xl shadow-black/45 animate-in fade-in-0 zoom-in-95 duration-150 ${
                toolbarMenuOpen === "filters" ? "w-[min(92vw,680px)]" : "w-[min(92vw,320px)]"
              }`}
            >
              {toolbarMenuOpen === "filters" ? (
                <>
                  <div className="flex items-center justify-between gap-3 border-b border-[#30312D] px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#F5F5F5]">Filtros</p>
                      <p className="mt-0.5 text-[12px] text-[#8F908A]">{activeFilterCount ? activeFilterLabel : "Sin filtros activos"}</p>
                    </div>
                    <button
                      type="button"
                      onClick={resetFilters}
                      disabled={!activeFilterCount}
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[#3A3A36] bg-[#151613] px-2.5 text-[12px] font-semibold text-[#A7A7A7] transition hover:border-[#D7FF4F]/45 hover:text-[#D7FF4F] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-[#3A3A36] disabled:hover:text-[#A7A7A7]"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                      Limpiar
                    </button>
                  </div>
                  <div className="grid gap-2 p-2 sm:grid-cols-2">
                    <FilterGroup className="rounded-lg border border-[#30312D] bg-[#171814] p-2" label="Estado Item" values={filterOptions.estados} selected={estado} onChange={setEstado} />
                    <FilterGroup className="rounded-lg border border-[#30312D] bg-[#171814] p-2" label="Tipo de operación" values={filterOptions.operaciones} selected={tipoOperacion} onChange={setTipoOperacion} />
                    <FilterGroup className="rounded-lg border border-[#30312D] bg-[#171814] p-2" label="Proveedor compra" values={filterOptions.proveedores} selected={proveedorCompra} onChange={setProveedorCompra} />
                    <FilterGroup className="rounded-lg border border-[#30312D] bg-[#171814] p-2" label="Rol general del item" values={filterOptions.tipos} selected={tipoItem} onChange={setTipoItem} />
                  </div>
                </>
              ) : null}

              {toolbarMenuOpen === "sort" ? (
                <>
                  <div className="border-b border-[#30312D] px-3 py-2">
                    <p className="text-sm font-semibold text-[#F5F5F5]">Ordenar por</p>
                    <p className="mt-0.5 truncate text-[12px] text-[#8F908A]">{sortLabel}</p>
                  </div>
                  <div className="grid max-h-[420px] gap-1 overflow-y-auto p-2">
                    {availableSortOptions.map((option) => (
                      <ToolbarMenuOption
                        key={option.value}
                        option={option}
                        active={sortBy === option.value}
                        onSelect={(value) => {
                          selectSortBy(value);
                        }}
                      />
                    ))}
                  </div>
                </>
              ) : null}

              {toolbarMenuOpen === "group" ? (
                <>
                  <div className="border-b border-[#30312D] px-3 py-2">
                    <p className="text-sm font-semibold text-[#F5F5F5]">Agrupar por</p>
                    <p className="mt-0.5 truncate text-[12px] text-[#8F908A]">{groupLabel}</p>
                  </div>
                  <div className="grid max-h-[420px] gap-1 overflow-y-auto p-2">
                    {groupOptions.map((option) => (
                      <ToolbarMenuOption
                        key={option.value}
                        option={option}
                        active={groupBy === option.value}
                        onSelect={(value) => {
                          setGroupBy(value);
                          setToolbarMenuOpen(null);
                        }}
                      />
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-5">
        <MiniMetric label="Items página" value={summary.total} tone="lime" />
        <MiniMetric label="Disponibles pág." value={summary.disponibles} tone="lime" />
        <MiniMetric label="Pendientes pág." value={summary.pendientesPago} tone="yellow" />
        <MiniMetric label="En transito pág." value={summary.enTransito} tone="purple" />
        <MiniMetric label="Con novedad pág." value={summary.conNovedad} tone="orange" />
      </section>

      {error ? (
        <section className="rounded-[1rem] border border-orange-300/25 bg-orange-300/10 p-3 text-orange-100">
          <p className="text-sm font-semibold uppercase tracking-normal">Airtable V2 no disponible</p>
          <p className="mt-1 text-sm leading-5 text-orange-100/85">{error}</p>
        </section>
      ) : null}

      {notice ? (
        <section className="rounded-[1rem] border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 px-3 py-2 text-sm font-medium text-[#D7FF4F]">
          {notice}
        </section>
      ) : null}

      <section className="rounded-xl border border-[#30312D] bg-[#171814] shadow-2xl shadow-black/25">
        <div className="flex flex-col gap-1.5 border-b border-[#30312D] bg-[#20211D] px-3 py-2 sm:flex-row sm:items-center sm:justify-between 2xl:px-4 2xl:py-2.5">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[#F5F5F5]">Listado</h2>
            <p className="text-[13px] text-[#A7A7A7]">
              Página {pagination.pageIndex} · Leídos: {resolvedItems.length} de {pagination.pageSize} · Mostrando: {sortedItems.length}
              {visibleGroupCount ? ` · Grupos: ${visibleGroupCount}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-[#30312D] bg-[#11120F] p-1">
              <PaginationLinkButton href={pagination.firstHref} disabled={!pagination.hasPreviousPage} ariaLabel="Ir a la primera página">
                <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
              </PaginationLinkButton>
              <PaginationLinkButton href={pagination.previousHref} disabled={!pagination.hasPreviousPage} ariaLabel="Ir a la página anterior">
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Anterior</span>
              </PaginationLinkButton>
              <span className="inline-flex h-8 items-center rounded-lg border border-[#30312D] bg-[#171814] px-2.5 text-[12px] font-bold text-[#F5F5F5]">
                Pág. {pagination.pageIndex}
              </span>
              <PaginationLinkButton href={pagination.nextHref} disabled={!pagination.hasNextPage} ariaLabel="Ir a la página siguiente">
                <span className="hidden sm:inline">Siguiente</span>
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </PaginationLinkButton>
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setFieldsPanelOpen((open) => !open)}
                className={`h-7 rounded-lg border px-2.5 text-[12px] font-semibold transition ${fieldsPanelOpen ? "border-[#D7FF4F] bg-[#D7FF4F] text-[#151515]" : "border-[#3A3A36] bg-[#151613] text-[#A7A7A7] hover:border-[#D7FF4F]/55 hover:text-[#D7FF4F]"}`}
              >
                Campos
              </button>
              {fieldsPanelOpen ? (
                <div className="absolute right-0 z-30 mt-2 w-[320px] overflow-hidden rounded-xl border border-[#30312D] bg-[#11120F] shadow-2xl shadow-black/40">
                  <div className="border-b border-[#30312D] px-3 py-2">
                    <p className="text-sm font-semibold text-[#F5F5F5]">Campos visibles</p>
                    <p className="mt-0.5 text-[12px] text-[#8F908A]">{visibleColumns.length} de {availableColumns.length} columnas activas</p>
                  </div>
                  <div className="max-h-[420px] overflow-y-auto p-2">
                    {COLUMN_CATEGORIES.map((category) => {
                      const categoryColumns = availableColumns.filter((column) => column.category === category);
                      if (!categoryColumns.length) return null;
                      return (
                        <section key={category} className="mb-2 last:mb-0">
                          <p className="px-2 py-1 text-[11px] font-bold uppercase tracking-normal text-[#8F908A]">{category}</p>
                          <div className="grid gap-1">
                            {categoryColumns.map((column) => {
                              const checked = tableView.visibleColumnKeys.includes(column.key);
                              return (
                                <label
                                  key={column.key}
                                  className={`flex items-center justify-between gap-3 rounded-lg border px-2.5 py-2 text-sm transition ${checked ? "border-[#D7FF4F]/35 bg-[#D7FF4F]/10 text-[#F5F5F5]" : "border-[#30312D] bg-[#171814] text-[#A7A7A7] hover:border-[#D7FF4F]/35 hover:text-[#F5F5F5]"}`}
                                >
                                  <span className="min-w-0">
                                    <span className="block truncate font-semibold">{column.label}</span>
                                    {column.required ? <span className="text-[11px] text-[#8F908A]">Obligatoria</span> : null}
                                  </span>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={column.required}
                                    onChange={() => toggleColumnVisibility(column)}
                                    className="h-4 w-4 accent-[#D7FF4F] disabled:opacity-50"
                                  />
                                </label>
                              );
                            })}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={resetColumnWidths}
              className="h-7 rounded-lg border border-[#3A3A36] bg-[#151613] px-2.5 text-[12px] font-semibold text-[#A7A7A7] transition hover:border-[#D7FF4F]/55 hover:text-[#D7FF4F]"
            >
              Reset anchos
            </button>
            <Badge className="h-6 w-fit rounded-full border-[#D7FF4F]/35 bg-[#D7FF4F]/10 px-2.5 text-[12px] font-bold uppercase text-[#D7FF4F] hover:bg-[#D7FF4F]/10">
              {isProviderPortal ? "Vista proveedor" : "Solo lectura"}
            </Badge>
          </div>
        </div>
        <div className="hidden max-w-full overflow-x-auto xl:block">
          <table
            className="border-separate border-spacing-0 text-left text-[13px] 2xl:text-sm"
            style={{ tableLayout: "fixed", width: tableWidth, minWidth: tableWidth }}
          >
            <colgroup>
              {visibleColumns.map((column) => (
                <col key={column.key} style={{ width: columnWidths[column.key], minWidth: column.minWidth }} />
              ))}
            </colgroup>
            <thead className="text-[12px] uppercase tracking-normal text-[#A7A7A7] 2xl:text-[13px]">
              <tr>
                {visibleColumns.map((column) => (
                  <th
                    key={column.key}
                    draggable
                    onDragStart={(event) => handleColumnDragStart(event, column.key)}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(event) => handleColumnDrop(event, column.key)}
                    onDragEnd={() => setDraggedColumnKey(null)}
                    style={{
                      width: columnWidths[column.key],
                      minWidth: column.minWidth,
                      maxWidth: column.maxWidth,
                    }}
                    className={`relative whitespace-nowrap border-b border-[#3A3A36] px-2.5 py-2 font-semibold select-none 2xl:px-3 2xl:py-2.5 ${draggedColumnKey === column.key ? "bg-[#D7FF4F]/10 text-[#D7FF4F]" : ""} ${column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left"}`}
                  >
                    <div className="min-w-0 cursor-grab pr-2 active:cursor-grabbing">
                      <span className="block truncate">{column.label}</span>
                    </div>
                    <span
                      data-column-resize-handle
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Redimensionar columna ${column.label}`}
                      onMouseDown={(event) => startColumnResize(event, column)}
                      className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none select-none after:absolute after:right-0 after:top-1/2 after:h-6 after:w-px after:-translate-y-1/2 after:bg-transparent after:transition hover:after:bg-[#D7FF4F]/70"
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-[#F5F5F5]">
              {sortedItems.length ? groupedItems.map((group) => (
                <Fragment key={group.key}>
                  {groupBy !== "none" ? (
                    <tr>
                      <td colSpan={visibleColumns.length} className="border-b border-[#3A3A36] bg-[#1E1F1C] px-2.5 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-semibold text-[#F5F5F5]">{group.label}</span>
                          <span className="rounded-full border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 px-2.5 py-0.5 text-[12px] font-semibold text-[#D7FF4F]">
                            {group.items.length} items
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                  {group.items.map((item) => (
                    <tr
                      key={item.id}
                      tabIndex={0}
                      onClick={(event) => openItemFromRow(event, item)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          router.push(`/shipping-v2/items/${item.id}`);
                        }
                      }}
                      className="cursor-pointer transition hover:bg-[#CFFF3A]/[0.055] focus:bg-[#CFFF3A]/[0.055] focus:outline-none"
                    >
                      {visibleColumns.map((column) => {
                        const mutedColumn = column.key === "generalRole" || column.key === "category" || column.key === "packing" || column.key === "createdAt" || column.key === "brand" || column.key === "model" || column.key === "serial" || column.key === "condition" || column.key === "location" || column.key === "triangulationStatus" || column.key === "reviewStatus" || column.key === "requiresPayment" || column.key === "requiresPacking" || column.key === "physicalReview" || column.key === "notes";
                        const alignClass = column.align === "right"
                          ? "whitespace-nowrap text-right tabular-nums"
                          : column.align === "center"
                            ? "whitespace-nowrap text-center tabular-nums"
                            : "whitespace-nowrap";
                        return (
                          <td
                            key={column.key}
                            title={getItemCellTitle(item, column.key)}
                            style={{
                              width: columnWidths[column.key],
                              minWidth: column.minWidth,
                              maxWidth: column.maxWidth,
                            }}
                            className={`overflow-hidden border-b border-[#3A3A36]/80 px-2.5 py-2 2xl:px-3 2xl:py-2.5 ${column.key === "sku" ? "font-semibold text-[#CFFF3A]" : ""} ${alignClass} ${mutedColumn ? "text-[#A7A7A7]" : ""}`}
                          >
                            {renderItemCell(item, column.key, {
                              canEditFacebookSuperGeek: canEditItems,
                              facebookSuperGeekBusyId,
                              onFacebookSuperGeekChange: updateFacebookSuperGeek,
                            })}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              )) : (
                <tr>
                  <td colSpan={visibleColumns.length} className="px-4 py-10 text-center text-[#A7A7A7]">
                    No se encontraron items con los filtros actuales.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="grid gap-2 p-2 xl:hidden">
          {sortedItems.length ? groupedItems.map((group) => (
            <div key={group.key} className="grid gap-3">
              {groupBy !== "none" ? (
                <div className="flex items-center justify-between rounded-[1.15rem] border border-[#3A3A36] bg-[#1E1F1C] px-4 py-3">
                  <span className="text-sm font-semibold text-[#F5F5F5]">{group.label}</span>
                  <span className="rounded-full border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 px-3 py-1 text-[12px] font-semibold text-[#D7FF4F]">
                    {group.items.length} items
                  </span>
                </div>
              ) : null}
              {group.items.map((item) => (
                <MobileItemCard
                  key={item.id}
                  item={item}
                  canViewCosts={canViewCosts}
                  canViewProviderCost={canViewProviderCost}
                  canEditFacebookSuperGeek={canEditItems}
                  facebookSuperGeekBusy={facebookSuperGeekBusyId === item.id}
                  onFacebookSuperGeekChange={updateFacebookSuperGeek}
                  onOpen={() => router.push(`/shipping-v2/items/${item.id}`)}
                />
              ))}
            </div>
          )) : (
            <div className="rounded-[1.35rem] border border-[#3A3A36] bg-[#1E1E1E] px-4 py-10 text-center text-sm text-[#A7A7A7]">
              No se encontraron items con los filtros actuales.
            </div>
          )}
        </div>
      </section>

    </div>
  );
}
