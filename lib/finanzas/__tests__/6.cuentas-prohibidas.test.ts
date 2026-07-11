/**
 * Test §9 #6 — Movimientos entre cuentas prohibidas rechazados: un
 * Movimiento Interno Caja Registradora → SGCAPITAL directo (no está en
 * "Permite Transferir A" de Caja) se rechaza, aunque haya saldo suficiente.
 * Ejecutar: npx tsx lib/finanzas/__tests__/6.cuentas-prohibidas.test.ts
 */

import { crearMovimiento } from "../movimientos";
import { validarTransferenciaPermitida } from "../validaciones";
import { __resetCacheNombreTablaParaPruebas } from "../table-names";
import { activarEnvFalso, construirFetchDouble, crearCuentaDouble, crearEstadoDouble, limpiarEnvFalso, permitirTransferencia } from "./_airtableDouble";
import { fetchCuentaById } from "../cuentas";

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
  global.fetch = construirFetchDouble(state) as typeof fetch;

  // Caja Registradora con saldo de sobra, pero SIN permiso de transferir a SGCAPITAL
  // (según el catálogo del diseño, §3: Caja solo puede transferir a SGINGRESOS).
  const cajaId = crearCuentaDouble(state, { nombre: "Caja Registradora", tipo: "Temporal", saldoInicial: 1000, fechaCorte: "2026-01-01" });
  const ingresosId = crearCuentaDouble(state, { nombre: "SGINGRESOS", tipo: "Principal", saldoInicial: 0, fechaCorte: "2026-01-01" });
  const capitalId = crearCuentaDouble(state, { nombre: "SGCAPITAL", tipo: "Final", saldoInicial: 0, fechaCorte: "2026-01-01" });
  permitirTransferencia(state, cajaId, ingresosId); // Caja → SGINGRESOS sí permitido
  // Caja → SGCAPITAL NUNCA se agrega — es exactamente el caso prohibido.

  // Nivel unitario puro: validarTransferenciaPermitida rechaza directo.
  const caja = (await fetchCuentaById(cajaId))!;
  const capital = (await fetchCuentaById(capitalId))!;
  let lanzoPuro = false;
  try {
    validarTransferenciaPermitida(caja, capital);
  } catch {
    lanzoPuro = true;
  }
  assert(lanzoPuro, "validarTransferenciaPermitida (pura) rechaza Caja → SGCAPITAL directo");

  // Nivel de integración: crearMovimiento también lo rechaza, con saldo de sobra.
  let lanzoIntegracion = false;
  try {
    await crearMovimiento({
      tipo: "Movimiento Interno",
      origen: "Sistema",
      categoria: "Distribución de Rubros",
      monto: 50,
      cuentaOrigenId: cajaId,
      cuentaDestinoId: capitalId,
      rubros: { capital: 50, utilidad: 0, iva: 0, repuestoExterno: 0 },
      estadoDistribucion: "Distribuido",
      registradoPor: "Test",
    });
  } catch {
    lanzoIntegracion = true;
  }
  assert(lanzoIntegracion, "crearMovimiento rechaza Caja → SGCAPITAL directo aunque haya saldo suficiente ($1000)");
  assert(state.movimientos.size === 0, "No se creó ningún movimiento en el store");

  // Control positivo: Caja → SGINGRESOS sí está permitido y debe pasar.
  const movimientoValido = await crearMovimiento({
    tipo: "Movimiento Interno",
    origen: "Sistema",
    categoria: "Depósito de Caja",
    monto: 50,
    cuentaOrigenId: cajaId,
    cuentaDestinoId: ingresosId,
    registradoPor: "Test",
  });
  assert(!!movimientoValido.id, "Caja → SGINGRESOS (sí permitido) se crea correctamente (control positivo)");

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — transferencias entre cuentas prohibidas rechazadas.");
}

const fetchOriginal = global.fetch;
main();
