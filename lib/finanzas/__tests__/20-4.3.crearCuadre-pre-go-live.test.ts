/**
 * Test §7 #3 (Fase 20.4) — crearCuadre(): pre-go-live bloquea. Cuenta sin
 * Fecha de Corte → PreGoLiveError, cero registros creados en el doble.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-4.3.crearCuadre-pre-go-live.test.ts
 */

import { crearCuadre } from "../cuadres";
import { PreGoLiveError } from "../pre-go-live";
import { __resetCacheNombreTablaParaPruebas } from "../table-names";
import {
  activarEnvFalso,
  construirFetchDouble,
  crearCuentaDouble,
  crearEstadoDouble,
  limpiarEnvFalso,
  registrarTablaDouble,
} from "./_airtableDouble";

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
  registrarTablaDouble(state, "Finanzas Cuadres");
  const cajaId = crearCuentaDouble(state, { nombre: "Caja Registradora", saldoInicial: 100, fechaCorte: null });
  global.fetch = construirFetchDouble(state) as typeof fetch;

  let error: unknown = null;
  try {
    await crearCuadre({ cuentaId: cajaId, montoContado: 100, realizadoPor: "Test" });
  } catch (e) {
    error = e;
  }

  assert(error instanceof PreGoLiveError, "Lanza PreGoLiveError cuando la cuenta no tiene Fecha de Corte");
  assert((state.otras.get("Finanzas Cuadres")?.size ?? 0) === 0, "Cero registros creados en el doble");

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — crearCuadre bloquea pre-go-live correctamente.");
}

const fetchOriginal = global.fetch;
main();
