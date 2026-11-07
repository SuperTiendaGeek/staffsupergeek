"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import styles from "@/components/tecnicos/layout/TecnicosTheme.module.css";
import { GestionLicencia } from "@/components/productos-digitales/GestionLicencia";
import {
  camposDeCredenciales, contarPorEstado, filtrarFilas, ordenarFilas,
  type ColumnaOrden, type FilaDigital,
} from "@/lib/productos-digitales/reglas";

// Pantalla rediseñada en el punto 5A (7-nov-2026): tabla compacta con SKU,
// orden y cliente visibles, filtros con conteo, orden por columna (lo más
// reciente primero) y un panel lateral con el detalle, las credenciales
// (ocultas) y el PDF. Las credenciales nunca usan campos de contraseña del
// navegador: el gestor de contraseñas los autocompletaba ("Elfina.8990").
// Punto 5B-2: ya no hay "Nuevo producto": una licencia entra solo por su
// compra (Shipping V2 → Registrar compra → Producto digital). Aquí quedan
// Editar, Reclamo al proveedor, Resolver, Anular y Ver compra.

// ─── Types ─────────────────────────────────────────────────────────────────

type ProductoDigital = {
  id: string;
  articuloId?: string | null;
  sku: string;
  numero: number | null;
  ordenCodigo: string | null;
  clienteNombre: string | null;
  documentoVenta: string | null;
  catalogoId: string | null;
  softwareProducto: string;
  marcaProducto: string | null;
  tipoProducto: string | null;
  portalActivacionCatalogo: string | null;
  estado: string;
  proveedor: string | null;
  costoProveedor: number | null;
  precioVenta: number | null;
  claveTruncada: string | null;
  usuarioCorreo: string | null;
  duracion: string | null;
  expira: string | null;
  fechaCompra: string | null;
  fechaUsoVenta: string | null;
  ordenReparacionId: string | null;
  clienteId: string | null;
  tipoUso: string | null;
  usadoVendidoPor: string | null;
  observacionesInternas: string | null;
  documentoPdfUrl: string | null;
  documentoGeneradoPor: string | null;
  fechaUltimoPdf: string | null;
};

type Credenciales = {
  claveActivacion: string | null;
  usuarioCorreo: string | null;
  contraseña: string | null;
};

const ESTADOS = ["Disponible", "Reservado", "En reclamo", "Usado", "Anulado", "Vencido"] as const;
type EstadoPD = (typeof ESTADOS)[number];

const FILTER_TABS: { label: string; value: string }[] = [
  { label: "Todos", value: "" },
  { label: "Disponibles", value: "Disponible" },
  { label: "Reservados", value: "Reservado" },
  { label: "En reclamo", value: "En reclamo" },
  { label: "Usados", value: "Usado" },
  { label: "Anulados", value: "Anulado" },
  { label: "Vencidos", value: "Vencido" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────

const estadoBadge = (estado: string) => {
  switch (estado as EstadoPD) {
    case "Disponible":
      return "border-[var(--sg-lime)]/50 bg-[var(--sg-lime-soft)] text-[var(--sg-lime)]";
    case "Reservado":
      return "border-[var(--sg-info)]/50 bg-[var(--sg-info-soft)] text-[var(--sg-info)]";
    case "Usado":
      return "border-[var(--sg-border)] bg-[var(--sg-card-elevated)] text-[var(--sg-text-secondary)]";
    case "Anulado":
      return "border-[var(--sg-danger)]/50 bg-[var(--sg-danger-soft)] text-[var(--sg-danger)]";
    case "Vencido":
    case "En reclamo":
      return "border-[var(--sg-warning)]/50 bg-[var(--sg-warning-soft)] text-[var(--sg-warning)]";
    default:
      return "border-[var(--sg-border)] bg-[var(--sg-card-elevated)] text-[var(--sg-text-secondary)]";
  }
};

const formatCurrency = (value: number | null) => {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
};


const aFila = (p: ProductoDigital): FilaDigital => ({
  id: p.id,
  sku: p.sku,
  numero: p.numero,
  producto: p.softwareProducto,
  estado: p.estado,
  ordenCodigo: p.ordenCodigo ?? "",
  clienteNombre: p.clienteNombre ?? "",
  documento: p.documentoVenta ?? "",
  proveedor: p.proveedor ?? "",
  usuarioCorreo: p.usuarioCorreo ?? "",
  fechaCompra: p.fechaCompra ?? "",
  fechaUso: p.fechaUsoVenta ?? "",
  precio: p.precioVenta,
});

const fechaCorta = (value: string | null | undefined) => {
  if (!value) return "—";
  const t = Date.parse(value);
  return Number.isFinite(t)
    ? new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(t))
    : value;
};

const COLUMNAS: { col: ColumnaOrden; label: string; className?: string }[] = [
  { col: "sku", label: "SKU" },
  { col: "producto", label: "Producto" },
  { col: "estado", label: "Estado" },
  { col: "orden", label: "Orden" },
  { col: "cliente", label: "Cliente" },
  { col: "compra", label: "Compra" },
  { col: "uso", label: "Uso / venta" },
  { col: "precio", label: "Precio", className: "text-right" },
];

// ─── Component ────────────────────────────────────────────────────────────

export function ProductosDigitalesClient() {
  const [productos, setProductos] = useState<ProductoDigital[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Credenciales reveal
  const [credVisible, setCredVisible] = useState<Record<string, boolean>>({});
  const [credData, setCredData] = useState<Record<string, Credenciales>>({});
  const [credLoading, setCredLoading] = useState<Record<string, boolean>>({});
  const [credError, setCredError] = useState<Record<string, string | null>>({});

  // PDF
  const [pdfLoading, setPdfLoading] = useState<Record<string, boolean>>({});
  const [pdfError, setPdfError] = useState<Record<string, string | null>>({});
  const [pdfDeleteConfirmId, setPdfDeleteConfirmId] = useState<string | null>(null);
  const [pdfDeleteLoading, setPdfDeleteLoading] = useState<Record<string, boolean>>({});

  // Session (para saber rol del usuario)
  const [userRol, setUserRol] = useState("");
  // Punto 5B-2: Registrar compra, Editar, Reclamo y Anular (Staff y Administradores).
  const [puedeGestionar, setPuedeGestionar] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/tecnicos/session");
        const json = await res.json();
        if (json.success) setUserRol(json.user?.rol ?? "");
      } catch { /* ignore */ }
    })();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  const fetchProductos = async () => {
    setLoading(true);
    setError(null);
    try {
      // Se traen todas (son pocas): filtros, búsqueda y orden se hacen aquí, al instante.
      const res = await fetch(`/api/tecnicos/productos-digitales`, { cache: "no-store" });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Error al cargar");
      setProductos(json.data ?? []);
      setPuedeGestionar(json.puedeGestionar === true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar productos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchProductos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tabla: orden por columna (por defecto lo más reciente primero) y panel lateral.
  const [orden, setOrden] = useState<{ col: ColumnaOrden; dir: "asc" | "desc" }>({ col: "sku", dir: "desc" });
  const [seleccionId, setSeleccionId] = useState<string | null>(null);
  const filas = useMemo(() => productos.map(aFila), [productos]);
  const conteo = useMemo(() => contarPorEstado(filas), [filas]);
  const visibles = useMemo(
    () => ordenarFilas(filtrarFilas(filas, estadoFiltro, debouncedSearch), orden.col, orden.dir),
    [filas, estadoFiltro, debouncedSearch, orden],
  );
  const seleccion = productos.find((p) => p.id === seleccionId) ?? null;
  const ordenarPor = (col: ColumnaOrden) =>
    setOrden((o) => (o.col === col ? { col, dir: o.dir === "asc" ? "desc" : "asc" } : { col, dir: col === "producto" || col === "cliente" || col === "orden" || col === "estado" ? "asc" : "desc" }));

  const handleVerCredenciales = async (id: string) => {
    if (credVisible[id]) {
      setCredVisible((prev) => ({ ...prev, [id]: false }));
      return;
    }
    if (credData[id]) {
      setCredVisible((prev) => ({ ...prev, [id]: true }));
      return;
    }
    setCredLoading((prev) => ({ ...prev, [id]: true }));
    setCredError((prev) => ({ ...prev, [id]: null }));
    try {
      const res = await fetch(`/api/tecnicos/productos-digitales/${encodeURIComponent(id)}/credenciales`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Error al obtener credenciales");
      setCredData((prev) => ({ ...prev, [id]: json.data as Credenciales }));
      setCredVisible((prev) => ({ ...prev, [id]: true }));
    } catch (err) {
      setCredError((prev) => ({ ...prev, [id]: err instanceof Error ? err.message : "Error" }));
    } finally {
      setCredLoading((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handlePdfAction = async (id: string, method: "POST" | "GET", nombre: string) => {
    setPdfLoading((prev) => ({ ...prev, [id]: true }));
    setPdfError((prev) => ({ ...prev, [id]: null }));
    try {
      const res = await fetch(`/api/tecnicos/productos-digitales/${encodeURIComponent(id)}/pdf`, { method });
      if (!res.ok) {
        let msg = "Error al procesar PDF";
        try { const j = await res.json(); msg = j.error ?? msg; } catch { /* empty */ }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `SUPER-GEEK-${nombre.replace(/[^a-zA-Z0-9]/g, "-")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      // Reload list to refresh documentoPdfUrl / fechaUltimoPdf
      await fetchProductos();
    } catch (err) {
      setPdfError((prev) => ({ ...prev, [id]: err instanceof Error ? err.message : "Error" }));
    } finally {
      setPdfLoading((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleDeletePdf = async (id: string) => {
    setPdfDeleteLoading((prev) => ({ ...prev, [id]: true }));
    setPdfError((prev) => ({ ...prev, [id]: null }));
    try {
      const res = await fetch(`/api/tecnicos/productos-digitales/${encodeURIComponent(id)}/pdf`, { method: "DELETE" });
      if (!res.ok) {
        let msg = "Error al eliminar PDF";
        try { const j = await res.json(); msg = j.error ?? msg; } catch { /* empty */ }
        throw new Error(msg);
      }
      setPdfDeleteConfirmId(null);
      await fetchProductos();
    } catch (err) {
      setPdfError((prev) => ({ ...prev, [id]: err instanceof Error ? err.message : "Error al eliminar PDF" }));
    } finally {
      setPdfDeleteLoading((prev) => ({ ...prev, [id]: false }));
    }
  };

  return (
    <div className={`${styles.theme} w-full space-y-4`}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-[var(--sg-text-primary)]">Productos Digitales</h1>
        {/* Punto 5B-2: una licencia entra SOLO por su compra (costo, orden de compra, pago). */}
        {puedeGestionar && (
          <Link href="/shipping-v2/items/nuevo?tipo=digital"
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--sg-lime)]/60 px-3.5 py-1 text-xs font-semibold text-[var(--sg-lime)] transition hover:bg-[var(--sg-lime-soft)]"
            title="Shipping V2 → Registrar compra → Producto digital">
            Registrar compra
          </Link>
        )}
      </div>

      {/* Filtros con conteo + búsqueda */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setEstadoFiltro(tab.value)}
              className={`h-7 rounded-full border px-3 text-xs font-semibold transition ${
                estadoFiltro === tab.value
                  ? "border-[var(--sg-lime)] bg-[var(--sg-lime-soft)] text-[var(--sg-lime)]"
                  : "border-[var(--sg-border)] bg-[var(--sg-panel)] text-[var(--sg-text-secondary)] hover:border-[var(--sg-lime)]/40 hover:text-[var(--sg-text-primary)]"
              }`}
            >
              {tab.label} <span className="opacity-60">{conteo[tab.value] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-72">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--sg-text-muted)]">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="SKU, orden, cliente, correo…"
            autoComplete="off"
            className="h-8 w-full rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-panel)] pl-8 pr-3 text-sm text-[var(--sg-text-primary)] placeholder:text-[var(--sg-text-muted)]/60 focus:border-[var(--sg-lime)]/60 focus:outline-none"
          />
        </div>
      </div>

      {error && (
        <p className="rounded-[var(--sg-radius-sm)] border border-[var(--sg-danger)]/40 bg-[var(--sg-danger-soft)] px-3 py-2 text-xs text-[var(--sg-danger)]">{error}</p>
      )}

      {/* Tabla */}
      <div className="overflow-x-auto rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[var(--sg-card)]">
        <table className="w-full min-w-[880px] text-sm">
          <thead>
            <tr className="border-b border-[var(--sg-border)] bg-[var(--sg-panel)] text-[10px] uppercase tracking-wider text-[var(--sg-text-muted)]">
              {COLUMNAS.map((c) => (
                <th key={c.col} className={`px-3 py-2 ${c.className ?? "text-left"}`}>
                  <button type="button" onClick={() => ordenarPor(c.col)} className={`inline-flex items-center gap-1 uppercase tracking-wider transition hover:text-[var(--sg-text-primary)] ${orden.col === c.col ? "text-[var(--sg-lime)]" : ""}`}>
                    {c.label}
                    <span className={`text-[9px] transition ${orden.col === c.col ? "opacity-100" : "opacity-0"}`}>{orden.dir === "asc" ? "▲" : "▼"}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--sg-divider)]">
            {loading && (
              <tr><td colSpan={COLUMNAS.length} className="px-3 py-8 text-center text-[var(--sg-text-muted)]">Cargando…</td></tr>
            )}
            {!loading && visibles.length === 0 && (
              <tr><td colSpan={COLUMNAS.length} className="px-3 py-8 text-center text-[var(--sg-text-muted)]">{debouncedSearch || estadoFiltro ? "Nada coincide con el filtro." : "No hay productos digitales."}</td></tr>
            )}
            {!loading && visibles.map((f) => {
              const pd = productos.find((p) => p.id === f.id)!;
              return (
                <tr
                  key={f.id}
                  onClick={() => setSeleccionId(f.id)}
                  className={`cursor-pointer animate-[sg-entrada_180ms_ease-out] transition hover:bg-[var(--sg-panel)] ${seleccionId === f.id ? "bg-[var(--sg-lime-soft)]" : ""}`}
                >
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs text-[var(--sg-text-secondary)]">{f.sku || "—"}</td>
                  <td className="px-3 py-1.5">
                    <span className="block max-w-[260px] truncate font-semibold text-[var(--sg-text-primary)]" title={f.producto}>{f.producto}</span>
                    {pd.usuarioCorreo && <span className="block max-w-[260px] truncate font-mono text-[11px] text-[var(--sg-text-muted)]">{pd.usuarioCorreo}</span>}
                  </td>
                  <td className="px-3 py-1.5">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${estadoBadge(f.estado)}`}>{f.estado}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    {pd.ordenReparacionId ? (
                      <Link href={`/tecnicos/ordenes/${encodeURIComponent(pd.ordenReparacionId)}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-[var(--sg-lime)] hover:underline">
                        {f.ordenCodigo || "Ver orden"}
                      </Link>
                    ) : <span className="text-[var(--sg-text-muted)]">{f.documento ? "Mostrador" : "—"}</span>}
                    {f.documento && <span className="block font-mono text-[10px] text-[var(--sg-text-muted)]">{f.documento}</span>}
                  </td>
                  <td className="max-w-[180px] truncate px-3 py-1.5 text-[var(--sg-text-secondary)]" title={f.clienteNombre}>{f.clienteNombre || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-[var(--sg-text-secondary)]">{fechaCorta(f.fechaCompra)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-[var(--sg-text-secondary)]">{fechaCorta(f.fechaUso)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-[var(--sg-text-primary)]">{formatCurrency(f.precio)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!loading && <p className="text-[11px] text-[var(--sg-text-muted)]">{visibles.length} de {productos.length}</p>}

      {/* ─── Panel lateral: detalle, credenciales y PDF ───────────────── */}
      {seleccion && (() => {
        const pd = seleccion;
        const cred = credData[pd.id];
        const isCredVisible = credVisible[pd.id] ?? false;
        const isCredLoading = credLoading[pd.id] ?? false;
        const isPdfLoading = pdfLoading[pd.id] ?? false;
        const isDeleteLoading = pdfDeleteLoading[pd.id] ?? false;
        const hasPdf = Boolean(pd.documentoPdfUrl);
        const normalizedRol = userRol.normalize("NFC").trim().toLowerCase();
        const isAdmin = normalizedRol === "admin" || normalizedRol === "administrador";
        const campos = camposDeCredenciales(pd.tipoProducto);
        const dato = (label: string, valor: ReactNode) => (
          <div className="flex justify-between gap-3 py-1 text-xs">
            <span className="text-[var(--sg-text-muted)]">{label}</span>
            <span className="text-right text-[var(--sg-text-primary)]">{valor}</span>
          </div>
        );
        return (
          <div className="fixed inset-0 z-40 flex justify-end bg-black/50 animate-[sg-velo_160ms_ease-out]" onClick={() => setSeleccionId(null)}>
            <aside className="h-full w-full max-w-md overflow-y-auto border-l border-[var(--sg-border)] bg-[var(--sg-card)] p-4 shadow-2xl animate-[sg-panel_220ms_ease-out]" onClick={(e) => e.stopPropagation()}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-[var(--sg-text-muted)]">{pd.sku}</p>
                  <h2 className="text-sm font-bold text-[var(--sg-text-primary)]">{pd.softwareProducto}</h2>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${estadoBadge(pd.estado)}`}>{pd.estado}</span>
                    {pd.tipoProducto && <span className="inline-flex rounded-full border border-[var(--sg-border)] px-2 py-0.5 text-[10px] text-[var(--sg-text-muted)]">{pd.tipoProducto}</span>}
                  </div>
                </div>
                <button type="button" onClick={() => setSeleccionId(null)} className="text-[var(--sg-text-muted)] transition hover:text-[var(--sg-text-primary)]" aria-label="Cerrar"><CloseIcon /></button>
              </div>

              {/* Credenciales: ocultas hasta pedirlas */}
              <div className="mb-3 rounded-[var(--sg-radius-md)] border border-[var(--sg-border)] bg-[var(--sg-panel)] p-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--sg-text-muted)]">Credenciales</span>
                  <button type="button" onClick={() => void handleVerCredenciales(pd.id)} disabled={isCredLoading} className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--sg-lime)] hover:brightness-110 disabled:opacity-50">
                    {isCredLoading ? "…" : isCredVisible ? <><EyeOffIcon /> Ocultar</> : <><EyeIcon /> Mostrar</>}
                  </button>
                </div>
                {campos.clave && <FilaSecreta label="Clave" valor={isCredVisible ? cred?.claveActivacion ?? null : null} oculto={!isCredVisible} pista={pd.claveTruncada} />}
                {campos.usuario && <FilaSecreta label="Usuario" valor={pd.usuarioCorreo} oculto={false} />}
                {campos.usuario && <FilaSecreta label="Contraseña" valor={isCredVisible ? cred?.contraseña ?? null : null} oculto={!isCredVisible} />}
                {credError[pd.id] && <p className="mt-1 text-xs text-[var(--sg-danger)]">{credError[pd.id]}</p>}
              </div>

              {/* Punto 5B-2: gestión (Staff y Administradores) */}
              {puedeGestionar && (
                <GestionLicencia producto={pd} onListo={async () => { setCredData((m) => { const n = { ...m }; delete n[pd.id]; return n; }); setCredVisible((m) => ({ ...m, [pd.id]: false })); await fetchProductos(); }} />
              )}

              {/* PDF */}
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                {!hasPdf ? (
                  <button type="button" onClick={() => void handlePdfAction(pd.id, "POST", pd.softwareProducto)} disabled={isPdfLoading} className="h-7 rounded-full border border-[var(--sg-lime)]/50 px-3 text-xs font-semibold text-[var(--sg-lime)] transition hover:bg-[var(--sg-lime-soft)] disabled:opacity-50">
                    {isPdfLoading ? "Generando…" : "Generar PDF"}
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={() => void handlePdfAction(pd.id, "GET", pd.softwareProducto)} disabled={isPdfLoading || isDeleteLoading} className="h-7 rounded-full border border-[var(--sg-lime)]/50 bg-[var(--sg-lime-soft)] px-3 text-xs font-semibold text-[var(--sg-lime)] transition hover:brightness-110 disabled:opacity-50">
                      {isPdfLoading ? "…" : "Descargar PDF"}
                    </button>
                    {isAdmin && (
                      <button type="button" onClick={() => setPdfDeleteConfirmId(pdfDeleteConfirmId === pd.id ? null : pd.id)} disabled={isPdfLoading || isDeleteLoading} className="h-7 rounded-full border border-[var(--sg-danger)]/40 px-3 text-xs font-semibold text-[var(--sg-danger)] transition hover:bg-[var(--sg-danger-soft)] disabled:opacity-50">
                        Eliminar PDF
                      </button>
                    )}
                  </>
                )}
                {pd.fechaUltimoPdf && <span className="text-[11px] text-[var(--sg-text-muted)]">{fechaCorta(pd.fechaUltimoPdf)}{pd.documentoGeneradoPor ? ` · ${pd.documentoGeneradoPor}` : ""}</span>}
              </div>
              {pdfDeleteConfirmId === pd.id && (
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[var(--sg-radius-sm)] border border-[var(--sg-danger)]/30 bg-[var(--sg-danger-soft)] px-3 py-2 text-xs text-[var(--sg-text-secondary)] animate-[sg-entrada_180ms_ease-out]">
                  <span>¿Eliminar el PDF? Se puede volver a generar.</span>
                  <button type="button" onClick={() => void handleDeletePdf(pd.id)} disabled={isDeleteLoading} className="rounded-full border border-[var(--sg-danger)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--sg-danger)] hover:bg-[var(--sg-danger)] hover:text-white disabled:opacity-60">{isDeleteLoading ? "…" : "Eliminar"}</button>
                  <button type="button" onClick={() => setPdfDeleteConfirmId(null)} className="text-[11px] text-[var(--sg-text-muted)]">Cancelar</button>
                </div>
              )}
              {pdfError[pd.id] && <p className="mb-3 text-xs text-[var(--sg-danger)]">{pdfError[pd.id]}</p>}

              {/* Detalle */}
              <div className="divide-y divide-[var(--sg-divider)]">
                {dato("Orden", pd.ordenReparacionId ? <Link href={`/tecnicos/ordenes/${encodeURIComponent(pd.ordenReparacionId)}`} className="font-semibold text-[var(--sg-lime)] hover:underline">{pd.ordenCodigo || "Ver orden"}</Link> : "—")}
                {dato("Cliente", pd.clienteNombre || "—")}
                {dato("Documento", pd.documentoVenta || "—")}
                {dato("Vendido por", pd.usadoVendidoPor || "—")}
                {dato("Proveedor", pd.proveedor || "—")}
                {dato("Costo · precio", `${formatCurrency(pd.costoProveedor)} · ${formatCurrency(pd.precioVenta)}`)}
                {dato("Compra · uso", `${fechaCorta(pd.fechaCompra)} · ${fechaCorta(pd.fechaUsoVenta)}`)}
                {dato("Duración", pd.duracion === "Perpetua" ? "Perpetua" : pd.duracion ? `${pd.duracion}${pd.expira ? ` · vence ${fechaCorta(pd.expira)}` : ""}` : "—")}
                {pd.portalActivacionCatalogo && dato("Portal", <a href={pd.portalActivacionCatalogo} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[var(--sg-lime)] hover:underline"><ExternalLinkIcon />{pd.portalActivacionCatalogo.replace(/^https?:\/\//i, "").slice(0, 32)}</a>)}
              </div>
              {pd.observacionesInternas && <p className="mt-3 whitespace-pre-wrap text-[11px] leading-snug text-[var(--sg-text-muted)]">{pd.observacionesInternas}</p>}
            </aside>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Inline icons ─────────────────────────────────────────────────────────

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M3 3l18 18" />
      <path d="M10.73 10.73a2 2 0 0 0 2.54 2.54" />
      <path d="M6.4 6.4A10.17 10.17 0 0 0 1 12s4 7 11 7a10.17 10.17 0 0 0 5.6-1.68" />
      <path d="M18.7 13.7A10.17 10.17 0 0 0 23 12s-4-7-11-7a10.17 10.17 0 0 0-1.7.15" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 shrink-0">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

/** Una credencial en el panel lateral: oculta (•••) hasta "Mostrar", con botón Copiar. */
function FilaSecreta({ label, valor, oculto, pista }: { label: string; valor: string | null; oculto: boolean; pista?: string | null }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    if (!valor) return;
    try { await navigator.clipboard.writeText(valor); setCopiado(true); setTimeout(() => setCopiado(false), 1200); } catch { /* sin permiso */ }
  };
  return (
    <div className="flex items-center gap-2 py-0.5 text-xs">
      <span className="w-20 shrink-0 text-[var(--sg-text-muted)]">{label}</span>
      <span className="min-w-0 flex-1 break-all font-mono text-[var(--sg-text-primary)]">
        {oculto ? (pista ? <span className="text-[var(--sg-text-secondary)]">{pista}</span> : "••••••••") : valor || <span className="text-[var(--sg-text-muted)]">—</span>}
      </span>
      {!oculto && valor && (
        <button type="button" onClick={() => void copiar()} className={`shrink-0 text-[11px] font-semibold transition ${copiado ? "text-[var(--sg-success)]" : "text-[var(--sg-lime)] hover:brightness-110"}`}>
          {copiado ? "Copiado ✓" : "Copiar"}
        </button>
      )}
    </div>
  );
}
