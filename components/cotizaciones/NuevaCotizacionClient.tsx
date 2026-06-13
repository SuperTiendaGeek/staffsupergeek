"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ClienteFormModal, type ClienteCreado } from "@/components/clientes/ClienteFormModal";
import { CATEGORIAS_COTIZACION, type CotizacionClienteSnapshot } from "@/types/cotizaciones";

type ClienteBusqueda = {
  id: string;
  nombre: string;
  cedula: string;
  telefono: string;
  correo: string;
};

type ApiResponse = {
  success?: boolean;
  data?: unknown;
  error?: string;
};

async function parseApi(response: Response): Promise<ApiResponse | null> {
  try {
    return (await response.json()) as ApiResponse;
  } catch {
    return null;
  }
}

export function NuevaCotizacionClient() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [clientes, setClientes] = useState<ClienteBusqueda[]>([]);
  const [cliente, setCliente] = useState<CotizacionClienteSnapshot | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [productoSolicitado, setProductoSolicitado] = useState("");
  const [categoria, setCategoria] = useState("");
  const [descripcionRequerimiento, setDescripcionRequerimiento] = useState("");
  const [requiereInstalacion, setRequiereInstalacion] = useState(false);
  const [equipoYaEstaEnTienda, setEquipoYaEstaEnTienda] = useState(false);
  const [observacionInterna, setObservacionInterna] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openNuevoClienteModal, setOpenNuevoClienteModal] = useState(false);

  useEffect(() => {
    const clean = query.trim();
    if (clean.length < 2 || cliente) {
      setClientes([]);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setBuscando(true);
      try {
        const response = await fetch(`/api/cotizaciones/clientes/buscar?q=${encodeURIComponent(clean)}`, {
          cache: "no-store",
        });
        const payload = await parseApi(response);
        if (!cancelled && response.ok && payload?.success) {
          setClientes((payload.data as ClienteBusqueda[]) || []);
        }
      } finally {
        if (!cancelled) setBuscando(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [cliente, query]);

  function selectClienteSnapshot(item: {
    id: string;
    nombre: string;
    telefono?: string;
    correo?: string;
    cedula?: string;
  }) {
    setCliente({
      recordId: item.id,
      nombre: item.nombre,
      telefono: item.telefono || "",
      email: item.correo || "",
      cedula: item.cedula || "",
    });
    setQuery(item.nombre);
    setClientes([]);
    setError(null);
  }

  function selectCliente(item: ClienteBusqueda) {
    selectClienteSnapshot(item);
  }

  function handleClienteCreado(item: ClienteCreado) {
    selectClienteSnapshot(item);
    setOpenNuevoClienteModal(false);
  }

  function handleClienteDuplicado(item: ClienteCreado) {
    selectClienteSnapshot(item);
    setOpenNuevoClienteModal(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!cliente) {
      setError("Selecciona un cliente existente.");
      return;
    }

    if (!productoSolicitado.trim()) {
      setError("El producto solicitado es obligatorio.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/cotizaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente,
          productoSolicitado,
          categoria,
          descripcionRequerimiento,
          requiereInstalacion,
          equipoYaEstaEnTienda,
          observacionInterna,
        }),
      });
      const payload = await parseApi(response);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "No se pudo crear la cotización.");
      }
      const created = payload.data as { id: string };
      router.push(`/cotizaciones/${created.id}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="space-y-4 rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-4 shadow-xl shadow-black/20">
          {error ? (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </p>
          ) : null}

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-normal text-[#A7A7A7]">Cliente</span>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setCliente(null);
              }}
              placeholder="Buscar cliente por nombre, cédula o teléfono"
              className="mt-1.5 h-9 w-full rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 text-sm text-[#F5F5F5] outline-none transition focus:border-[#D7FF4F]/70"
            />
          </label>
          <button
            type="button"
            onClick={() => setOpenNuevoClienteModal(true)}
            className="inline-flex h-9 items-center justify-center whitespace-nowrap rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-3 text-sm font-bold text-[#10110E] transition hover:brightness-105"
          >
            + Nuevo cliente
          </button>
        </div>

        {buscando ? <p className="text-sm text-[#A7A7A7]">Buscando clientes...</p> : null}
        {clientes.length > 0 ? (
          <div className="rounded-lg border border-[#3A3A36] bg-[#1E1F1C] p-1.5">
            {clientes.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => selectCliente(item)}
                className="block w-full rounded-lg px-3 py-2 text-left transition hover:bg-[#2D2E2A]"
              >
                <span className="block text-sm font-semibold text-[#F5F5F5]">{item.nombre}</span>
                <span className="text-xs text-[#A7A7A7]">
                  {item.telefono || "Sin teléfono"} · {item.cedula || "Sin cédula"}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-normal text-[#A7A7A7]">
              Producto Solicitado
            </span>
            <input
              value={productoSolicitado}
              onChange={(event) => setProductoSolicitado(event.target.value)}
              className="mt-1.5 h-9 w-full rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 text-sm text-[#F5F5F5] outline-none transition focus:border-[#D7FF4F]/70"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-normal text-[#A7A7A7]">Categoría</span>
            <select
              value={categoria}
              onChange={(event) => setCategoria(event.target.value)}
              className="mt-1.5 h-9 w-full rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 text-sm text-[#F5F5F5] outline-none transition focus:border-[#D7FF4F]/70"
            >
              <option value="">Seleccionar categoría</option>
              {CATEGORIAS_COTIZACION.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end gap-3">
            <label className="flex h-9 flex-1 items-center gap-3 rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 text-sm text-[#CFCFCB]">
              <input
                type="checkbox"
                checked={requiereInstalacion}
                onChange={(event) => setRequiereInstalacion(event.target.checked)}
                className="h-4 w-4 accent-[#D7FF4F]"
              />
              Requiere instalación
            </label>
          </div>

          <label className="block sm:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-normal text-[#A7A7A7]">
              Descripción del Requerimiento
            </span>
            <textarea
              value={descripcionRequerimiento}
              onChange={(event) => setDescripcionRequerimiento(event.target.value)}
              rows={5}
              className="mt-1.5 w-full rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 text-sm text-[#F5F5F5] outline-none transition focus:border-[#D7FF4F]/70"
            />
          </label>

          <label className="flex h-9 items-center gap-3 rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 text-sm text-[#CFCFCB]">
            <input
              type="checkbox"
              checked={equipoYaEstaEnTienda}
              onChange={(event) => setEquipoYaEstaEnTienda(event.target.checked)}
              className="h-4 w-4 accent-[#D7FF4F]"
            />
            Equipo ya está en tienda
          </label>

          <label className="block sm:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-normal text-[#A7A7A7]">
              Observación Interna
            </span>
            <textarea
              value={observacionInterna}
              onChange={(event) => setObservacionInterna(event.target.value)}
              rows={4}
              className="mt-1.5 w-full rounded-lg border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2 text-sm text-[#F5F5F5] outline-none transition focus:border-[#D7FF4F]/70"
            />
          </label>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-9 items-center rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 text-sm font-bold text-[#10110E] transition hover:brightness-105 disabled:cursor-wait disabled:opacity-60"
          >
            {saving ? "Guardando..." : "Crear cotización"}
          </button>
        </div>
      </section>

      <aside className="h-fit rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-4">
        <h2 className="text-sm font-semibold uppercase tracking-normal text-[#A7A7A7]">Cliente seleccionado</h2>
        {cliente ? (
          <div className="mt-4 space-y-2 text-sm">
            <p className="font-semibold text-white">{cliente.nombre}</p>
            <p className="text-[#CFCFCB]">{cliente.telefono || "Sin teléfono"}</p>
            <p className="text-[#CFCFCB]">{cliente.email || "Sin email"}</p>
            <p className="text-[#CFCFCB]">{cliente.cedula || "Sin cédula"}</p>
          </div>
        ) : (
          <p className="mt-4 text-sm text-[#A7A7A7]">Busca y selecciona un cliente registrado.</p>
        )}
      </aside>
      </form>
      {openNuevoClienteModal ? (
        <ClienteFormModal
          onClose={() => setOpenNuevoClienteModal(false)}
          onCreated={handleClienteCreado}
          onDuplicate={handleClienteDuplicado}
        />
      ) : null}
    </>
  );
}
