"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "@/components/tecnicos/layout/TecnicosTheme.module.css";

// ─── Types ─────────────────────────────────────────────────────────────────

type ProductoDigital = {
  id: string;
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

type CatalogoItem = {
  id: string;
  productoBase: string;
  marca: string | null;
  tipo: string | null;
  precioVentaCatalogo: number | null;
};

type Credenciales = {
  claveActivacion: string | null;
  usuarioCorreo: string | null;
  contraseña: string | null;
};

type NuevoProductoForm = {
  catalogoId: string;
  catalogoNombre: string;
  catalogoTipo: string;
  estado: string;
  proveedor: string;
  costoProveedor: string;
  precioVenta: string;
  claveActivacion: string;
  usuarioCorreo: string;
  contraseña: string;
  duracion: string;
  fechaCompra: string;
  observacionesInternas: string;
};

const EMPTY_FORM: NuevoProductoForm = {
  catalogoId: "",
  catalogoNombre: "",
  catalogoTipo: "",
  estado: "Disponible",
  proveedor: "",
  costoProveedor: "",
  precioVenta: "",
  claveActivacion: "",
  usuarioCorreo: "",
  contraseña: "",
  duracion: "",
  fechaCompra: "",
  observacionesInternas: "",
};

const DURACIONES = ["Perpetua", "1 año", "2 años", "3 años", "3 meses", "6 meses", "9 meses"] as const;

const ESTADOS = ["Disponible", "Reservado", "Usado", "Anulado", "Vencido"] as const;
type EstadoPD = (typeof ESTADOS)[number];

const FILTER_TABS: { label: string; value: string }[] = [
  { label: "Todos", value: "" },
  { label: "Disponibles", value: "Disponible" },
  { label: "Reservados", value: "Reservado" },
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

const formatDate = (value: string | null | undefined) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("es-CO", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const parseNum = (v: string): number | null => {
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

// Campos de credenciales visibles según tipo del catálogo
const showClaveField = (tipo: string) =>
  !tipo || tipo === "Clave de activación" || tipo === "Otro";

const showUsuarioContraseñaFields = (tipo: string) =>
  !tipo || tipo === "Usuario/Contraseña" || tipo === "Suscripción" || tipo === "Otro";

// ─── Component ────────────────────────────────────────────────────────────

export function ProductosDigitalesClient() {
  const [productos, setProductos] = useState<ProductoDigital[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState<NuevoProductoForm>(EMPTY_FORM);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showContraseña, setShowContraseña] = useState(false);
  const [showClave, setShowClave] = useState(false);

  // Catálogo selector state
  const [catalogoSearch, setCatalogoSearch] = useState("");
  const [catalogoResults, setCatalogoResults] = useState<CatalogoItem[]>([]);
  const [catalogoSearchLoading, setCatalogoSearchLoading] = useState(false);
  const [showCatalogoDropdown, setShowCatalogoDropdown] = useState(false);
  const catalogoRef = useRef<HTMLDivElement | null>(null);

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

  // Buscar catálogo mientras el usuario escribe en el selector
  useEffect(() => {
    const t = setTimeout(async () => {
      const q = catalogoSearch.trim();
      if (!q && !showCatalogoDropdown) return;
      setCatalogoSearchLoading(true);
      try {
        const params = new URLSearchParams({ activo: "true" });
        if (q) params.set("q", q);
        const res = await fetch(`/api/tecnicos/catalogo-productos-digitales?${params.toString()}`);
        const json = await res.json();
        if (json.success) setCatalogoResults(json.data ?? []);
      } catch { /* ignore */ } finally {
        setCatalogoSearchLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogoSearch, showCatalogoDropdown]);

  const handleSelectCatalogo = (item: CatalogoItem) => {
    setForm((f) => ({
      ...f,
      catalogoId: item.id,
      catalogoNombre: item.productoBase,
      catalogoTipo: item.tipo ?? "",
      precioVenta: item.precioVentaCatalogo !== null ? String(item.precioVentaCatalogo) : f.precioVenta,
    }));
    setCatalogoSearch(item.productoBase);
    setShowCatalogoDropdown(false);
  };

  const fetchProductos = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (estadoFiltro) params.set("estado", estadoFiltro);
      if (debouncedSearch) params.set("q", debouncedSearch);
      const res = await fetch(`/api/tecnicos/productos-digitales?${params.toString()}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Error al cargar");
      setProductos(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar productos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchProductos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estadoFiltro, debouncedSearch]);

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

  const handleCreate = async () => {
    if (createSaving) return;
    if (!form.catalogoId) {
      setCreateError("Debes seleccionar un producto del catálogo.");
      return;
    }
    setCreateSaving(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/tecnicos/productos-digitales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          catalogoId: form.catalogoId,
          estado: form.estado || "Disponible",
          proveedor: form.proveedor || null,
          costoProveedor: parseNum(form.costoProveedor),
          precioVenta: parseNum(form.precioVenta),
          claveActivacion: form.claveActivacion || null,
          usuarioCorreo: form.usuarioCorreo || null,
          contraseña: form.contraseña || null,
          duracion: form.duracion || null,
          fechaCompra: form.fechaCompra || null,
          observacionesInternas: form.observacionesInternas || null,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Error al crear");
      setShowCreateModal(false);
      setForm(EMPTY_FORM);
      setCatalogoSearch("");
      setShowClave(false);
      setShowContraseña(false);
      await fetchProductos();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Error al crear");
    } finally {
      setCreateSaving(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border border-[var(--sg-border)] bg-[var(--sg-panel)] px-3 py-2 text-sm text-[var(--sg-text-primary)] placeholder:text-[var(--sg-text-muted)]/50 focus:border-[var(--sg-lime)]/70 focus:outline-none";
  const labelClass = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--sg-text-muted)]";

  return (
    <div className={`${styles.theme} w-full space-y-4`}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-[var(--sg-text-primary)]">Productos Digitales</h1>
          <p className="text-xs text-[var(--sg-text-muted)]">
            Licencias, claves y activos digitales del inventario
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setForm(EMPTY_FORM); setCreateError(null); setShowClave(false); setShowContraseña(false); setShowCreateModal(true); }}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--sg-lime)] bg-[var(--sg-lime)] px-4 py-1.5 text-sm font-semibold text-[#10110E] transition hover:brightness-105"
        >
          <span aria-hidden>+</span> Nuevo producto
        </button>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setEstadoFiltro(tab.value)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              estadoFiltro === tab.value
                ? "border-[var(--sg-lime)] bg-[var(--sg-lime-soft)] text-[var(--sg-lime)]"
                : "border-[var(--sg-border)] bg-[var(--sg-panel)] text-[var(--sg-text-secondary)] hover:border-[var(--sg-lime)]/40 hover:text-[var(--sg-text-primary)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--sg-text-muted)]"
        >
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por producto, tipo, proveedor, estado..."
          className="w-full rounded-xl border border-[var(--sg-border)] bg-[var(--sg-card)] py-2.5 pl-10 pr-4 text-sm text-[var(--sg-text-primary)] placeholder:text-[var(--sg-text-muted)]/60 focus:border-[var(--sg-lime)]/50 focus:outline-none"
        />
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--sg-lime)] border-t-transparent" />
        </div>
      ) : error ? (
        <p className="rounded-xl border border-[var(--sg-danger)]/40 bg-[var(--sg-danger-soft)] px-4 py-3 text-sm text-[var(--sg-danger)]">
          {error}
        </p>
      ) : productos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--sg-border)] bg-[var(--sg-card)] py-16 text-center">
          <p className="text-sm text-[var(--sg-text-secondary)]">
            {debouncedSearch || estadoFiltro
              ? "No hay productos que coincidan con el filtro."
              : "No hay productos digitales registrados."}
          </p>
          {!debouncedSearch && !estadoFiltro && (
            <button
              type="button"
              onClick={() => { setForm(EMPTY_FORM); setCreateError(null); setShowCreateModal(true); }}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--sg-lime)]/50 px-3 py-1 text-xs font-semibold text-[var(--sg-lime)] transition hover:bg-[var(--sg-lime-soft)]"
            >
              + Crear el primero
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] text-[var(--sg-text-muted)]">
            {productos.length} producto{productos.length !== 1 ? "s" : ""}
          </p>
          {productos.map((pd) => {
            const cred = credData[pd.id];
            const isCredVisible = credVisible[pd.id] ?? false;
            const isCredLoading = credLoading[pd.id] ?? false;
            const credErr = credError[pd.id];

            return (
              <div
                key={pd.id}
                className="rounded-xl border border-[var(--sg-border)] bg-[var(--sg-card)] px-4 py-4 shadow-[var(--sg-shadow-card)] transition hover:border-[var(--sg-border)]/80"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  {/* Left: info */}
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-bold text-[var(--sg-text-primary)]">{pd.softwareProducto}</p>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${estadoBadge(pd.estado)}`}>
                        {pd.estado}
                      </span>
                      {pd.marcaProducto && (
                        <span className="inline-flex items-center rounded-full border border-[var(--sg-border)] bg-[var(--sg-panel)] px-2 py-0.5 text-[10px] font-medium text-[var(--sg-text-muted)]">
                          {pd.marcaProducto}
                        </span>
                      )}
                      {pd.tipoProducto && (
                        <span className="inline-flex items-center rounded-full border border-[var(--sg-border)] bg-[var(--sg-panel)] px-2 py-0.5 text-[10px] font-medium text-[var(--sg-text-muted)]">
                          {pd.tipoProducto}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--sg-text-muted)]">
                      {pd.duracion && (
                        <span>
                          {pd.duracion === "Perpetua" ? "Licencia perpetua" : pd.duracion}
                        </span>
                      )}
                      {pd.duracion !== "Perpetua" && pd.expira && (
                        <span className="text-[var(--sg-warning)]">
                          Expira: {formatDate(pd.expira)}
                        </span>
                      )}
                      {pd.duracion === "Perpetua" && (
                        <span className="text-[var(--sg-success)]">No expira</span>
                      )}
                      {pd.proveedor && <span>Prov: {pd.proveedor}</span>}
                      {pd.claveTruncada && (
                        <span className="font-mono text-[var(--sg-text-secondary)]">{pd.claveTruncada}</span>
                      )}
                    </div>
                    {pd.portalActivacionCatalogo && (
                      <a
                        href={pd.portalActivacionCatalogo}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-[var(--sg-lime)] underline underline-offset-2 transition hover:brightness-110"
                      >
                        <ExternalLinkIcon />
                        {pd.portalActivacionCatalogo.replace(/^https?:\/\//i, "").slice(0, 50)}{pd.portalActivacionCatalogo.length > 57 ? "…" : ""}
                      </a>
                    )}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--sg-text-muted)]">
                      {pd.precioVenta !== null && (
                        <span>
                          Precio: <span className="font-semibold text-[var(--sg-lime)]">{formatCurrency(pd.precioVenta)}</span>
                        </span>
                      )}
                      {pd.costoProveedor !== null && (
                        <span>Costo: {formatCurrency(pd.costoProveedor)}</span>
                      )}
                      {pd.fechaCompra && <span>Compra: {formatDate(pd.fechaCompra)}</span>}
                      {pd.fechaUsoVenta && <span>Uso/Venta: {formatDate(pd.fechaUsoVenta)}</span>}
                    </div>
                    {pd.ordenReparacionId && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-[var(--sg-text-muted)]">Orden vinculada:</span>
                        <Link
                          href={`/tecnicos/ordenes/${encodeURIComponent(pd.ordenReparacionId)}`}
                          className="font-semibold text-[var(--sg-lime)] underline underline-offset-2 transition hover:brightness-110"
                        >
                          Ver orden
                        </Link>
                        {pd.usadoVendidoPor && (
                          <span className="text-[var(--sg-text-muted)]">por {pd.usadoVendidoPor}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right: actions */}
                  {/* PDF actions */}
                  {(() => {
                    const isPdfLoading = pdfLoading[pd.id] ?? false;
                    const isDeleteLoading = pdfDeleteLoading[pd.id] ?? false;
                    const hasPdf = Boolean(pd.documentoPdfUrl);
                    const isAdmin = userRol === "admin" || userRol === "administrador";
                    const isConfirmingDelete = pdfDeleteConfirmId === pd.id;
                    return (
                      <div className="flex shrink-0 items-center gap-1">
                        {!hasPdf ? (
                          <button
                            type="button"
                            onClick={() => void handlePdfAction(pd.id, "POST", pd.softwareProducto)}
                            disabled={isPdfLoading}
                            title="Generar PDF del producto"
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--sg-border)] bg-[var(--sg-panel)] px-2 text-[10px] font-semibold text-[var(--sg-text-muted)] transition hover:border-[var(--sg-lime)]/60 hover:text-[var(--sg-lime)] disabled:opacity-50"
                          >
                            {isPdfLoading ? (
                              <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                            ) : (
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                            )}
                            Generar PDF
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => void handlePdfAction(pd.id, "GET", pd.softwareProducto)}
                              disabled={isPdfLoading || isDeleteLoading}
                              title={`Descargar PDF${pd.fechaUltimoPdf ? ` (${formatDate(pd.fechaUltimoPdf)})` : ""}`}
                              className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--sg-lime)]/40 bg-[var(--sg-lime-soft)] px-2 text-[10px] font-semibold text-[var(--sg-lime)] transition hover:brightness-110 disabled:opacity-50"
                            >
                              {isPdfLoading ? (
                                <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                              ) : (
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                              )}
                              Descargar PDF
                            </button>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => setPdfDeleteConfirmId(isConfirmingDelete ? null : pd.id)}
                                disabled={isPdfLoading || isDeleteLoading}
                                title="Eliminar PDF generado"
                                className="inline-flex h-8 items-center gap-1 rounded-lg border border-[var(--sg-danger)]/40 bg-[var(--sg-danger-soft)] px-2 text-[10px] font-semibold text-[var(--sg-danger)] transition hover:brightness-110 disabled:opacity-50"
                              >
                                {isDeleteLoading ? (
                                  <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                                ) : (
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                                )}
                                Eliminar PDF
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={() => void handleVerCredenciales(pd.id)}
                    disabled={isCredLoading}
                    title={isCredVisible ? "Ocultar credenciales" : "Ver credenciales completas"}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--sg-border)] bg-[var(--sg-panel)] text-[var(--sg-text-muted)] transition hover:border-[var(--sg-lime)]/50 hover:text-[var(--sg-lime)] disabled:opacity-50"
                  >
                    {isCredLoading ? (
                      <span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                    ) : isCredVisible ? (
                      <EyeOffIcon />
                    ) : (
                      <EyeIcon />
                    )}
                  </button>
                </div>

                {/* Credentials panel */}
                {isCredVisible && cred && (
                  <div className="mt-3 space-y-1 rounded-lg border border-[var(--sg-lime)]/20 bg-[var(--sg-lime)]/5 px-3 py-2.5 text-xs">
                    {cred.claveActivacion && (
                      <div className="flex items-center gap-2">
                        <span className="w-24 shrink-0 text-[var(--sg-text-muted)]">Clave:</span>
                        <span className="break-all font-mono font-semibold text-[var(--sg-lime)]">{cred.claveActivacion}</span>
                      </div>
                    )}
                    {cred.usuarioCorreo && (
                      <div className="flex items-center gap-2">
                        <span className="w-24 shrink-0 text-[var(--sg-text-muted)]">Usuario:</span>
                        <span className="font-mono text-[var(--sg-text-primary)]">{cred.usuarioCorreo}</span>
                      </div>
                    )}
                    {cred.contraseña && (
                      <div className="flex items-center gap-2">
                        <span className="w-24 shrink-0 text-[var(--sg-text-muted)]">Contraseña:</span>
                        <span className="font-mono text-[var(--sg-text-primary)]">{cred.contraseña}</span>
                      </div>
                    )}
                    {!cred.claveActivacion && !cred.usuarioCorreo && !cred.contraseña && (
                      <p className="text-[var(--sg-text-muted)]">Sin credenciales registradas.</p>
                    )}
                  </div>
                )}
                {credErr && (
                  <p className="mt-1.5 text-xs text-[var(--sg-danger)]">{credErr}</p>
                )}
                {pdfError[pd.id] && (
                  <p className="mt-1.5 text-xs text-[var(--sg-danger)]">{pdfError[pd.id]}</p>
                )}
                {pd.fechaUltimoPdf && (
                  <p className="mt-1.5 text-xs text-[var(--sg-text-muted)]">
                    PDF generado: {formatDate(pd.fechaUltimoPdf)}{pd.documentoGeneradoPor ? ` por ${pd.documentoGeneradoPor}` : ""}
                  </p>
                )}
                {pdfDeleteConfirmId === pd.id && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--sg-danger)]/30 bg-[var(--sg-danger-soft)] px-3 py-2 text-[12px] text-[var(--sg-text-secondary)]">
                    <span>¿Seguro que deseas eliminar el PDF generado? Podrás generarlo nuevamente después.</span>
                    <button
                      type="button"
                      onClick={() => void handleDeletePdf(pd.id)}
                      disabled={pdfDeleteLoading[pd.id] ?? false}
                      className="rounded-full border border-[var(--sg-danger)] px-3 py-0.5 text-[11px] font-semibold text-[var(--sg-danger)] transition hover:bg-[var(--sg-danger)] hover:text-white disabled:opacity-60"
                    >
                      {pdfDeleteLoading[pd.id] ? "Eliminando..." : "Eliminar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPdfDeleteConfirmId(null)}
                      className="rounded-full border border-[var(--sg-border)] px-3 py-0.5 text-[11px] text-[var(--sg-text-muted)] transition hover:border-[var(--sg-text-muted)]"
                    >
                      Cancelar
                    </button>
                  </div>
                )}

                {/* Observaciones */}
                {pd.observacionesInternas && (
                  <p className="mt-2 text-xs text-[var(--sg-text-muted)]">
                    Obs: {pd.observacionesInternas}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Create modal ───────────────────────────────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 backdrop-blur-sm px-4 py-8">
          <div className="w-full max-w-lg rounded-[1rem] border border-[var(--sg-border)] bg-[var(--sg-card)] p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold text-[var(--sg-text-primary)]">Nuevo producto digital</h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-[var(--sg-text-muted)] transition hover:text-[var(--sg-text-primary)]"
                aria-label="Cerrar"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="space-y-3">
              {/* Catálogo selector */}
              <div ref={catalogoRef} className="relative">
                <label className={labelClass}>Producto del catálogo *</label>
                {form.catalogoId ? (
                  <div className="flex items-center gap-2 rounded-lg border border-[var(--sg-lime)]/50 bg-[var(--sg-lime)]/5 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--sg-text-primary)] truncate">{form.catalogoNombre}</p>
                      {form.catalogoTipo && <p className="text-[10px] text-[var(--sg-text-muted)]">{form.catalogoTipo}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => { setForm((f) => ({ ...f, catalogoId: "", catalogoNombre: "", catalogoTipo: "" })); setCatalogoSearch(""); }}
                      className="shrink-0 text-[var(--sg-text-muted)] transition hover:text-[var(--sg-danger)]"
                      aria-label="Cambiar producto"
                    >
                      <CloseIcon />
                    </button>
                  </div>
                ) : (
                  <div>
                    <input
                      type="text"
                      value={catalogoSearch}
                      onChange={(e) => { setCatalogoSearch(e.target.value); setShowCatalogoDropdown(true); }}
                      onFocus={() => setShowCatalogoDropdown(true)}
                      placeholder="Buscar en catálogo..."
                      className={inputClass}
                      autoFocus
                    />
                    {showCatalogoDropdown && (
                      <div className="absolute z-50 mt-1 w-full rounded-xl border border-[var(--sg-border)] bg-[var(--sg-card)] shadow-2xl">
                        {catalogoSearchLoading ? (
                          <div className="flex items-center justify-center py-4">
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--sg-lime)] border-t-transparent" />
                          </div>
                        ) : catalogoResults.length === 0 ? (
                          <p className="px-4 py-3 text-xs text-[var(--sg-text-muted)]">
                            {catalogoSearch.trim() ? "Sin resultados" : "Escribe para buscar"}
                          </p>
                        ) : (
                          <ul className="max-h-56 overflow-y-auto py-1">
                            {catalogoResults.map((item) => (
                              <li key={item.id}>
                                <button
                                  type="button"
                                  onClick={() => handleSelectCatalogo(item)}
                                  className="w-full px-4 py-2.5 text-left transition hover:bg-[var(--sg-panel)]"
                                >
                                  <p className="text-sm font-semibold text-[var(--sg-text-primary)]">{item.productoBase}</p>
                                  <p className="text-[10px] text-[var(--sg-text-muted)]">
                                    {[item.marca, item.tipo].filter(Boolean).join(" · ")}
                                    {item.precioVentaCatalogo !== null ? ` — $${item.precioVentaCatalogo}` : ""}
                                  </p>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Estado */}
              <div>
                <label className={labelClass}>Estado</label>
                <select
                  value={form.estado}
                  onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value }))}
                  className={inputClass}
                >
                  {ESTADOS.map((e) => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Proveedor */}
                <div>
                  <label className={labelClass}>Proveedor</label>
                  <input
                    type="text"
                    value={form.proveedor}
                    onChange={(e) => setForm((f) => ({ ...f, proveedor: e.target.value }))}
                    placeholder="Nombre del proveedor"
                    className={inputClass}
                  />
                </div>
                {/* Duración */}
                <div>
                  <label className={labelClass}>Duración</label>
                  <select
                    value={form.duracion}
                    onChange={(e) => setForm((f) => ({ ...f, duracion: e.target.value }))}
                    className={inputClass}
                  >
                    <option value="">Sin definir</option>
                    {DURACIONES.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Costo proveedor */}
                <div>
                  <label className={labelClass}>Costo proveedor</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.costoProveedor}
                    onChange={(e) => setForm((f) => ({ ...f, costoProveedor: e.target.value }))}
                    placeholder="0.00"
                    className={inputClass}
                  />
                </div>
                {/* Precio venta */}
                <div>
                  <label className={labelClass}>Precio venta</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.precioVenta}
                    onChange={(e) => setForm((f) => ({ ...f, precioVenta: e.target.value }))}
                    placeholder="0.00"
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>Fecha de compra</label>
                <input
                  type="date"
                  value={form.fechaCompra}
                  onChange={(e) => setForm((f) => ({ ...f, fechaCompra: e.target.value }))}
                  className={inputClass}
                />
              </div>

              {/* ─── Credenciales — condicionales por tipo del catálogo ─── */}
              <div className="space-y-2 rounded-lg border border-[var(--sg-border)] bg-[var(--sg-panel)] p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--sg-text-muted)]">
                    Credenciales
                  </p>
                  {form.catalogoTipo && (
                    <span className="text-[10px] text-[var(--sg-text-muted)]">
                      campos para: <strong className="text-[var(--sg-text-secondary)]">{form.catalogoTipo}</strong>
                    </span>
                  )}
                </div>

                {showClaveField(form.catalogoTipo) && (
                  <div>
                    <label className={labelClass}>Clave de activación</label>
                    <div className="relative">
                      <input
                        type={showClave ? "text" : "password"}
                        value={form.claveActivacion}
                        onChange={(e) => setForm((f) => ({ ...f, claveActivacion: e.target.value }))}
                        placeholder="Clave, serial o código"
                        className={`${inputClass} pr-9`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowClave((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--sg-text-muted)] transition hover:text-[var(--sg-lime)]"
                      >
                        {showClave ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>
                  </div>
                )}

                {showUsuarioContraseñaFields(form.catalogoTipo) && (
                  <>
                    <div>
                      <label className={labelClass}>Usuario / Correo</label>
                      <input
                        type="text"
                        value={form.usuarioCorreo}
                        onChange={(e) => setForm((f) => ({ ...f, usuarioCorreo: e.target.value }))}
                        placeholder="usuario@ejemplo.com"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Contraseña</label>
                      <div className="relative">
                        <input
                          type={showContraseña ? "text" : "password"}
                          value={form.contraseña}
                          onChange={(e) => setForm((f) => ({ ...f, contraseña: e.target.value }))}
                          placeholder="Contraseña de la cuenta"
                          className={`${inputClass} pr-9`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowContraseña((v) => !v)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--sg-text-muted)] transition hover:text-[var(--sg-lime)]"
                        >
                          {showContraseña ? <EyeOffIcon /> : <EyeIcon />}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Observaciones */}
              <div>
                <label className={labelClass}>Observaciones internas</label>
                <textarea
                  value={form.observacionesInternas}
                  onChange={(e) => setForm((f) => ({ ...f, observacionesInternas: e.target.value }))}
                  placeholder="Notas internas sobre este producto..."
                  rows={2}
                  className={`${inputClass} resize-none`}
                />
              </div>

              {createError && (
                <p className="rounded-lg border border-[var(--sg-danger)]/40 bg-[var(--sg-danger-soft)] px-3 py-2 text-xs text-[var(--sg-danger)]">
                  {createError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-full border border-[var(--sg-border)] px-4 py-1.5 text-xs font-semibold text-[var(--sg-text-secondary)] transition hover:border-[var(--sg-lime)]/50 hover:text-[var(--sg-lime)]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreate()}
                  disabled={createSaving}
                  className="rounded-full border border-[var(--sg-lime)] bg-[var(--sg-lime)] px-4 py-1.5 text-xs font-semibold text-[#10110E] transition hover:brightness-105 disabled:opacity-50"
                >
                  {createSaving ? "Guardando..." : "Crear producto"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
