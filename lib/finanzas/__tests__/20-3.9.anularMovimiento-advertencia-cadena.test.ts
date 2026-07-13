/**
 * Test §9 #9 (Fase 20.3, Corrección 1) — anularMovimiento(): advertencia de
 * cadena al anular un hijo. Anular un hijo (Reversa a poblado) mientras el
 * original sigue activo (Acreditado) no se bloquea, pero devuelve un
 * warning explícito y loguea. Anular ese mismo hijo cuando el original ya
 * está Anulado → warning: null.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-3.9.anularMovimiento-advertencia-cadena.test.ts
 */

import { procesarAcreditacion } from "../acreditacion";
import { anularMovimiento, crearMovimiento } from "../movimientos";
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
  const transitoId = crearCuentaDouble(state, { nombre: "Tarjetas en Tránsito", tipo: "Tránsito", fechaCorte: "2026-01-01" });
  const sgIngresosId = crearCuentaDouble(state, { nombre: "SGINGRESOS", tipo: "Principal", fechaCorte: "2026-01-01" });
  const cajaId = crearCuentaDouble(state, { nombre: "Caja Registradora", tipo: "Temporal", fechaCorte: "2026-01-01" });
  permitirTransferencia(state, transitoId, sgIngresosId);
  global.fetch = construirFetchDouble(state) as typeof fetch;

  const llamadasWarn: unknown[][] = [];
  const warnOriginal = console.warn;
  console.warn = (...args: unknown[]) => {
    llamadasWarn.push(args);
  };

  // Caso 1 — original activo (Acreditado): anular un hijo real (creado por
  // procesarAcreditacion) debe advertir.
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
  const { movimiento: original, interno } = await procesarAcreditacion(pendiente.id, {
    montoNeto: 28.8,
    fecha: "2026-07-17T10:00:00.000Z",
    registradoPor: "Test",
  });

  const { warning: warningConOriginalActivo } = await anularMovimiento(interno.id, "Anular hijo con original activo");
  assert(warningConOriginalActivo !== null, "Anular un hijo con el original activo devuelve una advertencia (no null)");
  assert(warningConOriginalActivo!.includes(original.movimientoId), "La advertencia menciona el movimientoId del original");
  assert(llamadasWarn.length === 1, `Se logueó exactamente 1 console.warn (obtenido: ${llamadasWarn.length})`);

  // Caso 2 — original YA Anulado (independiente): un "hijo" sintético cuyo
  // Reversa a apunta a un movimiento que ya estaba Anulado antes de que este
  // hijo se anule — no hay cadena activa que advertir.
  const movimientoIndependiente = await crearMovimiento({
    tipo: "Ingreso",
    origen: "Manual",
    categoria: "Otro",
    monto: 15,
    cuentaDestinoId: cajaId,
    estado: "Confirmado",
    fecha: "2026-07-15T10:00:00.000Z",
    registradoPor: "Test",
  });
  await anularMovimiento(movimientoIndependiente.id, "Ya anulado de antemano");

  const hijoSintetico = await crearMovimiento({
    tipo: "Ajuste",
    origen: "Sistema",
    categoria: "Otro",
    monto: 5,
    cuentaOrigenId: cajaId,
    estado: "Confirmado",
    fecha: "2026-07-17T10:00:00.000Z",
    registradoPor: "Test",
    reversaAId: movimientoIndependiente.id,
  });

  const { warning: warningSinCadenaActiva } = await anularMovimiento(hijoSintetico.id, "El original ya estaba Anulado");
  assert(warningSinCadenaActiva === null, "Sin cadena activa (original ya Anulado), warning es null");

  console.warn = warnOriginal;
  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — advertencia de cadena al anular un hijo, correcta.");
}

const fetchOriginal = global.fetch;
main();
