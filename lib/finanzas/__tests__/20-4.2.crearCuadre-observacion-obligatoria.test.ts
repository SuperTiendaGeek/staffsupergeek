/**
 * Test §7 #2 (Fase 20.4) — crearCuadre(): observación obligatoria con
 * diferencia. Diferencia ≠ 0 y observación vacía/solo espacios → rechazado,
 * sin llegar al POST. Diferencia = 0 sin observación → se crea igual.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-4.2.crearCuadre-observacion-obligatoria.test.ts
 */

import { crearCuadre } from "../cuadres";
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

async function lanzaAsync(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}

async function main() {
  activarEnvFalso();
  __resetCacheNombreTablaParaPruebas();
  const state = crearEstadoDouble("Movimientos Financieros");
  registrarTablaDouble(state, "Finanzas Cuadres");
  const cajaId = crearCuentaDouble(state, { nombre: "Caja Registradora", saldoInicial: 100, fechaCorte: "2026-01-01" });
  global.fetch = construirFetchDouble(state) as typeof fetch;

  const cantidadAntes = state.otras.get("Finanzas Cuadres")?.size ?? 0;

  assert(
    await lanzaAsync(() => crearCuadre({ cuentaId: cajaId, montoContado: 90, observacion: "", realizadoPor: "Test" })),
    "Diferencia ≠ 0 con observación vacía se rechaza"
  );
  assert(
    await lanzaAsync(() => crearCuadre({ cuentaId: cajaId, montoContado: 90, observacion: "   ", realizadoPor: "Test" })),
    "Diferencia ≠ 0 con observación solo espacios se rechaza"
  );
  assert(state.otras.get("Finanzas Cuadres")?.size === cantidadAntes, "Ningún cuadre se creó tras los rechazos");

  // Diferencia = 0 sin observación → se crea igual.
  const cuadrado = await crearCuadre({ cuentaId: cajaId, montoContado: 100, realizadoPor: "Test" });
  assert(cuadrado.estado === "Cuadrado", "Sin diferencia, la observación no es obligatoria");

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — observación obligatoria solo cuando hay diferencia.");
}

const fetchOriginal = global.fetch;
main();
