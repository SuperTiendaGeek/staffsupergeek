/**
 * Test de regresión — firma por tipo de comprobante (Fase 18, fix [39]).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/firmarNotaCredito.test.ts
 *
 * Bug que cubre: firmarXml() usaba siempre signInvoiceXml, que inserta la
 * firma antes de </factura>. Una nota de crédito termina en </notaCredito>,
 * así que la firma NUNCA se insertaba (replace sobre una etiqueta ausente
 * devuelve el XML intacto) y el SRI la rechazaba con [39] FIRMA INVALIDA.
 *
 * Verifica que:
 *   1. La factura sigue firmándose y la firma queda dentro de <factura>.
 *   2. La NC ahora se firma (tipo: "notaCredito") y la firma queda dentro
 *      de <notaCredito> — no se pierde.
 *   3. El caso del bug (firmar una NC como si fuera factura) efectivamente
 *      NO inserta la firma — para que quede documentado por qué el tipo importa.
 *
 * Usa el mismo certificado de juguete que firmar.test.ts.
 */

import path from "path";
import { firmarXml } from "../firma/firmar";
import { signInvoiceXml } from "ec-sri-invoice-signer";
import fs from "fs";

const P12_PATH  = path.join(__dirname, "__fixtures__", "test-cert.p12");
const P12_CLAVE = "testclave123";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const facturaXml = '<?xml version="1.0" encoding="UTF-8"?><factura id="comprobante" version="2.0.0"><infoTributaria><ambiente>1</ambiente></infoTributaria><infoFactura><fechaEmision>20/07/2026</fechaEmision></infoFactura></factura>';
const ncXml      = '<?xml version="1.0" encoding="UTF-8"?><notaCredito id="comprobante" version="1.1.0"><infoTributaria><ambiente>1</ambiente></infoTributaria><infoNotaCredito><fechaEmision>20/07/2026</fechaEmision></infoNotaCredito></notaCredito>';

function tieneFirmaAntesDe(xml: string, cierre: string): boolean {
  const idxSig    = xml.indexOf("Signature");
  const idxCierre = xml.lastIndexOf(cierre);
  return idxSig !== -1 && idxSig < idxCierre;
}

(async () => {
  // 1. Factura — camino histórico, sin tocar
  {
    const firmado = await firmarXml({ xmlSinFirmar: facturaXml, p12Path: P12_PATH, p12Clave: P12_CLAVE });
    assert(tieneFirmaAntesDe(firmado, "</factura>"), "Factura: la firma se inserta dentro de <factura> (comportamiento intacto)");
  }

  // 2. Nota de crédito — el fix
  {
    const firmado = await firmarXml({ xmlSinFirmar: ncXml, p12Path: P12_PATH, p12Clave: P12_CLAVE, tipo: "notaCredito" });
    assert(tieneFirmaAntesDe(firmado, "</notaCredito>"), "NC con tipo:'notaCredito': la firma SÍ se inserta dentro de <notaCredito>");
    assert(firmado.length > ncXml.length + 500, "NC firmada: el XML creció por el bloque de firma (no volvió intacto)");
  }

  // 3. El bug documentado: firmar la NC con la función de factura NO inserta nada
  {
    const p12 = fs.readFileSync(P12_PATH);
    const malFirmado = signInvoiceXml(ncXml, p12, { pkcs12Password: P12_CLAVE });
    assert(!tieneFirmaAntesDe(malFirmado, "</notaCredito>"), "Regresión: firmar una NC como factura NO inserta la firma (causa del [39])");
  }

  if (fallos > 0) {
    console.error(`\n❌ firmarNotaCredito.test.ts — ${fallos} aserción(es) fallida(s)`);
    process.exit(1);
  }
  console.log("\n✅ firmarNotaCredito.test.ts — todos los asserts pasaron");
})();
