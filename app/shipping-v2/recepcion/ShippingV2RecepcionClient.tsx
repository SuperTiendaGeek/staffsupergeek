"use client";

import { CopyableSKU } from "@/components/ui/copyable-sku";
import Link from "next/link";
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { RegistrarNovedadModal } from "@/components/shipping-v2/novedades/RegistrarNovedadModal";
import { GestorPublicacionesModal } from "@/components/shipping-v2/publicaciones/GestorPublicacionesModal";
import { canalDeAccion, CANALES_EN_GESTOR, type CanalPublicacion } from "@/lib/shipping-v2/publicaciones";
import { avanceDeInspeccion } from "@/lib/shipping-v2/revision-tecnica-snapshot";
import {
  AlertTriangle,
  ArrowDownAZ,
  ChevronRight,
  BadgeCheck,
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
import { useAlCambiarArticulo, useFichaArticulo, useIntencionFicha } from "@/components/shipping-v2/ficha-articulo/contexto";
import type { ResolvedItem } from "../items/ShippingV2ItemsClient";
import { evaluarVentaItem } from "@/lib/shipping-v2/item-venta";
import { agruparItemsPorSku, unidadPorDefecto, type GrupoSku } from "@/lib/shipping-v2/items-por-sku";
import { evaluarDisponibilidadComercial } from "@/lib/shipping-v2/item-comercial";
import { esNovedadBloqueante, isNovedadAbierta } from "@/lib/shipping-v2/novedades";
import { unidadesLibres } from "@/lib/shipping-v2/unidades";
import { getShippingV2FacebookPublicationBlockReason } from "@/lib/shipping-v2/facebook-super-geek-text";
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
import { rutaUnidad } from "@/lib/shipping-v2/unidades-serie";
import type {
  ShippingV2Item,
  ShippingV2Novedad,
  ShippingV2Packing,
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
  /**
   * Punto 9 · fase 2 (15-oct): Recepción abierta desde Logística con solo una
   * caja (?packing=<id>, "Recibir artículos") o un artículo (?articulo=<id>).
   */
  filtro?: { packingId?: string; articuloId?: string };
};

type ReceptionItem = ResolvedItem & {
  packing?: ShippingV2Packing;
  packingLabel: string;
  openNovedades: ShippingV2Novedad[];
};

const ALL = SHIPPING_V2_ALL_FILTER;
// "v2" (15-oct-2026, rediseño compacto): columnas nuevas; se empieza de cero una vez.
const RECEPTION_PREFS_VERSION = "v2";
const DEFAULT_SORT_BY: ShippingV2ItemSortKey = "newest";
const DEFAULT_GROUP_BY: ShippingV2ItemGroupKey = "none";
const DEFAULT_ITEM_FILTERS: ShippingV2ItemFilterState = {
  search: "",
  estado: ALL,
  tipoOperacion: ALL,
  proveedorCompra: ALL,
  tipoItem: ALL,
  categoria: ALL,
};

// Rediseño 15-oct-2026 (mismo estilo que Artículos): packing y proveedor van
// en la segunda línea del artículo, así la tabla cabe en ~1000 px.
type ReceptionColumnKey = "photo" | "item" | "quantity" | "price" | "checklist" | "actions";

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
  { key: "photo", label: "Foto", defaultWidth: 48, minWidth: 44, maxWidth: 72, required: true, align: "center" },
  { key: "item", label: "Artículo", defaultWidth: 300, minWidth: 240, required: true },
  { key: "quantity", label: "Cant.", defaultWidth: 52, minWidth: 46, maxWidth: 84, align: "center" },
  { key: "price", label: "Precio", defaultWidth: 84, minWidth: 72, maxWidth: 130, align: "right" },
  { key: "checklist", label: "Recibir · revisar · fotos · publicar", defaultWidth: 268, minWidth: 262, maxWidth: 330, align: "center" },
  { key: "actions", label: "Acciones", defaultWidth: 172, minWidth: 168, maxWidth: 230 },
];

const CHECKLIST_CONTROLS: Array<{ action: ShippingV2RecepcionChecklistAction; label: string; icon: LucideIcon }> = [
  { action: "received", label: "Recibido", icon: PackageOpen },
  // "reviewed" NO está aquí a propósito: ese dato lo firma la pantalla de
  // inspección técnica, no un clic suelto. En su lugar, la celda dibuja el
  // botón que la abre, y su color dice en qué punto va.
  { action: "photos-taken", label: "Fotos tomadas", icon: Camera },
  { action: "published-shopify", label: "Shopify", icon: ShoppingBag },
  { action: "published-marketplace", label: "Marketplace", icon: Store },
  { action: "published-mercado-libre", label: "Mercado Libre", icon: Tags },
  { action: "published-facebook", label: "Grupos Facebook", icon: Megaphone },
  { action: "facebook-super-geek", label: "Facebook Super Geek", icon: BadgeCheck },
];

const receptionFilterKeys = [ALL, "pending-review", "reviewed-no-photos", "unpublished", "with-issue", "available"] as const;
type ReceptionFilterKey = (typeof receptionFilterKeys)[number];

const receptionFilters: Array<{ key: ReceptionFilterKey; label: string; shortLabel: string }> = [
  { key: ALL, label: "Todo lo que está en Recepción", shortLabel: "Todos" },
  { key: "pending-review", label: "Falta recibir o firmar la inspección", shortLabel: "Pendientes" },
  { key: "reviewed-no-photos", label: "Revisados, falta tomar fotos", shortLabel: "Sin fotos" },
  { key: "unpublished", label: "Falta alguna publicación", shortLabel: "Sin publicar" },
  { key: "with-issue", label: "Con novedad abierta o revisión con problema", shortLabel: "Novedad" },
  { key: "available", label: "Se pueden vender hoy", shortLabel: "Disponibles" },
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
  return isNovedadAbierta(novedad.estado);
}

function isReviewed(item: ShippingV2Item) {
  return item.revisadoFisicamente === true;
}

/** Inspección pendiente: la requiere y todavía no está firmada. */
function needsInspection(item: ShippingV2Item) {
  return item.requiereInspeccion === true && !isReviewed(item);
}

function evaluarVentaRecepcion(item: ReceptionItem) {
  return evaluarVentaItem({
    estado: item.estado,
    estadoRevision: item.estadoRevision,
    usoLocal: item.usoLocal,
    novedadesAbiertas: novedadesBloqueantes(item),
    recibido: item.recibido,
    requiereInspeccion: item.requiereInspeccion,
    inspeccionFirmada: item.revisadoFisicamente,
  });
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

// Punto 10b-4: inspección y ficha viven en el artículo; desde aquí "volver" regresa a Recepción.
function openTechnicalSheetEditor(item: ShippingV2Item) {
  window.location.href = rutaUnidad(item, "ficha", { desde: "recepcion" });
}

function openInspeccion(item: ShippingV2Item) {
  window.location.href = rutaUnidad(item, "inspeccion", { desde: "recepcion" });
}

function openTechnicalSheet(item: ShippingV2Item) {
  const generada = isFichaGenerada(item);
  const path = generada
    ? rutaUnidad(item, "ficha/print", { imprimir: true })
    : rutaUnidad(item, "ficha", { desde: "recepcion" });
  window.open(path, generada ? "_blank" : "_self", "noopener,noreferrer");
}

/** Novedades abiertas que de verdad impiden vender el artículo. */
function novedadesBloqueantes(item: ReceptionItem) {
  return item.openNovedades.filter((novedad) => esNovedadBloqueante(novedad)).length;
}

function stateTone(state: string) {
  const normalized = normalize(state);
  if (normalized.includes("disponible") || normalized.includes("recibido correctamente")) return "border-[#D7FF4F]/35 bg-[#D7FF4F]/10 text-[#D7FF4F]";
  if (normalized.includes("revision") || normalized.includes("recibido")) return "border-[#4FC3FF]/35 bg-[#4FC3FF]/10 text-[#BDEAFF]";
  if (normalized.includes("novedad") || normalized.includes("danado") || normalized.includes("faltante") || normalized.includes("garantia")) return "border-[#FF914D]/35 bg-[#FF914D]/10 text-[#FFB07A]";
  return "border-[#3A3A36] bg-[#151515] text-[#A7A7A7]";
}

/**
 * Estado COMERCIAL del artículo, separado de su etapa logística.
 *
 * "En revisión" y "Disponible" son etapas del mismo campo en Airtable, así que
 * un artículo en revisión se veía como no vendible aunque sí lo fuera. Este
 * chip responde la pregunta que de verdad importa en tienda: ¿lo puedo apartar
 * o vender ahora mismo? Ver lib/shipping-v2/item-comercial.ts.
 */
function ComercialChip({ item }: { item: ReceptionItem }) {
  const disponibilidad = evaluarDisponibilidadComercial({
    estado: item.estado,
    estadoRevision: item.estadoRevision,
    usoLocal: item.usoLocal,
    // Solo las novedades BLOQUEANTES sacan el artículo de la venta. Una
    // "Observación menor" abierta no debe marcarlo como no vendible: se vende
    // con observación, que es justo para lo que existe ese tipo. Contar todas
    // hacía que la pantalla dijera "No vendible" mientras el servidor lo tenía
    // como disponible — dos verdades distintas para el mismo artículo.
    novedadesAbiertas: novedadesBloqueantes(item),
  });

  if (!disponibilidad.apartable) {
    return (
      <span
        className="shrink-0 rounded-full border border-[#FF914D]/35 bg-[#FF914D]/10 px-1.5 py-px text-[10.5px] font-semibold leading-4 text-[#FFB07A]"
        title={disponibilidad.detalle}
      >
        No vendible
      </span>
    );
  }

  const libres = unidadesLibres(item);
  if (libres <= 0) {
    return (
      <span
        className="shrink-0 rounded-full border border-[#8B73FF]/35 bg-[#8B73FF]/10 px-1.5 py-px text-[10.5px] font-semibold leading-4 text-[#C9BFFF]"
        title="El artículo está bien, pero todas sus unidades están apartadas o vendidas."
        >
        Sin unidades libres
      </span>
    );
  }

  return (
    <span
      className="shrink-0 rounded-full border border-[#7BE495]/35 bg-[#7BE495]/10 px-1.5 py-px text-[10.5px] font-semibold leading-4 text-[#9FEFB3]"
      title="Se puede apartar o vender ahora, esté donde esté el artículo."
    >
      Apartable{libres > 1 ? ` · ${libres}` : ""}
    </span>
  );
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
    categoria: sanitizeString(input.categoria, ALL),
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
  if (filter === "pending-review") return !isReceived(item) || needsInspection(item);
  if (filter === "reviewed-no-photos") return isReceived(item) && !needsInspection(item) && item.fotosTomadas !== true;
  if (filter === "unpublished") {
    return (
      item.shopifyPublicado !== true ||
      item.marketplacePublicado !== true ||
      item.mercadoLibrePublicado !== true ||
      item.gruposFacebookPublicado !== true ||
      item.facebookSuperGeek !== true
    );
  }
  if (filter === "with-issue") return item.openNovedades.length > 0 || normalize(item.estado).includes("novedad") || hasBlockingReview(item);
  // "Disponibles" = se pueden vender hoy (llegaron y, si aplica, inspeccionados).
  if (filter === "available") return evaluarVentaRecepcion(item).vendible;
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
  description?: ReactNode;
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
      className={`relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-[11px] font-semibold leading-4 transition ${
        checked
          ? "border-[#D7FF4F]/50 bg-[#D7FF4F]/10 text-[#D7FF4F]"
          : disabled
            ? "border-[#2A2A28] bg-[#121310] text-[#6E6F68]"
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
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
    </label>
  );
}

/**
 * Abre la inspección técnica, y de paso dice en qué punto va.
 *
 * Tres estados, porque una inspección abandonada a la mitad no puede verse
 * igual que una que nadie empezó:
 *
 *   verde  → firmada, con nombre y fecha en el tooltip
 *   ámbar  → alguien la empezó y la dejó a medias
 *   apagado → sin empezar
 *
 * No es una casilla: no se marca ni se desmarca desde aquí. Ese dato lo firma
 * la pantalla de inspección, con todos sus puntos resueltos.
 */
function BotonInspeccion({
  avance,
  recibido,
  requiere,
  revisadoPor,
  fechaRevision,
  onClick,
}: {
  avance: "firmada" | "en-proceso" | "sin-empezar";
  recibido: boolean;
  /** false = el artículo no pasa por Inspección (un cable, un cargador). */
  requiere: boolean;
  revisadoPor?: string;
  fechaRevision?: string;
  onClick: () => void;
}) {
  if (!requiere && avance !== "firmada") {
    const ayudaNoAplica = "No requiere inspección técnica. Si la necesita, marca “Requiere inspección” en la ficha del artículo.";
    return (
      <span
        title={ayudaNoAplica}
        aria-label={ayudaNoAplica}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-dashed border-[#2A2A28] text-[10px] font-bold text-[#6E6F68]"
      >
        N/A
      </span>
    );
  }

  const tono = !recibido
    ? "border-[#2A2A28] bg-[#121310] text-[#6E6F68]"
    : avance === "firmada"
      ? "border-[#D7FF4F]/50 bg-[#D7FF4F]/10 text-[#D7FF4F] hover:border-[#D7FF4F]"
      : avance === "en-proceso"
        ? "border-[#F4C95B]/55 bg-[#F4C95B]/10 text-[#F4C95B] hover:border-[#F4C95B]"
        : "border-[#3A3A36] bg-[#171814] text-[#F5F5F5] hover:border-[#D7FF4F]/45";

  const ayuda = !recibido
    ? "Marca primero Recibido."
    : avance === "firmada"
      ? `Inspección firmada por ${revisadoPor?.trim() || "Sin registrar"} · ${formatDateTime(fechaRevision)}. Abrir para consultarla.`
      : avance === "en-proceso"
        ? "Inspección técnica empezada y sin terminar. Abrir para continuarla."
        : "Abrir inspección técnica";

  return (
    <button
      type="button"
      disabled={!recibido}
      onClick={onClick}
      title={ayuda}
      aria-label={ayuda}
      className={`relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition disabled:cursor-not-allowed ${tono}`}
    >
      <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
      {recibido && avance === "en-proceso" ? (
        <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[#F4C95B]" aria-hidden="true" />
      ) : null}
    </button>
  );
}

/** Selector compacto de filtro (Todos = sin filtro). */
function FiltroSelect({ etiqueta, valor, opciones, onChange }: { etiqueta: string; valor: string; opciones: string[]; onChange: (valor: string) => void }) {
  const activo = valor !== ALL;
  return (
    <select
      value={valor}
      onChange={(event) => onChange(event.target.value)}
      aria-label={etiqueta}
      className={`h-8 w-full cursor-pointer rounded-md border bg-[#10110F] px-2 text-[12.5px] font-semibold outline-none focus:ring-2 focus:ring-[#D7FF4F]/35 ${activo ? "border-[#D7FF4F]/60 text-[#D7FF4F]" : "border-[#3A3A36] text-[#B4B5AC]"}`}
    >
      <option value={ALL}>{etiqueta}: {/(a|ón)$/.test(etiqueta) ? "todas" : "todos"}</option>
      {opciones.map((opcion) => <option key={opcion} value={opcion}>{opcion}</option>)}
    </select>
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
      aria-label={label}
      className={`relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition focus:outline-none focus:ring-2 focus:ring-[#D7FF4F]/35 ${
        active
          ? "border-[#D7FF4F]/55 bg-[#D7FF4F]/10 text-[#D7FF4F]"
          : "border-[#3A3A36] bg-[#10110F] text-[#A7A7A7] hover:border-[#D7FF4F]/45 hover:text-[#D7FF4F]"
      }`}
    >
      {children}
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
      className={`flex items-center justify-between gap-3 rounded-md border px-2 py-1.5 text-left text-[13px] font-semibold transition ${
        active
          ? "border-[#D7FF4F]/45 bg-[#D7FF4F]/10 text-[#F5F5F5]"
          : "border-transparent text-[#A7A7A7] hover:border-[#3A3A36] hover:bg-[#171814] hover:text-[#F5F5F5]"
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
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${toneClass}`}
    >
      {children}
    </button>
  );
}

function PhotoThumb({ item, onOpen }: { item: ReceptionItem; onOpen: (item: ReceptionItem) => void }) {
  const photo = getItemPhoto(item);
  const hasPhotos = item.fotos.length > 0;

  return (
    <div className="group relative h-9 w-9 overflow-hidden rounded-md border border-[#3A3A36] bg-[#101010]">
      {photo ? (
        <img src={photo} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[8.5px] font-semibold leading-none text-[#6E6F68]">Sin foto</div>
      )}
      {hasPhotos ? (
        <button
          type="button"
          onClick={() => onOpen(item)}
          className="absolute inset-0 grid place-items-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/45 group-hover:opacity-100 group-focus-within:bg-black/45 group-focus-within:opacity-100"
          title="Ver fotos"
          aria-label={`Ver fotos de ${item.sku || item.nombre}`}
        >
          <span className="grid h-6 w-6 place-items-center rounded-full border border-white/25 bg-black/45 backdrop-blur">
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
      className={`relative flex h-8 min-w-0 items-center border-b border-[#2E2F28] bg-[#1A1B17] px-2 text-[10.5px] font-semibold uppercase tracking-wide text-[#8F908A] ${
        column.align === "right" ? "justify-end text-right" : column.align === "center" ? "justify-center text-center" : "justify-start text-left"
      }`}
    >
      <span className="block truncate">{column.label}</span>
      <span
        role="separator"
        aria-orientation="vertical"
        aria-label={`Redimensionar columna ${column.label}`}
        onMouseDown={(event) => onResizeStart(event, column)}
        className="absolute right-0 top-0 h-full w-2 cursor-col-resize touch-none select-none after:absolute after:right-0 after:top-1/2 after:h-4 after:w-px after:-translate-y-1/2 after:bg-[#30312D] after:transition hover:after:h-6 hover:after:bg-[#D7FF4F]/70"
      />
    </div>
  );
}


/**
 * Una fila de recepción. Va envuelta en memo a propósito.
 *
 * Con ~175 artículos visibles, cada fila pinta 8 casillas de checklist y 5
 * botones de acción. Sin memo, CUALQUIER cambio de estado del componente padre
 * (escribir en el buscador, abrir un modal, marcar una casilla de otra fila)
 * repintaba las 175 filas enteras y la pantalla se sentía pesada.
 *
 * Para que memo sirva, los callbacks que recibe deben ser estables: por eso el
 * padre los define con useCallback y no como funciones en línea.
 */
const ReceptionItemRow = memo(function ReceptionItemRow({
  item,
  providerLabel,
  visibleColumns,
  columnWidths,
  columnTemplate,
  busyKey,
  onOpenDetail,
  onOpenPhotos,
  onChecklistChange,
  onNovedad,
  onSkuLabel,
  onPrepareSheet,
  onInspeccion,
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
  onNovedad: (item: ReceptionItem) => void;
  onSkuLabel: (itemId: string) => void;
  onPrepareSheet: (item: ReceptionItem) => void;
  onInspeccion: (item: ReceptionItem) => void;
  onPrintSheet: (item: ReceptionItem) => void;
}) {
  const received = isReceived(item);
  const reviewed = isReviewed(item);
  const intencion = useIntencionFicha();
  const avanceInspeccion = avanceDeInspeccion(item.revisionTecnicaDetalle, reviewed);
  // Ya no hay botón "Listo para vender": el sistema deja el artículo a la
  // venta solo cuando llega (y se firma su inspección, si la requiere). Aquí
  // solo se MUESTRA si hoy se puede vender y, si no, por qué.
  const venta = evaluarVentaRecepcion(item);
  const receivedGateHelp = "Marca primero Recibido.";
  const receivedHelp = received ? "Item recibido físicamente" : "Confirmar que el item llegó físicamente";
  const facebookSuperGeekBlockReason = item.facebookSuperGeek === true
    ? "Publicación ya activada; no se puede desactivar desde el sistema."
    : getShippingV2FacebookPublicationBlockReason(item);
  const checklistChecked: Record<ShippingV2RecepcionChecklistAction, boolean> = {
    received,
    reviewed,
    "photos-taken": item.fotosTomadas === true,
    "published-shopify": item.shopifyPublicado === true,
    "published-marketplace": item.marketplacePublicado === true,
    "published-mercado-libre": item.mercadoLibrePublicado === true,
    "published-facebook": item.gruposFacebookPublicado === true,
    "facebook-super-geek": item.facebookSuperGeek === true,
  };

  function renderCell(column: ReceptionColumn) {
    if (column.key === "photo") {
      return <PhotoThumb item={item} onOpen={onOpenPhotos} />;
    }

    if (column.key === "item") {
      // Dos líneas: SKU y nombre; debajo, estado, si se puede apartar, revisión,
      // novedades y de qué caja y proveedor viene.
      const origen = [item.packingLabel, providerLabel].map((valor) => valor.trim()).filter(Boolean).join(" · ");
      return (
        <div className="min-w-0">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <button
              type="button"
              onClick={() => onOpenDetail(item)}
              onMouseEnter={() => intencion.alEntrar(item.id)}
              onMouseLeave={intencion.alSalir}
              className="shrink-0 text-left text-[12px] font-bold text-[#D7FF4F] transition hover:underline"
            >
              {display(item.sku)}
            </button>
            <button
              type="button"
              onClick={() => onOpenDetail(item)}
              onMouseEnter={() => intencion.alEntrar(item.id)}
              onMouseLeave={intencion.alSalir}
              title={display(item.nombre)}
              className="min-w-0 flex-1 truncate text-left text-[12.5px] font-medium text-[#F5F5F5] transition hover:text-[#D7FF4F]"
            >
              {display(item.nombre)}
            </button>
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1">
            <span
              className={`shrink-0 rounded-full border px-1.5 py-px text-[10.5px] font-semibold leading-4 ${stateTone(item.estado)}`}
              title="Etapa logística: dónde está el artículo. No decide si se puede vender."
            >
              {display(item.estado)}
            </span>
            <ComercialChip item={item} />
            {item.estadoRevision && normalize(item.estadoRevision) !== "recibido correctamente" && normalize(item.estadoRevision) !== "no aplica" ? (
              <span className={`shrink-0 rounded-full border px-1.5 py-px text-[10.5px] font-semibold leading-4 ${stateTone(item.estadoRevision)}`} title={`Revisión: ${item.estadoRevision}`}>
                {item.estadoRevision}
              </span>
            ) : null}
            {item.openNovedades.length ? (
              <span className="shrink-0 rounded-full border border-[#FF914D]/35 bg-[#FF914D]/10 px-1.5 py-px text-[10.5px] font-semibold leading-4 text-[#FFB07A]" title="Novedades abiertas">
                {item.openNovedades.length} novedad{item.openNovedades.length === 1 ? "" : "es"}
              </span>
            ) : null}
            {origen ? <span className="min-w-0 truncate text-[11px] text-[#8F908A]" title={origen}>{origen}</span> : null}
          </div>
        </div>
      );
    }

    if (column.key === "quantity") {
      return <span className="text-[12.5px] font-bold tabular-nums text-[#D7FF4F]">{formatShippingV2ItemQuantity(item)}</span>;
    }

    if (column.key === "price") {
      return <span className="text-[12.5px] tabular-nums text-[#E6E6E1]">{formatCurrency(item.precioVenta || item.precioVentaSugerido)}</span>;
    }

    if (column.key === "checklist") {
      return (
        <div className="flex min-w-0 items-center justify-center gap-1">
          {CHECKLIST_CONTROLS.map(({ action, label, icon }, indice) => {
            const blockedByReceipt = action !== "received" && !received;
            const blockedByFacebookText = action === "facebook-super-geek" && Boolean(facebookSuperGeekBlockReason);
            const help = action === "received"
              ? receivedHelp
              : blockedByReceipt
                ? receivedGateHelp
                : blockedByFacebookText
                  ? facebookSuperGeekBlockReason
                  : label;

            return (
              <Fragment key={action}>
                <ChecklistToggle
                  label={label}
                  icon={icon}
                  checked={checklistChecked[action]}
                  disabled={blockedByReceipt || blockedByFacebookText}
                  busy={busyKey === `${item.id}:${action}`}
                  help={help}
                  onChange={(value) => onChecklistChange(item, action, value)}
                />
                {/* Va justo después de "Recibido": es el paso siguiente. */}
                {indice === 0 ? (
                  <BotonInspeccion
                    avance={avanceInspeccion}
                    recibido={received}
                    requiere={item.requiereInspeccion === true}
                    revisadoPor={item.revisadoPor}
                    fechaRevision={item.fechaRevision}
                    onClick={() => onInspeccion(item)}
                  />
                ) : null}
              </Fragment>
            );
          })}
        </div>
      );
    }

    return (
      <div className="flex min-w-0 items-center gap-1">
        {venta.vendible ? (
          <span
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 text-[#D7FF4F]"
            title="En la tienda: se puede vender"
            aria-label="En la tienda: se puede vender"
          >
            <PackageCheck className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        ) : (
          <span
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#2A2A28] bg-[#121310] text-[#6E6F68]"
            title={`Todavía no se vende: ${venta.detalle}`}
            aria-label={`Todavía no se vende: ${venta.detalle}`}
          >
            <PackageCheck className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        )}
        <ActionButton tone="orange" title="Registrar novedad" onClick={() => onNovedad(item)}>
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        </ActionButton>
        <ActionButton title={received ? "Imprimir etiqueta SKU" : receivedGateHelp} disabled={!received} onClick={() => onSkuLabel(item.id)}>
          <Tag className="h-3.5 w-3.5" aria-hidden="true" />
        </ActionButton>
        <ActionButton tone="blue" title={received ? "Preparar ficha" : receivedGateHelp} disabled={!received} onClick={() => onPrepareSheet(item)}>
          <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
        </ActionButton>
        <ActionButton title={received ? "Imprimir ficha" : receivedGateHelp} disabled={!received} onClick={() => onPrintSheet(item)}>
          <Printer className="h-3.5 w-3.5" aria-hidden="true" />
        </ActionButton>
      </div>
    );
  }

  return (
    <article className="grid min-h-11 items-center border-b border-[#24251F] bg-[#171814] text-xs text-[#F5F5F5] transition hover:bg-[#D7FF4F]/[0.04]" style={{ gridTemplateColumns: columnTemplate }}>
      {visibleColumns.map((column) => (
        <div
          key={column.key}
          className={`min-w-0 overflow-hidden px-2 py-1 ${
            column.align === "right" ? "text-right" : column.align === "center" ? "flex justify-center text-center" : ""
          }`}
        >
          {renderCell(column)}
        </div>
      ))}
    </article>
  );
})

/**
 * Punto 18b (25-oct-2026): una fila por SKU. Muestra cuánto llegó y cuánto
 * falta de sus registros; cada registro se trabaja en su propia fila (la
 * flecha los muestra), como siempre.
 */
function ReceptionGroupRow({
  grupo,
  abierto,
  visibleColumns,
  columnTemplate,
  onToggle,
  onOpenDetail,
  onOpenPhotos,
}: {
  grupo: GrupoSku<ReceptionItem>;
  abierto: boolean;
  visibleColumns: ReceptionColumn[];
  columnTemplate: string;
  onToggle: () => void;
  onOpenDetail: (item: ReceptionItem) => void;
  onOpenPhotos: (item: ReceptionItem) => void;
}) {
  const { principal, items } = grupo;
  const total = items.length;
  const recibidos = items.filter(isReceived).length;
  const porInspeccionar = items.filter((item) => item.requiereInspeccion === true && !isReviewed(item)).length;
  const conFotos = items.filter((item) => item.fotosTomadas === true).length;
  const novedades = items.reduce((suma, item) => suma + item.openNovedades.length, 0);
  const estados = [...new Set(items.map((item) => item.estado))];
  const precios = [...new Set(items.map((item) => item.precioVenta || item.precioVentaSugerido || 0))];
  const unidadAbrir = unidadPorDefecto(items) ?? principal;
  const abrirUnidad = () => onOpenDetail(unidadAbrir);
  const intencion = useIntencionFicha();
  const cantidad = new Intl.NumberFormat("es-EC", { maximumFractionDigits: Number.isInteger(grupo.cantidad) ? 0 : 2 }).format(grupo.cantidad);
  const chip = "shrink-0 rounded-full border px-1.5 py-px text-[10.5px] font-semibold leading-4";

  function renderCell(column: ReceptionColumn) {
    if (column.key === "photo") return <PhotoThumb item={principal} onOpen={onOpenPhotos} />;
    if (column.key === "item") {
      return (
        <div className="min-w-0">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={abierto}
              aria-label={abierto ? `Ocultar los ${total} registros` : `Ver los ${total} registros`}
              title={abierto ? "Ocultar registros" : `Ver los ${total} registros de este SKU`}
              className="grid h-4 w-4 shrink-0 self-center place-items-center rounded text-[#8F908A] transition hover:text-[#D7FF4F] focus:outline-none focus:ring-1 focus:ring-[#D7FF4F]/50"
            >
              <ChevronRight className={`h-3.5 w-3.5 transition-transform duration-150 ${abierto ? "rotate-90" : ""}`} aria-hidden="true" />
            </button>
            <button type="button" onClick={abrirUnidad} onMouseEnter={() => intencion.alEntrar(unidadAbrir.id)} onMouseLeave={intencion.alSalir} className="shrink-0 text-left text-[12px] font-bold text-[#D7FF4F] transition hover:underline">
              {display(principal.sku)}
            </button>
            <button type="button" onClick={abrirUnidad} onMouseEnter={() => intencion.alEntrar(unidadAbrir.id)} onMouseLeave={intencion.alSalir} title={display(principal.nombre)} className="min-w-0 flex-1 truncate text-left text-[12.5px] font-medium text-[#F5F5F5] transition hover:text-[#D7FF4F]">
              {display(principal.nombre)}
            </button>
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1 pl-5">
            {estados.length === 1 ? (
              <span className={`${chip} ${stateTone(estados[0])}`}>{display(estados[0])}</span>
            ) : (
              <span className={`${chip} border-[#3A3A36] text-[#B4B5AC]`} title={estados.join(" · ")}>{estados.length} estados</span>
            )}
            <span className="shrink-0 text-[11px] text-[#8F908A]">{total} registros</span>
            {novedades ? (
              <span className={`${chip} border-[#FF914D]/35 bg-[#FF914D]/10 text-[#FFB07A]`} title="Novedades abiertas en sus registros">
                {novedades} novedad{novedades === 1 ? "" : "es"}
              </span>
            ) : null}
          </div>
        </div>
      );
    }
    if (column.key === "quantity") {
      return <span className="text-[12.5px] font-bold tabular-nums text-[#D7FF4F]" title={`Suma de ${total} registros`}>{cantidad}</span>;
    }
    if (column.key === "price") {
      return precios.length === 1
        ? <span className="text-[12.5px] tabular-nums text-[#E6E6E1]">{formatCurrency(principal.precioVenta || principal.precioVentaSugerido)}</span>
        : <span className="text-[12px] text-[#8F908A]">Varios</span>;
    }
    if (column.key === "checklist") {
      // El avance del SKU; cada paso se marca en la fila de su registro.
      return (
        <div className="flex min-w-0 items-center justify-center gap-2 text-[11.5px] tabular-nums text-[#B4B5AC]">
          <span title="Registros que ya llegaron" className={recibidos === total ? "font-semibold text-[#D7FF4F]" : ""}>Recibidos {recibidos}/{total}</span>
          {porInspeccionar ? <span title="Esperan la firma de su inspección" className="text-[#FFB07A]">Por inspeccionar {porInspeccionar}</span> : null}
          <span title="Registros con fotos tomadas">Fotos {conFotos}/{total}</span>
        </div>
      );
    }
    return (
      <button type="button" onClick={onToggle} className="text-[11.5px] font-semibold text-[#8F908A] transition hover:text-[#D7FF4F]">
        {abierto ? "Ocultar registros" : "Ver registros"}
      </button>
    );
  }

  return (
    <article className="grid min-h-11 items-center border-b border-[#24251F] bg-[#171814] text-xs text-[#F5F5F5] transition hover:bg-[#D7FF4F]/[0.04]" style={{ gridTemplateColumns: columnTemplate }}>
      {visibleColumns.map((column) => (
        <div
          key={column.key}
          className={`min-w-0 overflow-hidden px-2 py-1 ${
            column.align === "right" ? "text-right" : column.align === "center" ? "flex justify-center text-center" : ""
          }`}
        >
          {renderCell(column)}
        </div>
      ))}
    </article>
  );
}

export function ShippingV2RecepcionClient({ items: initialItems, packings, proveedores, novedades: initialNovedades, error, preferenceScope, filtro }: Props) {
  const conFiltro = Boolean(filtro?.packingId || filtro?.articuloId);
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
  // Punto 10d: las casillas de Marketplace y Grupos Facebook abren el gestor de publicaciones.
  const [gestor, setGestor] = useState<{ item: ReceptionItem; canal: CanalPublicacion; action: ShippingV2RecepcionChecklistAction } | null>(null);
  const [photoItem, setPhotoItem] = useState<ReceptionItem | null>(null);
  // Punto 18 (25-oct): la ficha se abre en la ventana única de Shipping V2.
  const ficha = useFichaArticulo();
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  const preferenceKey = useMemo(() => makePreferenceKey(preferenceScope), [preferenceScope]);
  const guardadoRef = useRef<{ quickFilter?: unknown; itemFilters?: unknown }>({});

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
        // Con una caja o artículo elegido desde Logística se ve todo lo de esa caja:
        // el filtro guardado no se aplica (ni se pisa; ver abajo).
        guardadoRef.current = { quickFilter: parsed.quickFilter, itemFilters: parsed.itemFilters };
        if (!conFiltro) {
          if (isReceptionFilterKey(parsed.quickFilter)) setQuickFilter(parsed.quickFilter);
          setItemFilters(sanitizeStoredFilters(parsed.itemFilters));
        }
        if (isSortKey(parsed.sortBy)) setSortBy(parsed.sortBy);
        if (isGroupKey(parsed.groupBy)) setGroupBy(parsed.groupBy);
        setColumnWidths((current) => sanitizeStoredColumnWidths(parsed.columnWidths, current));
      }
    } catch {
      window.localStorage.removeItem(preferenceKey);
    } finally {
      setPreferencesLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferenceKey]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    const filtros = conFiltro ? guardadoRef.current : { quickFilter, itemFilters };
    window.localStorage.setItem(preferenceKey, JSON.stringify({ ...filtros, sortBy, groupBy, columnWidths }));
  }, [columnWidths, conFiltro, groupBy, itemFilters, preferenceKey, preferencesLoaded, quickFilter, sortBy]);

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

  const todosLosItems = useMemo<ReceptionItem[]>(() => {
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

  // Fase 2: solo la caja (o el artículo) que se abrió desde Logística.
  const packingFiltrado = filtro?.packingId ? packings.find((p) => p.id === filtro.packingId) ?? null : null;
  const receptionItems = useMemo(() => {
    if (filtro?.packingId) return todosLosItems.filter((item) => item.packing?.id === filtro.packingId || item.packingId === filtro.packingId);
    if (filtro?.articuloId) return todosLosItems.filter((item) => item.id === filtro.articuloId);
    return todosLosItems;
  }, [filtro?.articuloId, filtro?.packingId, todosLosItems]);
  const recibidosFiltro = receptionItems.filter(isReceived).length;

  const filterOptions = useMemo(() => getShippingV2ItemFilterOptions(receptionItems), [receptionItems]);
  const filteredByItemControls = useMemo(() => filterShippingV2Items(receptionItems, itemFilters), [itemFilters, receptionItems]);
  const filtered = useMemo(() => filteredByItemControls.filter((item) => matchesReceptionFilter(item, quickFilter)), [filteredByItemControls, quickFilter]);
  const sortedItems = useMemo(() => sortShippingV2Items(filtered, sortBy), [filtered, sortBy]);
  const groupedItems = useMemo(() => groupShippingV2Items(sortedItems, groupBy), [groupBy, sortedItems]);
  // Punto 18b: dentro de cada grupo, una fila por SKU.
  const gruposSku = useMemo(() => new Map(groupedItems.map((group) => [group.key, agruparItemsPorSku(group.items)])), [groupedItems]);
  const [skusAbiertos, setSkusAbiertos] = useState<ReadonlySet<string>>(() => new Set());
  const alternarSku = useCallback((clave: string) => {
    setSkusAbiertos((actual) => {
      const siguiente = new Set(actual);
      if (siguiente.has(clave)) siguiente.delete(clave);
      else siguiente.add(clave);
      return siguiente;
    });
  }, []);
  const visibleColumns = RECEPTION_COLUMNS;
  const tableWidth = useMemo(() => visibleColumns.reduce((total, column) => total + columnWidths[column.key], 0), [columnWidths, visibleColumns]);
  const columnTemplate = useMemo(() => visibleColumns.map((column) => column.key === "item" ? `minmax(${columnWidths[column.key]}px, 1fr)` : `${columnWidths[column.key]}px`).join(" "), [columnWidths, visibleColumns]);

  // Rediseño 15-oct-2026: cada atajo dice cuántos tiene (antes eran 4 cifras aparte).
  const conteos = useMemo(() => Object.fromEntries(
    receptionFilters.map((filtroRapido) => [filtroRapido.key, filteredByItemControls.filter((item) => matchesReceptionFilter(item, filtroRapido.key)).length])
  ) as Record<ReceptionFilterKey, number>, [filteredByItemControls]);

  const activeFilterCount = [itemFilters.categoria ?? ALL, itemFilters.estado, itemFilters.tipoOperacion, itemFilters.proveedorCompra, itemFilters.tipoItem].filter((value) => value !== ALL).length;
  const hayFiltros = activeFilterCount > 0 || Boolean(itemFilters.search.trim()) || quickFilter !== ALL;
  const sortLabel = shippingV2ItemSortOptions.find((option) => option.value === sortBy)?.label ?? "Más nuevos primero";
  const groupLabel = shippingV2ItemGroupOptions.find((option) => option.value === groupBy)?.label ?? "Sin agrupar";
  const visibleGroupCount = groupBy === "none" ? 0 : groupedItems.length;

  // Lo que se cambie en la ficha se refleja en la fila (sin recargar la lista).
  useAlCambiarArticulo(({ id }) => {
    fetch(`/api/shipping-v2/items/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((response) => response.json().catch(() => ({})))
      .then((payload) => {
        if (payload?.success && payload.data) handleDetailSaved(payload.data as ShippingV2Item);
      })
      .catch(() => undefined);
  });

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

  // openDetail también se pasa a las filas memoizadas: sin ref estable, cada
  // render la recrearía y anularía el memo.
  const openDetailRef = useRef<(item: ReceptionItem) => void>(() => {});
  const handleOpenDetail = useCallback((item: ReceptionItem) => {
    openDetailRef.current(item);
  }, []);

  function openDetail(item: ReceptionItem) {
    if (ficha) ficha.abrir(item.id);
    else window.location.assign(`/shipping-v2/items/${encodeURIComponent(item.id)}`);
  }
  openDetailRef.current = openDetail;

  function handleDetailSaved(updatedItem: ShippingV2Item) {
    setItems((current) => current.map((currentItem) => currentItem.id === updatedItem.id ? { ...currentItem, ...updatedItem } : currentItem));
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
      // El servidor cierra solo el ciclo del packing cuando esta casilla era
      // la última que faltaba. Se avisa aquí para que el usuario se entere sin
      // tener que ir a la pantalla de packings a comprobarlo.
      const cerrados = updated.packingsCerradosAutomaticamente ?? [];
      if (cerrados.length) {
        setMessage(
          cerrados.length === 1
            ? `Ciclo cerrado: el packing ${cerrados[0]} completó todos sus artículos.`
            : `Ciclo cerrado en ${cerrados.length} packings: ${cerrados.join(", ")}.`
        );
      }
    } catch (mutationError) {
      setMessage(mutationError instanceof Error ? mutationError.message : "Error inesperado.");
    } finally {
      setBusyKey("");
    }
  }

  // Referencias ESTABLES para las filas memoizadas.
  //
  // Si se pasaran funciones en línea, cada render crearía funciones nuevas, las
  // props de cada fila cambiarían siempre y memo no serviría de nada.
  //
  // Se usa un ref y NO un useCallback con dependencias vacías: estas funciones
  // leen estado del componente (detailData, por ejemplo) y un closure con []
  // congelaría el valor de la primera render, rompiendo la sincronización del
  // modal de detalle. El ref siempre apunta a la versión actual.
  const updateChecklistRef = useRef(updateChecklist);
  updateChecklistRef.current = updateChecklist;

  const handleChecklistChange = useCallback(
    (item: ReceptionItem, action: ShippingV2RecepcionChecklistAction, value: boolean) => {
      const canal = canalDeAccion(action);
      if (canal && CANALES_EN_GESTOR.includes(canal) && item.sku) {
        setGestor({ item, canal, action });
        return;
      }
      void updateChecklistRef.current(item, action, value);
    },
    []
  );



  return (
    <div className="w-full space-y-2.5">
      {conFiltro ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-[#4FC3FF]/40 bg-[#4FC3FF]/[0.07] px-3 py-1.5 text-[13px] text-[#BDEAFF]">
          {filtro?.packingId ? (
            <>
              <span>Caja <b className="text-[#F5F5F5]">{packingFiltrado?.packingId ?? "—"}</b>{packingFiltrado?.nombre?.trim() ? ` · ${packingFiltrado.nombre.trim()}` : ""}</span>
              {receptionItems.length ? <span>· <b className="tabular-nums text-[#F5F5F5]">{recibidosFiltro} de {receptionItems.length}</b> recibidos</span> : null}
              {packingFiltrado ? <Link href={`/shipping-v2/packings/${packingFiltrado.id}`} className="font-semibold text-[#D7FF4F] hover:underline">Ver caja</Link> : null}
            </>
          ) : (
            <span>Artículo <b className="text-[#F5F5F5]">{receptionItems[0]?.sku ?? "—"}</b>{receptionItems[0]?.nombre ? ` · ${receptionItems[0].nombre}` : ""}</span>
          )}
          {!receptionItems.length ? (
            <span className="text-[#F4C95B]">
              {packingFiltrado && normalize(packingFiltrado.estado) === "en transito"
                ? "Esta caja todavía no se marcó como llegada: márcala en Logística."
                : "No tiene artículos con trabajo pendiente en Recepción."}
            </span>
          ) : null}
          <Link href="/shipping-v2/recepcion" className="ml-auto rounded-md border border-[#4FC3FF]/50 px-2.5 py-0.5 text-[12px] font-semibold text-[#BDEAFF] hover:bg-[#4FC3FF]/10">Ver todo</Link>
        </div>
      ) : null}

      {error ? <div className="rounded-xl border border-[#FF914D]/35 bg-[#FF914D]/10 px-3 py-2.5 text-sm text-[#FFB07A]">{error}</div> : null}
      {message ? <div className="rounded-xl border border-[#FF914D]/35 bg-[#FF914D]/10 px-3 py-2.5 text-sm text-[#FFB07A]">{message}</div> : null}

      {/* Una sola barra (como Artículos): atajos con su conteo, buscar, filtrar, ordenar, agrupar y anchos. */}
      <section className="relative z-40 flex flex-wrap items-center gap-1.5 rounded-lg border border-[#2E2F28] bg-[#151613] p-1.5">
        <div role="tablist" className="inline-flex max-w-full overflow-x-auto rounded-md border border-[#3A3A36]">
          {receptionFilters.map((item) => {
            const on = quickFilter === item.key;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setQuickFilter(item.key)}
                title={item.label}
                className={`h-8 whitespace-nowrap border-r border-[#3A3A36] px-2.5 text-[12.5px] font-semibold transition last:border-r-0 ${on ? "bg-[#D7FF4F] text-[#151515]" : "bg-[#151515] text-[#B4B5AC] hover:text-[#D7FF4F]"}`}
              >
                {item.shortLabel} <span className={`tabular-nums ${on ? "" : "text-[#8F908A]"}`}>{conteos[item.key]}</span>
              </button>
            );
          })}
        </div>

        <label className="relative block min-w-[11rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#D7FF4F]" aria-hidden="true" />
          <input
            value={itemFilters.search}
            onChange={(event) => updateItemFilter("search", event.target.value)}
            placeholder="Buscar: laptops hp, SKU, packing, proveedor…"
            className="h-8 w-full rounded-md border border-[#3A3A36] bg-[#10110F] pl-8 pr-3 text-[13px] text-[#F5F5F5] outline-none placeholder:text-[#696A64] focus:border-[#D7FF4F]/70"
          />
        </label>

        <div ref={toolbarRef} className="relative z-50 flex shrink-0 items-center gap-1">
          <ToolbarButton label="Filtrar" active={activeFilterCount > 0} onClick={() => setToolbarMenuOpen((current) => current === "filters" ? null : "filters")}>
            <ListFilter className="h-4 w-4" aria-hidden="true" />
            {activeFilterCount ? <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#D7FF4F] px-1 text-[10px] font-black text-[#151515]">{activeFilterCount}</span> : null}
          </ToolbarButton>
          <ToolbarButton label={`Ordenar: ${sortLabel}`} active={sortBy !== DEFAULT_SORT_BY} onClick={() => setToolbarMenuOpen((current) => current === "sort" ? null : "sort")}>
            <ArrowDownAZ className="h-4 w-4" aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton label={`Agrupar: ${groupLabel}`} active={groupBy !== DEFAULT_GROUP_BY} onClick={() => setToolbarMenuOpen((current) => current === "group" ? null : "group")}>
            <Rows3 className="h-4 w-4" aria-hidden="true" />
          </ToolbarButton>
          <ToolbarButton label="Restablecer anchos de columna" onClick={resetColumnWidths}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
          </ToolbarButton>

          {toolbarMenuOpen ? (
            <div
              className={`absolute right-0 top-full z-50 mt-1.5 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-[#30312D] bg-[#11120F] shadow-2xl shadow-black/45 ${
                toolbarMenuOpen === "filters" ? "w-[min(92vw,260px)]" : "w-[min(92vw,300px)]"
              }`}
            >
              {toolbarMenuOpen === "filters" ? (
                <div className="grid gap-1.5 p-2">
                  <FiltroSelect etiqueta="Categoría" valor={itemFilters.categoria ?? ALL} opciones={filterOptions.categorias} onChange={(value) => updateItemFilter("categoria", value)} />
                  <FiltroSelect etiqueta="Estado" valor={itemFilters.estado} opciones={filterOptions.estados} onChange={(value) => updateItemFilter("estado", value)} />
                  <FiltroSelect etiqueta="Operación" valor={itemFilters.tipoOperacion} opciones={filterOptions.operaciones} onChange={(value) => updateItemFilter("tipoOperacion", value)} />
                  <FiltroSelect etiqueta="Proveedor" valor={itemFilters.proveedorCompra} opciones={filterOptions.proveedores} onChange={(value) => updateItemFilter("proveedorCompra", value)} />
                  {hayFiltros ? (
                    <button
                      type="button"
                      onClick={() => { resetFilters(); setToolbarMenuOpen(null); }}
                      className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-[#3A3A36] text-[11.5px] font-semibold text-[#A7A7A7] transition hover:border-[#D7FF4F]/45 hover:text-[#D7FF4F]"
                    >
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
                  <p className="border-b border-[#30312D] px-3 py-1.5 text-[13px] font-semibold text-[#F5F5F5]">Agrupar por</p>
                  <div className="grid max-h-[420px] gap-0.5 overflow-y-auto p-1.5">
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
        {hayFiltros ? (
          <button type="button" onClick={resetFilters} className="text-[11.5px] font-semibold text-[#8F908A] hover:text-[#F5F5F5]">Quitar filtros</button>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-lg border border-[#2E2F28] bg-[#171814]">
        <div className="max-w-full overflow-x-auto">
          <div className="w-full" style={{ minWidth: tableWidth }}>
            <div className="sticky top-0 z-30 grid" style={{ gridTemplateColumns: columnTemplate }}>
              {visibleColumns.map((column) => (
                <ColumnHeader key={column.key} column={column} onResizeStart={startColumnResize} />
              ))}
            </div>
            {sortedItems.length ? groupedItems.map((group) => (
              <div key={group.key}>
                {groupBy !== "none" ? (
                  <div className="sticky top-8 z-20 border-b border-[#2E2F28] bg-[#141511] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[#B4B5AC]">
                    {group.label} <span className="font-semibold text-[#8F908A]">· {group.items.length}</span>
                  </div>
                ) : null}
                {(gruposSku.get(group.key) ?? []).map((grupo) => {
                  const fila = (item: ReceptionItem, hija = false) => (
                    <div key={item.id} className={hija ? "bg-[#141511] [&>article]:bg-transparent" : undefined}>
                      <ReceptionItemRow
                        item={item}
                        providerLabel={item.proveedorCompraDisplay || item.proveedorNombre || ""}
                        visibleColumns={visibleColumns}
                        columnWidths={columnWidths}
                        columnTemplate={columnTemplate}
                        busyKey={busyKey}
                        onOpenDetail={handleOpenDetail}
                        onOpenPhotos={setPhotoItem}
                        onChecklistChange={handleChecklistChange}
                        onNovedad={setNovedadItem}
                        onSkuLabel={openSkuLabel}
                        onPrepareSheet={openTechnicalSheetEditor}
                        onInspeccion={openInspeccion}
                        onPrintSheet={openTechnicalSheet}
                      />
                    </div>
                  );
                  if (grupo.items.length === 1) return fila(grupo.principal);
                  const abierto = skusAbiertos.has(grupo.clave);
                  return (
                    <Fragment key={grupo.clave}>
                      <ReceptionGroupRow
                        grupo={grupo}
                        abierto={abierto}
                        visibleColumns={visibleColumns}
                        columnTemplate={columnTemplate}
                        onToggle={() => alternarSku(grupo.clave)}
                        onOpenDetail={handleOpenDetail}
                        onOpenPhotos={setPhotoItem}
                      />
                      {abierto ? grupo.items.map((item) => fila(item, true)) : null}
                    </Fragment>
                  );
                })}
              </div>
            )) : (
              <div className="px-3 py-8 text-center text-[13px] text-[#8F908A]">
                {hayFiltros ? <>Nada coincide. <button type="button" onClick={resetFilters} className="font-semibold text-[#D7FF4F] hover:underline">Quitar filtros</button></> : "No hay nada pendiente en Recepción."}
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

      {gestor ? (
        <GestorPublicacionesModal
          sku={gestor.item.sku}
          canalInicial={gestor.canal}
          unidadInicialId={gestor.item.id}
          casillaMarcada={gestor.canal === "Marketplace" ? gestor.item.marketplacePublicado === true : gestor.item.gruposFacebookPublicado === true}
          onDesmarcarCasilla={() => updateChecklist(gestor.item, gestor.action, false)}
          onClose={() => setGestor(null)}
          onChanged={({ itemsActualizados }) => {
            if (!itemsActualizados.length) return;
            const porId = new Map(itemsActualizados.map((actualizado) => [actualizado.id, actualizado]));
            setItems((current) => current.map((currentItem) => porId.get(currentItem.id) ?? currentItem));
          }}
        />
      ) : null}

      {novedadItem ? (
        <RegistrarNovedadModal
          itemId={novedadItem.id}
          sku={novedadItem.sku}
          nombre={novedadItem.nombre}
          packingId={novedadItem.packing?.id}
          proveedorCompraId={novedadItem.proveedorId}
          proveedorNombre={novedadItem.proveedorCompraDisplay || novedadItem.proveedorNombre || ""}
          onClose={() => setNovedadItem(null)}
          onSaved={({ item: actualizado, novedad, aviso }) => {
            setItems((current) => current.map((currentItem) => currentItem.id === actualizado.id ? actualizado : currentItem));
            if (novedad) setNovedades((current) => [novedad, ...current]);
            if (aviso) setMessage(aviso);
            setNovedadItem(null);
          }}
        />
      ) : null}

    </div>
  );
}
