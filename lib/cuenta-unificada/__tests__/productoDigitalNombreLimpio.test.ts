/**
 * Test de integración — getCuentaUnificada() resuelve el nombre de un
 * producto digital desde su CATÁLOGO, nunca desde la fórmula sucia.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/cuenta-unificada/__tests__/productoDigitalNombreLimpio.test.ts
 *
 * Hallazgo real en OR000418: la descripción de la línea de factura salía
 * como "McAfee AntiVirus 1 Year · Usado · 11/08/2026" — viene de
 * ProductoDigital.softwareProducto, que en Airtable es el campo fórmula
 * "Producto Digital" (Catálogo · Estado · Fecha de compra). Ese texto viaja
 * al XML del SRI y al RIDE del cliente: un documento tributario no puede
 * decir que el producto está "Usado" ni cuándo lo compró SUPER GEEK.
 *
 * El fixture de abajo trae AMBAS cosas a propósito — el campo "Producto
 * Digital" con el texto sucio completo, Y el catálogo vinculado con el
 * nombre comercial limpio — para que la prueba falle de verdad si alguien
 * vuelve a leer el campo sucio en vez del catálogo.
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
  id: "recORDPD1",
  fields: {
    ID: "OR-PD-1",
    "Operaciones Comerciales": [],
    "Repuestos de Stock (V2)": [],
    "Abonos (Operación)": [],
    "Costo Total Servicios NV": 0,
    "Total Productos Digitales": 20,
    "Total Abonado NV": 0,
  },
};

// El fixture crítico: "Producto Digital" trae el texto SUCIO completo
// (Catálogo · Estado · Fecha de compra), tal como lo devuelve la fórmula
// real de Airtable — exactamente lo que NO debe llegar a la línea de
// factura.
const PRODUCTO_DIGITAL = {
  id: "recPDX",
  fields: {
    "Producto Digital": "McAfee AntiVirus 1 Year · Usado · 11/08/2026",
    "Software / Producto": ["recCATX"],
    "Estado": "Disponible",
    "Precio Venta": 20,
    "Precio Venta Catálogo": 20,
    "Orden de Reparación": ["recORDPD1"],
  },
};

const CATALOGO = {
  id: "recCATX",
  fields: {
    "Producto Base": "McAfee AntiVirus 1 Year",
  },
};

function fakeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const d = decodeURIComponent(url);

  if (d.includes("/Órdenes de Reparación/recORDPD1")) return Promise.resolve(json(ORDEN));
  if (d.includes("/Catálogo Productos Digitales")) return Promise.resolve(json({ records: [CATALOGO] }));
  // fetchProductosDigitalesPorOrden trae TODA la tabla y filtra en memoria
  // por "Orden de Reparación" (nunca por filterByFormula sobre un link).
  if (d.includes("/Productos Digitales")) return Promise.resolve(json({ records: [PRODUCTO_DIGITAL] }));
  if (d.includes("/Servicios por Orden") || d.includes("/Repuestos por Orden") || d.includes("/Shipping Items")) {
    return Promise.resolve(json({ records: [] }));
  }
  if (d.includes("/Abonos")) return Promise.resolve(json({ records: [] }));

  throw new Error(`fetch inesperado en el test hacia: ${url}`);
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

// (b) — mismo patrón que las otras pruebas del módulo: cualquier " · ",
// "Usado"/"Disponible" o fecha DD/MM/AAAA en la descripción de una línea de
// producto digital es la fórmula sucia colándose otra vez.
const PATRON_SUCIO = /\s·\s|Usado|Disponible|\d{2}\/\d{2}\/\d{4}/;

async function main(): Promise<void> {
  process.env.AIRTABLE_API_KEY = "fake-token-para-test";
  process.env.AIRTABLE_BASE_ID = "appFAKE0000000001";
  global.fetch = fakeFetch as unknown as typeof global.fetch;

  try {
    const cuenta = await getCuentaUnificada({ ordenId: "recORDPD1" });

    assert(cuenta.productosDigitales.length === 1, "La orden trae 1 producto digital");
    const [pd] = cuenta.productosDigitales;

    assert(
      pd.nombre === "McAfee AntiVirus 1 Year",
      `El nombre viene del catálogo ("McAfee AntiVirus 1 Year"), no de la fórmula sucia (vino "${pd.nombre}")`
    );
    assert(
      !PATRON_SUCIO.test(pd.nombre),
      `El nombre no debe contener " · ", "Usado"/"Disponible" ni una fecha — vino "${pd.nombre}"`
    );
    assert(pd.precioVenta === 20, "El precio se sigue leyendo normal (esto no cambió)");
  } finally {
    global.fetch = fetchOriginal;
    delete process.env.AIRTABLE_API_KEY;
    delete process.env.AIRTABLE_BASE_ID;
  }

  if (fallos > 0) {
    console.error(`\n❌ productoDigitalNombreLimpio.test.ts — ${fallos} aserción(es) fallida(s)`);
    process.exit(1);
  }
  console.log("\n✅ productoDigitalNombreLimpio.test.ts — todos los asserts pasaron");
}

main();
