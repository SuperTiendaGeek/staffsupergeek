"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
  periodoId: string;
  fechaInicio: string;
  fechaFin: string;
};

type ApiResponse = {
  success?: boolean;
  error?: string;
  jornadasRetiradas?: number;
};

export function CerrarPeriodoHastaFechaButton({ periodoId, fechaInicio, fechaFin }: Props) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [fechaCorte, setFechaCorte] = useState(fechaFin);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  async function handleSubmit() {
    setError("");
    setNotice("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/horarios/admin/periodos/${periodoId}/cerrar-hasta`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fechaCorte })
      });
      const payload = (await response.json()) as ApiResponse;

      if (!response.ok || !payload.success) {
        setError(payload.error || "No se pudo cerrar el periodo");
        return;
      }

      const retiradas = payload.jornadasRetiradas ?? 0;
      setNotice(retiradas > 0 ? `Periodo cerrado. ${retiradas} jornadas pasaron a un nuevo periodo abierto.` : "Periodo cerrado correctamente.");
      setIsOpen(false);
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setIsSubmitting(false);
    }
  }

  const modal =
    mounted && isOpen
      ? createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-3 py-5">
          <div className="w-full max-w-md rounded-[1rem] border border-[#3A3A36] bg-[#252622] p-5 shadow-xl">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-[#F5F5F5]">Cerrar periodo hasta fecha</h3>
                <p className="mt-0.5 text-sm text-[#A7A7A7]">
                  Se conservarán solo las jornadas hasta la fecha de corte y las posteriores pasarán a un periodo abierto.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="shrink-0 rounded-full border border-[#3A3A36] px-3 py-1 text-sm text-[#CFCFCB] transition hover:text-[#F5F5F5]"
              >
                Cerrar
              </button>
            </div>

            <label className="mt-4 block">
              <span className="text-sm font-medium text-[#CFCFCB]">Fecha de corte</span>
              <input
                type="date"
                min={fechaInicio}
                max={fechaFin}
                value={fechaCorte}
                onChange={(event) => setFechaCorte(event.target.value)}
                className="mt-1 h-9 w-full rounded-xl border border-[#3A3A36] bg-[#1E1F1C] px-3 text-sm text-[#F5F5F5] outline-none transition focus:border-[#D7FF4F]/60"
              />
            </label>

            {error ? (
              <p className="mt-3 rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2.5 text-sm text-red-100">{error}</p>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={isSubmitting}
                className="rounded-full border border-[#3A3A36] px-4 py-2 text-sm font-medium text-[#CFCFCB] transition hover:text-[#F5F5F5] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-4 py-2 text-sm font-semibold text-[#10110E] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? "Cerrando..." : "Cerrar periodo"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError("");
          setNotice("");
          setFechaCorte(fechaFin);
          setIsOpen(true);
        }}
        className="inline-flex rounded-full border border-amber-300/30 px-2.5 py-1.5 text-xs font-semibold text-amber-100 transition hover:border-amber-200 hover:text-amber-50"
      >
        Cerrar hasta fecha
      </button>
      {notice ? <span className="text-xs font-medium text-[#D7FF4F]">{notice}</span> : null}
      {modal}
    </>
  );
}
