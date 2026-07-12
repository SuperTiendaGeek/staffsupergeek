/**
 * Test §7 #3 (Fase 20.2) — Ambiente PRUEBAS ignorado: emitir con
 * ambiente !== "2" no crea ningún movimiento por el puente.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-2.3.ambiente-pruebas-ignorado.test.ts
 */

import { procesarPuenteFacturacion } from "../puentes/facturacion";
import { __resetCacheNombreTablaParaPruebas } from "../table-names";
import { activarEnvFalso, construirFetchDouble, crearCuentaDouble, crearEstadoDouble, limpiarEnvFalso } from "./_airtableDouble";
import type { DatosVenta, ResultadoEmision } from "@/lib/facturacion/emitirFactura";

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

  crearCuentaDouble(state, { nombre: "Caja Registradora", fechaCorte: "2026-01-01" });

  const body = { pagos: [{ formaPago: "01", total: 100 }] } as unknown as DatosVenta;

  // Ambiente "1" = PRUEBAS.
  await procesarPuenteFacturacion(
    { estado: "AUTORIZADO", claveAcceso: "c1", numeroFactura: "n1", recordId: "recFAC_PRUEBAS", ambiente: "1" },
    body,
    "Test"
  );
  assert(state.movimientos.size === 0, "Ambiente PRUEBAS (1) no crea ningún movimiento");

  // Sin ambiente definido (defensivo — nunca debe asumir producción).
  await procesarPuenteFacturacion(
    { estado: "AUTORIZADO", claveAcceso: "c2", numeroFactura: "n2", recordId: "recFAC_SIN_AMBIENTE" } as ResultadoEmision,
    body,
    "Test"
  );
  assert(state.movimientos.size === 0, "Sin ambiente definido tampoco crea movimientos");

  // Control positivo: Ambiente "2" = PRODUCCIÓN sí crea.
  await procesarPuenteFacturacion(
    { estado: "AUTORIZADO", claveAcceso: "c3", numeroFactura: "n3", recordId: "recFAC_PROD", ambiente: "2" },
    body,
    "Test"
  );
  assert(state.movimientos.size === 1, "Ambiente PRODUCCIÓN (2) sí crea el movimiento (control positivo)");

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — Ambiente PRUEBAS ignorado por el puente.");
}

const fetchOriginal = global.fetch;
main();
