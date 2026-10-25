"use client";

import { ArrowLeft } from "lucide-react";

/** "← Volver" a la pantalla de antes (o a Facturación si se abrió suelta). */
export function BotonVolver({ respaldo = "/facturacion" }: { respaldo?: string }) {
  return (
    <button
      type="button"
      onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.href = respaldo; }}
      aria-label="Volver"
      title="Volver"
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#3A3B35] text-[#C9CAC1] hover:border-[#D7FF4F]/50 hover:text-[#EDEDE7]"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
