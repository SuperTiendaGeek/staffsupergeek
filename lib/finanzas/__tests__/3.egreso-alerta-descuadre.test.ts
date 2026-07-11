/**
 * Test §9 #3 — Egreso con saldo insuficiente → se crea igual, flagueado
 * (Corrección 2): un Egreso (p. ej. desde el puente Shipping) por más del
 * saldo disponible se registra igual, con Alerta Descuadre = true; nunca se
 * rechaza. Caso espejo del #4 de la Prueba de Fuego (§7 del diseño).
 * Ejecutar: npx tsx lib/finanzas/__tests__/3.egreso-alerta-descuadre.test.ts
 */

import { crearMovimiento } from "../movimientos";
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
  global.fetch = construirFetchDouble(state) as typeof fetch;

  // Réplica del caso #4 de la Prueba de Fuego: PayPal con $250 y un egreso de $300.
  const paypalId = crearCuentaDouble(state, { nombre: "PayPal", tipo: "Temporal", saldoInicial: 250, fechaCorte: "2026-07-14" });

  const movimiento = await crearMovimiento({
    tipo: "Egreso",
    origen: "Shipping",
    categoria: "Compra Proveedor Shipping",
    monto: 300,
    cuentaOrigenId: paypalId,
    estado: "Confirmado",
    estadoDistribucion: "No aplica",
    fecha: "2026-07-15T21:05:00.000Z",
    registradoPor: "Test",
  });

  assert(!!movimiento.id, "El movimiento se crea sin lanzar error a pesar del saldo insuficiente");
  assert(movimiento.alertaDescuadre === true, "El movimiento queda marcado con Alerta Descuadre = true");
  assert(state.movimientos.size === 1, "El movimiento quedó efectivamente registrado en Airtable (el store tiene 1 registro)");

  const saldoFinal = await calcularSaldoCuenta(paypalId);
  assert(saldoFinal === -50, `El saldo calculado refleja el descuadre real (-$50, obtenido: $${saldoFinal})`);

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — Egreso con saldo insuficiente se crea y queda flagueado.");
}

const fetchOriginal = global.fetch;
main();
