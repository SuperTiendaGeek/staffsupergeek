/**
 * Test — buscarProductosDigitales() (lib/facturacion/airtable/productosDigitales.ts)
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/productoDigital.buscador.test.ts
 *
 * global.fetch reemplazado por un doble que dispatchea por tabla — nunca
 * toca Airtable real. Cubre:
 *   (a) un producto digital CON orden de reparación vinculada NO aparece en
 *       el buscador — la prueba importante de este trabajo. Verificado al
 *       revés: se quita el filtro (c) del código a mano, se corre la
 *       prueba, se confirma que falla, y se restaura.
 *   (b) sin precio (defensivo — la fórmula ya debería filtrarlo) o sin
 *       nombre limpio de catálogo, tampoco aparece.
 *
 * El fixture trae 4 candidatos que YA pasaron el filtro por fórmula
 * (Estado="Disponible", Precio Venta>0 simulado) para poder probar los
 * filtros que van EN MEMORIA (c y d) uno por uno:
 *   prod1 — sin orden, con nombre limpio     → SÍ debe aparecer
 *   prod2 — CON orden vinculada              → NO debe aparecer (c)
 *   prod3 — Precio Venta 0 (caso defensivo)  → NO debe aparecer (b)
 *   prod4 — catálogo sin "Producto Base"     → NO debe aparecer (d)
 *
 * Lanza en la primera falla y sale con código distinto de 0.
 */

import { buscarProductosDigitales } from "../airtable/productosDigitales";

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

const PRODUCTOS_DIGITALES = [
  { id: "recPROD1", fields: { "Software / Producto": ["recCAT1"], "Precio Venta": 25, "Orden de Reparación": [] } },
  { id: "recPROD2", fields: { "Software / Producto": ["recCAT2"], "Precio Venta": 30, "Orden de Reparación": ["recORDX"] } },
  { id: "recPROD3", fields: { "Software / Producto": ["recCAT3"], "Precio Venta": 0, "Orden de Reparación": [] } },
  { id: "recPROD4", fields: { "Software / Producto": ["recCAT4"], "Precio Venta": 15, "Orden de Reparación": [] } },
];

const CATALOGO = [
  { id: "recCAT1", fields: { "Producto Base": "Producto Uno" } },
  { id: "recCAT2", fields: { "Producto Base": "Producto Dos" } },
  { id: "recCAT3", fields: { "Producto Base": "Producto Tres" } },
  // recCAT4 NO existe en el catálogo — simula un producto sin catálogo
  // vinculado de verdad, o un catálogo sin "Producto Base".
];

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function fakeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const d = decodeURIComponent(url);

  // La tabla "Productos Digitales" ya viene "filtrada" en el fixture — el
  // doble no reproduce filterByFormula, simula lo que Airtable devolvería.
  if (d.includes("/Productos Digitales")) return Promise.resolve(json({ records: PRODUCTOS_DIGITALES }));
  if (d.includes("/Catálogo Productos Digitales")) {
    const ids = CATALOGO.filter((c) => d.includes(c.id));
    return Promise.resolve(json({ records: ids }));
  }

  throw new Error(`fetch inesperado en el test hacia: ${url}`);
}

async function main(): Promise<void> {
  process.env.AIRTABLE_API_KEY = "fake-token-para-test";
  process.env.AIRTABLE_BASE_ID = "appFAKE0000000002";
  global.fetch = fakeFetch as unknown as typeof global.fetch;

  try {
    const resultados = await buscarProductosDigitales("Producto");

    assert(resultados.length === 1, `Solo debe aparecer 1 producto de los 4 candidatos (vino ${resultados.length})`);
    assert(resultados[0]?.id === "recPROD1", "El único que aparece es recPROD1 (sin orden, con nombre limpio, con precio)");
    assert(resultados[0]?.nombre === "Producto Uno", "El nombre viene del catálogo limpio");
    assert(resultados[0]?.fuente === "productoDigital", "fuente debe ser 'productoDigital'");
    assert(resultados[0]?.cantidadDisponible === 1, "cantidadDisponible siempre 1 para un producto digital");
    assert(
      !resultados.some((r) => r.id === "recPROD2"),
      "(a) recPROD2 (CON orden vinculada) NO debe aparecer — es la prueba importante de este trabajo"
    );
    assert(!resultados.some((r) => r.id === "recPROD3"), "(b) recPROD3 (Precio Venta 0) no debe aparecer");
    assert(!resultados.some((r) => r.id === "recPROD4"), "(b) recPROD4 (sin nombre limpio de catálogo) no debe aparecer");
  } finally {
    global.fetch = fetchOriginal;
    delete process.env.AIRTABLE_API_KEY;
    delete process.env.AIRTABLE_BASE_ID;
  }

  if (fallos > 0) {
    console.error(`\n❌ productoDigital.buscador.test.ts — ${fallos} aserción(es) fallida(s)`);
    process.exit(1);
  }
  console.log("\n✅ productoDigital.buscador.test.ts — todos los asserts pasaron");
}

main();
