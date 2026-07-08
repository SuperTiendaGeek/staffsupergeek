import "server-only";

import fs     from "fs";
import os     from "os";
import path   from "path";
import crypto from "crypto";
import forge  from "node-forge";

// Resuelve qué ruta de archivo usar para el .p12 de firma, soportando dos
// orígenes:
//   - SRI_FIRMA_PATH: ruta ya existente en el filesystem (local / cualquier
//     entorno con disco persistente). Comportamiento sin cambios.
//   - SRI_FIRMA_P12_BASE64: el .p12 embebido como base64 en la variable de
//     entorno — necesario en Vercel, donde el filesystem del repo no existe
//     y el certificado (gitignored) nunca llega al deploy. Se valida, se
//     escribe una sola vez a /tmp (único directorio escribible en runtime
//     serverless) y esa ruta queda cacheada en memoria del proceso para el
//     resto de invocaciones de la misma instancia tibia.

let rutaCacheada: string | undefined;

/** Solo para tests: limpia el cache en memoria entre casos. */
export function _resetCacheParaTests(): void {
  rutaCacheada = undefined;
}

/**
 * Verifica que `base64` decodifique a un PKCS#12 abrible con `password`.
 * Lanza con mensaje claro (sin incluir el contenido del certificado ni la
 * contraseña) en vez de dejar que el fallo aparezca, críptico, dentro de
 * firmarXml()/signInvoiceXml() al momento de firmar.
 */
function validarPkcs12(base64: string, password: string): void {
  let der: string;
  try {
    der = forge.util.decode64(base64);
  } catch {
    throw new Error("SRI_FIRMA_P12_BASE64 no es base64 válido.");
  }

  let asn1: forge.asn1.Asn1;
  try {
    asn1 = forge.asn1.fromDer(der);
  } catch {
    throw new Error(
      "SRI_FIRMA_P12_BASE64 no decodifica a un PKCS#12 válido (DER inválido)."
    );
  }

  try {
    forge.pkcs12.pkcs12FromAsn1(asn1, password);
  } catch {
    throw new Error(
      "SRI_FIRMA_P12_BASE64 no se pudo abrir con SRI_FIRMA_PASSWORD " +
      "(contraseña incorrecta o certificado corrupto)."
    );
  }
}

export type ResolverP12Input = {
  /** SRI_FIRMA_PATH, si está configurada — ruta local existente. */
  firmaPathLocal?: string;
  /** SRI_FIRMA_P12_BASE64, si está configurada. */
  p12Base64?: string;
  /** SRI_FIRMA_PASSWORD — siempre requerida, por cualquiera de las dos vías. */
  password: string;
};

/**
 * Devuelve la ruta de archivo a usar como `p12Path` de firmarXml().
 *
 * - Si `p12Base64` no está definida: se comporta exactamente como antes —
 *   devuelve `firmaPathLocal` tal cual (o lanza si tampoco está definida,
 *   con el mismo formato de error que el resto de variables requeridas).
 * - Si `p12Base64` está definida: valida, materializa en /tmp una sola vez
 *   (cacheado en memoria) y devuelve esa ruta. `firmaPathLocal` no hace
 *   falta en este caso.
 */
export function resolverRutaP12(input: ResolverP12Input): string {
  if (!input.p12Base64) {
    if (!input.firmaPathLocal) {
      throw new Error("Variable de entorno requerida no configurada: SRI_FIRMA_PATH");
    }
    return input.firmaPathLocal;
  }

  if (rutaCacheada) return rutaCacheada;

  validarPkcs12(input.p12Base64, input.password);

  const buffer = Buffer.from(input.p12Base64, "base64");
  // Nombre determinístico por contenido: si el certificado cambia entre
  // despliegues no queda un archivo viejo con el mismo nombre confundiendo.
  const hash = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  const destino = path.join(os.tmpdir(), `sri-firma-${hash}.p12`);

  fs.writeFileSync(destino, buffer, { mode: 0o600 });
  rutaCacheada = destino;
  return destino;
}
