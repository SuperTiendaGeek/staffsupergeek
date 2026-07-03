"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { X, Search, Plus, Wrench, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import type { ClienteBusquedaOp, OrdenClienteOp } from "@/types/operaciones";

// ── Debounce hook ─────────────────────────────────────────────────────────────
function useDebounce<T>(value: T, ms: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debouncedValue;
}

// ── Client search sub-component ───────────────────────────────────────────────
type ClienteSelectorProps = {
  onSelect: (c: ClienteBusquedaOp) => void;
  disabled?: boolean;
};

function ClienteSelector({ onSelect, disabled }: ClienteSelectorProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClienteBusquedaOp[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [showCrear, setShowCrear] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoCedula, setNuevoCedula] = useState("");
  const [nuevoTelefono, setNuevoTelefono] = useState("");
  const [nuevoCorreo, setNuevoCorreo] = useState("");
  const [crearLoading, setCrearLoading] = useState(false);
  const [crearError, setCrearError] = useState("");
  const [cedulaDuplicado, setCedulaDuplicado] = useState<ClienteBusquedaOp | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debouncedQ = useDebounce(query, 300);

  useEffect(() => {
    if (debouncedQ.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    fetch(`/api/operaciones/clientes/buscar?q=${encodeURIComponent(debouncedQ)}`)
      .then((r) => r.json())
      .then((d: { success: boolean; data: ClienteBusquedaOp[] }) => {
        if (!cancelled) {
          setResults(d.success ? d.data : []);
          setOpen(true);
        }
      })
      .catch(() => { if (!cancelled) setResults([]); })
      .finally(() => { if (!cancelled) setSearching(false); });
    return () => { cancelled = true; };
  }, [debouncedQ]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleCrear() {
    if (!nuevoNombre.trim()) { setCrearError("El nombre es obligatorio."); return; }
    setCrearLoading(true);
    setCrearError("");
    setCedulaDuplicado(null);
    try {
      const res = await fetch("/api/operaciones/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nuevoNombre, cedula: nuevoCedula, telefono: nuevoTelefono, correo: nuevoCorreo }),
      });
      const d = (await res.json()) as { success: boolean; data?: ClienteBusquedaOp; error?: string };
      if (res.status === 409 && d.data) {
        setCedulaDuplicado(d.data);
        return;
      }
      if (!res.ok || !d.success || !d.data) {
        setCrearError(d.error ?? "Error al crear el cliente.");
        return;
      }
      onSelect(d.data);
    } catch {
      setCrearError("Error de conexión.");
    } finally {
      setCrearLoading(false);
    }
  }

  function usarClienteExistente(c: ClienteBusquedaOp) {
    setCedulaDuplicado(null);
    setShowCrear(false);
    onSelect(c);
  }

  return (
    <div ref={containerRef} className="relative flex flex-col gap-2">
      <div className="relative">
        <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6B66]" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          disabled={disabled}
          placeholder="Buscar por nombre o cédula…"
          className="w-full rounded-lg border border-[#3A3A36] bg-[#252622] py-2.5 pl-8 pr-8 text-sm text-[#F0F0EC] placeholder-[#4A4A46] outline-none transition focus:border-[#D7FF4F]/60 focus:ring-1 focus:ring-[#D7FF4F]/20 disabled:opacity-50"
        />
        {searching && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[#6B6B66]" />}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full z-10 mt-1 w-full overflow-hidden rounded-lg border border-[#3A3A36] bg-[#1A1B18] shadow-lg">
          {results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-[#6B6B66]">Sin resultados.</p>
          ) : (
            results.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { onSelect(c); setQuery(""); setOpen(false); }}
                className="flex w-full flex-col items-start px-3 py-2 text-left transition hover:bg-[#252622]"
              >
                <span className="text-sm font-medium text-[#F0F0EC]">{c.nombre}</span>
                <span className="text-xs text-[#6B6B66]">
                  {c.cedula ? `CI ${c.cedula}` : "Sin cédula"}
                  {c.telefono ? ` · ${c.telefono}` : ""}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {/* Crear cliente */}
      <button
        type="button"
        onClick={() => setShowCrear((v) => !v)}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 text-xs text-[#6B6B66] transition hover:text-[#D7FF4F] disabled:opacity-50"
      >
        {showCrear ? <ChevronUp size={12} /> : <Plus size={12} />}
        Crear cliente nuevo
      </button>

      {showCrear && (
        <div className="flex flex-col gap-2 rounded-lg border border-[#3A3A36] bg-[#252622] p-3">
          {crearError && (
            <p className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-300">{crearError}</p>
          )}
          {cedulaDuplicado && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2">
              <p className="mb-1.5 text-xs font-semibold text-amber-300">Ya existe un cliente con esta cédula:</p>
              <p className="text-xs text-[#F0F0EC]">{cedulaDuplicado.nombre}</p>
              <p className="text-[11px] text-[#8A8A80]">
                {cedulaDuplicado.cedula ? `CI ${cedulaDuplicado.cedula}` : ""}
                {cedulaDuplicado.telefono ? ` · ${cedulaDuplicado.telefono}` : ""}
              </p>
              <button
                type="button"
                onClick={() => usarClienteExistente(cedulaDuplicado)}
                className="mt-1.5 rounded-full border border-amber-400/50 bg-amber-400/10 px-2.5 py-1 text-xs font-semibold text-amber-300 transition hover:border-amber-400/80 hover:bg-amber-400/20"
              >
                Usar este cliente
              </button>
            </div>
          )}
          <input
            type="text"
            placeholder="Nombre *"
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            disabled={crearLoading}
            className="rounded-md border border-[#3A3A36] bg-[#1E1F1C] px-2.5 py-1.5 text-xs text-[#F0F0EC] placeholder-[#4A4A46] outline-none focus:border-[#D7FF4F]/50 disabled:opacity-50"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Cédula"
              value={nuevoCedula}
              onChange={(e) => setNuevoCedula(e.target.value)}
              disabled={crearLoading}
              className="rounded-md border border-[#3A3A36] bg-[#1E1F1C] px-2.5 py-1.5 text-xs text-[#F0F0EC] placeholder-[#4A4A46] outline-none focus:border-[#D7FF4F]/50 disabled:opacity-50"
            />
            <input
              type="text"
              placeholder="Teléfono"
              value={nuevoTelefono}
              onChange={(e) => setNuevoTelefono(e.target.value)}
              disabled={crearLoading}
              className="rounded-md border border-[#3A3A36] bg-[#1E1F1C] px-2.5 py-1.5 text-xs text-[#F0F0EC] placeholder-[#4A4A46] outline-none focus:border-[#D7FF4F]/50 disabled:opacity-50"
            />
          </div>
          <input
            type="email"
            placeholder="Correo"
            value={nuevoCorreo}
            onChange={(e) => setNuevoCorreo(e.target.value)}
            disabled={crearLoading}
            className="rounded-md border border-[#3A3A36] bg-[#1E1F1C] px-2.5 py-1.5 text-xs text-[#F0F0EC] placeholder-[#4A4A46] outline-none focus:border-[#D7FF4F]/50 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleCrear}
            disabled={crearLoading || !nuevoNombre.trim()}
            className="self-end rounded-full bg-[#D7FF4F] px-3 py-1 text-xs font-bold text-[#10110E] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {crearLoading ? "Guardando…" : "Guardar cliente"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Orden selector sub-component ──────────────────────────────────────────────
type OrdenSelectorProps = {
  clienteId: string;
  selectedOrdenId: string | null;
  onSelect: (o: OrdenClienteOp | null) => void;
  disabled?: boolean;
};

function OrdenSelectorInline({ clienteId, selectedOrdenId, onSelect, disabled }: OrdenSelectorProps) {
  const [ordenes, setOrdenes] = useState<OrdenClienteOp[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/operaciones/clientes/${encodeURIComponent(clienteId)}/ordenes`)
      .then((r) => r.json())
      .then((d: { success: boolean; data: OrdenClienteOp[]; error?: string }) => {
        if (!cancelled) {
          if (d.success) setOrdenes(d.data);
          else setError(d.error ?? "Error al cargar órdenes.");
        }
      })
      .catch(() => { if (!cancelled) setError("Error de conexión."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [clienteId]);

  if (loading) return <p className="flex items-center gap-1 text-xs text-[#6B6B66]"><Loader2 size={11} className="animate-spin" /> Cargando órdenes…</p>;
  if (error) return <p className="text-xs text-red-400">{error}</p>;
  if (ordenes.length === 0) return <p className="text-xs text-[#4A4A46]">El cliente no tiene órdenes de reparación.</p>;

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => onSelect(null)}
        disabled={disabled}
        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition ${
          selectedOrdenId === null
            ? "border-[#6B6B66] bg-[#3A3A36]/30 text-[#A0A09A]"
            : "border-[#3A3A36] text-[#6B6B66] hover:border-[#5A5A56]"
        }`}
      >
        Sin orden vinculada
      </button>
      {ordenes.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onSelect(o)}
          disabled={disabled}
          className={`flex flex-col items-start rounded-lg border px-3 py-2 text-left transition ${
            selectedOrdenId === o.id
              ? "border-[#78B7FF]/50 bg-[#78B7FF]/8 text-[#F0F0EC]"
              : "border-[#3A3A36] text-[#C0C0BC] hover:border-[#5A5A56]"
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Wrench size={11} className="text-[#78B7FF]" />
            <span className="font-mono text-xs font-semibold">{o.codigoOrden}</span>
            <span className="ml-1 rounded-full bg-[#3A3A36]/60 px-1.5 py-0.5 text-[10px] text-[#8A8A80]">{o.estado}</span>
          </div>
          {o.equipo && <span className="mt-0.5 text-[11px] text-[#8A8A80]">{o.equipo}</span>}
        </button>
      ))}
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
type Props = {
  onClose: () => void;
};

export function NuevaOperacionModal({ onClose }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "submitting">("form");
  const [error, setError] = useState("");

  // Form state
  const [cliente, setCliente] = useState<ClienteBusquedaOp | null>(null);
  const [productoSolicitado, setProductoSolicitado] = useState("");
  const [categoria, setCategoria] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [requiereInstalacion, setRequiereInstalacion] = useState(false);
  const [equipoEnTienda, setEquipoEnTienda] = useState(false);

  // Orden section
  const [showOrden, setShowOrden] = useState(false);
  const [selectedOrden, setSelectedOrden] = useState<OrdenClienteOp | null>(null);

  // Categories
  const [categorias, setCategorias] = useState<string[]>([]);
  useEffect(() => {
    fetch("/api/operaciones/categorias")
      .then((r) => r.json())
      .then((d: { success: boolean; data: string[] }) => { if (d.success) setCategorias(d.data); })
      .catch(() => {});
  }, []);

  const handleClienteSelect = useCallback((c: ClienteBusquedaOp) => {
    setCliente(c);
    setSelectedOrden(null);
    setShowOrden(false);
  }, []);

  const canSubmit = !!cliente && productoSolicitado.trim().length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) { setError("Completa los campos obligatorios."); return; }

    setStep("submitting");
    setError("");

    try {
      const res = await fetch("/api/operaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clienteId: cliente!.id,
          productoSolicitado: productoSolicitado.trim(),
          categoria: categoria.trim() || undefined,
          descripcionRequerimiento: descripcion.trim() || undefined,
          requiereInstalacion,
          equipoEnTienda,
          ordenId: selectedOrden?.id ?? null,
        }),
      });
      const d = (await res.json()) as { success: boolean; id?: string; error?: string };
      if (!res.ok || !d.success || !d.id) {
        setError(d.error ?? "Error al crear la operación.");
        setStep("form");
        return;
      }
      router.push(`/operaciones/${d.id}`);
    } catch {
      setError("Error de conexión.");
      setStep("form");
    }
  }

  const loading = step === "submitting";

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
        onClick={loading ? undefined : onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="nueva-op-title"
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-[#3A3A36] bg-[#1E1F1C] shadow-2xl shadow-black/60"
        style={{ maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#3A3A36] px-5 py-4">
          <div className="flex items-center gap-2">
            <Plus size={15} className="text-[#D7FF4F]" />
            <h2 id="nueva-op-title" className="text-sm font-semibold text-[#F0F0EC]">
              Nueva operación comercial
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-full p-1 text-[#6B6B66] transition hover:bg-[#3A3A36] hover:text-[#F0F0EC] disabled:pointer-events-none"
            aria-label="Cerrar"
          >
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5 p-5">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Cliente */}
          <section className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#8A8A80]">
              Cliente <span className="text-[#FF5A4F]">*</span>
            </p>
            {cliente ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-[#56E3A4]/30 bg-[#56E3A4]/5 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-[#F0F0EC]">{cliente.nombre}</p>
                  <p className="text-xs text-[#6B6B66]">
                    {cliente.cedula ? `CI ${cliente.cedula}` : "Sin cédula"}
                    {cliente.telefono ? ` · ${cliente.telefono}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setCliente(null); setSelectedOrden(null); setShowOrden(false); }}
                  disabled={loading}
                  className="rounded-full p-1 text-[#6B6B66] transition hover:bg-[#3A3A36] hover:text-[#F0F0EC]"
                  aria-label="Cambiar cliente"
                >
                  <X size={13} />
                </button>
              </div>
            ) : (
              <ClienteSelector onSelect={handleClienteSelect} disabled={loading} />
            )}
          </section>

          {/* Producto Solicitado */}
          <section className="flex flex-col gap-2">
            <label htmlFor="op-producto" className="text-xs font-semibold uppercase tracking-wide text-[#8A8A80]">
              Producto Solicitado <span className="text-[#FF5A4F]">*</span>
            </label>
            <input
              id="op-producto"
              type="text"
              value={productoSolicitado}
              onChange={(e) => setProductoSolicitado(e.target.value)}
              required
              disabled={loading}
              placeholder="Ej. Pantalla iPhone 13, RAM laptop…"
              className="w-full rounded-lg border border-[#3A3A36] bg-[#252622] px-3 py-2.5 text-sm text-[#F0F0EC] placeholder-[#4A4A46] outline-none transition focus:border-[#D7FF4F]/60 focus:ring-1 focus:ring-[#D7FF4F]/20 disabled:opacity-50"
            />
          </section>

          {/* Categoría */}
          <section className="flex flex-col gap-2">
            <label htmlFor="op-categoria" className="text-xs font-semibold uppercase tracking-wide text-[#8A8A80]">
              Categoría
            </label>
            <select
              id="op-categoria"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              disabled={loading}
              className="w-full rounded-lg border border-[#3A3A36] bg-[#252622] px-3 py-2.5 text-sm text-[#F0F0EC] outline-none transition focus:border-[#D7FF4F]/60 focus:ring-1 focus:ring-[#D7FF4F]/20 disabled:opacity-50"
            >
              <option value="">— Sin categoría —</option>
              {categorias.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </section>

          {/* Descripción */}
          <section className="flex flex-col gap-2">
            <label htmlFor="op-descripcion" className="text-xs font-semibold uppercase tracking-wide text-[#8A8A80]">
              Descripción del Requerimiento
            </label>
            <textarea
              id="op-descripcion"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              disabled={loading}
              rows={3}
              placeholder="Detalles adicionales del cliente…"
              className="w-full resize-none rounded-lg border border-[#3A3A36] bg-[#252622] px-3 py-2.5 text-sm text-[#F0F0EC] placeholder-[#4A4A46] outline-none transition focus:border-[#D7FF4F]/60 focus:ring-1 focus:ring-[#D7FF4F]/20 disabled:opacity-50"
            />
          </section>

          {/* Checkboxes */}
          <section className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#8A8A80]">Detalles</p>
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={requiereInstalacion}
                onChange={(e) => setRequiereInstalacion(e.target.checked)}
                disabled={loading}
                className="h-4 w-4 rounded border-[#3A3A36] accent-[#D7FF4F] disabled:opacity-50"
              />
              <span className="text-sm text-[#C0C0BC]">Requiere instalación</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={equipoEnTienda}
                onChange={(e) => setEquipoEnTienda(e.target.checked)}
                disabled={loading}
                className="h-4 w-4 rounded border-[#3A3A36] accent-[#D7FF4F] disabled:opacity-50"
              />
              <span className="text-sm text-[#C0C0BC]">Equipo ya está en tienda</span>
            </label>
          </section>

          {/* Vincular orden */}
          {cliente && (
            <section className="flex flex-col gap-2 rounded-lg border border-[#3A3A36] p-3">
              <button
                type="button"
                onClick={() => setShowOrden((v) => !v)}
                disabled={loading}
                className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-[#8A8A80] transition hover:text-[#A0A09A] disabled:opacity-50"
              >
                <span className="flex items-center gap-1.5">
                  <Wrench size={12} className="text-[#78B7FF]" />
                  Vincular orden de reparación (opcional)
                </span>
                {showOrden ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>

              {showOrden && (
                <div className="flex flex-col gap-2 pt-1">
                  {selectedOrden && (
                    <div className="flex items-center gap-2 rounded-md border border-[#78B7FF]/30 bg-[#78B7FF]/5 px-2 py-1.5">
                      <Wrench size={11} className="text-[#78B7FF]" />
                      <span className="text-xs font-mono font-semibold text-[#78B7FF]">{selectedOrden.codigoOrden}</span>
                      <span className="text-xs text-[#6B6B66]">{selectedOrden.equipo}</span>
                    </div>
                  )}
                  <OrdenSelectorInline
                    clienteId={cliente.id}
                    selectedOrdenId={selectedOrden?.id ?? null}
                    onSelect={(o) => setSelectedOrden(o)}
                    disabled={loading}
                  />
                </div>
              )}
            </section>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-[#3A3A36] pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm text-[#8A8A80] transition hover:border-[#5A5A56] hover:text-[#F0F0EC] disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !canSubmit}
              className="inline-flex min-w-[140px] items-center justify-center gap-1.5 rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-2 text-sm font-bold text-[#10110E] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#10110E]/30 border-t-[#10110E]" />
                  Creando…
                </>
              ) : (
                "Crear operación"
              )}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
