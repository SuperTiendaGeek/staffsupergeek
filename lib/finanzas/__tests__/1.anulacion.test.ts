/**
 * Test §9 #1 — Anulación sin doble conteo (Corrección 1): anular un
 * movimiento NO crea ningún movimiento nuevo; el original queda Anulado
 * con Fecha/Motivo de anulación llenos, y el saldo vuelve exactamente al
 * valor previo a la creación porque Anulado queda excluido de la suma.
 * Ejecutar: npx tsx lib/finanzas/__tests__/1.anulacion.test.ts
 */

import { anularMovimiento, crearMovimiento } from "../movimientos";
import { calcularSaldoCuenta } from "../saldos";
import { __resetCacheNombreTablaParaPruebas } from "../table-names";
import { activarEnvFalso, construirFetchDouble, crearCuentaDouble, crearEstadoDouble, limpiarEnvFalso } from "./_airtableDouble";

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

  const saldoAntes = await calcularSaldoCuenta(cajaId);
  assert(saldoAntes === 20, "Saldo antes de crear el movimiento = Saldo Inicial ($20)");

  const movimiento = await crearMovimiento({
    tipo: "Ingreso",
    origen: "Manual",
    categoria: "Otro",
    monto: 50,
    cuentaDestinoId: cajaId,
    fecha: "2026-07-15T10:00:00.000Z",
    registradoPor: "Test",
  });

  const saldoConMovimiento = await calcularSaldoCuenta(cajaId);
  assert(saldoConMovimiento === 70, `Saldo tras el ingreso = $70 (obtenido: $${saldoConMovimiento})`);
  assert(state.movimientos.size === 1, "Hay exactamente 1 movimiento en el store tras crearlo");

  const anulado = await anularMovimiento(movimiento.id, "Error de captura, monto duplicado.");

  assert(state.movimientos.size === 1, "Anular NO crea ningún movimiento nuevo — sigue habiendo exactamente 1 en el store");
  assert(anulado.estado === "Anulado", "El movimiento original queda con estado Anulado");
  assert(!!anulado.fechaAnulacion, "Fecha de anulación queda llena");
  assert(anulado.motivoAnulacion === "Error de captura, monto duplicado.", "Motivo de anulación queda llenado con el texto dado");

  const saldoDespuesDeAnular = await calcularSaldoCuenta(cajaId);
  assert(saldoDespuesDeAnular === 20, `Saldo tras anular vuelve exactamente al valor previo ($20, obtenido: $${saldoDespuesDeAnular})`);

  // Anular dos veces debe fallar.
  let segundaAnulacionLanzo = false;
  try {
    await anularMovimiento(movimiento.id, "Segundo intento");
  } catch {
    segundaAnulacionLanzo = true;
  }
  assert(segundaAnulacionLanzo, "Anular un movimiento ya Anulado lanza error");

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — anulación sin doble conteo.");
}

const fetchOriginal = global.fetch;
main();
