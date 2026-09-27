"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { CatalogoRepuesto, CatalogoServicio } from "@/types/tecnicos";
import {
  EditorCartel, aBorradorCartel, aCartelServicio, cartelEnBlanco, validarBorradorCartel,
  type BorradorCartel,
} from "@/components/tecnicos/CartelEditor";
import { cartelVisible, type CartelServicio } from "@/lib/tecnicos/carteles/reglas";

type StatusFilter = "todos" | "activos" | "inactivos";
type CatalogoMode = "repuestos" | "servicios";
type CatalogoItem = CatalogoRepuesto | CatalogoServicio;

type Props = {
  mode: CatalogoMode;
  initialItems: CatalogoItem[];
  /** Solo en modo servicios: carteles de consentimiento ya guardados. */
  carteles?: CartelServicio[];
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

export function CatalogoCrudClient({ mode, initialItems, carteles = [] }: Props) {
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
  // Cartel de consentimiento del servicio que se está editando (vive en este mismo modal).
  const [cartelesPorServicio, setCartelesPorServicio] = useState<Record<string, CartelServicio>>(
    () => Object.fromEntries(carteles.map((c) => [c.servicioId, c]))
  );
  const [cartel, setCartel] = useState<BorradorCartel>(() => aBorradorCartel(undefined));
  const [teniaCartel, setTeniaCartel] = useState(false);

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
    setCartel(aBorradorCartel(undefined));
    setTeniaCartel(false);
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
    const guardado = isRepuesto(item) ? undefined : cartelesPorServicio[item.id];
    setCartel(aBorradorCartel(guardado));
    setTeniaCartel(!!guardado);
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

    // El cartel se valida antes de tocar el catálogo: así no queda el servicio
    // guardado y el cartel a medias.
    const editaCartel = !isRepuestosMode;
    const cartelHayTexto = editaCartel && !cartelEnBlanco(cartel);
    if (cartelHayTexto) {
      const errorCartel = validarBorradorCartel(editingItem?.id || "nuevo", cartel);
      if (errorCartel) {
        setFormError(errorCartel);
        return;
      }
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

      const guardadoItem = apiPayload.data as CatalogoItem;
      upsertItem(guardadoItem);

      if (editaCartel && (cartelHayTexto || teniaCartel)) {
        await guardarCartelDelServicio(guardadoItem.id, cartelHayTexto);
      }

      setModalOpen(false);
      setEditingItem(null);
      setForm(emptyForm);
      setCartel(aBorradorCartel(undefined));
      setTeniaCartel(false);
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  /** Guarda (o borra) el cartel del servicio. Todo pasa por el servidor. */
  async function guardarCartelDelServicio(servicioId: string, hayTexto: boolean) {
    const url = `/api/tecnicos/catalogo/servicios/${encodeURIComponent(servicioId)}/cartel`;
    if (!hayTexto) {
      const response = await fetch(url, { method: "DELETE" });
      const payload = await parseApiResponse(response);
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "No se pudo borrar el cartel");
      setCartelesPorServicio((current) => {
        const next = { ...current };
        for (const id of [servicioId, ...cartel.aplicarA]) delete next[id];
        return next;
      });
      return;
    }

    const response = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        activo: cartel.activo,
        titulo: cartel.titulo,
        intro: cartel.intro,
        incluye: cartel.incluye,
        noIncluye: cartel.noIncluye,
        avisos: cartel.avisos,
        consentimiento: cartel.consentimiento,
        textoBoton: cartel.textoBoton,
        aplicarA: cartel.aplicarA,
      }),
    });
    const payload = await parseApiResponse(response);
    if (!response.ok || !payload?.success) throw new Error(payload?.error || "No se pudo guardar el cartel");

    const nuevo = aCartelServicio(servicioId, cartel);
    setCartelesPorServicio((current) => {
      const next = { ...current, [servicioId]: nuevo };
      for (const otroId of cartel.aplicarA) next[otroId] = { ...nuevo, servicioId: otroId };
      return next;
    });
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
                    <th className="px-4 py-3">Cartel</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-[#3A3A36] bg-[#252622]">
                {loading ? (
                  <tr>
                    <td colSpan={isRepuestosMode ? 7 : 6} className="px-4 py-8 text-center text-[#A7A7A7]">
                      Cargando catálogo...
                    </td>
                  </tr>
                ) : filteredItems.length ? (
                  filteredItems.map((item) =>
                    isRepuestosMode && isRepuesto(item) ? (
                      <tr key={item.id} className="text-[#CFCFCB]">
                        <td className="px-4 py-4">
                          <p className="font-semibold text-[#F5F5F5]">{item.nombre}</p>
                          {item.descripcionCorta ? <p className="mt-1 max-w-md truncate text-xs text-[#A7A7A7]">{item.descripcionCorta}</p> : null}
                        </td>
                        <td className="px-4 py-4">{item.skuCodigoInterno || "-"}</td>
                        <td className="px-4 py-4">{item.proveedorHabitual || "-"}</td>
                        <td className="px-4 py-4">{formatMoney(item.costoBase)}</td>
                        <td className="px-4 py-4 font-semibold text-[#F5F5F5]">{formatMoney(item.precioSugeridoCliente)}</td>
                        <td className="px-4 py-4">
                          <StatusBadge activo={item.activo} />
                        </td>
                        <td className="px-4 py-4">
                          <Actions item={item} onEdit={openEditModal} onToggle={toggleActivo} togglingId={togglingId} />
                        </td>
                      </tr>
                    ) : !isRepuesto(item) ? (
                      <tr key={item.id} className="text-[#CFCFCB]">
                        <td className="px-4 py-4 font-semibold text-[#F5F5F5]">{item.nombre}</td>
                        <td className="px-4 py-4">
                          <p className="max-w-xl truncate">{item.descripcion || "-"}</p>
                        </td>
                        <td className="px-4 py-4 font-semibold text-[#F5F5F5]">{formatMoney(item.costoSugerido)}</td>
                        <td className="px-4 py-4">
                          <CartelBadge cartel={cartelesPorServicio[item.id]} />
                        </td>
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
                    <td colSpan={isRepuestosMode ? 7 : 6} className="px-4 py-8 text-center text-[#A7A7A7]">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6">
          <form onSubmit={handleSubmit} className={`max-h-[92vh] w-full overflow-y-auto ${isRepuestosMode ? "max-w-2xl" : "max-w-4xl"} rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-5 shadow-2xl`}>
            <div className="flex items-start justify-between gap-4 border-b border-[#3A3A36] pb-4">
              <div>
                <h3 className="text-xl font-bold text-[#F5F5F5]">
                  {editingItem ? `Editar ${singular}` : `Nuevo ${singular}`}
                </h3>
                <p className="mt-1 text-sm text-[#A7A7A7]">
                  {isRepuestosMode ? "Completa los datos del catálogo." : "Nombre, costo y el cartel que el cliente debe aceptar."}
                </p>
              </div>
              <button type="button" onClick={() => setModalOpen(false)} className="rounded-full border border-[#3A3A36] px-3 py-1.5 text-sm font-semibold text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#F5F5F5]">
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

            {!isRepuestosMode ? (
              <div className="mt-5 border-t border-[#3A3A36] pt-5">
                <EditorCartel
                  servicioId={editingItem?.id || "nuevo"}
                  b={cartel}
                  onCambio={setCartel}
                  otrosServicios={items
                    .filter((otro) => !isRepuesto(otro) && otro.id !== editingItem?.id)
                    .map((otro) => ({ id: otro.id, nombre: otro.nombre }))}
                  cartelesExistentes={Object.fromEntries(Object.keys(cartelesPorServicio).map((id) => [id, true]))}
                />
              </div>
            ) : null}

            {formError ? <p className="mt-4 text-sm text-red-300">{formError}</p> : null}

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setModalOpen(false)} className="inline-flex h-9 items-center rounded-full border border-[#3A3A36] px-4 text-sm font-semibold text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#F5F5F5]">
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

function CartelBadge({ cartel }: { cartel: CartelServicio | undefined }) {
  if (cartelVisible(cartel)) {
    return (
      <span className="inline-flex rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-300">
        Con cartel
      </span>
    );
  }
  if (cartel) {
    return (
      <span className="inline-flex rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-xs font-semibold text-amber-200">
        Borrador
      </span>
    );
  }
  return <span className="text-xs text-[#A7A7A7]">—</span>;
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
