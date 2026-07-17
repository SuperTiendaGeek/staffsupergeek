import "server-only";

import fs   from "fs";
import path from "path";

import { directorioBaseFacturas } from "./directorioFacturas";
import { leerDeBlob, pathnameFactura } from "./blob";
import { obtenerAdjuntoPorClave } from "../airtable/facturas";

export type TipoArchivoFactura = "ride" | "xml";

const EXTENSION: Record<TipoArchivoFactura, string> = { ride: "pdf", xml: "xml" };
const CAMPO_AIRTABLE: Record<TipoArchivoFactura, "RIDE PDF" | "XML Autorizado"> = {
  ride: "RIDE PDF",
  xml:  "XML Autorizado",
};

export type ArchivoResuelto = {
  buffer:   Buffer;
  filename: string;
  origen:   "disco" | "blob" | "airtable";
};

/**
 * Busca el RIDE PDF o el XML autorizado de una factura en tres capas, en
 * orden: disco (rápido, pero no sobrevive despliegues) → Vercel Blob
 * (durable, Fase 17) → adjunto de Airtable ("RIDE PDF" / "XML Autorizado"
 * en "Facturas Electrónicas", el respaldo más antiguo del proyecto).
 *
 * El fallback existe porque en Vercel /tmp no persiste entre invocaciones
 * de funciones distintas — la que emitió la factura y la que sirve la
 * descarga pueden ser instancias separadas sin filesystem compartido. Blob
 * cubre ese hueco para todo lo emitido desde que existe este código; Airtable
 * queda como red de seguridad final, y para facturas emitidas antes de esta
 * fase (que nunca se guardaron en Blob).
 *
 * `escanearAnio`: si true, y el archivo no está en la ruta exacta AAAA/MM,
 * busca en todos los meses del año antes de rendirse (tolerancia a
 * diferencia de timezone entre la fecha de emisión y la clave de acceso —
 * comportamiento que ya tenía el endpoint de RIDE; el de XML no lo tenía
 * y no se le agrega aquí, para no cambiar nada fuera de lo pedido). Solo
 * aplica a disco — Blob y Airtable se buscan siempre por la ruta/clave
 * exacta, no necesitan el mismo tanteo.
 *
 * Devuelve `null` si no se encuentra en ninguna de las tres capas.
 */
export async function resolverArchivoFactura(
  claveAcceso: string,
  tipo: TipoArchivoFactura,
  opts: { escanearAnio?: boolean } = {}
): Promise<ArchivoResuelto | null> {
  const aaaa = claveAcceso.slice(4, 8);
  const mm   = claveAcceso.slice(2, 4);
  const ext  = EXTENSION[tipo];
  const nombreArchivo = `${claveAcceso}.${ext}`;

  const base = directorioBaseFacturas();
  const rutaExacta = path.join(base, aaaa, mm, nombreArchivo);

  if (fs.existsSync(rutaExacta)) {
    return { buffer: fs.readFileSync(rutaExacta), filename: nombreArchivo, origen: "disco" };
  }

  if (opts.escanearAnio) {
    const dirAnio = path.join(base, aaaa);
    if (fs.existsSync(dirAnio)) {
      for (const dirMes of fs.readdirSync(dirAnio)) {
        const candidato = path.join(dirAnio, dirMes, nombreArchivo);
        if (fs.existsSync(candidato)) {
          return { buffer: fs.readFileSync(candidato), filename: nombreArchivo, origen: "disco" };
        }
      }
    }
  }

  // La fecha de emisión no está disponible aquí (solo la clave de acceso),
  // pero aaaa/mm ya vienen de la propia clave — misma convención de carpeta
  // que usa guardarEnBlob() a partir de la fecha real de emisión.
  const fechaDesdeClave = new Date(Number(aaaa), Number(mm) - 1, 1);
  const pathnameBlob = pathnameFactura(claveAcceso, fechaDesdeClave, ext as "xml" | "pdf");
  const bufferBlob = await leerDeBlob(pathnameBlob);
  if (bufferBlob) {
    return { buffer: bufferBlob, filename: nombreArchivo, origen: "blob" };
  }

  const adjunto = await obtenerAdjuntoPorClave(claveAcceso, CAMPO_AIRTABLE[tipo]);
  if (!adjunto) return null;

  const res = await fetch(adjunto.url);
  if (!res.ok) return null;

  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, filename: adjunto.filename || nombreArchivo, origen: "airtable" };
}
