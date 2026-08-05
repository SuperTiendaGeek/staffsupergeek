import "server-only";

import crypto from "crypto";

// Cifrado simétrico de la firma electrónica (.p12 + su contraseña) antes de
// guardarla en Airtable.
//
// ─── Por qué cifrar ──────────────────────────────────────────────────────────
//
// El .p12 contiene la llave privada con la que se firman documentos
// tributarios. Airtable es una base compartida por todo el portal: dejar ese
// archivo como adjunto (URL accesible) o como texto plano sería dejar la llave
// privada al alcance de cualquiera con acceso a la base.
//
// Con este módulo, lo que se guarda en Airtable es un bloque ilegible. La
// llave maestra vive en FIRMA_MASTER_KEY (variable de entorno, fuera de
// Airtable) y el .p12 conserva además su propia contraseña. Dos capas: para
// usar el certificado hacen falta las dos cosas, y no viven en el mismo sitio.
//
// ─── Algoritmo ───────────────────────────────────────────────────────────────
//
// AES-256-GCM: cifra y además autentica. Si alguien altera un solo byte del
// texto cifrado en Airtable, el descifrado FALLA en vez de devolver basura
// silenciosamente — que es exactamente lo que queremos con una llave privada.
//
// Formato guardado: "v1:<iv>:<authTag>:<datos>", las tres partes en base64.
// El prefijo de versión permite cambiar de algoritmo más adelante sin tener
// que adivinar qué formato tiene un registro viejo.

const VERSION     = "v1";
const ALGORITMO   = "aes-256-gcm";
const IV_BYTES    = 12;   // tamaño recomendado para GCM
const CLAVE_BYTES = 32;   // AES-256

export class FirmaCriptoError extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "FirmaCriptoError";
  }
}

/**
 * Lee FIRMA_MASTER_KEY y la devuelve como Buffer de 32 bytes.
 *
 * Acepta base64 (`openssl rand -base64 32`) o hex (`openssl rand -hex 32`),
 * para no obligar a un formato concreto al momento de configurarla.
 */
export function obtenerLlaveMaestra(): Buffer {
  const raw = process.env.FIRMA_MASTER_KEY?.trim();
  if (!raw) {
    throw new FirmaCriptoError(
      "Variable de entorno requerida no configurada: FIRMA_MASTER_KEY. " +
      "Genera una con:  openssl rand -base64 32"
    );
  }

  const buf = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");

  if (buf.length !== CLAVE_BYTES) {
    throw new FirmaCriptoError(
      `FIRMA_MASTER_KEY debe representar 32 bytes (AES-256); se obtuvieron ${buf.length}. ` +
      "Genera una válida con:  openssl rand -base64 32"
    );
  }

  return buf;
}

/** Cifra un texto (o un .p12 ya pasado a base64) para guardarlo en Airtable. */
export function cifrar(texto: string, llave: Buffer = obtenerLlaveMaestra()): string {
  const iv     = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITMO, llave, iv);
  const datos  = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  const tag    = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    datos.toString("base64"),
  ].join(":");
}

/** Descifra lo que devuelve `cifrar()`. Lanza si el formato o la llave no cuadran. */
export function descifrar(payload: string, llave: Buffer = obtenerLlaveMaestra()): string {
  const partes = payload.split(":");

  if (partes.length !== 4 || partes[0] !== VERSION) {
    throw new FirmaCriptoError(
      "El dato cifrado no tiene el formato esperado (v1:iv:tag:datos). " +
      "El registro de Airtable pudo editarse a mano."
    );
  }

  const [, ivB64, tagB64, datosB64] = partes;

  try {
    const decipher = crypto.createDecipheriv(ALGORITMO, llave, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(datosB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    // Mensaje deliberadamente concreto: este error, en la práctica, siempre
    // significa lo mismo — la llave maestra ya no es la que cifró el dato.
    throw new FirmaCriptoError(
      "No se pudo descifrar la firma guardada. Lo más probable es que FIRMA_MASTER_KEY " +
      "haya cambiado desde que se subió el certificado. Vuelve a cargarlo desde " +
      "Facturación → Firma electrónica."
    );
  }
}

/** Huella del archivo, para detectar que se subió dos veces el mismo .p12. */
export function huellaSha256(contenido: Buffer): string {
  return crypto.createHash("sha256").update(contenido).digest("hex");
}
