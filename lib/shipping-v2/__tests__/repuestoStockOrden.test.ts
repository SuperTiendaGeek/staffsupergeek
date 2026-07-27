/**
 * Apartar y liberar un repuesto de stock para una orden de reparación.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/shipping-v2/__tests__/repuestoStockOrden.test.ts
 *
 * Regla de negocio: vincular un repuesto a una orden lo pone en RESERVADO,
 * pero NO lo descuenta del inventario — sigue siendo stock de la casa y sigue
 * contando. Solo una factura o un recibo reducen la cantidad.
 *
 * Antes de este fix se marcaban las banderas (Reservado / Disponible para
 * venta) pero el Estado Item se quedaba como estuviera ("Repuesto",
 * "En revisión", "Pagado"…), así que el semáforo del inventario no mostraba que
 * la pieza estaba comprometida. En producción quedaron 12 artículos con
 * Reservado ✓ y un estado que decía otra cosa.
 */

import {
  reservarShippingItemComoRepuestoDeOrdenStock,
  liberarShippingItemDeOrdenStock,
} from "../airtable";

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

type Campos = Record<string, unknown>;
let items: Record<string, Campos> = {};
let patches: Array<{ id: string; fields: Campos }> = [];

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const d = decodeURIComponent(url);

  if (init?.method === "PATCH") {
    const body = JSON.parse(String(init.body ?? "{}")) as { records: Array<{ id: string; fields: Campos }> };
    const r = body.records[0];
    patches.push(r);
    items[r.id] = { ...(items[r.id] ?? {}), ...r.fields };
    return Promise.resolve(json({ records: [{ id: r.id, fields: items[r.id] }] }));
  }
  if (init?.method === "POST") return Promise.resolve(json({ records: [{ id: "recEVENTO", fields: {} }] })); // Shipping Eventos

  const id = Object.keys(items).find((k) => d.includes(k));
  if (id) return Promise.resolve(json({ id, fields: items[id] }));
  return Promise.resolve(json({ records: [] }));
}

function prepararItem(id: string, fields: Campos) {
  items = { [id]: fields };
  patches = [];
}

function ultimoPatch(): Campos {
  return patches[patches.length - 1]?.fields ?? {};
}

async function esperaError(fn: () => Promise<unknown>, fragmento: string, caso: string) {
  try {
    await fn();
    assert(false, `${caso} → debía fallar con "${fragmento}" pero no falló`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    assert(msg.includes(fragmento), `${caso} → falla con "${fragmento}" (vino: "${msg}")`);
  }
}

const ORDEN = "recORD378";

async function main(): Promise<void> {
  process.env.AIRTABLE_API_KEY = "fake-token-para-test";
  process.env.AIRTABLE_BASE_ID = "appFAKE0000000000";
  global.fetch = fakeFetch as unknown as typeof global.fetch;

  const opciones = { itemId: "recSSD", ordenRecordId: ORDEN, ordenIdVisible: "OR000378", registradoPor: "Test" };

  try {
    // ── Apartar ───────────────────────────────────────────────────────────────
    prepararItem("recSSD", {
      Categoría: "SSD",
      "Estado Item": "Disponible",
      "Disponible para venta": true,
      Reservado: false,
      Cantidad: 52,
      "Nombre del item": "Disco Duro Sólido Interno 120GB",
    });
    await reservarShippingItemComoRepuestoDeOrdenStock(opciones);

    assert(items["recSSD"]["Estado Item"] === "Reservado", "FIX: el Estado Item pasa a 'Reservado' (antes no se tocaba)");
    assert(items["recSSD"]["Reservado"] === true, "Queda marcado como reservado");
    assert(items["recSSD"]["Disponible para venta"] === false, "Sale de la venta mientras está comprometido");
    assert(
      !("Cantidad" in ultimoPatch()),
      "REGLA: apartar NO toca la cantidad — el repuesto sigue en inventario hasta que se facture"
    );
    assert(items["recSSD"]["Cantidad"] === 52, "La cantidad se conserva intacta");

    // ── Categorías montables ─────────────────────────────────────────────────
    prepararItem("recSSD", { Categoría: "RAM", "Estado Item": "Disponible", "Disponible para venta": true, Reservado: false });
    await reservarShippingItemComoRepuestoDeOrdenStock(opciones);
    assert(items["recSSD"]["Estado Item"] === "Reservado", "Una RAM también se puede montar como repuesto");

    prepararItem("recSSD", { Categoría: "Laptop", "Estado Item": "Disponible", "Disponible para venta": true, Reservado: false });
    await esperaError(
      () => reservarShippingItemComoRepuestoDeOrdenStock(opciones),
      "no se puede montar como repuesto",
      "Un equipo completo (Laptop) NO se puede montar como repuesto"
    );

    // ── No se aparta dos veces ───────────────────────────────────────────────
    prepararItem("recSSD", { Categoría: "SSD", "Estado Item": "Reservado", "Disponible para venta": false, Reservado: true });
    await esperaError(
      () => reservarShippingItemComoRepuestoDeOrdenStock(opciones),
      "ya está reservado",
      "Un repuesto ya apartado no se puede volver a apartar"
    );

    // ── Liberar ──────────────────────────────────────────────────────────────
    prepararItem("recSSD", {
      Categoría: "SSD",
      "Estado Item": "Reservado",
      "Disponible para venta": false,
      Reservado: true,
      Cantidad: 52,
      "Orden de Reparación (Stock)": [ORDEN],
    });
    await liberarShippingItemDeOrdenStock(opciones);
    assert(items["recSSD"]["Estado Item"] === "Disponible", "Liberar devuelve el repuesto a Disponible");
    assert(items["recSSD"]["Reservado"] === false, "Liberar quita la marca de reservado");
    assert(items["recSSD"]["Cantidad"] === 52, "Liberar tampoco toca la cantidad");

    // El repuesto siguió otro camino mientras estaba en la orden.
    prepararItem("recSSD", {
      Categoría: "SSD",
      "Estado Item": "Vendido",
      "Disponible para venta": false,
      Reservado: true,
      "Orden de Reparación (Stock)": [ORDEN],
    });
    await liberarShippingItemDeOrdenStock(opciones);
    assert(
      items["recSSD"]["Estado Item"] === "Vendido",
      "FIX: liberar NO resucita a la venta un repuesto que ya se vendió"
    );
    assert(items["recSSD"]["Reservado"] === false, "…pero sí le quita la marca de reservado");

    // ── No se libera de una orden a la que no pertenece ───────────────────────
    prepararItem("recSSD", { Categoría: "SSD", "Estado Item": "Reservado", Reservado: true, "Orden de Reparación (Stock)": ["recOTRA"] });
    await esperaError(
      () => liberarShippingItemDeOrdenStock(opciones),
      "no está reservado como stock de esta orden",
      "No se puede liberar un repuesto apartado para OTRA orden"
    );
  } finally {
    global.fetch = fetchOriginal;
  }

  if (fallos > 0) {
    console.error(`\n${fallos} assert(s) fallaron.`);
    process.exit(1);
  }
  console.log("\n✅ repuestoStockOrden.test.ts — todos los asserts pasaron");
}

void main();
