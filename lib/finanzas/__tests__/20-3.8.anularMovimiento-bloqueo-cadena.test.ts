/**
 * Test §9 #8 (Fase 20.3, Corrección 1) — anularMovimiento(): bloqueo por
 * compensadores activos. Un original con 2 hijos activos (creados vía
 * procesarAcreditacion, enlazados por Reversa a/Compensado Por) no se puede
 * anular — el mensaje lista ambos movimientoId. Anular primero los 2 hijos
 * y luego el original sí procede (cero compensadores activos restantes).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-3.8.anularMovimiento-bloqueo-cadena.test.ts
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

  const { movimiento: original, interno, ajuste } = await procesarAcreditacion(pendiente.id, {
    montoNeto: 28.8,
    fecha: "2026-07-17T10:00:00.000Z",
    registradoPor: "Test",
  });

  let lanzo = false;
  let mensaje = "";
  try {
    await anularMovimiento(original.id, "Intento de anular con hijos activos");
  } catch (error) {
    lanzo = true;
    mensaje = error instanceof Error ? error.message : String(error);
  }
  assert(lanzo, "Anular el original con 2 compensadores activos se rechaza");
  assert(mensaje.includes(interno.movimientoId), "El mensaje menciona el movimientoId del Interno-hijo");
  assert(mensaje.includes(ajuste!.movimientoId), "El mensaje menciona el movimientoId del Ajuste-hijo");
  assert(
    state.movimientos.get(original.id)?.fields["Estado del Movimiento"] === "Acreditado",
    "El original sigue Acreditado — la anulación no se aplicó"
  );

  // Anular primero los 2 hijos.
  await anularMovimiento(interno.id, "Anulando hijo 1");
  await anularMovimiento(ajuste!.id, "Anulando hijo 2");

  // Ahora sí procede sobre el original.
  const { movimiento: originalAnulado } = await anularMovimiento(original.id, "Ya sin compensadores activos");
  assert(originalAnulado.estado === "Anulado", "Sin compensadores activos, la anulación del original procede");

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — bloqueo por compensadores activos correcto.");
}

const fetchOriginal = global.fetch;
main();
