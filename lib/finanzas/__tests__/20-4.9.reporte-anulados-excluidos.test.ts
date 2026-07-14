/**
 * Test §7 #9 (Fase 20.4) — calcularReporteDiario(): Anulados excluidos. Un
 * movimiento Anulado dentro del rango de fecha no aparece en ningún total
 * (Ingreso, Egreso o Ajuste anulado — los 3 casos).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-4.9.reporte-anulados-excluidos.test.ts
 */

import { calcularReporteDiario } from "../reporte";
import { anularMovimiento, crearMovimiento } from "../movimientos";
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

const FECHA = "2026-07-22T10:00:00.000Z";
const DESDE = "2026-07-22T00:00:00.000";
const HASTA = "2026-07-23T00:00:00.000";

async function main() {
  activarEnvFalso();
  __resetCacheNombreTablaParaPruebas();
  const state = crearEstadoDouble("Movimientos Financieros");
  const cajaId = crearCuentaDouble(state, { nombre: "Caja Registradora", fechaCorte: "2026-01-01" });
  global.fetch = construirFetchDouble(state) as typeof fetch;

  // Un ingreso, un egreso y un ajuste válidos + su equivalente anulado.
  await crearMovimiento({ tipo: "Ingreso", origen: "Manual", categoria: "Otro", monto: 50, cuentaDestinoId: cajaId, estado: "Confirmado", fecha: FECHA, registradoPor: "Test" });
  const ingresoAnulado = await crearMovimiento({ tipo: "Ingreso", origen: "Manual", categoria: "Otro", monto: 999, cuentaDestinoId: cajaId, estado: "Confirmado", fecha: FECHA, registradoPor: "Test" });
  await anularMovimiento(ingresoAnulado.id, "Registrado por error");

  await crearMovimiento({ tipo: "Egreso", origen: "Manual", categoria: "Otro", monto: 10, cuentaOrigenId: cajaId, estado: "Confirmado", fecha: FECHA, observacion: "gasto", registradoPor: "Test" });
  const egresoAnulado = await crearMovimiento({ tipo: "Egreso", origen: "Manual", categoria: "Otro", monto: 888, cuentaOrigenId: cajaId, estado: "Confirmado", fecha: FECHA, observacion: "gasto duplicado", registradoPor: "Test" });
  await anularMovimiento(egresoAnulado.id, "Registrado por error");

  const ajusteAnulado = await crearMovimiento({ tipo: "Ajuste", origen: "Manual", categoria: "Ajuste de Caja", monto: 777, cuentaOrigenId: cajaId, estado: "Confirmado", estadoDistribucion: "Distribuido", rubros: { utilidad: 777, capital: 0, iva: 0, repuestoExterno: 0 }, fecha: FECHA, registradoPor: "Test" });
  await anularMovimiento(ajusteAnulado.id, "Registrado por error");

  const reporte = await calcularReporteDiario({ desde: DESDE, hasta: HASTA });

  assert(reporte.ingresos.total === 50, `Ingresos = $50, el anulado ($999) no cuenta (obtenido: $${reporte.ingresos.total})`);
  assert(reporte.egresos.total === 10, `Egresos = $10, el anulado ($888) no cuenta (obtenido: $${reporte.egresos.total})`);
  assert(reporte.ajustes.total === 0, `Ajustes = $0, el anulado ($777) no cuenta (obtenido: $${reporte.ajustes.total})`);
  assert(Object.keys(reporte.ajustes.porCategoria).length === 0, "Ningún bucket de Ajustes por categoría — el único era el anulado");

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — movimientos Anulados excluidos de los 3 tipos de total.");
}

const fetchOriginal = global.fetch;
main();
