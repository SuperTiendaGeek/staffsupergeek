/**
 * Test §9 #4 (Fase 20.3) — procesarAcreditacion(): matriz de transferencias
 * respetada. Si Tarjetas en Tránsito no tiene permiso de transferir a
 * SGINGRESOS (ni en Permite Transferir A ni en Permite Recibir De), la
 * creación del Interno-hijo se rechaza con el mismo error que ya prueba el
 * test #6 de 20.1 — la acreditación no tiene ninguna ruta que se salte esa
 * validación.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-3.4.procesarAcreditacion-matriz-transferencias.test.ts
 */

import { procesarAcreditacion } from "../acreditacion";
import { crearMovimiento } from "../movimientos";
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

  // Sin permitirTransferencia() — ni Permite Transferir A ni Permite Recibir De quedan poblados.
  const transitoId = crearCuentaDouble(state, { nombre: "Tarjetas en Tránsito", tipo: "Tránsito", fechaCorte: "2026-01-01" });
  crearCuentaDouble(state, { nombre: "SGINGRESOS", tipo: "Principal", fechaCorte: "2026-01-01" });

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

  let lanzo = false;
  let mensaje = "";
  try {
    await procesarAcreditacion(pendiente.id, { montoNeto: 28.8, fecha: "2026-07-17T10:00:00.000Z", registradoPor: "Test" });
  } catch (error) {
    lanzo = true;
    mensaje = error instanceof Error ? error.message : String(error);
  }
  assert(lanzo, "La creación del Interno-hijo se rechaza cuando la transferencia no está permitida");
  assert(
    mensaje.includes("no puede transferir directamente"),
    `El mensaje es el de la matriz de transferencias, no uno genérico (obtenido: "${mensaje}")`
  );
  assert(
    state.movimientos.get(pendiente.id)?.fields["Estado del Movimiento"] === "Acreditado",
    "El Paso A ya se había aplicado (queda Acreditado) — la matriz se valida al crear el hijo, no antes"
  );
  const hijosCreados = [...state.movimientos.values()].filter((m) => (m.fields["Reversa a"] as string[] | undefined)?.length);
  assert(hijosCreados.length === 0, "Ningún hijo llegó a crearse — el rechazo ocurrió antes del POST");

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — la matriz de transferencias se respeta también en la acreditación.");
}

const fetchOriginal = global.fetch;
main();
