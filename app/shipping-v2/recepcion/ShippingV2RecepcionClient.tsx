"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowDownAZ,
  Camera,
  Check,
  ClipboardCheck,
  ListFilter,
  Loader2,
  Maximize2,
  PackageCheck,
  PackageOpen,
  Printer,
  RotateCcw,
  Rows3,
  Search,
  ShoppingBag,
  Store,
  Tag,
  Tags,
  Megaphone,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { ItemPhotoViewer } from "@/components/shipping-v2/ItemPhotoViewer";
import type { ResolvedItem } from "../items/ShippingV2ItemsClient";
import { evaluarPublicacionItem } from "@/lib/shipping-v2/item-availability";
import {
  SHIPPING_V2_ALL_FILTER,
  filterShippingV2Items,
  formatShippingV2ItemQuantity,
  getShippingV2ItemFilterOptions,
  groupShippingV2Items,
  normalizeShippingV2ListText,
  resolveShippingV2Items,
  shippingV2ItemGroupOptions,
  shippingV2ItemSortOptions,
  sortShippingV2Items,
  type ShippingV2ItemFilterState,
  type ShippingV2ItemGroupKey,
  type ShippingV2ItemSortKey,
} from "@/lib/shipping-v2/item-list-view";
import { isFichaGenerada } from "@/lib/shipping-v2/technical-sheet";
import type {
  ShippingV2AccessPermissions,
  ShippingV2Item,
  ShippingV2Novedad,
  ShippingV2Packing,
  ShippingV2Pago,
  ShippingV2Proveedor,
  ShippingV2RecepcionChecklistAction,
} from "@/types/shipping-v2";

type Props = {
  items: ShippingV2Item[];
  packings: ShippingV2Packing[];
  proveedores: ShippingV2Proveedor[];
  novedades: ShippingV2Novedad[];
  error: string;
  preferenceScope: string;
};

type ReceptionItem = ResolvedItem & {
  packing?: ShippingV2Packing;
  packingLabel: string;
  openNovedades: ShippingV2Novedad[];
};

type DetailPayload = {
  item: ResolvedItem;
  proveedores: ShippingV2Proveedor[];
  pago: ShippingV2Pago | null;
  packing: ShippingV2Packing | null;
  novedades: ShippingV2Novedad[];
  permissions: ShippingV2AccessPermissions | null;
  esAdmin: boolean;
};

type ShippingV2ItemDetailViewProps = {
  item: ResolvedItem;
  proveedores: ShippingV2Proveedor[];
  pago?: ShippingV2Pago | null;
  packing?: ShippingV2Packing | null;
  novedades?: ShippingV2Novedad[];
  onSaved?: (item: ShippingV2Item) => void;
  esAdmin?: boolean;
  permissions?: ShippingV2AccessPermissions | null;
};

const ShippingV2ItemDetailView = dynamic<ShippingV2ItemDetailViewProps>(
  () => import("../items/ShippingV2ItemsClient").then((module) => module.ShippingV2ItemDetailView),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-64 items-center justify-center rounded-xl border border-[#30312D] bg-[#11120F] text-sm font-semibold text-[#A7A7A7]">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        Preparando detalle...
      </div>
    ),
  }
);

const ALL = SHIPPING_V2_ALL_FILTER;
const NOVEDAD_TYPES = ["Faltante", "Dañado", "Incompleto", "Diferente al comprado", "Garantía con proveedor", "Observación menor", "Otro"];
const OPEN_NOVEDAD_STATES = new Set(["abierta", "en revision interna", "en revisión interna", "enviada a proveedor", "esperando respuesta", "respondida por proveedor", "en solucion", "en solución", "escalada"]);
const RECEPTION_PREFS_VERSION = "v1";
const DEFAULT_SORT_BY: ShippingV2ItemSortKey = "newest";
const DEFAULT_GROUP_BY: ShippingV2ItemGroupKey = "none";
const DEFAULT_ITEM_FILTERS: ShippingV2ItemFilterState = {
  search: "",
  estado: ALL,
  tipoOperacion: ALL,
  proveedorCompra: ALL,
  tipoItem: ALL,
};

type ReceptionColumnKey = "photo" | "item" | "quantity" | "packing" | "provider" | "price" | "checklist" | "actions";

type ReceptionColumn = {
  key: ReceptionColumnKey;
  label: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth?: number;
  required?: boolean;
  align?: "left" | "center" | "right";
};

type ReceptionColumnWidths = Record<ReceptionColumnKey, number>;

const RECEPTION_COLUMNS: ReceptionColumn[] = [
  { key: "photo", label: "Foto", defaultWidth: 62, minWidth: 54, maxWidth: 82, required: true, align: "center" },
  { key: "item", label: "Item", defaultWidth: 470, minWidth: 280, required: true },
  { key: "quantity", label: "Cant.", defaultWidth: 74, minWidth: 66, maxWidth: 96, align: "center" },
  { key: "packing", label: "Packing", defaultWidth: 150, minWidth: 112, maxWidth: 220 },
  { key: "provider", label: "Proveedor", defaultWidth: 190, minWidth: 130, maxWidth: 260 },
  { key: "price", label: "Precio", defaultWidth: 104, minWidth: 88, maxWidth: 150, align: "right" },
  { key: "checklist", label: "Checklist", defaultWidth: 282, minWidth: 268, maxWidth: 320, align: "center" },
  { key: "actions", label: "Acciones", defaultWidth: 210, minWidth: 190, maxWidth: 260 },
];

const CHECKLIST_CONTROLS: Array<{ action: ShippingV2RecepcionChecklistAction; label: string; icon: LucideIcon }> = [
  { action: "received", label: "Recibido", icon: PackageOpen },
  { action: "reviewed", label: "Revisado física/técnicamente", icon: ClipboardCheck },
  { action: "photos-taken", label: "Fotos tomadas", icon: Camera },
  { action: "published-shopify", label: "Shopify", icon: ShoppingBag },
  { action: "published-marketplace", label: "Marketplace", icon: Store },
  { action: "published-mercado-libre", label: "Mercado Libre", icon: Tags },
  { action: "published-facebook", label: "Grupos Facebook", icon: Megaphone },
];

const receptionFilterKeys = [ALL, "pending-review", "reviewed-no-photos", "unpublished", "with-issue", "available"] as const;
type ReceptionFilterKey = (typeof receptionFilterKeys)[number];

const receptionFilters: Array<{ key: ReceptionFilterKey; label: string; shortLabel: string }> = [
  { key: ALL, label: "Todos", shortLabel: "Todos" },
  { key: "pending-review", label: "Pendientes de revisión", shortLabel: "Pendientes" },
  { key: "reviewed-no-photos", label: "Revisados sin fotos", shortLabel: "Sin fotos" },
  { key: "unpublished", label: "Sin publicar", shortLabel: "Sin publicar" },
  { key: "with-issue", label: "Con novedad", shortLabel: "Novedad" },
  { key: "available", label: "Disponibles", shortLabel: "Disponible" },
];

type ToolbarMenuKey = "filters" | "sort" | "group";

function normalize(value?: string) {
  return normalizeShippingV2ListText(value);
}

function display(value?: string | number | null) {
  const text = String(value ?? "").trim();
  return text || "-";
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value);
}

function formatDateTime(value?: string) {
  if (!value) return "Sin registrar";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-EC", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function isOpenNovedad(novedad: ShippingV2Novedad) {
  return OPEN_NOVEDAD_STATES.has(normalize(novedad.estado));
}

function isReviewed(item: ShippingV2Item) {
  return item.revisadoFisicamente === true;
}

function isReceived(item: ShippingV2Item) {
  return item.recibido === true;
}

function hasBlockingReview(item: ShippingV2Item) {
  return ["faltante", "danado", "incompleto", "diferente al comprado", "en garantia con proveedor"].includes(normalize(item.estadoRevision));
}

function openSkuLabel(itemId: string) {
  window.open(`/shipping-v2/recepcion/etiqueta/${encodeURIComponent(itemId)}`, "_blank", "noopener,noreferrer");
}

function openTechnicalSheetEditor(itemId: string) {
  window.location.href = `/shipping-v2/recepcion/ficha/${encodeURIComponent(itemId)}`;
}

function openTechnicalSheet(item: ShippingV2Item) {
  const generada = isFichaGenerada(item);
  const path = generada
    ? `/shipping-v2/recepcion/ficha/${encodeURIComponent(item.id)}/print?print=1`
    : `/shipping-v2/recepcion/ficha/${encodeURIComponent(item.id)}`;
  window.open(path, generada ? "_blank" : "_self", "noopener,noreferrer");
}

function stateTone(state: string) {
  const normalized = normalize(state);
  if (normalized.includes("disponible") || normalized.includes("recibido correctamente")) return "border-[#D7FF4F]/35 bg-[#D7FF4F]/10 text-[#D7FF4F]";
  if (normalized.includes("revision") || normalized.includes("recibido")) return "border-[#4FC3FF]/35 bg-[#4FC3FF]/10 text-[#BDEAFF]";
  if (normalized.includes("novedad") || normalized.includes("danado") || normalized.includes("faltante") || normalized.includes("garantia")) return "border-[#FF914D]/35 bg-[#FF914D]/10 text-[#FFB07A]";
  return "border-[#3A3A36] bg-[#151515] text-[#A7A7A7]";
}

function getItemPhoto(item: ShippingV2Item) {
  return item.fotos[0]?.thumbnailUrl || item.fotos[0]?.url || "";
}

function isReceptionFilterKey(value: unknown): value is ReceptionFilterKey {
  return typeof value === "string" && receptionFilterKeys.includes(value as ReceptionFilterKey);
}

function isSortKey(value: unknown): value is ShippingV2ItemSortKey {
  return typeof value === "string" && shippingV2ItemSortOptions.some((option) => option.value === value);
}

function isGroupKey(value: unknown): value is ShippingV2ItemGroupKey {
  return typeof value === "string" && shippingV2ItemGroupOptions.some((option) => option.value === value);
}

function makePreferenceKey(scope: string) {
  const cleanScope = normalize(scope).replace(/[^a-z0-9._-]+/g, "-") || "staff";
  return `shipping-v2:recepcion:${cleanScope}:view:${RECEPTION_PREFS_VERSION}`;
}

function sanitizeString(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function sanitizeStoredFilters(value: unknown): ShippingV2ItemFilterState {
  const input = value && typeof value === "object" ? value as Partial<ShippingV2ItemFilterState> : {};
  return {
    search: sanitizeString(input.search, DEFAULT_ITEM_FILTERS.search),
    estado: sanitizeString(input.estado, DEFAULT_ITEM_FILTERS.estado),
    tipoOperacion: sanitizeString(input.tipoOperacion, DEFAULT_ITEM_FILTERS.tipoOperacion),
    proveedorCompra: sanitizeString(input.proveedorCompra, DEFAULT_ITEM_FILTERS.proveedorCompra),
    tipoItem: sanitizeString(input.tipoItem, DEFAULT_ITEM_FILTERS.tipoItem),
  };
}

function createDefaultColumnWidths(): ReceptionColumnWidths {
  return RECEPTION_COLUMNS.reduce((widths, column) => {
    widths[column.key] = column.defaultWidth;
    return widths;
  }, {} as ReceptionColumnWidths);
}

function clampColumnWidth(width: number, column: ReceptionColumn) {
  return Math.min(Math.max(width, column.minWidth), column.maxWidth ?? Number.POSITIVE_INFINITY);
}

function sanitizeStoredColumnWidths(value: unknown, current = createDefaultColumnWidths()) {
  const input = value && typeof value === "object" ? value as Partial<Record<ReceptionColumnKey, unknown>> : {};
  const next = { ...current };

  RECEPTION_COLUMNS.forEach((column) => {
    const savedWidth = input[column.key];
    if (typeof savedWidth === "number" && Number.isFinite(savedWidth)) {
      next[column.key] = clampColumnWidth(savedWidth, column);
    }
  });

  return next;
}

function matchesReceptionFilter(item: ReceptionItem, filter: ReceptionFilterKey) {
  if (filter === "pending-review") return !isReceived(item) || !isReviewed(item);
  if (filter === "reviewed-no-photos") return isReviewed(item) && item.fotosTomadas !== true;
  if (filter === "unpublished") {
    return (
      item.shopifyPublicado !== true ||
      item.marketplacePublicado !== true ||
      item.mercadoLibrePublicado !== true ||
      item.gruposFacebookPublicado !== true
    );
  }
  if (filter === "with-issue") return item.openNovedades.length > 0 || normalize(item.estado).includes("novedad") || hasBlockingReview(item);
  if (filter === "available") return normalize(item.estado) === "disponible" || item.disponibleVenta === true;
  return true;
}

function ModalShell({
  title,
  description,
  size = "default",
  children,
  onClose,
}: {
  title: string;
  description?: string;
  size?: "default" | "detail";
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const widthClass = size === "detail" ? "max-w-[min(96vw,1440px)]" : "max-w-lg";
  const bodyClass = size === "detail" ? "max-h-[calc(94vh-76px)] overflow-y-auto p-3 md:p-4" : "p-4";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-3 py-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={`w-full ${widthClass} overflow-hidden rounded-xl border border-[#3A3A36] bg-[#151613] shadow-2xl shadow-black/50`}>
        <div className="border-b border-[#30312D] px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-[#F5F5F5]">{title}</h3>
              {description ? <p className="mt-1 truncate text-sm leading-5 text-[#A7A7A7]">{description}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#3A3A36] bg-[#20211D] text-[#A7A7A7] transition hover:border-[#D7FF4F]/55 hover:text-[#F5F5F5]"
              aria-label="Cerrar modal"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className={bodyClass}>{children}</div>
      </div>
    </div>
  );
}

function ChecklistToggle({
  label,
  icon: Icon,
  checked,
  disabled,
  busy,
  help,
  onChange,
}: {
  label: string;
  icon: LucideIcon;
  checked: boolean;
  disabled?: boolean;
  busy?: boolean;
  help?: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label
      className={`relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-[11px] font-semibold leading-4 transition ${
        disabled
          ? "border-[#2A2A28] bg-[#121310] text-[#6E6F68]"
          : checked
            ? "border-[#D7FF4F]/50 bg-[#D7FF4F]/10 text-[#D7FF4F]"
            : "border-[#3A3A36] bg-[#171814] text-[#F5F5F5] hover:border-[#D7FF4F]/45"
      }`}
      title={help || label}
      aria-label={label}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled || busy}
        onChange={(event) => onChange(event.target.checked)}
        className="sr-only"
      />
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Icon className="h-4 w-4" aria-hidden="true" />}
    </label>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[#30312D] bg-[#11120F] px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-normal text-[#8F908A]">{label}</p>
      <p className="mt-0.5 text-lg font-semibold leading-none text-[#D7FF4F]">{value}</p>
    </div>
  );
}

function FilterGroup({
  label,
  values,
  selected,
  onChange,
}: {
  label: string;
  values: string[];
  selected: string;
  onChange: (value: string) => void;
}) {
  const options = [ALL, ...values];

  return (
    <div className="min-w-0 rounded-lg border border-[#30312D] bg-[#171814] p-2">
      <p className="text-[12px] font-bold uppercase tracking-normal text-[#8F908A]">{label}</p>
      <div className="mt-1 flex max-h-24 flex-wrap gap-1 overflow-y-auto pr-1">
        {options.map((value) => {
          const active = selected === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => onChange(value)}
              className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[12px] font-semibold transition ${
                active
                  ? "border-[#D7FF4F] bg-[#D7FF4F] text-[#151515] shadow-lg shadow-[#D7FF4F]/10"
                  : "border-[#3A3A36] bg-[#151613] text-[#D8D8D3] hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]"
              }`}
            >
              {value}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  active,
  children,
  onClick,
}: {
  label: string;
  active?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`flex h-8 min-w-8 items-center justify-center gap-1.5 rounded-lg border px-2 text-[12px] font-bold transition ${
        active
          ? "border-[#D7FF4F] bg-[#D7FF4F] text-[#151515]"
          : "border-[#3A3A36] bg-[#171814] text-[#A7A7A7] hover:border-[#D7FF4F]/55 hover:text-[#F5F5F5]"
      }`}
    >
      {children}
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}

function ToolbarMenuOption<TValue extends string>({
  option,
  active,
  onSelect,
}: {
  option: { value: TValue; label: string };
  active: boolean;
  onSelect: (value: TValue) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(option.value)}
      className={`flex min-h-9 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm font-semibold transition ${
        active
          ? "border-[#D7FF4F] bg-[#D7FF4F] text-[#151515]"
          : "border-[#30312D] bg-[#171814] text-[#F5F5F5] hover:border-[#D7FF4F]/45 hover:text-[#D7FF4F]"
      }`}
    >
      <span className="min-w-0 truncate">{option.label}</span>
      {active ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
    </button>
  );
}

function ActionButton({
  tone = "neutral",
  title,
  disabled,
  children,
  onClick,
}: {
  tone?: "neutral" | "lime" | "orange" | "blue";
  title: string;
  disabled?: boolean;
  children: ReactNode;
  onClick?: () => void;
}) {
  const toneClass = {
    neutral: "border-[#3A3A36] bg-[#20211D] text-[#F5F5F5] hover:border-[#D7FF4F]/55",
    lime: "border-[#D7FF4F] bg-[#D7FF4F]/15 text-[#D7FF4F] hover:bg-[#D7FF4F]/25",
    orange: "border-[#FF914D]/35 bg-[#FF914D]/10 text-[#FFB07A] hover:border-[#FF914D]",
    blue: "border-[#4FC3FF]/35 bg-[#4FC3FF]/10 text-[#BDEAFF] hover:border-[#4FC3FF]",
  }[tone];

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${toneClass}`}
    >
      {children}
    </button>
  );
}

function PhotoThumb({ item, onOpen }: { item: ReceptionItem; onOpen: (item: ReceptionItem) => void }) {
  const photo = getItemPhoto(item);
  const hasPhotos = item.fotos.length > 0;

  return (
    <div className="group relative h-11 w-11 overflow-hidden rounded-lg border border-[#3A3A36] bg-[#101010]">
      {photo ? (
        <img src={photo} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[9px] font-semibold text-[#6E6F68]">Sin foto</div>
      )}
      {hasPhotos ? (
        <button
          type="button"
          onClick={() => onOpen(item)}
          className="absolute inset-0 grid place-items-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/45 group-hover:opacity-100 group-focus-within:bg-black/45 group-focus-within:opacity-100"
          title="Ver fotos"
          aria-label={`Ver fotos de ${item.sku || item.nombre}`}
        >
          <span className="grid h-7 w-7 place-items-center rounded-full border border-white/25 bg-black/45 backdrop-blur">
            <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </button>
      ) : null}
    </div>
  );
}

function ColumnHeader({
  column,
  onResizeStart,
}: {
  column: ReceptionColumn;
  onResizeStart: (event: MouseEvent<HTMLElement>, column: ReceptionColumn) => void;
}) {
  return (
    <div
      className={`relative flex h-9 min-w-0 items-center border-b border-[#30312D] bg-[#20211D] px-2 text-[11px] font-bold uppercase tracking-normal text-[#8F908A] ${
        column.align === "right" ? "justify-end text-right" : column.align === "center" ? "justify-center text-center" : "justify-start text-left"
      }`}
    >
      <span className="block truncate">{column.label}</span>
      <span
        role="separator"
        aria-orientation="vertical"
        aria-label={`Redimensionar columna ${column.label}`}
        onMouseDown={(event) => onResizeStart(event, column)}
        className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none select-none after:absolute after:right-0 after:top-1/2 after:h-5 after:w-px after:-translate-y-1/2 after:bg-transparent after:transition hover:after:bg-[#D7FF4F]/70"
      />
    </div>
  );
}

function ReceptionItemRow({
  item,
  providerLabel,
  visibleColumns,
  columnWidths,
  columnTemplate,
  busyKey,
  onOpenDetail,
  onOpenPhotos,
  onChecklistChange,
  onPublish,
  onNovedad,
  onSkuLabel,
  onPrepareSheet,
  onPrintSheet,
}: {
  item: ReceptionItem;
  providerLabel: string;
  visibleColumns: ReceptionColumn[];
  columnWidths: ReceptionColumnWidths;
  columnTemplate: string;
  busyKey: string;
  onOpenDetail: (item: ReceptionItem) => void;
  onOpenPhotos: (item: ReceptionItem) => void;
  onChecklistChange: (item: ReceptionItem, action: ShippingV2RecepcionChecklistAction, value: boolean) => void;
  onPublish: (item: ReceptionItem) => void;
  onNovedad: (item: ReceptionItem) => void;
  onSkuLabel: (itemId: string) => void;
  onPrepareSheet: (itemId: string) => void;
  onPrintSheet: (item: ReceptionItem) => void;
}) {
  const received = isReceived(item);
  const reviewed = isReviewed(item);
  const publicacion = evaluarPublicacionItem({
    estado: item.estado,
    estadoRevision: item.estadoRevision,
    revisadoFisicamente: item.revisadoFisicamente,
    novedadesAbiertas: item.openNovedades.length,
  });
  const publicationBlock = publicacion.puede ? null : publicacion;
  const canPublish = received && publicacion.puede;
  const publishBusy = busyKey === `${item.id}:disponible`;
  const receivedGateHelp = "Marca primero Recibido.";
  const receivedHelp = received ? "Item recibido físicamente" : "Confirmar que el item llegó físicamente";
  const reviewHelp = reviewed
    ? `Revisado por ${item.revisadoPor?.trim() || "Sin registrar"} · ${formatDateTime(item.fechaRevision)}`
    : "Marcar como revisado física/técnicamente";
  const checklistChecked: Record<ShippingV2RecepcionChecklistAction, boolean> = {
    received,
    reviewed,
    "photos-taken": item.fotosTomadas === true,
    "published-shopify": item.shopifyPublicado === true,
    "published-marketplace": item.marketplacePublicado === true,
    "published-mercado-libre": item.mercadoLibrePublicado === true,
    "published-facebook": item.gruposFacebookPublicado === true,
  };

  function renderCell(column: ReceptionColumn) {
    if (column.key === "photo") {
      return <PhotoThumb item={item} onOpen={onOpenPhotos} />;
    }

    if (column.key === "item") {
      return (
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenDetail(item)}
            className="shrink-0 text-left text-xs font-black text-[#D7FF4F] transition hover:text-[#E6FF83] hover:underline"
          >
            {display(item.sku)}
          </button>
          <button
            type="button"
            onClick={() => onOpenDetail(item)}
            title={display(item.nombre)}
            className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-[#F5F5F5] transition hover:text-[#D7FF4F] hover:underline"
          >
            {display(item.nombre)}
          </button>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${stateTone(item.estado)}`}>{display(item.estado)}</span>
          {item.estadoRevision ? (
            <span className={`hidden shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold 2xl:inline-flex ${stateTone(item.estadoRevision)}`} title={item.estadoRevision}>
              {item.estadoRevision}
            </span>
          ) : null}
          {item.openNovedades.length ? (
            <span className="shrink-0 rounded-full border border-[#FF914D]/35 bg-[#FF914D]/10 px-2 py-0.5 text-[11px] font-semibold text-[#FFB07A]">
              {item.openNovedades.length}
            </span>
          ) : null}
        </div>
      );
    }

    if (column.key === "packing") {
      return <span title={display(item.packingLabel)}>{display(item.packingLabel)}</span>;
    }

    if (column.key === "quantity") {
      return (
        <span className="inline-flex min-w-8 justify-center rounded-full border border-[#D7FF4F]/30 bg-[#D7FF4F]/10 px-2 py-0.5 text-[12px] font-bold tabular-nums text-[#D7FF4F]">
          {formatShippingV2ItemQuantity(item)}
        </span>
      );
    }

    if (column.key === "provider") {
      return <span title={display(providerLabel)}>{display(providerLabel)}</span>;
    }

    if (column.key === "price") {
      return <span className="tabular-nums">{formatCurrency(item.precioVenta || item.precioVentaSugerido)}</span>;
    }

    if (column.key === "checklist") {
      return (
        <div className="flex min-w-0 items-center gap-1">
          {CHECKLIST_CONTROLS.map(({ action, label, icon }) => (
            <ChecklistToggle
              key={action}
              label={label}
              icon={icon}
              checked={checklistChecked[action]}
              disabled={action !== "received" && !received}
              busy={busyKey === `${item.id}:${action}`}
              help={action === "received" ? receivedHelp : action === "reviewed" && received ? reviewHelp : received ? label : receivedGateHelp}
              onChange={(value) => onChecklistChange(item, action, value)}
            />
          ))}
        </div>
      );
    }

    return (
      <div className="flex min-w-0 items-center gap-1">
        {canPublish ? (
          <ActionButton tone="lime" title={publishBusy ? "Publicando..." : "Listo para vender"} disabled={publishBusy} onClick={() => onPublish(item)}>
            {publishBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <PackageCheck className="h-3.5 w-3.5" aria-hidden="true" />}
          </ActionButton>
        ) : publicationBlock?.motivo === "ya-disponible" ? (
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 text-[#D7FF4F]" title="Disponible">
            <PackageCheck className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        ) : (
          <ActionButton tone="neutral" title={received ? publicationBlock?.detalle || receivedGateHelp : receivedGateHelp} disabled>
            <PackageCheck className="h-3.5 w-3.5" aria-hidden="true" />
          </ActionButton>
        )}
        <ActionButton tone="orange" title="Registrar novedad" onClick={() => onNovedad(item)}>
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        </ActionButton>
        <ActionButton title={received ? "Imprimir etiqueta SKU" : receivedGateHelp} disabled={!received} onClick={() => onSkuLabel(item.id)}>
          <Tag className="h-3.5 w-3.5" aria-hidden="true" />
        </ActionButton>
        <ActionButton tone="blue" title={received ? "Preparar ficha" : receivedGateHelp} disabled={!received} onClick={() => onPrepareSheet(item.id)}>
          <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
        </ActionButton>
        <ActionButton title={received ? "Imprimir ficha" : receivedGateHelp} disabled={!received} onClick={() => onPrintSheet(item)}>
          <Printer className="h-3.5 w-3.5" aria-hidden="true" />
        </ActionButton>
      </div>
    );
  }

  return (
    <article className="grid min-h-14 items-center border-b border-[#30312D]/80 bg-[#171814] text-xs text-[#F5F5F5] transition hover:bg-[#CFFF3A]/[0.045]" style={{ gridTemplateColumns: columnTemplate }}>
      {visibleColumns.map((column) => (
        <div
          key={column.key}
          className={`min-w-0 overflow-hidden px-2 py-1.5 ${
            column.align === "right" ? "text-right" : column.align === "center" ? "flex justify-center text-center" : ""
          }`}
        >
          {renderCell(column)}
        </div>
      ))}
    </article>
  );
}

export function ShippingV2RecepcionClient({ items: initialItems, packings, proveedores, novedades: initialNovedades, error, preferenceScope }: Props) {
  const [items, setItems] = useState(initialItems);
  const [novedades, setNovedades] = useState(initialNovedades);
  const [quickFilter, setQuickFilter] = useState<ReceptionFilterKey>(ALL);
  const [itemFilters, setItemFilters] = useState<ShippingV2ItemFilterState>(DEFAULT_ITEM_FILTERS);
  const [sortBy, setSortBy] = useState<ShippingV2ItemSortKey>(DEFAULT_SORT_BY);
  const [groupBy, setGroupBy] = useState<ShippingV2ItemGroupKey>(DEFAULT_GROUP_BY);
  const [columnWidths, setColumnWidths] = useState<ReceptionColumnWidths>(() => createDefaultColumnWidths());
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [toolbarMenuOpen, setToolbarMenuOpen] = useState<ToolbarMenuKey | null>(null);
  const [busyKey, setBusyKey] = useState("");
  const [message, setMessage] = useState("");
  const [novedadItem, setNovedadItem] = useState<ReceptionItem | null>(null);
  const [photoItem, setPhotoItem] = useState<ReceptionItem | null>(null);
  const [detailItemId, setDetailItemId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<DetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [novedadForm, setNovedadForm] = useState({ tipo: NOVEDAD_TYPES[0], descripcion: "", evidenciaUrl: "" });
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  const preferenceKey = useMemo(() => makePreferenceKey(preferenceScope), [preferenceScope]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(preferenceKey);
      if (stored) {
        const parsed = JSON.parse(stored) as {
          quickFilter?: unknown;
          itemFilters?: unknown;
          sortBy?: unknown;
          groupBy?: unknown;
          columnWidths?: unknown;
        };
        if (isReceptionFilterKey(parsed.quickFilter)) setQuickFilter(parsed.quickFilter);
        setItemFilters(sanitizeStoredFilters(parsed.itemFilters));
        if (isSortKey(parsed.sortBy)) setSortBy(parsed.sortBy);
        if (isGroupKey(parsed.groupBy)) setGroupBy(parsed.groupBy);
        setColumnWidths((current) => sanitizeStoredColumnWidths(parsed.columnWidths, current));
      }
    } catch {
      window.localStorage.removeItem(preferenceKey);
    } finally {
      setPreferencesLoaded(true);
    }
  }, [preferenceKey]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    window.localStorage.setItem(preferenceKey, JSON.stringify({ quickFilter, itemFilters, sortBy, groupBy, columnWidths }));
  }, [columnWidths, groupBy, itemFilters, preferenceKey, preferencesLoaded, quickFilter, sortBy]);

  useEffect(() => {
    return () => {
      resizeCleanupRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (!toolbarMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && toolbarRef.current?.contains(target)) return;
      setToolbarMenuOpen(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setToolbarMenuOpen(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [toolbarMenuOpen]);

  const packingByItemId = useMemo(() => {
    const map = new Map<string, ShippingV2Packing>();
    for (const packing of packings) {
      for (const itemId of packing.itemIds) map.set(itemId, packing);
    }
    return map;
  }, [packings]);

  const receptionItems = useMemo<ReceptionItem[]>(() => {
    const resolved = resolveShippingV2Items(items, proveedores);
    return resolved.map((item) => {
      const packing = packingByItemId.get(item.id) || packings.find((candidate) => candidate.id === item.packingId);
      const relatedNovedades = novedades.filter((novedad) => novedad.itemId === item.id || novedad.itemIds.includes(item.id));
      return {
        ...item,
        packing,
        packingLabel: packing?.packingId || item.packingId || "",
        openNovedades: relatedNovedades.filter(isOpenNovedad),
      };
    });
  }, [items, novedades, packingByItemId, packings, proveedores]);

  const filterOptions = useMemo(() => getShippingV2ItemFilterOptions(receptionItems), [receptionItems]);
  const filteredByItemControls = useMemo(() => filterShippingV2Items(receptionItems, itemFilters), [itemFilters, receptionItems]);
  const filtered = useMemo(() => filteredByItemControls.filter((item) => matchesReceptionFilter(item, quickFilter)), [filteredByItemControls, quickFilter]);
  const sortedItems = useMemo(() => sortShippingV2Items(filtered, sortBy), [filtered, sortBy]);
  const groupedItems = useMemo(() => groupShippingV2Items(sortedItems, groupBy), [groupBy, sortedItems]);
  const selectedDetailFallback = useMemo(() => receptionItems.find((item) => item.id === detailItemId) || null, [detailItemId, receptionItems]);
  const contextHiddenColumns = useMemo(() => {
    const hidden = new Set<ReceptionColumnKey>();
    if (groupBy === "packing") hidden.add("packing");
    if (groupBy === "proveedor-compra" || itemFilters.proveedorCompra !== ALL) hidden.add("provider");
    return hidden;
  }, [groupBy, itemFilters.proveedorCompra]);
  const visibleColumns = useMemo(() => RECEPTION_COLUMNS.filter((column) => !contextHiddenColumns.has(column.key)), [contextHiddenColumns]);
  const tableWidth = useMemo(() => visibleColumns.reduce((total, column) => total + columnWidths[column.key], 0), [columnWidths, visibleColumns]);
  const columnTemplate = useMemo(() => visibleColumns.map((column) => column.key === "item" ? `minmax(${columnWidths[column.key]}px, 1fr)` : `${columnWidths[column.key]}px`).join(" "), [columnWidths, visibleColumns]);

  const stats = {
    total: receptionItems.length,
    pending: receptionItems.filter((item) => !isReceived(item) || !isReviewed(item)).length,
    issues: receptionItems.filter((item) => item.openNovedades.length > 0 || hasBlockingReview(item)).length,
    available: receptionItems.filter((item) => normalize(item.estado) === "disponible" || item.disponibleVenta === true).length,
  };

  const activeItemFilterCount = [itemFilters.estado, itemFilters.tipoOperacion, itemFilters.proveedorCompra, itemFilters.tipoItem].filter((value) => value !== ALL).length;
  const activeFilterCount = activeItemFilterCount + (quickFilter === ALL ? 0 : 1);
  const sortLabel = shippingV2ItemSortOptions.find((option) => option.value === sortBy)?.label ?? "Más nuevos primero";
  const groupLabel = shippingV2ItemGroupOptions.find((option) => option.value === groupBy)?.label ?? "Sin agrupar";
  const visibleGroupCount = groupBy === "none" ? 0 : groupedItems.length;
  const contextChips = [
    itemFilters.proveedorCompra !== ALL ? `Proveedor: ${itemFilters.proveedorCompra}` : "",
    groupBy !== "none" ? `Agrupado por: ${groupLabel}` : "",
    contextHiddenColumns.has("packing") ? "Columna Packing oculta por contexto" : "",
    contextHiddenColumns.has("provider") ? "Columna Proveedor oculta por contexto" : "",
  ].filter(Boolean);

  const closeDetail = useCallback(() => {
    setDetailItemId(null);
    setDetailData(null);
    setDetailError("");
  }, []);

  useEffect(() => {
    if (!detailItemId) return;
    let cancelled = false;
    setDetailLoading(true);
    setDetailError("");
    setDetailData(null);

    fetch(`/api/shipping-v2/items/${encodeURIComponent(detailItemId)}/detail`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) {
          throw new Error(String(payload.error || "No se pudo cargar el detalle del item."));
        }
        return payload.data as DetailPayload;
      })
      .then((data) => {
        if (!cancelled) setDetailData(data);
      })
      .catch((loadError) => {
        if (!cancelled) setDetailError(loadError instanceof Error ? loadError.message : "Error inesperado.");
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [detailItemId]);

  function updateItemFilter<K extends keyof ShippingV2ItemFilterState>(key: K, value: ShippingV2ItemFilterState[K]) {
    setItemFilters((current) => ({ ...current, [key]: value }));
  }

  function resetFilters() {
    setQuickFilter(ALL);
    setItemFilters(DEFAULT_ITEM_FILTERS);
  }

  function resetColumnWidths() {
    setColumnWidths(createDefaultColumnWidths());
  }

  function startColumnResize(event: MouseEvent<HTMLElement>, column: ReceptionColumn) {
    event.preventDefault();
    event.stopPropagation();
    resizeCleanupRef.current?.();

    const startX = event.clientX;
    const startWidth = columnWidths[column.key];
    const originalUserSelect = document.body.style.userSelect;
    const originalCursor = document.body.style.cursor;

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    const handleMouseMove = (moveEvent: globalThis.MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const nextWidth = clampColumnWidth(startWidth + delta, column);
      setColumnWidths((current) => ({ ...current, [column.key]: nextWidth }));
    };

    const cleanup = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", cleanup);
      document.body.style.userSelect = originalUserSelect;
      document.body.style.cursor = originalCursor;
      resizeCleanupRef.current = null;
    };

    resizeCleanupRef.current = cleanup;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", cleanup);
  }

  function openDetail(item: ReceptionItem) {
    setDetailItemId(item.id);
  }

  function handleDetailSaved(updatedItem: ShippingV2Item) {
    setItems((current) => current.map((currentItem) => currentItem.id === updatedItem.id ? updatedItem : currentItem));
    setDetailData((current) => {
      if (!current || current.item.id !== updatedItem.id) return current;
      return {
        ...current,
        item: resolveShippingV2Items([updatedItem], current.proveedores)[0],
      };
    });
  }

  function handlePhotoViewerUpdated(updatedItem: ShippingV2Item) {
    setItems((current) => current.map((currentItem) => currentItem.id === updatedItem.id ? updatedItem : currentItem));
    setPhotoItem((current) => current && current.id === updatedItem.id
      ? { ...current, ...updatedItem, openNovedades: current.openNovedades, packing: current.packing, packingLabel: current.packingLabel }
      : current);
  }

  async function updateChecklist(item: ReceptionItem, action: ShippingV2RecepcionChecklistAction, value: boolean) {
    const key = `${item.id}:${action}`;
    setBusyKey(key);
    setMessage("");
    try {
      const response = await fetch(`/api/shipping-v2/recepcion/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, value }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(String(payload.error || "No se pudo actualizar el checklist."));
      const updated = payload.data as ShippingV2Item;
      setItems((current) => current.map((currentItem) => currentItem.id === updated.id ? updated : currentItem));
      if (detailData?.item.id === updated.id) {
        setDetailData((current) => current ? { ...current, item: resolveShippingV2Items([updated], current.proveedores)[0] } : current);
      }
    } catch (mutationError) {
      setMessage(mutationError instanceof Error ? mutationError.message : "Error inesperado.");
    } finally {
      setBusyKey("");
    }
  }

  // Publica el item como listo para vender. Las condiciones se evalúan también
  // en el servidor; acá se usan solo para deshabilitar el botón y explicar por qué.
  async function publicarItem(item: ReceptionItem) {
    const key = `${item.id}:disponible`;
    setBusyKey(key);
    setMessage("");
    try {
      const response = await fetch(`/api/shipping-v2/recepcion/items/${item.id}/disponible`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(String(payload.error || "No se pudo publicar el artículo."));
      const updated = payload.data as ShippingV2Item;
      setItems((current) => current.map((currentItem) => (currentItem.id === updated.id ? updated : currentItem)));
      setMessage(`${updated.sku || updated.nombre} quedó disponible para la venta.`);
    } catch (mutationError) {
      setMessage(mutationError instanceof Error ? mutationError.message : "Error inesperado.");
    } finally {
      setBusyKey("");
    }
  }

  async function saveNovedad() {
    if (!novedadItem) return;
    setBusyKey(`${novedadItem.id}:novedad`);
    setMessage("");
    try {
      const response = await fetch(`/api/shipping-v2/recepcion/items/${novedadItem.id}/novedades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...novedadForm, packingId: novedadItem.packing?.id || "" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(String(payload.error || "No se pudo registrar la novedad."));
      const updated = payload.data as ShippingV2Item;
      setItems((current) => current.map((currentItem) => currentItem.id === updated.id ? updated : currentItem));
      if (payload.novedad) setNovedades((current) => [payload.novedad as ShippingV2Novedad, ...current]);
      setNovedadForm({ tipo: NOVEDAD_TYPES[0], descripcion: "", evidenciaUrl: "" });
      setNovedadItem(null);
    } catch (mutationError) {
      setMessage(mutationError instanceof Error ? mutationError.message : "Error inesperado.");
    } finally {
      setBusyKey("");
    }
  }

  return (
    <div className="w-full space-y-2.5">
      <section className="rounded-xl border border-[#30312D] bg-[#151613] px-3 py-2 shadow-xl shadow-black/20">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#F5F5F5]">Recepción</h2>
            <p className="mt-0.5 text-sm text-[#A7A7A7]">Revisión física, preparación comercial y novedades de items recibidos.</p>
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <Metric label="Items" value={stats.total} />
            <Metric label="Pendientes" value={stats.pending} />
            <Metric label="Novedades" value={stats.issues} />
            <Metric label="Disponibles" value={stats.available} />
          </div>
        </div>
      </section>

      {error ? <div className="rounded-xl border border-[#FF914D]/35 bg-[#FF914D]/10 px-3 py-2.5 text-sm text-[#FFB07A]">{error}</div> : null}
      {message ? <div className="rounded-xl border border-[#FF914D]/35 bg-[#FF914D]/10 px-3 py-2.5 text-sm text-[#FFB07A]">{message}</div> : null}

      <section className="rounded-xl border border-[#30312D] bg-[#11120F] px-2 py-1.5 shadow-xl shadow-black/15">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex max-w-full flex-none flex-wrap items-center gap-1">
            {receptionFilters.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setQuickFilter(item.key)}
                title={item.label}
                className={`h-7 shrink-0 whitespace-nowrap rounded-lg border px-2.5 text-[12px] font-bold leading-none transition ${
                  quickFilter === item.key
                    ? "border-[#D7FF4F] bg-[#D7FF4F] text-[#151515]"
                    : "border-[#3A3A36] bg-[#171814] text-[#A7A7A7] hover:border-[#D7FF4F]/55 hover:text-[#F5F5F5]"
                }`}
              >
                {item.shortLabel}
              </button>
            ))}
          </div>

          <div className="ml-auto flex min-w-0 flex-1 basis-[520px] flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <label className="relative block min-w-[260px] flex-1 sm:max-w-[420px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6E6F68]" aria-hidden="true" />
              <input
                value={itemFilters.search}
                onChange={(event) => updateItemFilter("search", event.target.value)}
                placeholder="Buscar SKU, item, proveedor o packing"
                className="h-8 w-full rounded-lg border border-[#3A3A36] bg-[#151515] pl-8 pr-3 text-[13px] text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70"
              />
            </label>

            <div ref={toolbarRef} className="relative flex shrink-0 items-center gap-1">
              <ToolbarButton label="Filtrar" active={activeFilterCount > 0} onClick={() => setToolbarMenuOpen((current) => current === "filters" ? null : "filters")}>
                <ListFilter className="h-4 w-4" aria-hidden="true" />
                {activeFilterCount ? <span className="rounded-full bg-[#151515] px-1.5 text-[10px] text-[#D7FF4F]">{activeFilterCount}</span> : null}
              </ToolbarButton>
              <ToolbarButton label="Ordenar" active={sortBy !== DEFAULT_SORT_BY} onClick={() => setToolbarMenuOpen((current) => current === "sort" ? null : "sort")}>
                <ArrowDownAZ className="h-4 w-4" aria-hidden="true" />
              </ToolbarButton>
              <ToolbarButton label="Agrupar" active={groupBy !== DEFAULT_GROUP_BY} onClick={() => setToolbarMenuOpen((current) => current === "group" ? null : "group")}>
                <Rows3 className="h-4 w-4" aria-hidden="true" />
              </ToolbarButton>

              {toolbarMenuOpen ? (
                <div
                  className={`absolute right-0 top-full z-30 mt-2 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-[#30312D] bg-[#11120F] shadow-2xl shadow-black/45 ${
                    toolbarMenuOpen === "filters" ? "w-[min(92vw,680px)]" : "w-[min(92vw,320px)]"
                  }`}
                >
                  {toolbarMenuOpen === "filters" ? (
                    <>
                      <div className="flex items-center justify-between gap-3 border-b border-[#30312D] px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#F5F5F5]">Filtros</p>
                          <p className="mt-0.5 text-[12px] text-[#8F908A]">{activeFilterCount ? `${activeFilterCount} activos` : "Sin filtros activos"}</p>
                        </div>
                        <button
                          type="button"
                          onClick={resetFilters}
                          disabled={!activeFilterCount && !itemFilters.search}
                          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[#3A3A36] bg-[#151613] px-2.5 text-[12px] font-semibold text-[#A7A7A7] transition hover:border-[#D7FF4F]/45 hover:text-[#D7FF4F] disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                          Limpiar
                        </button>
                      </div>
                      <div className="grid gap-2 p-2 sm:grid-cols-2">
                        <FilterGroup label="Estado Item" values={filterOptions.estados} selected={itemFilters.estado} onChange={(value) => updateItemFilter("estado", value)} />
                        <FilterGroup label="Tipo de operación" values={filterOptions.operaciones} selected={itemFilters.tipoOperacion} onChange={(value) => updateItemFilter("tipoOperacion", value)} />
                        <FilterGroup label="Proveedor compra" values={filterOptions.proveedores} selected={itemFilters.proveedorCompra} onChange={(value) => updateItemFilter("proveedorCompra", value)} />
                        <FilterGroup label="Rol general del item" values={filterOptions.tipos} selected={itemFilters.tipoItem} onChange={(value) => updateItemFilter("tipoItem", value)} />
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
                        {shippingV2ItemSortOptions.map((option) => (
                          <ToolbarMenuOption
                            key={option.value}
                            option={option}
                            active={sortBy === option.value}
                            onSelect={(value) => {
                              setSortBy(value);
                              setToolbarMenuOpen(null);
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
                        {shippingV2ItemGroupOptions.map((option) => (
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
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-[#30312D] bg-[#11120F] p-2 shadow-xl shadow-black/15">
        <div className="mb-2 flex flex-col gap-1.5 px-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-[#F5F5F5]">Items de recepción</h3>
            <p className="text-[12px] text-[#8F908A]">
              Mostrando {sortedItems.length} de {receptionItems.length}
              {visibleGroupCount ? ` · Grupos: ${visibleGroupCount}` : ""}
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-[#30312D] bg-[#171814] px-2.5 py-1 text-[12px] font-semibold text-[#8F908A]">Orden: {sortLabel}</span>
            <span className="rounded-full border border-[#30312D] bg-[#171814] px-2.5 py-1 text-[12px] font-semibold text-[#8F908A]">Grupo: {groupLabel}</span>
            <button
              type="button"
              onClick={resetColumnWidths}
              className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-[#3A3A36] bg-[#171814] px-2.5 text-[12px] font-semibold text-[#A7A7A7] transition hover:border-[#D7FF4F]/55 hover:text-[#D7FF4F]"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Reset anchos
            </button>
          </div>
        </div>

        {contextChips.length ? (
          <div className="mb-2 flex flex-wrap gap-1.5 px-1">
            {contextChips.map((chip) => (
              <span key={chip} className="rounded-full border border-[#D7FF4F]/25 bg-[#D7FF4F]/10 px-2.5 py-1 text-[11px] font-semibold text-[#D7FF4F]">
                {chip}
              </span>
            ))}
          </div>
        ) : null}

        <div className="max-w-full overflow-x-auto overflow-y-visible rounded-lg border border-[#30312D] bg-[#171814]">
          <div className="w-full" style={{ minWidth: tableWidth }}>
            <div className="sticky top-0 z-30 grid" style={{ gridTemplateColumns: columnTemplate }}>
              {visibleColumns.map((column) => (
                <ColumnHeader key={column.key} column={column} onResizeStart={startColumnResize} />
              ))}
            </div>
            {sortedItems.length ? groupedItems.map((group) => (
              <div key={group.key}>
                {groupBy !== "none" ? (
                  <div className="sticky top-9 z-20 flex min-h-10 items-center justify-between gap-3 border-b border-[#30312D] bg-[#1E1F1C] px-3 py-2 shadow-lg shadow-black/20">
                    <span className="min-w-0 truncate text-sm font-semibold text-[#F5F5F5]">{group.label}</span>
                    <span className="rounded-full border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 px-2.5 py-0.5 text-[12px] font-semibold text-[#D7FF4F]">{group.items.length} items</span>
                  </div>
                ) : null}
                {group.items.map((item) => (
                  <ReceptionItemRow
                    key={item.id}
                    item={item}
                    providerLabel={item.proveedorCompraDisplay || item.proveedorNombre || ""}
                    visibleColumns={visibleColumns}
                    columnWidths={columnWidths}
                    columnTemplate={columnTemplate}
                    busyKey={busyKey}
                    onOpenDetail={openDetail}
                    onOpenPhotos={setPhotoItem}
                    onChecklistChange={(currentItem, action, value) => void updateChecklist(currentItem, action, value)}
                    onPublish={(currentItem) => void publicarItem(currentItem)}
                    onNovedad={setNovedadItem}
                    onSkuLabel={openSkuLabel}
                    onPrepareSheet={openTechnicalSheetEditor}
                    onPrintSheet={openTechnicalSheet}
                  />
                ))}
              </div>
            )) : (
              <div className="px-3 py-8 text-center text-sm text-[#A7A7A7]">
                No hay items para los filtros seleccionados.
              </div>
            )}
          </div>
        </div>
      </section>

      {photoItem ? (
        <ModalShell
          size="detail"
          title={`Fotos · ${photoItem.sku || photoItem.nombre}`}
          description={`${photoItem.fotos.length} foto${photoItem.fotos.length === 1 ? "" : "s"} disponibles`}
          onClose={() => setPhotoItem(null)}
        >
          <ItemPhotoViewer
            itemId={photoItem.id}
            itemName={photoItem.nombre}
            fotos={photoItem.fotos}
            onUpdated={handlePhotoViewerUpdated}
            canEdit={false}
            density="immersive"
          />
        </ModalShell>
      ) : null}

      {novedadItem ? (
        <ModalShell title="Registrar novedad" description={`${novedadItem.sku} · ${novedadItem.nombre}`} onClose={() => setNovedadItem(null)}>
          <div className="grid gap-3">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-normal text-[#A7A7A7]">Tipo de novedad</span>
              <select value={novedadForm.tipo} onChange={(event) => setNovedadForm((current) => ({ ...current, tipo: event.target.value }))} className="mt-2 h-10 w-full rounded-lg border border-[#3A3A36] bg-[#101010] px-3 text-sm font-semibold text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70">
                {NOVEDAD_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-normal text-[#A7A7A7]">Descripción</span>
              <textarea value={novedadForm.descripcion} onChange={(event) => setNovedadForm((current) => ({ ...current, descripcion: event.target.value }))} className="mt-2 min-h-28 w-full resize-y rounded-lg border border-[#3A3A36] bg-[#101010] px-3 py-2 text-sm text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-normal text-[#A7A7A7]">Evidencia URL</span>
              <input value={novedadForm.evidenciaUrl} onChange={(event) => setNovedadForm((current) => ({ ...current, evidenciaUrl: event.target.value }))} placeholder="Opcional" className="mt-2 h-10 w-full rounded-lg border border-[#3A3A36] bg-[#101010] px-3 text-sm text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70" />
            </label>
          </div>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" disabled={Boolean(busyKey)} onClick={() => setNovedadItem(null)} className="h-9 rounded-lg border border-[#3A3A36] bg-[#20211D] px-3 text-sm font-semibold text-[#F5F5F5] transition hover:border-[#D7FF4F]/45 disabled:opacity-50">Cancelar</button>
            <button type="button" disabled={Boolean(busyKey) || !novedadForm.descripcion.trim()} onClick={() => void saveNovedad()} className="h-9 rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-3 text-sm font-bold text-[#151515] transition hover:brightness-105 disabled:opacity-50">{busyKey.endsWith(":novedad") ? "Guardando..." : "Guardar novedad"}</button>
          </div>
        </ModalShell>
      ) : null}

      {detailItemId ? (
        <ModalShell
          size="detail"
          title={detailData?.item.nombre || selectedDetailFallback?.nombre || "Detalle de item"}
          description={`${display(detailData?.item.sku || selectedDetailFallback?.sku)} · Detalle compartido con Shipping Items`}
          onClose={closeDetail}
        >
          {detailLoading ? (
            <div className="flex min-h-64 items-center justify-center rounded-xl border border-[#30312D] bg-[#11120F] text-sm font-semibold text-[#A7A7A7]">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              Cargando detalle...
            </div>
          ) : detailError ? (
            <div className="rounded-xl border border-[#FF914D]/35 bg-[#FF914D]/10 px-4 py-3 text-sm text-[#FFB07A]">{detailError}</div>
          ) : detailData ? (
            <ShippingV2ItemDetailView
              item={detailData.item}
              proveedores={detailData.proveedores}
              pago={detailData.pago}
              packing={detailData.packing}
              novedades={detailData.novedades}
              esAdmin={detailData.esAdmin}
              permissions={detailData.permissions}
              onSaved={handleDetailSaved}
            />
          ) : null}
        </ModalShell>
      ) : null}
    </div>
  );
}
