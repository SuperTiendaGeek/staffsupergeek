"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Zona de administrador: eliminar un item. El servidor vuelve a validar el
// rol y los bloqueos; esta pantalla solo guía. Primero muestra qué lo impide o
// qué se pierde, y pide escribir el SKU para confirmar.

type Evaluacion = { permitido: boolean; bloqueos: string[]; avisos: string[]; confirmacion: string; sku: string; nombre: string };

const BTN = "inline-flex h-8 items-center justify-center rounded-[var(--sg-radius-sm)] border px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
const INPUT = "w-full rounded-[var(--sg-radius-sm)] border border-[var(--sg-border)] bg-[var(--sg-panel)] px-2.5 py-1.5 text-sm text-[var(--sg-text-primary)] placeholder:text-[var(--sg-text-muted)] focus:border-[var(--sg-danger)] focus:outline-none";

export function EliminarItemAdmin({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [evaluacion, setEvaluacion] = useState<Evaluacion | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [confirmacion, setConfirmacion] = useState("");

  const url = `/api/shipping-v2/items/${encodeURIComponent(itemId)}/eliminar`;

  async function revisar() {
    setOcupado(true); setError(null);
    try {
      const r = await fetch(url, { cache: "no-store" });
      const j = await r.json();
      if (!j.success) { setError(j.error ?? "No se pudo revisar el item"); return; }
      setEvaluacion(j.data);
    } catch { setError("Error de red"); }
    finally { setOcupado(false); }
  }

  async function eliminar() {
    setOcupado(true); setError(null);
    try {
      const r = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmacion, motivo }),
      });
      const j = await r.json();
      if (!j.success) {
        setError(j.error ?? "No se pudo eliminar el item");
        if (j.data?.bloqueos) setEvaluacion((ev) => (ev ? { ...ev, ...j.data } : ev));
        return;
      }
      router.push("/shipping-v2/items");
      router.refresh();
    } catch { setError("Error de red"); }
    finally { setOcupado(false); }
  }

  function cerrar() { setEvaluacion(null); setMotivo(""); setConfirmacion(""); setError(null); }

  const listo = !!evaluacion?.permitido && motivo.trim().length >= 5
    && confirmacion.trim().toUpperCase() === evaluacion.confirmacion.trim().toUpperCase();

  return (
    <section className="space-y-2 rounded-[var(--sg-radius-md)] border border-[var(--sg-danger)]/30 bg-[var(--sg-card)] px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--sg-danger)]">Zona de administrador</p>
          <p className="text-xs text-[var(--sg-text-muted)]">Eliminar el item no se puede deshacer. Solo se permite si no tiene pagos, packings, recepciones, novedades ni documentos.</p>
        </div>
        {!evaluacion && (
          <button type="button" onClick={revisar} disabled={ocupado} className={`${BTN} border-[var(--sg-danger)]/50 bg-transparent text-[var(--sg-danger)] hover:bg-[var(--sg-danger)]/10`}>
            {ocupado ? "Revisando…" : "Eliminar item…"}
          </button>
        )}
      </div>

      {evaluacion && (
        <div className="space-y-2 border-t border-[var(--sg-divider)] pt-2 text-xs">
          {evaluacion.bloqueos.length > 0 ? (
            <>
              <p className="font-semibold text-[var(--sg-text-primary)]">No se puede eliminar {evaluacion.sku || "este item"}:</p>
              <ul className="list-disc space-y-1 pl-5 text-[var(--sg-warning)]">
                {evaluacion.bloqueos.map((b) => <li key={b}>{b}</li>)}
              </ul>
            </>
          ) : (
            <>
              {evaluacion.avisos.length > 0 && (
                <ul className="list-disc space-y-1 pl-5 text-[var(--sg-text-secondary)]">
                  {evaluacion.avisos.map((a) => <li key={a}>{a}</li>)}
                </ul>
              )}
              <div className="grid gap-2 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-[var(--sg-text-muted)]">Motivo (queda en el historial)</span>
                  <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: cliente desistió, devuelto al proveedor" className={INPUT} />
                </label>
                <label className="space-y-1">
                  <span className="text-[var(--sg-text-muted)]">Para confirmar escribe <b className="text-[var(--sg-text-primary)]">{evaluacion.confirmacion}</b></span>
                  <input value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} autoComplete="off" className={INPUT} />
                </label>
              </div>
            </>
          )}
          {error && <p className="text-[var(--sg-danger)]">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={cerrar} disabled={ocupado} className={`${BTN} border-[var(--sg-border)] bg-[var(--sg-card)] text-[var(--sg-text-secondary)] hover:text-[var(--sg-text-primary)]`}>
              {evaluacion.permitido ? "Cancelar" : "Cerrar"}
            </button>
            {evaluacion.permitido && (
              <button type="button" onClick={eliminar} disabled={!listo || ocupado} className={`${BTN} border-[var(--sg-danger)] bg-[var(--sg-danger)] text-white hover:brightness-110`}>
                {ocupado ? "Eliminando…" : "Eliminar definitivamente"}
              </button>
            )}
          </div>
        </div>
      )}
      {!evaluacion && error && <p className="text-xs text-[var(--sg-danger)]">{error}</p>}
    </section>
  );
}
