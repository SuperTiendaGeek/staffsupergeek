/**
 * Test — regresión del flujo de mostrador (gancho Fase 16 PR2).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/gancho.regresionMostrador.test.ts
 *
 * crearRegistroFactura() ahora acepta ordenId/operacionId/clienteId
 * opcionales — este test confirma que sin ellos (el caso de mostrador, sin
 * cambios) el registro NO lleva ningún campo "Orden"/"Operación"/"Cliente",
 * exactamente igual que antes de esta PR. global.fetch reemplazado por un
 * doble simple; nunca toca Airtable real.
 *
 * Lanza en la primera falla y sale con código distinto de 0.
 */

import { crearRegistroFactura } from "../airtable/facturas";
import type { FacturaAirtableInput } from "../airtable/facturas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

const fetchOriginal = global.fetch;
const capturado: { body: { fields?: Record<string, unknown> } | null } = { body: null };

function fetchDoble(url: string | URL, init?: RequestInit) {
  capturado.body = init?.body ? JSON.parse(String(init.body)) : null;
  return Promise.resolve({ ok: true, json: async () => ({ id: "recTEST0009" }) } as Response);
}

const datosBase: FacturaAirtableInput = {
  claveAcceso:           "0".repeat(49),
  numeroFactura:         "001-002-000000700",
  secuencial:            "000000700",
  estado:                "AUTORIZADO",
  fechaEmision:          "2026-07-08",
  ambiente:              "1",
  clienteNombre:         "CONSUMIDOR FINAL",
  clienteIdentificacion: "9999999999999",
  subtotal:              40,
  iva:                   6,
  total:                 46,
};

(async () => {
  process.env.AIRTABLE_API_KEY = "fake-token-para-test";
  process.env.AIRTABLE_BASE_ID = "appFAKEBASE0001";
  global.fetch = fetchDoble as unknown as typeof fetch;

  // 1. Mostrador: sin ordenId/operacionId/clienteId — comportamiento intacto
  await crearRegistroFactura(datosBase);
  const camposMostrador = capturado.body?.fields ?? {};
  assert(!("Orden" in camposMostrador), "Mostrador: el registro NO debe llevar el campo 'Orden'");
  assert(!("Operación" in camposMostrador), "Mostrador: el registro NO debe llevar el campo 'Operación'");
  assert(!("Cliente" in camposMostrador), "Mostrador: el registro NO debe llevar el campo 'Cliente' (link)");
  assert(camposMostrador["Sincronización Inventario"] === "N/A", "Mostrador: Sincronización Inventario = N/A también");
  assert(camposMostrador["Cliente - Nombre"] === "CONSUMIDOR FINAL", "Mostrador: Cliente - Nombre (texto) sigue igual que antes");

  // 2. Gancho: con ordenId + clienteId — los links sí aparecen
  await crearRegistroFactura({ ...datosBase, ordenId: "recORDEN0001", clienteId: "recCLI0001" });
  const camposGancho = capturado.body?.fields ?? {};
  assert(Array.isArray(camposGancho["Orden"]) && (camposGancho["Orden"] as string[])[0] === "recORDEN0001", "Con ordenId: campo 'Orden' = [ordenId]");
  assert(Array.isArray(camposGancho["Cliente"]) && (camposGancho["Cliente"] as string[])[0] === "recCLI0001", "Con clienteId: campo 'Cliente' = [clienteId]");
  assert(!("Operación" in camposGancho), "Con solo ordenId (sin operacionId): no debe llevar 'Operación'");
  assert(camposGancho["Sincronización Inventario"] === "N/A", "Gancho en PR2: Sincronización Inventario sigue siendo N/A (PR3 la cambia)");

  // 3. Gancho vía operación: con operacionId
  await crearRegistroFactura({ ...datosBase, operacionId: "recOPER0001" });
  const camposOperacion = capturado.body?.fields ?? {};
  assert(Array.isArray(camposOperacion["Operación"]) && (camposOperacion["Operación"] as string[])[0] === "recOPER0001", "Con operacionId: campo 'Operación' = [operacionId]");
  assert(!("Orden" in camposOperacion), "Con solo operacionId: no debe llevar 'Orden'");

  global.fetch = fetchOriginal;
  delete process.env.AIRTABLE_API_KEY;
  delete process.env.AIRTABLE_BASE_ID;

  if (fallos > 0) {
    console.error(`\n❌ gancho.regresionMostrador.test.ts — ${fallos} aserción(es) fallida(s)`);
    process.exit(1);
  }
  console.log("\n✅ gancho.regresionMostrador.test.ts — todos los asserts pasaron");
})();
