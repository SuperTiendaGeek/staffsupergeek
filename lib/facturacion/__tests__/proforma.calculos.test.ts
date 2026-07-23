/**
 * Test — cálculos de proforma (Fase 18 PR3).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/proforma.calculos.test.ts
 */

import { calcularTotalesProforma } from "../proformas/calculos";
import type { LineaProforma } from "../proformas/types";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

// Precio con IVA incluido: 340 → base 295.65 + IVA 44.35
{
  const lineas: LineaProforma[] = [{ descripcion: "Lenovo", cantidad: 1, precioUnitario: 340, descuento: 0, tarifaIva: "4" }];
  const t = calcularTotalesProforma(lineas);
  assert(t.totalSinImpuestos === 295.65, "IVA incluido: base 295.65");
  assert(t.iva === 44.35, "IVA incluido: IVA 44.35");
  assert(t.importeTotal === 340, "IVA incluido: total 340");
}

// Dos líneas, una 15% y otra 0% (exento)
{
  const lineas: LineaProforma[] = [
    { descripcion: "Producto 15%", cantidad: 2, precioUnitario: 115, descuento: 0, tarifaIva: "4" },
    { descripcion: "Servicio exento", cantidad: 1, precioUnitario: 50, descuento: 0, tarifaIva: "1" },
  ];
  const t = calcularTotalesProforma(lineas);
  // 2×115 = 230 con IVA → base 200, IVA 30. Exento: base 50, IVA 0.
  assert(t.totalSinImpuestos === 250, "Mixto: base total 200 + 50 = 250");
  assert(t.iva === 30, "Mixto: IVA solo del 15% = 30");
  assert(t.importeTotal === 280, "Mixto: total 280");
  assert(t.porTarifa.length === 2, "Mixto: dos tarifas en el desglose");
}

// Descuento
{
  const lineas: LineaProforma[] = [{ descripcion: "Con descuento", cantidad: 1, precioUnitario: 115, descuento: 11.5, tarifaIva: "4" }];
  const t = calcularTotalesProforma(lineas);
  assert(t.totalDescuento === 11.5, "Descuento registrado");
  assert(t.importeTotal === 103.5, "Descuento aplicado: 115 - 11.5 = 103.5");
}

if (fallos > 0) {
  console.error(`\n❌ proforma.calculos.test.ts — ${fallos} aserción(es) fallida(s)`);
  process.exit(1);
}
console.log("\n✅ proforma.calculos.test.ts — todos los asserts pasaron");
