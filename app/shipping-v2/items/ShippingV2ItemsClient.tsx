"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { ItemPhotoViewer } from "@/components/shipping-v2/ItemPhotoViewer";
import { InlineEditableField } from "@/components/shipping-v2/InlineEditableField";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SHIPPING_V2_ITEM_EDIT_FIELDS, type ShippingV2ItemEditFieldConfig } from "@/lib/shipping-v2/item-edit-config";
import { createShippingV2ProveedorLabelMap, getShippingV2ProveedorLabel, resolveShippingV2ProveedorLabel } from "@/lib/shipping-v2/provider-labels";
import { canBeItemLogisticsProvider, canBePurchaseProvider } from "@/lib/shipping-v2/provider-rules";
import {
  type ShippingV2Attachment,
  type ShippingV2Item,
  type ShippingV2Packing,
  type ShippingV2Pago,
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

export type ResolvedItem = ShippingV2Item & {
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

type ItemDetailTabKey = "general" | "costos" | "logistica" | "pago" | "packing" | "observaciones";

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
  } else if (item.esRepuesto) {
    label = "Repuesto";
    tone = "border-[#8B73FF]/35 bg-[#8B73FF]/12 text-[#C9BFFF]";
  } else if (item.disponibleVenta) {
    label = "Disponible para venta";
    tone = "border-[#D7FF4F]/35 bg-[#D7FF4F]/12 text-[#D7FF4F]";
  }

  return <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${tone}`}>{label}</span>;
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
      <div className="flex max-h-16 flex-wrap gap-1 overflow-y-auto pr-1">
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
      <span className="text-[12px] font-bold uppercase tracking-normal text-[#8F908A]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="mt-1 h-9 w-full rounded-lg border border-[#3A3A36] bg-[#121310] px-3 text-[13px] font-semibold text-[#F5F5F5] outline-none transition focus:border-[#D7FF4F]/70"
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
          <p className="text-[12px] font-semibold uppercase tracking-normal text-[#D7FF4F]">{displayValue(item.sku)}</p>
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
    <section className="rounded-xl border border-[#30312D] bg-[#171814] p-3 shadow-lg shadow-black/10">
      <div className="mb-2.5 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${accentClass}`} />
        <h3 className="text-sm font-semibold text-[#F5F5F5]">{title}</h3>
      </div>
      <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
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

export function ShippingV2ItemDetailView({
  item: initialItem,
  proveedores,
  pago,
  packing,
  onSaved,
}: {
  item: ResolvedItem;
  proveedores: ShippingV2Proveedor[];
  pago?: ShippingV2Pago | null;
  packing?: ShippingV2Packing | null;
  onSaved?: (item: ShippingV2Item) => void;
}) {
  const providerLabelsById = useMemo(() => createShippingV2ProveedorLabelMap(proveedores), [proveedores]);
  const [item, setItem] = useState(initialItem);
  const [applyingAiName, setApplyingAiName] = useState(false);
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
  const ganancia = item.precioVenta !== null && item.costoProveedor !== null ? item.precioVenta - item.costoProveedor : null;
  const aiNameSuggestion = item.aiNombre?.trim();
  const hasAiNameSuggestion = Boolean(aiNameSuggestion && normalizeText(aiNameSuggestion) !== normalizeText(item.nombre) && aiNameSuggestion !== ignoredAiName);
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
        { label: C.ubicacionActual.label, value: item.ubicacionActual, config: C.ubicacionActual },
        { label: "Origen físico actual", value: item.origenFisicoActual, readOnly: true },
      ],
    },
    {
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
        { label: "Costo total unidad", value: item.costoTotalUnidad, displayValue: formatCurrency(item.costoTotalUnidad), readOnly: true },
        { label: "Costo asignado despiece", value: item.costoAsignadoDespiece, displayValue: formatCurrency(item.costoAsignadoDespiece), readOnly: true },
        { label: "Costo total estimado", value: item.costoTotalEstimado, displayValue: formatCurrency(item.costoTotalEstimado), readOnly: true },
        { label: C.precioVentaSugerido.label, value: item.precioVentaSugerido, displayValue: formatCurrency(item.precioVentaSugerido), config: C.precioVentaSugerido },
        { label: C.precioVentaFinal.label, value: item.precioVenta, displayValue: formatCurrency(item.precioVenta), config: C.precioVentaFinal },
        { label: "Ganancia", value: ganancia, displayValue: formatCurrency(ganancia), readOnly: true },
      ],
    },
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
        { label: "Pago legacy", value: item.legacyPagoId || item.legacyPagoRelacionadoIds.join(", "), readOnly: true },
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
        { label: C.legacyItemId.label, value: item.legacyItemId, config: C.legacyItemId },
        { label: C.legacyPackingId.label, value: item.legacyPackingId, config: C.legacyPackingId },
        { label: C.fuenteMigracion.label, value: item.fuenteMigracion, config: C.fuenteMigracion },
        { label: C.estadoMigracion.label, value: item.estadoMigracion, config: C.estadoMigracion },
      ],
    },
  ];
  const activeSection = tabs.find((tab) => tab.key === activeTab) ?? tabs[0];

  return (
    <div className="w-full max-w-none space-y-3">
      <section className="grid w-full gap-3 xl:grid-cols-12">
        <aside className="space-y-3 xl:col-span-4 2xl:col-span-3">
          <article className="rounded-xl border border-[#30312D] bg-[#11120F] p-3 shadow-xl shadow-black/15">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-[#F5F5F5]">Fotos</h2>
              <span className="rounded-full border border-[#3A3A36] bg-[#151515] px-2.5 py-0.5 text-[12px] font-semibold text-[#A7A7A7]">{item.fotos.length} fotos</span>
            </div>
            <ItemPhotoViewer itemId={item.id} itemName={item.nombre} fotos={item.fotos} onUpdated={handleSaved} density="compact" />
          </article>

          <article className="rounded-xl border border-[#30312D] bg-[#11120F] p-3 shadow-xl shadow-black/15">
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
                onSave={(value) => saveField(C.precioVentaFinal.field, value)}
              />
              <DetailMetric label="Costo total unidad" value={formatCurrency(item.costoTotalUnidad)} />
              <InlineEditableField
                label={C.costoProveedor.label}
                value={item.costoProveedor}
                type={C.costoProveedor.type}
                displayValue={formatCurrency(item.costoProveedor)}
                className="rounded-xl border border-[#30312D] bg-[#171814] px-3 py-2 transition"
                labelClassName="text-[11px] font-bold uppercase tracking-normal text-[#8F908A]"
                valueClassName="mt-1 min-h-5 break-words text-lg font-semibold tabular-nums text-[#F5F5F5]"
                onSave={(value) => saveField(C.costoProveedor.field, value)}
              />
              <DetailMetric label="Costo logístico" value={formatCurrency(item.costoLogisticoAsignado)} />
              <DetailMetric label="Ganancia" value={formatCurrency(ganancia)} tone={ganancia !== null && ganancia < 0 ? "orange" : "lime"} />
            </div>
          </article>

          <article className="rounded-xl border border-[#30312D] bg-[#11120F] p-3 shadow-xl shadow-black/15">
            <h2 className="text-sm font-semibold text-[#F5F5F5]">Estado y disponibilidad</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <EstadoBadge estado={item.estado} />
              <OperationBadge value={item.tipoOperacion} />
              <AvailabilityBadge item={item} />
              <BooleanPill label="Requiere pago" value={item.requierePago} />
              <BooleanPill label="Requiere packing" value={item.requierePacking} />
              <BooleanPill label="Disponible venta" value={item.disponibleVenta} />
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
              onSave={(value) => saveField(C.descripcion.field, value)}
            />
          </article>

          {hasAiNameSuggestion ? (
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
              <DetailSection title={activeSection.title} accent={activeSection.accent} rows={activeSection.rows} onSave={saveField} />
            </div>
          </section>
        </main>
      </section>
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
    router.push(`/shipping-v2/items/${item.id}`);
  }

  return (
    <div className="w-full space-y-2.5">
      <section className="flex flex-col gap-2 rounded-xl border border-[#30312D] bg-[#151613] px-3 py-2 shadow-xl shadow-black/20 lg:flex-row lg:items-center lg:justify-between 2xl:px-4 2xl:py-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <Badge className="h-6 rounded-full border-[#D7FF4F]/35 bg-[#D7FF4F]/10 px-2.5 text-[12px] font-bold uppercase text-[#D7FF4F] hover:bg-[#D7FF4F]/10">
              Read-only
            </Badge>
            <Badge className="h-6 rounded-full border-[#8B73FF]/35 bg-[#8B73FF]/10 px-2.5 text-[12px] font-bold uppercase text-[#B7A8FF] hover:bg-[#8B73FF]/10">
              Shipping Items
            </Badge>
          </div>
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-xl font-semibold leading-tight text-[#F5F5F5] 2xl:text-2xl">Items</h1>
            <p className="text-sm text-[#A7A7A7]">Inventario principal de Shipping V2</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Button asChild variant="outline" size="sm" className="h-9 rounded-lg border-[#3A3A36] bg-[#1E1F1C] px-4 text-sm text-[#F5F5F5] hover:border-[#D7FF4F]/60 hover:bg-[#252622] hover:text-[#D7FF4F]">
            <Link href="/shipping-v2">Dashboard</Link>
          </Button>
          <Button asChild size="sm" className="h-9 rounded-lg bg-[#D7FF4F] px-4 text-sm font-black text-[#151515] hover:bg-[#D7FF4F]/90">
            <Link href="/shipping-v2/items/nuevo">Nuevo Item</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-5">
        <MiniMetric label="Total Items" value={summary.total} tone="lime" />
        <MiniMetric label="Disponibles" value={summary.disponibles} tone="lime" />
        <MiniMetric label="Pendientes de pago" value={summary.pendientesPago} tone="yellow" />
        <MiniMetric label="En transito" value={summary.enTransito} tone="purple" />
        <MiniMetric label="Con novedad" value={summary.conNovedad} tone="orange" />
      </section>

      <Card className="rounded-xl border-[#30312D] bg-[#11120F] p-2 shadow-xl shadow-black/15 2xl:p-3">
        <div className="grid gap-2">
          <div className="grid gap-2 lg:grid-cols-[minmax(320px,1fr)_minmax(180px,220px)_minmax(180px,220px)] lg:items-end">
            <label className="block">
              <span className="text-[12px] font-bold uppercase tracking-normal text-[#8F908A]">Buscar</span>
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="SKU, proveedor, nombre, modelo, marca o serie"
                className="mt-1 h-9 rounded-lg border-[#3A3A36] bg-[#151613] px-3 text-sm text-[#F5F5F5] shadow-inner shadow-black/20 placeholder:text-[#696A64] focus-visible:ring-[#D7FF4F]/35"
              />
            </label>
            <ControlSelect label="Ordenar por" value={sortBy} options={sortOptions} onChange={setSortBy} />
            <ControlSelect label="Agrupar por" value={groupBy} options={groupOptions} onChange={setGroupBy} />
          </div>

          <div className="grid gap-2 xl:grid-cols-4">
            <FilterGroup label="Estado Item" values={filterOptions.estados} selected={estado} onChange={setEstado} />
            <FilterGroup label="Tipo de operación" values={filterOptions.operaciones} selected={tipoOperacion} onChange={setTipoOperacion} />
            <FilterGroup label="Proveedor compra" values={filterOptions.proveedores} selected={proveedorCompra} onChange={setProveedorCompra} />
            <FilterGroup label="Rol general del item" values={filterOptions.tipos} selected={tipoItem} onChange={setTipoItem} />
          </div>
        </div>
      </Card>

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

      <section className="overflow-hidden rounded-xl border border-[#30312D] bg-[#171814] shadow-2xl shadow-black/25">
        <div className="flex flex-col gap-1.5 border-b border-[#30312D] bg-[#20211D] px-3 py-2 sm:flex-row sm:items-center sm:justify-between 2xl:px-4 2xl:py-2.5">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[#F5F5F5]">Listado</h2>
            <p className="text-[13px] text-[#A7A7A7]">
              Total leido: {resolvedItems.length} · Mostrando: {sortedItems.length}
              {visibleGroupCount ? ` · Grupos: ${visibleGroupCount}` : ""}
            </p>
          </div>
          <Badge className="h-6 w-fit rounded-full border-[#D7FF4F]/35 bg-[#D7FF4F]/10 px-2.5 text-[12px] font-bold uppercase text-[#D7FF4F] hover:bg-[#D7FF4F]/10">
            Solo lectura
          </Badge>
        </div>
        <div className="hidden max-w-full overflow-x-auto xl:block">
          <table className="min-w-[1580px] border-separate border-spacing-0 text-left text-[13px] 2xl:min-w-[1660px] 2xl:text-sm">
            <thead className="text-[12px] uppercase tracking-normal text-[#A7A7A7] 2xl:text-[13px]">
              <tr>
                {columns.map((column) => (
                  <th key={column} className="whitespace-nowrap border-b border-[#3A3A36] px-2.5 py-2 font-semibold 2xl:px-3 2xl:py-2.5">{column}</th>
                ))}
              </tr>
            </thead>
            <tbody className="text-[#F5F5F5]">
              {sortedItems.length ? groupedItems.map((group) => (
                <Fragment key={group.key}>
                  {groupBy !== "none" ? (
                    <tr>
                      <td colSpan={columns.length} className="border-b border-[#3A3A36] bg-[#1E1F1C] px-2.5 py-2">
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
                      <td className="whitespace-nowrap border-b border-[#3A3A36]/80 px-2.5 py-2 font-semibold text-[#CFFF3A] 2xl:px-3 2xl:py-2.5">{displayValue(item.sku)}</td>
                      <td className="max-w-[260px] border-b border-[#3A3A36]/80 px-2.5 py-2 2xl:max-w-[320px] 2xl:px-3 2xl:py-2.5"><span className="block truncate">{displayName(item.nombre)}</span></td>
                      <td className="whitespace-nowrap border-b border-[#3A3A36]/80 px-2.5 py-2 2xl:px-3 2xl:py-2.5"><OperationBadge value={item.tipoOperacion} /></td>
                      <td className="whitespace-nowrap border-b border-[#3A3A36]/80 px-2.5 py-2 2xl:px-3 2xl:py-2.5"><EstadoBadge estado={item.estado} /></td>
                      <td className="whitespace-nowrap border-b border-[#3A3A36]/80 px-2.5 py-2 text-[#A7A7A7] 2xl:px-3 2xl:py-2.5">{displayValue(item.tipoItem)}</td>
                      <td className="whitespace-nowrap border-b border-[#3A3A36]/80 px-2.5 py-2 text-[#A7A7A7] 2xl:px-3 2xl:py-2.5">{displayValue(item.categoria)}</td>
                      <td className="max-w-[200px] border-b border-[#3A3A36]/80 px-2.5 py-2 2xl:max-w-[240px] 2xl:px-3 2xl:py-2.5"><span className="block truncate">{displayValue(item.proveedorCompraDisplay)}</span></td>
                      <td className="max-w-[200px] border-b border-[#3A3A36]/80 px-2.5 py-2 2xl:max-w-[240px] 2xl:px-3 2xl:py-2.5"><span className="block truncate">{displayValue(item.proveedorLogisticoDisplay)}</span></td>
                      <td className="max-w-[160px] border-b border-[#3A3A36]/80 px-2.5 py-2 text-[#A7A7A7] 2xl:max-w-[190px] 2xl:px-3 2xl:py-2.5"><span className="block truncate">{displayValue(packingLabel(item))}</span></td>
                      <td className="whitespace-nowrap border-b border-[#3A3A36]/80 px-2.5 py-2 text-right tabular-nums 2xl:px-3 2xl:py-2.5">{formatCurrency(item.costoProveedor)}</td>
                      <td className="whitespace-nowrap border-b border-[#3A3A36]/80 px-2.5 py-2 text-right tabular-nums 2xl:px-3 2xl:py-2.5">{formatCurrency(item.precioVenta)}</td>
                      <td className="whitespace-nowrap border-b border-[#3A3A36]/80 px-2.5 py-2 text-[#A7A7A7] 2xl:px-3 2xl:py-2.5">{formatDate(item.fechaRegistro || item.createdTime)}</td>
                    </tr>
                  ))}
                </Fragment>
              )) : (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-10 text-center text-[#A7A7A7]">
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
                <MobileItemCard key={item.id} item={item} onOpen={() => router.push(`/shipping-v2/items/${item.id}`)} />
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
