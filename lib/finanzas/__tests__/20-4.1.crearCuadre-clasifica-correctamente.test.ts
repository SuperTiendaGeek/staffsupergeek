/**
 * Test §7 #1 (Fase 20.4) — crearCuadre(): clasifica correctamente.
 * montoContado = saldoEsperado → Cuadrado, diferencia 0. montoContado >
 * saldoEsperado → Sobrante, diferencia positiva exacta. montoContado <
 * saldoEsperado → Faltante, diferencia negativa exacta (redondeo a 2
 * decimales).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-4.1.crearCuadre-clasifica-correctamente.test.ts
 */

import { crearCuadre } from "../cuadres";
import { __resetCacheNombreTablaParaPruebas } from "../table-names";
import {
  activarEnvFalso,
  construirFetchDouble,
  crearCuentaDouble,
  crearEstadoDouble,
  limpiarEnvFalso,
  registrarTablaDouble,
} from "./_airtableDouble";

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
  registrarTablaDouble(state, "Finanzas Cuadres");
  const cajaId = crearCuentaDouble(state, { nombre: "Caja Registradora", tipo: "Temporal", saldoInicial: 100, fechaCorte: "2026-01-01" });
  global.fetch = construirFetchDouble(state) as typeof fetch;

  // Saldo esperado = $100 (Saldo Inicial, sin movimientos).
  const cuadrado = await crearCuadre({ cuentaId: cajaId, montoContado: 100, realizadoPor: "Test" });
  assert(cuadrado.estado === "Cuadrado", `Cuadrado cuando coincide (obtenido: ${cuadrado.estado})`);
  assert(cuadrado.diferencia === 0, `Diferencia = 0 (obtenido: ${cuadrado.diferencia})`);
  assert(cuadrado.saldoEsperado === 100, "Saldo Esperado quedó congelado en el valor real");

  const sobrante = await crearCuadre({ cuentaId: cajaId, montoContado: 112.5, observacion: "Sobró efectivo", realizadoPor: "Test" });
  assert(sobrante.estado === "Sobrante", `Sobrante cuando contado > esperado (obtenido: ${sobrante.estado})`);
  assert(sobrante.diferencia === 12.5, `Diferencia positiva exacta (obtenido: ${sobrante.diferencia})`);

  const faltante = await crearCuadre({ cuentaId: cajaId, montoContado: 90, observacion: "Faltó efectivo", realizadoPor: "Test" });
  assert(faltante.estado === "Faltante", `Faltante cuando contado < esperado (obtenido: ${faltante.estado})`);
  assert(faltante.diferencia === -10, `Diferencia negativa exacta (obtenido: ${faltante.diferencia})`);

  // Redondeo a 2 decimales.
  const conCentavos = await crearCuadre({ cuentaId: cajaId, montoContado: 100.004, realizadoPor: "Test" });
  assert(conCentavos.diferencia === 0, `Redondeo a 2 decimales trata 100.004 como Cuadrado (obtenido: ${conCentavos.diferencia})`);

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — crearCuadre clasifica correctamente en los 3 estados.");
}

const fetchOriginal = global.fetch;
main();
