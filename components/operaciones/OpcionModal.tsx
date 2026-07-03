"use client";

import { useState, useEffect, useRef } from "react";
import { X, Search, Loader2, ImagePlus } from "lucide-react";
import type { OpcionDetalle, ProveedorBusqueda } from "@/types/operaciones";

function useDebounce<T>(v: T, ms: number): T {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

// ── Proveedor search input ────────────────────────────────────────────────────
type ProveedorSelectorProps = {
  initial: ProveedorBusqueda | null;
  onChange: (p: ProveedorBusqueda | null) => void;
  disabled?: boolean;
};

function ProveedorSelector({ initial, onChange, disabled }: ProveedorSelectorProps) {
  const [selected, setSelected] = useState<ProveedorBusqueda | null>(initial);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProveedorBusqueda[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dq = useDebounce(query, 280);

  useEffect(() => {
    if (dq.length < 2) { setResults([]); setOpen(false); return; }
    let cancelled = false;
    setSearching(true);
    fetch(`/api/operaciones/proveedores/buscar?q=${encodeURIComponent(dq)}`)
      .then((r) => r.json())
      .then((d: { success: boolean; data: ProveedorBusqueda[] }) => {
        if (!cancelled) { setResults(d.success ? d.data : []); setOpen(true); }
      })
      .catch(() => { if (!cancelled) setResults([]); })
      .finally(() => { if (!cancelled) setSearching(false); });
    return () => { cancelled = true; };
  }, [dq]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function select(p: ProveedorBusqueda) {
    setSelected(p); onChange(p); setQuery(""); setOpen(false);
  }
  function clear() {
    setSelected(null); onChange(null); setQuery("");
  }

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-[#3A3A36] bg-[#252622] px-3 py-2">
        <span className="text-sm text-[#F0F0EC]">{selected.nombre}</span>
        <button type="button" onClick={clear} disabled={disabled} className="text-[#6B6B66] hover:text-[#F0F0EC] transition disabled:opacity-50">
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6B66]" />
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        disabled={disabled}
        placeholder="Buscar proveedor…"
        className="w-full rounded-lg border border-[#3A3A36] bg-[#252622] py-2.5 pl-8 pr-8 text-sm text-[#F0F0EC] placeholder-[#4A4A46] outline-none transition focus:border-[#D7FF4F]/60 focus:ring-1 focus:ring-[#D7FF4F]/20 disabled:opacity-50"
      />
      {searching && <Loader2 size={12} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-[#6B6B66]" />}
      {open && (
        <div className="absolute top-full z-10 mt-1 w-full overflow-hidden rounded-lg border border-[#3A3A36] bg-[#1A1B18] shadow-lg">
          {results.length === 0
            ? <p className="px-3 py-2 text-xs text-[#6B6B66]">Sin resultados.</p>
            : results.map((p) => (
                <button key={p.id} type="button" onClick={() => select(p)}
                  className="w-full px-3 py-2 text-left text-sm text-[#F0F0EC] transition hover:bg-[#252622]">
                  {p.nombre}
                </button>
              ))
          }
        </div>
      )}
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
type Props = {
  operacionId: string;
  opcion?: OpcionDetalle | null;
  onClose: () => void;
  onSuccess: () => void;
};

export function OpcionModal({ operacionId, opcion, onClose, onSuccess }: Props) {
  const isEdit = !!opcion;

  // Form state — initialised from existing opción in edit mode
  const [productoDescripcion, setProductoDescripcion] = useState(opcion?.productoDescripcion ?? "");
  const [proveedor, setProveedor] = useState<ProveedorBusqueda | null>(
    opcion?.proveedorId ? { id: opcion.proveedorId, nombre: opcion.proveedorNombre } : null
  );
  const [tiempoEstimado, setTiempoEstimado] = useState(opcion?.tiempoEstimado ?? "");
  const [costoProveedor, setCostoProveedor] = useState(opcion?.costoProveedor != null ? String(opcion.costoProveedor) : "");
  const [precioVentaCliente, setPrecioVentaCliente] = useState(opcion?.precioVentaCliente != null ? String(opcion.precioVentaCliente) : "");
  const [urlProveedor, setUrlProveedor] = useState(opcion?.urlProveedor ?? "");
  const [notaParaCliente, setNotaParaCliente] = useState(opcion?.notaParaCliente ?? "");
  const [notaInterna, setNotaInterna] = useState(opcion?.notaInterna ?? "");
  const [nuevasFotos, setNuevasFotos] = useState<File[]>([]);

  const [tiemposDisponibles, setTiemposDisponibles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/operaciones/tiempos-estimados")
      .then((r) => r.json())
      .then((d: { success: boolean; data: string[] }) => { if (d.success) setTiemposDisponibles(d.data); })
      .catch(() => {});
  }, []);

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setNuevasFotos((prev) => [...prev, ...files]);
    e.target.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!productoDescripcion.trim()) { setError("El campo Producto / Descripción es obligatorio."); return; }

    setLoading(true);
    setError("");

    const fd = new FormData();
    fd.set("productoDescripcion", productoDescripcion.trim());
    fd.set("proveedorId", proveedor?.id ?? "");
    fd.set("tiempoEstimado", tiempoEstimado.trim());
    fd.set("costoProveedor", costoProveedor.trim());
    fd.set("precioVentaCliente", precioVentaCliente.trim());
    fd.set("urlProveedor", urlProveedor.trim());
    fd.set("notaParaCliente", notaParaCliente.trim());
    fd.set("notaInterna", notaInterna.trim());
    for (const foto of nuevasFotos) fd.append("fotos", foto);

    const url = isEdit
      ? `/api/operaciones/${operacionId}/opciones/${opcion!.id}`
      : `/api/operaciones/${operacionId}/opciones`;
    const method = isEdit ? "PATCH" : "POST";

    try {
      const res = await fetch(url, { method, body: fd });
      const d = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !d.success) { setError(d.error ?? "Error al guardar la opción."); return; }
      onSuccess();
    } catch {
      setError("Error de conexión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={loading ? undefined : onClose} aria-hidden="true" />
      <div
        role="dialog" aria-modal="true" aria-labelledby="opcion-modal-title"
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-[#3A3A36] bg-[#1E1F1C] shadow-2xl shadow-black/60"
        style={{ maxHeight: "92vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#3A3A36] px-5 py-4">
          <h2 id="opcion-modal-title" className="text-sm font-semibold text-[#F0F0EC]">
            {isEdit ? "Editar opción" : "Agregar opción cotizada"}
          </h2>
          <button type="button" onClick={onClose} disabled={loading}
            className="rounded-full p-1 text-[#6B6B66] transition hover:bg-[#3A3A36] hover:text-[#F0F0EC] disabled:pointer-events-none" aria-label="Cerrar">
            <X size={15} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>
          )}

          {/* Producto / Descripción */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="op-desc" className="text-xs font-medium text-[#8A8A80]">
              Producto / Descripción <span className="text-[#FF5A4F]">*</span>
            </label>
            <textarea id="op-desc" value={productoDescripcion} onChange={(e) => setProductoDescripcion(e.target.value)}
              required disabled={loading} rows={2} placeholder="Describe el producto o servicio cotizado…"
              className="w-full resize-none rounded-lg border border-[#3A3A36] bg-[#252622] px-3 py-2.5 text-sm text-[#F0F0EC] placeholder-[#4A4A46] outline-none transition focus:border-[#D7FF4F]/60 focus:ring-1 focus:ring-[#D7FF4F]/20 disabled:opacity-50"
            />
          </div>

          {/* Proveedor */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[#8A8A80]">Proveedor</span>
            <ProveedorSelector initial={proveedor} onChange={setProveedor} disabled={loading} />
          </div>

          {/* Tiempo Estimado */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="op-tiempo" className="text-xs font-medium text-[#8A8A80]">Tiempo Estimado</label>
            <input id="op-tiempo" list="tiempos-list" type="text" value={tiempoEstimado}
              onChange={(e) => setTiempoEstimado(e.target.value)} disabled={loading}
              placeholder="Ej. 5-7 días, 2 semanas…"
              className="w-full rounded-lg border border-[#3A3A36] bg-[#252622] px-3 py-2.5 text-sm text-[#F0F0EC] placeholder-[#4A4A46] outline-none transition focus:border-[#D7FF4F]/60 focus:ring-1 focus:ring-[#D7FF4F]/20 disabled:opacity-50"
            />
            {tiemposDisponibles.length > 0 && (
              <datalist id="tiempos-list">
                {tiemposDisponibles.map((t) => <option key={t} value={t} />)}
              </datalist>
            )}
          </div>

          {/* Precios */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="op-costo" className="text-xs font-medium text-[#8A8A80]">Costo Proveedor</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#6B6B66]">$</span>
                <input id="op-costo" type="number" step="0.01" min="0" value={costoProveedor}
                  onChange={(e) => setCostoProveedor(e.target.value)} disabled={loading} placeholder="0.00"
                  className="w-full rounded-lg border border-[#3A3A36] bg-[#252622] py-2.5 pl-7 pr-3 text-sm text-[#F0F0EC] placeholder-[#4A4A46] outline-none transition focus:border-[#D7FF4F]/60 focus:ring-1 focus:ring-[#D7FF4F]/20 disabled:opacity-50"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="op-precio" className="text-xs font-medium text-[#8A8A80]">Precio al Cliente</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#6B6B66]">$</span>
                <input id="op-precio" type="number" step="0.01" min="0" value={precioVentaCliente}
                  onChange={(e) => setPrecioVentaCliente(e.target.value)} disabled={loading} placeholder="0.00"
                  className="w-full rounded-lg border border-[#3A3A36] bg-[#252622] py-2.5 pl-7 pr-3 text-sm text-[#F0F0EC] placeholder-[#4A4A46] outline-none transition focus:border-[#D7FF4F]/60 focus:ring-1 focus:ring-[#D7FF4F]/20 disabled:opacity-50"
                />
              </div>
            </div>
          </div>

          {/* URL Proveedor */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="op-url" className="text-xs font-medium text-[#8A8A80]">URL del Proveedor</label>
            <input id="op-url" type="url" value={urlProveedor} onChange={(e) => setUrlProveedor(e.target.value)}
              disabled={loading} placeholder="https://…"
              className="w-full rounded-lg border border-[#3A3A36] bg-[#252622] px-3 py-2.5 text-sm text-[#F0F0EC] placeholder-[#4A4A46] outline-none transition focus:border-[#D7FF4F]/60 focus:ring-1 focus:ring-[#D7FF4F]/20 disabled:opacity-50"
            />
          </div>

          {/* Notas */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="op-nota-cliente" className="text-xs font-medium text-[#8A8A80]">Nota para el cliente</label>
            <textarea id="op-nota-cliente" value={notaParaCliente} onChange={(e) => setNotaParaCliente(e.target.value)}
              disabled={loading} rows={2} placeholder="Visible para el cliente…"
              className="w-full resize-none rounded-lg border border-[#3A3A36] bg-[#252622] px-3 py-2.5 text-sm text-[#F0F0EC] placeholder-[#4A4A46] outline-none transition focus:border-[#D7FF4F]/60 focus:ring-1 focus:ring-[#D7FF4F]/20 disabled:opacity-50"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="op-nota-interna" className="text-xs font-medium text-[#8A8A80]">Nota interna</label>
            <textarea id="op-nota-interna" value={notaInterna} onChange={(e) => setNotaInterna(e.target.value)}
              disabled={loading} rows={2} placeholder="Solo visible para el equipo…"
              className="w-full resize-none rounded-lg border border-[#3A3A36] bg-[#252622] px-3 py-2.5 text-sm text-[#F0F0EC] placeholder-[#4A4A46] outline-none transition focus:border-[#D7FF4F]/60 focus:ring-1 focus:ring-[#D7FF4F]/20 disabled:opacity-50"
            />
          </div>

          {/* Fotos */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[#8A8A80]">
              Fotos{isEdit ? " (agregar más)" : ""}
            </span>
            {/* Existing fotos in edit mode */}
            {isEdit && opcion!.fotos.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {opcion!.fotos.map((f, i) => {
                  const t = f.thumbnails as { small?: { url?: string } } | undefined;
                  return (
                    <a key={f.id ?? i} href={f.url} target="_blank" rel="noopener noreferrer"
                      className="overflow-hidden rounded-md border border-[#3A3A36]" title={f.filename ?? ""}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={t?.small?.url ?? f.url} alt={f.filename ?? `foto ${i + 1}`} className="h-12 w-12 object-cover" />
                    </a>
                  );
                })}
                <p className="w-full text-[11px] text-[#4A4A46]">Las fotos existentes se conservan. Agrega nuevas a continuación.</p>
              </div>
            )}
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[#3A3A36] px-3 py-2.5 transition hover:border-[#5A5A56] disabled:opacity-50">
              <ImagePlus size={14} className="text-[#6B6B66]" />
              <span className="text-sm text-[#6B6B66]">
                {nuevasFotos.length > 0 ? `${nuevasFotos.length} foto(s) seleccionada(s)` : "Seleccionar fotos…"}
              </span>
              <input type="file" accept="image/*" multiple onChange={handleFiles} disabled={loading} className="sr-only" />
            </label>
            {nuevasFotos.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {nuevasFotos.map((f, i) => (
                  <div key={i} className="flex items-center gap-1 rounded-full bg-[#3A3A36] px-2 py-0.5">
                    <span className="max-w-[120px] truncate text-[11px] text-[#C0C0BC]">{f.name}</span>
                    <button type="button" onClick={() => setNuevasFotos((prev) => prev.filter((_, j) => j !== i))}
                      className="text-[#6B6B66] hover:text-[#F0F0EC] transition">
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-[#3A3A36] pt-4">
            <button type="button" onClick={onClose} disabled={loading}
              className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm text-[#8A8A80] transition hover:border-[#5A5A56] hover:text-[#F0F0EC] disabled:opacity-50">
              Cancelar
            </button>
            <button type="submit" disabled={loading || !productoDescripcion.trim()}
              className="inline-flex min-w-[130px] items-center justify-center gap-1.5 rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-2 text-sm font-bold text-[#10110E] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? (
                <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#10110E]/30 border-t-[#10110E]" />Guardando…</>
              ) : (
                isEdit ? "Guardar cambios" : "Agregar opción"
              )}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
