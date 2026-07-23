/**
 * Test — control de fechas de anulación (Fase 18 PR5).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/anulacion.fechas.test.ts
 *
 * Regla: se puede anular hasta el día 7 del mes siguiente a la emisión; si el
 * 7 cae sábado/domingo, se corre al lunes.
 */

import { fechaLimiteAnulacion, diasRestantesAnulacion, dentroDelPlazoAnulacion } from "../anulaciones/fechas";

let fallos = 0;
function assert(cond: boolean, msg: string): void { if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); } }

// Emisión julio 2026 → límite 7 de agosto 2026. El 7-ago-2026 es viernes (hábil).
{
  const limite = fechaLimiteAnulacion(new Date(2026, 6, 20));
  assert(limite.getFullYear() === 2026 && limite.getMonth() === 7 && limite.getDate() === 7, "Julio → 7 de agosto (viernes, hábil)");
}
// Emisión de un día temprano del mes → mismo límite (día 7 del mes siguiente).
{
  const limite = fechaLimiteAnulacion(new Date(2026, 6, 2));
  assert(limite.getMonth() === 7 && limite.getDate() === 7, "Julio (día 2) → también 7 de agosto");
}
// Diciembre → 7 de enero del año siguiente.
{
  const limite = fechaLimiteAnulacion(new Date(2026, 11, 15));
  assert(limite.getFullYear() === 2027 && limite.getMonth() === 0 && limite.getDate() === 7, "Diciembre → 7 de enero del año siguiente");
}
// El 7 cae fin de semana → se corre a lunes. Nov 2026: 7-nov-2026 es sábado → lunes 9.
{
  const limite = fechaLimiteAnulacion(new Date(2026, 9, 20)); // octubre → 7 de noviembre
  assert(limite.getMonth() === 10 && limite.getDate() === 9, "Octubre → 7-nov es sábado → corre a lunes 9");
  assert(limite.getDay() !== 0 && limite.getDay() !== 6, "El límite corrido nunca cae en fin de semana");
}

// Días restantes / dentro del plazo.
{
  const emision = new Date(2026, 6, 20); // límite 7-ago
  assert(diasRestantesAnulacion(emision, new Date(2026, 7, 5)) === 2, "5-ago vs límite 7-ago: 2 días");
  assert(dentroDelPlazoAnulacion(emision, new Date(2026, 7, 7)) === true, "El mismo día del límite todavía se puede");
  assert(dentroDelPlazoAnulacion(emision, new Date(2026, 7, 8)) === false, "Un día después del límite ya no se puede");
}

if (fallos > 0) { console.error(`\n❌ anulacion.fechas.test.ts — ${fallos} fallidas`); process.exit(1); }
console.log("\n✅ anulacion.fechas.test.ts — todos los asserts pasaron");
