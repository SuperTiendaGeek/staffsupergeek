"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type InputHTMLAttributes, type MouseEvent, type ReactNode, type SelectHTMLAttributes } from "react";
import {
  SHIPPING_V2_CATEGORIAS,
  SHIPPING_V2_CONDICIONES,
  SHIPPING_V2_ESTADOS_DESPIECE,
  SHIPPING_V2_ESTADOS_REVISION,
  SHIPPING_V2_ESTADOS_TRIANGULACION,
  SHIPPING_V2_ITEM_ESTADOS,
  SHIPPING_V2_TIPOS_ITEM,
  SHIPPING_V2_TIPOS_OPERACION,
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

type ResolvedItem = ShippingV2Item & {
  proveedorCompraDisplay: string;
  proveedorLogisticoDisplay: string;
};

type DetailRow = {
  label: string;
  value: ReactNode;
};

const ALL = "Todos";

const columns = [
  "SKU interno",
  "Nombre",
  "Tipo de operación",
  "Estado Item",
  "Tipo de item",
  "Proveedor compra",
  "Proveedor logístico",
  "Costo proveedor",
  "Disponible venta",
  "Ubicacion",
  "Fecha registro",
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
    month: "short",
    year: "numeric",
    timeZone: "America/Guayaquil",
  }).format(date);
}

function providerMap(proveedores: ShippingV2Proveedor[]) {
  return new Map(proveedores.map((proveedor) => [proveedor.id, proveedor.nombre]));
}

function safeRelationName(value: string | undefined, namesById: Map<string, string>) {
  if (!value) return "";
  return namesById.get(value) || value;
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

function BooleanBadge({ value }: { value: boolean | null }) {
  if (value === null) {
    return <span className="text-[#A7A7A7]">—</span>;
  }

  return (
    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${value ? "border-[#D7FF4F]/35 bg-[#D7FF4F]/10 text-[#D7FF4F]" : "border-[#3A3A36] bg-[#1E1E1E] text-[#A7A7A7]"}`}>
      {value ? "Si" : "No"}
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
          <p className="text-[11px] font-semibold uppercase tracking-normal text-[#D7FF4F]">{displayValue(item.skuInterno)}</p>
          <h3 className="mt-1 truncate text-base font-semibold text-[#F5F5F5]">{displayName(item.nombre)}</h3>
          <p className="mt-1 text-sm text-[#A7A7A7]">{displayValue(item.modelo || item.marca || item.tipoItem)}</p>
        </div>
        <EstadoBadge estado={item.estado} />
      </div>
      <dl className="mt-4 grid gap-2 text-sm">
        <div className="flex justify-between gap-4"><dt className="text-[#A7A7A7]">Operacion</dt><dd className="text-right text-[#F5F5F5]"><OperationBadge value={item.tipoOperacion} /></dd></div>
        <div className="flex justify-between gap-4"><dt className="text-[#A7A7A7]">Tipo</dt><dd className="text-right text-[#F5F5F5]">{displayValue(item.tipoItem)}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-[#A7A7A7]">Proveedor</dt><dd className="text-right text-[#F5F5F5]">{displayValue(item.proveedorCompraDisplay)}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-[#A7A7A7]">Costo</dt><dd className="text-right text-[#F5F5F5]">{formatCurrency(item.costoProveedor)}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-[#A7A7A7]">Ubicacion</dt><dd className="text-right text-[#F5F5F5]">{displayValue(item.ubicacionActual)}</dd></div>
      </dl>
    </article>
  );
}

function DetailField({ label, value }: DetailRow) {
  return (
    <div className="rounded-[1rem] border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2">
      <dt className="text-[11px] font-medium uppercase tracking-normal text-[#A7A7A7]">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-[#F5F5F5]">{value || "—"}</dd>
    </div>
  );
}

function DetailSection({ title, accent, rows }: { title: string; accent: "lime" | "purple" | "orange" | "yellow"; rows: DetailRow[] }) {
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
        {rows.map((row) => <DetailField key={row.label} {...row} />)}
      </dl>
    </section>
  );
}

function PhotoPlaceholder({ item }: { item: ResolvedItem }) {
  const initials = displayName(item.nombre).slice(0, 2).toUpperCase();

  return (
    <div className="grid h-full min-h-72 place-items-center rounded-[1.5rem] border border-[#3A3A36] bg-[#1E1F1C]">
      <div className="text-center">
        <div className="mx-auto grid h-24 w-24 place-items-center rounded-full border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 text-3xl font-black text-[#D7FF4F]">
          {initials}
        </div>
        <p className="mt-4 text-sm font-medium text-[#A7A7A7]">Sin fotos disponibles</p>
      </div>
    </div>
  );
}

function PhotoGallery({ item }: { item: ResolvedItem }) {
  const [index, setIndex] = useState(0);
  const photos = item.fotos;
  const current = photos[index];

  useEffect(() => {
    setIndex(0);
  }, [item.id]);

  if (!photos.length || !current) {
    return <PhotoPlaceholder item={item} />;
  }

  function move(direction: -1 | 1) {
    setIndex((currentIndex) => (currentIndex + direction + photos.length) % photos.length);
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-[1.5rem] border border-[#3A3A36] bg-[#151515]">
        <img
          src={current.url}
          alt={current.filename || displayName(item.nombre)}
          className="h-72 w-full object-contain"
          loading="lazy"
        />
        <div className="absolute left-3 top-3 rounded-full border border-[#3A3A36] bg-black/55 px-3 py-1 text-xs font-semibold text-[#F5F5F5] backdrop-blur">
          {index + 1} / {photos.length}
        </div>
        {photos.length > 1 ? (
          <div className="absolute bottom-3 right-3 flex gap-2">
            <button type="button" onClick={() => move(-1)} className="grid h-9 w-9 place-items-center rounded-full border border-[#3A3A36] bg-black/60 text-[#F5F5F5] backdrop-blur transition hover:border-[#D7FF4F] hover:text-[#D7FF4F]">‹</button>
            <button type="button" onClick={() => move(1)} className="grid h-9 w-9 place-items-center rounded-full border border-[#3A3A36] bg-black/60 text-[#F5F5F5] backdrop-blur transition hover:border-[#D7FF4F] hover:text-[#D7FF4F]">›</button>
          </div>
        ) : null}
      </div>

      {photos.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((photo, photoIndex) => (
            <button
              key={photo.id || photo.url}
              type="button"
              onClick={() => setIndex(photoIndex)}
              className={`h-16 w-20 shrink-0 overflow-hidden rounded-xl border transition ${photoIndex === index ? "border-[#D7FF4F]" : "border-[#3A3A36]"}`}
            >
              <img src={photo.thumbnailUrl || photo.url} alt={photo.filename || "Foto"} className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
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

type EditState = {
  nombre: string;
  descripcion: string;
  tipoOperacion: string;
  tipoItem: string;
  categoria: string;
  estado: string;
  estadoRevision: string;
  estadoTriangulacion: string;
  estadoDespiece: string;
  proveedorId: string;
  proveedorLogisticoId: string;
  requierePago: boolean;
  requierePacking: boolean;
  afectaInventario: boolean;
  disponibleVenta: boolean;
  costoProveedor: string;
  precioVentaSugerido: string;
  ubicacionActual: string;
  condicion: string;
  observacionesInternas: string;
  observacionVenta: string;
};

function editStateFromItem(item: ResolvedItem): EditState {
  return {
    nombre: item.nombre || "",
    descripcion: item.descripcion || "",
    tipoOperacion: item.tipoOperacion || "",
    tipoItem: item.tipoItem || "",
    categoria: item.categoria || "",
    estado: item.estado || SHIPPING_V2_ITEM_ESTADOS[0] || "",
    estadoRevision: item.estadoRevision || "",
    estadoTriangulacion: item.estadoTriangulacion || "",
    estadoDespiece: item.estadoDespiece || "",
    proveedorId: item.proveedorId || "",
    proveedorLogisticoId: item.proveedorLogisticoId || "",
    requierePago: item.requierePago === true,
    requierePacking: item.requierePacking === true,
    afectaInventario: item.afectaInventario === true,
    disponibleVenta: item.disponibleVenta === true,
    costoProveedor: item.costoProveedor === null ? "" : String(item.costoProveedor),
    precioVentaSugerido: item.precioVentaSugerido === null ? "" : String(item.precioVentaSugerido),
    ubicacionActual: item.ubicacionActual || "",
    condicion: item.condicion || "",
    observacionesInternas: item.observacionesInternas || "",
    observacionVenta: item.observacionVenta || "",
  };
}

function EditInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className="h-11 w-full rounded-full border border-[#3A3A36] bg-[#151515] px-4 text-sm text-[#F5F5F5] outline-none transition focus:border-[#D7FF4F]/70" />;
}

function EditSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className="h-11 w-full rounded-full border border-[#3A3A36] bg-[#151515] px-4 text-sm text-[#F5F5F5] outline-none transition focus:border-[#D7FF4F]/70" />;
}

function EditField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-[11px] font-semibold uppercase tracking-normal text-[#A7A7A7]">{label}</span>
      {children}
    </label>
  );
}

function EditToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`rounded-full border px-3 py-2 text-xs font-medium transition ${checked ? "border-[#D7FF4F] bg-[#D7FF4F] text-[#151515]" : "border-[#3A3A36] bg-[#151515] text-[#F5F5F5] hover:border-[#D7FF4F]/50"}`}
    >
      {label}
    </button>
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
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditState>(() => editStateFromItem(item));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function updateEdit<K extends keyof EditState>(key: K, value: EditState[K]) {
    setEditForm((current) => ({ ...current, [key]: value }));
  }

  async function saveChanges() {
    setSaving(true);
    setError("");

    const response = await fetch(`/api/shipping-v2/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...editForm,
        skuInterno: item.skuInterno,
        skuProveedor: item.skuProveedor || "",
        tipoOperacion: editForm.tipoOperacion,
        tipoItem: editForm.tipoItem,
        categoria: editForm.categoria,
        modelo: item.modelo || "",
        marca: item.marca || "",
        numeroSerie: item.numeroSerie || "",
      }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.success) {
      setError(String(payload.error || "No se pudo actualizar el item."));
      setSaving(false);
      return;
    }

    setSaving(false);
    setEditing(false);
    onSaved(payload.data as ShippingV2Item);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (editing) {
          setEditing(false);
          setError("");
        } else {
          onClose();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [editing, onClose]);

  const displayPrice = item.precioVenta ?? item.precioVentaSugerido;
  const displayPriceLabel = item.precioVenta !== null ? "Precio venta final" : "Precio venta sugerido";

  const sections: Array<{ title: string; accent: "lime" | "purple" | "orange" | "yellow"; rows: DetailRow[] }> = [
    {
      title: "Identificacion",
      accent: "lime",
      rows: [
        { label: "Item ID", value: displayValue(item.itemId || item.id) },
        { label: "SKU interno", value: displayValue(item.skuInterno) },
        { label: "SKU proveedor", value: displayValue(item.skuProveedor) },
        { label: "Metodo asignacion SKU", value: displayValue(item.metodoAsignacionSku) },
        { label: "Proveedor usado como interno", value: displayBoolean(item.skuProveedorUsadoComoInterno) },
        { label: "SKU duplicado", value: displayBoolean(item.skuDuplicadoDetectado) },
        { label: "SKU original sugerido", value: displayValue(item.skuOriginalSugerido) },
        { label: "Numero de serie", value: displayValue(item.numeroSerie) },
        { label: "Marca", value: displayValue(item.marca) },
        { label: "Modelo", value: displayValue(item.modelo) },
      ],
    },
    {
      title: "Informacion general",
      accent: "purple",
      rows: [
        { label: "Nombre", value: displayName(item.nombre) },
        { label: "Descripcion", value: displayValue(item.descripcion) },
        { label: "Categoria", value: displayValue(item.categoria) },
        { label: "Tipo de item", value: displayValue(item.tipoItem) },
        { label: "Condicion", value: displayValue(item.condicion) },
        { label: "Cantidad", value: displayValue(item.cantidad ?? item.qty) },
        { label: "Unidad", value: displayValue(item.unidad) },
      ],
    },
    {
      title: "Estado e inventario",
      accent: "yellow",
      rows: [
        { label: "Estado Item", value: <EstadoBadge estado={item.estado} /> },
        { label: "Estado revision", value: displayValue(item.estadoRevision) },
        { label: "Estado triangulacion", value: displayValue(item.estadoTriangulacion) },
        { label: "Estado despiece", value: displayValue(item.estadoDespiece) },
        { label: "Afecta inventario", value: displayBoolean(item.afectaInventario) },
        { label: "Disponible venta", value: displayBoolean(item.disponibleVenta) },
        { label: "Reservado", value: displayBoolean(item.reservado) },
        { label: "Ubicacion actual", value: displayValue(item.ubicacionActual) },
        { label: "Origen fisico actual", value: displayValue(item.origenFisicoActual) },
      ],
    },
    {
      title: "Proveedor y compra",
      accent: "orange",
      rows: [
        { label: "Proveedor compra", value: displayValue(item.proveedorCompraDisplay) },
        { label: "Proveedor logistico", value: displayValue(item.proveedorLogisticoDisplay) },
        { label: "Requiere pago", value: displayBoolean(item.requierePago) },
        { label: "Pago relacionado", value: displayValue(item.pagoId) },
        { label: "Costo proveedor", value: formatCurrency(item.costoProveedor) },
        { label: "Es regalo", value: displayBoolean(item.esRegalo) },
      ],
    },
    {
      title: "Packing y tracking",
      accent: "purple",
      rows: [
        { label: "Requiere packing", value: displayBoolean(item.requierePacking) },
        { label: "Packing relacionado", value: displayValue(item.packingId) },
        { label: "Tracking directo", value: displayValue(item.trackingDirecto) },
        { label: "Tracking hacia intermediario", value: displayValue(item.trackingHaciaIntermediario) },
        { label: "Tracking desde intermediario", value: displayValue(item.trackingDesdeIntermediario) },
      ],
    },
    {
      title: "Costos y venta",
      accent: "lime",
      rows: [
        { label: "Costo proveedor", value: formatCurrency(item.costoProveedor) },
        { label: "Costo asignado despiece", value: formatCurrency(item.costoAsignadoDespiece) },
        { label: "Costo logistico asignado", value: formatCurrency(item.costoLogisticoAsignado) },
        { label: "Costo total estimado", value: formatCurrency(item.costoTotalEstimado) },
        { label: "Precio venta sugerido", value: formatCurrency(item.precioVentaSugerido) },
        { label: "Precio venta final", value: formatCurrency(item.precioVenta) },
      ],
    },
    {
      title: "Despiece y repuestos",
      accent: "yellow",
      rows: [
        { label: "Item padre", value: displayValue(item.itemPadreId) },
        { label: "Items hijos", value: item.itemHijoIds.length ? item.itemHijoIds.join(", ") : "—" },
        { label: "Motivo despiece", value: displayValue(item.motivoDespiece) },
        { label: "Fecha despiece", value: formatDate(item.fechaDespiece) },
        { label: "Responsable despiece", value: displayValue(item.responsableDespiece) },
        { label: "Parte recuperada", value: displayBoolean(item.esParteRecuperada) },
        { label: "Es repuesto", value: displayBoolean(item.esRepuesto) },
        { label: "Uso local", value: displayBoolean(item.usoLocal) },
      ],
    },
    {
      title: "Observaciones y evidencias",
      accent: "orange",
      rows: [
        { label: "Observaciones internas", value: displayValue(item.observacionesInternas) },
        { label: "Observacion venta", value: displayValue(item.observacionVenta) },
        { label: "Evidencias", value: attachmentList(item.evidencias) },
      ],
    },
    {
      title: "Migracion",
      accent: "purple",
      rows: [
        { label: "Legacy Item ID", value: displayValue(item.legacyItemId) },
        { label: "Legacy Pago ID", value: displayValue(item.legacyPagoId) },
        { label: "Legacy Packing ID", value: displayValue(item.legacyPackingId) },
        { label: "Fuente migracion", value: displayValue(item.fuenteMigracion) },
        { label: "Estado migracion", value: displayValue(item.estadoMigracion) },
      ],
    },
    {
      title: "Auditoria",
      accent: "lime",
      rows: [
        { label: "Fecha registro", value: formatDate(item.fechaRegistro || item.createdTime) },
        { label: "Registrado por", value: displayValue(item.registradoPor) },
        { label: "Ultima actualizacion", value: formatDate(item.ultimaActualizacion) },
        { label: "Actualizado por", value: displayValue(item.actualizadoPor) },
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
            <p className="text-xs font-semibold uppercase tracking-normal text-[#D7FF4F]">{displayValue(item.skuInterno)}</p>
            <h2 className="mt-1 truncate text-2xl font-semibold text-[#F5F5F5]">{displayName(item.nombre)}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!editing ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-full border border-[#D7FF4F]/60 bg-[#D7FF4F]/10 px-4 py-2 text-sm font-semibold text-[#D7FF4F] transition hover:bg-[#D7FF4F] hover:text-[#151515]"
              >
                Editar
              </button>
            ) : null}
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
            <PhotoGallery item={item} />
            <div className="rounded-[1.5rem] border border-[#3A3A36] bg-[#2A2B27] p-5">
              <div className="flex flex-wrap gap-2">
                <EstadoBadge estado={item.estado} />
                <OperationBadge value={item.tipoOperacion} />
                <AvailabilityBadge item={item} />
              </div>
              <h3 className="mt-5 text-3xl font-semibold text-[#F5F5F5]">{displayName(item.nombre)}</h3>
              <p className="mt-2 text-sm leading-6 text-[#A7A7A7]">{displayValue(item.descripcion, "Sin descripcion registrada.")}</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[1.25rem] bg-[#D7FF4F] p-4 text-[#151515]">
                  <p className="text-xs font-bold uppercase tracking-normal">{displayPriceLabel}</p>
                  <p className="mt-2 text-3xl font-semibold tabular-nums">{formatCurrency(displayPrice)}</p>
                </div>
                <div className="rounded-[1.25rem] border border-[#3A3A36] bg-[#151515] p-4">
                  <p className="text-xs font-semibold uppercase tracking-normal text-[#A7A7A7]">Costo proveedor</p>
                  <p className="mt-2 text-2xl font-semibold text-[#F5F5F5] tabular-nums">{formatCurrency(item.costoProveedor)}</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {item.disponibleVenta ? <BooleanBadge value={item.disponibleVenta} /> : null}
                {item.reservado ? <span className="rounded-full border border-[#F4E85B]/35 bg-[#F4E85B]/12 px-3 py-1 text-xs text-[#F4E85B]">Reservado</span> : null}
                {item.usoLocal ? <span className="rounded-full border border-[#8B73FF]/35 bg-[#8B73FF]/12 px-3 py-1 text-xs text-[#C9BFFF]">Uso local</span> : null}
                {item.esRepuesto ? <span className="rounded-full border border-[#8B73FF]/35 bg-[#8B73FF]/12 px-3 py-1 text-xs text-[#C9BFFF]">Repuesto</span> : null}
                {item.conNovedad ? <span className="rounded-full border border-[#FF914D]/35 bg-[#FF914D]/12 px-3 py-1 text-xs text-[#FFB07A]">Con novedad</span> : null}
              </div>
            </div>
          </section>

          {error ? (
            <div className="mt-5 rounded-[1.25rem] border border-[#FF914D]/35 bg-[#FF914D]/10 px-4 py-3 text-sm text-[#FFB07A]">{error}</div>
          ) : null}

          {editing ? (
            <section className="mt-5 rounded-[1.5rem] border border-[#3A3A36] bg-[#2A2B27] p-4">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-[#F5F5F5]">Edición básica</h3>
                  <p className="mt-1 text-sm text-[#A7A7A7]">No modifica pagos, packings, relaciones legacy, fotos ni evidencias.</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setEditing(false); setEditForm(editStateFromItem(item)); setError(""); }} className="rounded-full border border-[#3A3A36] bg-[#151515] px-4 py-2 text-sm text-[#F5F5F5] transition hover:border-[#D7FF4F]/60">
                    Cancelar
                  </button>
                  <button type="button" disabled={saving} onClick={saveChanges} className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-2 text-sm font-bold text-[#151515] transition disabled:cursor-not-allowed disabled:opacity-60">
                    {saving ? "Guardando..." : "Guardar cambios"}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <EditField label="Nombre del item">
                  <EditInput value={editForm.nombre} onChange={(event) => updateEdit("nombre", event.target.value)} />
                </EditField>
                <EditField label="Estado Item">
                  <EditSelect value={editForm.estado} onChange={(event) => updateEdit("estado", event.target.value)}>
                    {SHIPPING_V2_ITEM_ESTADOS.map((option) => <option key={option}>{option}</option>)}
                  </EditSelect>
                </EditField>
                <EditField label="Tipo de operación">
                  <EditSelect value={editForm.tipoOperacion} onChange={(event) => updateEdit("tipoOperacion", event.target.value)}>
                    {SHIPPING_V2_TIPOS_OPERACION.map((option) => <option key={option}>{option}</option>)}
                  </EditSelect>
                </EditField>
                <EditField label="Tipo de item">
                  <EditSelect value={editForm.tipoItem} onChange={(event) => updateEdit("tipoItem", event.target.value)}>
                    {SHIPPING_V2_TIPOS_ITEM.map((option) => <option key={option}>{option}</option>)}
                  </EditSelect>
                </EditField>
                <EditField label="Categoría">
                  <EditSelect value={editForm.categoria} onChange={(event) => updateEdit("categoria", event.target.value)}>
                    <option value="">—</option>
                    {SHIPPING_V2_CATEGORIAS.map((option) => <option key={option}>{option}</option>)}
                  </EditSelect>
                </EditField>
                <EditField label="Condición">
                  <EditSelect value={editForm.condicion} onChange={(event) => updateEdit("condicion", event.target.value)}>
                    <option value="">—</option>
                    {SHIPPING_V2_CONDICIONES.map((option) => <option key={option}>{option}</option>)}
                  </EditSelect>
                </EditField>
                <EditField label="Estado revisión">
                  <EditSelect value={editForm.estadoRevision} onChange={(event) => updateEdit("estadoRevision", event.target.value)}>
                    <option value="">—</option>
                    {SHIPPING_V2_ESTADOS_REVISION.map((option) => <option key={option}>{option}</option>)}
                  </EditSelect>
                </EditField>
                <EditField label="Estado triangulación">
                  <EditSelect value={editForm.estadoTriangulacion} onChange={(event) => updateEdit("estadoTriangulacion", event.target.value)}>
                    <option value="">—</option>
                    {SHIPPING_V2_ESTADOS_TRIANGULACION.map((option) => <option key={option}>{option}</option>)}
                  </EditSelect>
                </EditField>
                <EditField label="Estado despiece">
                  <EditSelect value={editForm.estadoDespiece} onChange={(event) => updateEdit("estadoDespiece", event.target.value)}>
                    <option value="">—</option>
                    {SHIPPING_V2_ESTADOS_DESPIECE.map((option) => <option key={option}>{option}</option>)}
                  </EditSelect>
                </EditField>
                <EditField label="Proveedor compra">
                  <EditSelect value={editForm.proveedorId} onChange={(event) => updateEdit("proveedorId", event.target.value)}>
                    <option value="">Sin proveedor</option>
                    {proveedores.map((proveedor) => <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}</option>)}
                  </EditSelect>
                </EditField>
                <EditField label="Proveedor logístico">
                  <EditSelect value={editForm.proveedorLogisticoId} onChange={(event) => updateEdit("proveedorLogisticoId", event.target.value)}>
                    <option value="">Sin proveedor logístico</option>
                    {proveedores.map((proveedor) => <option key={proveedor.id} value={proveedor.id}>{proveedor.nombre}</option>)}
                  </EditSelect>
                </EditField>
                <EditField label="Ubicación actual">
                  <EditInput value={editForm.ubicacionActual} onChange={(event) => updateEdit("ubicacionActual", event.target.value)} />
                </EditField>
                <EditField label="Costo proveedor">
                  <EditInput type="number" step="0.01" value={editForm.costoProveedor} onChange={(event) => updateEdit("costoProveedor", event.target.value)} />
                </EditField>
                <EditField label="Precio venta sugerido">
                  <EditInput type="number" step="0.01" value={editForm.precioVentaSugerido} onChange={(event) => updateEdit("precioVentaSugerido", event.target.value)} />
                </EditField>
                <div className="flex flex-wrap content-end gap-2">
                  <EditToggle label="Requiere pago" checked={editForm.requierePago} onChange={(checked) => updateEdit("requierePago", checked)} />
                  <EditToggle label="Requiere packing" checked={editForm.requierePacking} onChange={(checked) => updateEdit("requierePacking", checked)} />
                  <EditToggle label="Afecta inventario" checked={editForm.afectaInventario} onChange={(checked) => updateEdit("afectaInventario", checked)} />
                  <EditToggle label="Disponible venta" checked={editForm.disponibleVenta} onChange={(checked) => updateEdit("disponibleVenta", checked)} />
                </div>
                <label className="block space-y-2 md:col-span-2 xl:col-span-3">
                  <span className="text-[11px] font-semibold uppercase tracking-normal text-[#A7A7A7]">Descripción</span>
                  <textarea value={editForm.descripcion} onChange={(event) => updateEdit("descripcion", event.target.value)} className="min-h-24 w-full rounded-[1.25rem] border border-[#3A3A36] bg-[#151515] px-4 py-3 text-sm text-[#F5F5F5] outline-none transition focus:border-[#D7FF4F]/70" />
                </label>
                <label className="block space-y-2 md:col-span-2">
                  <span className="text-[11px] font-semibold uppercase tracking-normal text-[#A7A7A7]">Observaciones internas</span>
                  <textarea value={editForm.observacionesInternas} onChange={(event) => updateEdit("observacionesInternas", event.target.value)} className="min-h-24 w-full rounded-[1.25rem] border border-[#3A3A36] bg-[#151515] px-4 py-3 text-sm text-[#F5F5F5] outline-none transition focus:border-[#D7FF4F]/70" />
                </label>
                <label className="block space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-normal text-[#A7A7A7]">Observación para venta</span>
                  <textarea value={editForm.observacionVenta} onChange={(event) => updateEdit("observacionVenta", event.target.value)} className="min-h-24 w-full rounded-[1.25rem] border border-[#3A3A36] bg-[#151515] px-4 py-3 text-sm text-[#F5F5F5] outline-none transition focus:border-[#D7FF4F]/70" />
                </label>
              </div>
            </section>
          ) : (
            <div className="mt-5 grid gap-4">
              {sections.map((section) => <DetailSection key={section.title} {...section} />)}
            </div>
          )}
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
  const [selectedItem, setSelectedItem] = useState<ResolvedItem | null>(null);
  const [notice, setNotice] = useState("");

  const namesById = useMemo(() => providerMap(proveedores), [proveedores]);

  const resolvedItems = useMemo<ResolvedItem[]>(() => items.map((item) => ({
    ...item,
    proveedorCompraDisplay: item.proveedorNombre || safeRelationName(item.proveedorId, namesById),
    proveedorLogisticoDisplay: item.proveedorLogisticoNombre || safeRelationName(item.proveedorLogisticoId, namesById),
  })), [items, namesById]);

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
        item.id,
        item.itemId,
        item.skuInterno,
        item.codigo,
        item.skuProveedor,
        item.nombre,
        item.modelo,
        item.marca,
        item.numeroSerie,
        item.descripcion,
        item.categoria,
        item.proveedorCompraDisplay,
        item.proveedorLogisticoDisplay,
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
            <span className="text-[11px] font-semibold uppercase tracking-normal text-[#A7A7A7]">Buscar por SKU, Item ID, nombre, descripcion, categoria, proveedor o serie</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="SKU interno, SKU proveedor, Item ID, proveedor, descripcion, modelo o serie"
              className="mt-2 h-12 w-full rounded-full border border-[#3A3A36] bg-[#151515] px-5 text-sm text-[#F5F5F5] outline-none placeholder:text-[#A7A7A7] shadow-inner shadow-black/20 focus:border-[#D7FF4F]/70"
            />
          </label>

          <div className="grid gap-4 xl:grid-cols-4">
            <FilterGroup label="Estado Item" values={filterOptions.estados} selected={estado} onChange={setEstado} />
            <FilterGroup label="Tipo de operación" values={filterOptions.operaciones} selected={tipoOperacion} onChange={setTipoOperacion} />
            <FilterGroup label="Proveedor compra" values={filterOptions.proveedores} selected={proveedorCompra} onChange={setProveedorCompra} />
            <FilterGroup label="Tipo de item" values={filterOptions.tipos} selected={tipoItem} onChange={setTipoItem} />
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
            <p className="mt-1 text-sm text-[#A7A7A7]">Total leido: {resolvedItems.length} · Mostrando: {filteredItems.length}</p>
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
              {filteredItems.length ? filteredItems.map((item) => (
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
                  <td className="whitespace-nowrap border-b border-[#3A3A36]/80 px-4 py-3 font-semibold text-[#CFFF3A]">{displayValue(item.skuInterno)}</td>
                  <td className="max-w-[280px] border-b border-[#3A3A36]/80 px-4 py-3"><span className="block truncate">{displayName(item.nombre)}</span></td>
                  <td className="whitespace-nowrap border-b border-[#3A3A36]/80 px-4 py-3"><OperationBadge value={item.tipoOperacion} /></td>
                  <td className="whitespace-nowrap border-b border-[#3A3A36]/80 px-4 py-3"><EstadoBadge estado={item.estado} /></td>
                  <td className="whitespace-nowrap border-b border-[#3A3A36]/80 px-4 py-3 text-[#A7A7A7]">{displayValue(item.tipoItem)}</td>
                  <td className="max-w-[220px] border-b border-[#3A3A36]/80 px-4 py-3"><span className="block truncate">{displayValue(item.proveedorCompraDisplay)}</span></td>
                  <td className="max-w-[220px] border-b border-[#3A3A36]/80 px-4 py-3"><span className="block truncate">{displayValue(item.proveedorLogisticoDisplay)}</span></td>
                  <td className="whitespace-nowrap border-b border-[#3A3A36]/80 px-4 py-3 text-right tabular-nums">{formatCurrency(item.costoProveedor)}</td>
                  <td className="whitespace-nowrap border-b border-[#3A3A36]/80 px-4 py-3"><BooleanBadge value={item.disponibleVenta} /></td>
                  <td className="whitespace-nowrap border-b border-[#3A3A36]/80 px-4 py-3 text-[#A7A7A7]">{displayValue(item.ubicacionActual)}</td>
                  <td className="whitespace-nowrap border-b border-[#3A3A36]/80 px-4 py-3 text-[#A7A7A7]">{formatDate(item.fechaRegistro || item.createdTime)}</td>
                </tr>
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
          {filteredItems.length ? filteredItems.map((item) => (
            <MobileItemCard key={item.id} item={item} onOpen={() => setSelectedItem(item)} />
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
              proveedorCompraDisplay: updatedItem.proveedorNombre || safeRelationName(updatedItem.proveedorId, namesById),
              proveedorLogisticoDisplay: updatedItem.proveedorLogisticoNombre || safeRelationName(updatedItem.proveedorLogisticoId, namesById),
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
