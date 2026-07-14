/**
 * Test §7 #5 (Fase 20.4) — registrarAjusteDeCuadre(): rechaza sin
 * diferencia, idempotente si ya ajustado. Diferencia = 0 → rechazado.
 * Llamar dos veces sobre el mismo cuadre con diferencia → la segunda no
 * crea un segundo Ajuste, devuelve el mismo movimiento.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-4.5.registrarAjuste-rechaza-e-idempotente.test.ts
 */

import { crearCuadre, registrarAjusteDeCuadre } from "../cuadres";
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
  registrarTablaDouble(state, "Finanzas Cuadres");
  const cajaId = crearCuentaDouble(state, { nombre: "Caja Registradora", saldoInicial: 100, fechaCorte: "2026-01-01" });
  global.fetch = construirFetchDouble(state) as typeof fetch;

  const cuadrado = await crearCuadre({ cuentaId: cajaId, montoContado: 100, realizadoPor: "Test" });
  assert(
    await lanzaAsync(() => registrarAjusteDeCuadre(cuadrado.id, { registradoPor: "Admin" })),
    "Diferencia = 0 se rechaza — no hay nada que ajustar"
  );

  const faltante = await crearCuadre({ cuentaId: cajaId, montoContado: 90, observacion: "Faltaron $10", realizadoPor: "Test" });
  const primera = await registrarAjusteDeCuadre(faltante.id, { registradoPor: "Admin" });
  const cantidadTrasLaPrimera = [...state.movimientos.values()].filter((m) => m.fields["Tipo de movimiento"] === "Ajuste").length;

  const segunda = await registrarAjusteDeCuadre(faltante.id, { registradoPor: "Admin" });
  const cantidadTrasLaSegunda = [...state.movimientos.values()].filter((m) => m.fields["Tipo de movimiento"] === "Ajuste").length;

  assert(segunda.movimiento.id === primera.movimiento.id, "La segunda llamada devuelve el mismo movimiento — no duplica");
  assert(cantidadTrasLaSegunda === cantidadTrasLaPrimera, `Sigue habiendo el mismo número de Ajustes (obtenido: ${cantidadTrasLaSegunda})`);
  assert(segunda.cuadre.estadoAjuste === "Ajustado", "El cuadre sigue Ajustado tras la segunda llamada");

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — registrarAjusteDeCuadre rechaza sin diferencia y es idempotente.");
}

const fetchOriginal = global.fetch;
main();
