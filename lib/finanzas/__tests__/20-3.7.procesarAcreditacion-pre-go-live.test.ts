/**
 * Test §9 #7 (Fase 20.3, Corrección 3) — procesarAcreditacion(): chequeo
 * PRE_GO_LIVE explícito, antes de cualquier mutación. Con Tránsito o
 * SGINGRESOS sin Fecha de Corte, lanza PreGoLiveError antes de cualquier
 * PATCH/POST — el movimiento original sigue exactamente Pendiente y el
 * store no gana ningún registro nuevo.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-3.7.procesarAcreditacion-pre-go-live.test.ts
 */

import { procesarAcreditacion } from "../acreditacion";
import { crearMovimiento } from "../movimientos";
import { PreGoLiveError } from "../pre-go-live";
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

async function escenario(nombre: string, fechaCorteTransito: string | null, fechaCorteSgIngresos: string | null) {
  activarEnvFalso();
  __resetCacheNombreTablaParaPruebas();
  const state = crearEstadoDouble("Movimientos Financieros");
  const transitoId = crearCuentaDouble(state, { nombre: "Tarjetas en Tránsito", tipo: "Tránsito", fechaCorte: fechaCorteTransito });
  const sgIngresosId = crearCuentaDouble(state, { nombre: "SGINGRESOS", tipo: "Principal", fechaCorte: fechaCorteSgIngresos });
  permitirTransferencia(state, transitoId, sgIngresosId);
  global.fetch = construirFetchDouble(state) as typeof fetch;

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
  const cantidadAntes = state.movimientos.size;

  let error: unknown = null;
  try {
    await procesarAcreditacion(pendiente.id, { montoNeto: 28.8, fecha: "2026-07-17T10:00:00.000Z", registradoPor: "Test" });
  } catch (e) {
    error = e;
  }

  assert(error instanceof PreGoLiveError, `[${nombre}] Lanza PreGoLiveError`);
  assert(state.movimientos.get(pendiente.id)?.fields["Estado del Movimiento"] === "Pendiente", `[${nombre}] El movimiento sigue exactamente Pendiente`);
  assert(!state.movimientos.get(pendiente.id)?.fields["Monto Neto"], `[${nombre}] Monto Neto sigue vacío`);
  assert(!state.movimientos.get(pendiente.id)?.fields["Comisión"], `[${nombre}] Comisión sigue vacía`);
  assert(state.movimientos.size === cantidadAntes, `[${nombre}] El store no ganó ningún registro nuevo`);

  limpiarEnvFalso();
}

async function main() {
  await escenario("Tránsito sin Fecha de Corte", null, "2026-01-01");
  await escenario("SGINGRESOS sin Fecha de Corte", "2026-01-01", null);
  await escenario("Ninguna de las dos con Fecha de Corte", null, null);

  global.fetch = fetchOriginal;

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — PRE_GO_LIVE se chequea antes de cualquier mutación en procesarAcreditacion.");
}

const fetchOriginal = global.fetch;
main();
