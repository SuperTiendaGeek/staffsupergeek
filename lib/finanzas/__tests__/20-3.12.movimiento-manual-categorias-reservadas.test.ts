/**
 * Test §9 #12 (Fase 20.3) — crearMovimientoManual(): categorías reservadas
 * rechazadas. "Anticipo Cliente"/"Depósito de Caja"/"Acreditación Pasarela"
 * están reservadas a sus propios flujos — se rechazan antes de llegar a
 * crearMovimiento. Una categoría válida (p. ej. "Otro") se crea normalmente.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-3.12.movimiento-manual-categorias-reservadas.test.ts
 */

import { crearMovimientoManual } from "../movimiento-manual";
import { __resetCacheNombreTablaParaPruebas } from "../table-names";
import { activarEnvFalso, construirFetchDouble, crearCuentaDouble, crearEstadoDouble, limpiarEnvFalso } from "./_airtableDouble";
import type { CategoriaMovimiento } from "@/types/finanzas";

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

  const reservadas: CategoriaMovimiento[] = ["Anticipo Cliente", "Depósito de Caja", "Acreditación Pasarela"];
  for (const categoria of reservadas) {
    let lanzo = false;
    try {
      await crearMovimientoManual({
        tipo: "Ingreso",
        categoria,
        monto: 10,
        cuentaId: cajaId,
        fecha: "2026-07-16T10:00:00.000Z",
        observacion: "prueba",
        registradoPor: "Test",
      });
    } catch {
      lanzo = true;
    }
    assert(lanzo, `Categoría reservada "${categoria}" se rechaza`);
  }
  assert(state.movimientos.size === 0, "Ninguna categoría reservada llegó a crear un registro");

  const movimiento = await crearMovimientoManual({
    tipo: "Ingreso",
    categoria: "Otro",
    monto: 10,
    cuentaId: cajaId,
    fecha: "2026-07-16T10:00:00.000Z",
    observacion: "Ingreso suelto de prueba",
    registradoPor: "Test",
  });
  assert(movimiento.categoria === "Otro", 'Categoría válida ("Otro") se crea normalmente');
  assert(movimiento.origen === "Manual", "Origen queda fijo en Manual");

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — categorías reservadas del movimiento manual rechazadas correctamente.");
}

const fetchOriginal = global.fetch;
main();
