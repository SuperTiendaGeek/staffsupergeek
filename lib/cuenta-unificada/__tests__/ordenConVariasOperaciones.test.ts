/**
 * Una orden con VARIAS operaciones comerciales vinculadas.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/cuenta-unificada/__tests__/ordenConVariasOperaciones.test.ts
 *
 * El link Orden↔Operación es N:M en Airtable, pero el código leía solo la
 * primera (`linkedIds(...)[0]`). Todo lo cotizado en la segunda quedaba fuera
 * de la cuenta.
 *
 * Caso real OR000346 (Irene Navarrete):
 *   · OP-2026-000011 → Tapa Pantalla HP, $125, con un abono de $20
 *   · OP-2026-000049 → Batería HP HT03XL, $70
 *   · Servicio de la orden: $25
 *   · Abonos de la orden: $200 + $20  →  $220 recibidos
 *
 * Antes: la cuenta veía $125 + $25 = $150 e ignoraba la batería.
 * Ahora: $125 + $70 + $25 = $220, que es exactamente lo cobrado (saldo 0) y lo
 * mismo que calcula "Total a Pagar NV" en Airtable.
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
  id: "recORD346",
  fields: {
    ID: "OR000346",
    "Operaciones Comerciales": ["recOPE011", "recOPE049"],
    "Repuestos de Stock (V2)": [],
    "Abonos (Operación)": ["recABONO200", "recABONO20"],
    "Costo Total Servicios NV": 25,
    "Total Productos Digitales": 0,
    "Total Abonado NV": 220,
  },
};

const OPERACIONES: Record<string, { id: string; fields: Record<string, unknown> }> = {
  recOPE011: {
    id: "recOPE011",
    fields: {
      "Código Operación": "OP-2026-000011",
      "Orden de Reparación": ["recORD346"],
      "Artículo físico": ["recITEMTAPA"],
      Abonos: ["recABONO20"],
      "Total Abonado": 20,
    },
  },
  recOPE049: {
    id: "recOPE049",
    fields: {
      "Código Operación": "OP-2026-000049",
      "Orden de Reparación": ["recORD346"],
      "Artículo físico": ["recITEMBAT"],
      Abonos: [],
      "Total Abonado": 0,
    },
  },
};

const ITEMS: Record<string, { id: string; fields: Record<string, unknown> }> = {
  recITEMTAPA: { id: "recITEMTAPA", fields: { "Nombre del item": "HP LCD Back Cover & Bezel & Hinges", "Precio venta final": 125 } },
  recITEMBAT: { id: "recITEMBAT", fields: { "Nombre del item": "BATERIA HP HT03XL INTERNA ORIGINAL", "Precio venta final": 70 } },
};

const ABONOS: Record<string, { id: string; fields: Record<string, unknown> }> = {
  recABONO200: {
    id: "recABONO200",
    fields: { "ID Abono": 53, Monto: 200, "Método de Pago": "Efectivo", "Fecha de Abono": "2026-06-22T00:00:00.000Z", "Estado del Abono": "Registrado", "Aplicado a: Orden": ["recORD346"] },
  },
  recABONO20: {
    id: "recABONO20",
    fields: { "ID Abono": 157, Monto: 20, "Método de Pago": "Efectivo", "Fecha de Abono": "2026-07-27T14:57:00.000Z", "Estado del Abono": "Registrado", "Aplicado a: Orden": ["recORD346"], "Aplicado a: Operación": ["recOPE011"] },
  },
};

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function fakeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const d = decodeURIComponent(url);

  if (d.includes("/Órdenes de Reparación/recORD346")) return Promise.resolve(json(ORDEN));

  if (d.includes("/Operación Comercial")) {
    const ids = Object.keys(OPERACIONES).filter((id) => d.includes(id));
    if (d.includes("/Operación Comercial/")) return Promise.resolve(json(OPERACIONES[ids[0]]));
    return Promise.resolve(json({ records: ids.map((id) => OPERACIONES[id]) }));
  }
  if (d.includes("/Shipping Items")) {
    const ids = Object.keys(ITEMS).filter((id) => d.includes(id));
    return Promise.resolve(json({ records: ids.map((id) => ITEMS[id]) }));
  }
  if (d.includes("/Abonos")) {
    const ids = Object.keys(ABONOS).filter((id) => d.includes(id));
    return Promise.resolve(json({ records: ids.map((id) => ABONOS[id]) }));
  }
  if (d.includes("/Servicios por Orden") || d.includes("/Repuestos por Orden")) {
    return Promise.resolve(json({ records: [] }));
  }

  throw new Error(`fetch inesperado en el test hacia: ${url}`);
}

async function main(): Promise<void> {
  process.env.AIRTABLE_API_KEY = "fake-token-para-test";
  process.env.AIRTABLE_BASE_ID = "appFAKE0000000000";
  global.fetch = fakeFetch as unknown as typeof global.fetch;

  try {
    const cuenta = await getCuentaUnificada({ ordenId: "recORD346" });

    assert(cuenta.items.length === 2, `FIX: deben verse los artículos de LAS DOS operaciones — vinieron ${cuenta.items.length}`);
    assert(!!cuenta.items.find((i) => i.id === "recITEMTAPA"), "Aparece la tapa de pantalla (primera operación)");
    assert(
      !!cuenta.items.find((i) => i.id === "recITEMBAT"),
      "FIX: aparece la batería (segunda operación, antes invisible)"
    );
    assert(cuenta.totalRepuestos === 195, `Los repuestos suman 125 + 70 = 195 — vino ${cuenta.totalRepuestos}`);
    assert(
      cuenta.totalCuenta === 220,
      `FIX: el total es 220 (125 + 70 + 25 de servicio), igual que Total a Pagar NV — vino ${cuenta.totalCuenta}`
    );
    assert(cuenta.totalAbonado === 220, `Se recibieron 220 (200 + 20) — vino ${cuenta.totalAbonado}`);
    assert(cuenta.saldo === 0, `FIX: la orden queda saldada, no debiendo 70 — vino ${cuenta.saldo}`);

    // El abono de $20 tiene los dos links; no debe duplicarse (ver abonoDualNoSeDuplica).
    assert(cuenta.abonos.length === 2, `Los abonos son 2, no 3 — vinieron ${cuenta.abonos.length}`);

    // La "principal" se sigue exponiendo para las pantallas y el gancho.
    assert(cuenta.operacionCodigo === "OP-2026-000011", "Se expone la primera operación como principal");
    assert(cuenta.ordenIdVisible === "OR000346", "La orden se resuelve igual que antes");
  } finally {
    global.fetch = fetchOriginal;
  }

  if (fallos > 0) {
    console.error(`\n${fallos} assert(s) fallaron.`);
    process.exit(1);
  }
  console.log("\n✅ ordenConVariasOperaciones.test.ts — todos los asserts pasaron");
}

void main();
