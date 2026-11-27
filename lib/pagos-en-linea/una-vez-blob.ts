import "server-only";

// Almacén de reservas en Vercel Blob (privado), para ./una-vez.ts.
//   · crear: put con allowOverwrite: false (el servicio rechaza si ya existe).
//   · reemplazar: put con ifMatch (el servicio rechaza si el ETag cambió).
//   · leer: get con useCache: false (lectura directa, sin la caché de la CDN).
// Usa el mismo almacén Blob del portal (BLOB_READ_WRITE_TOKEN): no es un servicio nuevo.

import { createHash } from "crypto";
import { BlobPreconditionFailedError, get, put } from "@vercel/blob";
import type { AlmacenReservas, Reserva } from "./una-vez";

const OPCIONES = { access: "private" as const, addRandomSuffix: false, contentType: "application/json", cacheControlMaxAge: 60 };

export const huellaNumero = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 40);

async function leer(clave: string): Promise<{ valor: Reserva; etag: string } | null> {
  const r = await get(clave, { access: "private", useCache: false });
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  const texto = await new Response(r.stream).text();
  return { valor: JSON.parse(texto) as Reserva, etag: r.blob.etag };
}

export const almacenBlob: AlmacenReservas = {
  async crear(clave, valor) {
    try {
      const r = await put(clave, JSON.stringify(valor), { ...OPCIONES, allowOverwrite: false });
      return { estado: "creada", etag: r.etag };
    } catch (e) {
      // ¿Ya existía? Se confirma leyendo; cualquier otro error se propaga (no se registra nada).
      if (await leer(clave).catch(() => null)) return { estado: "existe" };
      throw e;
    }
  },
  leer,
  async reemplazar(clave, valor, etag) {
    try {
      const r = await put(clave, JSON.stringify(valor), { ...OPCIONES, allowOverwrite: true, ifMatch: etag });
      return { estado: "ok", etag: r.etag };
    } catch (e) {
      if (e instanceof BlobPreconditionFailedError) return { estado: "cambio" };
      throw e;
    }
  },
};
