"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from "react";
import { ArrowDownAZ, ArrowLeft, BadgeCheck, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ClipboardCheck, ClipboardList, Columns3, FileText, GitBranch, ListFilter, Loader2, Printer, Receipt, Rows3, Settings2, ShoppingCart, Sparkles, Tag, Truck, Wrench, X, type LucideIcon } from "lucide-react";
import { ItemPhotoViewer } from "@/components/shipping-v2/ItemPhotoViewer";
import { ejecutarAccionNovedad, NovedadAccionModal } from "@/components/shipping-v2/novedades/NovedadAccionModal";
import { RegistrarNovedadModal } from "@/components/shipping-v2/novedades/RegistrarNovedadModal";
import {
  articuloSalioDelInventario,
  etiquetaPropuesta,
  etiquetaTurno,
  getAccionesDisponibles,
  type ShippingV2NovedadAccionConfig,
  type ShippingV2NovedadRol,
  type ValoresAccionNovedad,
} from "@/lib/shipping-v2/novedades";
import { InlineEditableField } from "@/components/shipping-v2/InlineEditableField";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SHIPPING_V2_ITEM_EDIT_FIELDS, type ShippingV2ItemEditFieldConfig } from "@/lib/shipping-v2/item-edit-config";
import { evaluarVentaItem } from "@/lib/shipping-v2/item-venta";
import { ETIQUETA_SITUACION_PAGO } from "@/lib/shipping-v2/pagos-situacion";
import {
  SHIPPING_V2_ALL_FILTER,
  formatShippingV2ItemQuantity,
  getShippingV2ItemQuantity,
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
import { ShippingV2IntervencionesTab } from "./ShippingV2IntervencionesTab";
import { isFichaGenerada } from "@/lib/shipping-v2/technical-sheet";
import { normalizarSerie, rutaUnidad, seguimientoDe, serieCorta } from "@/lib/shipping-v2/unidades-serie";
import { avanceDeInspeccion } from "@/lib/shipping-v2/revision-tecnica-snapshot";
import { ORIGEN_TIENDA, vieneDeAfuera } from "@/lib/shipping-v2/item-origen";
import {
  CATEGORIAS_ARTICULO,
  ESTADOS_OTROS,
  ESTADOS_PRINCIPALES,
  FILTRO_ARTICULOS_VACIO,
  OPERACIONES_OTRAS,
  OPERACIONES_PRINCIPALES,
  hayFiltroArticulos,
  hrefArticulos,
  interpretarBusqueda,
  type FiltroArticulos,
} from "@/lib/shipping-v2/items-filtro";
import { ShippingV2ItemsPredictiveSearch } from "./ShippingV2ItemsPredictiveSearch";
import {
  type ShippingV2Attachment,
  type ShippingV2Item,
  type ShippingV2ItemDocumento,
  type ShippingV2ItemTrazabilidad,
  type ShippingV2AccessPermissions,
  type ShippingV2Novedad,
  type ShippingV2Packing,
  type ShippingV2Pago,
  type ShippingV2Proveedor,
  type ShippingV2UnidadHermana,
} from "@/types/shipping-v2";

type Props = {
  items: ShippingV2Item[];
  proveedores: ShippingV2Proveedor[];
  error: string;
  permissions?: ShippingV2AccessPermissions | null;
  providerName?: string;
  /** Personalización por usuario (Fase 2 de permisos, ver lib/permissions/campos.ts). */
  camposOcultos?: readonly string[];
  initialSortBy: SortKey;
  /** Rediseño 15-oct-2026: filtro aplicado en el servidor (viene de la dirección). */
  filtro?: FiltroArticulos;
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
type ToolbarMenuKey = "filters" | "sort" | "group" | "fields";

export type ResolvedItem = ShippingV2ResolvedItem;

type DetailRow = {
  label: string;
  value: string | number | boolean | null | undefined;
  displayValue?: ReactNode;
  config?: ShippingV2ItemEditFieldConfig;
  readOnly?: boolean;
  options?: readonly string[] | readonly { value: string; label: string }[];
};

type ItemDetailTabKey = "general" | "costos" | "logistica" | "pago" | "packing" | "observaciones" | "despiece" | "intervenciones";

const ALL = SHIPPING_V2_ALL_FILTER;
const groupOptions = shippingV2ItemGroupOptions;
const normalizeText = normalizeShippingV2ListText;
const getSortOptions = getShippingV2SortOptions;
const sanitizeProviderSort = sanitizeShippingV2ProviderSort;
const sortItems = sortShippingV2Items;
const groupItems = groupShippingV2Items;

// "-v2" (15-oct-2026, rediseño compacto): así todos arrancan con las columnas
// nuevas y no con los anchos viejos guardados en su navegador.
const COLUMN_WIDTHS_STORAGE_KEY = "shipping-v2-items-column-widths-v2";
const TABLE_VIEW_STORAGE_KEY = "shipping-v2-items-table-view-v2";

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
  | "paymentStatus"
  | "requiresPacking"
  | "physicalReview"
  | "notes";

type ShippingV2ItemsColumn = {
  key: ShippingV2ItemsColumnKey;
  label: string;
  /** Nombre completo (panel Campos y ayuda del encabezado) cuando label es corto. */
  fullLabel?: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth?: number;
  align?: "left" | "right" | "center";
  defaultVisible: boolean;
  required?: boolean;
  category: "Principal" | "Compra" | "Logística" | "Inventario" | "Revisión" | "Sistema";
};

// Rediseño compacto (15-oct-2026): por defecto solo lo que se mira a diario y
// con anchos justos. El resto sigue disponible en "Campos". "Nombre" ocupa el
// espacio que sobre (ver la tabla), así la lista cabe sin barra horizontal.
const AVAILABLE_COLUMNS: ShippingV2ItemsColumn[] = [
  { key: "sku", label: "SKU", defaultWidth: 96, minWidth: 80, defaultVisible: true, required: true, category: "Principal" },
  { key: "supplierSku", label: "SKU prov.", fullLabel: "SKU proveedor", defaultWidth: 120, minWidth: 90, defaultVisible: false, category: "Principal" },
  { key: "name", label: "Nombre", defaultWidth: 220, minWidth: 160, defaultVisible: true, required: true, category: "Principal" },
  { key: "quantity", label: "Cant.", fullLabel: "Cantidad", defaultWidth: 56, minWidth: 48, maxWidth: 96, align: "center", defaultVisible: true, required: true, category: "Principal" },
  { key: "itemStatus", label: "Estado", fullLabel: "Estado item", defaultWidth: 132, minWidth: 100, defaultVisible: true, category: "Principal" },
  { key: "operationType", label: "Operación", fullLabel: "Tipo de operación", defaultWidth: 100, minWidth: 84, defaultVisible: true, category: "Compra" },
  { key: "generalRole", label: "Rol general", defaultWidth: 110, minWidth: 90, defaultVisible: false, category: "Principal" },
  { key: "category", label: "Categoría", defaultWidth: 104, minWidth: 84, defaultVisible: false, category: "Principal" },
  { key: "purchaseProvider", label: "Proveedor", fullLabel: "Proveedor compra", defaultWidth: 124, minWidth: 96, defaultVisible: true, category: "Compra" },
  { key: "logisticProvider", label: "Casillero", fullLabel: "Casillero (proveedor logístico)", defaultWidth: 120, minWidth: 96, defaultVisible: false, category: "Logística" },
  { key: "packing", label: "Packing", defaultWidth: 100, minWidth: 84, defaultVisible: false, category: "Logística" },
  { key: "providerCost", label: "Costo", fullLabel: "Costo proveedor (unitario)", defaultWidth: 84, minWidth: 72, align: "right", defaultVisible: true, category: "Compra" },
  { key: "salePrice", label: "Precio", fullLabel: "Precio venta (unitario)", defaultWidth: 84, minWidth: 72, align: "right", defaultVisible: true, category: "Inventario" },
  { key: "createdAt", label: "Registro", fullLabel: "Fecha registro", defaultWidth: 88, minWidth: 80, defaultVisible: false, category: "Sistema" },
  { key: "brand", label: "Marca", defaultWidth: 104, minWidth: 84, defaultVisible: false, category: "Principal" },
  { key: "model", label: "Modelo", defaultWidth: 130, minWidth: 100, defaultVisible: false, category: "Principal" },
  { key: "serial", label: "Serie", defaultWidth: 130, minWidth: 100, defaultVisible: false, category: "Principal" },
  { key: "condition", label: "Condición", defaultWidth: 104, minWidth: 84, defaultVisible: false, category: "Inventario" },
  { key: "location", label: "Ubicación", defaultWidth: 120, minWidth: 90, defaultVisible: false, category: "Inventario" },
  { key: "triangulationStatus", label: "Triangulación", defaultWidth: 120, minWidth: 96, defaultVisible: false, category: "Logística" },
  { key: "reviewStatus", label: "Revisión", fullLabel: "Estado revisión", defaultWidth: 120, minWidth: 96, defaultVisible: false, category: "Revisión" },
  { key: "availability", label: "Disponibilidad", defaultWidth: 128, minWidth: 104, defaultVisible: false, category: "Inventario" },
  { key: "facebookSuperGeek", label: "FB", fullLabel: "Facebook Super Geek", defaultWidth: 44, minWidth: 40, maxWidth: 72, align: "center", defaultVisible: true, category: "Inventario" },
  { key: "requiresPayment", label: "Req. pago", fullLabel: "Requiere pago", defaultWidth: 90, minWidth: 80, defaultVisible: false, category: "Compra" },
  { key: "paymentStatus", label: "Pago", defaultWidth: 110, minWidth: 90, defaultVisible: false, category: "Compra" },
  { key: "requiresPacking", label: "Req. packing", fullLabel: "Requiere packing", defaultWidth: 96, minWidth: 84, defaultVisible: false, category: "Logística" },
  { key: "physicalReview", label: "Inspección", fullLabel: "Inspección firmada", defaultWidth: 96, minWidth: 84, defaultVisible: false, category: "Revisión" },
  { key: "notes", label: "Observaciones", defaultWidth: 200, minWidth: 140, defaultVisible: false, category: "Principal" },
];

/** La columna que se estira para llenar el ancho disponible. */
const FLEX_COLUMN_KEY: ShippingV2ItemsColumnKey = "name";

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
  /** Sin la columna Categoría, la categoría va en gris junto al nombre. */
  categoryInName?: boolean;
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

function getAvailableColumns(canViewCosts: boolean, canViewProviderCost: boolean, camposOcultos: readonly string[] = []) {
  return AVAILABLE_COLUMNS.filter((column) => {
    if (column.key === "providerCost") return canViewProviderCost && !camposOcultos.includes("costoProveedor");
    if (restrictedInternalColumns.has(column.key)) return canViewCosts && !camposOcultos.includes("precioVenta");
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

function formatShortDate(value?: string) {
  if (!value) return "—";
  const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(soloFecha ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: soloFecha ? "UTC" : "America/Guayaquil" }).format(date);
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
  if (item.usoLocal) return "Activo de la tienda";
  // Manda Categoría, no la vieja casilla "Es repuesto" (ver item-edit-config).
  if (item.categoria === "Repuesto") return "Repuesto";
  if (sePuedeVender(item)) return "Se puede vender";
  if (item.disponibleVenta) return "Solo reservar";
  return "No disponible";
}

// Auditoría Shipping V2, punto 1: reservar ≠ vender. Ver item-venta.ts.
function evaluarVenta(item: ResolvedItem) {
  return evaluarVentaItem({
    estado: item.estado,
    estadoRevision: item.estadoRevision,
    usoLocal: item.usoLocal,
    recibido: item.recibido,
    requiereInspeccion: item.requiereInspeccion,
    inspeccionFirmada: item.revisadoFisicamente,
  });
}

function sePuedeVender(item: ResolvedItem) {
  return evaluarVenta(item).vendible;
}

function motivoNoVenta(item: ResolvedItem) {
  const r = evaluarVenta(item);
  return r.vendible ? "" : r.detalle;
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
    case "paymentStatus":
      return item.situacionPago ? ETIQUETA_SITUACION_PAGO[item.situacionPago] : "—";
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

/** En la tabla: un "$" amarillo junto al estado cuando al pago le falta algo (detalle en la ayuda). */
function PagoAviso({ situacion }: { situacion: NonNullable<ShippingV2Item["situacionPago"]> }) {
  return (
    <span
      title={`Pago: ${ETIQUETA_SITUACION_PAGO[situacion]}`}
      aria-label={`Pago: ${ETIQUETA_SITUACION_PAGO[situacion]}`}
      className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[9.5px] font-black ${situacion === "falta-respaldo" ? "border-yellow-300/60 bg-yellow-300/15 text-yellow-200" : "border-dashed border-yellow-300/50 text-yellow-200/80"}`}
    >
      $
    </span>
  );
}

function renderItemCell(item: ResolvedItem, columnKey: ShippingV2ItemsColumnKey, context: ItemCellRenderContext) {
  switch (columnKey) {
    case "sku":
      return displayValue(item.sku);
    case "supplierSku":
      return supplierSkuLabel(item);
    case "name":
      return (
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate font-medium">{displayName(item.nombre)}</span>
          {context.categoryInName && item.categoria ? <span className="shrink-0 text-[11px] text-[#8F908A]">{item.categoria}</span> : null}
        </span>
      );
    case "quantity":
      return <span className="font-bold tabular-nums text-[#D7FF4F]">{formatShippingV2ItemQuantity(item)}</span>;
    case "operationType":
      return <OperationBadge value={item.tipoOperacion} size="sm" />;
    case "itemStatus":
      // Punto 9: el pago se ve aparte del estado; solo se avisa cuando falta algo.
      return (
        <span className="flex min-w-0 items-center gap-1">
          <EstadoBadge estado={item.estado} size="sm" />
          {item.situacionPago === "falta-respaldo" || item.situacionPago === "pago-en-curso" ? <PagoAviso situacion={item.situacionPago} /> : null}
        </span>
      );
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
      return formatShortDate(item.fechaRegistro || item.createdTime);
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
      return <AvailabilityBadge item={item} size="sm" />;
    case "facebookSuperGeek":
      return (
        <FacebookSuperGeekToggle
          size="sm"
          item={item}
          canEdit={context.canEditFacebookSuperGeek}
          busy={context.facebookSuperGeekBusyId === item.id}
          onChange={context.onFacebookSuperGeekChange}
        />
      );
    case "requiresPayment":
      return displayBoolean(item.requierePago);
    case "paymentStatus":
      return item.situacionPago ? ETIQUETA_SITUACION_PAGO[item.situacionPago] : "—";
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

  // Lo común (compra a proveedor) va en gris; se destaca lo que es distinto.
  if (normalized.includes("regalo")) return "border-[#8B73FF]/35 bg-[#8B73FF]/12 text-[#C9BFFF]";
  if (normalized.includes("encargo")) return "border-[#4FC3FF]/35 bg-[#4FC3FF]/10 text-[#BDEAFF]";
  if (normalized.includes("reajuste") || normalized.includes("correccion") || normalized.includes("migracion")) return "border-[#F4C95B]/35 bg-[#F4C95B]/10 text-[#F4C95B]";
  if (normalized.includes("despiece") || normalized.includes("parte")) return "border-[#8B73FF]/35 bg-[#8B73FF]/12 text-[#C9BFFF]";

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

type BadgeSize = "sm" | "md";

/** "sm": dentro de la tabla (se corta con … si no cabe, el texto completo queda en la ayuda). */
function badgeSizeClass(size: BadgeSize = "md") {
  return size === "sm"
    ? "inline-block max-w-full truncate align-middle px-2 py-px text-[11px] leading-4"
    : "inline-flex px-2.5 py-0.5 text-[12px]";
}

function EstadoBadge({ estado, size }: { estado: string; size?: BadgeSize }) {
  return (
    <span title={size === "sm" ? displayValue(estado) : undefined} className={`rounded-full border font-semibold ${badgeSizeClass(size)} ${estadoTone(estado)}`}>
      {displayValue(estado)}
    </span>
  );
}

/** En la tabla basta una palabra; el nombre completo queda en la ayuda. */
const OPERACION_CORTA: Record<string, string> = {
  "compra a proveedor": "Compra",
  "compra ya pagada": "Compra pagada",
  "regalo de proveedor": "Regalo",
  "encargo enviado a proveedor": "Encargo",
  "reajuste de inventario": "Reajuste",
  "uso local": "Uso local",
  "parte / componente": "Parte",
  "despiece de equipo": "Despiece",
  "migracion historica": "Migración",
  "correccion administrativa": "Corrección",
  repuesto: "Repuesto",
};

function OperationBadge({ value, size }: { value: string; size?: BadgeSize }) {
  const label = size === "sm" ? OPERACION_CORTA[normalizeText(value)] ?? displayValue(value) : displayValue(value);
  return (
    <span title={size === "sm" ? displayValue(value) : undefined} className={`rounded-full border font-semibold ${badgeSizeClass(size)} ${operationTone(value)}`}>
      {label}
    </span>
  );
}

function AvailabilityBadge({ item, size }: { item: ResolvedItem; size?: BadgeSize }) {
  let label = "No disponible";
  let tone = "border-[#3A3A36] bg-[#1E1E1E] text-[#A7A7A7]";

  if (item.conNovedad) {
    label = "Con novedad";
    tone = "border-[#FF914D]/35 bg-[#FF914D]/12 text-[#FFB07A]";
  } else if (item.reservado) {
    label = "Reservado";
    tone = "border-[#F4E85B]/35 bg-[#F4E85B]/12 text-[#F4E85B]";
  } else if (item.usoLocal) {
    label = "Activo de la tienda";
    tone = "border-[#8B73FF]/35 bg-[#8B73FF]/12 text-[#C9BFFF]";
  } else if (item.categoria === "Repuesto") {
    label = "Repuesto";
    tone = "border-[#8B73FF]/35 bg-[#8B73FF]/12 text-[#C9BFFF]";
  } else if (sePuedeVender(item)) {
    label = "Se puede vender";
    tone = "border-[#D7FF4F]/35 bg-[#D7FF4F]/12 text-[#D7FF4F]";
  } else if (item.disponibleVenta) {
    label = "Solo reservar";
    tone = "border-[#F4C95B]/35 bg-[#F4C95B]/10 text-[#F4C95B]";
  }

  return <span title={size === "sm" ? label : undefined} className={`rounded-full border font-semibold ${badgeSizeClass(size)} ${tone}`}>{label}</span>;
}

function FacebookSuperGeekToggle({
  item,
  canEdit,
  busy,
  onChange,
  size = "md",
}: {
  item: ResolvedItem;
  canEdit: boolean;
  busy: boolean;
  onChange: (item: ResolvedItem, value: boolean) => void;
  size?: "sm" | "md";
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
      className={`inline-flex ${size === "sm" ? "h-6 w-6 rounded-md" : "h-8 w-8 rounded-lg"} shrink-0 items-center justify-center border transition focus:outline-none focus:ring-2 focus:ring-[#D7FF4F]/35 disabled:cursor-not-allowed ${checked ? "" : "disabled:opacity-55"} ${
        checked
          ? "border-[#D7FF4F]/55 bg-[#D7FF4F]/12 text-[#D7FF4F] shadow-lg shadow-[#D7FF4F]/10"
          : "border-[#3A3A36] bg-[#151613] text-[#A7A7A7] hover:border-[#D7FF4F]/45 hover:text-[#D7FF4F]"
      }`}
    >
      {busy ? <Loader2 className={`${size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} animate-spin`} aria-hidden="true" /> : <BadgeCheck className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden="true" />}
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
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[12.5px] font-bold transition focus:outline-none focus:ring-2 focus:ring-[#D7FF4F]/35 disabled:cursor-not-allowed disabled:opacity-55 ${
        checked
          ? "border-[#D7FF4F]/60 bg-[#D7FF4F]/12 text-[#D7FF4F] shadow-lg shadow-[#D7FF4F]/10"
          : "border-[#3A3A36] bg-[#20211D] text-[#A7A7A7] hover:border-[#D7FF4F]/55 hover:text-[#D7FF4F]"
      }`}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />}
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

/** Selector compacto de filtro (vacío = todos). Resaltado en lima cuando filtra. */
function FiltroSelect({
  etiqueta,
  valor,
  principales,
  otras = [],
  etiquetas,
  onChange,
  className = "",
}: {
  etiqueta: string;
  valor: string;
  principales: readonly string[];
  otras?: readonly string[];
  /** Texto a mostrar por valor (p. ej. nombre del proveedor por su record ID). */
  etiquetas?: Record<string, string>;
  onChange: (valor: string) => void;
  className?: string;
}) {
  const activo = Boolean(valor);
  return (
    <select
      value={valor}
      onChange={(event) => onChange(event.target.value)}
      aria-label={etiqueta}
      title={activo ? `${etiqueta}: ${etiquetas?.[valor] ?? valor}` : etiqueta}
      className={`h-8 min-w-0 shrink-0 cursor-pointer rounded-md border bg-[#10110F] px-2 text-[12.5px] font-semibold outline-none transition focus:ring-2 focus:ring-[#D7FF4F]/35 ${
        activo ? "border-[#D7FF4F]/60 text-[#D7FF4F]" : "border-[#3A3A36] text-[#B4B5AC] hover:border-[#D7FF4F]/45"
      } ${className}`}
    >
      <option value="">{etiqueta}: {/(a|ón)$/.test(etiqueta) ? "todas" : "todos"}</option>
      {principales.map((opcion) => <option key={opcion} value={opcion}>{etiquetas?.[opcion] ?? opcion}</option>)}
      {otras.length ? (
        <optgroup label="Otros">
          {otras.map((opcion) => <option key={opcion} value={opcion}>{etiquetas?.[opcion] ?? opcion}</option>)}
        </optgroup>
      ) : null}
    </select>
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
          className={`relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition focus:outline-none focus:ring-2 focus:ring-[#D7FF4F]/35 ${
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
      className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[13px] transition ${
        active
          ? "border-[#D7FF4F]/45 bg-[#D7FF4F]/10 text-[#F5F5F5]"
          : "border-transparent bg-transparent text-[#A7A7A7] hover:border-[#3A3A36] hover:bg-[#171814] hover:text-[#F5F5F5]"
      }`}
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
          active ? "border-[#D7FF4F] bg-[#D7FF4F] text-[#151515]" : "border-[#3A3A36] text-transparent"
        }`}
      >
        <Check className="h-3 w-3" aria-hidden="true" />
      </span>
      <span className="min-w-0 truncate font-semibold">{option.label}</span>
    </button>
  );
}

type ItemsPagination = Props["pagination"];

/**
 * Paginado (15-oct-2026). Airtable entrega de a 100 sin decir el total, así
 * que se muestra el tramo que se está viendo (101–200) y las flechas.
 */
function ItemsPager({ pagination, count }: { pagination: ItemsPagination; count: number }) {
  const start = (pagination.pageIndex - 1) * pagination.pageSize + 1;
  const range = count ? `${start}–${start + count - 1}` : "0";
  const boton = "inline-flex h-8 w-8 items-center justify-center rounded-md border transition focus:outline-none focus:ring-2 focus:ring-[#D7FF4F]/35";
  const activo = `${boton} border-[#3A3A36] bg-[#10110F] text-[#B4B5AC] hover:border-[#D7FF4F]/45 hover:text-[#D7FF4F]`;
  const apagado = `${boton} cursor-not-allowed border-[#24251F] text-[#3F403A]`;
  const flecha = (href: string | undefined, habilitado: boolean, etiqueta: string, icono: ReactNode) => habilitado && href
    ? <Link href={href} aria-label={etiqueta} title={etiqueta} className={activo}>{icono}</Link>
    : <span aria-label={etiqueta} aria-disabled="true" className={apagado}>{icono}</span>;
  return (
    <nav aria-label="Páginas" className="flex shrink-0 items-center gap-1">
      {pagination.pageIndex > 2 ? flecha(pagination.firstHref, true, "Primera página", <ChevronsLeft className="h-4 w-4" aria-hidden="true" />) : null}
      <span className="min-w-[4.25rem] px-1 text-center text-[12.5px] font-semibold tabular-nums text-[#B4B5AC]" title={`Página ${pagination.pageIndex} · ${pagination.pageSize} por página`}>
        {range}
      </span>
      {flecha(pagination.previousHref, pagination.hasPreviousPage, "Página anterior", <ChevronLeft className="h-4 w-4" aria-hidden="true" />)}
      {flecha(pagination.nextHref, pagination.hasNextPage, "Página siguiente", <ChevronRight className="h-4 w-4" aria-hidden="true" />)}
    </nav>
  );
}

function FiltroChip({ children, onQuitar }: { children: ReactNode; onQuitar: () => void }) {
  return (
    <button
      type="button"
      onClick={onQuitar}
      title="Quitar este filtro"
      className="inline-flex max-w-[16rem] items-center gap-1 rounded-full border border-[#D7FF4F]/40 bg-[#D7FF4F]/[0.08] px-2 py-px text-[11.5px] font-semibold text-[#D7FF4F] transition hover:bg-[#D7FF4F]/15"
    >
      <span className="truncate">{children}</span>
      <X className="h-3 w-3 shrink-0" aria-hidden="true" />
    </button>
  );
}

function PageStat({ label, value, tone }: { label: string; value: number; tone: "lime" | "yellow" | "purple" | "orange" }) {
  const dot = { lime: "bg-[#D7FF4F]", yellow: "bg-[#F4E85B]", purple: "bg-[#8B73FF]", orange: "bg-[#FF914D]" }[tone];
  const text = { lime: "text-[#D7FF4F]", yellow: "text-[#F4E85B]", purple: "text-[#C9BFFF]", orange: "text-[#FFB07A]" }[tone];
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className={`h-1.5 w-1.5 rounded-full ${value ? dot : "bg-[#3A3A36]"}`} />
      {label} <b className={`tabular-nums ${value ? text : "text-[#5E5F59]"}`}>{value}</b>
    </span>
  );
}

/** Tarjeta de la lista en pantallas angostas (celular): dos líneas. */
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
  const detalle = [item.categoria, item.proveedorCompraDisplay].map((value) => String(value ?? "").trim()).filter(Boolean).join(" · ");
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
      className="min-w-0 cursor-pointer rounded-lg border border-[#2E2F28] bg-[#171814] px-2.5 py-2 transition hover:border-[#D7FF4F]/40 focus:border-[#D7FF4F]/50 focus:outline-none"
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[12px] font-bold text-[#D7FF4F]">{displayValue(item.sku)}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#F5F5F5]">{displayName(item.nombre)}</span>
        <span className="shrink-0 text-[12px] font-bold tabular-nums text-[#D7FF4F]" title="Cantidad">{formatShippingV2ItemQuantity(item)}</span>
      </div>
      <div className="mt-1 flex min-w-0 items-center gap-1.5">
        <span className="flex shrink-0 items-center gap-1">
          <EstadoBadge estado={item.estado} size="sm" />
          <OperationBadge value={item.tipoOperacion} size="sm" />
        </span>
        {detalle ? <span className="min-w-0 truncate text-[11.5px] text-[#8F908A]">{detalle}</span> : null}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {canViewCosts ? (
            <span className="text-[12px] font-semibold tabular-nums text-[#F5F5F5]" title={canViewProviderCost ? `Costo proveedor ${formatCurrency(item.costoProveedor)}` : undefined}>{formatCurrency(item.precioVenta)}</span>
          ) : canViewProviderCost ? (
            <span className="text-[12px] font-semibold tabular-nums text-[#F5F5F5]" title="Costo proveedor">{formatCurrency(item.costoProveedor)}</span>
          ) : null}
          <FacebookSuperGeekToggle
            size="sm"
            item={item}
            canEdit={canEditFacebookSuperGeek}
            busy={facebookSuperGeekBusy}
            onChange={onFacebookSuperGeekChange}
          />
        </span>
      </div>
    </article>
  );
}

function DetailSection({
  rows,
  onSave,
  esAdmin = false,
  canEdit = true,
  camposOcultos = [],
  camposSoloLectura = [],
}: {
  rows: DetailRow[];
  onSave: (field: string, value: string | number | boolean | null) => Promise<void>;
  esAdmin?: boolean;
  canEdit?: boolean;
  /** Personalización por usuario (Fase 2 de permisos, ver lib/permissions/campos.ts). */
  camposOcultos?: readonly string[];
  camposSoloLectura?: readonly string[];
}) {
  // "Oculto" nunca aplica a un campo adminOnly (Cantidad, Disponible para
  // venta): ese ya tiene su propio candado, más estricto, que no depende de
  // esta configuración por usuario.
  const rowsVisibles = rows.filter(
    (row) => row.config?.adminOnly === true || !row.config || !camposOcultos.includes(row.config.key)
  );

  // Rediseño 15-oct-2026: una fila por dato (etiqueta | valor), sin tarjetas.
  // Se edita pulsando el valor; los datos que no se editan van en gris.
  return (
    <dl className="grid gap-x-6 lg:grid-cols-2 2xl:grid-cols-3">
      {rowsVisibles.map((row) => {
        // Los campos marcados adminOnly se ven siempre, pero solo administración
        // los puede editar (el servidor lo vuelve a validar).
        const bloqueadoPorRol = row.config?.adminOnly === true && !esAdmin;
        const bloqueadoPersonalizado =
          row.config?.adminOnly !== true && Boolean(row.config) && camposSoloLectura.includes(row.config!.key);
        const soloLectura =
          !canEdit || (row.readOnly ?? !row.config) || row.config?.category === "readOnly" || bloqueadoPorRol || bloqueadoPersonalizado;

        return (
          <InlineEditableField
            key={row.label}
            layout="row"
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
  );
}

/**
 * Novedades del artículo en su ficha (punto 8). Desde aquí se registran y se
 * gestionan igual que en la pestaña Novedades: mismas reglas, mismas ventanas.
 */
function NovedadesVinculadasCard({
  novedades,
  providerLabelsById,
  item,
  rol,
  puedeRegistrar,
}: {
  novedades: ShippingV2Novedad[];
  providerLabelsById: Map<string, string>;
  item: { id: string; sku?: string; nombre?: string; cantidad?: number | null; estado?: string | null; packingId?: string; proveedorId?: string };
  rol: ShippingV2NovedadRol;
  puedeRegistrar: boolean;
}) {
  const router = useRouter();
  const [registrando, setRegistrando] = useState(false);
  const [seleccion, setSeleccion] = useState<{ novedad: ShippingV2Novedad; accion: ShippingV2NovedadAccionConfig } | null>(null);
  const [busy, setBusy] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [aviso, setAviso] = useState("");
  const openCount = novedades.filter((novedad) => isOpenNovedadStatus(novedad.estado)).length;
  const salio = articuloSalioDelInventario({ estado: item.estado, cantidad: item.cantidad });
  // La ventana de acciones necesita saber de qué artículo es.
  const conArticulo = (novedad: ShippingV2Novedad): ShippingV2Novedad => ({
    ...novedad,
    itemSku: novedad.itemSku || item.sku,
    itemNombre: novedad.itemNombre || item.nombre,
    itemCantidad: novedad.itemCantidad ?? item.cantidad ?? null,
  });

  async function ejecutar(valores: ValoresAccionNovedad) {
    if (!seleccion) return;
    setBusy(true);
    setMensaje("");
    try {
      const resultado = await ejecutarAccionNovedad(seleccion.novedad.id, seleccion.accion.accion, valores);
      setAviso(`${seleccion.accion.label}: listo.${resultado.mensaje ? ` ${resultado.mensaje}` : ""}`);
      setSeleccion(null);
      router.refresh();
    } catch (error) {
      setMensaje(error instanceof Error ? error.message : "Error inesperado.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-[#30312D] bg-[#171814] p-3 shadow-lg shadow-black/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#D7FF4F]" />
          <h3 className="text-sm font-semibold text-[#F5F5F5]">Novedades</h3>
          <span className="rounded-full border border-[#3A3A36] bg-[#11120F] px-2 py-0.5 text-[11px] font-semibold text-[#A7A7A7]">{novedades.length}</span>
          {openCount ? <span className="rounded-full border border-[#FF914D]/35 bg-[#FF914D]/12 px-2 py-0.5 text-[11px] font-semibold text-[#FFB07A]">{openCount} abierta{openCount === 1 ? "" : "s"}</span> : null}
        </div>
        <div className="flex items-center gap-1.5">
          {novedades.length ? (
            <Link href="/shipping-v2/novedades" className="h-7 rounded-lg border border-[#3A3A36] bg-[#20211D] px-2.5 text-[12px] font-semibold leading-7 text-[#C9C9C4] transition hover:border-[#D7FF4F]/55 hover:text-[#F5F5F5]">Ver todas</Link>
          ) : null}
          {puedeRegistrar ? (
            <button
              type="button"
              disabled={salio}
              title={salio ? "Ya salió del inventario. Si un cliente reclama una falla, abre una orden de reparación." : "Registrar una novedad de este artículo"}
              onClick={() => { setAviso(""); setRegistrando(true); }}
              className="h-7 rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-2.5 text-[12px] font-bold text-[#151515] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Registrar novedad
            </button>
          ) : null}
        </div>
      </div>

      {aviso ? (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-[#7BE495]/30 bg-[#7BE495]/10 px-3 py-1.5 text-[12px] text-[#9FEFB3]">
          <span>{aviso}</span>
          <button type="button" onClick={() => setAviso("")} className="shrink-0 text-[11px] font-bold uppercase opacity-70 hover:opacity-100">Cerrar</button>
        </div>
      ) : null}

      {!novedades.length ? (
        <p className="mt-2 text-[12px] text-[#8F908A]">Sin novedades registradas.</p>
      ) : (
        <div className="mt-2 grid gap-1.5">
          {novedades.map((novedad) => {
            const isOpen = isOpenNovedadStatus(novedad.estado);
            const providerLabel = novedad.proveedorResponsableId ? providerLabelsById.get(novedad.proveedorResponsableId) : "";
            const acciones = getAccionesDisponibles(novedad, rol);
            return (
              <article key={novedad.id} className={`rounded-lg border px-3 py-2 ${isOpen ? "border-[#FF914D]/35 bg-[#FF914D]/8" : "border-[#30312D] bg-[#11120F]"}`}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${novedadTypeTone(novedad.tipo || novedad.titulo)}`}>{displayValue(novedad.tipo || novedad.titulo)}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${novedadTone(novedad.estado)}`}>{isOpen ? etiquetaTurno(novedad) : displayValue(novedad.estado)}</span>
                  {novedad.bloqueaVenta ? <span className="rounded-full border border-[#FF6B6B]/45 bg-[#FF6B6B]/12 px-2 py-0.5 text-[11px] font-semibold text-[#FF9C9C]" title="Solo un Administrador la desbloquea.">Venta bloqueada</span> : null}
                  {novedad.decision ? <span className="rounded-full border border-[#3A3A36] bg-[#151515] px-2 py-0.5 text-[11px] font-semibold text-[#C9C9C4]">{novedad.decision}</span> : null}
                  <span className="ml-auto text-[11px] text-[#6F706B]">
                    {formatDate(novedad.fechaRegistro || novedad.createdTime)}{novedad.registradoPor ? ` · ${novedad.registradoPor}` : ""}{providerLabel ? ` · ${providerLabel}` : ""}
                  </span>
                </div>
                <p className="mt-1 line-clamp-3 text-[13px] leading-5 text-[#F5F5F5]">{displayValue(novedad.descripcion, "Sin descripción registrada.")}</p>
                {novedad.respuestaProveedor || novedad.solucion || novedad.descripcionSolucion || novedad.comoAparecio ? (
                  <div className="mt-1 grid gap-0.5 text-[12px] text-[#A7A7A7]">
                    {novedad.solucion ? <span>Propuesta del proveedor: <span className="text-[#F5F5F5]">{etiquetaPropuesta(novedad.solucion)}</span></span> : null}
                    {novedad.descripcionSolucion ? <span>Lo que se hizo: <span className="text-[#F5F5F5]">{novedad.descripcionSolucion}</span></span> : null}
                    {novedad.comoAparecio ? <span>Apareció: <span className="text-[#F5F5F5]">{novedad.comoAparecio}</span></span> : null}
                  </div>
                ) : null}
                {novedad.evidencias.length ? <div className="mt-1">{attachmentList(novedad.evidencias)}</div> : null}
                {acciones.length ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {acciones.map((accion) => (
                      <button
                        key={accion.accion}
                        type="button"
                        title={accion.descripcion}
                        disabled={busy}
                        onClick={() => { setMensaje(""); setSeleccion({ novedad: conArticulo(novedad), accion }); }}
                        className={`h-7 rounded-lg border px-2.5 text-[12px] font-bold transition disabled:opacity-40 ${
                          accion.tono === "principal"
                            ? "border-[#D7FF4F] bg-[#D7FF4F] text-[#151515] hover:brightness-105"
                            : accion.tono === "peligro"
                              ? "border-[#FF914D]/45 bg-[#FF914D]/10 text-[#FFB07A] hover:border-[#FF914D]"
                              : "border-[#3A3A36] bg-[#20211D] text-[#F5F5F5] hover:border-[#D7FF4F]/55"
                        }`}
                      >
                        {accion.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {registrando ? (
        <RegistrarNovedadModal
          itemId={item.id}
          sku={item.sku}
          nombre={item.nombre}
          packingId={item.packingId}
          proveedorCompraId={item.proveedorId}
          proveedorNombre={item.proveedorId ? providerLabelsById.get(item.proveedorId) : ""}
          onClose={() => setRegistrando(false)}
          onSaved={({ aviso: avisoRegistro }) => {
            setRegistrando(false);
            setAviso(avisoRegistro || "Novedad registrada.");
            router.refresh();
          }}
        />
      ) : null}

      {seleccion ? (
        <NovedadAccionModal
          novedad={seleccion.novedad}
          accion={seleccion.accion}
          rol={rol}
          canEditItems={rol === "staff" || rol === "admin"}
          busy={busy}
          mensaje={mensaje}
          onCancel={() => setSeleccion(null)}
          onSubmit={(valores) => void ejecutar(valores)}
        />
      ) : null}
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

function shippingV2SkuLabelHref(itemId: string) {
  return `/shipping-v2/recepcion/etiqueta/${encodeURIComponent(itemId)}`;
}

function shippingV2TechnicalSheetHref(item: Pick<ShippingV2Item, "id" | "sku" | "numeroSerie" | "technicalSheet">) {
  // Punto 10b-4: la ficha vive en el artículo (/shipping-v2/items/[sku]/u/[serie]/ficha).
  return isFichaGenerada(item)
    ? rutaUnidad(item, "ficha/print", { imprimir: true })
    : rutaUnidad(item, "ficha");
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

/** Qué enlaces a otros módulos puede abrir la sesión (para no llevarla a "Acceso denegado"). */
export type ShippingV2ItemDetailEnlaces = { facturacion: boolean; operaciones: boolean; tecnicos: boolean };

const DOCUMENTO_ETIQUETA: Record<ShippingV2ItemDocumento["tipo"], string> = {
  factura: "Factura",
  recibo: "Recibo",
  reserva: "Reserva",
  "nota-credito": "Nota de crédito",
};

function documentoHref(documento: ShippingV2ItemDocumento) {
  const id = encodeURIComponent(documento.id);
  if (documento.tipo === "factura") return `/facturacion/documentos/factura/${id}`;
  if (documento.tipo === "recibo") return `/facturacion/imprimir/recibo/${id}`;
  if (documento.tipo === "reserva") return `/facturacion/imprimir/reserva/${id}`;
  return "/facturacion/nota-credito/historial";
}

function documentoTono(documento: ShippingV2ItemDocumento): PasoTono {
  const estado = normalizeText(documento.estado);
  if (estado.includes("anulad") || estado.includes("liberad") || estado.includes("devuelt") || estado.includes("no autorizado")) return "nada";
  if (documento.tipo === "reserva") return "espera";
  if (documento.tipo === "nota-credito") return "alerta";
  return "ok";
}

type PasoTono = "ok" | "espera" | "alerta" | "nada";

function PasoChip({ tono, children, title }: { tono: PasoTono; children: ReactNode; title?: string }) {
  const toneClass = {
    ok: "border-[#7BE495]/35 bg-[#7BE495]/10 text-[#9FEFB3]",
    espera: "border-[#F4C95B]/35 bg-[#F4C95B]/10 text-[#F4C95B]",
    alerta: "border-[#FF914D]/35 bg-[#FF914D]/10 text-[#FFB07A]",
    nada: "border-[#3A3A36] bg-[#151515] text-[#8F908A]",
  }[tono];
  return <span title={title} className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2 py-px text-[10.5px] font-semibold ${toneClass}`}>{children}</span>;
}

/** Una línea del bloque "Recorrido": qué paso es, el documento (con enlace) y cómo está. */
function PasoRecorrido({
  icon: Icon,
  etiqueta,
  principal,
  href,
  nuevaPestana,
  onClick,
  apagado,
  detalle,
  chip,
}: {
  icon: LucideIcon;
  etiqueta: string;
  principal: ReactNode;
  href?: string;
  nuevaPestana?: boolean;
  onClick?: () => void;
  apagado?: boolean;
  detalle?: string;
  chip?: ReactNode;
}) {
  const textoClass = "shrink-0 whitespace-nowrap font-semibold";
  const texto = href ? (
    <Link href={href} target={nuevaPestana ? "_blank" : undefined} rel={nuevaPestana ? "noreferrer" : undefined} className={`${textoClass} text-[#D7FF4F] hover:underline`}>{principal}</Link>
  ) : onClick ? (
    <button type="button" onClick={onClick} className={`${textoClass} text-[#D7FF4F] hover:underline`}>{principal}</button>
  ) : (
    <span className={`${textoClass} ${apagado ? "font-normal text-[#8F908A]" : "text-[#E6E6E1]"}`}>{principal}</span>
  );
  return (
    <li className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-2 px-3 py-1.5">
      <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-[#8F908A]">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {etiqueta}
      </span>
      <span className="flex min-w-0 items-baseline gap-2 text-[13px]">
        {texto}
        {detalle ? <span className="min-w-0 truncate text-[12px] text-[#8F908A]" title={detalle}>{detalle}</span> : null}
      </span>
      {chip ?? <span />}
    </li>
  );
}

function shortDate(value?: string) {
  if (!value) return "";
  // Una fecha sin hora ("2026-10-14") se muestra tal cual: convertirla a la
  // hora de Ecuador la correría al día anterior.
  const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(soloFecha ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "numeric", timeZone: soloFecha ? "UTC" : "America/Guayaquil" }).format(date);
}

/** Dato del encabezado (precio, costo, ganancia, cantidad). */
function HeroStat({ label, children, tone = "neutral", title }: { label: string; children: ReactNode; tone?: "neutral" | "lime" | "orange"; title?: string }) {
  const valueClass = tone === "lime" ? "text-[#D7FF4F]" : tone === "orange" ? "text-[#FFB07A]" : "text-[#F5F5F5]";
  return (
    <div className="min-w-0 bg-[#171814] px-3 py-2" title={title}>
      <p className="truncate text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A]">{label}</p>
      <div className={`mt-0.5 truncate text-[17px] font-semibold leading-6 tabular-nums ${valueClass}`}>{children}</div>
    </div>
  );
}

const accionClass = "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[#3A3A36] bg-[#1C1D19] px-2.5 text-[12.5px] font-semibold text-[#E6E6E1] transition hover:border-[#D7FF4F]/55 hover:text-[#D7FF4F] focus:outline-none focus:ring-2 focus:ring-[#D7FF4F]/35";

const ESTADOS_FUERA = new Set(["vendido", "agotado", "dado de baja", "cancelado", "devuelto a proveedor"]);

/**
 * Punto 10b-4: qué unidad es esta (su serie, o "Lote · N u.") y las demás del
 * mismo producto, para pasar de una a otra. Una línea; solo si aporta.
 */
export function UnidadDelProducto({ item, hermanas }: { item: ShippingV2Item; hermanas: ShippingV2UnidadHermana[] }) {
  const esUnidad = seguimientoDe(item) === "Unidad";
  const serie = normalizarSerie(item.numeroSerie);
  const otras = hermanas.filter((h) => h.id !== item.id);
  const vivas = otras.filter((h) => !ESTADOS_FUERA.has(normalizeText(h.estado)));
  // Precio propio: distinto del que tiene la mayoría de las otras unidades vivas.
  const precios = new Map<number, number>();
  for (const h of vivas) if (typeof h.precioVenta === "number" && h.precioVenta > 0) precios.set(h.precioVenta, (precios.get(h.precioVenta) ?? 0) + 1);
  const precioComun = [...precios].sort((a, b) => b[1] - a[1])[0]?.[0];
  const precioPropio = typeof item.precioVenta === "number" && typeof precioComun === "number" && item.precioVenta !== precioComun;
  if (!esUnidad && !otras.length) return null;
  const MAX = 8;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11.5px]">
      {esUnidad ? (
        serie
          ? <span className="rounded border border-[#3A3A36] bg-[#20211D] px-1.5 py-0.5 font-mono font-semibold text-[#F5F5F5]" title="Serie de esta unidad">S/N {serie}</span>
          : <span className="rounded border border-[#F4C95B]/45 bg-[#F4C95B]/10 px-1.5 py-0.5 font-semibold text-[#F4C95B]" title="Se escanea al recibir; sin serie no se vende.">Sin serie aún</span>
      ) : (
        <span className="rounded border border-[#3A3A36] bg-[#20211D] px-1.5 py-0.5 font-semibold text-[#B4B5AC]" title="Lote: lo que llegó de una misma compra, con su costo.">Lote · {item.cantidad ?? 0} u.</span>
      )}
      {precioPropio ? (
        <span className="rounded border border-[#F4C95B]/45 px-1.5 py-0.5 font-semibold text-[#F4C95B]" title={`Las otras unidades: ${formatCurrency(precioComun ?? null)}`}>Precio propio</span>
      ) : null}
      {otras.length ? (
        <>
          <span className="ml-1 text-[#7E7F76]">{esUnidad ? "Otras unidades" : "Otros lotes"}</span>
          {otras.slice(0, MAX).map((h) => {
            const fuera = ESTADOS_FUERA.has(normalizeText(h.estado));
            const s = normalizarSerie(h.numeroSerie);
            const texto = esUnidad ? (s ? serieCorta(s) : h.recibido ? "sin serie" : "por llegar") : `${h.cantidad ?? 0} u.`;
            return (
              <Link key={h.id} href={`/shipping-v2/items/${encodeURIComponent(h.id)}`}
                title={[s ? `S/N ${s}` : "", h.estado, typeof h.precioVenta === "number" ? formatCurrency(h.precioVenta) : ""].filter(Boolean).join(" · ")}
                className={`rounded border px-1.5 py-0.5 font-mono transition hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F] ${fuera ? "border-[#2A2B26] text-[#5E5F59] line-through" : "border-[#3A3A36] text-[#C9CAC1]"}`}>
                {texto}
              </Link>
            );
          })}
          {otras.length > MAX ? <span className="text-[#7E7F76]">+{otras.length - MAX}</span> : null}
        </>
      ) : null}
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
  camposOcultos = [],
  camposSoloLectura = [],
  permissions,
  rolNovedades = "ninguno",
  trazabilidad = null,
  enlaces = { facturacion: false, operaciones: false, tecnicos: false },
  adminPanel,
  costosTraerlo,
  hermanas = [],
}: {
  item: ResolvedItem;
  proveedores: ShippingV2Proveedor[];
  pago?: ShippingV2Pago | null;
  packing?: ShippingV2Packing | null;
  novedades?: ShippingV2Novedad[];
  onSaved?: (item: ShippingV2Item) => void;
  /** Habilita los campos de corrección manual (config.adminOnly). */
  esAdmin?: boolean;
  /** Personalización por usuario (Fase 2 de permisos) — claves (config.key) a ocultar/volver solo lectura. */
  camposOcultos?: readonly string[];
  camposSoloLectura?: readonly string[];
  permissions?: ShippingV2AccessPermissions | null;
  /** Punto 8: qué puede hacer la sesión con las novedades (sin valor: solo ver). */
  rolNovedades?: ShippingV2NovedadRol;
  /** Rediseño 15-oct-2026: orden de compra, pedido, documentos de venta (solo personal). */
  trazabilidad?: ShippingV2ItemTrazabilidad | null;
  enlaces?: ShippingV2ItemDetailEnlaces;
  /** Acciones de Administrador (activos, baja, corregir estado, eliminar): van detrás de "Administrar". */
  adminPanel?: ReactNode;
  /** Costos de traer un artículo que viaja solo: van en la pestaña Logística. */
  costosTraerlo?: ReactNode;
  /** Punto 10b-4: los registros que comparten el SKU (incluido este), para pasar de una unidad a otra. */
  hermanas?: ShippingV2UnidadHermana[];
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
  const [adminOpen, setAdminOpen] = useState(false);
  const tabsRef = useRef<HTMLElement>(null);
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
      // La edición no cambia el pago: se conserva la situación ya calculada.
      situacionPago: item.situacionPago,
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
  // Personalización por usuario (Fase 2 de permisos, ver lib/permissions/campos.ts).
  // El encabezado (precio, costo, ganancia) es JSX a mano (no pasa por
  // DetailSection), así que cada dato se filtra a mano contra las mismas listas.
  const verCampo = (key: string) => !camposOcultos.includes(key);
  const campoSoloLectura = (key: string) => camposSoloLectura.includes(key);
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

  function abrirPestana(tab: ItemDetailTabKey) {
    setActiveTab(tab);
    tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  const tabs: Array<{ key: ItemDetailTabKey; label: string; rows: DetailRow[] }> = [
    {
      key: "general",
      label: "General",
      rows: [
        { label: C.sku.label, value: item.sku, config: C.sku },
        { label: C.skuProveedor.label, value: item.skuProveedor, config: C.skuProveedor },
        { label: C.numeroSerie.label, value: item.numeroSerie, config: C.numeroSerie },
        { label: C.marca.label, value: item.marca, config: C.marca },
        { label: C.modelo.label, value: item.modelo, config: C.modelo },
        { label: C.categoria.label, value: item.categoria, config: C.categoria },
        { label: C.condicion.label, value: item.condicion, config: C.condicion },
        { label: C.cantidad.label, value: item.cantidad ?? item.qty, config: C.cantidad },
        { label: C.unidad.label, value: item.unidad, config: C.unidad },
        { label: C.estadoItem.label, value: item.estado, displayValue: <EstadoBadge estado={item.estado} size="sm" />, config: C.estadoItem },
        { label: C.estadoRevision.label, value: item.estadoRevision, config: C.estadoRevision },
        { label: C.ubicacionActual.label, value: item.ubicacionActual, config: C.ubicacionActual, readOnly: true },
        { label: C.afectaInventario.label, value: item.afectaInventario, displayValue: displayBoolean(item.afectaInventario), config: C.afectaInventario },
        { label: C.requiereInspeccion.label, value: item.requiereInspeccion, config: C.requiereInspeccion },
        { label: C.disponibleVenta.label, value: item.disponibleVenta, displayValue: displayBoolean(item.disponibleVenta), config: C.disponibleVenta },
        { label: "Se puede vender", value: sePuedeVender(item), displayValue: sePuedeVender(item) ? "Sí" : `No: ${motivoNoVenta(item)}`, readOnly: true },
        // Punto 5: lo calcula el sistema; se muestra cuántas unidades están apartadas.
        { label: "Reservadas", value: item.cantidadReservada ?? 0, displayValue: `${item.cantidadReservada ?? (item.reservado ? 1 : 0)} de ${item.cantidad ?? 0}`, readOnly: true },
        { label: C.facebookSuperGeek.label, value: item.facebookSuperGeek, displayValue: displayBoolean(item.facebookSuperGeek), readOnly: true },
      ],
    },
    ...(canViewCosts ? [{
      key: "costos" as const,
      label: "Costos",
      rows: [
        { label: C.costoProveedor.label, value: item.costoProveedor, displayValue: formatCurrency(item.costoProveedor), config: C.costoProveedor },
        // Montos del REGISTRO (todas sus unidades), guardados por el portal al
        // repartir el packing. Solo existen cuando el packing ya se repartió
        // con la regla nueva (lib/shipping-v2/packing-reparto.ts).
        ...(item.unidadesEnPacking !== null ? [
          { label: "Unidades en packing", value: item.unidadesEnPacking, displayValue: String(item.unidadesEnPacking), readOnly: true },
          { label: "Flete asignado al registro", value: item.fleteAsignadoRegistro, displayValue: formatCurrency(item.fleteAsignadoRegistro), readOnly: true },
          { label: "Arancel asignado al registro", value: item.arancelAsignadoRegistro, displayValue: formatCurrency(item.arancelAsignadoRegistro), readOnly: true },
          { label: "Otros costos asignados al registro", value: item.otrosCostosAsignadosRegistro, displayValue: formatCurrency(item.otrosCostosAsignadosRegistro), readOnly: true },
        ] : []),
        { label: "Flete por unidad", value: item.costoFleteAsignado, displayValue: formatCurrency(item.costoFleteAsignado), readOnly: true },
        { label: "Arancel por unidad", value: item.costoArancelAsignado, displayValue: formatCurrency(item.costoArancelAsignado), readOnly: true },
        { label: "Otros costos por unidad", value: item.otrosCostosAsignados, displayValue: formatCurrency(item.otrosCostosAsignados), readOnly: true },
        { label: "Costo logístico por unidad", value: item.costoLogisticoAsignado, displayValue: formatCurrency(item.costoLogisticoAsignado), readOnly: true },
        { label: "Costo total unitario", value: item.costoTotalUnidad, displayValue: formatCurrency(item.costoTotalUnidad), readOnly: true },
        // Punto 3: lo que sumaron (o restaron) las mejoras; ya está dentro del costo total unitario.
        { label: "Costo de mejoras", value: item.costoMejoras ?? null, displayValue: formatCurrency(item.costoMejoras ?? null), readOnly: true },
        { label: "Costo total del stock", value: costoStock, displayValue: formatCurrency(costoStock), readOnly: true },
        { label: "Costo asignado despiece", value: item.costoAsignadoDespiece, displayValue: formatCurrency(item.costoAsignadoDespiece), readOnly: true },
        { label: "Costo total estimado", value: item.costoTotalEstimado, displayValue: formatCurrency(item.costoTotalEstimado), readOnly: true },
        { label: C.precioVentaSugerido.label, value: item.precioVentaSugerido, displayValue: formatCurrency(item.precioVentaSugerido), config: C.precioVentaSugerido },
        { label: C.precioVentaFinal.label, value: item.precioVenta, displayValue: formatCurrency(item.precioVenta), config: C.precioVentaFinal },
        { label: "Ganancia por unidad", value: gananciaUnidad, displayValue: formatCurrency(gananciaUnidad), readOnly: true },
        { label: "Ganancia total del stock", value: gananciaStock, displayValue: formatCurrency(gananciaStock), readOnly: true },
      ] satisfies DetailRow[],
    }] : []),
    {
      key: "logistica",
      label: "Logística",
      rows: [
        { label: C.proveedorCompra.label, value: item.proveedorId, displayValue: displayValue(item.proveedorCompraDisplay), config: C.proveedorCompra, options: purchaseProviderOptions },
        // Punto 2 (oct-2026): origen, casillero y rastreos se gestionan en la
        // pestaña Logística (un solo lugar para todo lo que viene en camino).
        { label: "¿Dónde está / de dónde viene?", value: item.origenArticulo, displayValue: item.origenArticulo || "Sin indicar", readOnly: true },
        { label: "Casillero", value: item.proveedorLogisticoId, displayValue: displayValue(item.proveedorLogisticoDisplay), readOnly: true },
        { label: "Rastreo al casillero", value: item.trackingHaciaIntermediario, readOnly: true },
        { label: "Rastreo a Ecuador", value: item.trackingDesdeIntermediario, readOnly: true },
        { label: "Rastreo local", value: item.trackingDirecto, readOnly: true },
        { label: C.requierePacking.label, value: item.requierePacking, displayValue: displayBoolean(item.requierePacking), config: C.requierePacking },
        {
          label: "Dónde se gestiona",
          value: "",
          displayValue: item.packingId
            ? <Link href={`/shipping-v2/packings/${item.packingId}`} className="font-semibold text-[#D7FF4F] hover:underline">En su caja</Link>
            : item.recibido === true
              ? "Ya llegó"
              : <Link href="/shipping-v2/packings#sueltos" className="font-semibold text-[#D7FF4F] hover:underline">Pestaña Logística</Link>,
          readOnly: true,
        },
        { label: C.estadoDespiece.label, value: item.estadoDespiece, config: C.estadoDespiece },
      ],
    },
    {
      key: "pago",
      label: "Pago",
      rows: [
        { label: "Situación del pago", value: item.situacionPago, displayValue: item.situacionPago ? ETIQUETA_SITUACION_PAGO[item.situacionPago] : "—", readOnly: true },
        // Punto 9d: la orden de compra a la que pertenece (ahí se ve y se registra su pago).
        { label: "Orden de compra", value: item.ordenCompraId, displayValue: item.ordenCompraId ? <Link href={`/shipping-v2/pagos/ordenes/${item.ordenCompraId}`} className="font-semibold text-[#D7FF4F] hover:underline">{trazabilidad?.ordenCompra?.codigo || "Ver orden"}</Link> : "—", readOnly: true },
        { label: C.requierePago.label, value: item.requierePago, displayValue: displayBoolean(item.requierePago), config: C.requierePago },
        { label: "Pago Shipping V2 relacionado", value: item.pagoId, displayValue: pago?.pagoId || item.pagoId || "—", config: C.pagoRelacionado },
        { label: "Estado de pago", value: pago?.estadoPago, displayValue: pago?.estadoPago ? <EstadoBadge estado={pago.estadoPago} size="sm" /> : "—", readOnly: true },
        { label: "Total del pago", value: pago?.totalAPagar ?? pago?.total, displayValue: formatCurrency(pago?.totalAPagar ?? pago?.total ?? null), readOnly: true },
        { label: "Fecha real de pago", value: pago?.fechaPagoReal, displayValue: formatDate(pago?.fechaPagoReal), readOnly: true },
        { label: "Pago legacy", value: item.legacyPagoRelacionadoIds.join(", "), readOnly: true },
      ],
    },
    {
      key: "packing",
      label: "Packing",
      rows: [
        { label: C.packingRelacionado.label, value: item.packingId, displayValue: item.packingId ? <Link href={`/shipping-v2/packings/${item.packingId}`} className="font-semibold text-[#D7FF4F] hover:underline">{packing?.packingId || item.packingId}</Link> : "—", config: C.packingRelacionado },
        { label: "Estado packing", value: packing?.estado, displayValue: packing?.estado ? <EstadoBadge estado={packing.estado} size="sm" /> : "—", readOnly: true },
        { label: "Tracking USA", value: packing?.trackingUsa || item.trackingUsa, readOnly: true },
        { label: "Tracking EC", value: packing?.trackingEc || item.trackingEc, readOnly: true },
        { label: "Peso", value: packing?.peso, displayValue: packing?.peso === null || packing?.peso === undefined ? "—" : `${packing.peso} kg`, readOnly: true },
      ],
    },
    {
      key: "observaciones",
      label: "Notas",
      rows: [
        { label: C.observacionesInternas.label, value: item.observacionesInternas, config: C.observacionesInternas },
        { label: C.observacionVenta.label, value: item.observacionVenta, config: C.observacionVenta },
        { label: "Evidencias", value: "", displayValue: attachmentList(item.evidencias), readOnly: true },
        { label: C.itemPadre.label, value: item.itemPadreId, displayValue: item.itemPadreId ? <Link href={`/shipping-v2/items/${item.itemPadreId}`} className="font-semibold text-[#D7FF4F] hover:underline">{trazabilidad?.itemPadre?.sku || "Ver artículo"}</Link> : "—", config: C.itemPadre },
        { label: C.itemsHijos.label, value: item.itemHijoIds.join(", "), displayValue: item.itemHijoIds.length ? `${item.itemHijoIds.length} pieza${item.itemHijoIds.length === 1 ? "" : "s"} (pestaña Despiece)` : "—", config: C.itemsHijos },
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
      rows: [],
    },
    // Punto 3 (6-oct-2026): mantenimientos y mejoras se registran aquí, no en
    // la Inspección. Un proveedor no la ve (no usa Recepción ni edita).
    ...(canUseRecepcion || canEditItems
      ? [{
        key: "intervenciones" as const,
        label: "Mejoras",
        rows: [],
      }]
      : []),
  ];
  const activeSection = tabs.find((tab) => tab.key === activeTab) ?? tabs[0];
  const fichaGenerada = isFichaGenerada(item);
  const fichaHref = shippingV2TechnicalSheetHref(item);
  const skuLabelHref = shippingV2SkuLabelHref(item.id);

  // ── Recorrido: de dónde vino y a dónde fue ────────────────────────────
  const situacion = item.situacionPago;
  const chipPago = situacion ? (
    <PasoChip tono={situacion === "pagado" ? "ok" : situacion === "sin-pago" ? "nada" : "espera"} title={`Pago: ${ETIQUETA_SITUACION_PAGO[situacion]}`}>
      {situacion === "falta-respaldo" ? "Sin respaldo" : ETIQUETA_SITUACION_PAGO[situacion]}
    </PasoChip>
  ) : null;
  const yaEstabaEnTienda = item.origenArticulo === ORIGEN_TIENDA;
  const oc = trazabilidad?.ordenCompra;
  const detalleCompra = [item.proveedorCompraDisplay, oc?.numeroProveedor ? `N° ${oc.numeroProveedor}` : "", shortDate(oc?.fechaCompra)].filter(Boolean).join(" · ");
  const inspeccionHref = canUseRecepcion && item.recibido === true ? rutaUnidad(item, "inspeccion") : undefined;
  const avance = avanceDeInspeccion(item.revisionTecnicaDetalle, item.revisadoFisicamente === true);
  const pideInspeccion = item.requiereInspeccion === true || avance !== "sin-empezar" || item.revisadoFisicamente === true;
  const fallas = item.puntosRevisionFallidos ?? 0;
  const documentos = trazabilidad?.documentos ?? [];
  const viajaSolo = !item.packingId && vieneDeAfuera(item.origenArticulo);
  const rastreoSuelto = [item.trackingDesdeIntermediario || item.trackingDirecto, item.trackingHaciaIntermediario].filter(Boolean).join(" · ");
  const salioDelInventario = ["vendido", "agotado"].includes(normalizeText(item.estado));
  // Cuántos datos tiene la franja de precio (según permisos), para repartir el ancho.
  const heroStatsCount = 1
    + (canViewCosts && verCampo("precioVenta") ? 1 : 0)
    + ((canViewCosts && verCampo("costoTotalUnidad")) || (!canViewCosts && canViewProviderCost && verCampo("costoProveedor")) ? 1 : 0)
    + (canViewCosts && verCampo("gananciaUnidad") ? 1 : 0);
  const heroStatsCols = ({ 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" } as Record<number, string>)[heroStatsCount];

  const recorrido = (
    <section className="overflow-hidden rounded-lg border border-[#2E2F28] bg-[#171814]">
      <h2 className="border-b border-[#2E2F28] bg-[#1A1B17] px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-wide text-[#8F908A]">Recorrido</h2>
      <ol className="divide-y divide-[#24251F]">
        {oc ? (
          <PasoRecorrido icon={ShoppingCart} etiqueta="Compra" principal={`Orden ${oc.codigo}`} href={`/shipping-v2/pagos/ordenes/${oc.id}`} detalle={detalleCompra} chip={oc.anulada ? <PasoChip tono="alerta">Orden anulada</PasoChip> : chipPago} />
        ) : yaEstabaEnTienda ? (
          <PasoRecorrido icon={ShoppingCart} etiqueta="Compra" principal="Ya estaba en la tienda" apagado detalle={displayValue(item.tipoOperacion, "")} chip={chipPago} />
        ) : (
          <PasoRecorrido
            icon={ShoppingCart}
            etiqueta="Compra"
            principal={item.ordenCompraId ? "Ver orden" : displayValue(item.proveedorCompraDisplay, "Sin proveedor")}
            href={item.ordenCompraId ? `/shipping-v2/pagos/ordenes/${item.ordenCompraId}` : undefined}
            apagado={!item.ordenCompraId && !item.proveedorCompraDisplay}
            detalle={[item.ordenCompraId ? item.proveedorCompraDisplay : "", shortDate(item.fechaRegistro || item.createdTime)].filter(Boolean).join(" · ")}
            chip={chipPago}
          />
        )}
        {trazabilidad?.operacion ? (
          <PasoRecorrido icon={ClipboardList} etiqueta="Pedido" principal={trazabilidad.operacion.codigo} href={enlaces.operaciones ? `/operaciones/${trazabilidad.operacion.id}` : undefined} detalle="Pedido de cliente" />
        ) : null}
        {trazabilidad?.ordenReparacion ? (
          <PasoRecorrido icon={Wrench} etiqueta="Reparación" principal={trazabilidad.ordenReparacion.codigo} href={enlaces.tecnicos ? `/tecnicos/ordenes/${trazabilidad.ordenReparacion.id}` : undefined} detalle="Orden de reparación" />
        ) : null}
        {item.itemPadreId ? (
          <PasoRecorrido icon={GitBranch} etiqueta="Sale de" principal={trazabilidad?.itemPadre?.sku || "Artículo padre"} href={`/shipping-v2/items/${item.itemPadreId}`} detalle={trazabilidad?.itemPadre?.nombre ? `Despiece de ${trazabilidad.itemPadre.nombre}` : "Despiece"} />
        ) : null}
        {item.packingId ? (
          <PasoRecorrido
            icon={Truck}
            etiqueta="Envío"
            principal={packing?.packingId || "Ver caja"}
            href={`/shipping-v2/packings/${item.packingId}`}
            detalle={[packing?.nombre, packing?.trackingEc ? `EC ${packing.trackingEc}` : packing?.trackingUsa ? `USA ${packing.trackingUsa}` : ""].filter(Boolean).join(" · ")}
            chip={packing?.estado ? <EstadoBadge estado={packing.estado} size="sm" /> : null}
          />
        ) : viajaSolo ? (
          <PasoRecorrido
            icon={Truck}
            etiqueta="Envío"
            principal="Viaja solo"
            onClick={() => abrirPestana("logistica")}
            detalle={rastreoSuelto || "Sin rastreo"}
            chip={item.recibido === true ? <PasoChip tono="ok">Llegó</PasoChip> : <PasoChip tono="espera">En camino</PasoChip>}
          />
        ) : (
          <PasoRecorrido icon={Truck} etiqueta="Envío" principal={yaEstabaEnTienda ? "No viajó" : "Sin caja"} apagado />
        )}
        {item.recibido !== true ? (
          <PasoRecorrido icon={ClipboardCheck} etiqueta="Revisión" principal="Aún no llega" apagado chip={<PasoChip tono="nada">Pendiente</PasoChip>} />
        ) : pideInspeccion ? (
          <PasoRecorrido
            icon={ClipboardCheck}
            etiqueta="Inspección"
            principal={avance === "firmada" ? "Ficha de inspección" : avance === "en-proceso" ? "Inspección a medias" : "Inspeccionar"}
            href={inspeccionHref}
            detalle={avance === "firmada"
              ? [item.revisadoPor ? `Firmó ${item.revisadoPor}` : "Firmada", shortDate(item.fechaRevision), fallas ? `${fallas} punto${fallas === 1 ? "" : "s"} con falla` : ""].filter(Boolean).join(" · ")
              : avance === "en-proceso" ? "Alguien empezó y no firmó" : "Falta revisar y firmar"}
            chip={avance === "firmada"
              ? <PasoChip tono={fallas ? "alerta" : "ok"}>Firmada</PasoChip>
              : <PasoChip tono="espera">{avance === "en-proceso" ? "En proceso" : "Pendiente"}</PasoChip>}
          />
        ) : (
          <PasoRecorrido icon={ClipboardCheck} etiqueta="Revisión" principal="Recibido" detalle="No requiere inspección" chip={<PasoChip tono="ok">Listo</PasoChip>} />
        )}
        {documentos.length ? documentos.map((documento) => (
          <PasoRecorrido
            key={documento.id}
            icon={Receipt}
            etiqueta={documento.tipo === "reserva" ? "Reserva" : documento.tipo === "nota-credito" ? "Devolución" : "Venta"}
            principal={`${DOCUMENTO_ETIQUETA[documento.tipo]} ${documento.numero}`}
            href={enlaces.facturacion ? documentoHref(documento) : undefined}
            nuevaPestana={documento.tipo === "recibo" || documento.tipo === "reserva"}
            detalle={shortDate(documento.fecha)}
            chip={documento.estado ? <PasoChip tono={documentoTono(documento)}>{documento.estado}</PasoChip> : null}
          />
        )) : (
          <PasoRecorrido
            icon={Receipt}
            etiqueta="Venta"
            principal={item.usoLocal ? "Activo de la tienda" : salioDelInventario ? "Vendido" : "Sin vender"}
            apagado
            detalle={salioDelInventario && trazabilidad ? "Sin documento enlazado" : undefined}
          />
        )}
      </ol>
    </section>
  );

  return (
    <div className="grid w-full gap-3 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] 2xl:grid-cols-[minmax(0,4fr)_minmax(0,6fr)]">
      {/* La foto manda: columna propia que acompaña al bajar. */}
      <aside className="min-w-0 md:sticky md:top-16 md:self-start">
        <ItemPhotoViewer itemId={item.id} itemName={item.nombre} fotos={item.fotos} onUpdated={handleSaved} canEdit={canEditItems} density="hero" />
      </aside>

      <div className="min-w-0 space-y-3">
        <section className="rounded-lg border border-[#2E2F28] bg-[#171814]">
          <div className="p-3">
            <div className="flex flex-wrap items-center gap-1.5">
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
              className="-mx-1 mt-2 rounded-md px-1 transition"
              valueClassName="min-h-7 break-words text-xl font-semibold leading-tight text-[#F5F5F5] lg:text-[22px]"
              readOnly={!canEditItems}
              onSave={(value) => saveField(C.nombre.field, value)}
            />
            <p className="mt-1 text-[12px] text-[#8F908A]">
              {[item.sku, item.categoria, item.condicion, [item.marca, item.modelo].filter(Boolean).join(" ")].map((value) => String(value ?? "").trim()).filter(Boolean).join(" · ")}
            </p>
            <UnidadDelProducto item={item} hermanas={hermanas} />
            {hasAiNameSuggestion && canEditItems ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-[#D7FF4F]/25 bg-[#151613] px-2.5 py-1.5">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#D7FF4F]" aria-hidden="true" />
                <span className="text-[11.5px] font-semibold text-[#D7FF4F]">Nombre sugerido</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-[#F5F5F5]" title={aiNameSuggestion}>{aiNameSuggestion}</span>
                <span className="flex shrink-0 gap-1">
                  <button type="button" onClick={() => void applyAiNameSuggestion()} disabled={applyingAiName} className="h-7 rounded-md border border-[#D7FF4F] bg-[#D7FF4F] px-2.5 text-[12px] font-bold text-[#151515] transition hover:brightness-105 disabled:opacity-60">
                    {applyingAiName ? "Aplicando…" : "Aplicar"}
                  </button>
                  <button type="button" onClick={() => setIgnoredAiName(aiNameSuggestion || "")} disabled={applyingAiName} className="h-7 rounded-md border border-[#3A3A36] px-2.5 text-[12px] font-semibold text-[#E6E6E1] transition hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F] disabled:opacity-60">
                    Ignorar
                  </button>
                  <button type="button" onClick={() => void refreshItem()} disabled={applyingAiName} title="Volver a leer la sugerencia" className="h-7 rounded-md border border-[#3A3A36] px-2 text-[12px] font-semibold text-[#8F908A] transition hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F] disabled:opacity-60">
                    Actualizar
                  </button>
                </span>
              </div>
            ) : null}
            <InlineEditableField
              label={C.descripcion.label}
              value={item.descripcion}
              type={C.descripcion.type}
              displayValue={item.descripcion?.trim() ? item.descripcion : <span className="text-[#5E5F59]">{canEditItems ? "Agregar descripción…" : "Sin descripción"}</span>}
              hideLabel
              className="-mx-1 mt-2 rounded-md px-1 transition"
              valueClassName="min-h-5 break-words text-[13px] leading-5 text-[#B4B5AC]"
              readOnly={!canEditItems}
              onSave={(value) => saveField(C.descripcion.field, value)}
            />
          </div>

          {/* Lo que se mira siempre: precio, costo, ganancia y cuántos hay. */}
          <div className={`grid gap-px border-y border-[#24251F] bg-[#24251F] ${heroStatsCols}`}>
            {canViewCosts && verCampo("precioVenta") ? (
              <InlineEditableField
                label="Precio venta"
                value={item.precioVenta}
                type={C.precioVentaFinal.type}
                displayValue={formatCurrency(item.precioVenta)}
                className="bg-[#171814] px-3 py-2 transition"
                labelClassName="text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A]"
                valueClassName="mt-0.5 truncate text-[17px] font-semibold leading-6 tabular-nums text-[#D7FF4F]"
                readOnly={!canEditItems || campoSoloLectura("precioVenta")}
                onSave={(value) => saveField(C.precioVentaFinal.field, value)}
              />
            ) : null}
            {canViewCosts && verCampo("costoTotalUnidad") ? (
              <HeroStat label="Costo unitario" title={`Proveedor ${formatCurrency(item.costoProveedor)} + traerlo ${formatCurrency(item.costoLogisticoAsignado)}`}>{formatCurrency(calculateItemUnitCost(item))}</HeroStat>
            ) : canViewProviderCost && verCampo("costoProveedor") ? (
              <HeroStat label="Costo proveedor">{formatCurrency(item.costoProveedor)}</HeroStat>
            ) : null}
            {canViewCosts && verCampo("gananciaUnidad") ? (
              <HeroStat label="Ganancia unidad" tone={gananciaUnidad !== null && gananciaUnidad < 0 ? "orange" : "neutral"} title={gananciaStock !== null ? `Todo el stock: ${formatCurrency(gananciaStock)}` : undefined}>{formatCurrency(gananciaUnidad)}</HeroStat>
            ) : null}
            <HeroStat label="Cantidad" title={item.unidad || undefined}>
              {formatShippingV2ItemQuantity(item)}
              {(item.cantidadReservada ?? 0) > 0 ? <span className="ml-1.5 text-[12px] font-medium text-[#F4E85B]">{item.cantidadReservada} reservada{item.cantidadReservada === 1 ? "" : "s"}</span> : null}
            </HeroStat>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 p-2">
              <FacebookSuperGeekDetailButton
                item={item}
                checked={item.facebookSuperGeek === true}
                canEdit={canEditItems}
                busy={facebookSuperGeekDetailBusy}
                onOpen={openFacebookSuperGeekModal}
              />
              {canUseRecepcion ? (
                <Link href={fichaHref} target={fichaGenerada ? "_blank" : undefined} rel={fichaGenerada ? "noreferrer" : undefined} title={fichaGenerada ? "Imprimir la ficha técnica" : "Preparar la ficha técnica"} className={accionClass}>
                  <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                  {fichaGenerada ? "Ficha" : "Preparar ficha"}
                </Link>
              ) : null}
              {canUseRecepcion ? (
                <Link href={skuLabelHref} target="_blank" rel="noreferrer" title="Imprimir etiqueta SKU" className={accionClass}>
                  <Tag className="h-3.5 w-3.5" aria-hidden="true" />
                  Etiqueta
                </Link>
              ) : null}
              {esAdmin && adminPanel ? (
                <button type="button" onClick={() => setAdminOpen((open) => !open)} aria-expanded={adminOpen} title="Activos, dar de baja, corregir estado y eliminar"
                  className={`${accionClass} ml-auto ${adminOpen ? "border-[#8B73FF]/60 bg-[#8B73FF]/15 text-[#C9BFFF]" : ""}`}>
                  <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Administrar
                  <ChevronDown className={`h-3.5 w-3.5 transition ${adminOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                </button>
              ) : null}
          </div>
          {adminOpen && adminPanel ? <div className="space-y-2 border-t border-[#24251F] p-2">{adminPanel}</div> : null}
        </section>

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

        {recorrido}

        <section ref={tabsRef} className="scroll-mt-16 overflow-hidden rounded-lg border border-[#2E2F28] bg-[#171814]">
          <div role="tablist" className="flex gap-0.5 overflow-x-auto border-b border-[#2E2F28] bg-[#1A1B17] px-1 pt-1">
            {tabs.map((tab) => {
              const active = tab.key === activeTab;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  title={tab.key === "intervenciones" ? "Mantenimientos y mejoras" : undefined}
                  onClick={() => setActiveTab(tab.key)}
                  className={`-mb-px shrink-0 whitespace-nowrap rounded-t-md border border-b-0 px-2.5 py-1.5 text-[12.5px] font-semibold transition ${active ? "border-[#2E2F28] bg-[#171814] text-[#D7FF4F]" : "border-transparent text-[#8F908A] hover:text-[#F5F5F5]"}`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          <div className="p-2">
            {activeTab === "despiece" ? (
              // El despiece no es una lista de campos sino una tabla donde se
              // van creando artículos hijos, así que no usa DetailSection.
              <ShippingV2DespieceTab itemId={item.id} canEdit={canEditItems} esAdmin={esAdmin} />
            ) : activeTab === "intervenciones" ? (
              <ShippingV2IntervencionesTab itemId={item.id} />
            ) : (
              <>
                <DetailSection rows={activeSection.rows} onSave={saveField} esAdmin={esAdmin} canEdit={canEditItems} camposOcultos={camposOcultos} camposSoloLectura={camposSoloLectura} />
                {activeTab === "logistica" && costosTraerlo ? <div className="mt-2">{costosTraerlo}</div> : null}
              </>
            )}
          </div>
        </section>

        <NovedadesVinculadasCard
          novedades={novedades ?? []}
          providerLabelsById={providerLabelsById}
          item={{ id: item.id, sku: item.sku, nombre: item.nombre, cantidad: item.cantidad, estado: item.estado, packingId: item.packingId, proveedorId: item.proveedorId }}
          rol={rolNovedades}
          puedeRegistrar={(rolNovedades === "staff" || rolNovedades === "admin") && permissions?.canCreateNovedades !== false}
        />
      </div>
    </div>
  );
}

export function ShippingV2ItemsClient({ items: initialItems, proveedores, error, permissions, providerName, camposOcultos = [], initialSortBy, filtro = FILTRO_ARTICULOS_VACIO, pagination }: Props) {
  const router = useRouter();
  const canEditItems = permissions?.canEditItems !== false;
  const canViewCosts = permissions?.canViewCosts !== false;
  const canViewProviderCost = canViewCosts || permissions?.canViewProviderCost !== false;
  // Personalización por usuario (Fase 2 de permisos) intersecada con los
  // permisos de rol: se necesitan AMBOS para ver el dato.
  const puedeVerCostoProveedorLista = canViewProviderCost && !camposOcultos.includes("costoProveedor");
  const puedeVerPrecioVentaLista = canViewCosts && !camposOcultos.includes("precioVenta");
  const isProviderPortal = Boolean(providerName && permissions?.canEditItems === false);
  const availableColumns = useMemo(() => getAvailableColumns(canViewCosts, canViewProviderCost, camposOcultos), [canViewCosts, canViewProviderCost, camposOcultos]);
  const availableSortOptions = useMemo(() => getSortOptions(canViewCosts, canViewProviderCost), [canViewCosts, canViewProviderCost]);
  const [items, setItems] = useState(initialItems);
  const [search, setSearch] = useState(filtro.q);
  const [sortBy, setSortBy] = useState<SortKey>(() => sanitizeProviderSort(initialSortBy, canViewCosts, canViewProviderCost));
  const [groupBy, setGroupBy] = useState<GroupKey>("none");
  const [notice, setNotice] = useState("");
  const [columnWidths, setColumnWidths] = useState<ShippingV2ItemsColumnWidths>(() => createDefaultColumnWidths());
  const [tableView, setTableView] = useState<ShippingV2ItemsTableViewConfig>(() => createDefaultTableViewConfig());
  const [toolbarMenuOpen, setToolbarMenuOpen] = useState<ToolbarMenuKey | null>(null);
  const [draggedColumnKey, setDraggedColumnKey] = useState<ShippingV2ItemsColumnKey | null>(null);
  const [facebookSuperGeekBusyId, setFacebookSuperGeekBusyId] = useState("");
  const toolbarMenuRef = useRef<HTMLDivElement>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    setSearch(filtro.q);
  }, [filtro.q]);

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

  const resetTableView = useCallback(() => {
    const defaults = sanitizeTableViewConfig(null, availableColumns);
    setTableView(defaults);
    persistTableView(defaults);
  }, [availableColumns, persistTableView]);

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

  // Rediseño 15-oct-2026: el filtro y la búsqueda ya vienen aplicados por el
  // servidor sobre todo el inventario; aquí solo se ordena y agrupa la página.
  const sortedItems = useMemo(() => sortItems(resolvedItems, sortBy), [resolvedItems, sortBy]);
  const groupedItems = useMemo(() => groupItems(sortedItems, groupBy), [groupBy, sortedItems]);
  const visibleGroupCount = groupBy === "none" ? 0 : groupedItems.length;
  const visibleColumns = useMemo(() => {
    const visibleKeys = new Set(tableView.visibleColumnKeys);
    return tableView.orderedColumnKeys
      .map((key) => availableColumns.find((column) => column.key === key))
      .filter((column): column is ShippingV2ItemsColumn => Boolean(column && visibleKeys.has(column.key)));
  }, [availableColumns, tableView]);
  // Ancho mínimo de la tabla: si la pantalla es más ancha, "Nombre" se estira.
  const tableWidth = useMemo(() => visibleColumns.reduce((total, column) => total + columnWidths[column.key], 0), [columnWidths, visibleColumns]);

  const summary = useMemo(() => ({
    total: resolvedItems.length,
    disponibles: resolvedItems.filter((item) => normalizeText(item.estado).includes("disponible") || item.disponibleVenta === true).length,
    faltaRespaldo: resolvedItems.filter((item) => item.situacionPago === "falta-respaldo").length,
    enTransito: resolvedItems.filter((item) => normalizeText(item.estado).includes("transito")).length,
    conNovedad: resolvedItems.filter((item) => item.conNovedad === true || normalizeText(item.estado).includes("novedad")).length,
  }), [resolvedItems]);

  // "Más filtros" guarda operación y proveedor; categoría y estado van a la vista.
  const activeFilterCount = [filtro.operacion, filtro.proveedor].filter(Boolean).length;
  const proveedorEtiquetas = useMemo(() => Object.fromEntries(proveedores.map((proveedor) => [proveedor.id, getShippingV2ProveedorLabel(proveedor)])), [proveedores]);
  const proveedorIds = useMemo(() => [...proveedores].sort((a, b) => getShippingV2ProveedorLabel(a).localeCompare(getShippingV2ProveedorLabel(b), "es")).map((proveedor) => proveedor.id), [proveedores]);
  const sortLabel = availableSortOptions.find((option) => option.value === sortBy)?.label ?? "Más nuevos primero";
  const groupLabel = groupOptions.find((option) => option.value === groupBy)?.label ?? "Sin agrupar";

  // Cambiar un filtro vuelve a la primera página con el resto igual.
  const aplicarFiltro = useCallback((cambios: Partial<FiltroArticulos>) => {
    setToolbarMenuOpen(null);
    router.push(hrefArticulos({ ...filtro, ...cambios }, { sort: sortBy }));
  }, [filtro, router, sortBy]);

  // Enter en el buscador: "laptops hp disponibles" → Categoría, Estado y texto.
  const buscar = useCallback((texto: string) => {
    const interpretado = interpretarBusqueda(texto);
    aplicarFiltro({
      q: interpretado.resto,
      ...(interpretado.categoria ? { categoria: interpretado.categoria } : {}),
      ...(interpretado.estado ? { estado: interpretado.estado } : {}),
    });
  }, [aplicarFiltro]);

  const resetFilters = useCallback(() => {
    aplicarFiltro(FILTRO_ARTICULOS_VACIO);
  }, [aplicarFiltro]);

  const buildSortHref = useCallback((nextSortBy: SortKey) => hrefArticulos(filtro, { sort: nextSortBy }), [filtro]);

  const selectSortBy = useCallback((nextSortBy: SortKey) => {
    const safeSortBy = sanitizeProviderSort(nextSortBy, canViewCosts, canViewProviderCost);
    setSortBy(safeSortBy);
    setToolbarMenuOpen(null);
    router.push(buildSortHref(safeSortBy));
  }, [buildSortHref, canViewCosts, canViewProviderCost, router]);

  const toggleToolbarMenu = useCallback((menu: ToolbarMenuKey) => {
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

  const filtering = hayFiltroArticulos(filtro);
  const hasPages = pagination.hasPreviousPage || pagination.hasNextPage;
  const cellContext: ItemCellRenderContext = {
    canEditFacebookSuperGeek: canEditItems,
    facebookSuperGeekBusyId,
    onFacebookSuperGeekChange: updateFacebookSuperGeek,
    categoryInName: !visibleColumns.some((column) => column.key === "category"),
  };
  const smallButton = "inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-[#3A3A36] bg-[#151613] px-2 text-[11.5px] font-semibold text-[#A7A7A7] transition hover:border-[#D7FF4F]/45 hover:text-[#D7FF4F] disabled:cursor-not-allowed disabled:opacity-45";

  return (
    <div className="w-full space-y-2">
      {/* Barra única (15-oct-2026): volver, buscar, filtrar/ordenar/agrupar/campos y páginas. */}
      <section className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[#2E2F28] bg-[#151613] p-1.5">
        <Link
          href="/shipping-v2"
          aria-label="Volver al inicio de Shipping V2"
          title="Volver al inicio de Shipping V2"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#8F908A] transition hover:bg-[#20211D] hover:text-[#D7FF4F] focus:outline-none focus:ring-2 focus:ring-[#D7FF4F]/35"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <div className="min-w-[12rem] flex-1">
          <ShippingV2ItemsPredictiveSearch search={search} setSearch={setSearch} fallbackItems={resolvedItems} canViewCosts={puedeVerPrecioVentaLista} onSubmit={buscar} aplicado={filtro.q} />
        </div>
        <FiltroSelect etiqueta="Categoría" valor={filtro.categoria} principales={CATEGORIAS_ARTICULO} onChange={(categoria) => aplicarFiltro({ categoria })} className="w-[8.75rem]" />
        <FiltroSelect etiqueta="Estado" valor={filtro.estado} principales={ESTADOS_PRINCIPALES} otras={ESTADOS_OTROS} onChange={(estado) => aplicarFiltro({ estado })} className="w-[8.25rem]" />
        <div ref={toolbarMenuRef} className="relative flex shrink-0 items-center gap-1">
          <TooltipProvider delayDuration={180}>
            <ToolbarIconButton
              label="Más filtros: operación y proveedor"
              open={toolbarMenuOpen === "filters"}
              active={activeFilterCount > 0}
              badge={activeFilterCount || undefined}
              onClick={() => toggleToolbarMenu("filters")}
            >
              <ListFilter className="h-4 w-4" aria-hidden="true" />
            </ToolbarIconButton>
            <ToolbarIconButton
              label={`Ordenar: ${sortLabel}`}
              open={toolbarMenuOpen === "sort"}
              active={sortBy !== "newest"}
              onClick={() => toggleToolbarMenu("sort")}
            >
              <ArrowDownAZ className="h-4 w-4" aria-hidden="true" />
            </ToolbarIconButton>
            <ToolbarIconButton
              label={`Agrupar: ${groupLabel}`}
              open={toolbarMenuOpen === "group"}
              active={groupBy !== "none"}
              onClick={() => toggleToolbarMenu("group")}
            >
              <Rows3 className="h-4 w-4" aria-hidden="true" />
            </ToolbarIconButton>
            <ToolbarIconButton
              label="Campos visibles"
              open={toolbarMenuOpen === "fields"}
              active={false}
              onClick={() => toggleToolbarMenu("fields")}
            >
              <Columns3 className="h-4 w-4" aria-hidden="true" />
            </ToolbarIconButton>
          </TooltipProvider>

          {toolbarMenuOpen ? (
            <div
              role="menu"
              className={`absolute right-0 top-full z-50 mt-1.5 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-[#30312D] bg-[#11120F] shadow-2xl shadow-black/45 animate-in fade-in-0 zoom-in-95 duration-150 ${
                toolbarMenuOpen === "filters" ? "w-[min(92vw,260px)]" : "w-[min(92vw,300px)]"
              }`}
            >
              {toolbarMenuOpen === "filters" ? (
                <div className="grid gap-1.5 p-2">
                  <FiltroSelect etiqueta="Operación" valor={filtro.operacion} principales={OPERACIONES_PRINCIPALES} otras={OPERACIONES_OTRAS} onChange={(operacion) => aplicarFiltro({ operacion })} className="w-full" />
                  {!isProviderPortal ? (
                    <FiltroSelect etiqueta="Proveedor" valor={filtro.proveedor} principales={proveedorIds} etiquetas={proveedorEtiquetas} onChange={(proveedor) => aplicarFiltro({ proveedor })} className="w-full" />
                  ) : null}
                  {filtering ? (
                    <button type="button" onClick={resetFilters} className={`${smallButton} justify-center`}>
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                      Quitar todos los filtros
                    </button>
                  ) : null}
                </div>
              ) : null}

              {toolbarMenuOpen === "sort" ? (
                <>
                  <p className="border-b border-[#30312D] px-3 py-1.5 text-[13px] font-semibold text-[#F5F5F5]">Ordenar por</p>
                  <div className="grid max-h-[420px] gap-0.5 overflow-y-auto p-1.5">
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
                  <p className="border-b border-[#30312D] px-3 py-1.5 text-[13px] font-semibold text-[#F5F5F5]">Agrupar por</p>
                  <div className="grid max-h-[420px] gap-0.5 overflow-y-auto p-1.5">
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

              {toolbarMenuOpen === "fields" ? (
                <>
                  <div className="flex items-center justify-between gap-2 border-b border-[#30312D] px-3 py-1.5">
                    <p className="text-[13px] font-semibold text-[#F5F5F5]">Campos <span className="font-normal text-[#8F908A]">{visibleColumns.length}/{availableColumns.length}</span></p>
                    <div className="flex gap-1">
                      <button type="button" onClick={resetColumnWidths} className={smallButton} title="Vuelve los anchos de columna a su tamaño original">Anchos</button>
                      <button type="button" onClick={resetTableView} className={smallButton} title="Vuelve a las columnas y el orden por defecto">Por defecto</button>
                    </div>
                  </div>
                  <div className="max-h-[420px] overflow-y-auto p-1.5">
                    {COLUMN_CATEGORIES.map((category) => {
                      const categoryColumns = availableColumns.filter((column) => column.category === category);
                      if (!categoryColumns.length) return null;
                      return (
                        <section key={category} className="mb-1.5 last:mb-0">
                          <p className="px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-[#8F908A]">{category}</p>
                          {categoryColumns.map((column) => {
                            const checked = tableView.visibleColumnKeys.includes(column.key);
                            return (
                              <label
                                key={column.key}
                                className={`flex items-center justify-between gap-3 rounded px-1.5 py-1 text-[13px] transition ${column.required ? "cursor-default" : "cursor-pointer hover:bg-[#1D1E1A]"} ${checked ? "text-[#F5F5F5]" : "text-[#8F908A]"}`}
                              >
                                <span className="min-w-0 truncate">{column.fullLabel ?? column.label}{column.required ? <span className="ml-1 text-[11px] text-[#5E5F59]">fija</span> : null}</span>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={column.required}
                                  onChange={() => toggleColumnVisibility(column)}
                                  className="h-3.5 w-3.5 accent-[#D7FF4F] disabled:opacity-50"
                                />
                              </label>
                            );
                          })}
                        </section>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
        <ItemsPager pagination={pagination} count={resolvedItems.length} />
      </section>

      {error ? (
        <section className="rounded-lg border border-orange-300/25 bg-orange-300/10 px-3 py-2 text-[13px] text-orange-100">
          <b>Airtable V2 no disponible.</b> <span className="text-orange-100/85">{error}</span>
        </section>
      ) : null}

      {notice ? (
        <section className="flex items-center gap-2 rounded-lg border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 px-3 py-1.5 text-[13px] font-medium text-[#D7FF4F]">
          <span className="min-w-0 flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice("")} aria-label="Cerrar aviso" className="shrink-0 text-[15px] leading-none text-[#D7FF4F]/70 hover:text-[#D7FF4F]">×</button>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-lg border border-[#2E2F28] bg-[#171814]">
        {/* Una línea con lo que hay en esta página (antes eran 5 tarjetas). */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#2E2F28] bg-[#1A1B17] px-2.5 py-1.5 text-[12px] text-[#8F908A]">
          {/* Lo que filtra y no se ve en la barra (texto, operación, proveedor), con × para quitarlo. */}
          {filtro.q ? <FiltroChip onQuitar={() => aplicarFiltro({ q: "" })}>«{filtro.q}»</FiltroChip> : null}
          {filtro.operacion ? <FiltroChip onQuitar={() => aplicarFiltro({ operacion: "" })}>{filtro.operacion}</FiltroChip> : null}
          {filtro.proveedor ? <FiltroChip onQuitar={() => aplicarFiltro({ proveedor: "" })}>{proveedorEtiquetas[filtro.proveedor] ?? "Proveedor"}</FiltroChip> : null}
          <span className="whitespace-nowrap">
            <b className="text-[#F5F5F5]">{resolvedItems.length}</b> en esta página
            {visibleGroupCount ? ` · ${visibleGroupCount} grupos` : ""}
          </span>
          <PageStat label="Disponibles" value={summary.disponibles} tone="lime" />
          <PageStat label="En tránsito" value={summary.enTransito} tone="purple" />
          <PageStat label="Sin respaldo" value={summary.faltaRespaldo} tone="yellow" />
          <PageStat label="Con novedad" value={summary.conNovedad} tone="orange" />
          <span className="ml-auto flex items-center gap-2">
            {filtering ? (
              <button type="button" onClick={resetFilters} className="whitespace-nowrap font-semibold text-[#D7FF4F] hover:underline">Quitar filtros</button>
            ) : null}
            {isProviderPortal ? <span className="rounded-full border border-[#D7FF4F]/35 px-2 py-px text-[10.5px] font-bold uppercase text-[#D7FF4F]">Vista proveedor</span> : null}
          </span>
        </div>

        <div className="hidden max-w-full overflow-x-auto md:block">
          <table
            className="border-separate border-spacing-0 text-left text-[12.5px]"
            style={{ tableLayout: "fixed", width: "100%", minWidth: tableWidth }}
          >
            <colgroup>
              {visibleColumns.map((column) => (
                <col key={column.key} style={column.key === FLEX_COLUMN_KEY ? undefined : { width: columnWidths[column.key] }} />
              ))}
            </colgroup>
            <thead className="text-[10.5px] uppercase tracking-wide text-[#8F908A]">
              <tr>
                {visibleColumns.map((column) => (
                  <th
                    key={column.key}
                    draggable
                    title={`${column.fullLabel ?? column.label} · arrastra para mover`}
                    onDragStart={(event) => handleColumnDragStart(event, column.key)}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(event) => handleColumnDrop(event, column.key)}
                    onDragEnd={() => setDraggedColumnKey(null)}
                    style={column.key === FLEX_COLUMN_KEY ? undefined : { width: columnWidths[column.key] }}
                    className={`relative whitespace-nowrap border-b border-[#2E2F28] px-2 py-1.5 font-semibold select-none ${draggedColumnKey === column.key ? "bg-[#D7FF4F]/10 text-[#D7FF4F]" : ""} ${column.align === "right" ? "text-right" : column.align === "center" ? "text-center" : "text-left"}`}
                  >
                    <div className="min-w-0 cursor-grab active:cursor-grabbing">
                      <span className="block truncate">{column.label}</span>
                    </div>
                    <span
                      data-column-resize-handle
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Cambiar ancho de ${column.fullLabel ?? column.label}`}
                      onMouseDown={(event) => startColumnResize(event, column)}
                      className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none select-none after:absolute after:right-0 after:top-1/2 after:h-4 after:w-px after:-translate-y-1/2 after:bg-[#30312D] after:transition hover:after:h-6 hover:after:bg-[#D7FF4F]/70"
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
                      <td colSpan={visibleColumns.length} className="border-b border-[#2E2F28] bg-[#141511] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[#B4B5AC]">
                        {group.label} <span className="font-semibold text-[#8F908A]">· {group.items.length}</span>
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
                      className="cursor-pointer transition hover:bg-[#D7FF4F]/[0.05] focus:bg-[#D7FF4F]/[0.05] focus:outline-none"
                    >
                      {visibleColumns.map((column) => {
                        const mutedColumn = column.key === "generalRole" || column.key === "category" || column.key === "packing" || column.key === "createdAt" || column.key === "brand" || column.key === "model" || column.key === "serial" || column.key === "condition" || column.key === "location" || column.key === "triangulationStatus" || column.key === "reviewStatus" || column.key === "requiresPayment" || column.key === "requiresPacking" || column.key === "physicalReview" || column.key === "notes" || column.key === "purchaseProvider" || column.key === "logisticProvider" || column.key === "supplierSku";
                        const alignClass = column.align === "right"
                          ? "whitespace-nowrap text-right tabular-nums"
                          : column.align === "center"
                            ? "whitespace-nowrap text-center tabular-nums"
                            : "whitespace-nowrap";
                        return (
                          <td
                            key={column.key}
                            title={getItemCellTitle(item, column.key)}
                            className={`overflow-hidden border-b border-[#24251F] px-2 py-1.5 ${column.key === "sku" ? "font-semibold text-[#D7FF4F]" : ""} ${alignClass} ${mutedColumn ? "text-[#B4B5AC]" : ""}`}
                          >
                            {renderItemCell(item, column.key, cellContext)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              )) : (
                <tr>
                  <td colSpan={visibleColumns.length} className="px-4 py-8 text-center text-[13px] text-[#8F908A]">
                    {filtering ? <>Ningún artículo coincide. <button type="button" onClick={resetFilters} className="font-semibold text-[#D7FF4F] hover:underline">Quitar filtros</button></> : "No hay artículos."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 gap-1.5 p-1.5 md:hidden">
          {sortedItems.length ? groupedItems.map((group) => (
            <div key={group.key} className="grid min-w-0 grid-cols-1 gap-1.5">
              {groupBy !== "none" ? (
                <p className="px-1 pt-1 text-[11px] font-bold uppercase tracking-wide text-[#B4B5AC]">
                  {group.label} <span className="font-semibold text-[#8F908A]">· {group.items.length}</span>
                </p>
              ) : null}
              {group.items.map((item) => (
                <MobileItemCard
                  key={item.id}
                  item={item}
                  canViewCosts={puedeVerPrecioVentaLista}
                  canViewProviderCost={puedeVerCostoProveedorLista}
                  canEditFacebookSuperGeek={canEditItems}
                  facebookSuperGeekBusy={facebookSuperGeekBusyId === item.id}
                  onFacebookSuperGeekChange={updateFacebookSuperGeek}
                  onOpen={() => router.push(`/shipping-v2/items/${item.id}`)}
                />
              ))}
            </div>
          )) : (
            <p className="px-4 py-8 text-center text-[13px] text-[#8F908A]">
              {filtering ? <>Ningún artículo coincide. <button type="button" onClick={resetFilters} className="font-semibold text-[#D7FF4F] hover:underline">Quitar filtros</button></> : "No hay artículos."}
            </p>
          )}
        </div>

        {hasPages ? (
          <div className="flex items-center justify-end gap-2 border-t border-[#2E2F28] bg-[#1A1B17] px-2.5 py-1.5 text-[12px] text-[#8F908A]">
            <span>Página {pagination.pageIndex}</span>
            <ItemsPager pagination={pagination} count={resolvedItems.length} />
          </div>
        ) : null}
      </section>
    </div>
  );
}
