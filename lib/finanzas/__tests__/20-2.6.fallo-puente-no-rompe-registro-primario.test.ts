/**
 * Test §7 #6 (Fase 20.2) — Fallo del puente no rompe el registro primario:
 * crearMovimientoParaAbono() nunca lanza, incluso ante un fallo real
 * (Airtable devolviendo error en el POST) — siempre devuelve {ok:false},
 * para que los endpoints de abonos (que ya envuelven la llamada y devuelven
 * success:true con un warning, ver app/api/operaciones/[id]/abonos/route.ts
 * y app/api/tecnicos/ordenes/[id]/abonos/route.ts) nunca vean una excepción
 * que tumbe la respuesta del abono ya creado.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/finanzas/__tests__/20-2.6.fallo-puente-no-rompe-registro-primario.test.ts
 */

import { crearMovimientoParaAbono } from "../puentes/abonos";
import { __resetCacheNombreTablaParaPruebas } from "../table-names";
import { activarEnvFalso, construirFetchDouble, crearCuentaDouble, crearEstadoDouble, crearRegistroDouble, limpiarEnvFalso } from "./_airtableDouble";

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

  // Caso 1: abono que no existe en absoluto (simula un id corrupto/carrera).
  global.fetch = construirFetchDouble(state) as typeof fetch;
  let lanzo = false;
  let resultado;
  try {
    resultado = await crearMovimientoParaAbono({
      abonoId: "recNoExiste00001",
      monto: 50,
      metodoPago: "Efectivo",
      fecha: "2026-07-12T10:00:00.000Z",
      registradoPor: "Test",
    });
  } catch {
    lanzo = true;
  }
  assert(!lanzo, "crearMovimientoParaAbono no lanza aunque el abono no exista");
  assert(!!resultado && resultado.ok === false, "Devuelve {ok:false} en vez de lanzar");

  // Caso 2: el POST a Movimientos falla (Airtable caído/rechazo de esquema)
  // — se fuerza reemplazando el fetch por uno que siempre falla en POST.
  crearCuentaDouble(state, { nombre: "Caja Registradora", fechaCorte: "2026-01-01" });
  const abonoId = crearRegistroDouble(state, "Abonos", { Monto: 50, "Método de Pago": "Efectivo" });
  const dobleBase = construirFetchDouble(state);
  global.fetch = (async (url: string | URL, init?: RequestInit) => {
    if ((init?.method ?? "GET").toUpperCase() === "POST" && String(url).includes("Movimientos")) {
      return { ok: false, status: 500, text: async () => "Airtable caído (simulado)" } as Response;
    }
    return dobleBase(url, init);
  }) as typeof fetch;

  let lanzo2 = false;
  let resultado2;
  try {
    resultado2 = await crearMovimientoParaAbono({
      abonoId,
      monto: 50,
      metodoPago: "Efectivo",
      fecha: "2026-07-12T10:00:00.000Z",
      registradoPor: "Test",
    });
  } catch {
    lanzo2 = true;
  }
  assert(!lanzo2, "crearMovimientoParaAbono no lanza aunque el POST a Airtable falle");
  assert(!!resultado2 && resultado2.ok === false, "Devuelve {ok:false} también en este caso");

  global.fetch = fetchOriginal;
  limpiarEnvFalso();

  if (fallos > 0) {
    console.error(`\n${fallos} fallo(s).`);
    process.exit(1);
  }
  console.log("\nOK — el puente nunca lanza, el registro primario nunca se ve afectado.");
}

const fetchOriginal = global.fetch;
main();
