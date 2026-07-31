import fs from "node:fs";
import path from "node:path";
import {
  calcularLineasProformaShippingItemsInvalidas,
  mensajeLineasProformaShippingItemsInvalidas,
  validarLineasProformaShippingItems,
} from "../proformas/preciosShippingItems";
import type { LineaProforma } from "../proformas/types";

let fallos = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

function linea(overrides: Partial<LineaProforma> = {}): LineaProforma {
  return {
    descripcion: "Laptop proforma",
    cantidad: 1,
    precioUnitario: 100,
    descuento: 0,
    tarifaIva: "4",
    ...overrides,
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const manualValida = calcularLineasProformaShippingItemsInvalidas(
  [linea({ origen: "manual", precioUnitario: 0 })],
  []
);
assert(manualValida.length === 0, "Proforma conserva una línea manual válida sin shippingItemId");

const shippingSinPrecio = calcularLineasProformaShippingItemsInvalidas(
  [linea({ origen: "shipping-item", shippingItemId: "recSINFINAL" })],
  [{ id: "recSINFINAL", fields: { "Precio venta sugerido": 150 } }]
);
assert(
  mensajeLineasProformaShippingItemsInvalidas(shippingSinPrecio)?.includes("Precio venta final") === true,
  "Proforma rechaza Shipping Item sin Precio venta final válido"
);

const shippingPrecioFinalCero = calcularLineasProformaShippingItemsInvalidas(
  [linea({ origen: "shipping-item", shippingItemId: "recFINALCERO" })],
  [{ id: "recFINALCERO", fields: { "Precio venta final": 0 } }]
);
assert(
  mensajeLineasProformaShippingItemsInvalidas(shippingPrecioFinalCero)?.includes("Precio venta final") === true,
  "Proforma rechaza Shipping Item con Precio venta final 0"
);

const shippingConPrecio = calcularLineasProformaShippingItemsInvalidas(
  [linea({ origen: "shipping-item", shippingItemId: "recFINAL", precioUnitario: 90 })],
  [{ id: "recFINAL", fields: { "Precio venta final": 120, "Precio venta sugerido": 150 } }]
);
assert(shippingConPrecio.length === 0, "Proforma acepta Shipping Item con precio final válido aunque el precio de línea sea diferente");

const shippingPrecioLineaCero = calcularLineasProformaShippingItemsInvalidas(
  [linea({ origen: "shipping-item", shippingItemId: "recFINAL", precioUnitario: 0 })],
  [{ id: "recFINAL", fields: { "Precio venta final": 120 } }]
);
assert(
  mensajeLineasProformaShippingItemsInvalidas(shippingPrecioLineaCero)?.includes("precio unitario mayor a 0") === true,
  "Proforma aplica el mismo criterio de precio de línea que Facturación y Recibos"
);

const shippingSinId = calcularLineasProformaShippingItemsInvalidas(
  [linea({ origen: "shipping-item", shippingItemId: "" })],
  []
);
assert(
  mensajeLineasProformaShippingItemsInvalidas(shippingSinId)?.includes("no conserva shippingItemId") === true,
  "Una línea marcada como Shipping Item debe conservar shippingItemId"
);

const rutaProformas = fs.readFileSync(path.join(process.cwd(), "app/api/facturacion/proformas/route.ts"), "utf8");
const posicionValidacion = rutaProformas.indexOf("const errorShippingItems = await validarLineasProformaShippingItems");
assert(
  posicionValidacion >= 0 && posicionValidacion < rutaProformas.indexOf("crearProforma(body)"),
  "La ruta server-side de Proformas valida Shipping Items antes de crear la proforma"
);

const fetchOriginal = global.fetch;
process.env.AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || "test-key";
process.env.AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || "appTEST";

async function main() {
  try {
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      assert(!init?.method || init.method === "GET", "La validación de Proformas solo lee Airtable");
      const url = String(input);
      if (!url.includes("Shipping%20Items")) return json({ records: [] }, 404);
      return json({
        records: [
          { id: "recFINAL", fields: { "Precio venta final": 120 } },
        ],
      });
    }) as typeof fetch;

    const mensajeValido = await validarLineasProformaShippingItems([
      linea({ origen: "shipping-item", shippingItemId: "recFINAL", precioUnitario: 90 }),
      linea({ origen: "manual", descripcion: "Servicio manual", precioUnitario: 0 }),
    ]);
    assert(mensajeValido === null, "Validación server-side acepta item vigente y línea manual en el mismo payload");

    const mensajeNoExiste = await validarLineasProformaShippingItems([
      linea({ origen: "shipping-item", shippingItemId: "recNOEXISTE" }),
    ]);
    assert(mensajeNoExiste?.includes("no existe en Shipping Items") === true, "Proforma rechaza Shipping Item inexistente tras reconsultar Airtable");
  } finally {
    global.fetch = fetchOriginal;
  }

  if (fallos > 0) {
    console.error(`Fallaron ${fallos} comprobaciones.`);
    process.exit(1);
  }

  console.log("Precio de Shipping Items en Proformas: OK");
}

void main();
