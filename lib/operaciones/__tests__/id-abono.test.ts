/**
 * Numeración de la tabla "Abonos".
 * Ejecutar: npx tsx lib/operaciones/__tests__/id-abono.test.ts
 *
 * El "ID Abono" no es un autoNumber: lo llena el código con máximo + 1. Tres
 * módulos escriben en la misma tabla (técnicos, operaciones y facturación), así
 * que dos cobros simultáneos podían leer el mismo máximo y quedarse con el
 * mismo número, sin que nada lo detectara. Ahora el candidato se contrasta
 * contra los números ya ocupados.
 */

import { elegirSiguienteIdAbono } from "../id-abono";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

// ── Caso normal ─────────────────────────────────────────────────────────────
assert(elegirSiguienteIdAbono(159, [159, 158, 157]) === 160, "Tras el 159 viene el 160");
assert(elegirSiguienteIdAbono(0, []) === 1, "Tabla vacía empieza en 1");
assert(elegirSiguienteIdAbono(1, [1]) === 2, "Con un solo abono, el siguiente es 2");

// ── El caso que motiva todo: el siguiente ya está tomado ────────────────────
{
  // Otro módulo escribió el 160 entre la lectura del máximo y la escritura.
  const elegido = elegirSiguienteIdAbono(159, [160, 159, 158]);
  assert(elegido === 161, `FIX: si el 160 ya está ocupado, salta al 161 (vino ${elegido})`);
}
{
  const elegido = elegirSiguienteIdAbono(159, [162, 161, 160, 159]);
  assert(elegido === 163, `Salta todos los ocupados seguidos (vino ${elegido})`);
}

// ── Huecos en la secuencia ──────────────────────────────────────────────────
{
  // Hay huecos (abonos borrados), pero no se reciclan: se sigue hacia adelante.
  const elegido = elegirSiguienteIdAbono(159, [159, 155, 150]);
  assert(elegido === 160, "No recicla números de abonos borrados: sigue desde el máximo");
}

// ── Entradas raras ──────────────────────────────────────────────────────────
assert(elegirSiguienteIdAbono(0) === 1, "Sin lista de ocupados funciona igual");
assert(elegirSiguienteIdAbono(-5, []) === 1, "Un máximo negativo se trata como 0");
assert(elegirSiguienteIdAbono(Number.NaN, []) === 1, "Un máximo no numérico se trata como 0");
assert(elegirSiguienteIdAbono(10.7, []) === 11, "Un máximo decimal se trunca");
assert(
  elegirSiguienteIdAbono(159, [Number.NaN, 160, Number.POSITIVE_INFINITY]) === 161,
  "Los valores no numéricos de la lista se ignoran"
);

// ── Cota defensiva ──────────────────────────────────────────────────────────
{
  // 1000 números seguidos ocupados: no debe colgarse.
  const muchos = Array.from({ length: 1200 }, (_, i) => 160 + i);
  const elegido = elegirSiguienteIdAbono(159, muchos);
  assert(Number.isFinite(elegido), `No entra en bucle infinito (devolvió ${elegido})`);
}

if (fallos > 0) {
  console.error(`\n${fallos} assert(s) fallaron.`);
  process.exit(1);
}
console.log("\n✅ id-abono.test.ts — todos los asserts pasaron");
