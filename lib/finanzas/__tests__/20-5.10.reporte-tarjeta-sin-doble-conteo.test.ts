/**
 * Test §9 #20 del diseño de Fase 20.5 — calcularReporteDiario no necesita
 * ningún cambio de código para tarjetas: un consumo con tarjeta (Egreso)
 * cae en Egresos por categoría exactamente igual que cualquier otro egreso;
 * un pago de estado de cuenta (Movimiento Interno) cae en Movimientos
 * internos del día — ninguno de los dos aparece en el otro bucket, ni se
 * cuenta dos veces.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-5.10.reporte-tarjeta-sin-doble-conteo.test.ts
 */

import { crearMovimiento } from "../movimientos";
import { calcularReporteDiario } from "../reporte";
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

const FECHA = "2026-07-21T10:00:00.000Z";
const DESDE = "2026-07-21T00:00:00.000";
const HASTA = "2026-07-22T00:00:00.000";

async function main() {
  activarEnvFalso();
  __resetCacheNombreTablaParaPruebas();
  const state = crearEstadoDouble("Movimientos Financieros");
  const sgCapitalId = crearCuentaDouble(state, { nombre: "SGCAPITAL", tipo: "Final", saldoInicial: 500, fechaCorte: "2026-01-01" });
  const tarjetaId = crearCuentaDouble(state, { nombre: "Tarjeta Reporte", tipo: "Tarjeta de Crédito", saldoInicial: -80, fechaCorte: "2026-01-01" });
  permitirTransferencia(state, sgCapitalId, tarjetaId);
  global.fetch = construirFetchDouble(state) as typeof fetch;

  // Consumo con tarjeta — un Egreso normal, categoría real de compra.
  await crearMovimiento({
    tipo: "Egreso",
    origen: "Manual",
    categoria: "Compra Local Repuesto",
    monto: 45,
    cuentaOrigenId: tarjetaId,
    estado: "Confirmado",
    estadoDistribucion: "No aplica",
    fecha: FECHA,
    observacion: "Compra de repuesto con tarjeta",
    registradoPor: "Test",
  });

  // Pago del estado de cuenta — un Movimiento Interno SGCAPITAL → Tarjeta.
  await crearMovimiento({
    tipo: "Movimiento Interno",
    origen: "Manual",
    categoria: "Pago Tarjeta de Crédito",
    monto: 80,
    cuentaOrigenId: sgCapitalId,
    cuentaDestinoId: tarjetaId,
    estado: "Confirmado",
    estadoDistribucion: "No aplica",
    fecha: FECHA,
    registradoPor: "Test",
  });

  const reporte = await calcularReporteDiario({ desde: DESDE, hasta: HASTA });

  assert(reporte.egresos.total === 45, `Egresos del día = $45, solo el consumo (obtenido: $${reporte.egresos.total})`);
  assert(reporte.egresos.porCategoria["Compra Local Repuesto"] === 45, "El consumo de tarjeta cae en Egresos por categoría, igual que cualquier otro egreso");
  assert(reporte.ingresos.total === 0, `Ingresos del día = $0 — el pago de tarjeta NO es un ingreso (obtenido: $${reporte.ingresos.total})`);

  assert(reporte.movimientosInternos.length === 1, `Exactamente 1 movimiento interno del día (obtenido: ${reporte.movimientosInternos.length})`);
  const interno = reporte.movimientosInternos[0];
  assert(interno.monto === 80, "El pago de tarjeta aparece en Movimientos internos del día con su monto correcto");
  assert(interno.categoria === "Pago Tarjeta de Crédito", "Con su categoría propia (Corrección 4)");
  assert(interno.cuentaOrigenNombre === "SGCAPITAL" && interno.cuentaDestinoNombre === "Tarjeta Reporte", "Origen/Destino resueltos correctamente");

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — consumo y pago de tarjeta se clasifican en el reporte sin doble conteo.");
}

const fetchOriginal = global.fetch;
main();
