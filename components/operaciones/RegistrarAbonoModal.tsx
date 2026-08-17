"use client";

import { useState } from "react";
import { X, DollarSign } from "lucide-react";
import { METODOS_PAGO_ABONO, requiereNumeroTransaccion } from "@/types/abonos";

function defaultEcuadorDatetime(): string {
  // Return current time as YYYY-MM-DDTHH:mm in Ecuador timezone (UTC-5)
  const now = new Date();
  const ec = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  return ec.toISOString().slice(0, 16);
}

type Props = {
  operacionId: string;
  ordenId: string | null;
  onClose: () => void;
  onSuccess: () => void;
};

export function RegistrarAbonoModal({ operacionId, ordenId, onClose, onSuccess }: Props) {
  const [monto, setMonto] = useState("");
  const [metodoPago, setMetodoPago] = useState<string>("Efectivo");
  const [fechaAbono, setFechaAbono] = useState(defaultEcuadorDatetime);
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [numeroTransaccion, setNumeroTransaccion] = useState("");
  const [observacion, setObservacion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const montoNum = parseFloat(monto);
  const montoValido = !isNaN(montoNum) && montoNum > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!montoValido) {
      setError("El monto debe ser mayor a 0.");
      return;
    }
    if (requiereNumeroTransaccion(metodoPago) && !numeroTransaccion.trim()) {
      setError(`El número de transacción es obligatorio para el método "${metodoPago}".`);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const fd = new FormData();
      fd.set("monto", String(montoNum));
      fd.set("metodoPago", metodoPago);
      // Append Ecuador offset so Airtable stores the correct timezone
      fd.set("fechaAbono", `${fechaAbono}:00.000-05:00`);
      fd.set("ordenId", ordenId ?? "");
      if (numeroTransaccion.trim()) fd.set("numeroTransaccion", numeroTransaccion.trim());
      if (observacion.trim()) fd.set("observacion", observacion.trim());
      if (comprobante) fd.set("comprobante", comprobante);

      const res = await fetch(`/api/operaciones/${operacionId}/abonos`, {
        method: "POST",
        body: fd,
      });

      const data = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !data.success) {
        setError(data.error ?? "Error al registrar el abono.");
        return;
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
        onClick={loading ? undefined : onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="abono-modal-title"
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#3A3A36] bg-[#1E1F1C] shadow-2xl shadow-black/60"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#3A3A36] px-5 py-4">
          <div className="flex items-center gap-2">
            <DollarSign size={15} className="text-[#D7FF4F]" />
            <h2 id="abono-modal-title" className="text-sm font-semibold text-[#F0F0EC]">
              Registrar abono
            </h2>
            {ordenId && (
              <span className="rounded-full bg-[#78B7FF]/10 px-2 py-0.5 text-[10px] font-medium text-[#78B7FF]">
                + orden vinculada
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-full p-1 text-[#6B6B66] transition hover:bg-[#3A3A36] hover:text-[#F0F0EC] disabled:pointer-events-none"
            aria-label="Cerrar"
          >
            <X size={15} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Monto */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="abono-monto" className="text-xs font-medium text-[#8A8A80]">
              Monto <span className="text-[#FF5A4F]">*</span>
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#6B6B66]">
                $
              </span>
              <input
                id="abono-monto"
                type="number"
                step="0.01"
                min="0.01"
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                required
                disabled={loading}
                placeholder="0.00"
                autoFocus
                className="w-full rounded-lg border border-[#3A3A36] bg-[#252622] py-2.5 pl-7 pr-3 text-sm text-[#F0F0EC] placeholder-[#4A4A46] outline-none transition focus:border-[#D7FF4F]/60 focus:ring-1 focus:ring-[#D7FF4F]/20 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Método de Pago */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="abono-metodo" className="text-xs font-medium text-[#8A8A80]">
              Método de Pago <span className="text-[#FF5A4F]">*</span>
            </label>
            <select
              id="abono-metodo"
              value={metodoPago}
              onChange={(e) => setMetodoPago(e.target.value)}
              required
              disabled={loading}
              className="w-full rounded-lg border border-[#3A3A36] bg-[#252622] px-3 py-2.5 text-sm text-[#F0F0EC] outline-none transition focus:border-[#D7FF4F]/60 focus:ring-1 focus:ring-[#D7FF4F]/20 disabled:opacity-50"
            >
              {METODOS_PAGO_ABONO.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Fecha */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="abono-fecha" className="text-xs font-medium text-[#8A8A80]">
              Fecha y hora <span className="text-[#FF5A4F]">*</span>
            </label>
            <input
              id="abono-fecha"
              type="datetime-local"
              value={fechaAbono}
              onChange={(e) => setFechaAbono(e.target.value)}
              required
              disabled={loading}
              className="w-full rounded-lg border border-[#3A3A36] bg-[#252622] px-3 py-2.5 text-sm text-[#F0F0EC] outline-none transition focus:border-[#D7FF4F]/60 focus:ring-1 focus:ring-[#D7FF4F]/20 disabled:opacity-50 [color-scheme:dark]"
            />
          </div>

          {/* Comprobante */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="abono-comprobante" className="text-xs font-medium text-[#8A8A80]">
              Comprobante (opcional)
            </label>
            <input
              id="abono-comprobante"
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setComprobante(e.target.files?.[0] ?? null)}
              disabled={loading}
              className="w-full cursor-pointer rounded-lg border border-[#3A3A36] bg-[#252622] px-3 py-2 text-xs text-[#8A8A80] transition file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-[#3A3A36] file:px-3 file:py-1 file:text-xs file:font-medium file:text-[#F0F0EC] hover:file:bg-[#4A4A46] disabled:opacity-50"
            />
            {comprobante && (
              <p className="text-[11px] text-[#6B6B66]">
                {comprobante.name} ({(comprobante.size / 1024).toFixed(0)} KB)
              </p>
            )}
          </div>

          {/* N° Transacción */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="abono-nro" className="text-xs font-medium text-[#8A8A80]">
              N° de Transacción{" "}
              {requiereNumeroTransaccion(metodoPago) ? (
                <span className="text-[#FF5A4F]">*</span>
              ) : (
                "(opcional)"
              )}
            </label>
            <input
              id="abono-nro"
              type="text"
              value={numeroTransaccion}
              onChange={(e) => setNumeroTransaccion(e.target.value)}
              disabled={loading}
              placeholder="Código o referencia del banco"
              className="w-full rounded-lg border border-[#3A3A36] bg-[#252622] px-3 py-2.5 text-sm text-[#F0F0EC] placeholder-[#4A4A46] outline-none transition focus:border-[#D7FF4F]/60 focus:ring-1 focus:ring-[#D7FF4F]/20 disabled:opacity-50"
            />
          </div>

          {/* Observación */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="abono-obs" className="text-xs font-medium text-[#8A8A80]">
              Observación (opcional)
            </label>
            <textarea
              id="abono-obs"
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              disabled={loading}
              rows={2}
              placeholder="Notas adicionales…"
              className="w-full resize-none rounded-lg border border-[#3A3A36] bg-[#252622] px-3 py-2.5 text-sm text-[#F0F0EC] placeholder-[#4A4A46] outline-none transition focus:border-[#D7FF4F]/60 focus:ring-1 focus:ring-[#D7FF4F]/20 disabled:opacity-50"
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-[#3A3A36] pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm text-[#8A8A80] transition hover:border-[#5A5A56] hover:text-[#F0F0EC] disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !montoValido}
              className="inline-flex min-w-[130px] items-center justify-center gap-1.5 rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-2 text-sm font-bold text-[#10110E] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#10110E]/30 border-t-[#10110E]" />
                  Guardando…
                </>
              ) : (
                "Guardar abono"
              )}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
