/**
 * Test §7 #10 (Fase 20.4) — calcularReporteDiario(): Pendientes no suman.
 * Una venta con tarjeta Pendiente del día no cuenta en Ingresos ni en Por
 * método; sí se refleja (indirectamente) en el "por acreditar" global,
 * nunca en el total del día.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-4.10.reporte-pendientes-no-suman.test.ts
 */

import { calcularReporteDiario } from "../reporte";
import { crearMovimiento } from "../movimientos";
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

const FECHA = "2026-07-23T10:00:00.000Z";
const DESDE = "2026-07-23T00:00:00.000";
const HASTA = "2026-07-24T00:00:00.000";

async function main() {
  activarEnvFalso();
  __resetCacheNombreTablaParaPruebas();
  const state = crearEstadoDouble("Movimientos Financieros");
  const cajaId = crearCuentaDouble(state, { nombre: "Caja Registradora", fechaCorte: "2026-01-01" });
  const transitoId = crearCuentaDouble(state, { nombre: "Tarjetas en Tránsito", tipo: "Tránsito", fechaCorte: "2026-01-01" });
  global.fetch = construirFetchDouble(state) as typeof fetch;

  await crearMovimiento({ tipo: "Ingreso", origen: "Abonos", categoria: "Anticipo Cliente", monto: 20, cuentaDestinoId: cajaId, estado: "Confirmado", estadoDistribucion: "Sin distribuir", metodo: "Efectivo", fecha: FECHA, registradoPor: "Test" });
  await crearMovimiento({ tipo: "Ingreso", origen: "Facturación", categoria: "Venta Mostrador", monto: 30, cuentaDestinoId: transitoId, estado: "Pendiente", metodo: "Tarjeta crédito", fecha: FECHA, registradoPor: "Test" });

  const reporte = await calcularReporteDiario({ desde: DESDE, hasta: HASTA });

  assert(reporte.ingresos.total === 20, `Ingresos = $20, el pendiente ($30) no cuenta (obtenido: $${reporte.ingresos.total})`);
  assert(!("Tarjeta crédito" in reporte.ingresos.porMetodo), "El método de la venta pendiente no aparece en el desglose por método");
  assert(reporte.ingresos.porMetodo["Efectivo"] === 20, "El método Efectivo del confirmado sí aparece");
  assert(reporte.porAcreditar === 30, `El pendiente sí se refleja en "por acreditar" global (obtenido: $${reporte.porAcreditar})`);

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — pendientes no suman al total del día, sí aparecen en por-acreditar global.");
}

const fetchOriginal = global.fetch;
main();
