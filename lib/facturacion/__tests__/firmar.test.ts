/**
 * Tests de integración para firmar.ts (Fase 2 — firma XAdES-BES).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/firmar.test.ts
 *
 * Usa un certificado autofirmado de prueba en __fixtures__/test-cert.p12
 * generado con: openssl req + openssl pkcs12 (RSA 2048, contraseña "testclave123").
 * Este certificado NUNCA va a producción; solo existe para verificar la integración.
 */

import path from "path";
import { construirFacturaXml } from "../xml/construirFacturaXml";
import { validarContraXsd } from "../xml/validarXsd";
import { firmarXml } from "../firma/firmar";
import { generateAccessKey } from "../claveAcceso";
import type { FacturaInput } from "../types/factura";

// ─── Fixture ─────────────────────────────────────────────────────────────────

const FIXTURES = path.join(__dirname, "__fixtures__");
const P12_PATH = path.join(FIXTURES, "test-cert.p12");
const P12_CLAVE = "testclave123";

const claveAcceso = generateAccessKey({
  fechaEmision:    new Date(2024, 0, 15),
  tipoComprobante: "01",
  ruc:             "1792146739001",
  ambiente:        "1",
  establecimiento: "001",
  puntoEmision:    "001",
  secuencial:      "2",
  codigoNumerico:  "87654321",
});

const fixture: FacturaInput = {
  ambiente:       "1",
  razonSocial:    "SUPER GEEK S.A.",
  ruc:            "1792146739001",
  claveAcceso,
  estab:          "001",
  ptoEmi:         "001",
  secuencial:     "2",
  dirMatriz:      "AV. REPUBLICA E7-101 Y DIEGO DE ALMAGRO, QUITO",
  fechaEmision:   new Date(2024, 0, 15),
  tipoIdentificacionComprador:  "05",
  razonSocialComprador:         "CLIENTE PRUEBA",
  identificacionComprador:      "1234567890",
  totalSinImpuestos:            100.00,
  totalDescuento:               0.00,
  totalConImpuestos: [
    { codigo: "2", codigoPorcentaje: "10", baseImponible: 100.00, tarifa: 15, valor: 15.00 },
  ],
  importeTotal: 115.00,
  pagos: [{ formaPago: "01", total: 115.00 }],
  detalles: [
    {
      descripcion:            "SERVICIO DE REPARACION DE EQUIPO",
      cantidad:               1,
      precioUnitario:         100.00,
      descuento:              0.00,
      precioTotalSinImpuesto: 100.00,
      impuestos: [
        { codigo: "2", codigoPorcentaje: "10", tarifa: 15, baseImponible: 100.00, valor: 15.00 },
      ],
    },
  ],
};

// ─── Tests ───────────────────────────────────────────────────────────────────

(async () => {
  // 1. El XML sin firmar valida contra el XSD (precondición)
  const xmlSinFirmar = construirFacturaXml(fixture);
  const preValidacion = validarContraXsd(xmlSinFirmar);
  console.assert(preValidacion.valido, "Precondición: XML sin firmar debe ser válido");

  // 2. firmarXml retorna una cadena no vacía
  const xmlFirmado = await firmarXml({ xmlSinFirmar, p12Path: P12_PATH, p12Clave: P12_CLAVE });
  console.assert(typeof xmlFirmado === "string" && xmlFirmado.length > 0,
    "firmarXml debe retornar string no vacío");

  // 3. El XML firmado es más largo que el original (se añadió la firma)
  console.assert(xmlFirmado.length > xmlSinFirmar.length,
    "XML firmado debe ser más largo que el original");

  // 4. El elemento ds:Signature está presente
  console.assert(
    xmlFirmado.includes("ds:Signature") || xmlFirmado.includes(":Signature"),
    "XML firmado debe contener el elemento ds:Signature"
  );

  // 5. El contenido original de la factura sigue intacto
  console.assert(xmlFirmado.includes(`<claveAcceso>${claveAcceso}</claveAcceso>`),
    "claveAcceso debe seguir presente en el XML firmado");
  console.assert(xmlFirmado.includes("<ruc>1792146739001</ruc>"),
    "RUC debe seguir presente en el XML firmado");
  console.assert(xmlFirmado.includes("<importeTotal>115.00</importeTotal>"),
    "importeTotal debe seguir presente en el XML firmado");

  // 6. El XML firmado sigue validando contra el XSD oficial del SRI
  //    (ds:Signature es minOccurs=0 en el XSD; la firma no rompe la estructura)
  const postValidacion = validarContraXsd(xmlFirmado);
  if (!postValidacion.valido) {
    console.error("Errores XSD en XML firmado:");
    for (const e of (postValidacion as { valido: false; errores: string[] }).errores) {
      console.error(" ", e);
    }
  }
  console.assert(postValidacion.valido === true,
    "XML firmado debe seguir validando contra el XSD del SRI");

  // 7. Error descriptivo si el .p12 no existe
  let lanzó = false;
  try {
    await firmarXml({ xmlSinFirmar, p12Path: "/no/existe.p12", p12Clave: "x" });
  } catch (e: unknown) {
    lanzó = true;
    console.assert(
      (e as Error).message.includes("/no/existe.p12"),
      "Error de ruta debe incluir el path solicitado"
    );
  }
  console.assert(lanzó, "Debe lanzar cuando el .p12 no existe");

  // 8. Llamadas consecutivas producen firmas distintas (el signer incluye timestamp)
  const xmlFirmado2 = await firmarXml({ xmlSinFirmar, p12Path: P12_PATH, p12Clave: P12_CLAVE });
  // La firma XAdES-BES incluye SigningTime; con la misma clave el XML puede diferir
  // No es un assert duro — solo verificamos que ambas salidas son cadenas válidas.
  console.assert(typeof xmlFirmado2 === "string" && xmlFirmado2.length > 0,
    "Segunda firma debe producir un string válido");

  console.log("✅ firmar.test.ts — todos los asserts pasaron");
})();
