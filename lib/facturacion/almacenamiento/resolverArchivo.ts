import "server-only";

import fs   from "fs";
import path from "path";

import { directorioBaseFacturas } from "./directorioFacturas";
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
  origen:   "disco" | "airtable";
};

/**
 * Busca el RIDE PDF o el XML autorizado de una factura, primero en disco
 * (camino actual, intacto) y si no está ahí, como fallback, en el adjunto
 * de Airtable ("RIDE PDF" / "XML Autorizado" en "Facturas Electrónicas").
 *
 * El fallback existe porque en Vercel /tmp no persiste entre invocaciones
 * de funciones distintas — la que emitió la factura y la que sirve la
 * descarga pueden ser instancias separadas sin filesystem compartido.
 *
 * `escanearAnio`: si true, y el archivo no está en la ruta exacta AAAA/MM,
 * busca en todos los meses del año antes de rendirse (tolerancia a
 * diferencia de timezone entre la fecha de emisión y la clave de acceso —
 * comportamiento que ya tenía el endpoint de RIDE; el de XML no lo tenía
 * y no se le agrega aquí, para no cambiar nada fuera de lo pedido).
 *
 * Devuelve `null` si no se encuentra en ninguno de los dos lados.
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

  const adjunto = await obtenerAdjuntoPorClave(claveAcceso, CAMPO_AIRTABLE[tipo]);
  if (!adjunto) return null;

  const res = await fetch(adjunto.url);
  if (!res.ok) return null;

  const buffer = Buffer.from(await res.arrayBuffer());
  return { buffer, filename: adjunto.filename || nombreArchivo, origen: "airtable" };
}
