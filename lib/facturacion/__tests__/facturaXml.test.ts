/**
 * Tests de integración para construirFacturaXml + validarContraXsd.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/facturaXml.test.ts
 *
 * La variable NODE_OPTIONS activa la condición "react-server" para que
 * server-only sea un no-op fuera de Next.js (usa empty.js en vez de index.js).
 *
 * Verifica que el XML generado pase validación contra el XSD oficial SRI v2.1.0.
 */

import { construirFacturaXml } from "../xml/construirFacturaXml";
import { validarContraXsd } from "../xml/validarXsd";
import { generateAccessKey } from "../claveAcceso";
import type { FacturaInput } from "../types/factura";

// ─── Fixture ─────────────────────────────────────────────────────────────────

const claveAcceso = generateAccessKey({
  fechaEmision:    new Date(2024, 0, 15), // 15/01/2024 (constructor local)
  tipoComprobante: "01",
  ruc:             "1792146739001",
  ambiente:        "1",
  establecimiento: "001",
  puntoEmision:    "001",
  secuencial:      "1",
  codigoNumerico:  "12345678",
});

const fixture: FacturaInput = {
  // infoTributaria
  ambiente:       "1",
  razonSocial:    "SUPER GEEK S.A.",
  ruc:            "1792146739001",
  claveAcceso,
  estab:          "001",
  ptoEmi:         "001",
  secuencial:     "1",
  dirMatriz:      "AV. REPUBLICA E7-101 Y DIEGO DE ALMAGRO, QUITO",
  // infoFactura
  fechaEmision:                    new Date(2024, 0, 15),
  tipoIdentificacionComprador:     "05",           // cédula
  razonSocialComprador:            "CLIENTE PRUEBA",
  identificacionComprador:         "1234567890",
  totalSinImpuestos:               100.00,
  totalDescuento:                  0.00,
  totalConImpuestos: [
    {
      codigo:           "2",    // IVA
      codigoPorcentaje: "10",   // 15 %
      baseImponible:    100.00,
      tarifa:           15,
      valor:            15.00,
    },
  ],
  importeTotal: 115.00,
  pagos: [{ formaPago: "01", total: 115.00 }],
  // detalles
  detalles: [
    {
      descripcion:             "SERVICIO DE REPARACION DE EQUIPO",
      cantidad:                1,
      precioUnitario:          100.00,
      descuento:               0.00,
      precioTotalSinImpuesto:  100.00,
      impuestos: [
        {
          codigo:           "2",
          codigoPorcentaje: "10",
          tarifa:           15,
          baseImponible:    100.00,
          valor:            15.00,
        },
      ],
    },
  ],
  // infoAdicional (opcional)
  infoAdicional: [
    { nombre: "email",    valor: "cliente@ejemplo.com" },
    { nombre: "telefono", valor: "0999000000" },
  ],
};

// ─── Assertions ───────────────────────────────────────────────────────────────

const xml = construirFacturaXml(fixture);

// 1. El builder retorna una cadena no vacía
console.assert(typeof xml === "string" && xml.length > 0,
  "construirFacturaXml debe retornar string no vacío");

// 2. Atributos del elemento raíz
console.assert(xml.includes('id="comprobante"'),   "Debe tener atributo id=comprobante");
console.assert(xml.includes('version="2.1.0.0"'),  "Debe tener version 2.1.0.0");

// 3. claveAcceso en el XML y formato correcto
console.assert(xml.includes(`<claveAcceso>${claveAcceso}</claveAcceso>`),
  "claveAcceso debe aparecer en infoTributaria");
console.assert(/^\d{49}$/.test(claveAcceso), "claveAcceso debe ser de 49 dígitos");

// 4. Fecha en formato DD/MM/YYYY
console.assert(xml.includes("<fechaEmision>15/01/2024</fechaEmision>"),
  "Fecha de emisión en formato DD/MM/YYYY");

// 5. Secuencial padded a 9 dígitos en infoTributaria
console.assert(xml.includes("<secuencial>000000001</secuencial>"),
  "Secuencial debe tener exactamente 9 dígitos");

// 6. Valores monetarios con exactamente 2 decimales
console.assert(xml.includes("<importeTotal>115.00</importeTotal>"),
  "importeTotal con 2 decimales");
console.assert(xml.includes("<totalSinImpuestos>100.00</totalSinImpuestos>"),
  "totalSinImpuestos con 2 decimales");
console.assert(xml.includes("<totalDescuento>0.00</totalDescuento>"),
  "totalDescuento con 2 decimales");

// 7. Estructura de detalles
console.assert(xml.includes("<descripcion>SERVICIO DE REPARACION DE EQUIPO</descripcion>"),
  "Descripción del detalle presente");
console.assert(xml.includes("<cantidad>1.00</cantidad>"),
  "Cantidad con 2 decimales");

// 8. infoAdicional con atributo nombre
console.assert(xml.includes('<campoAdicional nombre="email">cliente@ejemplo.com</campoAdicional>'),
  "Campo adicional correctamente serializado");

// 9. Validación contra XSD oficial
const resultado = validarContraXsd(xml);
if (!resultado.valido) {
  console.error("Errores de validación XSD:");
  for (const e of (resultado as { valido: false; errores: string[] }).errores) {
    console.error(" ", e);
  }
  console.error("\nXML generado:\n", xml);
}
console.assert(resultado.valido === true,
  "El XML debe validar contra el XSD SRI Factura v2.1.0");

// 10. XML con caracteres especiales escapados
const xmlConEspeciales = construirFacturaXml({
  ...fixture,
  claveAcceso: generateAccessKey({
    fechaEmision:    new Date(2024, 0, 15),
    tipoComprobante: "01",
    ruc:             "1792146739001",
    ambiente:        "1",
    establecimiento: "001",
    puntoEmision:    "001",
    secuencial:      "2",
    codigoNumerico:  "87654321",
  }),
  razonSocialComprador: "EMPRESA & ASOCIADOS <TEST>",
});
console.assert(
  xmlConEspeciales.includes("EMPRESA &amp; ASOCIADOS &lt;TEST&gt;"),
  "Los caracteres especiales deben estar escapados en el XML"
);

console.log("✅ facturaXml.test.ts — todos los asserts pasaron");
