import "server-only";

// Respaldo durable en Vercel Blob (Fase 17 — hardening pre-producción).
//
// Por qué existe: el respaldo en disco (directorioFacturas.ts) vive en el
// filesystem del proceso serverless — sobrevive entre invocaciones de la
// MISMA instancia (por eso funciona hoy en desarrollo/pruebas), pero se
// pierde en cada despliegue nuevo. Legalmente hay que conservar el XML
// autorizado 7 años (RLRTI art. 96); un respaldo que desaparece con el
// próximo `git push` no cumple eso.
//
// Se guarda EN PARALELO al disco, nunca en su reemplazo — mismo espíritu que
// ya tiene el respaldo a Airtable en repositorio.ts: dos copias best-effort
// (tres, contando Airtable) valen más que una sola que puede fallar.
//
// Acceso PRIVADO, deliberadamente: el XML/PDF de una factura real trae datos
// personales del cliente (cédula/RUC, nombre, dirección) — nunca se sube
// como blob público. La única forma de leerlo es desde el propio servidor
// (con la sesión ya validada por el endpoint que llama a
// resolverArchivoFactura), nunca se expone una URL de Vercel Blob al
// navegador directamente.

import { put, get } from "@vercel/blob";
import type { MensajeSRI } from "../sri/recepcion";

const PREFIJO = "facturas-autorizadas";

// Sin BLOB_READ_WRITE_TOKEN, @vercel/blob lanza al primer put()/get(). En vez
// de dejar que ese error se propague (y de paso complicar cualquier test que
// no lo setee), tratamos "sin token" como "capa Blob no configurada todavía"
// — se salta en silencio y el resto de la cadena (disco/Airtable) sigue
// funcionando exactamente igual que antes de esta fase.
function blobConfigurado(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN?.trim();
}

export function pathnameFactura(clave: string, fecha: Date, ext: "xml" | "pdf"): string {
  const año = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  return `${PREFIJO}/${año}/${mes}/${clave}.${ext}`;
}

async function guardarEnBlob(
  clave: string,
  fecha: Date,
  xml: string,
  pdf?: Uint8Array
): Promise<void> {
  await put(pathnameFactura(clave, fecha, "xml"), xml, {
    access:          "private",
    contentType:     "text/xml",
    // Idempotente a propósito: un reintento (p.ej. /sincronizar) para la
    // misma clave de acceso no debe fallar por "el blob ya existe".
    allowOverwrite:  true,
  });

  if (pdf) {
    await put(pathnameFactura(clave, fecha, "pdf"), Buffer.from(pdf), {
      access:         "private",
      contentType:    "application/pdf",
      allowOverwrite: true,
    });
  }
}

/**
 * Best-effort, igual criterio que intentarGuardarEnDisco(): si Vercel Blob
 * falla (cuota, token mal puesto, etc.) NO debe tumbar la emisión — la
 * factura ya está AUTORIZADA por el SRI en este punto. Devuelve un
 * MensajeSRI[] con la advertencia si falló, o undefined si salió bien.
 */
export async function intentarGuardarEnBlob(
  clave: string,
  fecha: Date,
  xml:   string,
  pdf?:  Uint8Array
): Promise<MensajeSRI[] | undefined> {
  if (!blobConfigurado()) return undefined; // capa opcional, no configurada — no es un error

  try {
    await guardarEnBlob(clave, fecha, xml, pdf);
    return undefined;
  } catch (err) {
    console.error(
      `[blob] Respaldo durable en Vercel Blob falló para ${clave} (factura ya AUTORIZADA por el SRI):`,
      err
    );
    return [{
      identificador:        "RESPALDO_BLOB",
      tipo:                 "ADVERTENCIA",
      mensaje:              "No se pudo guardar el respaldo durable en Vercel Blob",
      informacionAdicional: err instanceof Error ? err.message : String(err),
    }];
  }
}

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Lee un archivo por su pathname exacto (facturas-autorizadas/AAAA/MM/clave.ext).
 * Nunca lanza — ni por "no encontrado" ni por ningún otro error (token
 * inválido, timeout, etc.). Este es un eslabón intermedio de una cadena de
 * fallback (disco → Blob → Airtable): si Blob falla por lo que sea, lo
 * correcto es seguir probando con Airtable, no tumbar la descarga entera.
 * Cualquier fallo real queda en el log del servidor para investigarlo aparte.
 */
export async function leerDeBlob(pathname: string): Promise<Buffer | null> {
  if (!blobConfigurado()) return null;

  try {
    const resultado = await get(pathname, { access: "private" });
    if (!resultado || !resultado.stream) return null;
    return await streamToBuffer(resultado.stream);
  } catch (err) {
    console.error(`[blob] Lectura falló para ${pathname} (se sigue con el siguiente respaldo):`, err);
    return null;
  }
}
