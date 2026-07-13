/**
 * Test §9 #6 (Fase 20.3, Corrección 2) — procesarAcreditacion(): comisión $0
 * no crea Ajuste-hijo. Con montoNeto === monto (bruto), comision = 0 →
 * ajuste: null, sin ningún POST de tipo Ajuste; una llamada posterior
 * (idempotencia) sigue devolviendo ajuste: null sin intentar crear nada.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-3.6.procesarAcreditacion-comision-cero.test.ts
 */

import { procesarAcreditacion } from "../acreditacion";
import { crearMovimiento } from "../movimientos";
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

  const resultado = await procesarAcreditacion(pendiente.id, { montoNeto: 30, fecha: "2026-07-17T10:00:00.000Z", registradoPor: "Test" });

  assert(resultado.movimiento.comision === 0, "Comisión = $0");
  assert(resultado.ajuste === null, "ajuste es null — no se creó ningún Ajuste-hijo");
  assert(resultado.interno.tipo === "Movimiento Interno", "El Interno-hijo sí se crea, por el neto completo");
  const ajustesEnElStore = [...state.movimientos.values()].filter((m) => m.fields["Tipo de movimiento"] === "Ajuste");
  assert(ajustesEnElStore.length === 0, "Cero registros de tipo Ajuste en el store");

  // Idempotencia: segunda llamada sigue sin crear un Ajuste.
  const segunda = await procesarAcreditacion(pendiente.id, { montoNeto: 30, fecha: "2026-07-17T10:00:00.000Z", registradoPor: "Test" });
  assert(segunda.ajuste === null, "La segunda llamada (idempotencia) también devuelve ajuste: null");
  assert(segunda.interno.id === resultado.interno.id, "El Interno-hijo no se duplicó");
  const ajustesTrasSegunda = [...state.movimientos.values()].filter((m) => m.fields["Tipo de movimiento"] === "Ajuste");
  assert(ajustesTrasSegunda.length === 0, "Sigue sin haber ningún registro de tipo Ajuste tras la segunda llamada");

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — comisión $0 no crea Ajuste-hijo, la completitud lo contempla.");
}

const fetchOriginal = global.fetch;
main();
