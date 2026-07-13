/**
 * Test §9 #14 (Fase 20.3) — crearMovimientoManual(): un Egreso nunca bloquea
 * por saldo. Egreso manual por más del saldo disponible de la cuenta se
 * crea igual, con Alerta Descuadre = true (mismo mecanismo del test #3 de
 * 20.1, verificado a través de este flujo específico).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-3.14.movimiento-manual-egreso-no-bloquea.test.ts
 */

import { crearMovimientoManual } from "../movimiento-manual";
import { calcularSaldoCuenta } from "../saldos";
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

async function main() {
  activarEnvFalso();
  __resetCacheNombreTablaParaPruebas();
  const state = crearEstadoDouble("Movimientos Financieros");
  const cajaId = crearCuentaDouble(state, { nombre: "Caja Registradora", tipo: "Temporal", saldoInicial: 0, fechaCorte: "2026-01-01" });
  global.fetch = construirFetchDouble(state) as typeof fetch;

  const movimiento = await crearMovimientoManual({
    tipo: "Egreso",
    categoria: "Otro",
    monto: 10,
    cuentaId: cajaId,
    fecha: "2026-07-16T10:00:00.000Z",
    observacion: "Compra de insumos de oficina",
    registradoPor: "Test",
  });

  assert(movimiento.alertaDescuadre === true, "El Egreso se crea con Alerta Descuadre = true");
  const saldo = await calcularSaldoCuenta(cajaId);
  assert(saldo === -10, `El saldo calculado refleja el descuadre real (obtenido: $${saldo})`);

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — un Egreso manual nunca bloquea por saldo, queda flagueado.");
}

const fetchOriginal = global.fetch;
main();
