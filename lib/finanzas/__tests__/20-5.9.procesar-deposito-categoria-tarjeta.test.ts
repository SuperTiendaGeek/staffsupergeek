/**
 * Test §9 #19 del diseño de Fase 20.5 (Corrección 4) — procesarDeposito usa
 * la categoría "Pago Tarjeta de Crédito" cuando la Cuenta Destino es una
 * tarjeta de crédito, y sigue usando "Depósito de Caja" para cualquier otro
 * destino (sin regresión sobre el comportamiento de 20.3).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-5.9.procesar-deposito-categoria-tarjeta.test.ts
 */

import { procesarDeposito } from "../deposito";
import { MOVIMIENTOS_FIELDS } from "../movimientos-fields";
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

  // --- Destino tarjeta de crédito → categoría "Pago Tarjeta de Crédito" ---
  {
    __resetCacheNombreTablaParaPruebas();
    const state = crearEstadoDouble("Movimientos Financieros");
    global.fetch = construirFetchDouble(state) as typeof fetch;

    const sgCapitalId = crearCuentaDouble(state, { nombre: "SGCAPITAL", tipo: "Final", saldoInicial: 500, fechaCorte: "2026-07-01T00:00:00.000Z" });
    const tarjetaId = crearCuentaDouble(state, { nombre: "Tarjeta X", tipo: "Tarjeta de Crédito", saldoInicial: -150, fechaCorte: "2026-07-01T00:00:00.000Z" });
    permitirTransferencia(state, sgCapitalId, tarjetaId);

    const movimiento = await procesarDeposito({
      cuentaOrigenId: sgCapitalId,
      cuentaDestinoId: tarjetaId,
      monto: 150,
      fecha: "2026-07-19T12:00:00.000Z",
      registradoPor: "Test",
    });

    assert(movimiento.categoria === "Pago Tarjeta de Crédito", `La categoría es "Pago Tarjeta de Crédito" (obtenido: "${movimiento.categoria}")`);
  }

  // --- Destino cuenta normal (SGINGRESOS) → sigue siendo "Depósito de Caja" ---
  {
    __resetCacheNombreTablaParaPruebas();
    const state = crearEstadoDouble("Movimientos Financieros");
    global.fetch = construirFetchDouble(state) as typeof fetch;

    const cajaId = crearCuentaDouble(state, { nombre: "Caja Registradora", tipo: "Temporal", saldoInicial: 200, fechaCorte: "2026-07-01T00:00:00.000Z" });
    const sgIngresosId = crearCuentaDouble(state, { nombre: "SGINGRESOS", tipo: "Principal", saldoInicial: 0, fechaCorte: "2026-07-01T00:00:00.000Z" });
    permitirTransferencia(state, cajaId, sgIngresosId);

    const movimiento = await procesarDeposito({
      cuentaOrigenId: cajaId,
      cuentaDestinoId: sgIngresosId,
      monto: 200,
      fecha: "2026-07-19T12:00:00.000Z",
      registradoPor: "Test",
    });

    assert(movimiento.categoria === "Depósito de Caja", `La categoría sigue siendo "Depósito de Caja" para un destino que no es tarjeta (obtenido: "${movimiento.categoria}")`);
  }

  // Verificación adicional: el campo de Categoría en el store crudo también quedó correcto (no solo el mapper).
  {
    __resetCacheNombreTablaParaPruebas();
    const state = crearEstadoDouble("Movimientos Financieros");
    global.fetch = construirFetchDouble(state) as typeof fetch;
    const sgCapitalId = crearCuentaDouble(state, { nombre: "SGCAPITAL", tipo: "Final", saldoInicial: 500, fechaCorte: "2026-07-01T00:00:00.000Z" });
    const tarjetaId = crearCuentaDouble(state, { nombre: "Tarjeta Y", tipo: "Tarjeta de Crédito", saldoInicial: -50, fechaCorte: "2026-07-01T00:00:00.000Z" });
    permitirTransferencia(state, sgCapitalId, tarjetaId);

    const movimiento = await procesarDeposito({
      cuentaOrigenId: sgCapitalId,
      cuentaDestinoId: tarjetaId,
      monto: 50,
      fecha: "2026-07-19T12:00:00.000Z",
      registradoPor: "Test",
    });
    const registroCrudo = state.movimientos.get(movimiento.id)!;
    assert(
      registroCrudo.fields[MOVIMIENTOS_FIELDS.categoria] === "Pago Tarjeta de Crédito",
      "El campo Categoría en Airtable también quedó como 'Pago Tarjeta de Crédito'"
    );
  }

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — procesarDeposito clasifica correctamente el pago de tarjeta con su propia categoría.");
}

const fetchOriginal = global.fetch;
main();
