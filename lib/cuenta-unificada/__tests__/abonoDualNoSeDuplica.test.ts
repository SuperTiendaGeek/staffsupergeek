/**
 * Test de integración — getCuentaUnificada() con un abono vinculado A LA VEZ
 * a la orden y a la operación ("Aplicado a: Orden" + "Aplicado a: Operación").
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/cuenta-unificada/__tests__/abonoDualNoSeDuplica.test.ts
 *
 * Reproduce el caso real OR000382 ↔ OP-2026-000050 (cliente John Castañeda):
 * un ÚNICO registro de Abonos de $135 (recABONO1), con un único Movimiento
 * Financiero, que llega por las dos vías porque createAbonoPorOrden escribe
 * ambos links cuando la orden tiene operación vinculada.
 *
 * Antes del fix:
 *   - cuenta.abonos traía el MISMO record dos veces (la UI mostraba
 *     "Abonos (2)", uno con badge Orden y otro con badge Operación).
 *   - totalAbonado sumaba los dos rollups: 135 + 135 = 270.
 *   - saldo = 135 − 270 = −135 → "Saldo a favor del cliente $135" inexistente.
 *
 * Después del fix: 1 abono, origen "ambos", totalAbonado 135, saldo 0.
 *
 * global.fetch reemplazado por un doble que dispatchea por tabla/URL —
 * nunca toca Airtable real. Sale con código distinto de 0 si algo falla.
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

// Orden OR000382: 1 servicio de $25, 1 repuesto de stock de $20, y el abono
// dual. "Abonos (Operación)" es el inverso de Abonos."Aplicado a: Orden".
const ORDEN = {
  id: "recORD382",
  fields: {
    "ID": "OR000382",
    "Modo repuestos": "V2",
    "Operaciones Comerciales": ["recOPE50"],
    "Repuestos de Stock (V2)": ["recVENTILADOR"],
    "Abonos (Operación)": ["recABONO1"],
    "Costo Total Servicios NV": 25,
    "Total Productos Digitales": 0,
    // Rollup de Airtable: incluye el abono dual (llega por "Aplicado a: Orden").
    "Total Abonado NV": 135,
  },
};

// Operación OP-2026-000050: el item de pedido (batería $90) y el MISMO abono.
// "Abonos" es el inverso de Abonos."Aplicado a: Operación".
const OPERACION = {
  id: "recOPE50",
  fields: {
    "Código Operación": "OP-2026-000050",
    "Orden de Reparación": ["recORD382"],
    "Artículo físico": ["recBATERIA"],
    "Abonos": ["recABONO1"],
    // Rollup de Airtable: el MISMO dinero que "Total Abonado NV" de la orden.
    "Total Abonado": 135,
  },
};

const SHIPPING_ITEMS: Record<string, { id: string; fields: Record<string, unknown> }> = {
  recBATERIA: {
    id: "recBATERIA",
    fields: {
      "Nombre del item": "BATERIA DELL 7440 TYPE WD52H 7.4v 45Wh ORIGINAL",
      "Precio venta final": 90,
      "Total Cubierto": 135,
      "Saldo Item": 0,
    },
  },
  recVENTILADOR: {
    id: "recVENTILADOR",
    fields: {
      "Nombre del item": "Ventilador CN-0GVH35-60362 para Dell Latitude E7240",
      "Precio venta final": 20,
      "Total Cubierto": 0,
      "Saldo Item": 20,
    },
  },
};

// El ÚNICO registro de abono. Un solo record, un solo monto.
const ABONO = {
  id: "recABONO1",
  fields: {
    "ID Abono": 159,
    "Monto": 135,
    "Método de Pago": "Transferencia",
    "Fecha de Abono": "2026-07-27T17:20:00.000Z",
    "Estado del Abono": "Registrado",
    "Observación": "Número de cuenta 2208471737",
    "Aplicado a: Orden": ["recORD382"],
    "Aplicado a: Operación": ["recOPE50"],
  },
};

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function fakeFetch(input: RequestInfo | URL): Promise<Response> {
  const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const decoded = decodeURIComponent(urlStr);

  // GET por record id
  if (decoded.includes("/Órdenes de Reparación/recORD382")) return Promise.resolve(json(ORDEN));
  // Las operaciones de una orden se piden por listado filtrado (pueden ser
  // varias); el GET por id sigue usándose al entrar desde una operación.
  if (decoded.includes("Operación Comercial") && decoded.includes("recOPE50")) {
    return Promise.resolve(decoded.includes("filterByFormula") ? json({ records: [OPERACION] }) : json(OPERACION));
  }

  // Listados filtrados por RECORD_ID()
  if (decoded.includes("/Shipping Items")) {
    const ids = Object.keys(SHIPPING_ITEMS).filter((id) => decoded.includes(id));
    return Promise.resolve(json({ records: ids.map((id) => SHIPPING_ITEMS[id]) }));
  }
  if (decoded.includes("/Abonos")) {
    const records = decoded.includes("recABONO1") ? [ABONO] : [];
    return Promise.resolve(json({ records }));
  }
  // Servicios / Repuestos por Orden (legacy) — vacíos en este escenario.
  if (decoded.includes("/Servicios por Orden") || decoded.includes("/Repuestos por Orden")) {
    return Promise.resolve(json({ records: [] }));
  }

  throw new Error(`fetch inesperado en el test hacia: ${urlStr}`);
}

async function main(): Promise<void> {
  process.env.AIRTABLE_API_KEY = "fake-token-para-test";
  process.env.AIRTABLE_BASE_ID = "appFAKE0000000000";
  global.fetch = fakeFetch as unknown as typeof global.fetch;

  try {
    const cuenta = await getCuentaUnificada({ ordenId: "recORD382" });

    // ── El bug ────────────────────────────────────────────────────────────
    assert(
      cuenta.abonos.length === 1,
      `FIX: el abono dual debe aparecer UNA sola vez — vinieron ${cuenta.abonos.length}`
    );
    assert(
      cuenta.abonos[0]?.id === "recABONO1",
      "El abono conservado debe ser el record real recABONO1"
    );
    assert(
      cuenta.abonos[0]?.origen === "ambos",
      `FIX: un abono con los dos links debe marcarse origen "ambos" — vino "${cuenta.abonos[0]?.origen}"`
    );
    assert(
      cuenta.totalAbonado === 135,
      `FIX: totalAbonado NO debe sumar los dos rollups (135+135) — vino ${cuenta.totalAbonado}`
    );

    // ── Consecuencias en la cuenta ───────────────────────────────────────
    assert(
      cuenta.totalCuenta === 135,
      `totalCuenta = 90 (batería) + 20 (ventilador) + 25 (servicio) = 135 — vino ${cuenta.totalCuenta}`
    );
    assert(
      cuenta.saldo === 0,
      `FIX: saldo debe ser 0, no un saldo a favor inventado — vino ${cuenta.saldo}`
    );

    // ── No debe romperse nada de lo que ya funcionaba ─────────────────────
    assert(cuenta.items.length === 2, `deben seguir apareciendo los 2 items — vinieron ${cuenta.items.length}`);
    assert(cuenta.totalServicios === 25, `totalServicios debe leerse del rollup — vino ${cuenta.totalServicios}`);
    assert(cuenta.operacionCodigo === "OP-2026-000050", "la operación vinculada debe resolverse igual que antes");
  } finally {
    global.fetch = fetchOriginal;
  }

  if (fallos > 0) {
    console.error(`\n${fallos} assert(s) fallaron.`);
    process.exit(1);
  }
  console.log("\nTodo OK.");
}

void main();
