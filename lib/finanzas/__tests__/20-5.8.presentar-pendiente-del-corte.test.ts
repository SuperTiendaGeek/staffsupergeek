/**
 * Test §9 #18 del diseño de Fase 20.5 — presentarPendienteDelCorte
 * (Corrección 3): saldoUltimoCorte nunca se presenta negativo crudo — un
 * sobrepago se traduce en pendiente: 0 + saldoAFavor > 0, y un pendiente
 * normal en pendiente > 0 + saldoAFavor: 0.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-5.8.presentar-pendiente-del-corte.test.ts
 *
 * Puro, sin red.
 */

import { presentarPendienteDelCorte } from "../tarjetas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

// Caso normal: saldoUltimoCorte positivo → pendiente = el valor, saldoAFavor = 0.
{
  const { pendiente, saldoAFavor } = presentarPendienteDelCorte(150);
  assert(pendiente === 150, `pendiente = 150 (obtenido: ${pendiente})`);
  assert(saldoAFavor === 0, `saldoAFavor = 0 (obtenido: ${saldoAFavor})`);
}

// Caso borde: sobrepago → saldoUltimoCorte negativo → pendiente = 0 (nunca negativo crudo), saldoAFavor = el valor absoluto.
{
  const { pendiente, saldoAFavor } = presentarPendienteDelCorte(-30);
  assert(pendiente === 0, `pendiente = 0, nunca negativo crudo (obtenido: ${pendiente})`);
  assert(saldoAFavor === 30, `saldoAFavor = 30, el valor absoluto correcto (obtenido: ${saldoAFavor})`);
}

// Caso cuadrado exacto: ambos en $0.
{
  const { pendiente, saldoAFavor } = presentarPendienteDelCorte(0);
  assert(pendiente === 0 && saldoAFavor === 0, "Cuadrado exacto: pendiente y saldoAFavor ambos en $0");
}

if (fallos > 0) {
  console.error(`\n${fallos} fallo(s).`);
  process.exit(1);
}
console.log("\nOK — presentarPendienteDelCorte nunca expone un negativo crudo.");
