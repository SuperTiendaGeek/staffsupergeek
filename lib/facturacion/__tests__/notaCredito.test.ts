/**
 * Test — Nota de crédito, núcleo (Fase 18 PR1).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/notaCredito.test.ts
 *
 * Cubre las tres piezas puras (sin red, sin Airtable):
 *   A. construirNotaCreditoXml — estructura exacta del XSD notaCredito v1.1.0.
 *   B. calculos — líneas derivadas de la factura original, totales, ecuación SRI.
 *   C. reglas — consumidor final, estado, plazo interno, sobre-acreditación, motivo.
 *
 * Lanza en la primera falla y sale con código distinto de 0.
 */

import { construirNotaCreditoXml } from "../notaCredito/construirNotaCreditoXml";
import {
  construirLineaNotaCredito,
  calcularTotalesNotaCredito,
  evaluarNotaCreditoPermitida,
  validarMotivo,
  round2,
} from "../notaCredito/calculos";
import { fechaLimiteAceptacion } from "../notaCredito/emitirNotaCredito";
import type { DetalleFactura } from "../types/factura";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

// Línea real: el Lenovo de $340 con IVA incluido → base 295.65 + IVA 44.35
const lineaFactura: DetalleFactura = {
  codigoPrincipal: "DES-000005",
  descripcion: "Lenovo ThinkCentre M70q Mini Desktop",
  unidadMedida: "Unidad",
  cantidad: 1,
  precioUnitario: 295.65,
  descuento: 0,
  precioTotalSinImpuesto: 295.65,
  impuestos: [{ codigo: "2", codigoPorcentaje: "4", tarifa: 15, baseImponible: 295.65, valor: 44.35 }],
  tipo: "producto",
  shippingItemId: "rec1e1NPbNTBbJh0r",
};

// ─── B. Cálculos ─────────────────────────────────────────────────────────────

{
  const linea = construirLineaNotaCredito(lineaFactura, 1, true);
  assert(linea.codigoInterno === "DES-000005", "Línea NC: el código pasa a codigoInterno (nombre propio del XSD de NC)");
  assert(linea.precioTotalSinImpuesto === 295.65, "Línea NC total: base íntegra de la línea original");
  assert(linea.impuestos[0].tarifa === 15 && linea.impuestos[0].valor === 44.35, "Línea NC: conserva la tarifa de IVA de la factura original");
  assert(linea.shippingItemId === "rec1e1NPbNTBbJh0r" && linea.devolucionFisica === true, "Línea NC: conserva la marca de inventario y la devolución física");
  const sri = round2(round2(linea.cantidad * linea.precioUnitario) - linea.descuento);
  assert(sri === linea.precioTotalSinImpuesto, "Línea NC: cumple la ecuación del SRI (cantidad × unitario − descuento = base)");
}

{
  // NC parcial: 2 de 5 unidades de una línea de $500 base
  const original: DetalleFactura = {
    ...lineaFactura, cantidad: 5, precioUnitario: 100, precioTotalSinImpuesto: 500,
    impuestos: [{ codigo: "2", codigoPorcentaje: "4", tarifa: 15, baseImponible: 500, valor: 75 }],
  };
  const linea = construirLineaNotaCredito(original, 2, true);
  assert(linea.precioTotalSinImpuesto === 200, "NC parcial: acredita proporcional (2 de 5 → 200 de 500)");
  assert(linea.impuestos[0].valor === 30, "NC parcial: el IVA también es proporcional (15% de 200 = 30)");
  const sri = round2(round2(linea.cantidad * linea.precioUnitario) - linea.descuento);
  assert(sri === 200, "NC parcial: ecuación del SRI exacta");
}

{
  const totales = calcularTotalesNotaCredito([construirLineaNotaCredito(lineaFactura, 1, true)]);
  assert(totales.totalSinImpuestos === 295.65, "Totales NC: base");
  assert(totales.valorModificacion === 340, "Totales NC: valorModificacion = base + IVA = 340 (el total de la factura)");
  assert(totales.totalConImpuestos.length === 1 && totales.totalConImpuestos[0].valor === 44.35, "Totales NC: agrupa por tarifa");
}

// ─── A. XML ──────────────────────────────────────────────────────────────────

const detalleNC = construirLineaNotaCredito(lineaFactura, 1, true);
const totalesNC = calcularTotalesNotaCredito([detalleNC]);

const xml = construirNotaCreditoXml({
  ambiente: "1",
  razonSocial: "BOLAÑOS FLORES ALEXIS RUBEN",
  nombreComercial: "SUPER TIENDA GEEK",
  ruc: "1003710272001",
  claveAcceso: "2007202604100371027200110010020000000029876543218",
  estab: "001",
  ptoEmi: "002",
  secuencial: "000000002",
  dirMatriz: "Cristobal Colón y Atahualpa",
  fechaEmision: new Date(2026, 6, 20),
  dirEstablecimiento: "C. Vicente Ramón Roca",
  tipoIdentificacionComprador: "04",
  razonSocialComprador: "ALEXIS BOLAÑOS",
  identificacionComprador: "1003710272001",
  obligadoContabilidad: "NO",
  codDocModificado: "01",
  numDocModificado: "001-002-000000681",
  fechaEmisionDocSustento: new Date(2026, 6, 20),
  totalSinImpuestos: totalesNC.totalSinImpuestos,
  valorModificacion: totalesNC.valorModificacion,
  moneda: "DOLAR",
  totalConImpuestos: totalesNC.totalConImpuestos,
  motivo: "Devolución de equipo por cambio a otro modelo",
  detalles: [detalleNC],
  infoAdicional: [{ nombre: "Vendedor", valor: "Alexis Bolaños" }],
});

assert(xml.includes('<notaCredito id="comprobante" version="1.1.0">'), "XML: raíz notaCredito v1.1.0");
assert(xml.includes("<codDoc>04</codDoc>"), "XML: codDoc 04 (nota de crédito)");
assert(xml.includes("<infoNotaCredito>"), "XML: bloque infoNotaCredito (no infoFactura)");
assert(xml.includes("<codDocModificado>01</codDocModificado>"), "XML: codDocModificado 01 (modifica una factura)");
assert(xml.includes("<numDocModificado>001-002-000000681</numDocModificado>"), "XML: numDocModificado con el número de la factura original");
assert(xml.includes("<fechaEmisionDocSustento>20/07/2026</fechaEmisionDocSustento>"), "XML: fechaEmisionDocSustento en formato DD/MM/AAAA");
assert(xml.includes("<valorModificacion>340.00</valorModificacion>"), "XML: valorModificacion con 2 decimales");
assert(xml.includes("<motivo>Devolución de equipo por cambio a otro modelo</motivo>"), "XML: motivo");
assert(xml.includes("<codigoInterno>DES-000005</codigoInterno>"), "XML: la línea usa codigoInterno (NO codigoPrincipal)");
assert(!xml.includes("codigoPrincipal"), "XML: nunca debe aparecer codigoPrincipal (es de factura, el XSD de NC lo rechaza)");

// totalImpuesto de NC: exactamente 4 hijos, sin tarifa
{
  const bloque = xml.slice(xml.indexOf("<totalConImpuestos>"), xml.indexOf("</totalConImpuestos>"));
  assert(!bloque.includes("<tarifa>"), "XML: totalImpuesto de NC NO lleva <tarifa> (el XSD v1.1.0 no la admite)");
  assert(bloque.includes("<baseImponible>295.65</baseImponible>") && bloque.includes("<valor>44.35</valor>"), "XML: totalImpuesto con base y valor correctos");
}
// El impuesto DE LÍNEA sí lleva tarifa
{
  const bloque = xml.slice(xml.indexOf("<detalles>"));
  assert(bloque.includes("<tarifa>15.00</tarifa>"), "XML: el impuesto de línea SÍ lleva tarifa");
}
assert(!xml.includes("<pagos>") && !xml.includes("<totalDescuento>"), "XML: NC no lleva pagos ni totalDescuento (son de factura)");
assert(xml.indexOf("<infoTributaria>") < xml.indexOf("<infoNotaCredito>") && xml.indexOf("<infoNotaCredito>") < xml.indexOf("<detalles>"), "XML: orden de bloques infoTributaria → infoNotaCredito → detalles");

// ─── C. Reglas ───────────────────────────────────────────────────────────────

const facturaOk = {
  estado: "AUTORIZADO",
  tipoIdentificacionComprador: "04",
  fechaEmision: new Date(2026, 6, 20),
  importeTotal: 340,
  totalYaAcreditado: 0,
};
const ahora = new Date(2026, 6, 20);

assert(evaluarNotaCreditoPermitida(facturaOk, 340, ahora) === null, "Regla: factura autorizada con RUC y monto válido → permitida");

{
  const r = evaluarNotaCreditoPermitida({ ...facturaOk, tipoIdentificacionComprador: "07" }, 340, ahora);
  assert(!!r && r.motivo.includes("CONSUMIDOR FINAL"), "Regla: consumidor final SIEMPRE bloqueado (regla SRI 2026)");
}
{
  const r = evaluarNotaCreditoPermitida({ ...facturaOk, estado: "DEVUELTA" }, 340, ahora);
  assert(!!r && r.motivo.includes("AUTORIZADA"), "Regla: solo sobre facturas AUTORIZADAS");
}
{
  // 7 meses después → fuera del límite interno de 6 meses
  const r = evaluarNotaCreditoPermitida(facturaOk, 340, new Date(2027, 1, 20));
  assert(!!r && r.motivo.includes("límite interno"), "Regla: pasado el límite interno de 6 meses, bloquea aclarando que no es del SRI");
}
{
  // 5 meses después → dentro del límite
  assert(evaluarNotaCreditoPermitida(facturaOk, 340, new Date(2026, 11, 20)) === null, "Regla: dentro de los 6 meses, permitida");
}
{
  const r = evaluarNotaCreditoPermitida({ ...facturaOk, totalYaAcreditado: 200 }, 200, ahora);
  assert(!!r && r.motivo.includes("disponible"), "Regla: no se puede acreditar más que el saldo no acreditado de la factura");
}
{
  assert(evaluarNotaCreditoPermitida({ ...facturaOk, totalYaAcreditado: 200 }, 140, ahora) === null, "Regla: acreditar exactamente el saldo disponible sí se permite");
}
{
  assert(!!validarMotivo("ajuste"), "Regla: motivo genérico corto rechazado");
  assert(validarMotivo("Devolución de equipo por falla de temperatura") === null, "Regla: motivo específico aceptado");
}

// ─── D. Fecha límite de aceptación (5 días hábiles, regla SRI 2026) ─────────

{
  // Lunes 20-jul-2026 → +5 hábiles = lunes 27
  const limite = fechaLimiteAceptacion(new Date(2026, 6, 20));
  assert(limite.getDate() === 27 && limite.getMonth() === 6, "Aceptación: lunes + 5 hábiles = lunes siguiente (salta el fin de semana)");
}
{
  // Jueves 23-jul-2026 → +5 hábiles = jueves 30
  const limite = fechaLimiteAceptacion(new Date(2026, 6, 23));
  assert(limite.getDate() === 30, "Aceptación: jueves + 5 hábiles = jueves siguiente");
  assert(limite.getDay() !== 0 && limite.getDay() !== 6, "Aceptación: la fecha límite nunca cae en fin de semana");
}

if (fallos > 0) {
  console.error(`\n❌ notaCredito.test.ts — ${fallos} aserción(es) fallida(s)`);
  process.exit(1);
}
console.log("\n✅ notaCredito.test.ts — todos los asserts pasaron");
