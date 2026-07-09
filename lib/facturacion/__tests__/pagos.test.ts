/**
 * Test — assertPagosCuadranConTotal() (gancho Fase 16 PR2).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/pagos.test.ts
 *
 * Puro, sin red. Lanza en la primera falla y sale con código distinto de 0.
 */

import { assertPagosCuadranConTotal } from "../reglas/pagos";
import { FacturacionRechazoError } from "../errores";
import type { Pago } from "../types/factura";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

function noLanza(fn: () => void): boolean {
  try { fn(); return true; } catch { return false; }
}
function lanzaRechazo(fn: () => void): boolean {
  try { fn(); return false; } catch (e) { return e instanceof FacturacionRechazoError; }
}

// (mostrador) una sola línea igual al total — nunca falla
{
  const pagos: Pago[] = [{ formaPago: "01", total: 115 }];
  assert(noLanza(() => assertPagosCuadranConTotal(pagos, 115)), "Mostrador: una línea igual al total no debe lanzar");
}

// (gancho) varias líneas que cuadran exacto
{
  const pagos: Pago[] = [{ formaPago: "01", total: 100 }, { formaPago: "20", total: 15 }];
  assert(noLanza(() => assertPagosCuadranConTotal(pagos, 115)), "Varias líneas que suman el total no deben lanzar");
}

// tolerancia de un centavo por redondeo
{
  const pagos: Pago[] = [{ formaPago: "01", total: 33.33 }, { formaPago: "01", total: 33.33 }, { formaPago: "01", total: 33.34 }];
  assert(noLanza(() => assertPagosCuadranConTotal(pagos, 100)), "Diferencia de un centavo por redondeo no debe lanzar");
}

// desface real: debe rechazarse
{
  const pagos: Pago[] = [{ formaPago: "01", total: 50 }];
  assert(lanzaRechazo(() => assertPagosCuadranConTotal(pagos, 115)), "Suma menor al total debe lanzar FacturacionRechazoError");
}
{
  const pagos: Pago[] = [{ formaPago: "01", total: 200 }];
  assert(lanzaRechazo(() => assertPagosCuadranConTotal(pagos, 115)), "Suma mayor al total debe lanzar FacturacionRechazoError");
}

// arreglo vacío: suma 0, no cuadra con un total > 0
{
  assert(lanzaRechazo(() => assertPagosCuadranConTotal([], 115)), "Sin formas de pago y total > 0 debe lanzar");
}

if (fallos > 0) {
  console.error(`\n❌ pagos.test.ts — ${fallos} aserción(es) fallida(s)`);
  process.exit(1);
}
console.log("\n✅ pagos.test.ts — todos los asserts pasaron");
