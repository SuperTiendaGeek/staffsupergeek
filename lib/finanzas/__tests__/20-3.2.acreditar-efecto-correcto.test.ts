/**
 * Test §9 #2 (Fase 20.3) — acreditarMovimientoPendiente(): efecto correcto.
 * Con un Pendiente de $30 y neto $28.80: Estado del Movimiento = Acreditado,
 * Monto Bruto = 30, Monto Neto = 28.80, Comisión = 1.20 (redondeo a 2
 * decimales); Monto/Cuenta Destino/Tipo/Categoría permanecen sin cambios
 * (inmutables).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-3.2.acreditar-efecto-correcto.test.ts
 */

import { acreditarMovimientoPendiente, crearMovimiento } from "../movimientos";
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

  const transitoId = crearCuentaDouble(state, { nombre: "Tarjetas en Tránsito", tipo: "Tránsito", fechaCorte: "2026-01-01" });

  const pendiente = await crearMovimiento({
    tipo: "Ingreso",
    origen: "Facturación",
    categoria: "Venta Mostrador",
    monto: 30,
    cuentaDestinoId: transitoId,
    estado: "Pendiente",
    fecha: "2026-07-15T10:00:00.000Z",
    registradoPor: "Test",
  });

  const acreditado = await acreditarMovimientoPendiente(pendiente.id, { montoNeto: 28.8, fecha: "2026-07-17T10:00:00.000Z" });

  assert(acreditado.estado === "Acreditado", `Estado del Movimiento = Acreditado (obtenido: ${acreditado.estado})`);
  assert(acreditado.montoBruto === 30, `Monto Bruto = 30 (obtenido: ${acreditado.montoBruto})`);
  assert(acreditado.montoNeto === 28.8, `Monto Neto = 28.80 (obtenido: ${acreditado.montoNeto})`);
  assert(acreditado.comision === 1.2, `Comisión = 1.20 (obtenido: ${acreditado.comision})`);
  assert(acreditado.monto === 30, "Monto no cambia (inmutable)");
  assert(acreditado.cuentaDestinoId === transitoId, "Cuenta Destino no cambia (inmutable)");
  assert(acreditado.tipo === "Ingreso", "Tipo no cambia (inmutable)");
  assert(acreditado.categoria === "Venta Mostrador", "Categoría no cambia (inmutable)");

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — acreditarMovimientoPendiente aplica el efecto correcto.");
}

const fetchOriginal = global.fetch;
main();
