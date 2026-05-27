"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import { InlineEditableField } from "@/components/shipping-v2/InlineEditableField";
import { createShippingV2ProveedorLabelMap, resolveShippingV2ProveedorLabel } from "@/lib/shipping-v2/provider-labels";
import { SHIPPING_V2_PACKING_TIPOS, SHIPPING_V2_PACKING_TRANSPORTISTAS_USA, SHIPPING_V2_PACKING_UNIDADES_PESO, type ShippingV2Item, type ShippingV2Packing, type ShippingV2Proveedor } from "@/types/shipping-v2";

type Props = { packing: ShippingV2Packing; candidates: ShippingV2Item[]; proveedores: ShippingV2Proveedor[] };
type EditablePackingField = "nombre" | "tipo" | "observaciones" | "proveedorResponsableId" | "proveedorLogisticoEcId" | "trackingUsa" | "transportistaUsa" | "trackingEc" | "peso" | "unidadPeso";
type SaveState = Record<string, "saving" | "saved" | "error" | undefined>;

function display(value?: string | number | null) {
  if (value === null || value === undefined) return "-";
  const text = String(value).trim();
  return text || "-";
}

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-EC", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(value);
}

function formatWeight(peso: number | null | undefined, unidadPeso?: string) {
  if (peso === null || peso === undefined) return "Sin registrar";
  return `${new Intl.NumberFormat("es-EC", { maximumFractionDigits: 2 }).format(peso)}${unidadPeso ? ` ${unidadPeso}` : ""}`;
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function isOpen(status: string) {
  return normalize(status) === "en proceso";
}

function itemSearchText(item: ShippingV2Item, providerLabel: string, logisticsProviderLabel: string) {
  return [item.sku, item.nombre, item.estado, item.tipoOperacion, item.categoria, providerLabel, logisticsProviderLabel, item.modoLogistico].join(" ").toLowerCase();
}

function SummaryBadge({ label, value, accent }: { label: string; value: string; accent?: "status" | "items" }) {
  return (
    <div className="min-w-0 rounded-[1rem] border border-[#3A3A36] bg-[#171816]/80 px-4 py-3">
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-normal text-[#A7A7A7]">
        {accent === "items" ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 text-[#A7A7A7]">
            <path d="M12 3 4.5 7.2v9.6L12 21l7.5-4.2V7.2L12 3Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="m4.8 7.4 7.2 4.1 7.2-4.1M12 11.5v9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
        ) : null}
        {label}
      </p>
      <p className="mt-2 flex min-h-6 items-center gap-2 break-words text-sm font-semibold leading-tight text-[#F5F5F5]">
        {accent === "status" ? <span className="h-2.5 w-2.5 rounded-full bg-[#7CFF4F] shadow-[0_0_14px_rgba(124,255,79,0.55)]" /> : null}
        {value}
      </p>
    </div>
  );
}

function WeightSummaryBadge({
  peso,
  canEditWeight,
  onSaveWeight,
}: {
  peso: number | null;
  canEditWeight: boolean;
  onSaveWeight: (value: string | number | boolean | null) => Promise<void>;
}) {
  return (
    <div className="min-w-0 rounded-[1rem] border border-[#3A3A36] bg-[#171816]/80 px-4 py-3">
      <InlineEditableField
        label="Peso"
        value={peso}
        type="number"
        readOnly={!canEditWeight}
        displayValue={formatWeight(peso)}
        className="rounded-lg transition"
        labelClassName="text-[11px] font-semibold uppercase tracking-normal text-[#A7A7A7]"
        valueClassName="mt-2 min-h-6 break-words text-sm font-semibold leading-tight text-[#F5F5F5] tabular-nums"
        onSave={onSaveWeight}
      />
    </div>
  );
}

function HeaderProviderSelect({
  label = "Proveedor responsable",
  value,
  options,
  disabled,
  status,
  onSave,
}: {
  label?: string;
  value?: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  status?: "saving" | "saved" | "error";
  onSave: (value: string) => void;
}) {
  return (
    <label className="block min-w-0 rounded-[1rem] border border-[#3A3A36] bg-[#171816]/80 px-4 py-3">
      <span className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-normal text-[#A7A7A7]">
        {label}
        <SaveBadge status={status} />
      </span>
      <select
        value={value || ""}
        disabled={disabled}
        onChange={(event) => onSave(event.target.value)}
        className="mt-2 h-10 w-full rounded-full border border-[#4A4A45] bg-[#191A18]/80 px-4 text-sm font-semibold text-[#F5F5F5] outline-none transition hover:border-[#D7FF4F]/45 focus:border-[#D7FF4F]/70 disabled:opacity-70"
      >
        {options.map((option) => <option key={option.value || "empty"} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function HeaderFooterSelect({
  label,
  value,
  options,
  disabled,
  status,
  onSave,
}: {
  label: string;
  value?: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  status?: "saving" | "saved" | "error";
  onSave: (value: string) => void;
}) {
  return (
    <label className="inline-flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-normal text-[#A7A7A7]">{label}:</span>
      <select
        value={value || ""}
        disabled={disabled}
        onChange={(event) => onSave(event.target.value)}
        className="h-8 min-w-24 rounded-full border border-[#4A4A45] bg-[#191A18]/80 px-3 text-sm font-semibold text-[#F5F5F5] outline-none transition hover:border-[#D7FF4F]/45 focus:border-[#D7FF4F]/70 disabled:opacity-70"
      >
        {options.map((option) => <option key={option.value || "empty"} value={option.value}>{option.label}</option>)}
      </select>
      <SaveBadge status={status} />
    </label>
  );
}

function SaveBadge({ status }: { status?: "saving" | "saved" | "error" }) {
  if (!status) return null;
  const label = status === "saving" ? "Guardando..." : status === "saved" ? "Guardado" : "Error";
  const color = status === "error" ? "text-[#FFB07A]" : "text-[#D7FF4F]";
  return <span className={`text-[11px] font-semibold ${color}`}>{label}</span>;
}

function EditableTextField({
  label,
  value,
  disabled,
  status,
  multiline,
  help,
  onSave,
}: {
  label: string;
  value?: string;
  disabled?: boolean;
  status?: "saving" | "saved" | "error";
  multiline?: boolean;
  help?: string;
  onSave: (value: string) => void;
}) {
  const [localValue, setLocalValue] = useState(value || "");
  useEffect(() => setLocalValue(value || ""), [value]);
  const commit = () => {
    if (!disabled && localValue !== (value || "")) onSave(localValue);
  };
  return (
    <label className="block rounded-[1rem] border border-[#3A3A36] bg-[#151515] px-4 py-3">
      <span className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-normal text-[#A7A7A7]">
        {label}
        <SaveBadge status={status} />
      </span>
      {multiline ? (
        <textarea
          value={localValue}
          disabled={disabled}
          onChange={(event) => setLocalValue(event.target.value)}
          onBlur={commit}
          className="mt-2 min-h-20 w-full resize-y rounded-[0.85rem] border border-[#3A3A36] bg-[#101010] px-3 py-2 text-sm font-medium text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70 disabled:opacity-70"
        />
      ) : (
        <input
          value={localValue}
          disabled={disabled}
          onChange={(event) => setLocalValue(event.target.value)}
          onBlur={commit}
          className="mt-2 h-10 w-full rounded-full border border-[#3A3A36] bg-[#101010] px-3 text-sm font-medium text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70 disabled:opacity-70"
        />
      )}
      {help ? <span className="mt-2 block text-xs font-normal normal-case text-[#A7A7A7]">{help}</span> : null}
    </label>
  );
}

function EditableSelectField({
  label,
  value,
  options,
  disabled,
  status,
  onSave,
}: {
  label: string;
  value?: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  status?: "saving" | "saved" | "error";
  onSave: (value: string) => void;
}) {
  return (
    <label className="block rounded-[1rem] border border-[#3A3A36] bg-[#151515] px-4 py-3">
      <span className="flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-normal text-[#A7A7A7]">
        {label}
        <SaveBadge status={status} />
      </span>
      <select
        value={value || ""}
        disabled={disabled}
        onChange={(event) => onSave(event.target.value)}
        className="mt-2 h-10 w-full rounded-full border border-[#3A3A36] bg-[#101010] px-3 text-sm font-medium text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70 disabled:opacity-70"
      >
        {options.map((option) => <option key={option.value || "empty"} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function canUseAsEcLogisticsProvider(provider: ShippingV2Proveedor) {
  const normalizedEstado = normalize(provider.estado || "");
  const normalizedTipo = normalize(provider.tipoProveedor || "");
  return normalizedEstado === "activo" && (normalizedTipo === "logistico" || Boolean(provider.puedeArmarPackings || provider.permiteTriangulacion));
}

function ItemCard({
  item,
  providerLabel,
  logisticsProviderLabel,
  action,
  draggable,
  onDragStart,
}: {
  item: ShippingV2Item;
  providerLabel: string;
  logisticsProviderLabel?: string;
  action: ReactNode;
  draggable?: boolean;
  onDragStart?: (event: DragEvent<HTMLElement>) => void;
}) {
  return (
    <article
      draggable={draggable}
      onDragStart={onDragStart}
      className={`rounded-[1rem] border border-[#3A3A36] bg-[#151515] p-4 transition ${draggable ? "cursor-grab hover:border-[#D7FF4F]/45 active:cursor-grabbing" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#D7FF4F]">{display(item.sku)}</p>
          <p className="mt-1 break-words text-sm font-semibold text-[#F5F5F5]">{display(item.nombre)}</p>
        </div>
        {action}
      </div>
      <div className="mt-3 grid gap-2 text-xs text-[#A7A7A7] sm:grid-cols-2">
        <p>Estado: <span className="text-[#F5F5F5]">{display(item.estado)}</span></p>
        <p>Operación: <span className="text-[#F5F5F5]">{display(item.tipoOperacion)}</span></p>
        <p>Proveedor compra: <span className="text-[#F5F5F5]">{display(providerLabel || item.proveedorNombre)}</span></p>
        <p>Proveedor logístico: <span className="text-[#F5F5F5]">{display(logisticsProviderLabel || item.proveedorLogisticoNombre)}</span></p>
        <p>Modo: <span className="text-[#F5F5F5]">{display(item.modoLogistico)}</span></p>
        <p>Categoría: <span className="text-[#F5F5F5]">{display(item.categoria)}</span></p>
        <p>Costo: <span className="text-[#F5F5F5]">{formatCurrency(item.costoProveedor)}</span></p>
      </div>
    </article>
  );
}

export function ShippingV2PackingDetailClient({ packing: initialPacking, candidates, proveedores }: Props) {
  const router = useRouter();
  const [packing, setPacking] = useState(initialPacking);
  const [availableItems, setAvailableItems] = useState(candidates.filter((item) => !initialPacking.itemIds.includes(item.id)));
  const [query, setQuery] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [busyItemId, setBusyItemId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>({});
  const canEditItems = isOpen(packing.estado);
  const providerLabels = useMemo(() => createShippingV2ProveedorLabelMap(proveedores), [proveedores]);
  const responsableLabel = resolveShippingV2ProveedorLabel(packing.proveedorResponsableId, providerLabels);
  const logisticsProviders = useMemo(() => proveedores.filter(canUseAsEcLogisticsProvider), [proveedores]);
  const providerOptions = useMemo(
    () => [{ value: "", label: "Sin proveedor" }, ...proveedores.map((provider) => ({ value: provider.id, label: provider.label || provider.proveedorId || provider.nombre || provider.id }))],
    [proveedores]
  );
  const logisticsProviderOptions = useMemo(
    () => [{ value: "", label: "Sin proveedor logístico EC" }, ...logisticsProviders.map((provider) => ({ value: provider.id, label: provider.label || provider.proveedorId || provider.nombre || provider.id }))],
    [logisticsProviders]
  );
  const packingTypeOptions = useMemo(() => SHIPPING_V2_PACKING_TIPOS.map((option) => ({ value: option, label: option })), []);
  const transportistaUsaOptions = useMemo(() => SHIPPING_V2_PACKING_TRANSPORTISTAS_USA.map((option) => ({ value: option, label: option })), []);
  const unidadPesoOptions = useMemo(() => [{ value: "", label: "Sin unidad" }, ...SHIPPING_V2_PACKING_UNIDADES_PESO.map((option) => ({ value: option, label: option }))], []);

  const visibleCandidates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return availableItems.filter((item) => {
      const providerLabel = resolveShippingV2ProveedorLabel(item.proveedorId, providerLabels) || item.proveedorNombre || "";
      const logisticsProviderLabel = resolveShippingV2ProveedorLabel(item.proveedorLogisticoId, providerLabels) || item.proveedorLogisticoNombre || "";
      return !needle || itemSearchText(item, providerLabel, logisticsProviderLabel).includes(needle);
    });
  }, [availableItems, providerLabels, query]);

  function canEditField(field: EditablePackingField) {
    const state = normalize(packing.estado);
    if (state === "en proceso") return true;
    if (state === "cerrado") return ["proveedorLogisticoEcId", "trackingUsa", "transportistaUsa", "trackingEc", "peso", "unidadPeso"].includes(field);
    if (state === "en transito") return ["trackingUsa", "trackingEc", "peso", "unidadPeso"].includes(field);
    return false;
  }

  async function savePackingField(field: EditablePackingField, value: string | number | null) {
    if (!canEditField(field)) return;
    const previousPacking = packing;
    setSaveState((current) => ({ ...current, [field]: "saving" }));
    setError("");
    setPacking((current) => ({ ...current, [field]: value }));
    try {
      const response = await fetch(`/api/shipping-v2/packings/${packing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(String(payload.error || "No se pudo guardar el cambio."));
      setPacking(payload.data as ShippingV2Packing);
      setSaveState((current) => ({ ...current, [field]: "saved" }));
      window.setTimeout(() => setSaveState((current) => ({ ...current, [field]: undefined })), 1400);
    } catch (saveError) {
      setPacking(previousPacking);
      setSaveState((current) => ({ ...current, [field]: "error" }));
      setError(saveError instanceof Error ? saveError.message : "Error inesperado.");
    }
  }

  async function saveInlinePackingField(field: EditablePackingField, value: string | number | boolean | null) {
    if (!canEditField(field)) throw new Error("Este campo no se puede editar en el estado actual.");
    if (field === "peso" && typeof value === "number" && value < 0) throw new Error("El peso no puede ser negativo.");
    const previousPacking = packing;
    setError("");
    setPacking((current) => ({ ...current, [field]: value }));
    try {
      const response = await fetch(`/api/shipping-v2/packings/${packing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(String(payload.error || "No se pudo guardar el cambio."));
      setPacking(payload.data as ShippingV2Packing);
    } catch (saveError) {
      setPacking(previousPacking);
      const message = saveError instanceof Error ? saveError.message : "Error al guardar.";
      setError(message);
      throw new Error(message);
    }
  }

  async function addItems(itemIds: string[]) {
    if (!canEditItems || !itemIds.length || busy) return;
    const uniqueItemIds = Array.from(new Set(itemIds));
    const itemsToAdd = availableItems.filter((item) => uniqueItemIds.includes(item.id));
    if (!itemsToAdd.length) return;
    const previousPacking = packing;
    const previousAvailableItems = availableItems;
    const optimisticItems = itemsToAdd.map((item) => ({
      ...item,
      estado: "En packing",
      modoLogistico: "Asignar a packing existente",
      packingId: packing.id,
      requierePacking: true,
    }));

    setBusy(true);
    setBusyItemId(uniqueItemIds[0] || "");
    setError("");
    setAvailableItems((current) => current.filter((item) => !uniqueItemIds.includes(item.id)));
    setPacking((current) => {
      const nextItems = [
        ...current.items.filter((item) => !uniqueItemIds.includes(item.id)),
        ...optimisticItems,
      ];
      return {
        ...current,
        items: nextItems,
        itemIds: Array.from(new Set([...current.itemIds, ...uniqueItemIds])),
        itemCount: nextItems.length,
      };
    });

    try {
      const response = await fetch(`/api/shipping-v2/packings/${packing.id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIds: uniqueItemIds }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(String(payload.error || "No se pudieron agregar items."));
      setPacking((current) => {
        const serverItems = Array.isArray(payload.addedItems) ? payload.addedItems as ShippingV2Item[] : [];
        const itemsById = new Map(serverItems.map((item) => [item.id, item]));
        const serverItemIds = Array.isArray(payload.packing?.itemIds) ? payload.packing.itemIds.map(String) : current.itemIds;
        const items = current.items
          .map((item) => itemsById.get(item.id) || item)
          .filter((item) => serverItemIds.includes(item.id));
        return {
          ...current,
          itemIds: serverItemIds,
          itemCount: typeof payload.packing?.itemCount === "number" ? payload.packing.itemCount : items.length,
          items,
        };
      });
    } catch (mutationError) {
      const message = mutationError instanceof Error ? mutationError.message : "Error inesperado.";
      setPacking(previousPacking);
      setAvailableItems(previousAvailableItems);
      setError(message);
      router.refresh();
    } finally {
      setBusy(false);
      setBusyItemId("");
      setDragOver(false);
    }
  }

  async function removeItem(item: ShippingV2Item) {
    if (!canEditItems || busy) return;
    const previousPacking = packing;
    const previousAvailableItems = availableItems;
    const optimisticAvailableItem = {
      ...item,
      estado: "Pendiente de packing",
      modoLogistico: "Pendiente de packing",
      packingId: "",
      requierePacking: true,
    };

    setBusy(true);
    setBusyItemId(item.id);
    setError("");
    setPacking((current) => {
      const nextItems = current.items.filter((included) => included.id !== item.id);
      return {
        ...current,
        items: nextItems,
        itemIds: current.itemIds.filter((id) => id !== item.id),
        itemCount: nextItems.length,
      };
    });
    setAvailableItems((current) => [optimisticAvailableItem, ...current.filter((candidate) => candidate.id !== item.id)]);

    try {
      const response = await fetch(`/api/shipping-v2/packings/${packing.id}/items`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(String(payload.error || "No se pudo quitar el item."));
      const removedItem = payload.removedItem as ShippingV2Item | undefined;
      setAvailableItems((current) => [
        removedItem || optimisticAvailableItem,
        ...current.filter((candidate) => candidate.id !== item.id),
      ]);
      setPacking((current) => {
        const serverItemIds = Array.isArray(payload.packing?.itemIds) ? payload.packing.itemIds.map(String) : current.itemIds;
        const items = current.items.filter((included) => serverItemIds.includes(included.id));
        return {
          ...current,
          itemIds: serverItemIds,
          itemCount: typeof payload.packing?.itemCount === "number" ? payload.packing.itemCount : items.length,
          items,
        };
      });
    } catch (mutationError) {
      setPacking(previousPacking);
      setAvailableItems(previousAvailableItems);
      setError(mutationError instanceof Error ? mutationError.message : "Error inesperado.");
      router.refresh();
    } finally {
      setBusy(false);
      setBusyItemId("");
    }
  }

  async function closePacking() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/shipping-v2/packings/${packing.id}/close`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(String(payload.error || "No se pudo cerrar el packing."));
      setPacking(payload.data as ShippingV2Packing);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Error inesperado.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const itemId = event.dataTransfer.getData("text/plain");
    if (itemId) void addItems([itemId]);
  }

  return (
    <div className="w-full space-y-5 rounded-[2rem] border border-[#3A3A36] bg-[#1B1B1B] p-4 shadow-2xl shadow-black/30 sm:p-5">
      <section className="overflow-hidden rounded-[1.75rem] border border-[#3A3A36] bg-[radial-gradient(circle_at_30%_20%,rgba(215,255,79,0.06),transparent_26%),linear-gradient(135deg,#252624,#121312)] px-5 py-5 shadow-2xl shadow-black/25 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/shipping-v2/packings"
            className="inline-flex h-10 items-center justify-center rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-5 text-sm font-bold text-[#151515] shadow-[0_0_20px_rgba(215,255,79,0.14)] transition hover:brightness-105"
          >
            Volver a Packings
          </Link>
          {canEditItems ? (
            <button type="button" disabled={busy} onClick={() => void closePacking()} className="inline-flex h-10 items-center justify-center rounded-full border border-[#6A6A64] bg-[#2A2A28]/80 px-5 text-sm font-semibold text-[#F5F5F5] shadow-inner shadow-white/5 transition hover:border-[#D7FF4F]/60 disabled:opacity-60">Cerrar packing</button>
          ) : (
            <p className="rounded-full border border-[#3A3A36] bg-[#151515]/80 px-4 py-3 text-sm text-[#A7A7A7]">Este packing ya no permite modificar items desde vista normal.</p>
          )}
        </div>

        <div className="mt-7 grid gap-5 xl:grid-cols-[minmax(300px,0.9fr)_minmax(520px,1.1fr)] xl:items-start">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-normal text-[#A7A7A7]">Packing ID</p>
            <h2 className="mt-2 break-words text-2xl font-semibold leading-tight text-[#F5F5F5] sm:text-3xl">{display(packing.packingId)}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 px-3 py-1 text-xs font-semibold text-[#D7FF4F]">
                <span className="h-2 w-2 rounded-full bg-[#7CFF4F] shadow-[0_0_14px_rgba(124,255,79,0.55)]" />
                {display(packing.estado)}
              </span>
              {packing.observaciones?.trim() ? <span className="rounded-full border border-[#3A3A36] bg-[#171816]/80 px-3 py-1 text-xs font-semibold text-[#A7A7A7]">Con observación</span> : null}
            </div>
            {packing.nombre?.trim() ? <p className="mt-3 text-sm font-medium text-[#A7A7A7]">{packing.nombre.trim()}</p> : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryBadge label="Items" value={String(packing.itemCount)} accent="items" />
            <WeightSummaryBadge
              peso={packing.peso}
              canEditWeight={canEditField("peso")}
              onSaveWeight={(value) => saveInlinePackingField("peso", value)}
            />
            <HeaderProviderSelect
              label="Unidad"
              value={packing.unidadPeso}
              options={unidadPesoOptions}
              disabled={!canEditField("unidadPeso")}
              status={saveState.unidadPeso}
              onSave={(value) => void savePackingField("unidadPeso", value)}
            />
            <HeaderProviderSelect
              label="Responsable"
              value={packing.proveedorResponsableId}
              options={providerOptions}
              disabled={!canEditField("proveedorResponsableId")}
              status={saveState.proveedorResponsableId}
              onSave={(value) => void savePackingField("proveedorResponsableId", value)}
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-[#A7A7A7]">
          <HeaderFooterSelect
            label="Tipo"
            value={packing.tipo}
            options={packingTypeOptions}
            disabled={!canEditField("tipo")}
            status={saveState.tipo}
            onSave={(value) => void savePackingField("tipo", value)}
          />
          <span className="hidden text-[#5E5E58] sm:inline">·</span>
          <span><span className="font-semibold text-[#A7A7A7]">Creado:</span> <span className="text-[#F5F5F5]">{formatDate(packing.fechaCreacion || packing.createdTime)}</span></span>
          <span className="hidden text-[#5E5E58] sm:inline">·</span>
          <span><span className="font-semibold text-[#A7A7A7]">Cierre:</span> <span className="text-[#F5F5F5]">{formatDate(packing.fechaCierre)}</span></span>
        </div>
      </section>

      {error ? <div className="rounded-[1.25rem] border border-[#FF914D]/35 bg-[#FF914D]/10 px-4 py-3 text-sm text-[#FFB07A]">{error}</div> : null}

      <section className="rounded-[1.5rem] border border-[#3A3A36] bg-[#2A2A28] p-4">
        <h3 className="mb-3 text-sm font-semibold text-[#F5F5F5]">Notas del packing</h3>
        <EditableTextField label="Observaciones" value={packing.observaciones} multiline disabled={!canEditField("observaciones")} status={saveState.observaciones} onSave={(value) => void savePackingField("observaciones", value)} />
      </section>

      <section>
        <div className="rounded-[1.5rem] border border-[#3A3A36] bg-[#2A2A28] p-4">
          <h3 className="mb-3 text-sm font-semibold text-[#F5F5F5]">Tracking y logística</h3>
          <div className="grid gap-4">
            <div className="rounded-[1rem] border border-[#3A3A36] bg-[#1E1F1C] p-3">
              <p className="text-xs font-semibold text-[#D7FF4F]">Ruta USA · Proveedor a Miami</p>
              <p className="mt-1 text-xs text-[#A7A7A7]">Usa estos campos para la guía del proveedor o vendedor hasta Miami.</p>
              <div className="mt-3 grid gap-3">
                <EditableTextField label="Tracking USA" value={packing.trackingUsa} disabled={!canEditField("trackingUsa")} status={saveState.trackingUsa} onSave={(value) => void savePackingField("trackingUsa", value)} />
                <EditableSelectField label="Transportista USA" value={packing.transportistaUsa} options={transportistaUsaOptions} disabled={!canEditField("transportistaUsa")} status={saveState.transportistaUsa} onSave={(value) => void savePackingField("transportistaUsa", value)} />
              </div>
            </div>
            <div className="rounded-[1rem] border border-[#3A3A36] bg-[#1E1F1C] p-3">
              <p className="text-xs font-semibold text-[#D7FF4F]">Ruta Ecuador · Miami a SUPER GEEK</p>
              <p className="mt-1 text-xs text-[#A7A7A7]">Usa estos campos para la guía del operador logístico desde Miami hacia Ecuador.</p>
              <div className="mt-3 grid gap-3">
                <EditableSelectField label="Proveedor logístico EC" value={packing.proveedorLogisticoEcId} options={logisticsProviderOptions} disabled={!canEditField("proveedorLogisticoEcId")} status={saveState.proveedorLogisticoEcId} onSave={(value) => void savePackingField("proveedorLogisticoEcId", value)} />
                <EditableTextField label="Tracking EC" value={packing.trackingEc} disabled={!canEditField("trackingEc")} status={saveState.trackingEc} onSave={(value) => void savePackingField("trackingEc", value)} />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-[#3A3A36] bg-[#2A2A28] p-4">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-normal text-[#D7FF4F]">Armado del packing</p>
          <h3 className="mt-1 text-xl font-semibold text-[#F5F5F5]">Items y caja</h3>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.95fr)_minmax(420px,1.05fr)]">
          <aside className="rounded-[1.5rem] border border-[#3A3A36] bg-[#1E1F1C] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h4 className="text-sm font-semibold text-[#F5F5F5]">Items disponibles para packing</h4>
                <p className="mt-1 text-xs text-[#A7A7A7]">{availableItems.length} items disponibles</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-1">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtrar items" className="h-11 rounded-full border border-[#3A3A36] bg-[#151515] px-4 text-sm text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70 md:col-span-3 xl:col-span-1" />
            </div>
            <div className="mt-4 grid max-h-[720px] gap-3 overflow-y-auto pr-1">
              {visibleCandidates.map((item) => {
                const providerLabel = resolveShippingV2ProveedorLabel(item.proveedorId, providerLabels) || item.proveedorNombre || "";
                const logisticsProviderLabel = resolveShippingV2ProveedorLabel(item.proveedorLogisticoId, providerLabels) || item.proveedorLogisticoNombre || "";
                return (
                  <ItemCard
                    key={item.id}
                    item={item}
                    providerLabel={providerLabel}
                    logisticsProviderLabel={logisticsProviderLabel}
                    draggable={canEditItems && !busy}
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", item.id);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                    action={<button type="button" disabled={!canEditItems || busy} onClick={() => void addItems([item.id])} className="min-w-[92px] rounded-full border border-[#D7FF4F]/55 px-3 py-1 text-xs font-semibold text-[#D7FF4F] disabled:opacity-50">{busyItemId === item.id ? "Guardando..." : "Agregar"}</button>}
                  />
                );
              })}
              {!visibleCandidates.length ? (
                <div className="rounded-[1rem] border border-[#3A3A36] bg-[#151515] px-4 py-4 text-sm text-[#A7A7A7]">
                  <p className="font-semibold text-[#F5F5F5]">No hay items disponibles para este packing.</p>
                  <ul className="mt-3 list-disc space-y-1 pl-5">
                    <li>Verifica que el Item tenga Requiere packing = Sí.</li>
                    <li>Verifica que no tenga Packing relacionado.</li>
                    <li>Verifica que su Modo logístico sea Pendiente de packing, Crear packing individual o Asignar a packing existente.</li>
                    <li>Verifica que el proveedor del Item sea compatible con este packing.</li>
                  </ul>
                </div>
              ) : null}
            </div>
          </aside>

          <section
            onDragOver={(event) => {
              if (!canEditItems) return;
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`relative overflow-hidden rounded-[1.5rem] border p-4 transition ${dragOver ? "border-[#D7FF4F] bg-[#D7FF4F]/10" : "border-[#3A3A36] bg-[#151515]"}`}
          >
            <div className="pointer-events-none absolute right-6 top-6 text-7xl font-black text-[#2A2A28]">BOX</div>
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-normal text-[#D7FF4F]">Caja abierta / Packing actual</p>
                <h4 className="mt-1 text-2xl font-semibold text-[#F5F5F5]">{display(packing.packingId)}</h4>
                <p className="mt-2 text-sm text-[#A7A7A7]">{display(packing.estado)} · {packing.items.length} items</p>
                <p className="mt-1 text-sm text-[#A7A7A7]">Proveedor: {display(responsableLabel || packing.proveedorResponsableNombre)}</p>
                {packing.trackingUsa ? <p className="mt-1 text-sm text-[#A7A7A7]">Tracking USA: {packing.trackingUsa}</p> : null}
                {packing.trackingEc ? <p className="mt-1 text-sm text-[#A7A7A7]">Tracking EC: {packing.trackingEc}</p> : null}
              </div>
              {canEditItems ? <span className="rounded-full border border-[#D7FF4F]/35 bg-[#D7FF4F]/10 px-3 py-1 text-xs font-semibold text-[#D7FF4F]">Arrastra aqui</span> : null}
            </div>
            {!canEditItems ? <p className="relative mt-4 rounded-[1rem] border border-[#3A3A36] bg-[#1E1F1C] px-4 py-3 text-sm text-[#A7A7A7]">Este packing ya no permite modificar items desde vista normal.</p> : null}
            <div className="relative mt-5 grid max-h-[720px] gap-3 overflow-y-auto pr-1">
              {packing.items.map((item) => {
                const providerLabel = resolveShippingV2ProveedorLabel(item.proveedorId, providerLabels) || item.proveedorNombre || "";
                const logisticsProviderLabel = resolveShippingV2ProveedorLabel(item.proveedorLogisticoId, providerLabels) || item.proveedorLogisticoNombre || "";
                return (
                  <ItemCard
                    key={item.id}
                    item={item}
                    providerLabel={providerLabel}
                    logisticsProviderLabel={logisticsProviderLabel}
                    action={canEditItems ? <button type="button" disabled={busy} onClick={() => void removeItem(item)} className="min-w-[92px] rounded-full border border-[#FF914D]/45 px-3 py-1 text-xs font-semibold text-[#FFB07A] disabled:opacity-50">{busyItemId === item.id ? "Guardando..." : "Quitar"}</button> : null}
                  />
                );
              })}
              {!packing.items.length ? <p className="rounded-[1rem] border border-dashed border-[#3A3A36] px-4 py-8 text-center text-sm text-[#A7A7A7]">La caja esta vacia. Agrega items desde el panel izquierdo.</p> : null}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
