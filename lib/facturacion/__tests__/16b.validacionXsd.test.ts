/**
 * Test 16b — assertXmlValidoSri() (Fase 16 PR1 — endurecimiento).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/16b.validacionXsd.test.ts
 *
 * Usa xmllint contra el XSD oficial (lib/facturacion/xsd/factura_v2.1.0.xsd),
 * igual que facturaXml.test.ts — sin red, sin Airtable, sin SRI. Lanza en la
 * primera falla y sale con código distinto de 0.
 */

import { construirFacturaXml } from "../xml/construirFacturaXml";
import { generateAccessKey }   from "../claveAcceso";
import { assertXmlValidoSri }  from "../reglas/validacionXsd";
import { FacturacionRechazoError } from "../errores";
import type { FacturaInput } from "../types/factura";

let fallos = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

function fixture(overrides?: Partial<FacturaInput>): FacturaInput {
  const claveAcceso = generateAccessKey({
    fechaEmision:    new Date(2024, 0, 15),
    tipoComprobante: "01",
    ruc:             "1792146739001",
    ambiente:        "1",
    establecimiento: "001",
    puntoEmision:    "001",
    secuencial:      "1",
    codigoNumerico:  "12345678",
  });

  return {
    ambiente:       "1",
    razonSocial:    "SUPER GEEK S.A.",
    ruc:            "1792146739001",
    claveAcceso,
    estab:          "001",
    ptoEmi:         "001",
    secuencial:     "1",
    dirMatriz:      "AV. REPUBLICA E7-101 Y DIEGO DE ALMAGRO, QUITO",
    fechaEmision:   new Date(2024, 0, 15),
    tipoIdentificacionComprador: "05",
    razonSocialComprador:        "CLIENTE PRUEBA",
    identificacionComprador:     "1234567890",
    totalSinImpuestos:           100.00,
    totalDescuento:              0.00,
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
    ...overrides,
  };
}

// (a) XML válido → no lanza, el flujo continuaría hacia firmarXml()
{
  const xml = construirFacturaXml(fixture());
  let lanzo = false;
  try {
    assertXmlValidoSri(xml);
  } catch {
    lanzo = true;
  }
  assert(!lanzo, "XML válido no debe lanzar FacturacionRechazoError");
}

// (b) XML inválido → aborta con detalles del XSD, antes de firmar/contactar al SRI
// tipoIdentificacionComprador con patrón [0][4-9] en el XSD — "99" lo viola.
{
  const xmlInvalido = construirFacturaXml(fixture({ tipoIdentificacionComprador: "99" }));
  let error: unknown;
  try {
    assertXmlValidoSri(xmlInvalido);
  } catch (e) {
    error = e;
  }
  assert(error instanceof FacturacionRechazoError, "XML con tipoIdentificacionComprador inválido debe lanzar FacturacionRechazoError");
  const mensaje = error instanceof Error ? error.message : "";
  assert(mensaje.length > 0, "El error debe traer un mensaje");
  assert(
    mensaje.includes("validación XSD") || mensaje.includes("tipoIdentificacionComprador"),
    "El mensaje debe traer detalles de la validación XSD (no un error genérico)"
  );
  console.log("   detalle:", mensaje);
}

if (fallos > 0) {
  console.error(`\n❌ 16b.validacionXsd.test.ts — ${fallos} aserción(es) fallida(s)`);
  process.exit(1);
}
console.log("\n✅ 16b.validacionXsd.test.ts — todos los asserts pasaron");
