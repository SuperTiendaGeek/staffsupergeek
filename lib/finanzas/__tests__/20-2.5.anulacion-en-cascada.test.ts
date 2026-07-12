/**
 * Test §7 #5 (Fase 20.2) — Anulación en cascada: anular un abono con
 * movimiento vinculado anula también el movimiento, el saldo de su cuenta
 * vuelve al valor previo, y no se crea ningún movimiento nuevo (mismo
 * criterio que el test #1 de la Fase 20.1 — nunca un reverso).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-2.5.anulacion-en-cascada.test.ts
 */

import { anularMovimientoDeAbono, crearMovimientoParaAbono } from "../puentes/abonos";
import { calcularSaldoCuenta } from "../saldos";
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

  const cajaId = crearCuentaDouble(state, { nombre: "Caja Registradora", saldoInicial: 20, fechaCorte: "2026-01-01" });
  const abonoId = crearRegistroDouble(state, "Abonos", { Monto: 50, "Método de Pago": "Efectivo" });

  const creado = await crearMovimientoParaAbono({
    abonoId,
    monto: 50,
    metodoPago: "Efectivo",
    fecha: "2026-07-12T10:00:00.000Z",
    registradoPor: "Test",
  });
  if (!creado.ok) throw new Error("Setup falló");

  const saldoConAbono = await calcularSaldoCuenta(cajaId);
  assert(saldoConAbono === 70, `Saldo con el abono = $70 (obtenido: $${saldoConAbono})`);
  assert(state.movimientos.size === 1, "Hay 1 movimiento antes de anular");

  const { warning } = await anularMovimientoDeAbono(abonoId);
  assert(warning === null, "Sin factura vinculada, no hay warning");
  assert(state.movimientos.size === 1, "Sigue habiendo 1 movimiento — anular NO crea uno nuevo");
  assert(state.movimientos.get(creado.movimientoId)?.fields["Estado del Movimiento"] === "Anulado", "El movimiento queda Anulado");

  const saldoTrasAnular = await calcularSaldoCuenta(cajaId);
  assert(saldoTrasAnular === 20, `Saldo vuelve exactamente al valor previo ($20, obtenido: $${saldoTrasAnular})`);

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — anulación en cascada, sin duplicar, saldo correcto.");
}

const fetchOriginal = global.fetch;
main();
