// Fotos de un item: qué se acepta subir y hasta cuánto.
//
// Las reglas viven aquí y no en el endpoint porque el navegador y el servidor
// tienen que validar EXACTAMENTE lo mismo. Si divergieran, el empleado elegiría
// una foto que el servidor rechaza después de esperar toda la subida — con el
// artículo en la mano y menos ganas de pelear con el sistema.
//
// Es el mismo problema que ya se resolvió para las evidencias de novedades, y
// se reutilizan sus límites a propósito: los impone Airtable y Vercel, no
// nosotros, así que son los mismos en las dos pantallas.
//
// Módulo puro: sin red, sin React, sin Airtable.

import { LIMITE_SUBIDA_AIRTABLE_BYTES, MAX_FOTO_ORIGINAL_BYTES } from "@/lib/shipping-v2/evidencias";

/** Lo que de verdad se sube, ya comprimido. Manda Airtable (5 MB) y Vercel (4.5 MB de cuerpo). */
export const LIMITE_FOTO_ITEM_BYTES = LIMITE_SUBIDA_AIRTABLE_BYTES;

/** Lo que el usuario puede ELEGIR: las fotos grandes se reducen antes de subir. */
export const MAX_FOTO_ITEM_ORIGINAL_BYTES = MAX_FOTO_ORIGINAL_BYTES;

export const MAX_FOTOS_POR_ITEM = 10;

// Sin HEIC ni GIF, a diferencia de las evidencias: estas fotos son el catálogo
// del artículo, se publican y se imprimen, y conviene que sean formatos que
// todo navegador dibuje sin convertir nada.
export const TIPOS_FOTO_ITEM = ["image/jpeg", "image/png", "image/webp"] as const;

export const ACCEPT_FOTOS_ITEM = TIPOS_FOTO_ITEM.join(",");

const PERMITIDOS = new Set<string>(TIPOS_FOTO_ITEM);

export type ArchivoFotoItem = { name?: string | null; type?: string | null; size: number };
export type ResultadoValidacionFoto = { ok: true } | { ok: false; motivo: string };

function formatoMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

function tipoDe(archivo: ArchivoFotoItem): string {
  const tipo = (archivo.type || "").trim().toLowerCase();
  if (tipo && tipo !== "application/octet-stream") return tipo;
  // Algunos Android suben con `application/octet-stream`; la extensión decide.
  const nombre = (archivo.name || "").trim().toLowerCase();
  const punto = nombre.lastIndexOf(".");
  if (punto < 0) return "";
  switch (nombre.slice(punto + 1)) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    default:
      return "";
  }
}

export function esFotoItemValida(archivo: ArchivoFotoItem): boolean {
  return PERMITIDOS.has(tipoDe(archivo));
}

function validarCupo(cantidad: number, yaSubidas: number): ResultadoValidacionFoto {
  const previas = Math.max(0, yaSubidas);
  if (previas + cantidad > MAX_FOTOS_POR_ITEM) {
    const libres = Math.max(0, MAX_FOTOS_POR_ITEM - previas);
    return {
      ok: false,
      motivo: libres === 0
        ? `El item ya tiene ${MAX_FOTOS_POR_ITEM} fotos. Elimina alguna para agregar otra.`
        : `Solo caben ${libres} foto(s) más en este item.`,
    };
  }
  return { ok: true };
}

function validarComunes(archivos: ArchivoFotoItem[], yaSubidas: number): ResultadoValidacionFoto {
  if (!archivos.length) return { ok: false, motivo: "Selecciona al menos una foto." };

  const cupo = validarCupo(archivos.length, yaSubidas);
  if (!cupo.ok) return cupo;

  for (const archivo of archivos) {
    if (archivo.size <= 0) {
      return { ok: false, motivo: `"${archivo.name || "archivo"}" está vacío.` };
    }
    if (!esFotoItemValida(archivo)) {
      return { ok: false, motivo: `"${archivo.name || "archivo"}" no es una foto JPEG, PNG o WebP.` };
    }
  }
  return { ok: true };
}

/**
 * Valida lo que el usuario acaba de ELEGIR, antes de comprimir.
 *
 * Una foto grande pasa: enseguida se reduce en el navegador. El tope de 40 MB
 * solo evita que el navegador se quede sin memoria con algo absurdo.
 */
export function validarSeleccionFotosItem(
  archivos: ArchivoFotoItem[],
  opciones: { yaSubidas?: number } = {}
): ResultadoValidacionFoto {
  const comunes = validarComunes(archivos, opciones.yaSubidas ?? 0);
  if (!comunes.ok) return comunes;

  for (const archivo of archivos) {
    if (archivo.size > MAX_FOTO_ITEM_ORIGINAL_BYTES) {
      return {
        ok: false,
        motivo: `"${archivo.name || "archivo"}" pesa ${formatoMb(archivo.size)}. El máximo para elegir es ${formatoMb(MAX_FOTO_ITEM_ORIGINAL_BYTES)}.`,
      };
    }
  }
  return { ok: true };
}

/**
 * Valida lo que SE VA A SUBIR: ya comprimido, y también en el servidor.
 *
 * Acá el tope es el real de Airtable. Que el servidor use esta misma función es
 * lo que impide que alguien suba 10 MB llamando al endpoint directamente.
 */
export function validarFotosItem(
  archivos: ArchivoFotoItem[],
  opciones: { yaSubidas?: number } = {}
): ResultadoValidacionFoto {
  const comunes = validarComunes(archivos, opciones.yaSubidas ?? 0);
  if (!comunes.ok) return comunes;

  for (const archivo of archivos) {
    if (archivo.size > LIMITE_FOTO_ITEM_BYTES) {
      return {
        ok: false,
        motivo: `"${archivo.name || "archivo"}" pesa ${formatoMb(archivo.size)} y el máximo que acepta Airtable es ${formatoMb(LIMITE_FOTO_ITEM_BYTES)}.`,
      };
    }
  }
  return { ok: true };
}
