/**
 * Test §9 #13 (Fase 20.3) — crearMovimientoManual(): observación
 * obligatoria. Vacía o solo espacios → rechazado, sin llamar a
 * crearMovimiento.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-3.13.movimiento-manual-observacion-obligatoria.test.ts
 */

import { crearMovimientoManual } from "../movimiento-manual";
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
  const cajaId = crearCuentaDouble(state, { nombre: "Caja Registradora", tipo: "Temporal", fechaCorte: "2026-01-01" });
  global.fetch = construirFetchDouble(state) as typeof fetch;

  for (const observacion of ["", "   "]) {
    let lanzo = false;
    try {
      await crearMovimientoManual({
        tipo: "Egreso",
        categoria: "Otro",
        monto: 10,
        cuentaId: cajaId,
        fecha: "2026-07-16T10:00:00.000Z",
        observacion,
        registradoPor: "Test",
      });
    } catch {
      lanzo = true;
    }
    assert(lanzo, `Observación "${observacion}" (vacía o solo espacios) se rechaza`);
  }
  assert(state.movimientos.size === 0, "Ningún registro se creó sin observación válida");

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — observación obligatoria en el movimiento manual, correcta.");
}

const fetchOriginal = global.fetch;
main();
