"use client";

import { useState } from "react";
import Link from "next/link";

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

const s = {
  surface: "var(--sg-surface, #1E1E2E)",
  surfaceElevated: "var(--sg-surface-elevated, #252535)",
  border: "var(--sg-border, #2E2E3E)",
  accent: "var(--sg-accent, #7C6AF7)",
  textPrimary: "var(--sg-text-primary, #F5F5F5)",
  textSecondary: "var(--sg-text-secondary, #A0A0B0)",
  warning: "var(--sg-warning, #F59E0B)",
  danger: "#EF4444",
} as const;

export default function OrdenCotizacionCard({ orden, onLinked }: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
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
      <div
        style={{
          background: s.surface,
          border: `1px solid ${s.border}`,
          borderRadius: 10,
          padding: "16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={s.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
          <span style={{ fontSize: 13, fontWeight: 600, color: s.textPrimary, letterSpacing: "0.02em" }}>
            Cotización
          </span>
        </div>

        {cotizacionId ? (
          <div>
            <div
              style={{
                background: s.surfaceElevated,
                borderRadius: 8,
                padding: "10px 12px",
                marginBottom: 10,
              }}
            >
              <div style={{ fontSize: 11, color: s.textSecondary, marginBottom: 2 }}>Código</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: s.accent }}>
                {cotizacionCodigo || cotizacionId}
              </div>
            </div>
            <Link
              href={`/cotizaciones/${cotizacionId}`}
              style={{
                display: "block",
                width: "100%",
                textAlign: "center",
                padding: "8px 12px",
                borderRadius: 9999,
                background: s.accent,
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Abrir cotización
            </Link>
            <button
              onClick={() => { setDeleteOpen(true); setDeleteError(null); }}
              style={{
                display: "block",
                width: "100%",
                marginTop: 8,
                padding: "6px 12px",
                borderRadius: 9999,
                border: `1px solid ${s.border}`,
                background: "transparent",
                color: s.textSecondary,
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Eliminar cotización
            </button>
            {partial && (
              <p style={{ fontSize: 11, color: s.warning, marginTop: 8, textAlign: "center" }}>
                Cotización creada. El vínculo se completará al recargar.
              </p>
            )}
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 13, color: s.textSecondary, marginBottom: 12 }}>
              Esta orden aún no tiene cotización.
            </p>
            <button
              onClick={() => { setCreateOpen(true); setError(null); }}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 9999,
                background: s.accent,
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
              }}
            >
              Crear cotización
            </button>
          </div>
        )}
      </div>

      {/* Modal: Crear cotización */}
      {createOpen && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}
          onClick={(e) => { if (e.target === e.currentTarget) setCreateOpen(false); }}
        >
          <div
            style={{
              background: s.surface,
              border: `1px solid ${s.border}`,
              borderRadius: 12,
              padding: "24px",
              width: "100%",
              maxWidth: 460,
              margin: "0 16px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: s.textPrimary }}>Crear cotización</h3>
              <button onClick={() => setCreateOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: s.textSecondary, fontSize: 18 }}>×</button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: s.textSecondary, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Producto / Equipo *
              </label>
              <input
                type="text"
                value={productoSolicitado}
                onChange={(e) => setProductoSolicitado(e.target.value)}
                placeholder="Ej: Batería Dell Inspiron 15, Pantalla MacBook Pro..."
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: `1px solid ${s.border}`,
                  background: s.surfaceElevated,
                  color: s.textPrimary,
                  fontSize: 14,
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: s.textSecondary, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Descripción del requerimiento
              </label>
              <textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Detalles adicionales (opcional)"
                rows={3}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  borderRadius: 8,
                  border: `1px solid ${s.border}`,
                  background: s.surfaceElevated,
                  color: s.textPrimary,
                  fontSize: 14,
                  resize: "vertical",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                }}
              />
            </div>

            {error && <p style={{ fontSize: 13, color: s.danger, marginBottom: 16 }}>{error}</p>}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setCreateOpen(false)}
                disabled={saving}
                style={{ flex: 1, padding: "9px 16px", borderRadius: 9999, border: `1px solid ${s.border}`, background: "transparent", color: s.textSecondary, fontSize: 14, fontWeight: 500, cursor: "pointer" }}
              >
                Cancelar
              </button>
              <button
                onClick={handleCrear}
                disabled={saving}
                style={{ flex: 1, padding: "9px 16px", borderRadius: 9999, background: saving ? s.border : s.accent, color: "#fff", border: "none", fontSize: 14, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}
              >
                {saving ? "Creando..." : "Crear cotización"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmar eliminación */}
      {deleteOpen && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}
          onClick={(e) => { if (e.target === e.currentTarget && !deleting) setDeleteOpen(false); }}
        >
          <div
            style={{
              background: s.surface,
              border: `1px solid ${s.border}`,
              borderRadius: 12,
              padding: "24px",
              width: "100%",
              maxWidth: 420,
              margin: "0 16px",
            }}
          >
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700, color: s.textPrimary }}>¿Eliminar cotización?</h3>
              <p style={{ margin: 0, fontSize: 13, color: s.textSecondary, lineHeight: 1.5 }}>
                Si la cotización no tiene opciones ni abonos, se eliminará permanentemente y se quitará el vínculo con esta orden.
              </p>
              <p style={{ margin: "8px 0 0", fontSize: 13, color: s.textSecondary, lineHeight: 1.5 }}>
                Si ya tiene actividad, solo se marcará como <strong style={{ color: s.textPrimary }}>No Disponible</strong> y se quitará el vínculo.
              </p>
            </div>

            {deleteError && <p style={{ fontSize: 13, color: s.danger, marginBottom: 16 }}>{deleteError}</p>}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setDeleteOpen(false)}
                disabled={deleting}
                style={{ flex: 1, padding: "9px 16px", borderRadius: 9999, border: `1px solid ${s.border}`, background: "transparent", color: s.textSecondary, fontSize: 14, fontWeight: 500, cursor: deleting ? "not-allowed" : "pointer" }}
              >
                Cancelar
              </button>
              <button
                onClick={handleEliminar}
                disabled={deleting}
                style={{ flex: 1, padding: "9px 16px", borderRadius: 9999, background: deleting ? s.border : s.danger, color: "#fff", border: "none", fontSize: 14, fontWeight: 600, cursor: deleting ? "not-allowed" : "pointer" }}
              >
                {deleting ? "Procesando..." : "Sí, eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
