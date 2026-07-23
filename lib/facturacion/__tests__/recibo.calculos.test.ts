/**
 * Test — cálculos de recibo (Fase 18 PR4). Sin IVA: total = suma directa.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/recibo.calculos.test.ts
 */

import { totalRecibo, totalLinea } from "../recibos/calculos";
import type { LineaRecibo } from "../recibos/types";

let fallos = 0;
function assert(cond: boolean, msg: string): void { if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); } }

{
  const l: LineaRecibo = { descripcion: "Equipo", cantidad: 2, precioUnitario: 100, descuento: 0 };
  assert(totalLinea(l) === 200, "Línea: 2 × 100 = 200 (sin IVA, precio final)");
}
{
  const l: LineaRecibo = { descripcion: "Con descuento", cantidad: 1, precioUnitario: 340, descuento: 40 };
  assert(totalLinea(l) === 300, "Línea con descuento: 340 - 40 = 300");
}
{
  const lineas: LineaRecibo[] = [
    { descripcion: "A", cantidad: 1, precioUnitario: 340, descuento: 0 },
    { descripcion: "B", cantidad: 2, precioUnitario: 20, descuento: 5 },
  ];
  // 340 + (40 - 5) = 375
  assert(totalRecibo(lineas) === 375, "Total: suma directa sin IVA = 375");
}

if (fallos > 0) { console.error(`\n❌ recibo.calculos.test.ts — ${fallos} fallidas`); process.exit(1); }
console.log("\n✅ recibo.calculos.test.ts — todos los asserts pasaron");
