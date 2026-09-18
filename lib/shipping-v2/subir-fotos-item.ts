// Subida de fotos de un item desde el navegador.
//
// Sube UNA foto por petición a propósito. En Vercel el cuerpo de una función
// serverless no puede pasar de 4.5 MB: mandando el lote entero en un solo POST,
// tres fotos de 2 MB dan un 413 que ni siquiera llega al handler y el empleado
// ve un error genérico imposible de diagnosticar. Foto por foto, además, lo que
// sí subió queda guardado aunque otra falle.
//
// Es la misma receta que `subir-evidencias.ts`, que ya está probada en
// producción con las novedades.

import { comprimirFotoEvidencia } from "@/lib/shipping-v2/comprimir-foto";
import {
  LIMITE_FOTO_ITEM_BYTES,
  validarFotosItem,
  validarSeleccionFotosItem,
} from "@/lib/shipping-v2/fotos-item";

export type ResultadoSubidaFotos = {
  /** El item tal como quedó tras la última subida exitosa. */
  item: unknown | null;
  subidas: number;
  fallidas: string[];
  /** Mensaje listo para mostrar, o cadena vacía si salió todo bien. */
  aviso: string;
};

export class FotosInvalidasError extends Error {}

function mb(bytes: number): string {
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}

/**
 * Valida, comprime y sube.
 *
 * Lanza `FotosInvalidasError` solo si la selección no sirve (formato, tamaño,
 * cupo). Un fallo de red en una foto concreta se reporta en `fallidas`, no como
 * excepción: lo que ya subió es real y no hay que perderlo ni deshacerlo.
 */
export async function subirFotosItem(
  itemId: string,
  archivos: File[],
  opciones: { yaSubidas?: number } = {}
): Promise<ResultadoSubidaFotos> {
  const yaSubidas = opciones.yaSubidas ?? 0;

  const seleccion = validarSeleccionFotosItem(
    archivos.map((a) => ({ name: a.name, type: a.type, size: a.size })),
    { yaSubidas }
  );
  if (!seleccion.ok) throw new FotosInvalidasError(seleccion.motivo);

  // Airtable no acepta adjuntos de más de 5 MB y una foto de celular pesa el
  // doble o el triple. Para el catálogo de un artículo, 1600 px se ve igual.
  const preparadas: File[] = [];
  for (const archivo of archivos) {
    const resultado = await comprimirFotoEvidencia(archivo, LIMITE_FOTO_ITEM_BYTES);
    preparadas.push(resultado.archivo);
  }

  const listas = validarFotosItem(
    preparadas.map((a) => ({ name: a.name, type: a.type, size: a.size })),
    { yaSubidas }
  );
  if (!listas.ok) throw new FotosInvalidasError(listas.motivo);

  let item: unknown | null = null;
  let subidas = 0;
  const fallidas: string[] = [];

  for (const archivo of preparadas) {
    try {
      const formData = new FormData();
      formData.append("fotos", archivo);
      const respuesta = await fetch(`/api/shipping-v2/items/${itemId}/photos`, {
        method: "POST",
        body: formData,
      });

      // Un 413 de la plataforma no devuelve JSON: sin este caso el empleado
      // recibiría "Error inesperado" sin ninguna pista.
      if (respuesta.status === 413) {
        throw new Error(`"${archivo.name}" pesa demasiado (máximo ${mb(LIMITE_FOTO_ITEM_BYTES)}).`);
      }

      const payload = await respuesta.json().catch(() => ({} as Record<string, unknown>));
      if (!respuesta.ok || !payload.success) {
        throw new Error(String(payload.error || "No se pudo subir."));
      }

      item = payload.data ?? item;
      subidas += 1;
    } catch {
      fallidas.push(archivo.name);
    }
  }

  let aviso = "";
  if (fallidas.length && subidas) {
    aviso = `Se subieron ${subidas} de ${preparadas.length}. No se pudieron subir: ${fallidas.join(", ")}.`;
  } else if (fallidas.length) {
    aviso = `No se pudo subir ninguna foto (${fallidas.join(", ")}). Revisa tu conexión e intenta de nuevo.`;
  }

  return { item, subidas, fallidas, aviso };
}
