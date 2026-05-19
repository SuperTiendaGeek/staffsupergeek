"use client";

import { useState } from "react";
import type { ReactNode } from "react";

export type ClienteCreado = {
  id: string;
  nombre: string;
  cedula: string;
  telefono: string;
  correo: string;
  direccion?: string;
  notas?: string | null;
};

type NuevoClienteForm = {
  nombre: string;
  cedula: string;
  telefono: string;
  correo: string;
  direccion: string;
  notas: string;
};

type ApiResponse = {
  success?: boolean;
  data?: ClienteCreado;
  error?: string;
};

type Props = {
  endpoint?: string;
  onClose: () => void;
  onCreated: (cliente: ClienteCreado) => void;
  onDuplicate?: (cliente: ClienteCreado) => void;
};

const emptyForm: NuevoClienteForm = {
  nombre: "",
  cedula: "",
  telefono: "",
  correo: "",
  direccion: "",
  notas: "",
};

async function parseApi(response: Response): Promise<ApiResponse | null> {
  try {
    return (await response.json()) as ApiResponse;
  } catch {
    return null;
  }
}

export function ClienteFormModal({
  endpoint = "/api/cotizaciones/clientes",
  onClose,
  onCreated,
  onDuplicate,
}: Props) {
  const [form, setForm] = useState<NuevoClienteForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<ClienteCreado | null>(null);

  function updateField(field: keyof NuevoClienteForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
    setDuplicate(null);
  }

  async function handleCreate() {
    if (saving) return;

    const nombre = form.nombre.trim();
    if (!nombre) {
      setError("El nombre del cliente es obligatorio.");
      return;
    }

    setSaving(true);
    setError(null);
    setDuplicate(null);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          cedula: form.cedula.trim(),
          telefono: form.telefono.trim(),
          correo: form.correo.trim(),
          direccion: form.direccion.trim(),
          notas: form.notas.trim(),
        }),
      });
      const payload = await parseApi(response);

      if (response.status === 409 && payload?.data) {
        setDuplicate(payload.data);
        setError(payload.error || "Ya existe un cliente con estos datos. Puedes seleccionarlo.");
        return;
      }

      if (!response.ok || !payload?.success || !payload.data) {
        throw new Error(payload?.error || "No se pudo crear el cliente.");
      }

      onCreated(payload.data);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-[760px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#181818] shadow-2xl shadow-black/50">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <h3 className="text-xl font-extrabold text-white">Nuevo cliente</h3>
            <p className="mt-1 text-sm leading-6 text-zinc-400">
              Registra la información básica del cliente.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Cerrar modal"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-sm font-bold text-zinc-300 transition hover:border-geek-lime hover:text-geek-lime disabled:cursor-wait disabled:opacity-60"
          >
            X
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre / Cliente">
              <input
                value={form.nombre}
                onChange={(event) => updateField("nombre", event.target.value)}
                placeholder="Nombre del cliente"
                disabled={saving}
                className="h-12 w-full rounded-xl border border-zinc-800 bg-[#111] px-4 text-sm text-white outline-none transition focus:border-geek-lime disabled:cursor-wait disabled:opacity-60"
              />
            </Field>
            <Field label="Cédula">
              <input
                value={form.cedula}
                onChange={(event) => updateField("cedula", event.target.value)}
                placeholder="Cédula o identificación"
                disabled={saving}
                className="h-12 w-full rounded-xl border border-zinc-800 bg-[#111] px-4 text-sm text-white outline-none transition focus:border-geek-lime disabled:cursor-wait disabled:opacity-60"
              />
            </Field>
            <Field label="Teléfono">
              <input
                value={form.telefono}
                onChange={(event) => updateField("telefono", event.target.value)}
                placeholder="Teléfono"
                disabled={saving}
                className="h-12 w-full rounded-xl border border-zinc-800 bg-[#111] px-4 text-sm text-white outline-none transition focus:border-geek-lime disabled:cursor-wait disabled:opacity-60"
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={form.correo}
                onChange={(event) => updateField("correo", event.target.value)}
                placeholder="Email opcional"
                disabled={saving}
                className="h-12 w-full rounded-xl border border-zinc-800 bg-[#111] px-4 text-sm text-white outline-none transition focus:border-geek-lime disabled:cursor-wait disabled:opacity-60"
              />
            </Field>
            <Field label="Dirección" className="sm:col-span-2">
              <input
                value={form.direccion}
                onChange={(event) => updateField("direccion", event.target.value)}
                placeholder="Dirección opcional"
                disabled={saving}
                className="h-12 w-full rounded-xl border border-zinc-800 bg-[#111] px-4 text-sm text-white outline-none transition focus:border-geek-lime disabled:cursor-wait disabled:opacity-60"
              />
            </Field>
            <Field label="Observaciones" className="sm:col-span-2">
              <textarea
                value={form.notas}
                onChange={(event) => updateField("notas", event.target.value)}
                placeholder="Observaciones opcionales"
                rows={4}
                disabled={saving}
                className="w-full rounded-xl border border-zinc-800 bg-[#111] px-4 py-3 text-sm text-white outline-none transition focus:border-geek-lime disabled:cursor-wait disabled:opacity-60"
              />
            </Field>
          </div>

          {error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              <p>{error}</p>
              {duplicate && onDuplicate ? (
                <button
                  type="button"
                  onClick={() => onDuplicate(duplicate)}
                  className="mt-3 inline-flex rounded-lg border border-geek-lime/40 px-3 py-2 text-xs font-bold text-geek-lime transition hover:bg-geek-lime/10"
                >
                  Seleccionar {duplicate.nombre}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-white/10 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-white/10 bg-white/[0.045] px-5 py-3 text-sm font-bold text-zinc-200 transition hover:border-geek-lime/40 hover:text-geek-lime disabled:cursor-wait disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving}
            className="rounded-xl border border-geek-lime bg-geek-lime px-5 py-3 text-sm font-extrabold text-black shadow-glow transition hover:brightness-95 disabled:cursor-wait disabled:opacity-60"
          >
            {saving ? "Creando..." : "Crear cliente"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-semibold uppercase tracking-normal text-zinc-400">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}
