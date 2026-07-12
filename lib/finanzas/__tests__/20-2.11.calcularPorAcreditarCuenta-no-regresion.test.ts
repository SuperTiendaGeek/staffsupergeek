/**
 * Test §7 #11 (Fase 20.2, Corrección 2) — calcularPorAcreditarCuenta():
 * cuenta con movimientos Pendiente y Confirmado mezclados — el resultado
 * solo suma los Pendiente, no toca Saldo Inicial. No-regresión:
 * calcularSaldoCuenta de la misma cuenta da el mismo resultado que antes de
 * generalizar fetchMovimientosConfirmadosDeCuenta → fetchMovimientosDeCuentaPorEstado
 * (mismo escenario que el test #4 de la Fase 20.1).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-2.11.calcularPorAcreditarCuenta-no-regresion.test.ts
 */

import { CUENTAS_FIELDS } from "../cuentas";
import { MOVIMIENTOS_FIELDS } from "../movimientos-fields";
import { calcularPorAcreditarCuenta, calcularSaldoCuenta } from "../saldos";
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

function insertarMovimiento(state: ReturnType<typeof crearEstadoDouble>, fields: Record<string, unknown>) {
  const id = `rec${String(state.nextId++).padStart(14, "0")}`;
  const record = { id, createdTime: new Date().toISOString(), fields };
  state.movimientos.set(id, record);
  const destinoIds = (fields[MOVIMIENTOS_FIELDS.cuentaDestino] as string[] | undefined) ?? [];
  const origenIds = (fields[MOVIMIENTOS_FIELDS.cuentaOrigen] as string[] | undefined) ?? [];
  for (const cuentaId of destinoIds) {
    const cuenta = state.cuentas.get(cuentaId)!;
    cuenta.fields[CUENTAS_FIELDS.movimientosDestino] = [...((cuenta.fields[CUENTAS_FIELDS.movimientosDestino] as string[]) ?? []), id];
  }
  for (const cuentaId of origenIds) {
    const cuenta = state.cuentas.get(cuentaId)!;
    cuenta.fields[CUENTAS_FIELDS.movimientosOrigen] = [...((cuenta.fields[CUENTAS_FIELDS.movimientosOrigen] as string[]) ?? []), id];
  }
  return id;
}

async function main() {
  activarEnvFalso();
  __resetCacheNombreTablaParaPruebas();
  const state = crearEstadoDouble("Movimientos Financieros");
  global.fetch = construirFetchDouble(state) as typeof fetch;

  const tarjetaId = crearCuentaDouble(state, { nombre: "Tarjetas en Tránsito", tipo: "Tránsito", saldoInicial: 100, fechaCorte: "2026-07-01" });

  // Confirmado: sí cuenta para el saldo, no para "por acreditar".
  insertarMovimiento(state, {
    [MOVIMIENTOS_FIELDS.tipo]: "Ingreso",
    [MOVIMIENTOS_FIELDS.estado]: "Confirmado",
    [MOVIMIENTOS_FIELDS.monto]: 40,
    [MOVIMIENTOS_FIELDS.fecha]: "2026-07-05T10:00:00.000Z",
    [MOVIMIENTOS_FIELDS.cuentaDestino]: [tarjetaId],
  });
  // Pendiente: no cuenta para el saldo, sí para "por acreditar".
  insertarMovimiento(state, {
    [MOVIMIENTOS_FIELDS.tipo]: "Ingreso",
    [MOVIMIENTOS_FIELDS.estado]: "Pendiente",
    [MOVIMIENTOS_FIELDS.monto]: 30,
    [MOVIMIENTOS_FIELDS.fecha]: "2026-07-06T10:00:00.000Z",
    [MOVIMIENTOS_FIELDS.cuentaDestino]: [tarjetaId],
  });
  insertarMovimiento(state, {
    [MOVIMIENTOS_FIELDS.tipo]: "Ingreso",
    [MOVIMIENTOS_FIELDS.estado]: "Pendiente",
    [MOVIMIENTOS_FIELDS.monto]: 15,
    [MOVIMIENTOS_FIELDS.fecha]: "2026-07-07T10:00:00.000Z",
    [MOVIMIENTOS_FIELDS.cuentaDestino]: [tarjetaId],
  });
  // Anulado: no cuenta para ninguno de los dos.
  insertarMovimiento(state, {
    [MOVIMIENTOS_FIELDS.tipo]: "Ingreso",
    [MOVIMIENTOS_FIELDS.estado]: "Anulado",
    [MOVIMIENTOS_FIELDS.monto]: 999,
    [MOVIMIENTOS_FIELDS.fecha]: "2026-07-08T10:00:00.000Z",
    [MOVIMIENTOS_FIELDS.cuentaDestino]: [tarjetaId],
  });

  const saldo = await calcularSaldoCuenta(tarjetaId);
  assert(saldo === 140, `Saldo = SaldoInicial($100) + Confirmado($40) = $140 (obtenido: $${saldo}) — no-regresión del test #4 de 20.1`);

  const porAcreditar = await calcularPorAcreditarCuenta(tarjetaId);
  assert(porAcreditar === 45, `Por acreditar = Pendiente($30+$15) = $45, sin Saldo Inicial ni Confirmado (obtenido: $${porAcreditar})`);

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — calcularPorAcreditarCuenta correcto, sin regresión en calcularSaldoCuenta.");
}

const fetchOriginal = global.fetch;
main();
