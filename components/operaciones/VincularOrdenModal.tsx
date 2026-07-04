"use client";

import { useState, useEffect } from "react";
import { X, Wrench, Loader2 } from "lucide-react";
import type { OrdenClienteOp } from "@/types/operaciones";

type Props = {
  operacionId: string;
  clienteId: string;
  onClose: () => void;
  onSuccess: () => void;
};

export function VincularOrdenModal({ operacionId, clienteId, onClose, onSuccess }: Props) {
  const [ordenes, setOrdenes] = useState<OrdenClienteOp[]>([]);
  const [loadingOrdenes, setLoadingOrdenes] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/operaciones/clientes/${encodeURIComponent(clienteId)}/ordenes`)
      .then((r) => r.json())
      .then((d: { success: boolean; data: OrdenClienteOp[]; error?: string }) => {
        if (!cancelled) {
          if (d.success) setOrdenes(d.data);
          else setLoadError(d.error ?? "Error al cargar las órdenes.");
        }
      })
      .catch(() => { if (!cancelled) setLoadError("Error de conexión."); })
      .finally(() => { if (!cancelled) setLoadingOrdenes(false); });
    return () => { cancelled = true; };
  }, [clienteId]);

  async function handleVincular() {
    if (!selectedId) return;
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch(`/api/operaciones/${encodeURIComponent(operacionId)}/orden`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordenId: selectedId }),
      });
      const d = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !d.success) {
        setSaveError(d.error ?? "Error al vincular la orden.");
        return;
      }
      onSuccess();
    } catch {
      setSaveError("Error de conexión.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
        onClick={saving ? undefined : onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="vincular-orden-title"
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#3A3A36] bg-[#1E1F1C] shadow-2xl shadow-black/60"
        style={{ maxHeight: "80vh" }}
      >
        <div className="flex items-center justify-between border-b border-[#3A3A36] px-5 py-4">
          <div className="flex items-center gap-2">
            <Wrench size={14} className="text-[#78B7FF]" />
            <h2 id="vincular-orden-title" className="text-sm font-semibold text-[#F0F0EC]">
              Vincular orden de reparación
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full p-1 text-[#6B6B66] transition hover:bg-[#3A3A36] hover:text-[#F0F0EC] disabled:pointer-events-none"
            aria-label="Cerrar"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto p-5" style={{ maxHeight: "calc(80vh - 64px)" }}>
          {saveError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {saveError}
            </div>
          )}

          {loadingOrdenes ? (
            <div className="flex items-center gap-2 text-sm text-[#6B6B66]">
              <Loader2 size={14} className="animate-spin" />
              Cargando órdenes del cliente…
            </div>
          ) : loadError ? (
            <p className="text-sm text-red-400">{loadError}</p>
          ) : ordenes.length === 0 ? (
            <p className="text-sm text-[#6B6B66]">El cliente no tiene órdenes de reparación.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {ordenes.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setSelectedId(o.id)}
                  disabled={saving}
                  className={`flex flex-col items-start rounded-lg border px-3 py-2.5 text-left transition ${
                    selectedId === o.id
                      ? "border-[#78B7FF]/50 bg-[#78B7FF]/8 text-[#F0F0EC]"
                      : "border-[#3A3A36] text-[#C0C0BC] hover:border-[#5A5A56]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Wrench size={12} className="text-[#78B7FF]" />
                    <span className="font-mono text-sm font-semibold">{o.codigoOrden}</span>
                    <span className="rounded-full bg-[#3A3A36]/60 px-1.5 py-0.5 text-[10px] text-[#8A8A80]">
                      {o.estado}
                    </span>
                  </div>
                  {o.equipo && (
                    <span className="mt-0.5 pl-5 text-xs text-[#8A8A80]">{o.equipo}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-[#3A3A36] pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm text-[#8A8A80] transition hover:border-[#5A5A56] hover:text-[#F0F0EC] disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleVincular}
              disabled={saving || !selectedId}
              className="inline-flex min-w-[100px] items-center justify-center gap-1.5 rounded-full border border-[#78B7FF] bg-[#78B7FF]/10 px-4 py-2 text-sm font-semibold text-[#78B7FF] transition hover:bg-[#78B7FF]/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#78B7FF]/30 border-t-[#78B7FF]" />
                  Vinculando…
                </>
              ) : (
                "Vincular"
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
