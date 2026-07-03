"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import styles from "@/components/tecnicos/layout/TecnicosTheme.module.css";

type OrdenForCotizacion = {
  recordId: string;
  equipo: string;
  cotizacionId: string;
  cotizacionCodigo: string;
};

type Props = {
  orden: OrdenForCotizacion;
  onLinked: (cotizacionId: string, cotizacionCodigo: string) => void;
};

// Oculto temporalmente: el vínculo Orden↔Cotizaciones se reemplazará por
// Orden↔Operación Comercial en la fase de integración técnicos-operaciones.
export default function OrdenCotizacionCard(_props: Props) {
  return null;
}

function OrdenCotizacionCardImpl({ orden, onLinked }: Props) {
  const [isMounted, setIsMounted] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => { setIsMounted(true); }, []);
  const [productoSolicitado, setProductoSolicitado] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [partial, setPartial] = useState(false);

  const cotizacionId = orden.cotizacionId;
  const cotizacionCodigo = orden.cotizacionCodigo;

  async function handleCrear() {
    if (!productoSolicitado.trim()) {
      setError("Indica el producto o equipo.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${orden.recordId}/cotizacion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productoSolicitado: productoSolicitado.trim(),
          descripcionRequerimiento: descripcion.trim() || null,
        }),
      });
      const json = await res.json();

      if (!res.ok && res.status !== 207) {
        if (res.status === 409 && json.data) {
          onLinked(json.data.cotizacionId, json.data.cotizacionCodigo);
          setCreateOpen(false);
          return;
        }
        setError(json.error ?? "Error al crear la cotización.");
        return;
      }

      if (json.partial) setPartial(true);
      onLinked(json.data.cotizacionId, json.data.cotizacionCodigo);
      setCreateOpen(false);
    } catch {
      setError("Error de red. Intenta nuevamente.");
    } finally {
      setSaving(false);
    }
  }

  async function handleEliminar() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/tecnicos/ordenes/${orden.recordId}/cotizacion`, {
        method: "DELETE",
      });
      const json = await res.json();

      if (!res.ok && res.status !== 207) {
        setDeleteError(json.error ?? "Error al procesar la cotización.");
        return;
      }

      setDeleteOpen(false);
      onLinked("", "");
    } catch {
      setDeleteError("Error de red. Intenta nuevamente.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="rounded-xl border border-[var(--sg-border)] bg-[var(--sg-card)] px-3 py-3 shadow-[var(--sg-shadow-card)]">
        <div className="mb-2.5 flex items-center gap-2">
          <svg
            width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="var(--sg-lime)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="opacity-70"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--sg-text-muted)]">
            Cotización
          </p>
        </div>

        {cotizacionId ? (
          <div className="space-y-2">
            <div className="rounded-lg border border-[var(--sg-border)] bg-[var(--sg-panel)] px-3 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--sg-text-muted)]">Código</p>
              <p className="mt-0.5 font-mono text-sm font-bold text-[var(--sg-lime)]">
                {cotizacionCodigo || cotizacionId}
              </p>
            </div>
            <Link
              href={`/cotizaciones/${cotizacionId}`}
              className="flex w-full items-center justify-center rounded-full border border-[var(--sg-lime)]/50 bg-[var(--sg-lime-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--sg-lime)] transition hover:border-[var(--sg-lime)] hover:brightness-105"
            >
              Abrir cotización →
            </Link>
            <button
              onClick={() => { setDeleteOpen(true); setDeleteError(null); }}
              className="w-full rounded-full border border-[var(--sg-border)] bg-transparent px-3 py-1.5 text-xs font-medium text-[var(--sg-text-muted)] transition hover:border-[var(--sg-danger)]/50 hover:text-[var(--sg-danger)]"
            >
              Desvincular cotización
            </button>
            {partial && (
              <p className="text-center text-[11px] text-[var(--sg-warning)]">
                Cotización creada. El vínculo se completará al recargar.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[0.8125rem] text-[var(--sg-text-muted)]">
              Sin cotización vinculada.
            </p>
            <button
              onClick={() => { setCreateOpen(true); setError(null); }}
              className="inline-flex w-full items-center justify-center gap-1 rounded-full border border-[var(--sg-lime)]/40 px-3 py-1.5 text-xs font-semibold text-[var(--sg-lime)] transition hover:border-[var(--sg-lime)] hover:bg-[var(--sg-lime-soft)]"
            >
              <span aria-hidden>+</span> Crear cotización
            </button>
          </div>
        )}
      </div>

      {/* Modal: Crear cotización */}
      {isMounted && createOpen && createPortal(
        <div className={styles.theme}>
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={(e) => { if (e.target === e.currentTarget) setCreateOpen(false); }}
        >
          <div className="mx-4 w-full max-w-[460px] rounded-xl border border-[var(--sg-border)] bg-[var(--sg-card)] p-6">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-[0.95rem] font-bold text-[var(--sg-text-primary)]">Crear cotización</h3>
              <button
                onClick={() => setCreateOpen(false)}
                className="text-lg leading-none text-[var(--sg-text-muted)] transition hover:text-[var(--sg-text-primary)]"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--sg-text-muted)]">
                  Producto / Equipo *
                </label>
                <input
                  type="text"
                  value={productoSolicitado}
                  onChange={(e) => setProductoSolicitado(e.target.value)}
                  placeholder="Ej: Batería Dell Inspiron 15…"
                  className="w-full rounded-lg border border-[var(--sg-border)] bg-[var(--sg-panel)] px-3 py-2 text-sm text-[var(--sg-text-primary)] placeholder:text-[var(--sg-text-muted)] focus:border-[var(--sg-lime)] focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--sg-text-muted)]">
                  Descripción (opcional)
                </label>
                <textarea
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Detalles adicionales"
                  rows={3}
                  className="w-full resize-none rounded-lg border border-[var(--sg-border)] bg-[var(--sg-panel)] px-3 py-2 text-sm text-[var(--sg-text-primary)] placeholder:text-[var(--sg-text-muted)] focus:border-[var(--sg-lime)] focus:outline-none"
                />
              </div>
            </div>

            {error && <p className="mt-3 text-sm text-[var(--sg-danger)]">{error}</p>}

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setCreateOpen(false)}
                disabled={saving}
                className="flex-1 rounded-full border border-[var(--sg-border)] bg-transparent px-4 py-2 text-sm font-medium text-[var(--sg-text-secondary)] transition hover:border-[var(--sg-lime)]"
              >
                Cancelar
              </button>
              <button
                onClick={handleCrear}
                disabled={saving}
                className="flex-1 rounded-full border border-[var(--sg-lime)] bg-[var(--sg-lime)] px-4 py-2 text-sm font-bold text-[var(--sg-text-on-accent)] transition hover:brightness-105 disabled:opacity-60"
              >
                {saving ? "Creando…" : "Crear"}
              </button>
            </div>
          </div>
        </div>
        </div>
      , document.body)}

      {/* Modal: Confirmar desvincular */}
      {isMounted && deleteOpen && createPortal(
        <div className={styles.theme}>
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={(e) => { if (e.target === e.currentTarget && !deleting) setDeleteOpen(false); }}
        >
          <div className="mx-4 w-full max-w-[420px] rounded-xl border border-[var(--sg-border)] bg-[var(--sg-card)] p-6">
            <h3 className="mb-2 text-[0.95rem] font-bold text-[var(--sg-text-primary)]">¿Desvincular cotización?</h3>
            <p className="text-[0.8125rem] leading-relaxed text-[var(--sg-text-secondary)]">
              Si la cotización no tiene opciones ni abonos, se eliminará permanentemente. Si ya tiene actividad, solo se marcará como <strong className="text-[var(--sg-text-primary)]">No Disponible</strong>.
            </p>

            {deleteError && <p className="mt-3 text-sm text-[var(--sg-danger)]">{deleteError}</p>}

            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setDeleteOpen(false)}
                disabled={deleting}
                className="flex-1 rounded-full border border-[var(--sg-border)] bg-transparent px-4 py-2 text-sm font-medium text-[var(--sg-text-secondary)] transition hover:border-[var(--sg-lime)] disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={handleEliminar}
                disabled={deleting}
                className="flex-1 rounded-full border border-[var(--sg-danger)] bg-[var(--sg-danger-soft)] px-4 py-2 text-sm font-bold text-[var(--sg-danger)] transition hover:brightness-110 disabled:opacity-60"
              >
                {deleting ? "Procesando…" : "Sí, desvincular"}
              </button>
            </div>
          </div>
        </div>
        </div>
      , document.body)}
    </>
  );
}
