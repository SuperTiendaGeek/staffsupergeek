"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "@/components/tecnicos/layout/TecnicosTheme.module.css";

// ─── Types ────────────────────────────────────────────────────────────────────

type CatalogoItem = {
  id: string;
  productoBase: string;
  marca: string | null;
  tipo: string | null;
  portalActivacion: string | null;
  instruccionesPdf: string | null;
  notasParaCliente: string | null;
  precioVentaCatalogo: number | null;
  colorPrincipal: string | null;
  activo: boolean;
  logoUrl: string | null;
};

type NuevoForm = {
  productoBase: string;
  marca: string;
  tipo: string;
  portalActivacion: string;
  instruccionesPdf: string;
  notasParaCliente: string;
  precioVentaCatalogo: string;
  colorPrincipal: string;
  activo: boolean;
};

const EMPTY_FORM: NuevoForm = {
  productoBase: "",
  marca: "",
  tipo: "",
  portalActivacion: "",
  instruccionesPdf: "",
  notasParaCliente: "",
  precioVentaCatalogo: "",
  colorPrincipal: "",
  activo: true,
};

const TIPOS = ["Clave de activación", "Usuario/Contraseña", "Suscripción", "Otro"] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number | null) =>
  n !== null
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n)
    : null;

const parseNum = (v: string): number | null => {
  const n = parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("") || "?";
}

function isSafeColor(c: string | null): boolean {
  if (!c) return false;
  return /^#[0-9A-Fa-f]{3,8}$/.test(c.trim()) ||
    /^(rgb|hsl)a?\(/.test(c.trim()) ||
    /^[a-zA-Z]+$/.test(c.trim());
}

// ─── Card logo area ───────────────────────────────────────────────────────────

function CardLogo({ item }: { item: CatalogoItem }) {
  const [imgErr, setImgErr] = useState(false);
  const showImg = Boolean(item.logoUrl) && !imgErr;
  const color = isSafeColor(item.colorPrincipal) ? item.colorPrincipal! : null;

  const placeholderStyle: React.CSSProperties = color
    ? { background: `linear-gradient(135deg, ${color}22 0%, ${color}66 100%)`, border: `1px solid ${color}44` }
    : { background: "linear-gradient(135deg, #D7FF4F0A 0%, #2A660033 100%)" };

  return (
    <div className="relative w-full overflow-hidden rounded-t-xl" style={{ paddingTop: "66%" }}>
      <div className="absolute inset-0 flex items-center justify-center" style={showImg ? {} : placeholderStyle}>
        {showImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.logoUrl!}
            alt={item.productoBase}
            onError={() => setImgErr(true)}
            className="absolute inset-0 h-full w-full object-contain p-4"
          />
        ) : (
          <span
            className="text-3xl font-black select-none"
            style={{ color: color ?? "#D7FF4F", opacity: 0.8 }}
          >
            {initials(item.productoBase)}
          </span>
        )}
      </div>
      {/* Activo indicator */}
      <div className={`absolute right-2 top-2 h-2 w-2 rounded-full ring-2 ring-[var(--sg-card)] ${item.activo ? "bg-[var(--sg-lime)]" : "bg-[var(--sg-border)]"}`} />
    </div>
  );
}

// ─── Detail modal ─────────────────────────────────────────────────────────────

function DetailModal({ item, onClose }: { item: CatalogoItem; onClose: () => void }) {
  const [imgErr, setImgErr] = useState(false);
  const showImg = Boolean(item.logoUrl) && !imgErr;
  const color = isSafeColor(item.colorPrincipal) ? item.colorPrincipal! : null;
  const price = fmt(item.precioVentaCatalogo);

  const placeholderStyle: React.CSSProperties = color
    ? { background: `linear-gradient(135deg, ${color}22 0%, ${color}55 100%)` }
    : { background: "linear-gradient(135deg, #D7FF4F08 0%, #2A660022 100%)" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm px-4 py-8 overflow-y-auto">
      <div className="w-full max-w-md rounded-[1rem] border border-[var(--sg-border)] bg-[var(--sg-card)] shadow-2xl overflow-hidden">
        {/* Logo header */}
        <div className="relative flex h-40 items-center justify-center" style={showImg ? {} : placeholderStyle}>
          {showImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.logoUrl!}
              alt={item.productoBase}
              onError={() => setImgErr(true)}
              className="h-full w-full object-contain p-6"
            />
          ) : (
            <span
              className="text-5xl font-black select-none"
              style={{ color: color ?? "#D7FF4F", opacity: 0.7 }}
            >
              {initials(item.productoBase)}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-[var(--sg-border)] bg-[var(--sg-card)] text-[var(--sg-text-muted)] transition hover:text-[var(--sg-text-primary)]"
            aria-label="Cerrar"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Name + status */}
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-base font-bold leading-snug text-[var(--sg-text-primary)]">
              {item.productoBase}
            </h2>
            <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.activo ? "bg-[var(--sg-lime-soft)] text-[var(--sg-lime)]" : "bg-[var(--sg-card-elevated)] text-[var(--sg-text-muted)]"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${item.activo ? "bg-[var(--sg-lime)]" : "bg-[var(--sg-text-muted)]"}`} />
              {item.activo ? "Activo" : "Inactivo"}
            </span>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-1.5">
            {item.tipo && (
              <span className="inline-flex items-center rounded-full border border-[var(--sg-lime)]/30 bg-[var(--sg-lime)]/8 px-2.5 py-0.5 text-[10px] font-semibold text-[var(--sg-lime)]">
                {item.tipo}
              </span>
            )}
            {item.marca && (
              <span className="inline-flex items-center rounded-full border border-[var(--sg-border)] bg-[var(--sg-panel)] px-2.5 py-0.5 text-[10px] font-medium text-[var(--sg-text-secondary)]">
                {item.marca}
              </span>
            )}
          </div>

          {/* Price */}
          {price && (
            <div className="rounded-lg border border-[var(--sg-lime)]/20 bg-[var(--sg-lime)]/5 px-4 py-3 text-center">
              <p className="text-[10px] uppercase tracking-wider text-[var(--sg-text-muted)]">Precio venta</p>
              <p className="mt-0.5 text-2xl font-black text-[var(--sg-lime)]">{price}</p>
            </div>
          )}

          {/* Portal */}
          {item.portalActivacion && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--sg-text-muted)]">Portal de activación</p>
              <a
                href={item.portalActivacion}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[var(--sg-lime)] underline underline-offset-2 hover:brightness-110 break-all"
              >
                {item.portalActivacion}
              </a>
            </div>
          )}

          {/* Instructions */}
          {item.instruccionesPdf && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--sg-text-muted)]">Instrucciones PDF</p>
              <p className="whitespace-pre-wrap text-xs text-[var(--sg-text-secondary)] leading-relaxed">
                {item.instruccionesPdf}
              </p>
            </div>
          )}

          {/* Notes */}
          {item.notasParaCliente && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--sg-text-muted)]">Notas para el cliente</p>
              <p className="whitespace-pre-wrap text-xs text-[var(--sg-text-secondary)] leading-relaxed">
                {item.notasParaCliente}
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            className="mt-1 w-full rounded-full border border-[var(--sg-border)] py-2 text-sm font-semibold text-[var(--sg-text-secondary)] transition hover:border-[var(--sg-lime)]/50 hover:text-[var(--sg-lime)]"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Create modal ─────────────────────────────────────────────────────────────

function LogoUploadZone({
  preview,
  uploading,
  uploadError,
  onFile,
  onRemove,
}: {
  preview: string | null;
  uploading: boolean;
  uploadError: string | null;
  onFile: (file: File) => void;
  onRemove: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  if (preview) {
    return (
      <div className="relative flex items-center gap-3 rounded-lg border border-[var(--sg-border)] bg-[var(--sg-panel)] p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview} alt="Logo" className="h-14 w-14 shrink-0 rounded-lg object-contain" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-[var(--sg-lime)]">
            {uploading ? "Subiendo imagen..." : "Logo listo"}
          </p>
          {uploading && (
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[var(--sg-border)]">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-[var(--sg-lime)]" />
            </div>
          )}
          {uploadError && (
            <p className="mt-0.5 text-[10px] text-[var(--sg-danger)]">{uploadError}</p>
          )}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--sg-border)] text-[var(--sg-text-muted)] transition hover:border-[var(--sg-danger)]/60 hover:text-[var(--sg-danger)]"
          aria-label="Quitar logo"
        >
          <CloseIcon />
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDragEnter={e => { e.preventDefault(); setDragging(true); }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition ${
          dragging
            ? "border-[var(--sg-lime)] bg-[var(--sg-lime)]/5"
            : "border-[var(--sg-border)] bg-[var(--sg-panel)] hover:border-[var(--sg-lime)]/50"
        }`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-8 w-8 text-[var(--sg-text-muted)]">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
        </svg>
        <span className="text-xs text-[var(--sg-text-secondary)]">
          <span className="font-semibold text-[var(--sg-lime)]">Haz clic</span> o arrastra una imagen aquí
        </span>
        <span className="text-[10px] text-[var(--sg-text-muted)]">JPG, PNG, WebP, SVG · máx. 5 MB</span>
      </button>
      {uploadError && (
        <p className="mt-1 text-[10px] text-[var(--sg-danger)]">{uploadError}</p>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
        className="sr-only"
        onChange={e => handleFiles(e.target.files)}
      />
    </div>
  );
}

function CreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (item: CatalogoItem) => void;
}) {
  const [form, setForm] = useState<NuevoForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Logo upload state
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoUploadedUrl, setLogoUploadedUrl] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);

  const inputClass =
    "w-full rounded-lg border border-[var(--sg-border)] bg-[var(--sg-panel)] px-3 py-2 text-sm text-[var(--sg-text-primary)] placeholder:text-[var(--sg-text-muted)]/50 focus:border-[var(--sg-lime)]/70 focus:outline-none";
  const labelClass =
    "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--sg-text-muted)]";

  const handleLogoFile = async (file: File) => {
    setLogoUploadError(null);
    setLogoUploadedUrl(null);
    const objectUrl = URL.createObjectURL(file);
    setLogoPreview(objectUrl);
    setLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/tecnicos/catalogo-productos-digitales/upload-logo", {
        method: "POST",
        body: fd,
      });
      const json = await res.json() as { success: boolean; url?: string; error?: string };
      if (!json.success || !json.url) throw new Error(json.error ?? "Error al subir imagen");
      setLogoUploadedUrl(json.url);
    } catch (err) {
      setLogoUploadError(err instanceof Error ? err.message : "Error al subir imagen");
      setLogoUploadedUrl(null);
    } finally {
      setLogoUploading(false);
    }
  };

  const handleLogoRemove = () => {
    setLogoPreview(null);
    setLogoUploadedUrl(null);
    setLogoUploadError(null);
    setLogoUploading(false);
  };

  const handleSubmit = async () => {
    if (saving) return;
    if (!form.productoBase.trim()) {
      setError("El nombre del producto es requerido.");
      return;
    }
    if (logoUploading) {
      setError("Espera a que termine de subir el logo.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/tecnicos/catalogo-productos-digitales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productoBase:        form.productoBase,
          marca:               form.marca || null,
          tipo:                form.tipo || null,
          portalActivacion:    form.portalActivacion || null,
          instruccionesPdf:    form.instruccionesPdf || null,
          notasParaCliente:    form.notasParaCliente || null,
          precioVentaCatalogo: parseNum(form.precioVentaCatalogo),
          colorPrincipal:      form.colorPrincipal || null,
          activo:              form.activo,
          logoUrl:             logoUploadedUrl,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Error al crear");
      onCreated(json.data as CatalogoItem);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear producto");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 backdrop-blur-sm px-4 py-8">
      <div className="w-full max-w-lg rounded-[1rem] border border-[var(--sg-border)] bg-[var(--sg-card)] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-[var(--sg-text-primary)]">Nuevo producto en catálogo</h2>
          <button type="button" onClick={onClose} className="text-[var(--sg-text-muted)] hover:text-[var(--sg-text-primary)]">
            <CloseIcon />
          </button>
        </div>

        <div className="space-y-3">
          {/* Producto Base */}
          <div>
            <label className={labelClass}>Nombre del producto *</label>
            <input
              type="text"
              value={form.productoBase}
              onChange={e => setForm(f => ({ ...f, productoBase: e.target.value }))}
              placeholder="Ej: Microsoft Office 2021"
              className={inputClass}
              autoFocus
            />
          </div>

          {/* Marca + Tipo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Marca</label>
              <input
                type="text"
                value={form.marca}
                onChange={e => setForm(f => ({ ...f, marca: e.target.value }))}
                placeholder="Ej: Microsoft"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Tipo</label>
              <select
                value={form.tipo}
                onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
                className={inputClass}
              >
                <option value="">Sin definir</option>
                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Precio + Color */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Precio venta catálogo</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.precioVentaCatalogo}
                onChange={e => setForm(f => ({ ...f, precioVentaCatalogo: e.target.value }))}
                placeholder="0.00"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Color principal</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.colorPrincipal}
                  onChange={e => setForm(f => ({ ...f, colorPrincipal: e.target.value }))}
                  placeholder="#3B82F6"
                  className={`${inputClass} flex-1 min-w-0`}
                />
                {isSafeColor(form.colorPrincipal) && (
                  <div
                    className="h-9 w-9 shrink-0 rounded-lg border border-[var(--sg-border)]"
                    style={{ background: form.colorPrincipal }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Portal */}
          <div>
            <label className={labelClass}>Portal de activación</label>
            <input
              type="url"
              value={form.portalActivacion}
              onChange={e => setForm(f => ({ ...f, portalActivacion: e.target.value }))}
              placeholder="https://..."
              className={inputClass}
            />
          </div>

          {/* Logo */}
          <div>
            <label className={labelClass}>Logo</label>
            <LogoUploadZone
              preview={logoPreview}
              uploading={logoUploading}
              uploadError={logoUploadError}
              onFile={file => void handleLogoFile(file)}
              onRemove={handleLogoRemove}
            />
          </div>

          {/* Instructions */}
          <div>
            <label className={labelClass}>Instrucciones PDF</label>
            <textarea
              value={form.instruccionesPdf}
              onChange={e => setForm(f => ({ ...f, instruccionesPdf: e.target.value }))}
              placeholder="Instrucciones paso a paso para el PDF..."
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* Notes */}
          <div>
            <label className={labelClass}>Notas para el cliente</label>
            <textarea
              value={form.notasParaCliente}
              onChange={e => setForm(f => ({ ...f, notasParaCliente: e.target.value }))}
              placeholder="Notas visibles para el cliente..."
              rows={2}
              className={`${inputClass} resize-none`}
            />
          </div>

          {/* Activo */}
          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              checked={form.activo}
              onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))}
              className="h-4 w-4 rounded border-[var(--sg-border)] accent-[var(--sg-lime)]"
            />
            <span className="text-sm text-[var(--sg-text-secondary)]">Producto activo</span>
          </label>

          {error && (
            <p className="rounded-lg border border-[var(--sg-danger)]/40 bg-[var(--sg-danger-soft)] px-3 py-2 text-xs text-[var(--sg-danger)]">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[var(--sg-border)] px-4 py-1.5 text-xs font-semibold text-[var(--sg-text-secondary)] transition hover:border-[var(--sg-lime)]/50 hover:text-[var(--sg-lime)]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={saving || logoUploading}
              className="rounded-full border border-[var(--sg-lime)] bg-[var(--sg-lime)] px-4 py-1.5 text-xs font-semibold text-[#10110E] transition hover:brightness-105 disabled:opacity-50"
            >
              {saving ? "Creando..." : "Crear producto"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CatalogoDigitalClient() {
  const [items, setItems] = useState<CatalogoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filtroActivo, setFiltroActivo] = useState<"todos" | "activos" | "inactivos">("todos");
  const [selected, setSelected] = useState<CatalogoItem | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ activo: "false" }); // fetch all, filter client-side
    fetch(`/api/tecnicos/catalogo-productos-digitales?${params.toString()}`)
      .then(r => r.json())
      .then((json: { success: boolean; data?: CatalogoItem[]; error?: string }) => {
        if (!json.success) throw new Error(json.error ?? "Error al cargar catálogo");
        setItems(json.data ?? []);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Error al cargar catálogo"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = items.filter(item => {
    if (filtroActivo === "activos" && !item.activo) return false;
    if (filtroActivo === "inactivos" && item.activo) return false;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      return (
        item.productoBase.toLowerCase().includes(q) ||
        (item.marca ?? "").toLowerCase().includes(q) ||
        (item.tipo ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const activos = items.filter(i => i.activo).length;

  return (
    <div className={`${styles.theme} w-full space-y-5`}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/tecnicos/productos-digitales"
              className="text-xs text-[var(--sg-text-muted)] transition hover:text-[var(--sg-lime)]"
            >
              ← Productos Digitales
            </Link>
          </div>
          <h1 className="mt-1 text-lg font-bold text-[var(--sg-text-primary)]">
            Catálogo Digital
          </h1>
          {!loading && !error && (
            <p className="text-xs text-[var(--sg-text-muted)]">
              {items.length} producto{items.length !== 1 ? "s" : ""} · {activos} activo{activos !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--sg-lime)] bg-[var(--sg-lime)] px-4 py-1.5 text-sm font-semibold text-[#10110E] transition hover:brightness-105"
        >
          <span aria-hidden>+</span> Nuevo producto
        </button>
      </div>

      {/* Search + filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <svg
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--sg-text-muted)]"
          >
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nombre, marca, tipo..."
            className="w-full rounded-xl border border-[var(--sg-border)] bg-[var(--sg-card)] py-2.5 pl-10 pr-4 text-sm text-[var(--sg-text-primary)] placeholder:text-[var(--sg-text-muted)]/60 focus:border-[var(--sg-lime)]/50 focus:outline-none"
          />
        </div>
        <div className="flex gap-1.5">
          {(["todos", "activos", "inactivos"] as const).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltroActivo(f)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition ${
                filtroActivo === f
                  ? "border-[var(--sg-lime)] bg-[var(--sg-lime-soft)] text-[var(--sg-lime)]"
                  : "border-[var(--sg-border)] bg-[var(--sg-panel)] text-[var(--sg-text-secondary)] hover:border-[var(--sg-lime)]/40"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--sg-lime)] border-t-transparent" />
        </div>
      ) : error ? (
        <p className="rounded-xl border border-[var(--sg-danger)]/40 bg-[var(--sg-danger-soft)] px-4 py-3 text-sm text-[var(--sg-danger)]">
          {error}
        </p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--sg-border)] bg-[var(--sg-card)] py-20 text-center">
          <p className="text-sm text-[var(--sg-text-secondary)]">
            {debouncedSearch || filtroActivo !== "todos"
              ? "No hay productos que coincidan con el filtro."
              : "El catálogo está vacío."}
          </p>
          {!debouncedSearch && filtroActivo === "todos" && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--sg-lime)]/50 px-3 py-1 text-xs font-semibold text-[var(--sg-lime)] transition hover:bg-[var(--sg-lime-soft)]"
            >
              + Agregar el primero
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map(item => {
            const price = fmt(item.precioVentaCatalogo);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelected(item)}
                className="group flex flex-col overflow-hidden rounded-xl border border-[var(--sg-border)] bg-[var(--sg-card)] text-left shadow-[var(--sg-shadow-card)] transition hover:border-[var(--sg-lime)]/40 hover:shadow-[0_0_0_1px_var(--sg-lime)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sg-lime)]"
              >
                <CardLogo item={item} />

                <div className="flex flex-1 flex-col gap-1.5 p-3">
                  <p className="line-clamp-2 text-[13px] font-semibold leading-tight text-[var(--sg-text-primary)]">
                    {item.productoBase}
                  </p>

                  {(item.tipo || item.marca) && (
                    <div className="flex flex-wrap gap-1">
                      {item.tipo && (
                        <span className="inline-flex items-center rounded-full border border-[var(--sg-lime)]/25 bg-[var(--sg-lime)]/5 px-1.5 py-0.5 text-[9px] font-semibold text-[var(--sg-lime)]">
                          {item.tipo}
                        </span>
                      )}
                      {item.marca && (
                        <span className="inline-flex items-center rounded-full border border-[var(--sg-border)] bg-[var(--sg-panel)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--sg-text-muted)]">
                          {item.marca}
                        </span>
                      )}
                    </div>
                  )}

                  <p className={`mt-auto text-sm font-black ${price ? "text-[var(--sg-lime)]" : "text-[var(--sg-text-muted)]"}`}>
                    {price ?? "Sin precio"}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Detail modal */}
      {selected && <DetailModal item={selected} onClose={() => setSelected(null)} />}

      {/* Create modal */}
      {showCreate && (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={item => {
            setItems(prev => [item, ...prev]);
          }}
        />
      )}
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
