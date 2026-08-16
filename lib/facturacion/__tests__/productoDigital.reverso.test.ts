/**
 * Test — reverso de productos digitales: nota de crédito vs. anulación de
 * factura (lib/facturacion/notaCredito/revertirInventario.ts,
 * lib/facturacion/anulaciones/reverso.ts).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/productoDigital.reverso.test.ts
 *
 * global.fetch reemplazado por dobles que dispatchean por tabla/método —
 * nunca tocan Airtable real. Cubre exactamente los casos pedidos:
 *   (a) una NC sobre una factura con producto digital lo deja en "Anulado"
 *   (b) una anulación de ESA MISMA factura lo deja en "Disponible"
 *       — (a)+(b) juntas son el corazón de este trabajo: la MISMA factura,
 *       el MISMO producto, dos resultados distintos según cómo se deshaga.
 *   (c) las dos son idempotentes
 *   (d) las dos respetan el guardián de ambiente
 *   (e) en ninguna se toca ningún Shipping Item — con dobles que LANZAN si
 *       algo intenta escribir en esa tabla (mismo patrón que
 *       productoDigital.filtrosShippingItems.test.ts)
 *
 * Lanza en la primera falla y sale con código distinto de 0.
 */

import { revertirInventarioNotaCredito } from "../notaCredito/revertirInventario";
import { revertirInventarioFacturaAnulada } from "../anulaciones/reverso";
import type { DetalleNotaCredito } from "../notaCredito/types";
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

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function lineaNC(productoDigitalId: string, devolucionFisica = true): DetalleNotaCredito {
  return {
    descripcion: "Windows 11 Pro", cantidad: 1, precioUnitario: 17.39, descuento: 0, precioTotalSinImpuesto: 17.39,
    impuestos: [{ codigo: "2", codigoPorcentaje: "4", tarifa: 15, baseImponible: 17.39, valor: 2.61 }],
    tipo: "productoDigital", productoDigitalId, devolucionFisica,
  };
}

function lineaFactura(productoDigitalId: string): DetalleFactura {
  return {
    descripcion: "Windows 11 Pro", cantidad: 1, precioUnitario: 17.39, descuento: 0, precioTotalSinImpuesto: 17.39,
    impuestos: [{ codigo: "2", codigoPorcentaje: "4", tarifa: 15, baseImponible: 17.39, valor: 2.61 }],
    tipo: "productoDigital", productoDigitalId,
  };
}

// Doble que LANZA ante cualquier intento de tocar Shipping Items — la
// garantía real de (e), no una lectura del código.
function fetchLanzaSiTocaShippingItems(handler: (url: string, method: string, init?: RequestInit) => Promise<Response | null>) {
  return (async (url: string | URL, init?: RequestInit) => {
    const urlStr = String(url);
    if (urlStr.includes("Shipping%20Items")) {
      throw new Error(`fetch inesperado hacia Shipping Items: ${urlStr}`);
    }
    const method = init?.method ?? "GET";
    const res = await handler(urlStr, method, init);
    if (res) return res;
    throw new Error(`fetch inesperado en el test hacia: ${method} ${urlStr}`);
  }) as unknown as typeof fetch;
}

async function main(): Promise<void> {
  process.env.AIRTABLE_API_KEY = "fake-token-para-test";
  process.env.AIRTABLE_BASE_ID = "appFAKE0000000004";

  const NC_ID = "recNC0099";
  const FACTURA_ID = "recFACT0099";
  const PRODUCTO_ID = "recPD1";

  try {
    // ═══ (a) — Nota de crédito deja el producto en "Anulado" ═════════════════
    {
      const patches: Array<{ fields: Record<string, unknown> }> = [];
      global.fetch = fetchLanzaSiTocaShippingItems(async (url, method, init) => {
        if (method === "GET" && url.includes("Productos%20Digitales")) {
          return json({ records: [{ id: PRODUCTO_ID, fields: { "Nota de Crédito": [] } }] });
        }
        if (method === "PATCH" && url.includes("Productos%20Digitales/")) {
          const body = JSON.parse(String(init?.body ?? "{}")) as { fields: Record<string, unknown> };
          patches.push(body);
          return json({ id: PRODUCTO_ID });
        }
        if (method === "PATCH" && url.includes(encodeURIComponent("Notas de Crédito Electrónicas"))) {
          return json({ id: NC_ID }); // actualizarReversoInventario — solo lo dispara Shipping Items, no debería llegar aquí sin items
        }
        return null;
      });

      const resultado = await revertirInventarioNotaCredito({
        notaCreditoRecordId: NC_ID,
        detalles: [lineaNC(PRODUCTO_ID)],
        ambiente: "2",
      });

      assert(resultado.estado === "OK", "(a) NC: estado final OK");
      assert(patches.length === 1, "(a) NC: un solo PATCH sobre Productos Digitales");
      assert(patches[0].fields["Estado"] === "Anulado", "(a) NC: Estado queda 'Anulado' — LA REGLA CENTRAL de este trabajo para la ruta de NC");
      assert(Array.isArray(patches[0].fields["Nota de Crédito"]) && (patches[0].fields["Nota de Crédito"] as string[]).includes(NC_ID), "(a) NC: queda enlazado a la nota de crédito");
      assert(!("Factura" in patches[0].fields), "(a) NC: 'Factura' NUNCA se toca — es la historia de la venta");
      assert(!("typecast" in (patches[0] as unknown as Record<string, unknown>)), "(a) NC: el PATCH va sin typecast");
    }

    // ═══ (b) — Anulación de la MISMA factura deja el MISMO producto en "Disponible" ═══
    // Corazón del trabajo: mismo producto, misma factura, resultado distinto
    // porque la ruta para deshacer la venta es distinta.
    {
      const patches: Array<{ fields: Record<string, unknown> }> = [];
      global.fetch = fetchLanzaSiTocaShippingItems(async (url, method, init) => {
        if (method === "GET" && url.includes("Productos%20Digitales")) {
          return json({ records: [{ id: PRODUCTO_ID, fields: { "Factura": [FACTURA_ID] } }] });
        }
        if (method === "PATCH" && url.includes("Productos%20Digitales/")) {
          const body = JSON.parse(String(init?.body ?? "{}")) as { fields: Record<string, unknown> };
          patches.push(body);
          return json({ id: PRODUCTO_ID });
        }
        return null;
      });

      const resultado = await revertirInventarioFacturaAnulada({
        facturaRecordId: FACTURA_ID,
        detalles: [lineaFactura(PRODUCTO_ID)],
        ambiente: "2",
      });

      assert(resultado.estado === "OK", "(b) Anulación: estado final OK");
      assert(patches.length === 1, "(b) Anulación: un solo PATCH sobre Productos Digitales");
      assert(patches[0].fields["Estado"] === "Disponible", "(b) Anulación: Estado queda 'Disponible' — DISTINTO del resultado de la NC en (a), mismo producto");
      assert(patches[0].fields["Fecha de Uso / Venta"] === null, "(b) Anulación: 'Fecha de Uso / Venta' se limpia");
      assert(patches[0].fields["Tipo de Uso"] === null, "(b) Anulación: 'Tipo de Uso' se limpia");
      assert(
        Array.isArray(patches[0].fields["Factura"]) && !(patches[0].fields["Factura"] as string[]).includes(FACTURA_ID),
        "(b) Anulación: el id de ESTA factura se quita de 'Factura' (no se vacía el array entero, solo se filtra)"
      );
      assert(!("typecast" in (patches[0] as unknown as Record<string, unknown>)), "(b) Anulación: el PATCH va sin typecast");
    }

    // ═══ (c) — Las dos son idempotentes ═══════════════════════════════════════
    {
      // NC: el link a la NC ya está puesto → no debe volver a escribir.
      // (La rama de Shipping Items, sin líneas de producto real, igual dispara
      // actualizarReversoInventario("OK") sobre la propia NC — se responde
      // también a esa PATCH para no ensuciar la salida con un catch interno.)
      const patchesNC: unknown[] = [];
      global.fetch = fetchLanzaSiTocaShippingItems(async (url, method) => {
        if (method === "GET" && url.includes("Productos%20Digitales")) {
          return json({ records: [{ id: PRODUCTO_ID, fields: { "Nota de Crédito": [NC_ID] } }] });
        }
        if (method === "PATCH" && url.includes("Productos%20Digitales/")) {
          patchesNC.push(null);
          return json({ id: PRODUCTO_ID });
        }
        if (method === "PATCH" && url.includes(encodeURIComponent("Notas de Crédito Electrónicas"))) {
          return json({ id: NC_ID });
        }
        return null;
      });
      const rNC = await revertirInventarioNotaCredito({ notaCreditoRecordId: NC_ID, detalles: [lineaNC(PRODUCTO_ID)], ambiente: "2" });
      assert(rNC.estado === "OK", "(c) NC repetida: sigue OK");
      assert(patchesNC.length === 0, "(c) NC repetida: CERO PATCH adicionales (ya estaba vinculada)");

      // Anulación: el id de la factura YA NO está en 'Factura' → ya se revirtió, no debe volver a escribir.
      const patchesAnul: unknown[] = [];
      global.fetch = fetchLanzaSiTocaShippingItems(async (url, method) => {
        if (method === "GET" && url.includes("Productos%20Digitales")) {
          return json({ records: [{ id: PRODUCTO_ID, fields: { "Factura": [] } }] });
        }
        if (method === "PATCH" && url.includes("Productos%20Digitales/")) {
          patchesAnul.push(null);
          return json({ id: PRODUCTO_ID });
        }
        return null;
      });
      const rAnul = await revertirInventarioFacturaAnulada({ facturaRecordId: FACTURA_ID, detalles: [lineaFactura(PRODUCTO_ID)], ambiente: "2" });
      assert(rAnul.estado === "OK", "(c) Anulación repetida: sigue OK");
      assert(patchesAnul.length === 0, "(c) Anulación repetida: CERO PATCH adicionales (ya se había quitado el link)");
    }

    // ═══ (d) — Las dos respetan el guardián de ambiente ═══════════════════════
    {
      global.fetch = (() => { throw new Error("no debería llamar a fetch en ambiente pruebas"); }) as unknown as typeof fetch;

      const rNC = await revertirInventarioNotaCredito({ notaCreditoRecordId: NC_ID, detalles: [lineaNC(PRODUCTO_ID)], ambiente: "1" });
      assert(rNC.estado === "OK", "(d) NC en ambiente pruebas: responde OK sin tocar red");

      const rAnul = await revertirInventarioFacturaAnulada({ facturaRecordId: FACTURA_ID, detalles: [lineaFactura(PRODUCTO_ID)], ambiente: "1" });
      assert(rAnul.estado === "OK", "(d) Anulación en ambiente pruebas: responde OK sin tocar red");

      // Fail-closed también sin ambiente definido.
      const rNCsinAmb = await revertirInventarioNotaCredito({ notaCreditoRecordId: NC_ID, detalles: [lineaNC(PRODUCTO_ID)] });
      assert(rNCsinAmb.estado === "OK", "(d) NC sin ambiente definido: fail-closed, responde OK sin tocar red");

      const rAnulSinAmb = await revertirInventarioFacturaAnulada({ facturaRecordId: FACTURA_ID, detalles: [lineaFactura(PRODUCTO_ID)] });
      assert(rAnulSinAmb.estado === "OK", "(d) Anulación sin ambiente definido: fail-closed, responde OK sin tocar red");
    }

    // ═══ (e) — En ninguna se toca ningún Shipping Item ════════════════════════
    // Ya verificado en (a)-(d): fetchLanzaSiTocaShippingItems lanza en cuanto
    // cualquier URL menciona "Shipping Items" — si (a)-(d) llegaron a pasar,
    // es porque ninguna llamada lo hizo. Se deja explícito con un caso más,
    // mezclando una línea de Shipping Item real junto a la digital, para
    // confirmar que ESA sí puede tocar Shipping Items (comportamiento
    // correcto, sin relación con este trabajo) sin que la rama digital
    // interfiera ni viceversa.
    {
      const patchesDigital: unknown[] = [];
      const patchesShipping: unknown[] = [];
      global.fetch = (async (url: string | URL, init?: RequestInit) => {
        const urlStr = String(url);
        const method = init?.method ?? "GET";
        if (method === "GET" && urlStr.includes("Productos%20Digitales")) {
          return json({ records: [{ id: PRODUCTO_ID, fields: { "Factura": [FACTURA_ID] } }] });
        }
        if (method === "PATCH" && urlStr.includes("Productos%20Digitales/")) {
          patchesDigital.push(null);
          return json({ id: PRODUCTO_ID });
        }
        if (method === "GET" && urlStr.includes("Shipping%20Items")) {
          return json({ records: [{ id: "recITEMX", fields: { "Cantidad": 0, "Factura": [FACTURA_ID], "Disponible para venta": false, "Estado Item": "Vendido" } }] });
        }
        if (method === "PATCH" && urlStr.includes("Shipping%20Items/")) {
          patchesShipping.push(null);
          return json({ id: "recITEMX" });
        }
        throw new Error(`fetch inesperado: ${method} ${urlStr}`);
      }) as unknown as typeof fetch;

      const lineaItem: DetalleFactura = {
        descripcion: "Repuesto", cantidad: 1, precioUnitario: 10, descuento: 0, precioTotalSinImpuesto: 10,
        impuestos: [{ codigo: "2", codigoPorcentaje: "4", tarifa: 15, baseImponible: 10, valor: 1.5 }],
        tipo: "producto", shippingItemId: "recITEMX",
      };

      const resultado = await revertirInventarioFacturaAnulada({
        facturaRecordId: FACTURA_ID,
        detalles: [lineaItem, lineaFactura(PRODUCTO_ID)],
        ambiente: "2",
      });

      assert(resultado.estado === "OK", "(e) Convivencia: estado OK con ambos tipos de línea");
      assert(patchesDigital.length === 1, "(e) Convivencia: 1 PATCH a Productos Digitales");
      assert(patchesShipping.length === 1, "(e) Convivencia: 1 PATCH a Shipping Items — ninguno interfiere con el otro");
    }
  } finally {
    global.fetch = fetchOriginal;
    delete process.env.AIRTABLE_API_KEY;
    delete process.env.AIRTABLE_BASE_ID;
  }

  if (fallos > 0) {
    console.error(`\n❌ productoDigital.reverso.test.ts — ${fallos} aserción(es) fallida(s)`);
    process.exit(1);
  }
  console.log("\n✅ productoDigital.reverso.test.ts — todos los asserts pasaron");
}

main();
