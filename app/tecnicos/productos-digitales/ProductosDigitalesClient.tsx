"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import styles from "@/components/tecnicos/layout/TecnicosTheme.module.css";
import {
  camposDeCredenciales, contarPorEstado, filtrarFilas, ordenarFilas,
  type ColumnaOrden, type FilaDigital,
} from "@/lib/productos-digitales/reglas";

// Pantalla rediseñada en el punto 5A (7-nov-2026): tabla compacta con SKU,
// orden y cliente visibles, filtros con conteo, orden por columna (lo más
// reciente primero) y un panel lateral con el detalle, las credenciales
// (ocultas) y el PDF. Las credenciales nunca usan campos de contraseña del
// navegador: el gestor de contraseñas los autocompletaba ("Elfina.8990").

// ─── Types ─────────────────────────────────────────────────────────────────

type ProductoDigital = {
  id: string;
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

type CatalogoItem = {
  id: string;
  productoBase: string;
  marca: string | null;
  tipo: string | null;
  precioVentaCatalogo: number | null;
};

type ProveedorSoftware = {
  id: string;
  nombre: string;
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


const parseNum = (v: string): number | null => {
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
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

  // Precio hint
  const [precioDesdeCatalogo, setPrecioDesdeCatalogo] = useState(false);

  // Proveedor selector state
  const [proveedores, setProveedores] = useState<ProveedorSoftware[]>([]);
  const [proveedoresLoading, setProveedoresLoading] = useState(false);
  const [proveedoresError, setProveedoresError] = useState<string | null>(null);
  const [proveedorSearch, setProveedorSearch] = useState("");
  const [showProveedorDropdown, setShowProveedorDropdown] = useState(false);

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

    void (async () => {
      setProveedoresLoading(true);
      setProveedoresError(null);
      try {
        const res = await fetch("/api/tecnicos/productos-digitales/proveedores-software");
        const json = await res.json();
        if (json.success) setProveedores(json.data ?? []);
        else setProveedoresError(json.error ?? "Error al cargar proveedores");
      } catch {
        setProveedoresError("No se pudieron cargar los proveedores de software");
      } finally {
        setProveedoresLoading(false);
      }
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
      precioVenta: item.precioVentaCatalogo !== null ? String(item.precioVentaCatalogo) : "",
    }));
    setPrecioDesdeCatalogo(item.precioVentaCatalogo !== null);
    setCatalogoSearch(item.productoBase);
    setShowCatalogoDropdown(false);
  };

  const fetchProductos = async () => {
    setLoading(true);
    setError(null);
    try {
      // Se traen todas (son pocas): filtros, búsqueda y orden se hacen aquí, al instante.
      const res = await fetch(`/api/tecnicos/productos-digitales`, { cache: "no-store" });
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
      setPrecioDesdeCatalogo(false);
      setProveedorSearch("");
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
        <h1 className="text-lg font-bold text-[var(--sg-text-primary)]">Productos Digitales</h1>
        <button
          type="button"
          onClick={() => { setForm(EMPTY_FORM); setCreateError(null); setShowClave(false); setShowContraseña(false); setPrecioDesdeCatalogo(false); setProveedorSearch(""); setShowCreateModal(true); }}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--sg-lime)] bg-[var(--sg-lime)] px-4 py-1.5 text-sm font-semibold text-[#10110E] transition hover:brightness-105"
        >
          <span aria-hidden>+</span> Nuevo producto
        </button>
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

      {/* ─── Create modal ───────────────────────────────────────────────── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 backdrop-blur-sm px-4 py-8">
          <div className="w-full max-w-lg rounded-[1rem] border border-[var(--sg-border)] bg-[var(--sg-card)] p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold text-[var(--sg-text-primary)]">Nuevo producto digital</h2>
              <button
                type="button"
                onClick={() => { setShowCreateModal(false); setPrecioDesdeCatalogo(false); setProveedorSearch(""); }}
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
                      onClick={() => { setForm((f) => ({ ...f, catalogoId: "", catalogoNombre: "", catalogoTipo: "", precioVenta: "" })); setCatalogoSearch(""); setPrecioDesdeCatalogo(false); }}
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

              {/* Proveedor */}
              <div>
                <label className={labelClass}>Proveedor</label>
                {proveedoresError ? (
                  <p className="rounded-lg border border-[var(--sg-warning)]/40 bg-[var(--sg-warning-soft)] px-3 py-2 text-xs text-[var(--sg-warning)]">
                    {proveedoresError}
                  </p>
                ) : proveedoresLoading ? (
                  <div className="flex h-9 items-center gap-2 rounded-lg border border-[var(--sg-border)] bg-[var(--sg-panel)] px-3">
                    <span className="h-3 w-3 animate-spin rounded-full border border-[var(--sg-lime)] border-t-transparent" />
                    <span className="text-xs text-[var(--sg-text-muted)]">Cargando proveedores...</span>
                  </div>
                ) : (
                  <div className="relative">
                    {form.proveedor ? (
                      <div className="flex items-center gap-2 rounded-lg border border-[var(--sg-lime)]/50 bg-[var(--sg-lime)]/5 px-3 py-2">
                        <span className="flex-1 text-sm text-[var(--sg-text-primary)]">{form.proveedor}</span>
                        <button
                          type="button"
                          onClick={() => { setForm((f) => ({ ...f, proveedor: "" })); setProveedorSearch(""); }}
                          className="shrink-0 text-[var(--sg-text-muted)] transition hover:text-[var(--sg-danger)]"
                          aria-label="Quitar proveedor"
                        >
                          <CloseIcon />
                        </button>
                      </div>
                    ) : (
                      <>
                        <input
                          type="text"
                          value={proveedorSearch}
                          onChange={(e) => { setProveedorSearch(e.target.value); setShowProveedorDropdown(true); }}
                          onFocus={() => setShowProveedorDropdown(true)}
                          placeholder={proveedores.length === 0 ? "No hay proveedores de software registrados" : "Buscar proveedor..."}
                          disabled={proveedores.length === 0}
                          className={inputClass}
                        />
                        {showProveedorDropdown && proveedores.length > 0 && (
                          <div className="absolute z-50 mt-1 w-full rounded-xl border border-[var(--sg-border)] bg-[var(--sg-card)] shadow-2xl">
                            {(() => {
                              const filtered = proveedores.filter((p) =>
                                p.nombre.toLowerCase().includes(proveedorSearch.toLowerCase())
                              );
                              return filtered.length === 0 ? (
                                <p className="px-4 py-3 text-xs text-[var(--sg-text-muted)]">
                                  {proveedorSearch.trim() ? "Sin resultados" : "No hay proveedores de software registrados."}
                                </p>
                              ) : (
                                <ul className="max-h-48 overflow-y-auto py-1">
                                  {filtered.map((p) => (
                                    <li key={p.id}>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setForm((f) => ({ ...f, proveedor: p.nombre }));
                                          setProveedorSearch("");
                                          setShowProveedorDropdown(false);
                                        }}
                                        className="w-full px-4 py-2.5 text-left text-sm text-[var(--sg-text-primary)] transition hover:bg-[var(--sg-panel)]"
                                      >
                                        {p.nombre}
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              );
                            })()}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
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
              </div>

              {/* Precio venta */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className={labelClass} style={{ margin: 0 }}>Precio venta</label>
                  {precioDesdeCatalogo && (
                    <span className="text-[10px] text-[var(--sg-lime)]">
                      ✦ Precio sugerido desde catálogo
                    </span>
                  )}
                </div>
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

                {!form.catalogoId ? (
                  <p className="text-xs text-[var(--sg-text-muted)]">Elige el producto del catálogo.</p>
                ) : (
                  <>
                    {camposDeCredenciales(form.catalogoTipo).clave && (
                      <div>
                        <label className={labelClass}>Clave de activación</label>
                        <CampoSecreto valor={form.claveActivacion} onChange={(v) => setForm((f) => ({ ...f, claveActivacion: v }))} visible={showClave} onAlternar={() => setShowClave((v) => !v)} placeholder="Clave, serial o código" className={inputClass} />
                      </div>
                    )}
                    {camposDeCredenciales(form.catalogoTipo).usuario && (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div>
                          <label className={labelClass}>Usuario / Correo</label>
                          <input
                            type="text"
                            name="sg-digital-usuario"
                            autoComplete="off"
                            data-lpignore="true"
                            data-1p-ignore="true"
                            data-form-type="other"
                            value={form.usuarioCorreo}
                            onChange={(e) => setForm((f) => ({ ...f, usuarioCorreo: e.target.value }))}
                            placeholder="usuario@ejemplo.com"
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Contraseña</label>
                          <CampoSecreto valor={form.contraseña} onChange={(v) => setForm((f) => ({ ...f, contraseña: v }))} visible={showContraseña} onAlternar={() => setShowContraseña((v) => !v)} placeholder="Contraseña de la cuenta" className={inputClass} />
                        </div>
                      </div>
                    )}
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
                  onClick={() => { setShowCreateModal(false); setPrecioDesdeCatalogo(false); setProveedorSearch(""); }}
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

/**
 * Campo para una clave o contraseña de un CLIENTE. No es <input type="password">:
 * el gestor de contraseñas del navegador lo autocompletaba con una contraseña
 * guardada del empleado (caso "Elfina.8990", punto 5A). Se oculta con CSS.
 */
function CampoSecreto({ valor, onChange, visible, onAlternar, placeholder, className }: {
  valor: string; onChange: (v: string) => void; visible: boolean; onAlternar: () => void; placeholder: string; className: string;
}) {
  return (
    <div className="relative">
      <input
        type="text"
        name="sg-digital-secreto"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-lpignore="true"
        data-1p-ignore="true"
        data-form-type="other"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${className} pr-9 font-mono`}
        style={visible ? undefined : ({ WebkitTextSecurity: "disc" } as CSSProperties)}
      />
      <button type="button" onClick={onAlternar} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--sg-text-muted)] transition hover:text-[var(--sg-lime)]" aria-label={visible ? "Ocultar" : "Mostrar"}>
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
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
