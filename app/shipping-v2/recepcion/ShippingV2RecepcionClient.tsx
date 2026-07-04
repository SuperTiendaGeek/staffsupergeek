"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { createShippingV2ProveedorLabelMap, resolveShippingV2ProveedorLabel } from "@/lib/shipping-v2/provider-labels";
import { isFichaGenerada } from "@/lib/shipping-v2/technical-sheet";
import type { ShippingV2Item, ShippingV2Novedad, ShippingV2Packing, ShippingV2Proveedor, ShippingV2RecepcionChecklistAction } from "@/types/shipping-v2";

type Props = {
  items: ShippingV2Item[];
  packings: ShippingV2Packing[];
  proveedores: ShippingV2Proveedor[];
  novedades: ShippingV2Novedad[];
  error: string;
};

type ReceptionItem = ShippingV2Item & { packing?: ShippingV2Packing; packingLabel: string; openNovedades: ShippingV2Novedad[] };

const ALL = "Todos";
const NOVEDAD_TYPES = ["Faltante", "Dañado", "Incompleto", "Diferente al comprado", "Garantía con proveedor", "Observación menor", "Otro"];
const OPEN_NOVEDAD_STATES = new Set(["abierta", "en revision interna", "en revisión interna", "enviada a proveedor", "esperando respuesta", "respondida por proveedor", "en solucion", "en solución", "escalada"]);

const filters = [
  { key: ALL, label: "Todos" },
  { key: "pending-review", label: "Pendientes de revisión" },
  { key: "reviewed-no-photos", label: "Revisados sin fotos" },
  { key: "unpublished", label: "Sin publicar" },
  { key: "with-issue", label: "Con novedad" },
  { key: "available", label: "Disponibles" },
];

function normalize(value?: string) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
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

function ModalShell({ title, description, children, onClose }: { title: string; description?: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
      <div className="w-full max-w-lg rounded-xl border border-[#3A3A36] bg-[#151613] shadow-2xl shadow-black/50">
        <div className="border-b border-[#30312D] px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-[#F5F5F5]">{title}</h3>
              {description ? <p className="mt-1 text-sm leading-5 text-[#A7A7A7]">{description}</p> : null}
            </div>
            <button type="button" onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#3A3A36] bg-[#20211D] text-sm font-bold text-[#A7A7A7] transition hover:border-[#D7FF4F]/55 hover:text-[#F5F5F5]" aria-label="Cerrar modal">X</button>
          </div>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function ChecklistToggle({
  label,
  checked,
  disabled,
  busy,
  help,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  busy?: boolean;
  help?: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={`flex min-h-9 items-center gap-2 rounded-lg border px-2 py-1.5 text-xs font-semibold ${disabled ? "border-[#2A2A28] bg-[#121310] text-[#6E6F68]" : "border-[#3A3A36] bg-[#171814] text-[#F5F5F5]"}`} title={help}>
      <input type="checkbox" checked={checked} disabled={disabled || busy} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-[#D7FF4F]" />
      <span className="min-w-0 leading-4">{busy ? "Guardando..." : label}</span>
    </label>
  );
}

export function ShippingV2RecepcionClient({ items: initialItems, packings, proveedores, novedades: initialNovedades, error }: Props) {
  const [items, setItems] = useState(initialItems);
  const [novedades, setNovedades] = useState(initialNovedades);
  const [filter, setFilter] = useState(ALL);
  const [query, setQuery] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [message, setMessage] = useState("");
  const [modalItem, setModalItem] = useState<ReceptionItem | null>(null);
  const [novedadForm, setNovedadForm] = useState({ tipo: NOVEDAD_TYPES[0], descripcion: "", evidenciaUrl: "" });

  const providerLabels = useMemo(() => createShippingV2ProveedorLabelMap(proveedores), [proveedores]);
  const packingByItemId = useMemo(() => {
    const map = new Map<string, ShippingV2Packing>();
    for (const packing of packings) {
      for (const itemId of packing.itemIds) map.set(itemId, packing);
    }
    return map;
  }, [packings]);

  const receptionItems = useMemo<ReceptionItem[]>(() => items.map((item) => {
    const packing = packingByItemId.get(item.id) || packings.find((candidate) => candidate.id === item.packingId);
    const relatedNovedades = novedades.filter((novedad) => novedad.itemId === item.id);
    return {
      ...item,
      packing,
      packingLabel: packing?.packingId || item.packingId || "",
      openNovedades: relatedNovedades.filter(isOpenNovedad),
    };
  }), [items, novedades, packingByItemId, packings]);

  const filtered = useMemo(() => receptionItems.filter((item) => {
    const providerLabel = resolveShippingV2ProveedorLabel(item.proveedorId, providerLabels) || item.proveedorNombre || "";
    const haystack = [item.sku, item.nombre, providerLabel, item.packingLabel].join(" ").toLowerCase();
    const needle = query.trim().toLowerCase();
    if (needle && !haystack.includes(needle)) return false;
    if (filter === "pending-review") return !isReviewed(item);
    if (filter === "reviewed-no-photos") return isReviewed(item) && item.fotosTomadas !== true;
    if (filter === "unpublished") return item.shopifyPublicado !== true || item.marketplacePublicado !== true || item.mercadoLibrePublicado !== true || item.gruposFacebookPublicado !== true;
    if (filter === "with-issue") return item.openNovedades.length > 0 || normalize(item.estado).includes("novedad") || hasBlockingReview(item);
    if (filter === "available") return normalize(item.estado) === "disponible" || item.disponibleVenta === true;
    return true;
  }), [filter, providerLabels, query, receptionItems]);

  const stats = {
    total: receptionItems.length,
    pending: receptionItems.filter((item) => !isReviewed(item)).length,
    issues: receptionItems.filter((item) => item.openNovedades.length > 0 || hasBlockingReview(item)).length,
    available: receptionItems.filter((item) => normalize(item.estado) === "disponible" || item.disponibleVenta === true).length,
  };

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
    } catch (mutationError) {
      setMessage(mutationError instanceof Error ? mutationError.message : "Error inesperado.");
    } finally {
      setBusyKey("");
    }
  }

  async function saveNovedad() {
    if (!modalItem) return;
    setBusyKey(`${modalItem.id}:novedad`);
    setMessage("");
    try {
      const response = await fetch(`/api/shipping-v2/recepcion/items/${modalItem.id}/novedades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...novedadForm, packingId: modalItem.packing?.id || "" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) throw new Error(String(payload.error || "No se pudo registrar la novedad."));
      const updated = payload.data as ShippingV2Item;
      setItems((current) => current.map((currentItem) => currentItem.id === updated.id ? updated : currentItem));
      if (payload.novedad) setNovedades((current) => [payload.novedad as ShippingV2Novedad, ...current]);
      setNovedadForm({ tipo: NOVEDAD_TYPES[0], descripcion: "", evidenciaUrl: "" });
      setModalItem(null);
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

      <section className="rounded-xl border border-[#30312D] bg-[#11120F] p-2 shadow-xl shadow-black/15">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {filters.map((item) => (
              <button key={item.key} type="button" onClick={() => setFilter(item.key)} className={`h-8 rounded-lg border px-3 text-xs font-bold transition ${filter === item.key ? "border-[#D7FF4F] bg-[#D7FF4F] text-[#151515]" : "border-[#3A3A36] bg-[#171814] text-[#A7A7A7] hover:border-[#D7FF4F]/55 hover:text-[#F5F5F5]"}`}>
                {item.label}
              </button>
            ))}
          </div>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar SKU, nombre, proveedor o packing" className="h-9 rounded-lg border border-[#3A3A36] bg-[#151515] px-3 text-sm text-[#F5F5F5] outline-none focus:border-[#D7FF4F]/70 xl:w-80" />
        </div>
      </section>

      <section className="grid gap-2">
        {filtered.map((item) => {
          const photo = getItemPhoto(item);
          const providerLabel = resolveShippingV2ProveedorLabel(item.proveedorId, providerLabels) || item.proveedorNombre || "";
          const reviewed = isReviewed(item);
          return (
            <article key={item.id} className="rounded-xl border border-[#30312D] bg-[#171814] p-3 shadow-xl shadow-black/15">
              <div className="grid gap-3 lg:grid-cols-[72px_minmax(220px,0.75fr)_minmax(420px,1.25fr)]">
                <div className="h-16 w-16 overflow-hidden rounded-lg border border-[#3A3A36] bg-[#101010]">
                  {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-[#6E6F68]">Sin foto</div>}
                </div>
                <div className="min-w-0">
                  <Link href={`/shipping-v2/items/${item.id}`} className="text-xs font-bold text-[#D7FF4F] transition hover:text-[#E6FF83] hover:underline">
                    {display(item.sku)}
                  </Link>
                  <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-5">
                    <Link href={`/shipping-v2/items/${item.id}`} className="text-[#F5F5F5] transition hover:text-[#D7FF4F] hover:underline">
                      {display(item.nombre)}
                    </Link>
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${stateTone(item.estado)}`}>{display(item.estado)}</span>
                    {item.estadoRevision ? <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${stateTone(item.estadoRevision)}`}>{item.estadoRevision}</span> : null}
                    {item.openNovedades.length ? <span className="rounded-full border border-[#FF914D]/35 bg-[#FF914D]/10 px-2 py-0.5 text-[11px] font-semibold text-[#FFB07A]">{item.openNovedades.length} novedad</span> : null}
                  </div>
                  {reviewed ? (
                    <div className="mt-2 rounded-lg border border-[#D7FF4F]/25 bg-[#D7FF4F]/10 px-2 py-1.5 text-xs leading-5 text-[#A7A7A7]">
                      <p>Revisado por: <span className="font-semibold text-[#F5F5F5]">{item.revisadoPor?.trim() || "Sin registrar"}</span></p>
                      <p>Fecha revisión: <span className="font-semibold text-[#F5F5F5]">{formatDateTime(item.fechaRevision)}</span></p>
                    </div>
                  ) : null}
                  <div className="mt-2 grid gap-1 text-xs text-[#A7A7A7]">
                    <p>Packing: <span className="text-[#F5F5F5]">{display(item.packingLabel)}</span></p>
                    <p>Proveedor: <span className="text-[#F5F5F5]">{display(providerLabel)}</span></p>
                    <p>Precio: <span className="text-[#F5F5F5]">{formatCurrency(item.precioVenta || item.precioVentaSugerido)}</span></p>
                    <p>Ubicación: <span className="text-[#F5F5F5]">{display(item.ubicacionActual)}</span></p>
                  </div>
                </div>

                <div className="min-w-0 space-y-2">
                  <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                    <ChecklistToggle label="Revisado física/técnicamente" checked={reviewed} busy={busyKey === `${item.id}:reviewed`} onChange={(value) => void updateChecklist(item, "reviewed", value)} />
                    <ChecklistToggle label="Fotos tomadas" checked={item.fotosTomadas === true} busy={busyKey === `${item.id}:photos-taken`} onChange={(value) => void updateChecklist(item, "photos-taken", value)} />
                    <ChecklistToggle label="Shopify" checked={item.shopifyPublicado === true} busy={busyKey === `${item.id}:published-shopify`} onChange={(value) => void updateChecklist(item, "published-shopify", value)} />
                    <ChecklistToggle label="Marketplace" checked={item.marketplacePublicado === true} busy={busyKey === `${item.id}:published-marketplace`} onChange={(value) => void updateChecklist(item, "published-marketplace", value)} />
                    <ChecklistToggle label="Mercado Libre" checked={item.mercadoLibrePublicado === true} busy={busyKey === `${item.id}:published-mercado-libre`} onChange={(value) => void updateChecklist(item, "published-mercado-libre", value)} />
                    <ChecklistToggle label="Grupos Facebook" checked={item.gruposFacebookPublicado === true} busy={busyKey === `${item.id}:published-facebook`} onChange={(value) => void updateChecklist(item, "published-facebook", value)} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => setModalItem(item)} className="h-8 rounded-lg border border-[#FF914D]/35 bg-[#FF914D]/10 px-3 text-xs font-bold text-[#FFB07A] transition hover:border-[#FF914D]">Registrar novedad</button>
                    <button type="button" onClick={() => openSkuLabel(item.id)} className="h-8 rounded-lg border border-[#3A3A36] bg-[#20211D] px-3 text-xs font-bold text-[#F5F5F5] transition hover:border-[#D7FF4F]/55">Imprimir etiqueta SKU</button>
                    <button type="button" onClick={() => openTechnicalSheetEditor(item.id)} className="h-8 rounded-lg border border-[#4FC3FF]/35 bg-[#4FC3FF]/10 px-3 text-xs font-bold text-[#BDEAFF] transition hover:border-[#4FC3FF]">Preparar ficha</button>
                    <button type="button" onClick={() => openTechnicalSheet(item)} className="h-8 rounded-lg border border-[#3A3A36] bg-[#20211D] px-3 text-xs font-bold text-[#F5F5F5] transition hover:border-[#D7FF4F]/55">Imprimir ficha</button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
        {!filtered.length ? <div className="rounded-xl border border-[#30312D] bg-[#171814] px-3 py-6 text-center text-sm text-[#A7A7A7]">No hay items para el filtro seleccionado.</div> : null}
      </section>

      {modalItem ? (
        <ModalShell title="Registrar novedad" description={`${modalItem.sku} · ${modalItem.nombre}`} onClose={() => setModalItem(null)}>
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
            <button type="button" disabled={Boolean(busyKey)} onClick={() => setModalItem(null)} className="h-9 rounded-lg border border-[#3A3A36] bg-[#20211D] px-3 text-sm font-semibold text-[#F5F5F5] transition hover:border-[#D7FF4F]/45 disabled:opacity-50">Cancelar</button>
            <button type="button" disabled={Boolean(busyKey) || !novedadForm.descripcion.trim()} onClick={() => void saveNovedad()} className="h-9 rounded-lg border border-[#D7FF4F] bg-[#D7FF4F] px-3 text-sm font-bold text-[#151515] transition hover:brightness-105 disabled:opacity-50">{busyKey.endsWith(":novedad") ? "Guardando..." : "Guardar novedad"}</button>
          </div>
        </ModalShell>
      ) : null}
    </div>
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
