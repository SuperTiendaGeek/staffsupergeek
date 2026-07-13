/**
 * Test §9 #5 (Fase 20.3, Corrección 2) — procesarAcreditacion(): idempotencia
 * y recuperación de fallo parcial, por TIPO de hijo, no por cantidad.
 * (a) Llamar dos veces sobre un movimiento ya Acreditado con sus 2 hijos ya
 *     creados → segunda llamada no crea nada nuevo.
 * (b) El Paso A tiene éxito pero la creación del Interno-hijo falla → queda
 *     Acreditado sin hijos; una segunda llamada completa los 2 faltantes.
 * (c) Solo el Interno-hijo se alcanza a crear (1 hijo) → una segunda llamada
 *     detecta por TIPO que falta el Ajuste-hijo (no por conteo) y crea
 *     únicamente ese, sin duplicar el Interno-hijo ya existente.
 * (d) Reintentar con un montoNeto distinto al ya persistido → rechazado.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-3.5.procesarAcreditacion-idempotencia-por-tipo.test.ts
 */

import { procesarAcreditacion } from "../acreditacion";
import { crearMovimiento } from "../movimientos";
import { __resetCacheNombreTablaParaPruebas } from "../table-names";
import {
  activarEnvFalso,
  construirFetchDouble,
  crearCuentaDouble,
  crearEstadoDouble,
  limpiarEnvFalso,
  permitirTransferencia,
  type AirtableDoubleState,
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

function prepararCuentas(state: AirtableDoubleState) {
  const transitoId = crearCuentaDouble(state, { nombre: "Tarjetas en Tránsito", tipo: "Tránsito", fechaCorte: "2026-01-01" });
  const sgIngresosId = crearCuentaDouble(state, { nombre: "SGINGRESOS", tipo: "Principal", fechaCorte: "2026-01-01" });
  permitirTransferencia(state, transitoId, sgIngresosId);
  return { transitoId, sgIngresosId };
}

/** Fetch que falla una única vez el POST cuyo primer record tenga el `Tipo de movimiento` indicado. */
function construirFetchQueFallaUnaVezPorTipo(state: AirtableDoubleState, tipoAFallar: string) {
  const dobleBase = construirFetchDouble(state);
  let yaFallo = false;
  return (async (url: string | URL, init?: RequestInit) => {
    if (!yaFallo && (init?.method ?? "GET").toUpperCase() === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { records?: Array<{ fields?: Record<string, unknown> }> };
      const tipo = body.records?.[0]?.fields?.["Tipo de movimiento"];
      if (tipo === tipoAFallar) {
        yaFallo = true;
        return { ok: false, status: 500, text: async () => "Airtable caído (simulado)" } as Response;
      }
    }
    return dobleBase(url, init);
  }) as typeof fetch;
}

async function escenarioA() {
  activarEnvFalso();
  __resetCacheNombreTablaParaPruebas();
  const state = crearEstadoDouble("Movimientos Financieros");
  global.fetch = construirFetchDouble(state) as typeof fetch;
  const { transitoId } = prepararCuentas(state);

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

  const primera = await procesarAcreditacion(pendiente.id, { montoNeto: 28.8, fecha: "2026-07-17T10:00:00.000Z", registradoPor: "Test" });
  const totalMovimientosTrasElPrimero = state.movimientos.size;

  const segunda = await procesarAcreditacion(pendiente.id, { montoNeto: 28.8, fecha: "2026-07-17T10:00:00.000Z", registradoPor: "Test" });

  assert(state.movimientos.size === totalMovimientosTrasElPrimero, "(a) La segunda llamada no crea ningún registro nuevo");
  assert(segunda.interno.id === primera.interno.id, "(a) Devuelve el mismo Interno-hijo");
  assert(segunda.ajuste!.id === primera.ajuste!.id, "(a) Devuelve el mismo Ajuste-hijo");

  limpiarEnvFalso();
}

async function escenarioB() {
  activarEnvFalso();
  __resetCacheNombreTablaParaPruebas();
  const state = crearEstadoDouble("Movimientos Financieros");
  const { transitoId } = prepararCuentas(state);
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

  global.fetch = construirFetchQueFallaUnaVezPorTipo(state, "Movimiento Interno");
  let lanzo = false;
  try {
    await procesarAcreditacion(pendiente.id, { montoNeto: 28.8, fecha: "2026-07-17T10:00:00.000Z", registradoPor: "Test" });
  } catch {
    lanzo = true;
  }
  assert(lanzo, "(b) La llamada falla cuando la creación del Interno-hijo falla");
  assert(state.movimientos.get(pendiente.id)?.fields["Estado del Movimiento"] === "Acreditado", "(b) El Paso A ya quedó aplicado (Acreditado)");
  const hijosTrasFallo = [...state.movimientos.values()].filter((m) => (m.fields["Reversa a"] as string[] | undefined)?.length);
  assert(hijosTrasFallo.length === 0, "(b) Ningún hijo se creó tras el fallo parcial");

  global.fetch = construirFetchDouble(state) as typeof fetch;
  const recuperado = await procesarAcreditacion(pendiente.id, { montoNeto: 28.8, fecha: "2026-07-17T10:00:00.000Z", registradoPor: "Test" });
  assert(recuperado.interno.tipo === "Movimiento Interno" && recuperado.ajuste?.tipo === "Ajuste", "(b) La segunda llamada completa los 2 hijos faltantes");

  limpiarEnvFalso();
}

async function escenarioC() {
  activarEnvFalso();
  __resetCacheNombreTablaParaPruebas();
  const state = crearEstadoDouble("Movimientos Financieros");
  const { transitoId } = prepararCuentas(state);
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

  global.fetch = construirFetchQueFallaUnaVezPorTipo(state, "Ajuste");
  let lanzo = false;
  try {
    await procesarAcreditacion(pendiente.id, { montoNeto: 28.8, fecha: "2026-07-17T10:00:00.000Z", registradoPor: "Test" });
  } catch {
    lanzo = true;
  }
  assert(lanzo, "(c) La llamada falla cuando la creación del Ajuste-hijo falla");
  const hijosTrasFalloParcial = [...state.movimientos.values()].filter((m) => (m.fields["Reversa a"] as string[] | undefined)?.length);
  assert(hijosTrasFalloParcial.length === 1, `(c) Exactamente 1 hijo se alcanzó a crear (obtenido: ${hijosTrasFalloParcial.length})`);
  assert(hijosTrasFalloParcial[0].fields["Tipo de movimiento"] === "Movimiento Interno", "(c) El hijo creado es el Interno, no el Ajuste");
  const internoIdOriginal = hijosTrasFalloParcial[0].id;

  global.fetch = construirFetchDouble(state) as typeof fetch;
  const recuperado = await procesarAcreditacion(pendiente.id, { montoNeto: 28.8, fecha: "2026-07-17T10:00:00.000Z", registradoPor: "Test" });
  assert(recuperado.interno.id === internoIdOriginal, "(c) El Interno-hijo NO se duplicó — es el mismo ya existente");
  assert(recuperado.ajuste !== null && recuperado.ajuste!.tipo === "Ajuste", "(c) El Ajuste-hijo faltante se creó, detectado por tipo (no por conteo)");
  const hijosFinal = [...state.movimientos.values()].filter((m) => (m.fields["Reversa a"] as string[] | undefined)?.length);
  assert(hijosFinal.length === 2, `(c) Al final hay exactamente 2 hijos, uno de cada tipo (obtenido: ${hijosFinal.length})`);

  limpiarEnvFalso();
}

async function escenarioD() {
  activarEnvFalso();
  __resetCacheNombreTablaParaPruebas();
  const state = crearEstadoDouble("Movimientos Financieros");
  const { transitoId } = prepararCuentas(state);
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

  await procesarAcreditacion(pendiente.id, { montoNeto: 28.8, fecha: "2026-07-17T10:00:00.000Z", registradoPor: "Test" });

  let lanzo = false;
  let mensaje = "";
  try {
    await procesarAcreditacion(pendiente.id, { montoNeto: 25, fecha: "2026-07-17T10:00:00.000Z", registradoPor: "Test" });
  } catch (error) {
    lanzo = true;
    mensaje = error instanceof Error ? error.message : String(error);
  }
  assert(lanzo, "(d) Reintentar con un montoNeto distinto al ya persistido es rechazado");
  assert(mensaje.includes("distinto"), `(d) El mensaje explica la inconsistencia (obtenido: "${mensaje}")`);

  limpiarEnvFalso();
}

async function main() {
  await escenarioA();
  await escenarioB();
  await escenarioC();
  await escenarioD();

  global.fetch = fetchOriginal;

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — idempotencia y recuperación de procesarAcreditacion por tipo, correctas.");
}

const fetchOriginal = global.fetch;
main();
