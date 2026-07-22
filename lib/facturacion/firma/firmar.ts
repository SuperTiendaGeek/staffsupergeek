import "server-only";

import fs from "fs";
import { signInvoiceXml, signCreditNoteXml } from "ec-sri-invoice-signer";

/**
 * Tipo de comprobante a firmar. CADA tipo usa una función distinta de la
 * librería porque la firma se inserta ANTES de la etiqueta raíz correcta
 * (`</factura>` vs `</notaCredito>`, etc.). Usar la función equivocada NO
 * lanza ningún error: la librería hace un replace sobre una etiqueta que no
 * existe, devuelve el XML SIN firmar, y el SRI lo rechaza recién al recibirlo
 * con [39] FIRMA INVALIDA. Por eso este parámetro es obligatorio y explícito.
 */
export type TipoComprobanteFirma = "factura" | "notaCredito";

export type FirmaInput = {
  xmlSinFirmar: string;
  /** Ruta absoluta al archivo .p12 en el servidor. Nunca en el repositorio. */
  p12Path: string;
  /** Contraseña del .p12. Leer de variable de entorno, nunca hardcoded. */
  p12Clave: string;
  /** Tipo de comprobante. Default "factura" — preserva el comportamiento
   *  histórico de todos los llamadores existentes sin cambiarlos. */
  tipo?: TipoComprobanteFirma;
};

/**
 * Firma un XML de comprobante SRI con XAdES-BES usando el certificado .p12 del
 * emisor. Delega la firma criptográfica a ec-sri-invoice-signer (node-forge
 * puro, sin binarios nativos).
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

  const firmar = input.tipo === "notaCredito" ? signCreditNoteXml : signInvoiceXml;
  return firmar(input.xmlSinFirmar, p12Buffer, {
    pkcs12Password: input.p12Clave,
  });
}
