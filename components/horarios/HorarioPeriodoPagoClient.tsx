"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { HORARIO_METODOS_PAGO, type HorarioMetodoPago } from "@/types/horarios";

type Props = {
  periodoId: string;
};

type ApiResponse = {
  success?: boolean;
  error?: string;
  warning?: string | null;
};

const MODAL_INPUT_CLASSES =
  "mt-1 h-9 w-full rounded-xl border border-[#3A3A36] bg-[#1E1F1C] px-3 text-sm text-[#F5F5F5] outline-none transition focus:border-[#D7FF4F]/60";

function todayDateInputValue() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guayaquil",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

export function HorarioPeriodoPagoClient({ periodoId }: Props) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [fechaPago, setFechaPago] = useState(todayDateInputValue);
  const [montoPagado, setMontoPagado] = useState("");
  const [metodoPago, setMetodoPago] = useState<HorarioMetodoPago>("Transferencia bancaria");
  const [numeroTransaccion, setNumeroTransaccion] = useState("");
  const [bancoCuentaOrigen, setBancoCuentaOrigen] = useState("");
  const [observacion, setObservacion] = useState("");
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function resetForm() {
    setFechaPago(todayDateInputValue());
    setMontoPagado("");
    setMetodoPago("Transferencia bancaria");
    setNumeroTransaccion("");
    setBancoCuentaOrigen("");
    setObservacion("");
    setComprobante(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setIsSubmitting(true);

    const form = new FormData();
    form.set("fechaPago", fechaPago);
    form.set("montoPagado", montoPagado);
    form.set("metodoPago", metodoPago);
    form.set("numeroTransaccion", numeroTransaccion);
    form.set("bancoCuentaOrigen", bancoCuentaOrigen);
    form.set("observacion", observacion);

    if (comprobante) {
      form.set("comprobante", comprobante);
    }

    try {
      const response = await fetch(`/api/horarios/admin/periodos/${periodoId}/pagos`, {
        method: "POST",
        credentials: "same-origin",
        body: form
      });
      const payload = (await response.json()) as ApiResponse;

      if (!response.ok || !payload.success) {
        setError(payload.error || "No se pudo registrar el pago");
        return;
      }

      setNotice(payload.warning || "Pago registrado correctamente");
      setIsOpen(false);
      resetForm();
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-2 text-sm font-semibold text-[#10110E] transition hover:brightness-105"
        >
          Registrar pago
        </button>
        {notice ? (
          <p className="rounded-xl border border-[#D7FF4F]/30 bg-[#D7FF4F]/10 px-3 py-2.5 text-sm font-medium text-[#D7FF4F]">{notice}</p>
        ) : null}
        {error ? (
          <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2.5 text-sm text-red-100">{error}</p>
        ) : null}
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-3 py-5">
          <form onSubmit={handleSubmit} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-5 shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-[#F5F5F5]">Registrar pago</h3>
                <p className="mt-0.5 text-sm text-[#A7A7A7]">El estado del periodo se actualizará según el saldo.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="shrink-0 rounded-full border border-[#3A3A36] px-3 py-1 text-sm text-[#CFCFCB] transition hover:text-[#F5F5F5]"
              >
                Cerrar
              </button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-[#CFCFCB]">Fecha de pago</span>
                <input
                  type="date"
                  value={fechaPago}
                  onChange={(event) => setFechaPago(event.target.value)}
                  className={MODAL_INPUT_CLASSES}
                  required
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-[#CFCFCB]">Monto pagado</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={montoPagado}
                  onChange={(event) => setMontoPagado(event.target.value)}
                  className={MODAL_INPUT_CLASSES}
                  required
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-[#CFCFCB]">Método de pago</span>
                <select
                  value={metodoPago}
                  onChange={(event) => setMetodoPago(event.target.value as HorarioMetodoPago)}
                  className={MODAL_INPUT_CLASSES}
                  required
                >
                  {HORARIO_METODOS_PAGO.map((metodo) => (
                    <option key={metodo} value={metodo} className="bg-[#1E1F1C]">
                      {metodo}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-[#CFCFCB]">Número de transacción</span>
                <input
                  value={numeroTransaccion}
                  onChange={(event) => setNumeroTransaccion(event.target.value)}
                  className={MODAL_INPUT_CLASSES}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-[#CFCFCB]">Banco / cuenta origen</span>
                <input
                  value={bancoCuentaOrigen}
                  onChange={(event) => setBancoCuentaOrigen(event.target.value)}
                  className={MODAL_INPUT_CLASSES}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-[#CFCFCB]">Observación</span>
                <textarea
                  value={observacion}
                  onChange={(event) => setObservacion(event.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-[#3A3A36] bg-[#1E1F1C] px-3 py-2.5 text-sm text-[#F5F5F5] outline-none transition placeholder:text-[#8F908A] focus:border-[#D7FF4F]/60"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-[#CFCFCB]">Comprobante</span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(event) => setComprobante(event.target.files?.[0] || null)}
                  className="mt-1 w-full rounded-xl border border-[#3A3A36] bg-[#1E1F1C] px-3 py-1.5 text-sm text-[#CFCFCB] outline-none transition file:mr-3 file:rounded-full file:border-0 file:bg-[#D7FF4F] file:px-3 file:py-1 file:text-sm file:font-semibold file:text-[#10110E]"
                />
                {comprobante ? <p className="mt-1.5 text-xs text-[#8F908A]">Archivo seleccionado: {comprobante.name}</p> : null}
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm font-medium text-[#CFCFCB] transition hover:text-[#F5F5F5]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-2 text-sm font-semibold text-[#10110E] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? "Guardando..." : "Guardar pago"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
