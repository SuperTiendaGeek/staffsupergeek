"use client";

import type { Paso } from "@/lib/tecnicos/orden/etapas";

// Barra de etapas de la orden (rediseño R1, tablero 1): dónde está la orden y
// qué falta, en una línea. Hecho = ✓ verde · ahora = punto lima · pendiente = aro.

function Punto({ estado }: { estado: Paso["estado"] }) {
  if (estado === "hecho") {
    return (
      <span className="inline-flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-[rgba(86,227,164,.16)]">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5.2l2 2 4-4.2" fill="none" stroke="#56E3A4" strokeWidth="1.6" /></svg>
      </span>
    );
  }
  if (estado === "ahora") return <span className="h-[18px] w-[18px] flex-none rounded-full bg-[#D7FF4F]" />;
  return <span className="h-[18px] w-[18px] flex-none rounded-full border-[1.5px] border-[#4A4A45]" />;
}

export function OrdenEtapas({ pasos, queSigue }: { pasos: Paso[]; queSigue: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-[18px] gap-y-2 border-t border-[#2C2D29] pt-2.5">
      <ol aria-label="Etapas de la orden" className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {pasos.map((p, i) => (
          <li key={p.nombre} className="flex items-center gap-2" aria-current={p.estado === "ahora" ? "step" : undefined}>
            {i > 0 && <span aria-hidden="true" className="text-[#6E6E68]">—</span>}
            <span className={`flex items-center gap-[7px] whitespace-nowrap text-xs ${p.estado === "ahora" ? "font-bold text-[#F0F0EC]" : p.estado === "hecho" ? "text-[#F0F0EC]" : "text-[#B5B5AE]"}`}>
              <Punto estado={p.estado} />
              {p.nombre}
              {p.detalle && <span className="font-medium text-[#B5B5AE]">{p.detalle}</span>}
            </span>
          </li>
        ))}
      </ol>
      <span key={queSigue} className="ml-auto text-xs text-[#F0F0EC] animate-[sg-entrada_200ms_ease-out]">
        <span className="text-[11px] font-semibold text-[#B5B5AE]">Qué sigue </span>{queSigue}
      </span>
    </div>
  );
}
