// Subida de evidencias desde el navegador. Lo usan el modal de recepción y el
// visor de la pantalla de novedades, para que las dos se comporten igual.
//
// Sube UN archivo por petición a propósito. En Vercel el cuerpo de una función
// serverless está limitado a 4.5 MB: mandando el lote entero en un solo POST,
// cinco fotos de 1 MB darían un 413 que ni siquiera llega al handler, y el
// usuario vería un error genérico imposible de diagnosticar. Archivo por
// archivo, además, lo que sí subió queda guardado aunque otro falle.

import {
  LIMITE_SUBIDA_AIRTABLE_BYTES,
  validarEvidencias,
  validarSeleccionEvidencias,
} from "@/lib/shipping-v2/evidencias";
import { prepararEvidenciasParaSubir } from "@/lib/shipping-v2/comprimir-foto";

export type ResultadoSubida = {
  /** La novedad tal como quedó tras la última subida exitosa. */
  novedad: unknown | null;
  subidas: number;
  fallidos: string[];
  /** Mensaje listo para mostrar, o cadena vacía si salió todo bien. */
  aviso: string;
};

export class EvidenciasInvalidasError extends Error {}

/**
 * Valida, comprime y sube. Lanza `EvidenciasInvalidasError` solo si la
 * selección no sirve (formato, tamaño, cupo); un fallo de red de archivos
 * individuales se reporta en `fallidos`, no como excepción, porque lo que ya
 * subió es real y no hay que perderlo.
 */
export async function subirEvidenciasNovedad(
  novedadId: string,
  archivos: File[],
  opciones: { yaSubidas?: number } = {}
): Promise<ResultadoSubida> {
  const yaSubidas = opciones.yaSubidas ?? 0;

  const seleccion = validarSeleccionEvidencias(
    archivos.map((archivo) => ({ name: archivo.name, type: archivo.type, size: archivo.size })),
    { yaSubidas }
  );
  if (!seleccion.ok) throw new EvidenciasInvalidasError(seleccion.motivo);

  // Las fotos se reducen aquí: Airtable no acepta adjuntos de más de 5 MB y
  // una foto de celular pesa el doble o el triple.
  const preparados = await prepararEvidenciasParaSubir(archivos);

  const listos = validarEvidencias(
    preparados.map((archivo) => ({ name: archivo.name, type: archivo.type, size: archivo.size })),
    { yaSubidas }
  );
  if (!listos.ok) throw new EvidenciasInvalidasError(listos.motivo);

  let novedad: unknown | null = null;
  let subidas = 0;
  const fallidos: string[] = [];

  for (const archivo of preparados) {
    try {
      const formData = new FormData();
      formData.append("evidencias", archivo);
      const respuesta = await fetch(`/api/shipping-v2/novedades/${novedadId}/evidencias`, {
        method: "POST",
        body: formData,
      });

      // Un 413 de la plataforma no devuelve JSON: sin este caso el usuario
      // recibiría "Error inesperado" sin pista de qué pasó.
      if (respuesta.status === 413) {
        throw new Error(`"${archivo.name}" pesa demasiado para subirlo (máximo ${Math.round(LIMITE_SUBIDA_AIRTABLE_BYTES / (1024 * 1024) * 10) / 10} MB).`);
      }

      const payload = await respuesta.json().catch(() => ({} as Record<string, unknown>));
      if (!respuesta.ok || !payload.success) {
        throw new Error(String(payload.error || "No se pudo subir."));
      }

      novedad = payload.data ?? novedad;
      subidas += 1;
    } catch {
      fallidos.push(archivo.name);
    }
  }

  let aviso = "";
  if (fallidos.length && subidas) {
    aviso = `Se subieron ${subidas} de ${preparados.length}. No se pudieron subir: ${fallidos.join(", ")}.`;
  } else if (fallidos.length) {
    aviso = `No se pudo subir ninguna evidencia (${fallidos.join(", ")}). Revisa tu conexión e intenta de nuevo.`;
  }

  return { novedad, subidas, fallidos, aviso };
}
