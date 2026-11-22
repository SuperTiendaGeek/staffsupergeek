"use client";

// Piezas chicas del Asistente y del Manual técnico (punto 11B). Colores fijos
// del lienzo aprobado: el panel se abre en un portal, fuera del tema de
// Técnicos, así que no puede usar las variables --sg-*.

import type { ReactNode } from "react";

export const C = {
  fondo: "#1E1F1C",
  hundido: "#151613",
  caja: "#191A17",
  borde: "#3A3A36",
  linea: "#2C2D29",
  texto: "#F0F0EC",
  suave: "#B5B5AE",
  lima: "#D7FF4F",
  ambar: "#FFB547",
  verde: "#56E3A4",
  azul: "#78B7FF",
  rojo: "#FF7A70",
} as const;

export const btn = "inline-flex h-7 items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] border border-[#3A3A36] bg-[#252622] px-2.5 text-xs font-semibold text-[#F0F0EC] transition hover:border-[#D7FF4F]/60 disabled:cursor-not-allowed disabled:opacity-50";
export const btnMain = "inline-flex h-7 items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] border border-[#D7FF4F] bg-[#D7FF4F] px-2.5 text-xs font-bold text-[#151613] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50";
export const cap = "text-[11px] font-semibold text-[#B5B5AE]";
export const entradaBase = "rounded-lg border border-[#3A3A36] bg-[#151613] px-2.5 text-[13px] text-[#F0F0EC] placeholder:text-[#8A8A84] focus:border-[#D7FF4F] focus:outline-none";
export const entrada = `w-full ${entradaBase}`;

export function Destello({ className = "", size = 14 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className={className}>
      <path d="M8 1.5l1.6 4.4 4.4 1.6-4.4 1.6L8 13.5l-1.6-4.4L2 7.5l4.4-1.6z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

export function IconoHecho() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" role="img" aria-label="Hecho">
      <circle cx="8" cy="8" r="7" fill="rgba(86,227,164,.16)" />
      <path d="M5 8.2l2 2 4-4.2" fill="none" stroke="#56E3A4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconoFalta() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" role="img" aria-label="Falta">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="#FFB547" strokeWidth="1.8" />
    </svg>
  );
}

export function IconoAviso() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" className="mt-0.5 flex-none">
      <path d="M8 2l6.5 11.5h-13z" fill="none" stroke="#FFB547" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 6.5v3.2M8 11.6v.1" stroke="#FFB547" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function IconoEnviar() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M2 7h9M7.5 3.5L11 7l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconoLibro({ color = "#D7FF4F" }: { color?: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 2.5h7.5l2.5 2.5v8.5H3z M5.5 7.5h5M5.5 10h5" fill="none" stroke={color} strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

const CHIP_ESTADO: Record<string, string> = {
  Verificada: "text-[#56E3A4] bg-[rgba(86,227,164,.12)]",
  Probada: "text-[#FFB547] bg-[rgba(255,181,71,.12)]",
  "Para revisar": "text-[#FF7A70] bg-[rgba(255,90,79,.12)]",
  Archivada: "text-[#B5B5AE] bg-[#2C2D29]",
};
/** «Probada» se lee «Por verificar» para el personal. */
export const ETIQUETA_ESTADO: Record<string, string> = {
  Verificada: "Verificada", Probada: "Por verificar", "Para revisar": "Para revisar", Archivada: "Archivada",
};

export function ChipEstado({ estado }: { estado: string }) {
  return (
    <span className={`inline-flex h-5 items-center whitespace-nowrap rounded-full px-[7px] text-[10px] font-bold ${CHIP_ESTADO[estado] ?? CHIP_ESTADO.Archivada}`}>
      {ETIQUETA_ESTADO[estado] ?? estado}
    </span>
  );
}

export function Chip({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex h-[22px] max-w-full items-center truncate rounded-full border border-[#3A3A36] bg-[#252622] px-2 text-[11px] font-semibold text-[#F0F0EC] ${className}`}>
      {children}
    </span>
  );
}

export async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

/** sessionStorage / localStorage con try/catch (puede fallar en modo privado). */
export function leerGuardado<T>(donde: "session" | "local", clave: string): T | null {
  try {
    const s = (donde === "session" ? window.sessionStorage : window.localStorage).getItem(clave);
    return s ? (JSON.parse(s) as T) : null;
  } catch {
    return null;
  }
}
export function guardar(donde: "session" | "local", clave: string, valor: unknown): void {
  try {
    const st = donde === "session" ? window.sessionStorage : window.localStorage;
    if (valor === null) st.removeItem(clave);
    else st.setItem(clave, JSON.stringify(valor));
  } catch { /* sin almacenamiento: no pasa nada */ }
}

/** Reduce una foto a JPEG de 1280 px como máximo y devuelve el base64 sin prefijo. */
export async function fotoParaIA(archivo: File): Promise<{ tipo: "image/jpeg"; datos: string }> {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => mal(new Error("No se pudo leer la foto."));
      i.src = url;
    });
    const escala = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(img.naturalWidth * escala);
    lienzo.height = Math.round(img.naturalHeight * escala);
    lienzo.getContext("2d")?.drawImage(img, 0, 0, lienzo.width, lienzo.height);
    const datos = lienzo.toDataURL("image/jpeg", 0.8).replace(/^data:[^,]+,/, "");
    return { tipo: "image/jpeg", datos };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const horaCorta = (iso: string) => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit", hour12: false });
};
