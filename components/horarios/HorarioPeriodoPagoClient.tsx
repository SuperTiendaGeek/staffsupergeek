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
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="rounded-md bg-geek-lime px-3 py-2 text-sm font-semibold text-geek-black transition hover:bg-white"
        >
          Registrar pago
        </button>
        {notice ? (
          <p className="rounded-md border border-geek-lime/30 bg-geek-lime/10 px-3 py-2 text-sm text-geek-lime">{notice}</p>
        ) : null}
        {error ? (
          <p className="rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-100">{error}</p>
        ) : null}
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-3 py-5 backdrop-blur-sm">
          <form onSubmit={handleSubmit} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[#30312D] bg-geek-black px-3 py-2.5 shadow-2xl shadow-black">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-lg font-semibold text-white">Registrar pago</h3>
                <p className="mt-1 text-sm text-zinc-400">El estado del periodo se actualizará según el saldo.</p>
              </div>
              <button type="button" onClick={() => setIsOpen(false)} className="rounded-md border border-[#30312D] px-3 py-1.5 text-sm text-zinc-300 hover:text-white">
                Cerrar
              </button>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-zinc-300">Fecha de pago</span>
                <input
                  type="date"
                  value={fechaPago}
                  onChange={(event) => setFechaPago(event.target.value)}
                  className="mt-1 w-full rounded-md border border-[#30312D] bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-geek-lime"
                  required
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-zinc-300">Monto pagado</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={montoPagado}
                  onChange={(event) => setMontoPagado(event.target.value)}
                  className="mt-1 w-full rounded-md border border-[#30312D] bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-geek-lime"
                  required
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-zinc-300">Método de pago</span>
                <select
                  value={metodoPago}
                  onChange={(event) => setMetodoPago(event.target.value as HorarioMetodoPago)}
                  className="mt-1 w-full rounded-md border border-[#30312D] bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-geek-lime"
                  required
                >
                  {HORARIO_METODOS_PAGO.map((metodo) => (
                    <option key={metodo} value={metodo} className="bg-geek-black">
                      {metodo}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-zinc-300">Número de transacción</span>
                <input
                  value={numeroTransaccion}
                  onChange={(event) => setNumeroTransaccion(event.target.value)}
                  className="mt-1 w-full rounded-md border border-[#30312D] bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-geek-lime"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-zinc-300">Banco / cuenta origen</span>
                <input
                  value={bancoCuentaOrigen}
                  onChange={(event) => setBancoCuentaOrigen(event.target.value)}
                  className="mt-1 w-full rounded-md border border-[#30312D] bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-geek-lime"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-zinc-300">Observación</span>
                <textarea
                  value={observacion}
                  onChange={(event) => setObservacion(event.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-md border border-[#30312D] bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-geek-lime"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-zinc-300">Comprobante</span>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(event) => setComprobante(event.target.files?.[0] || null)}
                  className="mt-1 w-full rounded-md border border-[#30312D] bg-black/30 px-3 py-2 text-sm text-zinc-200 file:mr-3 file:rounded-md file:border-0 file:bg-geek-lime file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-geek-black"
                />
                {comprobante ? <p className="mt-2 text-xs text-zinc-500">Archivo seleccionado: {comprobante.name}</p> : null}
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setIsOpen(false)} className="rounded-md border border-[#30312D] px-3 py-2 text-sm font-medium text-zinc-200 hover:text-white">
                Cancelar
              </button>
              <button type="submit" disabled={isSubmitting} className="rounded-md bg-geek-lime px-3 py-2 text-sm font-semibold text-geek-black hover:bg-white disabled:cursor-not-allowed disabled:opacity-50">
                {isSubmitting ? "Guardando..." : "Guardar pago"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
