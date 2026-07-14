/**
 * Test §9 #10 (Fase 20.3) — procesarDeposito(): caso feliz y bloqueo por
 * saldo insuficiente. Dentro del saldo disponible → se crea, saldos
 * correctos en ambas cuentas. Por más del saldo disponible → rechazado
 * antes de llamar a Airtable (mismo mecanismo del test #2 de 20.1).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-3.10.deposito-feliz-y-bloqueo-saldo.test.ts
 */

import { procesarDeposito } from "../deposito";
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
  const cajaId = crearCuentaDouble(state, { nombre: "Caja Registradora", tipo: "Temporal", saldoInicial: 80, fechaCorte: "2026-01-01" });
  const sgIngresosId = crearCuentaDouble(state, { nombre: "SGINGRESOS", tipo: "Principal", saldoInicial: 0, fechaCorte: "2026-01-01" });
  permitirTransferencia(state, cajaId, sgIngresosId);
  global.fetch = construirFetchDouble(state) as typeof fetch;

  const movimiento = await procesarDeposito({
    cuentaOrigenId: cajaId,
    cuentaDestinoId: sgIngresosId,
    monto: 80,
    fecha: "2026-07-16T10:00:00.000Z",
    registradoPor: "Test",
  });
  assert(movimiento.tipo === "Movimiento Interno", "Se crea un Movimiento Interno");
  assert(movimiento.categoria === "Depósito de Caja", "Con categoría Depósito de Caja");

  const saldoCaja = await calcularSaldoCuenta(cajaId);
  const saldoSg = await calcularSaldoCuenta(sgIngresosId);
  assert(saldoCaja === 0, `Saldo Caja tras el depósito = $0.00 (obtenido: $${saldoCaja})`);
  assert(saldoSg === 80, `Saldo SGINGRESOS tras el depósito = $80.00 (obtenido: $${saldoSg})`);

  const cantidadAntes = state.movimientos.size;
  let lanzo = false;
  try {
    await procesarDeposito({
      cuentaOrigenId: cajaId,
      cuentaDestinoId: sgIngresosId,
      monto: 100,
      fecha: "2026-07-16T10:00:00.000Z",
      registradoPor: "Test",
    });
  } catch {
    lanzo = true;
  }
  assert(lanzo, "Depósito por más del saldo disponible se rechaza");
  assert(state.movimientos.size === cantidadAntes, "El rechazo ocurrió antes de llamar a Airtable — cero registros nuevos");

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — depósito de caja feliz y bloqueo por saldo correctos.");
}

const fetchOriginal = global.fetch;
main();
