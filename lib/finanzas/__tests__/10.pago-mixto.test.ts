/**
 * Test §9 #10 — Componentes de pago mixto suman exacto el total (validador
 * construido ya para 20.4, sin necesidad de que 20.4 exista todavía).
 * Ejecutar: npx tsx lib/finanzas/__tests__/10.pago-mixto.test.ts
 *
 * Puro, sin red.
 */

import { validarComponentesPagoMixtoSumanTotal } from "../validaciones";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

function lanza(fn: () => void): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

assert(!lanza(() => validarComponentesPagoMixtoSumanTotal([50, 30, 20], 100)), "Componentes que suman exacto no lanzan");
assert(!lanza(() => validarComponentesPagoMixtoSumanTotal([33.33, 33.33, 33.34], 100)), "Componentes con centavos exactos no lanzan");
assert(lanza(() => validarComponentesPagoMixtoSumanTotal([50, 30, 10], 100)), "Componentes que suman de menos lanzan");
assert(lanza(() => validarComponentesPagoMixtoSumanTotal([50, 30, 30], 100)), "Componentes que suman de más lanzan");
assert(!lanza(() => validarComponentesPagoMixtoSumanTotal([100], 100)), "Un solo componente igual al total no lanza");
assert(!lanza(() => validarComponentesPagoMixtoSumanTotal([], 0)), "Sin componentes y total 0 no lanza");

if (fallos > 0) {
  console.error(`\n${fallos} fallo(s).`);
  process.exit(1);
}
console.log("\nOK — validación de pago mixto correcta.");
