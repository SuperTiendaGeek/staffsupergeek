"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

// Menú flotante pequeño (rediseño R1): se abre bajo su botón, por encima de
// todo (las tarjetas recortan lo que se sale), y se cierra al tocar fuera,
// con Escape o al desplazar la página. Aparece con sg-entrada (140 ms).

export function Desplegable({ boton, children, ancho = 224, derecha = false }: {
  boton: (p: { ref: RefObject<HTMLButtonElement | null>; abierto: boolean; alternar: () => void }) => ReactNode;
  children: (cerrar: () => void) => ReactNode;
  ancho?: number;
  /** Alinea el menú con el borde derecho del botón. */
  derecha?: boolean;
}) {
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLButtonElement | null>(null);
  const abierto = pos !== null;

  useEffect(() => {
    if (!abierto) return;
    const cerrar = () => setPos(null);
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) cerrar(); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { cerrar(); ref.current?.focus(); } };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    window.addEventListener("resize", cerrar);
    window.addEventListener("scroll", cerrar, true);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla);
      window.removeEventListener("resize", cerrar);
      window.removeEventListener("scroll", cerrar, true);
    };
  }, [abierto]);

  function alternar() {
    if (abierto) { setPos(null); return; }
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(8, Math.min(derecha ? r.right - ancho : r.left, window.innerWidth - ancho - 8));
    setPos(r.bottom + 280 > window.innerHeight ? { bottom: window.innerHeight - r.top + 4, left } : { top: r.bottom + 4, left });
  }

  return (
    <div ref={caja} className="relative inline-flex">
      {boton({ ref, abierto, alternar })}
      {pos && (
        <div role="menu" style={{ position: "fixed", top: pos.top, bottom: pos.bottom, left: pos.left, width: ancho }}
          className="z-[60] max-h-[60vh] overflow-y-auto rounded-[10px] border border-[#3A3A36] bg-[#1E1F1C] p-1 shadow-2xl animate-[sg-entrada_140ms_ease-out]">
          {children(() => setPos(null))}
        </div>
      )}
    </div>
  );
}

export const OPCION_MENU =
  "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-semibold text-[#F0F0EC] transition hover:bg-[#2C2D29] disabled:opacity-50";
