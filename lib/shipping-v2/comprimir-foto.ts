// Compresión de fotos en el navegador, antes de subirlas a Airtable.
//
// Airtable no acepta adjuntos de más de 5 MB, y una foto de un celular moderno
// pesa entre 4 y 12 MB. Sin esto, el técnico elige la foto de la bisagra rota,
// espera la subida y recibe un error — justo en el momento en que tiene el
// artículo en la mano y menos ganas tiene de pelear con el sistema.
//
// Para lo que sirve una evidencia (ver un golpe, un serial, una pantalla con
// líneas) no hace falta el original de 12 megapíxeles: 1600 px de lado largo
// en JPEG de calidad alta se ve igual y pesa unas diez veces menos.
//
// Solo corre en el navegador (usa canvas). No se importa desde código de
// servidor.

import {
  LIMITE_SUBIDA_AIRTABLE_BYTES,
  clasificarEvidencia,
  resolverTipoEvidencia,
} from "@/lib/shipping-v2/evidencias";

const LADO_MAXIMO = 1600;
const CALIDAD_INICIAL = 0.82;
const CALIDAD_MINIMA = 0.5;

export type ResultadoCompresion = {
  archivo: File;
  comprimido: boolean;
  bytesOriginales: number;
};

function cargarImagen(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const imagen = new Image();
    imagen.onload = () => {
      URL.revokeObjectURL(url);
      resolve(imagen);
    };
    imagen.onerror = () => {
      URL.revokeObjectURL(url);
      // Pasa con HEIC en navegadores que no son Safari: el archivo es válido
      // pero este navegador no lo sabe decodificar.
      reject(new Error("El navegador no pudo leer esta imagen."));
    };
    imagen.src = url;
  });
}

function canvasABlob(canvas: HTMLCanvasElement, calidad: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", calidad);
  });
}

function nombreJpeg(original: string): string {
  const limpio = (original || "foto").trim();
  const punto = limpio.lastIndexOf(".");
  const base = punto > 0 ? limpio.slice(0, punto) : limpio;
  return `${base || "foto"}.jpg`;
}

/**
 * Reduce una foto hasta que quepa en `limiteBytes`.
 *
 * Nunca lanza: si algo falla (formato que el navegador no decodifica, canvas
 * bloqueado) devuelve el archivo ORIGINAL marcado como no comprimido. Quien
 * llama decide qué hacer — normalmente dejar que la validación lo rechace con
 * un mensaje claro, que es mejor que romper el flujo entero.
 */
export async function comprimirFotoEvidencia(file: File, limiteBytes: number): Promise<ResultadoCompresion> {
  const original: ResultadoCompresion = { archivo: file, comprimido: false, bytesOriginales: file.size };

  if (typeof document === "undefined") return original;

  // Si ya cabe, no se toca. Recomprimir sin necesidad degrada la evidencia:
  // una captura PNG del número de serie se volvería JPEG con pérdida, y un
  // GIF animado perdería todo menos el primer cuadro.
  if (file.size <= limiteBytes) return original;
  if (resolverTipoEvidencia({ type: file.type, filename: file.name }) === "image/gif") return original;

  try {
    const imagen = await cargarImagen(file);
    const ladoMayor = Math.max(imagen.naturalWidth, imagen.naturalHeight);
    if (!ladoMayor) return original;

    const escala = Math.min(1, LADO_MAXIMO / ladoMayor);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(imagen.naturalWidth * escala));
    canvas.height = Math.max(1, Math.round(imagen.naturalHeight * escala));

    const contexto = canvas.getContext("2d");
    if (!contexto) return original;
    contexto.drawImage(imagen, 0, 0, canvas.width, canvas.height);

    // Se baja la calidad por pasos hasta entrar en el límite. Tres intentos
    // bastan para cualquier foto de celular; más allá la imagen se degrada
    // tanto que deja de servir como evidencia.
    let calidad = CALIDAD_INICIAL;
    let blob = await canvasABlob(canvas, calidad);
    while (blob && blob.size > limiteBytes && calidad > CALIDAD_MINIMA) {
      calidad = Math.max(CALIDAD_MINIMA, calidad - 0.15);
      blob = await canvasABlob(canvas, calidad);
    }

    if (!blob) return original;

    // Si el original ya era más liviano que el resultado (una captura PNG
    // pequeña, por ejemplo), no tiene sentido cambiarlo.
    if (blob.size >= file.size && file.size <= limiteBytes) return original;

    return {
      archivo: new File([blob], nombreJpeg(file.name), { type: "image/jpeg", lastModified: Date.now() }),
      comprimido: true,
      bytesOriginales: file.size,
    };
  } catch {
    return original;
  }
}

/**
 * Prepara un lote elegido por el usuario para subirlo: comprime las fotos y
 * deja los videos tal cual (no hay forma razonable de recodificar video en el
 * navegador). Devuelve siempre la misma cantidad de archivos, en el mismo
 * orden, para que quien llama pueda validarlos antes de enviarlos.
 */
export async function prepararEvidenciasParaSubir(archivos: File[]): Promise<File[]> {
  const preparados: File[] = [];
  for (const archivo of archivos) {
    const clase = clasificarEvidencia({ type: archivo.type, filename: archivo.name });
    if (clase !== "foto") {
      preparados.push(archivo);
      continue;
    }
    const resultado = await comprimirFotoEvidencia(archivo, LIMITE_SUBIDA_AIRTABLE_BYTES);
    preparados.push(resultado.archivo);
  }
  return preparados;
}
