/**
 * Test §9 #1 (Fase 20.3) — acreditarMovimientoPendiente(): validaciones
 * básicas. Rechaza tipo distinto de Ingreso, estado distinto de Pendiente,
 * Cuenta Destino que no sea de Tipo "Tránsito", montoNeto <= 0, montoNeto >
 * bruto; acepta el caso límite montoNeto === monto (comisión $0).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-3.1.acreditar-validaciones-basicas.test.ts
 */

import { acreditarMovimientoPendiente, anularMovimiento, crearMovimiento } from "../movimientos";
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

async function lanzaAsync(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}

async function main() {
  activarEnvFalso();
  __resetCacheNombreTablaParaPruebas();
  const state = crearEstadoDouble("Movimientos Financieros");
  global.fetch = construirFetchDouble(state) as typeof fetch;

  const cajaId = crearCuentaDouble(state, { nombre: "Caja Registradora", tipo: "Temporal", fechaCorte: "2026-01-01" });
  const transitoId = crearCuentaDouble(state, { nombre: "Tarjetas en Tránsito", tipo: "Tránsito", fechaCorte: "2026-01-01" });

  // Movimiento Egreso (tipo != Ingreso) — no acreditable.
  const egreso = await crearMovimiento({
    tipo: "Egreso",
    origen: "Manual",
    categoria: "Otro",
    monto: 10,
    cuentaOrigenId: cajaId,
    estado: "Confirmado",
    fecha: "2026-07-15T10:00:00.000Z",
    registradoPor: "Test",
    observacion: "gasto",
  });
  assert(
    await lanzaAsync(() => acreditarMovimientoPendiente(egreso.id, { montoNeto: 10, fecha: "2026-07-16T10:00:00.000Z" })),
    "Rechaza si el movimiento no es Ingreso"
  );

  // Ingreso ya Confirmado (no Pendiente).
  const confirmado = await crearMovimiento({
    tipo: "Ingreso",
    origen: "Manual",
    categoria: "Otro",
    monto: 10,
    cuentaDestinoId: cajaId,
    estado: "Confirmado",
    fecha: "2026-07-15T10:00:00.000Z",
    registradoPor: "Test",
  });
  assert(
    await lanzaAsync(() => acreditarMovimientoPendiente(confirmado.id, { montoNeto: 10, fecha: "2026-07-16T10:00:00.000Z" })),
    "Rechaza si no está Pendiente (Confirmado)"
  );

  // Ingreso Anulado.
  const paraAnular = await crearMovimiento({
    tipo: "Ingreso",
    origen: "Manual",
    categoria: "Otro",
    monto: 10,
    cuentaDestinoId: cajaId,
    estado: "Pendiente",
    fecha: "2026-07-15T10:00:00.000Z",
    registradoPor: "Test",
  });
  await anularMovimiento(paraAnular.id, "prueba");
  assert(
    await lanzaAsync(() => acreditarMovimientoPendiente(paraAnular.id, { montoNeto: 10, fecha: "2026-07-16T10:00:00.000Z" })),
    "Rechaza si no está Pendiente (Anulado)"
  );

  // Ingreso Pendiente pero Cuenta Destino no es Tránsito.
  const pendienteNoTransito = await crearMovimiento({
    tipo: "Ingreso",
    origen: "Manual",
    categoria: "Otro",
    monto: 10,
    cuentaDestinoId: cajaId,
    estado: "Pendiente",
    fecha: "2026-07-15T10:00:00.000Z",
    registradoPor: "Test",
  });
  assert(
    await lanzaAsync(() => acreditarMovimientoPendiente(pendienteNoTransito.id, { montoNeto: 10, fecha: "2026-07-16T10:00:00.000Z" })),
    'Rechaza si la Cuenta Destino no es de Tipo "Tránsito"'
  );

  // Ingreso Pendiente en Tránsito — casos límite de montoNeto.
  const pendiente1 = await crearMovimiento({
    tipo: "Ingreso",
    origen: "Facturación",
    categoria: "Venta Mostrador",
    monto: 30,
    cuentaDestinoId: transitoId,
    estado: "Pendiente",
    fecha: "2026-07-15T10:00:00.000Z",
    registradoPor: "Test",
  });
  assert(
    await lanzaAsync(() => acreditarMovimientoPendiente(pendiente1.id, { montoNeto: 0, fecha: "2026-07-16T10:00:00.000Z" })),
    "Rechaza montoNeto <= 0 (con 0)"
  );
  assert(
    await lanzaAsync(() => acreditarMovimientoPendiente(pendiente1.id, { montoNeto: -5, fecha: "2026-07-16T10:00:00.000Z" })),
    "Rechaza montoNeto <= 0 (negativo)"
  );
  assert(
    await lanzaAsync(() => acreditarMovimientoPendiente(pendiente1.id, { montoNeto: 30.01, fecha: "2026-07-16T10:00:00.000Z" })),
    "Rechaza montoNeto > monto (bruto)"
  );

  // Caso límite: montoNeto === monto (comisión $0) — no lanza.
  const acreditado = await acreditarMovimientoPendiente(pendiente1.id, { montoNeto: 30, fecha: "2026-07-16T10:00:00.000Z" });
  assert(acreditado.estado === "Acreditado", "Acepta el caso límite montoNeto === monto, sin error");
  assert(acreditado.comision === 0, `Comisión = $0 en el caso límite (obtenido: ${acreditado.comision})`);

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — validaciones básicas de acreditarMovimientoPendiente correctas.");
}

const fetchOriginal = global.fetch;
main();
