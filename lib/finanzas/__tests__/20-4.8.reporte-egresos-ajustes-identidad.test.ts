/**
 * Test §7 #8 (Fase 20.4) — calcularReporteDiario(): Egresos y Ajustes
 * agrupan por categoría. Réplica del snapshot A de la prueba de fuego (§6
 * del diseño) — verifica los totales/desgloses exactos y la identidad
 * `Ingresos − Egresos + Ajustes = cambio neto de cuentas`, comparada
 * numéricamente contra calcularSaldoCuenta de las 3 cuentas involucradas.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-4.8.reporte-egresos-ajustes-identidad.test.ts
 */

import { procesarAcreditacion } from "../acreditacion";
import { calcularReporteDiario } from "../reporte";
import { crearMovimiento } from "../movimientos";
import { calcularSaldoCuenta } from "../saldos";
import { round2 } from "../validaciones";
import { __resetCacheNombreTablaParaPruebas } from "../table-names";
import {
  activarEnvFalso,
  construirFetchDouble,
  crearCuentaDouble,
  crearEstadoDouble,
  crearRegistroDouble,
  limpiarEnvFalso,
  permitirTransferencia,
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

const FECHA = "2026-07-21T10:00:00.000Z";
const DESDE = "2026-07-21T00:00:00.000";
const HASTA = "2026-07-22T00:00:00.000";

async function main() {
  activarEnvFalso();
  __resetCacheNombreTablaParaPruebas();
  const state = crearEstadoDouble("Movimientos Financieros");
  const cajaId = crearCuentaDouble(state, { nombre: "Caja Registradora", fechaCorte: "2026-01-01" });
  const sgIngresosId = crearCuentaDouble(state, { nombre: "SGINGRESOS", fechaCorte: "2026-01-01" });
  const transitoId = crearCuentaDouble(state, { nombre: "Tarjetas en Tránsito", tipo: "Tránsito", fechaCorte: "2026-01-01" });
  permitirTransferencia(state, transitoId, sgIngresosId);
  global.fetch = construirFetchDouble(state) as typeof fetch;

  const abonoOrden = crearRegistroDouble(state, "Abonos", { "Aplicado a: Orden": ["recOrden001"] });
  const abonoOperacion = crearRegistroDouble(state, "Abonos", { "Aplicado a: Operación": ["recOperacion001"] });

  // Evento 1 y 2 — abonos.
  await crearMovimiento({ tipo: "Ingreso", origen: "Abonos", categoria: "Anticipo Cliente", monto: 50, cuentaDestinoId: cajaId, estado: "Confirmado", estadoDistribucion: "Sin distribuir", fecha: FECHA, registradoPor: "Test", abonoId: abonoOrden });
  await crearMovimiento({ tipo: "Ingreso", origen: "Abonos", categoria: "Anticipo Cliente", monto: 40, cuentaDestinoId: cajaId, estado: "Confirmado", estadoDistribucion: "Sin distribuir", fecha: FECHA, registradoPor: "Test", abonoId: abonoOperacion });

  // Evento 3 — egreso manual.
  await crearMovimiento({ tipo: "Egreso", origen: "Manual", categoria: "Otro", monto: 15, cuentaOrigenId: cajaId, estado: "Confirmado", fecha: FECHA, observacion: "Compra de insumos", registradoPor: "Test" });

  // Evento 4 — venta con tarjeta, pendiente.
  const venta = await crearMovimiento({ tipo: "Ingreso", origen: "Facturación", categoria: "Venta Mostrador", monto: 30, cuentaDestinoId: transitoId, estado: "Pendiente", fecha: FECHA, registradoPor: "Test" });

  // Evento 4b — acreditación, mismo día.
  await procesarAcreditacion(venta.id, { montoNeto: 28.8, fecha: FECHA, registradoPor: "Test" });

  const reporte = await calcularReporteDiario({ desde: DESDE, hasta: HASTA });

  assert(reporte.ingresos.total === 120, `Ingresos = $120 (50+40+30, la venta ya cuenta al estar Acreditada, obtenido: $${reporte.ingresos.total})`);
  assert(reporte.egresos.total === 15, `Egresos = $15 (obtenido: $${reporte.egresos.total})`);
  assert(reporte.egresos.porCategoria["Otro"] === 15, "Egresos por categoría: Otro = $15");
  assert(reporte.ajustes.total === -1.2, `Ajustes = -$1.20 (comisión, obtenido: $${reporte.ajustes.total})`);
  assert(reporte.ajustes.porCategoria["Acreditación Pasarela"] === -1.2, "Ajustes por categoría: Acreditación Pasarela = -$1.20");

  const [saldoCaja, saldoSg, saldoTransito] = await Promise.all([
    calcularSaldoCuenta(cajaId),
    calcularSaldoCuenta(sgIngresosId),
    calcularSaldoCuenta(transitoId),
  ]);
  const cambioNetoReal = round2(saldoCaja + saldoSg + saldoTransito);
  const identidad = round2(reporte.ingresos.total - reporte.egresos.total + reporte.ajustes.total);
  assert(
    identidad === cambioNetoReal,
    `Identidad Ingresos−Egresos+Ajustes ($${identidad}) = cambio neto real de cuentas ($${cambioNetoReal})`
  );

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — Egresos/Ajustes agrupan correcto y la identidad de conservación cierra.");
}

const fetchOriginal = global.fetch;
main();
