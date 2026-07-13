/**
 * Test §9 #18 (Fase 20.3, Corrección 4) — conservación: pendiente creado
 * antes del go-live, acreditado después. Cuenta Tránsito con Saldo Inicial
 * = suma de brutos pendientes al momento del conteo ($30.00, no dinero
 * físico) y Fecha de Corte = D; el pendiente tiene Fecha del movimiento < D.
 * calcularSaldoCuenta(Tránsito) antes de acreditar = $30.00 exacto (el
 * Saldo Inicial, el propio pendiente nunca suma por fecha). Acreditar con
 * fecha ≥ D y neto $28.80 → calcularSaldoCuenta(Tránsito) después = $0.00
 * (nunca negativo), calcularSaldoCuenta(SGINGRESOS) sube exactamente $28.80.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-3.18.conservacion-pendiente-pre-corte.test.ts
 */

import { procesarAcreditacion } from "../acreditacion";
import { crearMovimiento } from "../movimientos";
import { calcularSaldoCuenta } from "../saldos";
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

  const FECHA_CORTE = "2026-07-14";
  // El pendiente se creó ANTES del corte (arrastrado desde antes del go-live).
  const FECHA_PENDIENTE = "2026-07-10T10:00:00.000Z";
  const FECHA_ACREDITACION = "2026-07-16T10:00:00.000Z"; // posterior al corte

  // Instrucción operativa de conteo (§3.7): Saldo Inicial de una cuenta
  // Tránsito = suma de los brutos todavía Pendiente en ese momento, NO
  // dinero físico contado (no existe ninguno).
  const transitoId = crearCuentaDouble(state, { nombre: "Tarjetas en Tránsito", tipo: "Tránsito", saldoInicial: 30, fechaCorte: FECHA_CORTE });
  const sgIngresosId = crearCuentaDouble(state, { nombre: "SGINGRESOS", tipo: "Principal", saldoInicial: 0, fechaCorte: FECHA_CORTE });
  permitirTransferencia(state, transitoId, sgIngresosId);
  global.fetch = construirFetchDouble(state) as typeof fetch;

  const pendiente = await crearMovimiento({
    tipo: "Ingreso",
    origen: "Facturación",
    categoria: "Venta Mostrador",
    monto: 30,
    cuentaDestinoId: transitoId,
    estado: "Pendiente",
    fecha: FECHA_PENDIENTE,
    registradoPor: "Test",
  });

  const saldoAntes = await calcularSaldoCuenta(transitoId);
  assert(saldoAntes === 30, `Saldo Tránsito antes de acreditar = $30.00 exacto, el Saldo Inicial (obtenido: $${saldoAntes})`);

  await procesarAcreditacion(pendiente.id, { montoNeto: 28.8, fecha: FECHA_ACREDITACION, registradoPor: "Test" });

  const saldoDespuesTransito = await calcularSaldoCuenta(transitoId);
  const saldoDespuesSgIngresos = await calcularSaldoCuenta(sgIngresosId);
  assert(saldoDespuesTransito === 0, `Saldo Tránsito después = $0.00, nunca negativo (obtenido: $${saldoDespuesTransito})`);
  assert(saldoDespuesSgIngresos === 28.8, `Saldo SGINGRESOS sube exactamente $28.80 (obtenido: $${saldoDespuesSgIngresos})`);

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — conservación correcta para un pendiente pre-corte acreditado post-corte.");
}

const fetchOriginal = global.fetch;
main();
