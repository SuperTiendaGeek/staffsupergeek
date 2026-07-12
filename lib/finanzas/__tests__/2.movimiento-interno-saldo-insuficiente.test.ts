/**
 * Test §9 #2 — Movimiento Interno con saldo insuficiente → rechazado
 * (Corrección 2): crearMovimiento rechaza antes de llamar a Airtable, no se
 * crea nada.
 * Ejecutar: npx tsx lib/finanzas/__tests__/2.movimiento-interno-saldo-insuficiente.test.ts
 */

import { crearMovimiento } from "../movimientos";
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

async function main() {
  activarEnvFalso();
  __resetCacheNombreTablaParaPruebas();
  const state = crearEstadoDouble("Movimientos Financieros");
  global.fetch = construirFetchDouble(state) as typeof fetch;

  const ingresosId = crearCuentaDouble(state, { nombre: "SGINGRESOS", tipo: "Principal", saldoInicial: 10, fechaCorte: "2026-01-01" });
  const capitalId = crearCuentaDouble(state, { nombre: "SGCAPITAL", tipo: "Final", saldoInicial: 0, fechaCorte: "2026-01-01" });
  permitirTransferencia(state, ingresosId, capitalId);

  let lanzo = false;
  let mensaje = "";
  try {
    await crearMovimiento({
      tipo: "Movimiento Interno",
      origen: "Sistema",
      categoria: "Distribución de Rubros",
      monto: 100,
      cuentaOrigenId: ingresosId,
      cuentaDestinoId: capitalId,
      rubros: { capital: 100, utilidad: 0, iva: 0, repuestoExterno: 0 },
      estadoDistribucion: "Distribuido",
      registradoPor: "Test",
    });
  } catch (error) {
    lanzo = true;
    mensaje = error instanceof Error ? error.message : String(error);
  }

  assert(lanzo, "Movimiento Interno por más del saldo disponible ($10) lanza error");
  assert(mensaje.toLowerCase().includes("saldo insuficiente"), `El mensaje de error menciona saldo insuficiente (obtenido: "${mensaje}")`);
  assert(state.movimientos.size === 0, "No se creó ningún registro en el store — el rechazo ocurrió antes de llamar a Airtable");

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — Movimiento Interno con saldo insuficiente rechazado.");
}

const fetchOriginal = global.fetch;
main();
