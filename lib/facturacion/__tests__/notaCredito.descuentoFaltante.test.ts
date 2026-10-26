/**
 * Test — descontar un faltante de una línea de la nota de crédito (26-oct-2026).
 * Ejecutar: npm test notaCredito.descuentoFaltante
 *
 * Caso real: factura 001-002-000000793. El cliente devuelve la MacBook
 * (LAP-000120, $420 con IVA) pero perdió el cargador y acepta que se le
 * descuenten $70. La nota de crédito debe acreditar $350 y cuadrar ante el SRI.
 */

import {
  baseAcreditadaLinea,
  leerMontoDescuento,
  calcularTotalesNotaCredito,
  construirLineaNotaCredito,
  validarDescuentoLinea,
  round2,
} from "../notaCredito/calculos";
import type { DetalleFactura } from "../types/factura";
import { construirNotaCreditoXml } from "../notaCredito/construirNotaCreditoXml";
import { validarNotaCreditoXml } from "../notaCredito/validarNotaCredito";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

// Línea tal cual está guardada en "Líneas JSON" de la factura 793.
const LAPTOP = {
  codigoPrincipal: "LAP-000120",
  descripcion: "Laptop Apple MacBook Air 2020 A2179 13\" 128GB SSD 8GB DDR4 c/ cargador",
  unidadMedida: "Unidad",
  cantidad: 1,
  precioUnitario: 365.22,
  descuento: 0,
  precioTotalSinImpuesto: 365.22,
  impuestos: [{ codigo: "2", codigoPorcentaje: "4", tarifa: 15, baseImponible: 365.22, valor: 54.78 }],
  tipo: "producto",
  shippingItemId: "recLstT2tE0bwVbvb",
} as unknown as DetalleFactura;

console.log("\n── el caso de la MacBook sin cargador ──");
{
  const linea = construirLineaNotaCredito(LAPTOP, 1, true, { condicion: "falla", notaFalla: "No enciende" },
    { descontar: 70, concepto: "Cargador original no devuelto" });
  const t = calcularTotalesNotaCredito([linea]);

  assert(linea.precioTotalSinImpuesto === 304.35, `Base acreditada $304.35 (es ${linea.precioTotalSinImpuesto})`);
  assert(linea.impuestos[0].valor === 45.65, `IVA acreditado $45.65 (es ${linea.impuestos[0].valor})`);
  assert(t.valorModificacion === 350, `Total de la nota de crédito $350.00 (es ${t.valorModificacion})`);
  assert(linea.precioUnitario === 365.22, "El precio unitario es el de la factura (no se inventa otro)");
  assert(linea.descuento === 60.87, `El descuento en base es $60.87 = $70 / 1.15 (es ${linea.descuento})`);
  assert(round2(linea.cantidad * linea.precioUnitario - linea.descuento) === linea.precioTotalSinImpuesto,
    "Ecuación del SRI: cantidad × precio unitario − descuento = base");
  assert(linea.impuestos[0].tarifa === 15 && linea.impuestos[0].codigoPorcentaje === "4", "Conserva la tarifa de IVA de la factura original");
  assert(linea.impuestos[0].baseImponible === linea.precioTotalSinImpuesto, "Base imponible del impuesto = base de la línea");
  assert(linea.detallesAdicionales?.[0]?.valor.includes("Cargador original no devuelto") === true, "El concepto va como detalle adicional de la línea (queda en el XML)");
  assert(linea.detallesAdicionales?.[0]?.valor.includes("$70.00") === true, "…con el valor descontado");
  assert(linea.devolucionFisica === true && linea.condicionDevolucion === "falla", "La devolución física y la falla siguen igual");

  // Lo que queda facturado al cliente: $450 − $350 = $100 (dock $30 + cargador $70).
  assert(round2(450 - t.valorModificacion) === 100, "La factura queda vigente por $100: el dock y el cargador que el cliente se quedó");
}

console.log("\n── sin descuento, nada cambia ──");
{
  const linea = construirLineaNotaCredito(LAPTOP, 1, true, { condicion: "buena" });
  assert(linea.precioTotalSinImpuesto === 365.22 && linea.descuento === 0, "Línea completa: $365.22 sin descuento");
  assert(calcularTotalesNotaCredito([linea]).valorModificacion === 420, "Total $420.00, como antes");
  assert(linea.detallesAdicionales === undefined, "Sin detalle adicional");
  assert(baseAcreditadaLinea(LAPTOP, 1, 0) === 365.22, "baseAcreditadaLinea sin descuento = base de la factura");
}

console.log("\n── validación ──");
{
  assert(leerMontoDescuento(" 70,50 ") === 70.5, "El formulario admite coma decimal y espacios exteriores");
  assert(leerMontoDescuento("70.5") === 70.5, "El formulario admite punto decimal");
  for (const texto of ["", "70abc", "70.005", "70,00,50", "-5", "Infinity", "1e2"]) {
    assert(leerMontoDescuento(texto) === null, `El formulario rechaza ${JSON.stringify(texto)} sin redondear ni truncar`);
  }
  assert(validarDescuentoLinea(LAPTOP, 1, undefined, undefined) === null, "Sin descuento: válido");
  assert(validarDescuentoLinea(LAPTOP, 1, 70, "Cargador original no devuelto") === null, "$70 con concepto: válido");
  assert(validarDescuentoLinea(LAPTOP, 1, 70, "") !== null, "Sin concepto: se rechaza");
  assert(validarDescuentoLinea(LAPTOP, 1, 70, "x") !== null, "Concepto de una letra: se rechaza");
  assert(validarDescuentoLinea(LAPTOP, 1, -5, "Cargador perdido") !== null, "Negativo: se rechaza");
  assert(validarDescuentoLinea(LAPTOP, 1, 70.005, "Cargador perdido") !== null, "Más de dos decimales: se rechaza");
  assert(validarDescuentoLinea(LAPTOP, 1, "70", "Cargador perdido") !== null, "Texto en vez de número: se rechaza");
  assert(validarDescuentoLinea(LAPTOP, 1, 420, "Todo") !== null, "Descontar todo: se rechaza (esa línea no va en la NC)");
  assert(validarDescuentoLinea(LAPTOP, 1, 500, "Más que la línea") !== null, "Descontar más que la línea: se rechaza");
  assert(validarDescuentoLinea(LAPTOP, 1, Number.NaN, "Cargador perdido") !== null, "NaN: se rechaza");
  assert(validarDescuentoLinea(LAPTOP, 1, Infinity, "Cargador perdido") !== null, "Infinito: se rechaza");
}

console.log("\n── cantidades parciales y descuentos previos ──");
{
  const original = { ...LAPTOP, cantidad: 2, precioUnitario: 100, descuento: 20, precioTotalSinImpuesto: 180 };
  const linea = construirLineaNotaCredito(original, 1, true, { condicion: "buena" }, { descontar: 11.5, concepto: "Accesorio no devuelto" });
  assert(linea.precioTotalSinImpuesto === 80 && linea.descuento === 20, "Una de dos unidades: conserva $10 del descuento original y añade $10 por faltante");
  assert(calcularTotalesNotaCredito([linea]).valorModificacion === 92, "La devolución parcial acredita $92 con IVA");
  assert(validarDescuentoLinea(original, 1, 103.5, "Todo lo devuelto") !== null, "El límite usa solo la cantidad acreditada, no toda la línea original");
}
{
  const original = { ...LAPTOP, precioUnitario: 100, precioTotalSinImpuesto: 100,
    impuestos: [{ ...LAPTOP.impuestos[0], tarifa: 0, codigoPorcentaje: "0", baseImponible: 100, valor: 0 }] };
  const linea = construirLineaNotaCredito(original, 1, false, undefined, { descontar: 20, concepto: "Accesorio no devuelto" });
  assert(linea.descuento === 20 && calcularTotalesNotaCredito([linea]).valorModificacion === 80, "IVA cero: descuenta el importe completo, sin inventar impuesto");
}

console.log("\n── el XML que va al SRI ──");
{
  const linea = construirLineaNotaCredito(LAPTOP, 1, true, { condicion: "falla" },
    { descontar: 70, concepto: "Cargador original no devuelto" });
  const t = calcularTotalesNotaCredito([linea]);
  const xml = construirNotaCreditoXml({
    ambiente: "1", razonSocial: "BOLAÑOS FLORES ALEXIS RUBEN", nombreComercial: "SUPER TIENDA GEEK",
    ruc: "1003710272001", claveAcceso: "1".repeat(49), estab: "001", ptoEmi: "002", secuencial: "000000006",
    dirMatriz: "Otavalo", fechaEmision: new Date(2026, 9, 26),
    tipoIdentificacionComprador: "04", razonSocialComprador: "MARLON TOAPANTA", identificacionComprador: "1004820708001",
    codDocModificado: "01", numDocModificado: "001-002-000000793", fechaEmisionDocSustento: new Date(2026, 9, 21),
    totalSinImpuestos: t.totalSinImpuestos, valorModificacion: t.valorModificacion, moneda: "DOLAR",
    totalConImpuestos: t.totalConImpuestos,
    motivo: "Devolución de laptop por falla; se descuenta el cargador no devuelto", detalles: [linea],
  });
  const v = validarNotaCreditoXml(xml);
  assert(v.valido, `Pasa la validación previa al envío${v.valido ? "" : ": " + v.errores.join("; ")}`);
  assert(xml.includes("<descuento>60.87</descuento>"), "La línea lleva <descuento>60.87</descuento>");
  assert(xml.includes("<precioTotalSinImpuesto>304.35</precioTotalSinImpuesto>"), "…y base 304.35");
  assert(xml.includes("<valorModificacion>350.00</valorModificacion>"), "El valor modificado es 350.00");
  assert(xml.includes('<detAdicional nombre="Descuento"'), "El concepto viaja como detAdicional de la línea");
  assert(!/devolucionFisica|condicion|shippingItemId/.test(xml), "Las marcas internas no se serializan");
}

if (fallos > 0) {
  console.error(`\n❌ notaCredito.descuentoFaltante.test.ts — ${fallos} aserción(es) fallida(s)`);
  process.exit(1);
}
console.log("\n✅ notaCredito.descuentoFaltante.test.ts — todos los asserts pasaron");
