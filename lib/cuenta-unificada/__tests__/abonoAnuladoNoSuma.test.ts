/**
 * Un abono anulado no cuenta como dinero recibido.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/cuenta-unificada/__tests__/abonoAnuladoNoSuma.test.ts
 *
 * Anular un abono en Airtable NO borra el registro ni lo desvincula de su orden
 * u operación: sigue colgando de ellas. Por eso cada lectura tiene que
 * descartarlo, y un solo olvido reintroduce el monto en un total. En producción
 * hay 3 abonos anulados ($141) todavía vinculados.
 *
 * Caso de este test, tomado de OR000234: dos abonos, uno de $50 ANULADO y otro
 * de $10 vigente. El total abonado debe ser $10, y el abono anulado debe seguir
 * VISIBLE en la lista (para poder mostrarlo tachado) pero sin sumar.
 */

import { getCuentaUnificada } from "../index";
import { esAbonoVigente } from "@/types/cuenta-unificada";

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
  id: "recORD234",
  fields: {
    ID: "OR000234",
    "Operaciones Comerciales": [],
    "Repuestos de Stock (V2)": [],
    "Abonos (Operación)": ["recANULADO", "recVIGENTE"],
    "Costo Total Servicios NV": 40,
    "Total Productos Digitales": 0,
    "Total Abonado NV": 10,
  },
};

const ABONOS: Record<string, { id: string; fields: Record<string, unknown> }> = {
  recANULADO: {
    id: "recANULADO",
    fields: {
      "ID Abono": 15,
      Monto: 50,
      "Método de Pago": "Transferencia",
      "Fecha de Abono": "2026-05-01T00:00:00.000Z",
      "Estado del Abono": "Anulado",
      "Aplicado a: Orden": ["recORD234"],
    },
  },
  recVIGENTE: {
    id: "recVIGENTE",
    fields: {
      "ID Abono": 148,
      Monto: 10,
      "Método de Pago": "Efectivo",
      "Fecha de Abono": "2026-07-10T11:29:00.000Z",
      "Estado del Abono": "Registrado",
      "Aplicado a: Orden": ["recORD234"],
    },
  },
};

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function fakeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const d = decodeURIComponent(url);
  if (d.includes("/Órdenes de Reparación/recORD234")) return Promise.resolve(json(ORDEN));
  if (d.includes("/Abonos")) {
    const ids = Object.keys(ABONOS).filter((id) => d.includes(id));
    return Promise.resolve(json({ records: ids.map((id) => ABONOS[id]) }));
  }
  if (d.includes("/Servicios por Orden") || d.includes("/Repuestos por Orden") || d.includes("/Shipping Items") || d.includes("/Productos Digitales")) {
    return Promise.resolve(json({ records: [] }));
  }
  throw new Error(`fetch inesperado en el test hacia: ${url}`);
}

async function main(): Promise<void> {
  // ── El helper por sí solo ─────────────────────────────────────────────────
  assert(esAbonoVigente({ estado: "Registrado" }), "Un abono Registrado es vigente");
  assert(!esAbonoVigente({ estado: "Anulado" }), "Un abono Anulado NO es vigente");
  assert(esAbonoVigente({ estado: "" }), "Sin estado se considera vigente (no perder dinero por un campo vacío)");

  process.env.AIRTABLE_API_KEY = "fake-token-para-test";
  process.env.AIRTABLE_BASE_ID = "appFAKE0000000000";
  global.fetch = fakeFetch as unknown as typeof global.fetch;

  try {
    const cuenta = await getCuentaUnificada({ ordenId: "recORD234" });

    assert(cuenta.abonos.length === 2, "Los dos abonos siguen VISIBLES en la lista");
    assert(
      cuenta.abonos.some((a) => a.estado === "Anulado"),
      "El anulado se expone con su estado, para poder mostrarlo tachado"
    );
    assert(
      cuenta.totalAbonado === 10,
      `El anulado NO suma: total abonado $10, no $60 (vino ${cuenta.totalAbonado})`
    );
    assert(cuenta.totalCuenta === 40, `El total de la cuenta son los servicios: $40 (vino ${cuenta.totalCuenta})`);
    assert(cuenta.saldo === 30, `Saldo pendiente $30 (40 - 10), no -$20 (vino ${cuenta.saldo})`);
  } finally {
    global.fetch = fetchOriginal;
  }

  if (fallos > 0) {
    console.error(`\n${fallos} assert(s) fallaron.`);
    process.exit(1);
  }
  console.log("\n✅ abonoAnuladoNoSuma.test.ts — todos los asserts pasaron");
}

void main();
