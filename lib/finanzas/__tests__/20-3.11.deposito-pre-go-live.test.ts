/**
 * Test §9 #11 (Fase 20.3, Corrección 3) — procesarDeposito(): bloqueo
 * pre-go-live. Con al menos una de las 2 cuentas sin Fecha de Corte, lanza
 * PreGoLiveError — nunca el mensaje genérico de "saldo insuficiente" —
 * verificando que no se llama a crearMovimiento en absoluto (cero llamadas
 * al doble de Airtable).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-3.11.deposito-pre-go-live.test.ts
 */

import { procesarDeposito } from "../deposito";
import { PreGoLiveError } from "../pre-go-live";
import { __resetCacheNombreTablaParaPruebas } from "../table-names";
import { activarEnvFalso, construirFetchDouble, crearCuentaDouble, crearEstadoDouble, limpiarEnvFalso, permitirTransferencia } from "./_airtableDouble";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

async function escenario(nombre: string, fechaCorteCaja: string | null, fechaCorteSg: string | null) {
  activarEnvFalso();
  __resetCacheNombreTablaParaPruebas();
  const state = crearEstadoDouble("Movimientos Financieros");
  const cajaId = crearCuentaDouble(state, { nombre: "Caja Registradora", tipo: "Temporal", fechaCorte: fechaCorteCaja });
  const sgIngresosId = crearCuentaDouble(state, { nombre: "SGINGRESOS", tipo: "Principal", fechaCorte: fechaCorteSg });
  permitirTransferencia(state, cajaId, sgIngresosId);
  global.fetch = construirFetchDouble(state) as typeof fetch;

  let error: unknown = null;
  try {
    await procesarDeposito({ cuentaOrigenId: cajaId, cuentaDestinoId: sgIngresosId, monto: 80, fecha: "2026-07-16T10:00:00.000Z", registradoPor: "Test" });
  } catch (e) {
    error = e;
  }

  assert(error instanceof PreGoLiveError, `[${nombre}] Lanza PreGoLiveError`);
  assert(state.movimientos.size === 0, `[${nombre}] Cero registros creados — no se llamó a crearMovimiento`);

  limpiarEnvFalso();
}

async function main() {
  await escenario("Caja sin Fecha de Corte", null, "2026-01-01");
  await escenario("SGINGRESOS sin Fecha de Corte", "2026-01-01", null);

  global.fetch = fetchOriginal;

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — el depósito bloquea pre-go-live con el error correcto, sin mutar nada.");
}

const fetchOriginal = global.fetch;
main();
