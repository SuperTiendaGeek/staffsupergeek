"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { CatalogoRepuesto, CatalogoServicio } from "@/types/tecnicos";

type StatusFilter = "todos" | "activos" | "inactivos";
type CatalogoMode = "repuestos" | "servicios";
type CatalogoItem = CatalogoRepuesto | CatalogoServicio;

type Props = {
  mode: CatalogoMode;
  initialItems: CatalogoItem[];
};

type ApiResponse = {
  success?: boolean;
  data?: unknown;
  error?: string;
};

type FormState = {
  nombre: string;
  descripcionCorta: string;
  skuCodigoInterno: string;
  proveedorHabitual: string;
  costoBase: string;
  precioSugeridoCliente: string;
  descripcion: string;
  costoSugerido: string;
  activo: boolean;
};

const emptyForm: FormState = {
  nombre: "",
  descripcionCorta: "",
  skuCodigoInterno: "",
  proveedorHabitual: "",
  costoBase: "",
  precioSugeridoCliente: "",
  descripcion: "",
  costoSugerido: "",
  activo: true,
};

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function parseNumberInput(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRepuesto(item: CatalogoItem): item is CatalogoRepuesto {
  return "precioSugeridoCliente" in item;
}

function matchesStatus(item: CatalogoItem, status: StatusFilter) {
  if (status === "activos") return item.activo;
  if (status === "inactivos") return !item.activo;
  return true;
}

async function parseApiResponse(response: Response): Promise<ApiResponse | null> {
  try {
    return (await response.json()) as ApiResponse;
  } catch {
    return null;
  }
}

export function CatalogoCrudClient({ mode, initialItems }: Props) {
  const isRepuestosMode = mode === "repuestos";
  const endpoint = isRepuestosMode ? "/api/tecnicos/catalogo-repuestos" : "/api/tecnicos/catalogo-servicios";
  const singular = isRepuestosMode ? "repuesto" : "servicio";
  const [items, setItems] = useState<CatalogoItem[]>(initialItems);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("todos");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CatalogoItem | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items
      .filter((item) => matchesStatus(item, status))
      .filter((item) => {
        if (!query) return true;
        if (isRepuesto(item)) {
          return [item.nombre, item.skuCodigoInterno, item.proveedorHabitual]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(query));
        }

        return [item.nombre, item.descripcion]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      });
  }, [items, search, status]);

  async function refreshItems(nextStatus = status) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${endpoint}?estado=${nextStatus}`, { cache: "no-store" });
      const payload = await parseApiResponse(response);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "No se pudo cargar el catálogo");
      }
      setItems((payload.data as CatalogoItem[]) || []);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshItems(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  function openCreateModal() {
    setEditingItem(null);
    setForm(emptyForm);
    setFormError(null);
    setModalOpen(true);
  }

  function openEditModal(item: CatalogoItem) {
    setEditingItem(item);
    setForm({
      nombre: item.nombre,
      descripcionCorta: isRepuesto(item) ? item.descripcionCorta || "" : "",
      skuCodigoInterno: isRepuesto(item) ? item.skuCodigoInterno || "" : "",
      proveedorHabitual: isRepuesto(item) ? item.proveedorHabitual || "" : "",
      costoBase: isRepuesto(item) && item.costoBase !== null ? String(item.costoBase) : "",
      precioSugeridoCliente: isRepuesto(item) && item.precioSugeridoCliente !== null ? String(item.precioSugeridoCliente) : "",
      descripcion: !isRepuesto(item) ? item.descripcion || "" : "",
      costoSugerido: !isRepuesto(item) && item.costoSugerido !== null ? String(item.costoSugerido) : "",
      activo: item.activo,
    });
    setFormError(null);
    setModalOpen(true);
  }

  function upsertItem(item: CatalogoItem) {
    setItems((current) => {
      const exists = current.some((currentItem) => currentItem.id === item.id);
      if (!exists) return [item, ...current].sort((a, b) => a.nombre.localeCompare(b.nombre));
      return current.map((currentItem) => (currentItem.id === item.id ? item : currentItem));
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!form.nombre.trim()) {
      setFormError(`El nombre del ${singular} es obligatorio.`);
      return;
    }

    const payload = isRepuestosMode
      ? {
          nombre: form.nombre,
          descripcionCorta: form.descripcionCorta,
          skuCodigoInterno: form.skuCodigoInterno,
          proveedorHabitual: form.proveedorHabitual,
          costoBase: parseNumberInput(form.costoBase),
          precioSugeridoCliente: parseNumberInput(form.precioSugeridoCliente),
          activo: form.activo,
        }
      : {
          nombre: form.nombre,
          descripcion: form.descripcion,
          costoSugerido: parseNumberInput(form.costoSugerido),
          activo: form.activo,
        };

    setSaving(true);
    try {
      const url = editingItem ? `${endpoint}/${encodeURIComponent(editingItem.id)}` : endpoint;
      const response = await fetch(url, {
        method: editingItem ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const apiPayload = await parseApiResponse(response);
      if (!response.ok || !apiPayload?.success) {
        throw new Error(apiPayload?.error || "No se pudo guardar");
      }

      upsertItem(apiPayload.data as CatalogoItem);
      setModalOpen(false);
      setEditingItem(null);
      setForm(emptyForm);
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActivo(item: CatalogoItem) {
    const action = item.activo ? "desactivar" : "activar";
    if (!window.confirm(`¿Quieres ${action} "${item.nombre}"?`)) {
      return;
    }

    setTogglingId(item.id);
    setError(null);
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo: !item.activo }),
      });
      const payload = await parseApiResponse(response);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || `No se pudo ${action}`);
      }

      upsertItem(payload.data as CatalogoItem);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Error desconocido");
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <>
      <section className="space-y-4 rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-4 shadow-xl shadow-black/20 sm:p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_190px_auto]">
          <label>
            <span className="sr-only">Buscar</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={isRepuestosMode ? "Buscar por nombre, SKU o proveedor" : "Buscar por nombre o descripción"}
              className="h-9 w-full rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-4 text-sm text-[#F5F5F5] outline-none transition placeholder:text-[#A7A7A7]/50 focus:border-[#D7FF4F]/70"
            />
          </label>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            className="h-9 rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-4 text-sm font-semibold text-[#F5F5F5] outline-none transition focus:border-[#D7FF4F]/70"
          >
            <option value="todos">Todos</option>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
          </select>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex h-9 items-center justify-center rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-5 text-sm font-bold text-[#10110E] transition hover:brightness-105"
          >
            + Nuevo {singular}
          </button>
        </div>

        {error ? (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>
        ) : null}

        <div className="overflow-hidden rounded-lg border border-[#3A3A36]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#30312D] text-xs uppercase tracking-wide text-[#A7A7A7]">
                {isRepuestosMode ? (
                  <tr>
                    <th className="px-4 py-3">Repuesto</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Proveedor</th>
                    <th className="px-4 py-3">Costo base</th>
                    <th className="px-4 py-3">Precio sugerido</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                ) : (
                  <tr>
                    <th className="px-4 py-3">Servicio</th>
                    <th className="px-4 py-3">Descripción</th>
                    <th className="px-4 py-3">Costo sugerido</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-[#3A3A36] bg-[#252622]">
                {loading ? (
                  <tr>
                    <td colSpan={isRepuestosMode ? 7 : 5} className="px-4 py-8 text-center text-[#A7A7A7]">
                      Cargando catálogo...
                    </td>
                  </tr>
                ) : filteredItems.length ? (
                  filteredItems.map((item) =>
                    isRepuestosMode && isRepuesto(item) ? (
                      <tr key={item.id} className="text-[#CFCFCB]">
                        <td className="px-4 py-4">
                          <p className="font-semibold text-white">{item.nombre}</p>
                          {item.descripcionCorta ? <p className="mt-1 max-w-md truncate text-xs text-[#A7A7A7]">{item.descripcionCorta}</p> : null}
                        </td>
                        <td className="px-4 py-4">{item.skuCodigoInterno || "-"}</td>
                        <td className="px-4 py-4">{item.proveedorHabitual || "-"}</td>
                        <td className="px-4 py-4">{formatMoney(item.costoBase)}</td>
                        <td className="px-4 py-4 font-semibold text-white">{formatMoney(item.precioSugeridoCliente)}</td>
                        <td className="px-4 py-4">
                          <StatusBadge activo={item.activo} />
                        </td>
                        <td className="px-4 py-4">
                          <Actions item={item} onEdit={openEditModal} onToggle={toggleActivo} togglingId={togglingId} />
                        </td>
                      </tr>
                    ) : !isRepuesto(item) ? (
                      <tr key={item.id} className="text-[#CFCFCB]">
                        <td className="px-4 py-4 font-semibold text-white">{item.nombre}</td>
                        <td className="px-4 py-4">
                          <p className="max-w-xl truncate">{item.descripcion || "-"}</p>
                        </td>
                        <td className="px-4 py-4 font-semibold text-white">{formatMoney(item.costoSugerido)}</td>
                        <td className="px-4 py-4">
                          <StatusBadge activo={item.activo} />
                        </td>
                        <td className="px-4 py-4">
                          <Actions item={item} onEdit={openEditModal} onToggle={toggleActivo} togglingId={togglingId} />
                        </td>
                      </tr>
                    ) : null
                  )
                ) : (
                  <tr>
                    <td colSpan={isRepuestosMode ? 7 : 5} className="px-4 py-8 text-center text-[#A7A7A7]">
                      No hay registros para mostrar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6 backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[#3A3A36] pb-4">
              <div>
                <h3 className="text-xl font-bold text-white">
                  {editingItem ? `Editar ${singular}` : `Nuevo ${singular}`}
                </h3>
                <p className="mt-1 text-sm text-[#A7A7A7]">Completa los datos del catálogo.</p>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border border-[#3A3A36] px-3 py-1.5 text-sm font-semibold text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-white">
                Cerrar
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label={`Nombre del ${singular}`} value={form.nombre} onChange={(value) => setForm((current) => ({ ...current, nombre: value }))} required />
              {isRepuestosMode ? (
                <>
                  <Field label="SKU o código interno" value={form.skuCodigoInterno} onChange={(value) => setForm((current) => ({ ...current, skuCodigoInterno: value }))} />
                  <Field label="Proveedor habitual" value={form.proveedorHabitual} onChange={(value) => setForm((current) => ({ ...current, proveedorHabitual: value }))} />
                  <Field label="Costo base" type="number" value={form.costoBase} onChange={(value) => setForm((current) => ({ ...current, costoBase: value }))} />
                  <Field label="Precio sugerido al cliente" type="number" value={form.precioSugeridoCliente} onChange={(value) => setForm((current) => ({ ...current, precioSugeridoCliente: value }))} />
                  <TextAreaField label="Descripción corta" value={form.descripcionCorta} onChange={(value) => setForm((current) => ({ ...current, descripcionCorta: value }))} />
                </>
              ) : (
                <>
                  <Field label="Costo sugerido" type="number" value={form.costoSugerido} onChange={(value) => setForm((current) => ({ ...current, costoSugerido: value }))} />
                  <TextAreaField label="Descripción" value={form.descripcion} onChange={(value) => setForm((current) => ({ ...current, descripcion: value }))} />
                </>
              )}
              <label className="flex items-center gap-3 rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-4 py-3 text-sm font-semibold text-[#CFCFCB] sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.activo}
                  onChange={(event) => setForm((current) => ({ ...current, activo: event.target.checked }))}
                  className="h-4 w-4 accent-[#D7FF4F]"
                />
                Activo
              </label>
            </div>

            {formError ? <p className="mt-4 text-sm text-red-300">{formError}</p> : null}

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setModalOpen(false)} className="inline-flex h-9 items-center rounded-full border border-[#3A3A36] px-4 text-sm font-semibold text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-white">
                Cancelar
              </button>
              <button type="submit" disabled={saving} className="inline-flex h-9 items-center rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 text-sm font-bold text-[#10110E] transition hover:brightness-105 disabled:opacity-60">
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}

function StatusBadge({ activo }: { activo: boolean }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${activo ? "border-[#D7FF4F]/40 bg-[#D7FF4F]/10 text-[#D7FF4F]" : "border-[#3A3A36] bg-[#30312D] text-[#A7A7A7]"}`}>
      {activo ? "Activo" : "Inactivo"}
    </span>
  );
}

function Actions({
  item,
  onEdit,
  onToggle,
  togglingId,
}: {
  item: CatalogoItem;
  onEdit: (item: CatalogoItem) => void;
  onToggle: (item: CatalogoItem) => void;
  togglingId: string | null;
}) {
  return (
    <div className="flex justify-end gap-2">
      <button type="button" onClick={() => onEdit(item)} className="rounded-full border border-[#3A3A36] px-3 py-1.5 text-xs font-semibold text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]">
        Editar
      </button>
      <button type="button" onClick={() => void onToggle(item)} disabled={togglingId === item.id} className="rounded-full border border-[#3A3A36] px-3 py-1.5 text-xs font-semibold text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F] disabled:opacity-50">
        {togglingId === item.id ? "Guardando..." : item.activo ? "Desactivar" : "Activar"}
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-[#A7A7A7]">{label}</span>
      <input
        type={type}
        step={type === "number" ? "0.01" : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="mt-1.5 h-9 w-full rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 text-sm text-[#F5F5F5] outline-none transition focus:border-[#D7FF4F]/70"
      />
    </label>
  );
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block sm:col-span-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-[#A7A7A7]">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        className="mt-1.5 w-full rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 text-sm text-[#F5F5F5] outline-none transition focus:border-[#D7FF4F]/70"
      />
    </label>
  );
}
