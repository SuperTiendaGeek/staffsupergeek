/**
 * Test — postEmision() para productos digitales (rama nueva, lib/facturacion/gancho/postEmision.ts)
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/productoDigital.postEmision.test.ts
 *
 * global.fetch reemplazado por un doble que dispatchea por tabla/método —
 * nunca toca Airtable real. Cubre exactamente los casos pedidos:
 *   (c) postEmision marca Usado y enlaza la factura
 *   (d) postEmision es idempotente: correrlo dos veces no cambia nada la
 *       segunda (cero PATCH adicionales)
 *   (e) con ambiente != "2" no escribe nada
 *   (e-mostrador, PR de productos digitales en mostrador) "Tipo de Uso" se
 *       escribe "Venta directa" SOLO cuando el producto no tiene orden
 *       vinculada; con orden, no se toca ese campo.
 *   + confirma que "Orden de Reparación" nunca se toca, que la escritura va
 *     SIN typecast, y que Shipping Items y Productos Digitales conviven en
 *     una misma factura sin interferirse (corren en paralelo, cada uno con
 *     su propia tabla).
 *
 * Lanza en la primera falla y sale con código distinto de 0.
 */

import { postEmision } from "../gancho/postEmision";
import type { DetalleFactura } from "../types/factura";

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
const FACTURA_ID = "recFACT0099";

type ProductoDigitalSimulado = { id: string; estado: string; facturaIds: string[]; ordenId?: string };

function crearDoble(productos: Map<string, ProductoDigitalSimulado>) {
  const patchesRecibidos: Array<{ id: string; fields: Record<string, unknown>; typecast?: boolean }> = [];
  const shippingPatches: Array<{ id: string; fields: Record<string, unknown> }> = [];

  const fetchDoble = async (url: string | URL, init?: RequestInit) => {
    const urlStr = String(url);
    const method = init?.method ?? "GET";

    // GET Productos Digitales (fetchRecordsByIds — lectura de estado actual)
    if (method === "GET" && urlStr.includes("Productos%20Digitales")) {
      const records = [...productos.values()].map((p) => ({
        id: p.id,
        fields: {
          "Estado": p.estado,
          "Factura": p.facturaIds,
          "Orden de Reparación": p.ordenId ? [p.ordenId] : [],
        },
      }));
      return { ok: true, json: async () => ({ records }) } as Response;
    }

    // PATCH Productos Digitales/{id}
    if (method === "PATCH" && urlStr.includes("Productos%20Digitales/")) {
      const id = urlStr.split("Productos%20Digitales/")[1];
      const body = JSON.parse(String(init?.body ?? "{}")) as { fields: Record<string, unknown>; typecast?: boolean };
      patchesRecibidos.push({ id, fields: body.fields, typecast: body.typecast });
      const actual = productos.get(id)!;
      productos.set(id, {
        ...actual,
        estado:     (body.fields["Estado"] as string) ?? actual.estado,
        facturaIds: (body.fields["Factura"] as string[]) ?? actual.facturaIds,
      });
      return { ok: true, json: async () => ({ id, fields: body.fields }) } as Response;
    }

    // Shipping Items — para el caso de convivencia (una factura con ambos tipos de línea).
    // Stock suficiente a propósito: lo que se prueba aquí es que las dos ramas
    // conviven sin interferirse, no la lógica de stock (ya cubierta en
    // gancho.postEmision.test.ts).
    if (method === "GET" && urlStr.includes("Shipping%20Items")) {
      return { ok: true, json: async () => ({ records: [{ id: "recITEMX", fields: { "Estado Item": "Disponible", "Factura": [], "Cantidad": 5 } }] }) } as Response;
    }
    if (method === "PATCH" && urlStr.includes("Shipping%20Items/")) {
      const id = urlStr.split("Shipping%20Items/")[1];
      shippingPatches.push({ id, fields: JSON.parse(String(init?.body ?? "{}")).fields });
      return { ok: true, json: async () => ({ id }) } as Response;
    }

    // PATCH Facturas Electrónicas/{id} (actualizarSincronizacionInventario — solo lo dispara la rama de Shipping Items)
    if (method === "PATCH" && urlStr.includes(encodeURIComponent("Facturas Electrónicas"))) {
      return { ok: true, json: async () => ({ id: FACTURA_ID }) } as Response;
    }

    throw new Error(`fetch inesperado en el test hacia: ${method} ${urlStr}`);
  };

  return { fetchDoble, patchesRecibidos, shippingPatches };
}

function lineaProductoDigital(productoDigitalId: string, descripcion = "Windows 11 Pro"): DetalleFactura {
  return {
    descripcion,
    cantidad: 1,
    precioUnitario: 17.39,
    descuento: 0,
    precioTotalSinImpuesto: 17.39,
    impuestos: [{ codigo: "2", codigoPorcentaje: "4", tarifa: 15, baseImponible: 17.39, valor: 2.61 }],
    tipo: "productoDigital",
    productoDigitalId,
  };
}

const FECHA_ISO_DIA = /^\d{4}-\d{2}-\d{2}$/;

(async () => {
  process.env.AIRTABLE_API_KEY = "fake-token-para-test";
  process.env.AIRTABLE_BASE_ID = "appFAKEBASE0002";

  // ─── (c) postEmision marca Usado y enlaza la factura ──────────────────────
  {
    const productos = new Map<string, ProductoDigitalSimulado>([
      ["recPD1", { id: "recPD1", estado: "Disponible", facturaIds: [] }],
    ]);
    const { fetchDoble, patchesRecibidos } = crearDoble(productos);
    global.fetch = fetchDoble as unknown as typeof fetch;

    const resultado = await postEmision({
      facturaRecordId: FACTURA_ID,
      detalles: [lineaProductoDigital("recPD1")],
      ambiente: "2",
    });

    assert(resultado.estado === "OK", "(c) estado final OK");
    assert(patchesRecibidos.length === 1, "(c) un solo PATCH sobre Productos Digitales");
    assert(productos.get("recPD1")!.estado === "Usado", "(c) el producto queda Estado='Usado'");
    assert(productos.get("recPD1")!.facturaIds.includes(FACTURA_ID), "(c) el producto queda enlazado a la factura");
    const fields = patchesRecibidos[0].fields;
    assert(typeof fields["Fecha de Uso / Venta"] === "string" && FECHA_ISO_DIA.test(fields["Fecha de Uso / Venta"] as string), "(c) Fecha de Uso / Venta con formato YYYY-MM-DD");
    assert(!("Orden de Reparación" in fields), "(c) 'Orden de Reparación' NUNCA se toca — ya viene puesto desde la vinculación");
    assert(patchesRecibidos[0].typecast === undefined, "(c) el PATCH va SIN typecast — si 'Usado' no existiera como opción, debe fallar y verse");
  }

  // ─── (d) idempotente: correrlo dos veces no cambia nada la segunda ─────────
  {
    const productos = new Map<string, ProductoDigitalSimulado>([
      ["recPD2", { id: "recPD2", estado: "Disponible", facturaIds: [] }],
    ]);
    const { fetchDoble, patchesRecibidos } = crearDoble(productos);
    global.fetch = fetchDoble as unknown as typeof fetch;

    const primero = await postEmision({
      facturaRecordId: FACTURA_ID,
      detalles: [lineaProductoDigital("recPD2")],
      ambiente: "2",
    });
    assert(primero.estado === "OK", "(d) primera corrida: OK");
    assert(patchesRecibidos.length === 1, "(d) primera corrida: 1 PATCH");

    const segundo = await postEmision({
      facturaRecordId: FACTURA_ID,
      detalles: [lineaProductoDigital("recPD2")],
      ambiente: "2",
    });
    assert(segundo.estado === "OK", "(d) segunda corrida: sigue OK");
    assert(patchesRecibidos.length === 1, "(d) segunda corrida: CERO PATCH adicionales (el link a la factura ya estaba)");
  }

  // ─── (e) con ambiente != "2" no escribe nada ────────────────────────────────
  {
    const productos = new Map<string, ProductoDigitalSimulado>([
      ["recPD3", { id: "recPD3", estado: "Disponible", facturaIds: [] }],
    ]);
    const { fetchDoble, patchesRecibidos } = crearDoble(productos);
    global.fetch = fetchDoble as unknown as typeof fetch;

    const resultado = await postEmision({
      facturaRecordId: FACTURA_ID,
      detalles: [lineaProductoDigital("recPD3")],
      ambiente: "1", // PRUEBAS
    });

    assert(resultado.estado === "OK", "(e) ambiente pruebas: responde OK");
    assert(patchesRecibidos.length === 0, "(e) ambiente pruebas: CERO llamadas a Productos Digitales");
    assert(productos.get("recPD3")!.estado === "Disponible", "(e) el producto real queda intacto");
  }
  {
    // Fail-closed también sin ambiente definido — mismo criterio que Shipping Items.
    const productos = new Map<string, ProductoDigitalSimulado>([
      ["recPD4", { id: "recPD4", estado: "Disponible", facturaIds: [] }],
    ]);
    const { fetchDoble, patchesRecibidos } = crearDoble(productos);
    global.fetch = fetchDoble as unknown as typeof fetch;

    const resultado = await postEmision({
      facturaRecordId: FACTURA_ID,
      detalles: [lineaProductoDigital("recPD4")],
      // sin `ambiente`
    });

    assert(resultado.estado === "OK", "(e bis) ambiente indefinido: responde OK");
    assert(patchesRecibidos.length === 0, "(e bis) ambiente indefinido: fail-closed — cero llamadas");
  }

  // ─── "Tipo de Uso" = "Venta directa" SOLO sin orden vinculada ─────────────
  {
    const productos = new Map<string, ProductoDigitalSimulado>([
      ["recPD6", { id: "recPD6", estado: "Disponible", facturaIds: [] }], // sin ordenId — venta de mostrador
    ]);
    const { fetchDoble, patchesRecibidos } = crearDoble(productos);
    global.fetch = fetchDoble as unknown as typeof fetch;

    await postEmision({
      facturaRecordId: FACTURA_ID,
      detalles: [lineaProductoDigital("recPD6")],
      ambiente: "2",
    });

    assert(patchesRecibidos[0]?.fields["Tipo de Uso"] === "Venta directa", "Sin orden vinculada: 'Tipo de Uso' = 'Venta directa'");
  }
  {
    const productos = new Map<string, ProductoDigitalSimulado>([
      ["recPD7", { id: "recPD7", estado: "Disponible", facturaIds: [], ordenId: "recORD999" }],
    ]);
    const { fetchDoble, patchesRecibidos } = crearDoble(productos);
    global.fetch = fetchDoble as unknown as typeof fetch;

    await postEmision({
      facturaRecordId: FACTURA_ID,
      detalles: [lineaProductoDigital("recPD7")],
      ambiente: "2",
    });

    assert(!("Tipo de Uso" in (patchesRecibidos[0]?.fields ?? {})), "CON orden vinculada: 'Tipo de Uso' no se toca (ya dice 'Orden de reparación')");
  }

  // ─── Convivencia: una factura con línea de Shipping Item Y de producto digital ──
  {
    const productos = new Map<string, ProductoDigitalSimulado>([
      ["recPD5", { id: "recPD5", estado: "Disponible", facturaIds: [] }],
    ]);
    const { fetchDoble, patchesRecibidos, shippingPatches } = crearDoble(productos);
    global.fetch = fetchDoble as unknown as typeof fetch;

    const lineaItem: DetalleFactura = {
      descripcion: "Repuesto", cantidad: 1, precioUnitario: 10, descuento: 0, precioTotalSinImpuesto: 10,
      impuestos: [{ codigo: "2", codigoPorcentaje: "4", tarifa: 15, baseImponible: 10, valor: 1.5 }],
      tipo: "producto", shippingItemId: "recITEMX",
    };

    const resultado = await postEmision({
      facturaRecordId: FACTURA_ID,
      detalles: [lineaItem, lineaProductoDigital("recPD5")],
      ambiente: "2",
    });

    assert(resultado.estado === "OK", "Convivencia: estado OK con ambos tipos de línea");
    assert(patchesRecibidos.length === 1, "Convivencia: 1 PATCH a Productos Digitales");
    assert(shippingPatches.length === 1, "Convivencia: 1 PATCH a Shipping Items — ninguno interfiere con el otro");
    assert(productos.get("recPD5")!.estado === "Usado", "Convivencia: el producto digital sí queda Usado");
  }

  global.fetch = fetchOriginal;
  delete process.env.AIRTABLE_API_KEY;
  delete process.env.AIRTABLE_BASE_ID;

  if (fallos > 0) {
    console.error(`\n❌ productoDigital.postEmision.test.ts — ${fallos} aserción(es) fallida(s)`);
    process.exit(1);
  }
  console.log("\n✅ productoDigital.postEmision.test.ts — todos los asserts pasaron");
})();
