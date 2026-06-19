"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "@/components/tecnicos/layout/TecnicosTheme.module.css";

// ─── Types ─────────────────────────────────────────────────────────────────

type ProductoDigital = {
  id: string;
  softwareProducto: string;
  tipo: string | null;
  estado: string;
  proveedor: string | null;
  costoProveedor: number | null;
  precioVenta: number | null;
  claveTruncada: string | null;
  usuarioCorreo: string | null;
  duracion: string | null;
  fechaCompra: string | null;
  fechaUsoVenta: string | null;
  ordenReparacionId: string | null;
  clienteId: string | null;
  tipoUso: string | null;
  usadoVendidoPor: string | null;
  observacionesInternas: string | null;
};

type Credenciales = {
  claveActivacion: string | null;
  usuarioCorreo: string | null;
  contraseña: string | null;
};

type NuevoProductoForm = {
  softwareProducto: string;
  tipo: string;
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
  softwareProducto: "",
  tipo: "",
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

  // Credenciales reveal
  const [credVisible, setCredVisible] = useState<Record<string, boolean>>({});
  const [credData, setCredData] = useState<Record<string, Credenciales>>({});
  const [credLoading, setCredLoading] = useState<Record<string, boolean>>({});
  const [credError, setCredError] = useState<Record<string, string | null>>({});

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

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

  const handleCreate = async () => {
    if (createSaving) return;
    if (!form.softwareProducto.trim()) {
      setCreateError("El campo Software / Producto es obligatorio.");
      return;
    }
    setCreateSaving(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/tecnicos/productos-digitales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          softwareProducto: form.softwareProducto,
          tipo: form.tipo || null,
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
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--sg-text-muted)]">
                      {pd.tipo && <span>{pd.tipo}</span>}
                      {pd.duracion && <span>{pd.duracion}</span>}
                      {pd.proveedor && <span>Prov: {pd.proveedor}</span>}
                      {pd.claveTruncada && (
                        <span className="font-mono text-[var(--sg-text-secondary)]">{pd.claveTruncada}</span>
                      )}
                    </div>
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
              {/* Software / Producto */}
              <div>
                <label className={labelClass}>Software / Producto *</label>
                <input
                  type="text"
                  value={form.softwareProducto}
                  onChange={(e) => setForm((f) => ({ ...f, softwareProducto: e.target.value }))}
                  placeholder="Ej: Microsoft Office 2024, Adobe Premiere..."
                  className={inputClass}
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Tipo */}
                <div>
                  <label className={labelClass}>Tipo</label>
                  <input
                    type="text"
                    value={form.tipo}
                    onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}
                    placeholder="Licencia, Cuenta, Código..."
                    className={inputClass}
                  />
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
                  <input
                    type="text"
                    value={form.duracion}
                    onChange={(e) => setForm((f) => ({ ...f, duracion: e.target.value }))}
                    placeholder="1 año, Perpetua..."
                    className={inputClass}
                  />
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

              {/* ─── Credenciales (sensibles) ─────────── */}
              <div className="space-y-2 rounded-lg border border-[var(--sg-border)] bg-[var(--sg-panel)] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--sg-text-muted)]">
                  Credenciales
                </p>
                {/* Clave de activación */}
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
                {/* Usuario / Correo */}
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
                {/* Contraseña */}
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
