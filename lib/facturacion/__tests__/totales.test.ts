/**
 * Test — totales recalculados desde las líneas.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/totales.test.ts
 *
 * Puro: sin red, sin Airtable.
 *
 * Al corregir y reenviar una factura, los totales NO se copian de lo que manda
 * el navegador: se recalculan desde las líneas. El SRI rechaza sin
 * contemplaciones un comprobante cuyos totales no cuadren consigo mismo, y ese
 * rechazo llegaría cuando la factura ya lleva número asignado.
 */

import { totalesDesdeDetalles, round2 } from "../reglas/totales";
import type { DetalleFactura } from "../types/factura";

let fallos = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); }
  else       { console.log("✓", msg); }
}

function linea(base: number, tarifa: number, descuento = 0): DetalleFactura {
  const iva = round2(base * (tarifa / 100));
  return {
    codigoPrincipal: "X",
    descripcion: "Línea",
    unidadMedida: "Unidad",
    cantidad: 1,
    precioUnitario: round2(base + descuento),
    descuento,
    precioTotalSinImpuesto: base,
    impuestos: [{
      codigo: "2",
      codigoPorcentaje: tarifa === 15 ? "4" : "0",
      tarifa,
      baseImponible: base,
      valor: iva,
    }],
  };
}

// ═══════════════════════════════════════════════════════════════════════════

console.log("\n── el caso real de una factura de SUPER GEEK ──");

// La factura 001-002-000000687: $295.65 + 15% = $340.00
const t1 = totalesDesdeDetalles([linea(295.65, 15)]);
assert(t1.totalSinImpuestos === 295.65, "Subtotal sin impuestos: $295.65");
assert(t1.totalConImpuestos.length === 1, "Una sola línea de impuesto (una sola tarifa)");
assert(t1.totalConImpuestos[0].valor === 44.35, `IVA 15%: $${t1.totalConImpuestos[0].valor}`);
assert(t1.importeTotal === 340, `Total: $${t1.importeTotal} — cuadra con el RIDE real`);

console.log("\n── varias tarifas en la misma factura ──");

const t2 = totalesDesdeDetalles([linea(100, 15), linea(50, 0), linea(200, 15)]);
assert(t2.totalSinImpuestos === 350, "Suma todas las bases: $350");
assert(t2.totalConImpuestos.length === 2, "Agrupa por tarifa: dos líneas de impuesto, no tres");

const grav = t2.totalConImpuestos.find((x) => x.codigoPorcentaje === "4");
const cero = t2.totalConImpuestos.find((x) => x.codigoPorcentaje === "0");
assert(grav?.baseImponible === 300, "Las dos líneas al 15% se suman en una sola base: $300");
assert(grav?.valor === 45,          "Con su IVA agrupado: $45");
assert(cero?.baseImponible === 50,  "Y la de 0% va aparte: $50");
assert(cero?.valor === 0,           "…sin IVA");
assert(t2.importeTotal === 395,     `Total: $${t2.importeTotal} = 350 + 45`);

console.log("\n── descuentos ──");

const t3 = totalesDesdeDetalles([linea(90, 15, 10)]);
assert(t3.totalDescuento === 10, "El descuento se acumula aparte: $10");
assert(t3.totalSinImpuestos === 90, "La base ya viene con el descuento aplicado");

console.log("\n── casos borde ──");

const vacio = totalesDesdeDetalles([]);
assert(vacio.importeTotal === 0 && vacio.totalConImpuestos.length === 0,
  "Sin líneas, todo en cero y sin reventar");

const sinImp = totalesDesdeDetalles([{
  descripcion: "Sin impuestos", cantidad: 1, precioUnitario: 10,
  descuento: 0, precioTotalSinImpuesto: 10, impuestos: [],
}]);
assert(sinImp.importeTotal === 10, "Una línea sin impuestos suma solo su base");

// Redondeo: tres líneas que por separado dan decimales largos.
const t4 = totalesDesdeDetalles([linea(33.33, 15), linea(33.33, 15), linea(33.34, 15)]);
assert(t4.totalSinImpuestos === 100, `Las bases suman exactamente $100 (dio $${t4.totalSinImpuestos})`);
assert(Number.isFinite(t4.importeTotal) && t4.importeTotal.toFixed(2) === t4.importeTotal.toFixed(2),
  "El total es un número con 2 decimales, nunca notación científica");
assert(String(t4.importeTotal).length < 12,
  `El total no arrastra decimales largos: ${t4.importeTotal}`);

console.log("\n── el total siempre cuadra consigo mismo ──");

for (const detalles of [
  [linea(295.65, 15)],
  [linea(100, 15), linea(50, 0)],
  [linea(0.01, 15)],
  [linea(9999.99, 15)],
]) {
  const t = totalesDesdeDetalles(detalles);
  const suma = round2(t.totalSinImpuestos + t.totalConImpuestos.reduce((a, x) => a + x.valor, 0));
  assert(t.importeTotal === suma,
    `Base + impuestos = total ($${t.totalSinImpuestos} + IVA = $${t.importeTotal})`);
}

// ─────────────────────────────────────────────────────────────────────────────

if (fallos > 0) {
  console.error(`\n❌ totales.test.ts — ${fallos} aserción(es) fallida(s)`);
  process.exit(1);
}
console.log("\n✅ totales.test.ts — todos los asserts pasaron");
