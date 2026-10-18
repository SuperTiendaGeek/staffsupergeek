"use client";

// Punto 10b-4b (17-oct-2026): "¿Usar estos datos técnicos en otras unidades?"
// en la ficha de mostrador.

import { useState } from "react";
import type { ShippingV2UnidadHermana } from "@/types/shipping-v2";
import { normalizarSerie, serieCorta } from "@/lib/shipping-v2/unidades-serie";

export const ESTADOS_FUERA_DE_INVENTARIO = new Set(["vendido", "agotado", "dado de baja", "cancelado", "devuelto a proveedor"]);

export function textoNormal(valor?: string | null) {
  return String(valor ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** Cómo se nombra otra unidad en la lista: su serie abreviada o, sin serie, si ya llegó. */
function nombreCortoUnidad(u: ShippingV2UnidadHermana) {
  const serie = normalizarSerie(u.numeroSerie);
  return serie ? `S/N ${serieCorta(serie, 4)}` : u.recibido ? "Sin serie" : "Por llegar";
}

/**
 * Punto 10b-4b: "¿Usar estos datos técnicos en otras unidades?". El usuario
 * elige a cuáles; se proponen las que todavía no tienen ficha. Lo propio de la
 * unidad (batería, observación, color, detalle, precio) nunca se copia.
 */
export function UsarEnOtrasUnidades({ sku, unidades, ocupado, onCopiar }: {
  sku: string;
  unidades: ShippingV2UnidadHermana[];
  ocupado: boolean;
  onCopiar: (ids: string[]) => Promise<string[] | null>;
}) {
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set(unidades.filter((u) => !u.fichaGenerada).map((u) => u.id)));
  const [conFicha, setConFicha] = useState<Set<string>>(() => new Set(unidades.filter((u) => u.fichaGenerada).map((u) => u.id)));
  if (!unidades.length) return null;
  const elegidas = unidades.filter((u) => marcadas.has(u.id));
  return (
    <section className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-[#30312D] bg-[#151613] px-4 py-2.5 text-[12.5px]">
      <span className="font-semibold text-[#F5F5F5]" title="Batería, observación, color, detalle y precio no se copian.">¿Usar estos datos técnicos en otras unidades de {sku}?</span>
      {unidades.map((u) => (
        <label key={u.id} className="flex cursor-pointer items-center gap-1.5 text-[#E6E6E1]" title={`${u.estado}${conFicha.has(u.id) ? " · ya tiene ficha: se reemplaza" : ""}`}>
          <input type="checkbox" checked={marcadas.has(u.id)} onChange={(e) => setMarcadas((m) => { const n = new Set(m); if (e.target.checked) n.add(u.id); else n.delete(u.id); return n; })} className="h-3.5 w-3.5 accent-[#D7FF4F]" />
          <span className="font-mono">{nombreCortoUnidad(u)}</span>
          {conFicha.has(u.id) ? <span className="text-[11px] text-[#8F908A]">· con ficha</span> : null}
        </label>
      ))}
      <button type="button" disabled={ocupado || !elegidas.length}
        onClick={async () => {
          const copiadas = await onCopiar(elegidas.map((u) => u.id));
          if (copiadas) {
            setConFicha((c) => new Set([...c, ...elegidas.map((u) => u.id)]));
            setMarcadas(new Set());
          }
        }}
        className="ml-auto h-8 rounded-lg border border-[#D7FF4F]/55 bg-[#20211D] px-3 text-xs font-bold text-[#D7FF4F] disabled:opacity-50">
        {ocupado ? "Copiando…" : `Guardar y copiar a ${elegidas.length}`}
      </button>
    </section>
  );
}
