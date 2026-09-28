/**
 * Fase 3b: lo aprobado en el presupuesto suma al total de la cuenta aunque
 * todavía no tenga su artículo — y nunca se cuenta dos veces con su cargo.
 * Ejecutar: npm test aprobadoSinArticuloSuma
 *
 * Orden simulada:
 *   · Pedido A: tapa de pantalla $125, CON artículo, línea Cargada.
 *   · Pedido B: batería $70, aprobada, SIN artículo todavía (falta pedirla).
 *   · Pedido C: teclado $90, aprobado, la operación YA tiene su artículo pero la
 *     línea todavía dice "Aprobada" (no se puso al día) → cuenta por el artículo.
 *   · Repuesto de stock SSD $40 aprobado sin unidad libre (sin stock).
 *   · Servicio de la orden $25.
 * Total esperado: 125 + 90 (artículos) + 25 (servicio) + 70 + 40 (aprobado sin artículo) = 350.
 */

import { getCuentaUnificada } from "../index";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const fetchOriginal = global.fetch;

const ORDEN = {
  id: "recORD900",
  fields: {
    ID: "OR000900",
    "Operaciones Comerciales": ["recOPA", "recOPB", "recOPC"],
    "Repuestos de Stock (V2)": [],
    "Costo Total Servicios NV": 25,
    "Total Productos Digitales": 0,
    "Presupuesto por Orden": ["recLA", "recLB", "recLC", "recLSSD", "recLSRV"],
  },
};
const op = (id: string, articulo: string[]) => ({ id, fields: { "Código Operación": id, "Orden de Reparación": ["recORD900"], "Artículo físico": articulo, Abonos: [] } });
const OPERACIONES: Record<string, ReturnType<typeof op>> = {
  recOPA: op("recOPA", ["recITA"]),
  recOPB: op("recOPB", []),
  recOPC: op("recOPC", ["recITC"]),
};
const ITEMS: Record<string, { id: string; fields: Record<string, unknown> }> = {
  recITA: { id: "recITA", fields: { "Nombre del item": "Tapa de pantalla", "Precio venta final": 125 } },
  recITC: { id: "recITC", fields: { "Nombre del item": "Teclado", "Precio venta final": 90 } },
};
const linea = (id: string, f: Record<string, unknown>) => ({ id, fields: { Cantidad: 1, ...f } });
const LINEAS: Record<string, ReturnType<typeof linea>> = {
  recLA: linea("recLA", { Tipo: "Repuesto", "Descripción": "Tapa de pantalla", "Precio unitario": 125, Estado: "Cargada", "Operación Comercial": ["recOPA"], "Bajo pedido": true }),
  recLB: linea("recLB", { Tipo: "Repuesto", "Descripción": "Batería", "Precio unitario": 70, Estado: "Aprobada", "Operación Comercial": ["recOPB"], "Bajo pedido": true }),
  recLC: linea("recLC", { Tipo: "Repuesto", "Descripción": "Teclado", "Precio unitario": 90, Estado: "Aprobada", "Operación Comercial": ["recOPC"], "Bajo pedido": true }),
  recLSSD: linea("recLSSD", { Tipo: "Repuesto", "Descripción": "SSD", "Precio unitario": 40, Estado: "Aprobada", "Artículo de inventario": ["recOTRO"] }),
  recLSRV: linea("recLSRV", { Tipo: "Servicio", "Descripción": "Limpieza", "Precio unitario": 25, Estado: "Cargada", "Cargo: Servicio por Orden": ["recSPO"] }),
};

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}
function porIdsEnUrl<T>(d: string, tabla: Record<string, T>): T[] {
  return Object.keys(tabla).filter((id) => d.includes(`'${id}'`)).map((id) => tabla[id]);
}

function fakeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const d = decodeURIComponent(url);
  if (d.includes("/Órdenes de Reparación/recORD900")) return Promise.resolve(json(ORDEN));
  if (d.includes("/Operación Comercial")) return Promise.resolve(json({ records: porIdsEnUrl(d, OPERACIONES) }));
  if (d.includes("/Shipping Items")) return Promise.resolve(json({ records: porIdsEnUrl(d, ITEMS) }));
  if (d.includes("/Presupuesto por Orden")) return Promise.resolve(json({ records: porIdsEnUrl(d, LINEAS) }));
  if (d.includes("/Servicios por Orden")) {
    return Promise.resolve(json({ records: [{ id: "recSPO", fields: { "Orden de Reparación": ["recORD900"], "Nombre del servicio snapshot o copiado": "Limpieza", "Costo real": 25 } }] }));
  }
  if (d.includes("/Abonos") || d.includes("/Repuestos por Orden") || d.includes("/Productos Digitales")) {
    return Promise.resolve(json({ records: [] }));
  }
  throw new Error(`fetch inesperado en el test hacia: ${url}`);
}

async function main(): Promise<void> {
  process.env.AIRTABLE_API_KEY = "fake-token-para-test";
  process.env.AIRTABLE_BASE_ID = "appFAKE0000000000";
  global.fetch = fakeFetch as unknown as typeof global.fetch;
  try {
    const c = await getCuentaUnificada({ ordenId: "recORD900" });
    const ids = c.aprobadoSinArticulo.map((p) => p.id).sort().join(",");
    assert(ids === "recLB,recLSSD", `suman la batería (falta pedirla) y el SSD (sin stock) — vino ${ids}`);
    assert(!c.aprobadoSinArticulo.some((p) => p.id === "recLC"), "el teclado NO se cuenta por la línea: su operación ya tiene artículo (se cuenta una sola vez)");
    assert(c.totalAprobadoSinArticulo === 110, `aprobado sin artículo = 70 + 40 = 110 — vino ${c.totalAprobadoSinArticulo}`);
    assert(c.totalRepuestos === 215, `artículos = 125 + 90 = 215 — vino ${c.totalRepuestos}`);
    assert(c.totalCuenta === 350, `total = 215 + 25 + 110 = 350 — vino ${c.totalCuenta}`);
    assert(c.saldo === 350, "sin abonos, el saldo es el total");
  } finally {
    global.fetch = fetchOriginal;
  }
  if (fallos > 0) { console.error(`\n${fallos} assert(s) fallaron.`); process.exit(1); }
  console.log("\n✅ aprobadoSinArticuloSuma.test.ts — todos los asserts pasaron");
}

void main();
