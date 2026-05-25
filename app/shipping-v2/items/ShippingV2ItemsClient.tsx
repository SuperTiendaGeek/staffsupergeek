"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { ItemPhotoViewer } from "@/components/shipping-v2/ItemPhotoViewer";
import { InlineEditableField } from "@/components/shipping-v2/InlineEditableField";
import { SHIPPING_V2_ITEM_EDIT_FIELDS, type ShippingV2ItemEditFieldConfig } from "@/lib/shipping-v2/item-edit-config";
import { createShippingV2ProveedorLabelMap, getShippingV2ProveedorLabel, resolveShippingV2ProveedorLabel } from "@/lib/shipping-v2/provider-labels";
import { canBeItemLogisticsProvider, canBePurchaseProvider } from "@/lib/shipping-v2/provider-rules";
import {
  type ShippingV2Attachment,
  type ShippingV2Item,
  type ShippingV2Proveedor,
} from "@/types/shipping-v2";

type Props = {
  items: ShippingV2Item[];
  proveedores: ShippingV2Proveedor[];
  error: string;
};

type ItemFilterKey = "estado" | "tipoOperacion" | "proveedorCompra" | "tipoItem";
type SortKey =
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
type GroupKey =
  | "none"
  | "estado"
  | "proveedor-compra"
  | "proveedor-logistico"
  | "packing"
  | "tipo-operacion"
  | "categoria";

type ResolvedItem = ShippingV2Item & {
  proveedorCompraDisplay: string;
  proveedorLogisticoDisplay: string;
};

type ItemGroup = {
  key: string;
  label: string;
  items: ResolvedItem[];
};

type DetailRow = {
  label: string;
  value: string | number | boolean | null | undefined;
  displayValue?: ReactNode;
  config?: ShippingV2ItemEditFieldConfig;
  readOnly?: boolean;
  options?: readonly string[] | readonly { value: string; label: string }[];
};

const ALL = "Todos";

const columns = [
  "SKU",
  "Nombre",
  "Tipo de operación",
  "Estado Item",
  "Rol general",
  "Categoría",
  "Proveedor compra",
  "Proveedor logístico",
  "Packing",
  "Costo proveedor",
  "Precio venta",
  "Fecha registro",
];

const sortOptions: Array<{ value: SortKey; label: string }> = [
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

const groupOptions: Array<{ value: GroupKey; label: string }> = [
  { value: "none", label: "Sin agrupar" },
  { value: "estado", label: "Estado Item" },
  { value: "proveedor-compra", label: "Proveedor de compra" },
  { value: "proveedor-logistico", label: "Proveedor logístico / intermediario" },
  { value: "packing", label: "Packing relacionado" },
  { value: "tipo-operacion", label: "Tipo de operación" },
  { value: "categoria", label: "Categoría" },
];

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function displayValue(value?: string | number | null, fallback = "—") {
  if (value === null || value === undefined) return fallback;
  const stringValue = String(value).trim();
  return stringValue || fallback;
}

function displayName(value?: string | null) {
  return displayValue(value, "Sin nombre");
}

function displayBoolean(value: boolean | null) {
  if (value === null) return "—";
  return value ? "Si" : "No";
}

function formatCurrency(value: number | null) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
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

function timestampValue(item: ResolvedItem) {
  const parsed = Date.parse(item.fechaRegistro || item.createdTime || "");
  return Number.isNaN(parsed) ? -Infinity : parsed;
}

function compareText(a: string | null | undefined, b: string | null | undefined) {
  return displayValue(a, "").localeCompare(displayValue(b, ""), "es", { numeric: true, sensitivity: "base" });
}

function compareNumberDesc(a: number | null | undefined, b: number | null | undefined) {
  return (b ?? -Infinity) - (a ?? -Infinity);
}

function sortItems(items: ResolvedItem[], sortBy: SortKey) {
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

function packingLabel(item: ResolvedItem) {
  return item.packingId || item.legacyPackingId || "";
}

function groupValue(item: ResolvedItem, groupBy: GroupKey) {
  switch (groupBy) {
    case "estado":
      return item.estado;
    case "proveedor-compra":
      return item.proveedorCompraDisplay;
    case "proveedor-logistico":
      return item.proveedorLogisticoDisplay;
    case "packing":
      return packingLabel(item);
    case "tipo-operacion":
      return item.tipoOperacion;
    case "categoria":
      return item.categoria;
    case "none":
    default:
      return "";
  }
}

function groupItems(items: ResolvedItem[], groupBy: GroupKey): ItemGroup[] {
  if (groupBy === "none") return [{ key: "all", label: "", items }];

  const groups = new Map<string, ItemGroup>();
  items.forEach((item) => {
    const rawLabel = displayValue(groupValue(item, groupBy), "Sin dato");
    const label = rawLabel === "—" ? "Sin dato" : rawLabel;
    const key = normalizeText(label) || "sin-dato";
    const group = groups.get(key) || { key, label, items: [] };
    group.items.push(item);
    groups.set(key, group);
  });

  return Array.from(groups.values());
}

function uniqueValues(items: ResolvedItem[], getValue: (item: ResolvedItem) => string | undefined) {
  return Array.from(new Set(items.map(getValue).map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, "es"));
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

function EstadoBadge({ estado }: { estado: string }) {
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${estadoTone(estado)}`}>
      {displayValue(estado)}
    </span>
  );
}

function OperationBadge({ value }: { value: string }) {
  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${operationTone(value)}`}>
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
  } else if (item.esRepuesto) {
    label = "Repuesto";
    tone = "border-[#8B73FF]/35 bg-[#8B73FF]/12 text-[#C9BFFF]";
  } else if (item.disponibleVenta) {
    label = "Disponible para venta";
    tone = "border-[#D7FF4F]/35 bg-[#D7FF4F]/12 text-[#D7FF4F]";
  }

  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${tone}`}>{label}</span>;
}

function AccentIcon({ label, tone }: { label: string; tone: "lime" | "yellow" | "purple" | "orange" }) {
  const toneClass = {
    lime: "border-[#CFFF3A]/35 bg-[#CFFF3A]/15 text-[#CFFF3A]",
    yellow: "border-[#F4E85B]/35 bg-[#F4E85B]/15 text-[#F4E85B]",
    purple: "border-[#8B73FF]/35 bg-[#8B73FF]/15 text-[#B7A8FF]",
    orange: "border-[#FF914D]/35 bg-[#FF914D]/15 text-[#FFB07A]",
  }[tone];

  return (
    <span className={`grid h-8 w-8 place-items-center rounded-full border text-[11px] font-bold ${toneClass}`}>
      {label}
    </span>
  );
}

function TotalMetricCard({ value }: { value: number }) {
  return (
    <article className="relative min-h-28 overflow-hidden rounded-[1.65rem] bg-[#D7FF4F] p-4 text-[#151515] shadow-2xl shadow-[#D7FF4F]/10 lg:col-span-2">
      <div className="absolute -right-8 -top-12 h-28 w-28 rounded-full border-[16px] border-[#151515]/10" />
      <div className="absolute bottom-4 right-5 flex h-14 w-20 items-end gap-1.5 opacity-25">
        <span className="h-6 w-2.5 rounded-full bg-[#151515]" />
        <span className="h-10 w-2.5 rounded-full bg-[#151515]" />
        <span className="h-8 w-2.5 rounded-full bg-[#151515]" />
        <span className="h-12 w-2.5 rounded-full bg-[#151515]" />
      </div>
      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-center justify-between gap-4">
          <span className="rounded-full bg-[#151515]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-normal">Total Items</span>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[#151515] text-xs font-black text-[#D7FF4F]">IT</span>
        </div>
        <div className="mt-4">
          <p className="text-4xl font-semibold leading-none tabular-nums">{value}</p>
          <p className="mt-1 max-w-sm text-sm font-medium text-[#151515]/75">Inventario leido</p>
        </div>
      </div>
    </article>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: number; tone: "lime" | "yellow" | "purple" | "orange" }) {
  const toneClass = {
    lime: {
      text: "text-[#CFFF3A]",
      bar: "bg-[#CFFF3A]",
      glow: "shadow-[#CFFF3A]/10",
      icon: "OK",
    },
    yellow: {
      text: "text-[#F4E85B]",
      bar: "bg-[#F4E85B]",
      glow: "shadow-[#F4E85B]/10",
      icon: "$",
    },
    purple: {
      text: "text-[#B7A8FF]",
      bar: "bg-[#8B73FF]",
      glow: "shadow-[#8B73FF]/10",
      icon: "TR",
    },
    orange: {
      text: "text-[#FFB07A]",
      bar: "bg-[#FF914D]",
      glow: "shadow-[#FF914D]/10",
      icon: "!",
    },
  }[tone];

  return (
    <article className={`relative min-h-28 overflow-hidden rounded-[1.55rem] border border-[#3A3A36] bg-[#30312D] p-4 shadow-2xl ${toneClass.glow}`}>
      <div className={`absolute -right-8 -top-12 h-24 w-24 rounded-full ${toneClass.bar} opacity-10`} />
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className={`text-3xl font-semibold leading-none tabular-nums ${toneClass.text}`}>{value}</p>
          <p className="mt-2 text-xs font-medium leading-4 text-[#A7A7A7]">{label}</p>
        </div>
        <AccentIcon label={toneClass.icon} tone={tone} />
      </div>
      <div className={`mt-4 h-1.5 w-14 rounded-full ${toneClass.bar}`} />
    </article>
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
    <div className="min-w-0 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-normal text-[#A7A7A7]">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((value) => {
          const active = selected === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => onChange(value)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${active ? "border-[#D7FF4F] bg-[#D7FF4F] text-[#151515] shadow-lg shadow-[#D7FF4F]/10" : "border-[#3A3A36] bg-[#1E1E1E] text-[#F5F5F5] hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]"}`}
            >
              {value}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ControlSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="min-w-0">
      <span className="text-[11px] font-semibold uppercase tracking-normal text-[#A7A7A7]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="mt-2 h-10 w-full rounded-full border border-[#3A3A36] bg-[#151515] px-4 text-sm font-medium text-[#F5F5F5] outline-none transition focus:border-[#D7FF4F]/70"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MobileItemCard({ item, onOpen }: { item: ResolvedItem; onOpen: () => void }) {
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
          <p className="text-[11px] font-semibold uppercase tracking-normal text-[#D7FF4F]">{displayValue(item.sku)}</p>
          <h3 className="mt-1 truncate text-base font-semibold text-[#F5F5F5]">{displayName(item.nombre)}</h3>
          <p className="mt-1 text-sm text-[#A7A7A7]">{displayValue(item.modelo || item.marca || item.tipoItem)}</p>
        </div>
        <EstadoBadge estado={item.estado} />
      </div>
      <dl className="mt-4 grid gap-2 text-sm">
        <div className="flex justify-between gap-4"><dt className="text-[#A7A7A7]">Operacion</dt><dd className="text-right text-[#F5F5F5]"><OperationBadge value={item.tipoOperacion} /></dd></div>
        <div className="flex justify-between gap-4"><dt className="text-[#A7A7A7]">Rol general</dt><dd className="text-right text-[#F5F5F5]">{displayValue(item.tipoItem)}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-[#A7A7A7]">Categoría</dt><dd className="text-right text-[#F5F5F5]">{displayValue(item.categoria)}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-[#A7A7A7]">Proveedor</dt><dd className="text-right text-[#F5F5F5]">{displayValue(item.proveedorCompraDisplay)}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-[#A7A7A7]">Packing</dt><dd className="text-right text-[#F5F5F5]">{displayValue(packingLabel(item))}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-[#A7A7A7]">Costo</dt><dd className="text-right text-[#F5F5F5]">{formatCurrency(item.costoProveedor)}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-[#A7A7A7]">Precio venta</dt><dd className="text-right text-[#F5F5F5]">{formatCurrency(item.precioVenta)}</dd></div>
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
}: {
  title: string;
  accent: "lime" | "purple" | "orange" | "yellow";
  rows: DetailRow[];
  onSave: (field: string, value: string | number | boolean | null) => Promise<void>;
}) {
  const accentClass = {
    lime: "bg-[#D7FF4F]",
    purple: "bg-[#8B73FF]",
    orange: "bg-[#FF914D]",
    yellow: "bg-[#F4E85B]",
  }[accent];

  return (
    <section className="rounded-[1.35rem] border border-[#3A3A36] bg-[#2A2B27] p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${accentClass}`} />
        <h3 className="text-sm font-semibold text-[#F5F5F5]">{title}</h3>
      </div>
      <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => (
          <InlineEditableField
            key={row.label}
            label={row.label}
            value={row.value}
            type={row.config?.type ?? "readOnly"}
            readOnly={(row.readOnly ?? !row.config) || row.config?.category === "readOnly"}
            options={row.options ?? row.config?.options}
            displayValue={row.displayValue}
            onSave={row.config && row.config.category !== "readOnly" ? (value) => onSave(row.config!.field, value) : undefined}
          />
        ))}
      </dl>
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
          className="rounded-full border border-[#3A3A36] bg-[#151515] px-3 py-1 text-xs text-[#D7FF4F] transition hover:border-[#D7FF4F]"
        >
          {attachment.filename || `Archivo ${index + 1}`}
        </a>
      ))}
    </div>
  );
}

function ItemDetailModal({
  item,
  proveedores,
  onClose,
  onSaved,
}: {
  item: ResolvedItem;
  proveedores: ShippingV2Proveedor[];
  onClose: () => void;
  onSaved: (item: ShippingV2Item) => void;
}) {
  const [applyingAiName, setApplyingAiName] = useState(false);
  const [ignoredAiName, setIgnoredAiName] = useState("");
  const purchaseProviderOptions = useMemo(
    () => proveedores.filter(canBePurchaseProvider).map((proveedor) => ({ value: proveedor.id, label: getShippingV2ProveedorLabel(proveedor) })),
    [proveedores]
  );
  const itemLogisticsProviderOptions = useMemo(
    () => proveedores.filter(canBeItemLogisticsProvider).map((proveedor) => ({ value: proveedor.id, label: getShippingV2ProveedorLabel(proveedor) })),
    [proveedores]
  );

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

    onSaved(payload.data as ShippingV2Item);
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
      onSaved(payload.data as ShippingV2Item);
      setIgnoredAiName("");
    } finally {
      setApplyingAiName(false);
    }
  }

  async function refreshItem() {
    const response = await fetch(`/api/shipping-v2/items/${item.id}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload.success) {
      onSaved(payload.data as ShippingV2Item);
    }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    setIgnoredAiName("");
    void refreshItem();
    const timeout = window.setTimeout(() => {
      void refreshItem();
    }, 4000);
    return () => window.clearTimeout(timeout);
  }, [item.id]);

  const C = SHIPPING_V2_ITEM_EDIT_FIELDS;
  const ganancia = item.precioVenta !== null && item.costoProveedor !== null ? item.precioVenta - item.costoProveedor : null;
  const aiNameSuggestion = item.aiNombre?.trim();
  const hasAiNameSuggestion = Boolean(aiNameSuggestion && normalizeText(aiNameSuggestion) !== normalizeText(item.nombre) && aiNameSuggestion !== ignoredAiName);
  const gananciaTone = ganancia !== null && ganancia < 0
    ? "border-[#FF914D]/35 bg-[#FF914D]/10 text-[#FFB07A]"
    : "border-[#D7FF4F]/35 bg-[#D7FF4F]/10 text-[#D7FF4F]";
  const sections: Array<{ title: string; accent: "lime" | "purple" | "orange" | "yellow"; rows: DetailRow[] }> = [
    {
      title: "Identificacion",
      accent: "lime",
      rows: [
        { label: C.sku.label, value: item.sku, config: C.sku },
        { label: C.skuProveedor.label, value: item.skuProveedor, config: C.skuProveedor },
        { label: C.numeroSerie.label, value: item.numeroSerie, config: C.numeroSerie },
        { label: C.marca.label, value: item.marca, config: C.marca },
        { label: C.modelo.label, value: item.modelo, config: C.modelo },
      ],
    },
    {
      title: "Informacion general",
      accent: "purple",
      rows: [
        { label: C.nombre.label, value: item.nombre, displayValue: displayName(item.nombre), config: C.nombre },
        { label: C.descripcion.label, value: item.descripcion, config: C.descripcion },
        { label: C.categoria.label, value: item.categoria, config: C.categoria },
        { label: C.tipoItem.label, value: item.tipoItem, config: C.tipoItem },
        { label: C.condicion.label, value: item.condicion, config: C.condicion },
        { label: C.cantidad.label, value: item.cantidad ?? item.qty, config: C.cantidad },
        { label: C.unidad.label, value: item.unidad, config: C.unidad },
      ],
    },
    {
      title: "Estado e inventario",
      accent: "yellow",
      rows: [
        { label: C.estadoItem.label, value: item.estado, displayValue: <EstadoBadge estado={item.estado} />, config: C.estadoItem },
        { label: C.estadoRevision.label, value: item.estadoRevision, config: C.estadoRevision },
        { label: C.estadoTriangulacion.label, value: item.estadoTriangulacion, config: C.estadoTriangulacion },
        { label: C.estadoDespiece.label, value: item.estadoDespiece, config: C.estadoDespiece },
        { label: C.afectaInventario.label, value: item.afectaInventario, displayValue: displayBoolean(item.afectaInventario), config: C.afectaInventario },
        { label: C.disponibleVenta.label, value: item.disponibleVenta, displayValue: `${displayBoolean(item.disponibleVenta)} · Puede ofrecerse o reservarse; no significa entrega inmediata.`, config: C.disponibleVenta },
        { label: C.reservado.label, value: item.reservado, config: C.reservado },
        { label: C.ubicacionActual.label, value: item.ubicacionActual, config: C.ubicacionActual },
        { label: "Origen físico actual", value: item.origenFisicoActual, readOnly: true },
      ],
    },
    {
      title: "Proveedor y compra",
      accent: "orange",
      rows: [
        { label: C.proveedorCompra.label, value: item.proveedorId, displayValue: displayValue(item.proveedorCompraDisplay), config: C.proveedorCompra, options: purchaseProviderOptions },
        { label: C.proveedorLogistico.label, value: item.proveedorLogisticoId, displayValue: displayValue(item.proveedorLogisticoDisplay), config: C.proveedorLogistico, options: itemLogisticsProviderOptions },
        { label: C.requierePago.label, value: item.requierePago, displayValue: displayBoolean(item.requierePago), config: C.requierePago },
        { label: C.pagoRelacionado.label, value: item.pagoId, config: C.pagoRelacionado },
        { label: C.costoProveedor.label, value: item.costoProveedor, displayValue: formatCurrency(item.costoProveedor), config: C.costoProveedor },
        { label: "Es regalo", value: item.esRegalo, displayValue: displayBoolean(item.esRegalo), readOnly: true },
      ],
    },
    {
      title: "Packing y tracking",
      accent: "purple",
      rows: [
        { label: C.requierePacking.label, value: item.requierePacking, displayValue: displayBoolean(item.requierePacking), config: C.requierePacking },
        { label: C.packingRelacionado.label, value: item.packingId, config: C.packingRelacionado },
        { label: "Tracking directo", value: item.trackingDirecto, readOnly: true },
        { label: "Tracking hacia intermediario", value: item.trackingHaciaIntermediario, readOnly: true },
        { label: "Tracking desde intermediario", value: item.trackingDesdeIntermediario, readOnly: true },
      ],
    },
    {
      title: "Costos y venta",
      accent: "lime",
      rows: [
        { label: C.costoProveedor.label, value: item.costoProveedor, displayValue: formatCurrency(item.costoProveedor), config: C.costoProveedor },
        { label: "Costo asignado despiece", value: item.costoAsignadoDespiece, displayValue: formatCurrency(item.costoAsignadoDespiece), readOnly: true },
        { label: "Costo logístico asignado", value: item.costoLogisticoAsignado, displayValue: formatCurrency(item.costoLogisticoAsignado), readOnly: true },
        { label: "Costo total estimado", value: item.costoTotalEstimado, displayValue: formatCurrency(item.costoTotalEstimado), readOnly: true },
        { label: C.precioVentaSugerido.label, value: item.precioVentaSugerido, displayValue: formatCurrency(item.precioVentaSugerido), config: C.precioVentaSugerido },
        { label: C.precioVentaFinal.label, value: item.precioVenta, displayValue: formatCurrency(item.precioVenta), config: C.precioVentaFinal },
      ],
    },
    {
      title: "Despiece y repuestos",
      accent: "yellow",
      rows: [
        { label: C.itemPadre.label, value: item.itemPadreId, config: C.itemPadre },
        { label: C.itemsHijos.label, value: item.itemHijoIds.join(", "), displayValue: item.itemHijoIds.length ? item.itemHijoIds.join(", ") : "—", config: C.itemsHijos },
        { label: "Motivo despiece", value: item.motivoDespiece, readOnly: true },
        { label: "Fecha despiece", value: item.fechaDespiece, displayValue: formatDate(item.fechaDespiece), readOnly: true },
        { label: "Responsable despiece", value: item.responsableDespiece, readOnly: true },
        { label: "Parte recuperada", value: item.esParteRecuperada, displayValue: displayBoolean(item.esParteRecuperada), readOnly: true },
        { label: C.esRepuesto.label, value: item.esRepuesto, config: C.esRepuesto },
        { label: C.esUsoLocal.label, value: item.usoLocal, config: C.esUsoLocal },
      ],
    },
    {
      title: "Observaciones y evidencias",
      accent: "orange",
      rows: [
        { label: C.observacionesInternas.label, value: item.observacionesInternas, config: C.observacionesInternas },
        { label: C.observacionVenta.label, value: item.observacionVenta, config: C.observacionVenta },
        { label: "Evidencias", value: "", displayValue: attachmentList(item.evidencias), readOnly: true },
      ],
    },
    {
      title: "Migracion",
      accent: "purple",
      rows: [
        { label: C.legacyItemId.label, value: item.legacyItemId, config: C.legacyItemId },
        { label: C.legacyPagoId.label, value: item.legacyPagoId, config: C.legacyPagoId },
        { label: C.legacyPackingId.label, value: item.legacyPackingId, config: C.legacyPackingId },
        { label: C.fuenteMigracion.label, value: item.fuenteMigracion, config: C.fuenteMigracion },
        { label: C.estadoMigracion.label, value: item.estadoMigracion, config: C.estadoMigracion },
      ],
    },
    {
      title: "Auditoria",
      accent: "lime",
      rows: [
        { label: C.fechaRegistro.label, value: item.fechaRegistro || item.createdTime, displayValue: formatDate(item.fechaRegistro || item.createdTime), config: C.fechaRegistro },
        { label: C.registradoPor.label, value: item.registradoPor, config: C.registradoPor },
        { label: C.ultimaActualizacion.label, value: item.ultimaActualizacion, displayValue: formatDate(item.ultimaActualizacion), config: C.ultimaActualizacion },
        { label: C.actualizadoPor.label, value: item.actualizadoPor, config: C.actualizadoPor },
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-md sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <article className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-[2rem] border border-[#3A3A36] bg-[#1E1F1C] shadow-2xl shadow-black/50">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#3A3A36] bg-[#1E1F1C]/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-normal text-[#D7FF4F]">{displayValue(item.sku)}</p>
            <h2 className="mt-1 truncate text-2xl font-semibold text-[#F5F5F5]">{displayName(item.nombre)}</h2>
            <p className="mt-1 text-xs text-[#A7A7A7]">Haz clic en un campo editable para modificarlo.</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="grid h-10 w-10 place-items-center rounded-full border border-[#3A3A36] bg-[#151515] text-xl text-[#F5F5F5] transition hover:border-[#D7FF4F] hover:text-[#D7FF4F]"
              aria-label="Cerrar detalle"
            >
              ×
            </button>
          </div>
        </header>

        <div className="max-h-[calc(92vh-74px)] overflow-y-auto p-4 sm:p-5">
          <section className="grid gap-5 lg:grid-cols-[minmax(280px,420px)_1fr]">
            <ItemPhotoViewer
              itemId={item.id}
              itemName={item.nombre}
              fotos={item.fotos}
              onUpdated={onSaved}
            />
            <div className="rounded-[1.5rem] border border-[#3A3A36] bg-[#2A2B27] p-5">
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
                className="mt-5 rounded-lg transition"
                valueClassName="min-h-9 break-words text-3xl font-semibold leading-tight text-[#F5F5F5]"
                onSave={(value) => saveField(C.nombre.field, value)}
              />
              <InlineEditableField
                label={C.descripcion.label}
                value={item.descripcion}
                type={C.descripcion.type}
                displayValue={displayValue(item.descripcion, "Sin descripcion registrada.")}
                hideLabel
                className="mt-2 rounded-lg transition"
                valueClassName="min-h-6 break-words text-sm leading-6 text-[#A7A7A7]"
                onSave={(value) => saveField(C.descripcion.field, value)}
              />
              {hasAiNameSuggestion ? (
                <div className="mt-4 rounded-[1.25rem] border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-normal text-[#D7FF4F]">Sugerencia IA disponible</p>
                  <p className="mt-2 text-sm text-[#A7A7A7]">Airtable AI generó una versión más ordenada. Puedes aplicarla si te parece correcta.</p>
                  <div className="mt-3 grid gap-2">
                    <div className="rounded-[1rem] border border-[#3A3A36] bg-[#151515] p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-normal text-[#A7A7A7]">Nombre actual</p>
                      <p className="mt-1 text-sm text-[#F5F5F5]">{displayName(item.nombre)}</p>
                    </div>
                    <div className="rounded-[1rem] border border-[#D7FF4F]/35 bg-[#151515] p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-normal text-[#D7FF4F]">Nombre sugerido</p>
                      <p className="mt-1 text-sm text-[#F5F5F5]">{aiNameSuggestion}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void applyAiNameSuggestion()}
                      disabled={applyingAiName}
                      className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-2 text-xs font-bold uppercase tracking-normal text-[#151515] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {applyingAiName ? "Aplicando..." : "Aplicar sugerencia"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIgnoredAiName(aiNameSuggestion || "")}
                      disabled={applyingAiName}
                      className="rounded-full border border-[#3A3A36] bg-[#252622] px-4 py-2 text-xs font-semibold uppercase tracking-normal text-[#F5F5F5] transition hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F] disabled:opacity-60"
                    >
                      Ignorar
                    </button>
                    <button
                      type="button"
                      onClick={() => void refreshItem()}
                      disabled={applyingAiName}
                      className="rounded-full border border-[#3A3A36] bg-[#151515] px-4 py-2 text-xs font-semibold uppercase tracking-normal text-[#A7A7A7] transition hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F] disabled:opacity-60"
                    >
                      Actualizar sugerencia
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <InlineEditableField
                  label={C.precioVentaFinal.label}
                  value={item.precioVenta}
                  type={C.precioVentaFinal.type}
                  displayValue={formatCurrency(item.precioVenta)}
                  className="rounded-[1.25rem] bg-[#D7FF4F] p-4 text-[#151515] transition"
                  labelClassName="text-xs font-bold uppercase tracking-normal text-[#151515]"
                  valueClassName="mt-2 min-h-9 break-words text-3xl font-semibold tabular-nums text-[#151515]"
                  onSave={(value) => saveField(C.precioVentaFinal.field, value)}
                />
                <InlineEditableField
                  label={C.costoProveedor.label}
                  value={item.costoProveedor}
                  type={C.costoProveedor.type}
                  displayValue={formatCurrency(item.costoProveedor)}
                  className="rounded-[1.25rem] border border-[#3A3A36] bg-[#151515] p-4 transition"
                  labelClassName="text-xs font-semibold uppercase tracking-normal text-[#A7A7A7]"
                  valueClassName="mt-2 min-h-8 break-words text-2xl font-semibold text-[#F5F5F5] tabular-nums"
                  onSave={(value) => saveField(C.costoProveedor.field, value)}
                />
                <div className={`rounded-[1.25rem] border p-4 ${gananciaTone}`}>
                  <p className="text-xs font-semibold uppercase tracking-normal">Ganancia</p>
                  <p className="mt-2 min-h-8 break-words text-2xl font-semibold tabular-nums">{formatCurrency(ganancia)}</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {item.reservado ? <span className="rounded-full border border-[#F4E85B]/35 bg-[#F4E85B]/12 px-3 py-1 text-xs text-[#F4E85B]">Reservado</span> : null}
                {item.usoLocal ? <span className="rounded-full border border-[#8B73FF]/35 bg-[#8B73FF]/12 px-3 py-1 text-xs text-[#C9BFFF]">Uso local</span> : null}
                {item.esRepuesto ? <span className="rounded-full border border-[#8B73FF]/35 bg-[#8B73FF]/12 px-3 py-1 text-xs text-[#C9BFFF]">Repuesto</span> : null}
                {item.conNovedad ? <span className="rounded-full border border-[#FF914D]/35 bg-[#FF914D]/12 px-3 py-1 text-xs text-[#FFB07A]">Con novedad</span> : null}
              </div>
            </div>
          </section>

          <div className="mt-5 grid gap-4">
            {sections.map((section) => <DetailSection key={section.title} {...section} onSave={saveField} />)}
          </div>
        </div>
      </article>
    </div>
  );
}

export function ShippingV2ItemsClient({ items, proveedores, error }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState(ALL);
  const [tipoOperacion, setTipoOperacion] = useState(ALL);
  const [proveedorCompra, setProveedorCompra] = useState(ALL);
  const [tipoItem, setTipoItem] = useState(ALL);
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const [groupBy, setGroupBy] = useState<GroupKey>("none");
  const [selectedItem, setSelectedItem] = useState<ResolvedItem | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const storedNotice = window.sessionStorage.getItem("shipping-v2:notice");
    if (!storedNotice) return;
    window.sessionStorage.removeItem("shipping-v2:notice");
    setNotice(storedNotice);
  }, []);

  const providerLabelsById = useMemo(() => createShippingV2ProveedorLabelMap(proveedores), [proveedores]);

  const resolvedItems = useMemo<ResolvedItem[]>(() => items.map((item) => ({
    ...item,
    proveedorCompraDisplay: resolveShippingV2ProveedorLabel(item.proveedorId, providerLabelsById),
    proveedorLogisticoDisplay: resolveShippingV2ProveedorLabel(item.proveedorLogisticoId, providerLabelsById),
  })), [items, providerLabelsById]);

  const filterOptions = useMemo(() => ({
    estados: uniqueValues(resolvedItems, (item) => item.estado),
    operaciones: uniqueValues(resolvedItems, (item) => item.tipoOperacion),
    proveedores: uniqueValues(resolvedItems, (item) => item.proveedorCompraDisplay),
    tipos: uniqueValues(resolvedItems, (item) => item.tipoItem),
  }), [resolvedItems]);

  const filteredItems = useMemo(() => {
    const query = normalizeText(search);

    // Si Shipping Items crece a miles de registros, conviene mover esta busqueda a paginacion o filtros server-side.
    return resolvedItems.filter((item) => {
      const searchText = [
        item.sku,
        item.skuProveedor,
        item.nombre,
        item.modelo,
        item.marca,
        item.numeroSerie,
      ].map((value) => normalizeText(value ?? "")).join(" ");

      return (
        (!query || searchText.includes(query)) &&
        (estado === ALL || item.estado === estado) &&
        (tipoOperacion === ALL || item.tipoOperacion === tipoOperacion) &&
        (proveedorCompra === ALL || item.proveedorCompraDisplay === proveedorCompra) &&
        (tipoItem === ALL || item.tipoItem === tipoItem)
      );
    });
  }, [estado, proveedorCompra, resolvedItems, search, tipoItem, tipoOperacion]);

  const sortedItems = useMemo(() => sortItems(filteredItems, sortBy), [filteredItems, sortBy]);
  const groupedItems = useMemo(() => groupItems(sortedItems, groupBy), [groupBy, sortedItems]);
  const visibleGroupCount = groupBy === "none" ? 0 : groupedItems.length;

  const summary = useMemo(() => ({
    total: resolvedItems.length,
    disponibles: resolvedItems.filter((item) => normalizeText(item.estado).includes("disponible") || item.disponibleVenta === true).length,
    pendientesPago: resolvedItems.filter((item) => normalizeText(item.estado).includes("pendiente pago")).length,
    enTransito: resolvedItems.filter((item) => normalizeText(item.estado).includes("transito")).length,
    conNovedad: resolvedItems.filter((item) => item.conNovedad === true || normalizeText(item.estado).includes("novedad")).length,
  }), [resolvedItems]);

  function openItemFromRow(event: MouseEvent<HTMLElement>, item: ResolvedItem) {
    const target = event.target as HTMLElement;
    if (target.closest("a,button,input,select,textarea")) return;
    setSelectedItem(item);
  }

  return (
    <div className="w-full space-y-5 rounded-[2.2rem] border border-[#3A3A36] bg-[#151515] p-4 shadow-2xl shadow-black/40 sm:p-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <TotalMetricCard value={summary.total} />
        <MetricCard label="Disponibles" value={summary.disponibles} tone="lime" />
        <MetricCard label="Pendientes de pago" value={summary.pendientesPago} tone="yellow" />
        <MetricCard label="En transito" value={summary.enTransito} tone="purple" />
        <MetricCard label="Con novedad" value={summary.conNovedad} tone="orange" />
      </section>

      <section className="relative overflow-hidden rounded-[2rem] border border-[#3A3A36] bg-[#1E1F1C] p-5 shadow-2xl shadow-black/25">
        <div className="absolute right-6 top-6 h-28 w-28 rounded-full bg-[#8B73FF]/10 blur-2xl" />
        <div className="absolute bottom-0 right-28 h-24 w-24 rounded-full bg-[#FF914D]/10 blur-2xl" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-3 py-1 text-[11px] font-bold uppercase tracking-normal text-[#151515]">Read-only</span>
              <span className="rounded-full border border-[#8B73FF]/35 bg-[#8B73FF]/15 px-3 py-1 text-[11px] font-medium text-[#C9BFFF]">Shipping Items</span>
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-[#F5F5F5]">Inventario principal</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[#A7A7A7]">Consulta operativa de items registrados en Shipping V2.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link href="/shipping-v2" className="rounded-full border border-[#3A3A36] bg-[#252622] px-5 py-2.5 text-center text-sm font-medium text-[#F5F5F5] transition hover:border-[#D7FF4F]/60 hover:text-[#D7FF4F]">
              Dashboard
            </Link>
            <Link href="/shipping-v2/items/nuevo" className="rounded-full border border-[#D7FF4F]/70 bg-[#D7FF4F] px-5 py-2.5 text-center text-sm font-bold text-[#151515] transition hover:brightness-105">
              Nuevo Item
            </Link>
          </div>
        </div>

        <div className="relative mt-5 grid gap-4">
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-normal text-[#A7A7A7]">Buscar por SKU, SKU proveedor, nombre, modelo, marca o serie</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="SKU, SKU proveedor, nombre, modelo, marca o serie"
              className="mt-2 h-12 w-full rounded-full border border-[#3A3A36] bg-[#151515] px-5 text-sm text-[#F5F5F5] outline-none placeholder:text-[#A7A7A7] shadow-inner shadow-black/20 focus:border-[#D7FF4F]/70"
            />
          </label>

          <div className="grid gap-4 xl:grid-cols-4">
            <FilterGroup label="Estado Item" values={filterOptions.estados} selected={estado} onChange={setEstado} />
            <FilterGroup label="Tipo de operación" values={filterOptions.operaciones} selected={tipoOperacion} onChange={setTipoOperacion} />
            <FilterGroup label="Proveedor compra" values={filterOptions.proveedores} selected={proveedorCompra} onChange={setProveedorCompra} />
            <FilterGroup label="Rol general del item" values={filterOptions.tipos} selected={tipoItem} onChange={setTipoItem} />
          </div>

          <div className="grid gap-3 rounded-[1.35rem] border border-[#3A3A36] bg-[#151515]/70 p-3 sm:grid-cols-2 lg:max-w-3xl">
            <ControlSelect label="Ordenar por" value={sortBy} options={sortOptions} onChange={setSortBy} />
            <ControlSelect label="Agrupar por" value={groupBy} options={groupOptions} onChange={setGroupBy} />
          </div>
        </div>
      </section>

      {error ? (
        <section className="rounded-[1.5rem] border border-orange-300/25 bg-orange-300/10 p-5 text-orange-100">
          <p className="text-sm font-semibold uppercase tracking-normal">Airtable V2 no disponible</p>
          <p className="mt-2 text-sm leading-6 text-orange-100/85">{error}</p>
        </section>
      ) : null}

      {notice ? (
        <section className="rounded-[1.35rem] border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 px-4 py-3 text-sm font-medium text-[#D7FF4F]">
          {notice}
        </section>
      ) : null}

      <section className="overflow-hidden rounded-[2rem] border border-[#3A3A36] bg-[#2A2B27] shadow-2xl shadow-black/30">
        <div className="flex flex-col gap-2 border-b border-[#3A3A36] bg-[#30312D] px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#F5F5F5]">Listado</h2>
            <p className="mt-1 text-sm text-[#A7A7A7]">
              Total leído: {resolvedItems.length} · Mostrando: {sortedItems.length}
              {visibleGroupCount ? ` · Grupos: ${visibleGroupCount}` : ""}
            </p>
          </div>
          <span className="w-fit rounded-full border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 px-4 py-2 text-xs font-semibold uppercase tracking-normal text-[#D7FF4F]">
            Solo lectura
          </span>
        </div>

        <div className="hidden max-w-full overflow-x-auto xl:block">
          <table className="min-w-[1680px] border-separate border-spacing-0 text-left text-sm">
            <thead className="text-[11px] uppercase tracking-normal text-[#A7A7A7]">
              <tr>
                {columns.map((column) => (
                  <th key={column} className="whitespace-nowrap border-b border-[#3A3A36] px-4 py-3 font-semibold">{column}</th>
                ))}
              </tr>
            </thead>
            <tbody className="text-[#F5F5F5]">
              {sortedItems.length ? groupedItems.map((group) => (
                <Fragment key={group.key}>
                  {groupBy !== "none" ? (
                    <tr>
                      <td colSpan={columns.length} className="border-b border-[#3A3A36] bg-[#1E1F1C] px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-semibold text-[#F5F5F5]">{group.label}</span>
                          <span className="rounded-full border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 px-3 py-1 text-[11px] font-semibold text-[#D7FF4F]">
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
                          setSelectedItem(item);
                        }
                      }}
                      className="cursor-pointer transition hover:bg-[#CFFF3A]/[0.055] focus:bg-[#CFFF3A]/[0.055] focus:outline-none"
                    >
                      <td className="whitespace-nowrap border-b border-[#3A3A36]/80 px-4 py-3 font-semibold text-[#CFFF3A]">{displayValue(item.sku)}</td>
                      <td className="max-w-[280px] border-b border-[#3A3A36]/80 px-4 py-3"><span className="block truncate">{displayName(item.nombre)}</span></td>
                      <td className="whitespace-nowrap border-b border-[#3A3A36]/80 px-4 py-3"><OperationBadge value={item.tipoOperacion} /></td>
                      <td className="whitespace-nowrap border-b border-[#3A3A36]/80 px-4 py-3"><EstadoBadge estado={item.estado} /></td>
                      <td className="whitespace-nowrap border-b border-[#3A3A36]/80 px-4 py-3 text-[#A7A7A7]">{displayValue(item.tipoItem)}</td>
                      <td className="whitespace-nowrap border-b border-[#3A3A36]/80 px-4 py-3 text-[#A7A7A7]">{displayValue(item.categoria)}</td>
                      <td className="max-w-[220px] border-b border-[#3A3A36]/80 px-4 py-3"><span className="block truncate">{displayValue(item.proveedorCompraDisplay)}</span></td>
                      <td className="max-w-[220px] border-b border-[#3A3A36]/80 px-4 py-3"><span className="block truncate">{displayValue(item.proveedorLogisticoDisplay)}</span></td>
                      <td className="max-w-[180px] border-b border-[#3A3A36]/80 px-4 py-3 text-[#A7A7A7]"><span className="block truncate">{displayValue(packingLabel(item))}</span></td>
                      <td className="whitespace-nowrap border-b border-[#3A3A36]/80 px-4 py-3 text-right tabular-nums">{formatCurrency(item.costoProveedor)}</td>
                      <td className="whitespace-nowrap border-b border-[#3A3A36]/80 px-4 py-3 text-right tabular-nums">{formatCurrency(item.precioVenta)}</td>
                      <td className="whitespace-nowrap border-b border-[#3A3A36]/80 px-4 py-3 text-[#A7A7A7]">{formatDate(item.fechaRegistro || item.createdTime)}</td>
                    </tr>
                  ))}
                </Fragment>
              )) : (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-[#A7A7A7]">
                    No se encontraron items con los filtros actuales.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 p-4 xl:hidden">
          {sortedItems.length ? groupedItems.map((group) => (
            <div key={group.key} className="grid gap-3">
              {groupBy !== "none" ? (
                <div className="flex items-center justify-between rounded-[1.15rem] border border-[#3A3A36] bg-[#1E1F1C] px-4 py-3">
                  <span className="text-sm font-semibold text-[#F5F5F5]">{group.label}</span>
                  <span className="rounded-full border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 px-3 py-1 text-[11px] font-semibold text-[#D7FF4F]">
                    {group.items.length} items
                  </span>
                </div>
              ) : null}
              {group.items.map((item) => (
                <MobileItemCard key={item.id} item={item} onOpen={() => setSelectedItem(item)} />
              ))}
            </div>
          )) : (
            <div className="rounded-[1.35rem] border border-[#3A3A36] bg-[#1E1E1E] px-4 py-10 text-center text-sm text-[#A7A7A7]">
              No se encontraron items con los filtros actuales.
            </div>
          )}
        </div>
      </section>

      {selectedItem ? (
        <ItemDetailModal
          item={selectedItem}
          proveedores={proveedores}
          onClose={() => setSelectedItem(null)}
          onSaved={(updatedItem) => {
            const resolved: ResolvedItem = {
              ...updatedItem,
              proveedorCompraDisplay: resolveShippingV2ProveedorLabel(updatedItem.proveedorId, providerLabelsById),
              proveedorLogisticoDisplay: resolveShippingV2ProveedorLabel(updatedItem.proveedorLogisticoId, providerLabelsById),
            };
            setSelectedItem(resolved);
            setNotice("Item actualizado correctamente.");
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
