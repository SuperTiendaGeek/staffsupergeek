"use client";

// Piezas chicas que comparten el tablero y la Lista de órdenes (rediseño R8).

import type { NivelTarjeta } from "@/lib/tecnicos/orden/tablero";

export type Responsables = Record<string, { nombre: string; iniciales: string }>;

export const PUNTO_NIVEL: Record<NivelTarjeta, string> = {
  atencion: "bg-[#FF7A70]",
  porVencer: "bg-[#FFB547]",
  alDia: "bg-[#6E6E68]",
};

export const TEXTO_NIVEL: Record<NivelTarjeta, string> = {
  atencion: "text-[#FF9C94]",
  porVencer: "text-[#FFB547]",
  alDia: "text-[#B5B5AE]",
};

export const BORDE_NIVEL: Record<NivelTarjeta, string> = {
  atencion: "border-l-[#FF7A70]",
  porVencer: "border-l-[#FFB547]",
  alDia: "border-l-transparent",
};

/** Iniciales del responsable; borde punteado si no hay. */
export function Iniciales({ id, responsables, chico = false }: { id: string | null; responsables: Responsables; chico?: boolean }) {
  const r = id ? responsables[id] : null;
  const tam = chico ? "h-5 w-5 text-[9px]" : "h-[22px] w-[22px] text-[9px]";
  if (!r) {
    return <span title="Sin responsable" className={`inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-[#6E6E68] font-extrabold text-[#B5B5AE] ${tam}`}>—</span>;
  }
  return <span title={r.nombre} className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[#2C2D29] font-extrabold text-[#D6D6D0] ${tam}`}>{r.iniciales}</span>;
}

/** Basurero rojo de las órdenes en reciclaje. */
export function IconoReciclaje({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={`shrink-0 ${className}`}>
      <path d="M2.5 4h11M6.5 4V2.6h3V4M4 4l.7 9.4h6.6L12 4M6.6 6.6v4.6M9.4 6.6v4.6" fill="none" stroke="#FF7A70" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconoEntregada({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={`shrink-0 ${className}`}>
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="#8E8E87" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconoLupa() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-[#A7A7A7]" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="9" r="5" />
      <line x1="13.5" y1="13.5" x2="18" y2="18" strokeLinecap="round" />
    </svg>
  );
}

/** Chips de estado de la Lista (mismos colores que la orden). */
export const CHIP_ESTADO: Record<string, string> = {
  "Pendiente": "bg-[#2C2D29] text-[#D6D6D0]",
  "Esperando Respuesta": "bg-[rgba(255,181,71,.13)] text-[#FFB547]",
  "En Proceso": "bg-[rgba(120,183,255,.14)] text-[#9CCBFF]",
  "Completado": "bg-[rgba(86,227,164,.13)] text-[#56E3A4]",
  "Finalizado Entregado": "bg-[#2C2D29] text-[#C9C9C2]",
  "Enviado a Reciclaje": "bg-[rgba(255,122,112,.14)] text-[#FF9C94]",
};

/** Chip de repuestos bajo pedido (Compras): «Repuestos 2/3», «1 sin comprar». */
export const CHIP_REPUESTOS: Record<string, string> = {
  exito: "border-[#56e3a4]/40 text-[#56e3a4]",
  aviso: "border-[#f0c75e]/45 text-[#f0c75e]",
  peligro: "border-[#ff5a4f]/45 text-[#ff5a4f]",
  info: "border-[#78b7ff]/40 text-[#78b7ff]",
  neutro: "border-[#3A3A36] text-[#A7A7A7]",
};
