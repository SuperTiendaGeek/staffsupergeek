/**
 * Test de integración — getCuentaUnificada() con una orden CON operación
 * vinculada que además tiene un repuesto de stock V2 (fix bug preexistente
 * Fase 11, ver resolverGatesRepuestos.test.ts para la lógica pura).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/cuenta-unificada/__tests__/repuestosStockV2ConOperacion.test.ts
 *
 * Antes del fix: el repuesto de stock ("recITEM1", linkeado vía "Orden de
 * Reparación (Stock)") NUNCA se fetcheaba en este escenario — solo
 * aparecía el item de la operación ("recITEM2"). Después del fix, ambos
 * aparecen y sí suman al total.
 *
 * global.fetch reemplazado por un doble que dispatchea por tabla/URL —
 * nunca toca Airtable real. Lanza en la primera falla y sale con código
 * distinto de 0.
 */

import { getCuentaUnificada } from "../index";

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

const ORDEN = {
  id: "recORD1",
  fields: {
    "ID": "ORD-001",
    "Modo repuestos": "V2",
    "Operaciones Comerciales": ["recOPE1"],
    "Repuestos de Stock (V2)": ["recITEM1"], // inverso de Shipping Items."Orden de Reparación (Stock)"
    "Abonos (Operación)": [],
    "Costo Total Servicios NV": 0,
    "Total Productos Digitales": 0,
    "Total Abonado NV": 0,
  },
};

const OPERACION = {
  id: "recOPE1",
  fields: {
    "Código Operación": "OPE-001",
    "Orden de Reparación": ["recORD1"],
    "Artículo físico": ["recITEM2"], // pedido de la operación
    "Abonos": [],
    "Total Abonado": 0,
  },
};

const ITEM_STOCK = {
  id: "recITEM1",
  fields: { "Nombre del item": "Repuesto de stock", "Precio venta final": 50, "Total Cubierto": 0, "Saldo Item": 50 },
};
const ITEM_PEDIDO = {
  id: "recITEM2",
  fields: { "Nombre del item": "Repuesto de pedido", "Precio venta final": 30, "Total Cubierto": 0, "Saldo Item": 30 },
};

function fetchDoble(url: string | URL) {
  const urlStr = String(url);

  if (urlStr.includes("/Órdenes%20de%20Reparación/recORD1") || urlStr.includes(encodeURIComponent(ORDEN.id))) {
    if (urlStr.includes(encodeURIComponent("Órdenes de Reparación"))) {
      return Promise.resolve({ ok: true, json: async () => ORDEN } as Response);
    }
  }
  if (urlStr.includes(encodeURIComponent("Operación Comercial")) && urlStr.includes("recOPE1")) {
    // Una orden puede tener varias operaciones, así que ahora se piden por
    // listado filtrado (RECORD_ID()) y no por GET directo. El GET por id sigue
    // usándose al entrar desde una operación.
    const esListado = urlStr.includes("filterByFormula");
    return Promise.resolve({
      ok: true,
      json: async () => (esListado ? { records: [OPERACION] } : OPERACION),
    } as Response);
  }
  if (urlStr.includes(encodeURIComponent("Servicios por Orden"))) {
    return Promise.resolve({ ok: true, json: async () => ({ records: [] }) } as Response);
  }
  if (urlStr.includes(encodeURIComponent("Repuestos por Orden"))) {
    return Promise.resolve({ ok: true, json: async () => ({ records: [] }) } as Response);
  }
  if (urlStr.includes(encodeURIComponent("Shipping Items"))) {
    if (urlStr.includes("recITEM1")) {
      return Promise.resolve({ ok: true, json: async () => ({ records: [ITEM_STOCK] }) } as Response);
    }
    if (urlStr.includes("recITEM2")) {
      return Promise.resolve({ ok: true, json: async () => ({ records: [ITEM_PEDIDO] }) } as Response);
    }
    return Promise.resolve({ ok: true, json: async () => ({ records: [] }) } as Response);
  }
  if (urlStr.includes(encodeURIComponent("Abonos"))) {
    return Promise.resolve({ ok: true, json: async () => ({ records: [] }) } as Response);
  }
  if (urlStr.includes(encodeURIComponent("Productos Digitales"))) {
    return Promise.resolve({ ok: true, json: async () => ({ records: [] }) } as Response);
  }

  throw new Error(`fetch inesperado en el test hacia: ${urlStr}`);
}

(async () => {
  process.env.AIRTABLE_API_KEY = "fake-token-para-test";
  process.env.AIRTABLE_BASE_ID = "appFAKEBASE0001";
  global.fetch = fetchDoble as unknown as typeof fetch;

  const cuenta = await getCuentaUnificada({ ordenId: "recORD1" });

  global.fetch = fetchOriginal;
  delete process.env.AIRTABLE_API_KEY;
  delete process.env.AIRTABLE_BASE_ID;

  assert(cuenta.items.length === 2, "FIX: deben aparecer los DOS items — el de stock y el del pedido (antes solo aparecía el del pedido)");
  assert(!!cuenta.items.find((i) => i.id === "recITEM1"), "El repuesto de stock (recITEM1) debe estar en cuenta.items");
  assert(!!cuenta.items.find((i) => i.id === "recITEM2"), "El repuesto de pedido (recITEM2) debe seguir estando en cuenta.items");
  assert(cuenta.totalRepuestos === 80, `FIX: totalRepuestos debe incluir ambos (50+30=80) — vino ${cuenta.totalRepuestos}`);
  assert(cuenta.modoRepuestos === "v2", "modoRepuestos debe resolverse como v2");
  assert(cuenta.operacionId === "recOPE1", "operacionId debe seguir resolviéndose igual que antes");
  assert(cuenta.ordenId === "recORD1", "ordenId debe seguir resolviéndose igual que antes");

  if (fallos > 0) {
    console.error(`\n❌ repuestosStockV2ConOperacion.test.ts — ${fallos} aserción(es) fallida(s)`);
    process.exit(1);
  }
  console.log("\n✅ repuestosStockV2ConOperacion.test.ts — todos los asserts pasaron");
})();
