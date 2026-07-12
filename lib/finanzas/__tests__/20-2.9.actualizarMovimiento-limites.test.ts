/**
 * Test §7 #9 (Fase 20.2) — actualizarMovimiento(): límites de la función.
 * No es un movimiento de negocio real cualquiera — solo permite la
 * transición "Sin distribuir"→"Pendiente de clasificar" y nunca reasigna
 * una Factura Electrónica ya vinculada (protección anti doble-facturación).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-2.9.actualizarMovimiento-limites.test.ts
 */

import { actualizarMovimiento, anularMovimiento, crearMovimiento } from "../movimientos";
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

  const cajaId = crearCuentaDouble(state, { nombre: "Caja Registradora", fechaCorte: "2026-01-01" });

  // Movimiento "Sin distribuir" (recién creado como anticipo).
  const movimiento = await crearMovimiento({
    tipo: "Ingreso",
    origen: "Abonos",
    categoria: "Anticipo Cliente",
    monto: 50,
    cuentaDestinoId: cajaId,
    estado: "Confirmado",
    estadoDistribucion: "Sin distribuir",
    fecha: "2026-07-12T10:00:00.000Z",
    registradoPor: "Test",
  });

  // Transición permitida: Sin distribuir → Pendiente de clasificar, con factura nueva.
  const actualizado = await actualizarMovimiento(movimiento.id, {
    facturaElectronicaId: "recFACTURA0001",
    estadoDistribucion: "Pendiente de clasificar",
  });
  assert(actualizado.estadoDistribucion === "Pendiente de clasificar", "La transición permitida se aplica");
  assert(actualizado.facturaElectronicaIds[0] === "recFACTURA0001", "La Factura Electrónica queda vinculada");
  assert(actualizado.monto === 50, "El monto no cambia (inmutable)");

  // Intentar reasignar a OTRA factura → rechazado.
  const rechazoReasignacion = await lanzaAsync(() =>
    actualizarMovimiento(movimiento.id, { facturaElectronicaId: "recFACTURA0002" })
  );
  assert(rechazoReasignacion, "Reasignar a una Factura Electrónica distinta es rechazado (anti doble-facturación)");

  // Intentar cambiar estadoDistribucion de nuevo (ya no está en "Sin distribuir") → rechazado.
  const rechazoTransicion = await lanzaAsync(() =>
    actualizarMovimiento(movimiento.id, { estadoDistribucion: "Pendiente de clasificar" })
  );
  assert(rechazoTransicion, "Solo se permite la transición una vez — desde un estado que ya no es Sin distribuir, se rechaza");

  // Movimiento nuevo, anulado — actualizarMovimiento debe rechazar tocarlo.
  const movimiento2 = await crearMovimiento({
    tipo: "Ingreso",
    origen: "Abonos",
    categoria: "Anticipo Cliente",
    monto: 20,
    cuentaDestinoId: cajaId,
    estado: "Confirmado",
    estadoDistribucion: "Sin distribuir",
    fecha: "2026-07-12T10:00:00.000Z",
    registradoPor: "Test",
  });
  await anularMovimiento(movimiento2.id, "Prueba");
  const rechazoAnulado = await lanzaAsync(() => actualizarMovimiento(movimiento2.id, { estadoDistribucion: "Pendiente de clasificar" }));
  assert(rechazoAnulado, "No se puede actualizar un movimiento ya Anulado");

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — límites de actualizarMovimiento() correctos.");
}

const fetchOriginal = global.fetch;
main();
