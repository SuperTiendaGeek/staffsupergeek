"use client";

// Punto 10d: "Accesorios incluidos" de la unidad (cargador, adaptadores, USB
// Wi-Fi…). Se llena en la inspección; el anuncio lo usa tal cual.

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { accesoriosRapidos, escribirAccesorios, leerAccesorios } from "@/lib/shipping-v2/publicaciones";

export function AccesoriosIncluidos({
  valor,
  categoria,
  deshabilitado,
  onGuardar,
}: {
  /** Texto del campo en Airtable. */
  valor?: string | null;
  categoria?: string | null;
  deshabilitado?: boolean;
  onGuardar: (texto: string) => void | Promise<unknown>;
}) {
  const [lista, setLista] = useState<string[] | null>(() => leerAccesorios(valor));
  const [nuevo, setNuevo] = useState("");

  useEffect(() => { setLista(leerAccesorios(valor)); }, [valor]);

  function guardar(siguiente: string[] | null) {
    setLista(siguiente);
    void onGuardar(escribirAccesorios(siguiente));
  }

  function agregar(texto: string) {
    const limpio = texto.trim();
    if (!limpio) return;
    const actual = lista ?? [];
    if (actual.some((a) => a.toLowerCase() === limpio.toLowerCase())) return;
    guardar([...actual, limpio]);
  }

  const sinAccesorios = lista !== null && lista.length === 0;
  const rapidos = accesoriosRapidos(categoria).filter((r) => !(lista ?? []).some((a) => a.toLowerCase() === r.toLowerCase()));

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-[#B4B5AC]">Accesorios incluidos</h3>
        {lista === null ? <span className="text-[11.5px] text-[#F4C95B]">sin revisar</span> : null}
        <label className="ml-auto flex items-center gap-1.5 text-[12.5px] text-[#C9CAC1]">
          <input
            type="checkbox"
            checked={sinAccesorios}
            disabled={deshabilitado}
            onChange={(e) => guardar(e.target.checked ? [] : null)}
            className="h-[15px] w-[15px] accent-[#D7FF4F]"
          />
          Sin accesorios
        </label>
      </div>
      {!sinAccesorios ? (
        <>
          <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-[#3A3A36] bg-[#141510] px-2 py-1.5">
            {(lista ?? []).map((a) => (
              <span key={a} className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[#2A2B26] px-2 text-[12.5px] text-[#F5F5F5]">
                {a}
                <button
                  type="button"
                  disabled={deshabilitado}
                  onClick={() => { const resto = (lista ?? []).filter((x) => x !== a); guardar(resto.length ? resto : null); }}
                  aria-label={`Quitar ${a}`}
                  className="text-[#8F908A] hover:text-[#F5F5F5]"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </span>
            ))}
            <input
              value={nuevo}
              disabled={deshabilitado}
              onChange={(e) => setNuevo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); agregar(nuevo); setNuevo(""); }
              }}
              onBlur={() => { if (nuevo.trim()) { agregar(nuevo); setNuevo(""); } }}
              placeholder="Escribir otro y Enter"
              aria-label="Agregar accesorio"
              className="h-7 min-w-[180px] flex-1 bg-transparent text-[12.5px] text-[#F5F5F5] outline-none"
            />
          </div>
          {rapidos.length ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {rapidos.map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={deshabilitado}
                  onClick={() => agregar(r)}
                  className="h-7 rounded-md border border-[#3A3A36] bg-[#1A1B17] px-2 text-[12px] text-[#C9CAC1] transition hover:border-[#A8C93B] disabled:opacity-50"
                >
                  + {r}
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
