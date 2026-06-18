"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  periodoId: string;
  rolGenerado: boolean;
  rolPagoBlobPathname?: string;
};

type ApiResponse = {
  success?: boolean;
  error?: string;
};

export function RolPagoPeriodoClient({ periodoId, rolGenerado, rolPagoBlobPathname }: Props) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const hasRol = rolGenerado && Boolean(rolPagoBlobPathname);

  async function handleGenerate() {
    setError("");
    setNotice("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/horarios/admin/periodos/${periodoId}/rol-pago`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const payload = (await response.json()) as ApiResponse;

      if (!response.ok || !payload.success) {
        setError(payload.error || "No se pudo generar el rol de pago");
        return;
      }

      setNotice(hasRol ? "Rol de pago regenerado correctamente" : "Rol de pago generado correctamente");
      router.refresh();
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-[1rem] border border-[#3A3A36] bg-[#252622]">
      <div className="border-b border-[#3A3A36] bg-[#30312D] px-4 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#8F908A]">Rol de pago</p>
            <p className="mt-0.5 text-xs text-[#A7A7A7]">Genera el PDF del periodo y guárdalo en Airtable.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {hasRol ? (
              <a
                href={`/api/horarios/roles/${periodoId}`}
                className="inline-flex rounded-full border border-[#3A3A36] px-3 py-1.5 text-sm font-medium text-[#CFCFCB] transition hover:border-[#D7FF4F]/50 hover:text-[#D7FF4F]"
              >
                Ver rol de pago
              </a>
            ) : null}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isSubmitting}
              className="rounded-full border border-[#D7FF4F] bg-[#D7FF4F] px-3 py-1.5 text-sm font-semibold text-[#10110E] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Generando..." : hasRol ? "Regenerar rol de pago" : "Generar rol de pago"}
            </button>
          </div>
        </div>
      </div>
      {notice || error ? (
        <div className="px-4 py-3">
          {notice ? (
            <p className="rounded-xl border border-[#D7FF4F]/30 bg-[#D7FF4F]/10 px-3 py-2.5 text-sm font-medium text-[#D7FF4F]">{notice}</p>
          ) : null}
          {error ? (
            <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2.5 text-sm text-red-100">{error}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
