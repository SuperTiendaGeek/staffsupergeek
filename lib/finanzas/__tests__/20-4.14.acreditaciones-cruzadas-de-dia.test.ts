/**
 * Test §7 #14 (Fase 20.4, Corrección 1) — comportamiento intencional con
 * acreditaciones cruzadas de día. Venta Pendiente con Fecha del movimiento
 * = Día 1; se acredita con fecha = Día 2. El reporte del Día 1 (calculado
 * DESPUÉS de la acreditación) incluye el bruto de la venta en Ingresos,
 * pero NO la comisión en Ajustes ni el Interno-hijo en Movimientos
 * Internos. El reporte del Día 2 incluye la comisión y el Interno-hijo,
 * pero NO el bruto de la venta. Ninguno de los 2 reportes por separado
 * cierra la identidad de §3.4 — solo la suma de ambos días.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-4.14.acreditaciones-cruzadas-de-dia.test.ts
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

const DIA_1_FECHA = "2026-07-25T10:00:00.000Z";
const DIA_1_DESDE = "2026-07-25T00:00:00.000";
const DIA_1_HASTA = "2026-07-26T00:00:00.000";

const DIA_2_FECHA = "2026-07-27T10:00:00.000Z";
const DIA_2_DESDE = "2026-07-27T00:00:00.000";
const DIA_2_HASTA = "2026-07-28T00:00:00.000";

async function main() {
  activarEnvFalso();
  __resetCacheNombreTablaParaPruebas();
  const state = crearEstadoDouble("Movimientos Financieros");
  const transitoId = crearCuentaDouble(state, { nombre: "Tarjetas en Tránsito", tipo: "Tránsito", fechaCorte: "2026-01-01" });
  const sgIngresosId = crearCuentaDouble(state, { nombre: "SGINGRESOS", fechaCorte: "2026-01-01" });
  permitirTransferencia(state, transitoId, sgIngresosId);
  global.fetch = construirFetchDouble(state) as typeof fetch;

  // Venta con tarjeta, Día 1 — queda Pendiente.
  const venta = await crearMovimiento({
    tipo: "Ingreso",
    origen: "Facturación",
    categoria: "Venta Mostrador",
    monto: 30,
    cuentaDestinoId: transitoId,
    estado: "Pendiente",
    fecha: DIA_1_FECHA,
    registradoPor: "Test",
  });

  // Se acredita recién el Día 2.
  await procesarAcreditacion(venta.id, { montoNeto: 28.8, fecha: DIA_2_FECHA, registradoPor: "Test" });

  const reporteDia1 = await calcularReporteDiario({ desde: DIA_1_DESDE, hasta: DIA_1_HASTA });
  const reporteDia2 = await calcularReporteDiario({ desde: DIA_2_DESDE, hasta: DIA_2_HASTA });

  assert(reporteDia1.ingresos.total === 30, `Día 1 incluye el bruto de la venta, retroactivamente (obtenido: $${reporteDia1.ingresos.total})`);
  assert(reporteDia1.ajustes.total === 0, `Día 1 NO incluye la comisión — está fechada Día 2 (obtenido: $${reporteDia1.ajustes.total})`);
  assert(reporteDia1.movimientosInternos.length === 0, "Día 1 NO incluye el Interno-hijo — está fechado Día 2");

  assert(reporteDia2.ingresos.total === 0, `Día 2 NO incluye el bruto de la venta — su fecha sigue siendo Día 1 (obtenido: $${reporteDia2.ingresos.total})`);
  assert(reporteDia2.ajustes.total === -1.2, `Día 2 incluye la comisión (obtenido: $${reporteDia2.ajustes.total})`);
  assert(reporteDia2.movimientosInternos.length === 1, "Día 2 incluye el Interno-hijo");

  const identidadDia1 = round2(reporteDia1.ingresos.total - reporteDia1.egresos.total + reporteDia1.ajustes.total);
  const identidadDia2 = round2(reporteDia2.ingresos.total - reporteDia2.egresos.total + reporteDia2.ajustes.total);

  const cambioNetoRealCombinado = round2((await calcularSaldoCuenta(transitoId)) + (await calcularSaldoCuenta(sgIngresosId)));

  assert(identidadDia1 !== cambioNetoRealCombinado, `La identidad del Día 1 sola ($${identidadDia1}) NO es el cambio neto real combinado — no cierra sola`);
  assert(identidadDia2 !== cambioNetoRealCombinado, `La identidad del Día 2 sola ($${identidadDia2}) NO es el cambio neto real combinado — no cierra sola`);
  assert(
    round2(identidadDia1 + identidadDia2) === cambioNetoRealCombinado,
    `La SUMA de ambos días ($${round2(identidadDia1 + identidadDia2)}) sí es el cambio neto real combinado ($${cambioNetoRealCombinado})`
  );

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — comportamiento de acreditaciones cruzadas de día, correcto e intencional.");
}

const fetchOriginal = global.fetch;
main();
