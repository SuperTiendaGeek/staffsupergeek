import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  documentosFijos, firmarCongelado, verificarFirmaNativa, validarXmlFirmado,
  sha256, xmlSinCertificado, primeraDiferencia, FIXTURES_HUELLA,
} from "./_firmaHuella";

// Capturadas el 19-nov-2026 con node-forge 1.4.0 y fast-xml-parser 5.9.3.
// No regenerar automáticamente: un cambio requiere revisar el XML y la firma.
const ESPERADAS = {
  factura: "f577efc87adf066e866f73958962a207eca5dd5d6b61c2e7ad91e7f13aa88581",
  notaCredito: "801966fd1ec8e1a6d5be70d1e58c3bf89526b114d86931af2e495faefd31fcba",
};

(async () => {
  // Esta suite nunca carga .env.local ni tiene acceso a Airtable/SRI.
  const documentos = documentosFijos();
  for (const tipo of ["factura", "notaCredito"] as const) {
    const xml = await firmarCongelado(documentos[tipo],
      path.join(FIXTURES_HUELLA, "test-cert.p12"), "testclave123", tipo);
    verificarFirmaNativa(xml);
    validarXmlFirmado(xml, tipo);
    const actual = sha256(xml);
    const esperado = fs.readFileSync(path.join(FIXTURES_HUELLA, `firma.huella.${tipo}.xml`), "utf8");
    const sinCertificado = xmlSinCertificado(xml);
    assert.equal(actual, ESPERADAS[tipo],
      `${tipo}: cambió el SHA-256 del XML firmado.\n` +
      (esperado === sinCertificado
        ? "El XML sin el certificado coincide: revisar ds:X509Certificate."
        : primeraDiferencia(esperado, sinCertificado)));
    assert.equal(sinCertificado, esperado, `${tipo}: la instantánea debe coincidir con la huella`);
    console.log(`${tipo}: ${actual} · crypto nativo y XSD válidos`);
  }
})().catch((error: unknown) => {
  console.error(error instanceof assert.AssertionError ? error.message : "Falló la prueba de huella de firma (sin datos sensibles).");
  process.exitCode = 1;
});
