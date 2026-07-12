/**
 * Test §9 #8 — Resolución de nombre de tabla + invalidación de caché tras un
 * rename real en Airtable (Corrección 4).
 * Ejecutar: npx tsx lib/finanzas/__tests__/8.resolucion-tabla.test.ts
 *
 * global.fetch reemplazado por el doble de _airtableDouble.ts — nunca toca
 * Airtable real.
 */

import { getClient } from "../airtable-client";
import {
  __resetCacheNombreTablaParaPruebas,
  conResolucionDeTablaMovimientos,
  resolverNombreTablaMovimientos,
} from "../table-names";
import { activarEnvFalso, construirFetchDouble, crearEstadoDouble, limpiarEnvFalso } from "./_airtableDouble";

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

const fetchOriginal = global.fetch;
activarEnvFalso();

async function conSoloTablaVieja() {
  __resetCacheNombreTablaParaPruebas();
  const state = crearEstadoDouble("Shipping Finanzas Movimientos");
  global.fetch = construirFetchDouble(state) as typeof fetch;
  const nombre = await resolverNombreTablaMovimientos(getClient());
  assert(nombre === "Shipping Finanzas Movimientos", "Con solo la tabla vieja presente, resuelve al nombre viejo");
}

async function conSoloTablaNueva() {
  __resetCacheNombreTablaParaPruebas();
  const state = crearEstadoDouble("Movimientos Financieros");
  global.fetch = construirFetchDouble(state) as typeof fetch;
  const nombre = await resolverNombreTablaMovimientos(getClient());
  assert(nombre === "Movimientos Financieros", "Con solo la tabla nueva presente, resuelve al nombre nuevo");
}

async function conNingunaTabla() {
  __resetCacheNombreTablaParaPruebas();
  const state = crearEstadoDouble("Una Tabla Que No Existe En Absoluto");
  global.fetch = construirFetchDouble(state) as typeof fetch;
  const lanzo = await lanzaAsync(() => resolverNombreTablaMovimientos(getClient()));
  assert(lanzo, "Sin ninguna de las dos tablas, lanza un error claro");
}

async function conInvalidacionYReintento() {
  __resetCacheNombreTablaParaPruebas();
  // Arranca con la tabla vieja activa — se cachea "Shipping Finanzas Movimientos".
  const state = crearEstadoDouble("Shipping Finanzas Movimientos");
  global.fetch = construirFetchDouble(state) as typeof fetch;
  const primeraResolucion = await resolverNombreTablaMovimientos(getClient());
  assert(primeraResolucion === "Shipping Finanzas Movimientos", "Primera resolución cachea el nombre viejo");

  // Simula el rename real en Airtable: la tabla activa pasa a ser la nueva,
  // sin que nadie invalide el caché en memoria del proceso todavía.
  state.tablaMovimientosActiva = "Movimientos Financieros";

  let intentos = 0;
  const resultado = await conResolucionDeTablaMovimientos(getClient(), async (nombreTabla) => {
    intentos++;
    // Simula la operación real: un GET contra la tabla resuelta.
    const url = new URL(`${getClient().baseUrl}/${encodeURIComponent(nombreTabla)}`);
    url.searchParams.set("pageSize", "1");
    const response = await fetch(url.toString(), { headers: getClient().headers });
    if (!response.ok) throw new Error("TABLE_NOT_FOUND (404)");
    return nombreTabla;
  });

  assert(resultado === "Movimientos Financieros", "Tras el rename, la operación termina resolviendo el nombre nuevo");
  assert(intentos === 2, "La operación se reintentó exactamente una vez tras la invalidación (2 intentos en total)");
}

async function main() {
  await conSoloTablaVieja();
  await conSoloTablaNueva();
  await conNingunaTabla();
  await conInvalidacionYReintento();

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — resolución de nombre de tabla e invalidación de caché correctas.");
}

main();
