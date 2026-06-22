import "server-only";

import fs from "fs";
import { signInvoiceXml } from "ec-sri-invoice-signer";

export type FirmaInput = {
  xmlSinFirmar: string;
  /** Ruta absoluta al archivo .p12 en el servidor. Nunca en el repositorio. */
  p12Path: string;
  /** Contraseña del .p12. Leer de variable de entorno, nunca hardcoded. */
  p12Clave: string;
};

/**
 * Firma un XML de factura con XAdES-BES usando el certificado .p12 del emisor.
 * Delega la firma criptográfica a ec-sri-invoice-signer (node-forge puro, sin binarios nativos).
 *
 * El XML resultante incluye el elemento ds:Signature y sigue siendo válido
 * contra el XSD del SRI (ds:Signature es minOccurs=0 en el esquema).
 */
export async function firmarXml(input: FirmaInput): Promise<string> {
  let p12Buffer: Buffer;
  try {
    p12Buffer = fs.readFileSync(input.p12Path);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(`Certificado .p12 no encontrado en: ${input.p12Path}`);
    }
    throw err;
  }

  return signInvoiceXml(input.xmlSinFirmar, p12Buffer, {
    pkcs12Password: input.p12Clave,
  });
}
