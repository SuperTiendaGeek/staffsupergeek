// Evidencias de novedades: qué archivos se aceptan y cómo se muestran.
//
// Hasta ahora la "evidencia" de una novedad era un campo URL que nadie llenó
// nunca: el técnico que encuentra una laptop con la bisagra rota tiene la foto
// en el celular, no en un servidor con dirección pública. Por eso este módulo
// define la subida real de archivos — fotos y videos cortos — y la
// clasificación que necesita la pantalla para mostrarlos como imagen o como
// video en lugar de un enlace de texto.
//
// Es un módulo puro a propósito: no toca Airtable ni React, así las reglas se
// pueden probar solas y el endpoint y el navegador validan EXACTAMENTE lo
// mismo. Si divergieran, el usuario elegiría un archivo que el servidor
// rechaza después de esperar la subida completa.

import type { ShippingV2Attachment } from "@/types/shipping-v2";

// ─── El límite que manda: Airtable ──────────────────────────────────────────
//
// La API de adjuntos de Airtable (content.airtable.com/.../uploadAttachment)
// acepta hasta 5 MB por archivo. No es negociable desde aquí: por encima de
// eso la subida falla y la evidencia se pierde.
//
// Se deja margen bajo los 5 MB porque el archivo viaja codificado en base64
// (~33 % más pesado) y no está documentado si el tope se mide sobre el archivo
// o sobre el cuerpo de la petición. Preferimos rechazar en el navegador, con
// un mensaje claro, antes que fallar después de subir.

export const LIMITE_SUBIDA_AIRTABLE_BYTES = Math.round(3.5 * 1024 * 1024);

// Lo que el usuario puede ELEGIR. Las fotos se comprimen en el navegador antes
// de subir (una foto de 12 MB del celular queda en ~1 MB), así que se admite
// un original grande; el tope de 40 MB solo evita que el navegador se quede
// sin memoria intentando procesar algo absurdo.
export const MAX_FOTO_ORIGINAL_BYTES = 40 * 1024 * 1024;

// El video NO se puede comprimir en el navegador de forma razonable, así que
// aquí el tope se aplica tal cual: un clip de ~10 a 20 segundos grabado con el
// celular. Además de Airtable manda otro límite: en Vercel el cuerpo de una
// función serverless no puede pasar de 4.5 MB, y ahí entra también el sobre
// multipart de la petición. Por eso el número queda en 3.5 y no en 5.
export const MAX_VIDEO_EVIDENCIA_BYTES = LIMITE_SUBIDA_AIRTABLE_BYTES;

export const MAX_EVIDENCIAS_POR_NOVEDAD = 8;

export const TIPOS_FOTO_EVIDENCIA = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  // El iPhone manda HEIC cuando el usuario elige una foto ya guardada (al
  // tomarla en el momento desde el navegador suele convertirla a JPEG). Se
  // acepta porque Safari sí sabe decodificarla para comprimirla a JPEG; lo
  // que el navegador NO sabe es dibujarla en un <img>, por eso
  // `esFotoPrevisualizable` la deja fuera.
  "image/heic",
  "image/heif",
] as const;

export const TIPOS_VIDEO_EVIDENCIA = [
  "video/mp4",
  "video/webm",
  // .mov del iPhone. Lo reproduce Safari y Chrome en Mac; en Windows puede
  // no verse en línea, pero el archivo queda guardado y se puede descargar.
  "video/quicktime",
] as const;

// Lo que se le pasa al `accept` del <input type="file">, para que el
// selector del celular ya filtre y el usuario no elija un PDF.
export const ACCEPT_EVIDENCIAS = [...TIPOS_FOTO_EVIDENCIA, ...TIPOS_VIDEO_EVIDENCIA].join(",");

const FOTOS = new Set<string>(TIPOS_FOTO_EVIDENCIA);
const VIDEOS = new Set<string>(TIPOS_VIDEO_EVIDENCIA);
// Los que el navegador dibuja de verdad en un <img>.
const FOTOS_PREVISUALIZABLES = new Set<string>(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export type ClaseEvidencia = "foto" | "video" | "archivo";

function normalizarTipo(valor?: string | null): string {
  return (valor || "").trim().toLowerCase();
}

/**
 * Deduce el tipo por la extensión cuando Airtable o el navegador no mandan
 * `type`. Pasa más seguido de lo que parece: algunos Android suben con
 * `application/octet-stream`.
 */
function tipoPorExtension(filename?: string | null): string {
  const nombre = (filename || "").trim().toLowerCase();
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
    case "gif":
      return "image/gif";
    case "heic":
      return "image/heic";
    case "heif":
      return "image/heif";
    case "mp4":
    case "m4v":
      return "video/mp4";
    case "webm":
      return "video/webm";
    case "mov":
      return "video/quicktime";
    default:
      return "";
  }
}

export function resolverTipoEvidencia(input: { type?: string | null; filename?: string | null }): string {
  const tipo = normalizarTipo(input.type);
  if (tipo && tipo !== "application/octet-stream") return tipo;
  return tipoPorExtension(input.filename);
}

export function clasificarEvidencia(input: { type?: string | null; filename?: string | null }): ClaseEvidencia {
  const tipo = resolverTipoEvidencia(input);
  if (VIDEOS.has(tipo)) return "video";
  if (FOTOS.has(tipo)) return "foto";
  return "archivo";
}

/** ¿El navegador puede dibujarla en un <img>? HEIC no. */
export function esFotoPrevisualizable(input: { type?: string | null; filename?: string | null }): boolean {
  return FOTOS_PREVISUALIZABLES.has(resolverTipoEvidencia(input));
}

/**
 * La mejor URL para mostrar una miniatura sin descargar el original.
 * Airtable genera miniaturas solo para imágenes; para video no hay poster, así
 * que devuelve cadena vacía y la tarjeta dibuja su propio marco con ▶.
 */
export function urlMiniaturaEvidencia(evidencia: ShippingV2Attachment): string {
  if (!esFotoPrevisualizable(evidencia)) return "";
  return evidencia.thumbnailUrl || evidencia.url || "";
}

export function etiquetaEvidencia(evidencia: ShippingV2Attachment, indice: number): string {
  const nombre = (evidencia.filename || "").trim();
  if (nombre) return nombre;
  const clase = clasificarEvidencia(evidencia);
  if (clase === "video") return `Video ${indice + 1}`;
  if (clase === "foto") return `Foto ${indice + 1}`;
  return `Evidencia ${indice + 1}`;
}

// ─── Validación ─────────────────────────────────────────────────────────────

export type ArchivoEvidencia = {
  name?: string | null;
  type?: string | null;
  size: number;
};

export type ResultadoValidacion = { ok: true } | { ok: false; motivo: string };

function formatoMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

function validarCupo(cantidad: number, yaSubidas: number): ResultadoValidacion {
  const previas = Math.max(0, yaSubidas);
  if (previas + cantidad > MAX_EVIDENCIAS_POR_NOVEDAD) {
    const libres = Math.max(0, MAX_EVIDENCIAS_POR_NOVEDAD - previas);
    return {
      ok: false,
      motivo: libres === 0
        ? `La novedad ya tiene ${MAX_EVIDENCIAS_POR_NOVEDAD} evidencias. Elimina alguna para agregar otra.`
        : `Solo caben ${libres} evidencia(s) más en esta novedad.`,
    };
  }
  return { ok: true };
}

/**
 * Valida lo que el usuario acaba de ELEGIR, antes de comprimir.
 *
 * Las fotos pasan aunque pesen mucho, porque enseguida se reducen en el
 * navegador; el video se mide contra el tope real de Airtable porque no hay
 * forma de achicarlo aquí.
 */
export function validarSeleccionEvidencias(
  archivos: ArchivoEvidencia[],
  opciones: { yaSubidas?: number } = {}
): ResultadoValidacion {
  if (!archivos.length) {
    return { ok: false, motivo: "Selecciona al menos una foto o video." };
  }

  const cupo = validarCupo(archivos.length, opciones.yaSubidas ?? 0);
  if (!cupo.ok) return cupo;

  for (const archivo of archivos) {
    if (archivo.size <= 0) {
      return { ok: false, motivo: `"${archivo.name || "archivo"}" está vacío.` };
    }

    const clase = clasificarEvidencia({ type: archivo.type, filename: archivo.name });

    if (clase === "archivo") {
      return {
        ok: false,
        motivo: "Solo se aceptan fotos (JPG, PNG, WebP, GIF, HEIC) y videos cortos (MP4, WebM, MOV).",
      };
    }

    if (clase === "video" && archivo.size > MAX_VIDEO_EVIDENCIA_BYTES) {
      return {
        ok: false,
        motivo: `El video "${archivo.name || "sin nombre"}" pesa ${formatoMb(archivo.size)} y el máximo es ${formatoMb(MAX_VIDEO_EVIDENCIA_BYTES)}. Graba un clip más corto (unos 15 a 25 segundos).`,
      };
    }

    if (clase === "foto" && archivo.size > MAX_FOTO_ORIGINAL_BYTES) {
      return {
        ok: false,
        motivo: `La foto "${archivo.name || "sin nombre"}" pesa ${formatoMb(archivo.size)}, demasiado incluso para comprimirla.`,
      };
    }
  }

  return { ok: true };
}

/**
 * Valida lo que REALMENTE se va a subir a Airtable: fotos ya comprimidas y
 * videos tal cual. Aquí el único tope es el de Airtable, y lo aplica el
 * servidor sin confiar en que el navegador haya comprimido nada.
 */
export function validarEvidencias(
  archivos: ArchivoEvidencia[],
  opciones: { yaSubidas?: number } = {}
): ResultadoValidacion {
  if (!archivos.length) {
    return { ok: false, motivo: "Selecciona al menos una foto o video." };
  }

  const cupo = validarCupo(archivos.length, opciones.yaSubidas ?? 0);
  if (!cupo.ok) return cupo;

  for (const archivo of archivos) {
    if (archivo.size <= 0) {
      return { ok: false, motivo: `"${archivo.name || "archivo"}" está vacío.` };
    }

    const clase = clasificarEvidencia({ type: archivo.type, filename: archivo.name });
    if (clase === "archivo") {
      return {
        ok: false,
        motivo: "Solo se aceptan fotos (JPG, PNG, WebP, GIF, HEIC) y videos cortos (MP4, WebM, MOV).",
      };
    }

    if (archivo.size > LIMITE_SUBIDA_AIRTABLE_BYTES) {
      return {
        ok: false,
        motivo: clase === "video"
          ? `El video "${archivo.name || "sin nombre"}" pesa ${formatoMb(archivo.size)} y el máximo que acepta Airtable es ${formatoMb(LIMITE_SUBIDA_AIRTABLE_BYTES)}. Graba un clip más corto.`
          : `"${archivo.name || "la foto"}" pesa ${formatoMb(archivo.size)} y no se pudo reducir por debajo de ${formatoMb(LIMITE_SUBIDA_AIRTABLE_BYTES)}. Intenta con otra foto.`,
      };
    }
  }

  return { ok: true };
}
