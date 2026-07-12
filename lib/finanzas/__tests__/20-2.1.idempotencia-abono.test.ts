/**
 * Test §7 #1 (Fase 20.2) — Idempotencia por abono: llamar
 * crearMovimientoParaAbono() dos veces con el mismo abonoId crea un solo
 * movimiento; la segunda llamada devuelve el mismo movimientoId sin POST
 * adicional.
 * Ejecutar: npx tsx lib/finanzas/__tests__/20-2.1.idempotencia-abono.test.ts
 */

import { crearMovimientoParaAbono } from "../puentes/abonos";
import { __resetCacheNombreTablaParaPruebas } from "../table-names";
import { activarEnvFalso, construirFetchDouble, crearCuentaDouble, crearEstadoDouble, crearRegistroDouble, limpiarEnvFalso } from "./_airtableDouble";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

async function main() {
  activarEnvFalso();
  __resetCacheNombreTablaParaPruebas();
  const state = crearEstadoDouble("Movimientos Financieros");
  global.fetch = construirFetchDouble(state) as typeof fetch;

  crearCuentaDouble(state, { nombre: "Caja Registradora", saldoInicial: 0, fechaCorte: "2026-01-01" });
  const abonoId = crearRegistroDouble(state, "Abonos", {
    Monto: 50,
    "Método de Pago": "Efectivo",
    "Fecha de Abono": "2026-07-12T10:00:00.000Z",
  });

  const primera = await crearMovimientoParaAbono({
    abonoId,
    monto: 50,
    metodoPago: "Efectivo",
    fecha: "2026-07-12T10:00:00.000Z",
    registradoPor: "Test",
  });
  assert(primera.ok, "Primera llamada crea el movimiento sin error");
  assert(state.movimientos.size === 1, "Hay exactamente 1 movimiento tras la primera llamada");

  const segunda = await crearMovimientoParaAbono({
    abonoId,
    monto: 50,
    metodoPago: "Efectivo",
    fecha: "2026-07-12T10:00:00.000Z",
    registradoPor: "Test",
  });
  assert(segunda.ok, "Segunda llamada no lanza");
  assert(state.movimientos.size === 1, "Sigue habiendo exactamente 1 movimiento — no se duplicó");
  if (primera.ok && segunda.ok) {
    assert(primera.movimientoId === segunda.movimientoId, "Ambas llamadas devuelven el mismo movimientoId");
  }

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — idempotencia por abono.");
}

const fetchOriginal = global.fetch;
main();
