/**
 * Test §9 #4 — Saldo Inicial y Fecha de Corte (Corrección 2): un movimiento
 * con fecha anterior a la Fecha de Corte de la cuenta no debe alterar
 * calcularSaldoCuenta; uno con fecha posterior sí. Los 11 movimientos legacy
 * (fecha muy anterior a cualquier corte real) no deben aportar al saldo aun
 * teniendo Cuenta Origen ya resuelta. Además: una cuenta SIN Fecha de Corte
 * (todavía no pasó por el go-live) debe dar saldo $0, no la suma de su
 * histórico Confirmado — bug real encontrado en la verificación de /finanzas
 * tras el deploy (`fechaCorte` vacío hacía que el filtro de fecha nunca
 * excluyera nada).
 * Ejecutar: npx tsx lib/finanzas/__tests__/4.saldo-inicial-fecha-corte.test.ts
 *
 * global.fetch reemplazado por el doble de _airtableDouble.ts.
 */

import { CUENTAS_FIELDS } from "../cuentas";
import { MOVIMIENTOS_FIELDS } from "../movimientos-fields";
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

function insertarMovimiento(
  state: ReturnType<typeof crearEstadoDouble>,
  fields: Record<string, unknown>
) {
  const id = `rec${String(state.nextId++).padStart(14, "0")}`;
  const record = { id, createdTime: new Date().toISOString(), fields };
  state.movimientos.set(id, record);
  // sincroniza los inversos manualmente (mismo criterio que el POST real del doble)
  const origenIds = (fields[MOVIMIENTOS_FIELDS.cuentaOrigen] as string[] | undefined) ?? [];
  const destinoIds = (fields[MOVIMIENTOS_FIELDS.cuentaDestino] as string[] | undefined) ?? [];
  for (const cuentaId of origenIds) {
    const cuenta = state.cuentas.get(cuentaId)!;
    cuenta.fields[CUENTAS_FIELDS.movimientosOrigen] = [...((cuenta.fields[CUENTAS_FIELDS.movimientosOrigen] as string[]) ?? []), id];
  }
  for (const cuentaId of destinoIds) {
    const cuenta = state.cuentas.get(cuentaId)!;
    cuenta.fields[CUENTAS_FIELDS.movimientosDestino] = [...((cuenta.fields[CUENTAS_FIELDS.movimientosDestino] as string[]) ?? []), id];
  }
  return id;
}

async function main() {
  activarEnvFalso();
  __resetCacheNombreTablaParaPruebas();
  const state = crearEstadoDouble("Movimientos Financieros");
  global.fetch = construirFetchDouble(state) as typeof fetch;

  const cajaId = crearCuentaDouble(state, { nombre: "Caja Registradora", saldoInicial: 50, fechaCorte: "2026-07-14" });

  // Movimiento legacy: fecha muy anterior al corte, Cuenta Origen ya resuelta — no debe contar.
  insertarMovimiento(state, {
    [MOVIMIENTOS_FIELDS.tipo]: "Egreso",
    [MOVIMIENTOS_FIELDS.estado]: "Confirmado",
    [MOVIMIENTOS_FIELDS.monto]: 6382.04,
    [MOVIMIENTOS_FIELDS.fecha]: "2026-06-10T20:31:00.000Z",
    [MOVIMIENTOS_FIELDS.cuentaOrigen]: [cajaId],
  });

  // Movimiento con fecha anterior al corte exacto (mismo día antes de la hora de corte) — no debe contar.
  insertarMovimiento(state, {
    [MOVIMIENTOS_FIELDS.tipo]: "Ingreso",
    [MOVIMIENTOS_FIELDS.estado]: "Confirmado",
    [MOVIMIENTOS_FIELDS.monto]: 999,
    [MOVIMIENTOS_FIELDS.fecha]: "2026-07-13T23:59:00.000Z",
    [MOVIMIENTOS_FIELDS.cuentaDestino]: [cajaId],
  });

  // Movimiento posterior al corte, Confirmado — sí debe contar.
  insertarMovimiento(state, {
    [MOVIMIENTOS_FIELDS.tipo]: "Ingreso",
    [MOVIMIENTOS_FIELDS.estado]: "Confirmado",
    [MOVIMIENTOS_FIELDS.monto]: 45.2,
    [MOVIMIENTOS_FIELDS.fecha]: "2026-07-15T10:15:00.000Z",
    [MOVIMIENTOS_FIELDS.cuentaDestino]: [cajaId],
  });

  // Movimiento posterior al corte pero Pendiente — no debe contar (no está Confirmado/Acreditado).
  insertarMovimiento(state, {
    [MOVIMIENTOS_FIELDS.tipo]: "Ingreso",
    [MOVIMIENTOS_FIELDS.estado]: "Pendiente",
    [MOVIMIENTOS_FIELDS.monto]: 120,
    [MOVIMIENTOS_FIELDS.fecha]: "2026-07-15T11:00:00.000Z",
    [MOVIMIENTOS_FIELDS.cuentaDestino]: [cajaId],
  });

  const saldo = await calcularSaldoCuenta(cajaId);
  assert(saldo === 95.2, `Saldo = SaldoInicial($50) + $45.20 posterior al corte = $95.20 (obtenido: $${saldo})`);

  // Cuenta SIN Fecha de Corte (todavía no pasó por el go-live, §6 paso 9):
  // el saldo debe ser $0 — ni siquiera Saldo Inicial cuenta, y mucho menos el
  // histórico legacy — aunque la cuenta tenga movimientos Confirmado reales.
  const paypalId = crearCuentaDouble(state, { nombre: "PayPal", saldoInicial: 250, fechaCorte: null });
  insertarMovimiento(state, {
    [MOVIMIENTOS_FIELDS.tipo]: "Egreso",
    [MOVIMIENTOS_FIELDS.estado]: "Confirmado",
    [MOVIMIENTOS_FIELDS.monto]: 5810,
    [MOVIMIENTOS_FIELDS.fecha]: "2026-06-10T20:31:00.000Z",
    [MOVIMIENTOS_FIELDS.cuentaOrigen]: [paypalId],
  });
  const saldoSinCorte = await calcularSaldoCuenta(paypalId);
  assert(saldoSinCorte === 0, `Saldo de una cuenta sin Fecha de Corte es $0, no el histórico ni el Saldo Inicial (obtenido: $${saldoSinCorte})`);

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — Saldo Inicial y Fecha de Corte se aplican correctamente.");
}

const fetchOriginal = global.fetch;
main();
