import "server-only";

import { validarContraXsd } from "../xml/validarXsd";
import { FacturacionRechazoError } from "../errores";

/**
 * Aborta con FacturacionRechazoError si el XML no valida contra el XSD
 * oficial SRI v2.1.0. Debe llamarse después de construirFacturaXml() y
 * antes de firmarXml() — un XML mal formado no debe llegar a firma ni a
 * la red del SRI.
 */
export function assertXmlValidoSri(xml: string): void {
  const resultado = validarContraXsd(xml);
  if (!resultado.valido) {
    throw new FacturacionRechazoError(
      `El XML generado no pasa la validación XSD del SRI: ${resultado.errores.join(" | ")}`
    );
  }
}
