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
    <div className="space-y-3 rounded-lg border border-white/10 bg-white/[0.035] p-4 shadow-2xl shadow-black/20 backdrop-blur">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Rol de pago</h2>
          <p className="mt-1 text-sm text-zinc-400">Genera el PDF del periodo y guárdalo en Airtable.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasRol ? (
            <a href={`/api/horarios/roles/${periodoId}`} className="rounded-md border border-white/10 px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-geek-lime/50 hover:text-geek-lime">
              Ver rol de pago
            </a>
          ) : null}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isSubmitting}
            className="rounded-md bg-geek-lime px-4 py-2.5 text-sm font-semibold text-geek-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Generando..." : hasRol ? "Regenerar rol de pago" : "Generar rol de pago"}
          </button>
        </div>
      </div>
      {notice ? (
        <p className="rounded-md border border-geek-lime/30 bg-geek-lime/10 px-4 py-3 text-sm text-geek-lime">{notice}</p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-100">{error}</p>
      ) : null}
    </div>
  );
}
