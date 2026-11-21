"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MOTIVOS_ANULACION, validarMotivoAnulacion, type MotivoAnulacion } from "@/lib/cobros/anular";
import type { PagoTarjeta } from "@/lib/estado-cuenta/tarjeta";

// Anular un pago (auditoría ops, punto 11): solo lo ve un administrador, con
// motivo obligatorio. La regla (documento vigente, pago en línea, traspaso)
// la vuelve a revisar el servidor: lib/cobros/anular.ts.

const usd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);

export function AnularPagoDialog({
  pago,
  saldoActual,
  onCerrar,
  onAnulado,
}: {
  pago: PagoTarjeta;
  /** Saldo de la cuenta hoy: para mostrar cómo queda (solo informativo). */
  saldoActual: number;
  onCerrar: () => void;
  onAnulado: (aviso: string | null) => void;
}) {
  const [motivo, setMotivo] = useState<MotivoAnulacion>("Registrado dos veces");
  const [detalle, setDetalle] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalido = validarMotivoAnulacion(motivo, detalle);
  const queda = Math.round((saldoActual + pago.monto) * 100) / 100;

  async function anular() {
    if (invalido) { setError(invalido); return; }
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/tecnicos/abonos-por-orden/${encodeURIComponent(pago.id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo, detalle }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.success) throw new Error(j?.error || "No se pudo anular el pago.");
      onAnulado(typeof j.warning === "string" && j.warning.trim() ? j.warning : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo anular el pago.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(abierto) => { if (!abierto && !enviando) onCerrar(); }}>
      <DialogContent className="max-w-[400px] gap-3 border-[#6A6A62] bg-[#1E1F1C] p-4 text-[13px] text-[#F0F0EC]">
        <DialogHeader className="space-y-1 text-left">
          <DialogTitle className="text-sm font-bold">Anular pago</DialogTitle>
          <DialogDescription className="text-xs text-[#B5B5AE]">
            {pago.etiqueta} · {pago.numero}{pago.registradoPor ? ` · ${pago.registradoPor}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-end">
          <span className="text-base font-extrabold tabular-nums">{usd(pago.monto)}</span>
        </div>

        <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
          <legend className="mb-1.5 p-0 text-[11px] font-semibold text-[#B5B5AE]">Motivo</legend>
          <div className="grid grid-cols-2 gap-1.5">
            {MOTIVOS_ANULACION.map((m) => (
              <label key={m}
                className={`flex h-8 cursor-pointer items-center gap-2 rounded-lg border px-2.5 text-xs ${motivo === m ? "border-[#D7FF4F] bg-[#D7FF4F]/[.08]" : "border-[#3A3A36] bg-[#252622]"}`}>
                <input type="radio" name="motivo-anulacion" checked={motivo === m} onChange={() => setMotivo(m)} className="m-0 accent-[#D7FF4F]" />
                {m}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-[#B5B5AE]">Detalle{motivo === "Otro" ? "" : " (opcional)"}</span>
          <textarea rows={2} value={detalle} onChange={(e) => setDetalle(e.target.value)}
            className="resize-none rounded-lg border border-[#3A3A36] bg-[#151613] p-2 text-xs text-[#F0F0EC]" />
        </label>

        <div className="grid grid-cols-[1fr_auto] gap-x-3 border-t border-[#2C2D29] pt-2.5 tabular-nums">
          <span className="text-xs text-[#B5B5AE]">La cuenta queda</span>
          <span className={`font-bold ${queda > 0.01 ? "text-[#FFB547]" : queda < -0.01 ? "text-[#78B7FF]" : "text-[#56E3A4]"}`}>
            {queda > 0.01 ? `Falta cobrar ${usd(queda)}` : queda < -0.01 ? `Sobran ${usd(-queda)}` : "En $0"}
          </span>
        </div>

        {error && <p className="m-0 text-xs text-[#FF7A70]" style={{ animation: "sg-sacudir 300ms ease" }}>{error}</p>}

        <DialogFooter className="flex-row justify-end gap-2 sm:space-x-0">
          <button type="button" onClick={onCerrar} disabled={enviando}
            className="h-[30px] rounded-lg border border-[#3A3A36] bg-[#252622] px-3 text-xs font-semibold text-[#F0F0EC]">
            Cancelar
          </button>
          <button type="button" onClick={anular} disabled={enviando || !!invalido}
            className="h-[30px] rounded-lg border border-[#E5483E] bg-[#E5483E] px-3 text-xs font-semibold text-white disabled:opacity-50">
            {enviando ? "Anulando…" : "Anular pago"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
