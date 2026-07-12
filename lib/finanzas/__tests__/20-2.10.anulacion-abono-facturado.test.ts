/**
 * Test §7 #10 (Fase 20.2, Corrección 1) — Anulación de abono ya facturado:
 * la anulación procede igual (nunca se bloquea), pero devuelve un warning
 * explícito con el número de factura. Control negativo: abono sin factura
 * vinculada anula igual, sin warning nuevo (cubierto también por el test #5).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-2.10.anulacion-abono-facturado.test.ts
 */

import { anularMovimientoDeAbono, crearMovimientoParaAbono } from "../puentes/abonos";
import { actualizarMovimiento } from "../movimientos";
import { __resetCacheNombreTablaParaPruebas } from "../table-names";
import { activarEnvFalso, construirFetchDouble, crearCuentaDouble, crearEstadoDouble, crearRegistroDouble, limpiarEnvFalso } from "./_airtableDouble";

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

  crearCuentaDouble(state, { nombre: "Caja Registradora", fechaCorte: "2026-01-01" });
  const abonoId = crearRegistroDouble(state, "Abonos", { Monto: 80, "Método de Pago": "Efectivo" });
  const facturaId = crearRegistroDouble(state, "Facturas Electrónicas", { "Número de Factura": "001-001-000000042" });

  const creado = await crearMovimientoParaAbono({
    abonoId,
    monto: 80,
    metodoPago: "Efectivo",
    fecha: "2026-07-12T10:00:00.000Z",
    registradoPor: "Test",
  });
  if (!creado.ok) throw new Error("Setup falló");

  // Simula el Puente 2(b): el abono ya se facturó.
  await actualizarMovimiento(creado.movimientoId, { facturaElectronicaId: facturaId, estadoDistribucion: "Pendiente de clasificar" });

  const logsWarn: unknown[][] = [];
  const warnOriginal = console.warn;
  console.warn = (...args: unknown[]) => logsWarn.push(args);

  const { warning } = await anularMovimientoDeAbono(abonoId);

  console.warn = warnOriginal;

  assert(warning !== null, "La anulación de un abono ya facturado devuelve un warning");
  assert(!!warning && warning.includes("001-001-000000042"), `El warning menciona el número de factura (obtenido: "${warning}")`);
  assert(
    state.movimientos.get(creado.movimientoId)?.fields["Estado del Movimiento"] === "Anulado",
    "El movimiento igual queda Anulado — la anulación procede sin bloquearse"
  );
  assert(
    logsWarn.some((args) => String(args[0]).includes("Abono anulado con factura vinculada")),
    "Se loguea un console.warn con la inconsistencia, para auditoría"
  );

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — anular un abono ya facturado procede y avisa explícitamente.");
}

const fetchOriginal = global.fetch;
main();
