/**
 * Test §9 #5 — Suma de rubros = monto cuando Estado Distribución = Distribuido.
 * Ejecutar: npx tsx lib/finanzas/__tests__/5.suma-rubros.test.ts
 *
 * Puro, sin red.
 */

import { validarSumaRubros } from "../validaciones";

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

// Distribuido: rubros que SÍ suman el monto → aceptado.
assert(
  !lanza(() => validarSumaRubros(100, { capital: 40, utilidad: 52, iva: 8, repuestoExterno: 0 }, "Distribuido")),
  "Distribuido con rubros que suman exacto el monto no lanza"
);

// Distribuido: tolerancia de $0.01 por redondeo.
assert(
  !lanza(() => validarSumaRubros(100, { capital: 40, utilidad: 51.995, iva: 8, repuestoExterno: 0 }, "Distribuido")),
  "Distribuido con diferencia de hasta $0.01 no lanza"
);

// Distribuido: rubros que NO suman el monto → rechazado.
assert(
  lanza(() => validarSumaRubros(100, { capital: 40, utilidad: 40, iva: 8, repuestoExterno: 0 }, "Distribuido")),
  "Distribuido con rubros que no suman el monto lanza"
);

// No distribuido (Sin distribuir / Pendiente de clasificar / No aplica): rubros deben venir vacíos.
for (const estado of ["Sin distribuir", "Pendiente de clasificar", "No aplica"] as const) {
  assert(
    !lanza(() => validarSumaRubros(100, { capital: 0, utilidad: 0, iva: 0, repuestoExterno: 0 }, estado)),
    `${estado} con rubros vacíos no lanza`
  );
  assert(
    lanza(() => validarSumaRubros(100, { capital: 10, utilidad: 0, iva: 0, repuestoExterno: 0 }, estado)),
    `${estado} con algún rubro poblado lanza`
  );
}

// Caso real del diseño (§7 Prueba de Fuego): un egreso de Compra Local Repuesto que consume 100% Repuesto Externo.
assert(
  !lanza(() => validarSumaRubros(50, { capital: 0, utilidad: 0, iva: 0, repuestoExterno: 50 }, "Distribuido")),
  "Egreso 100% Repuesto Externo distribuido no lanza"
);

if (fallos > 0) {
  console.error(`\n${fallos} fallo(s).`);
  process.exit(1);
}
console.log("\nOK — todos los casos de suma de rubros pasaron.");
