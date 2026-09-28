/**
 * Test — las lecturas de Airtable del gancho de facturación fallan en voz
 * alta (lib/facturacion/gancho/airtableGancho.ts) y los efectos de inventario
 * NO escriben nada cuando no pudieron leer.
 * Ejecutar: npm test (el corredor pone NODE_OPTIONS="--conditions react-server").
 *
 * Por qué existe: hasta sep-2026, fetchRecordsByIds() devolvía [] y
 * fetchRecord() devolvía null ante CUALQUIER error (429, 503…). Con eso:
 *   - postEmision leía "el artículo no existe" = "había 0" → escribía
 *     Cantidad 0, Vendido y pisaba la lista de facturas del artículo;
 *   - lo mismo el recibo interno, y la nota de crédito dejaba la Cantidad en
 *     solo lo devuelto (se perdía el stock que ya había);
 *   - la idempotencia leía "no hay factura previa" → segunda factura real.
 *
 * global.fetch se reemplaza por un doble; nunca toca Airtable real.
 */

import fs   from "fs";
import path from "path";

import { fetchRecordsByIds, fetchRecord, ErrorLecturaAirtable } from "../gancho/airtableGancho";
import { postEmision } from "../gancho/postEmision";
import { descontarInventarioRecibo } from "../recibos/efectos";
import { revertirInventarioNotaCredito } from "../notaCredito/revertirInventario";
import type { DetalleFactura } from "../types/factura";
import type { LineaRecibo } from "../recibos/types";
import type { DetalleNotaCredito } from "../notaCredito/types";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const fetchOriginal = global.fetch;

type Llamada = { method: string; url: string; body?: Record<string, unknown> };

// Doble de Airtable. `lecturas` decide qué responde cada GET (por tabla);
// los PATCH siempre responden bien y se registran.
function doble(lecturas: (tabla: string, url: string) => Response) {
  const llamadas: Llamada[] = [];
  const fetchDoble = async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    llamadas.push({ method, url: u, body });
    const tabla = decodeURIComponent(u.split("/v0/")[1].split("/")[1].split("?")[0]);
    if (method === "GET") return lecturas(tabla, u);
    return { ok: true, status: 200, json: async () => ({ id: "recX", fields: {} }), text: async () => "" } as Response;
  };
  return { fetchDoble: fetchDoble as unknown as typeof fetch, llamadas };
}

const ok = (records: Array<{ id: string; fields: Record<string, unknown> }>) =>
  ({ ok: true, status: 200, json: async () => ({ records }) }) as Response;
const falla = (status: number) => ({ ok: false, status, text: async () => "simulado" }) as Response;

const patchesA = (llamadas: Llamada[], tabla: string) =>
  llamadas.filter((l) => l.method === "PATCH" && l.url.includes(encodeURIComponent(tabla)));

(async () => {
  process.env.AIRTABLE_API_KEY = "fake-token-para-test";
  process.env.AIRTABLE_BASE_ID = "appFAKEBASE0001";

  // ─── 1. fetchRecordsByIds ─────────────────────────────────────────────────
  {
    let intentos = 0;
    const { fetchDoble } = doble(() => {
      intentos++;
      return intentos === 1 ? falla(503) : ok([{ id: "recA1", fields: {} }]);
    });
    global.fetch = fetchDoble;
    const r = await fetchRecordsByIds("Shipping Items", ["recA1"]);
    assert(r.length === 1 && intentos === 2, "Un 503 pasajero se reintenta y la lectura sale bien");
  }
  {
    const { fetchDoble, llamadas } = doble(() => falla(503));
    global.fetch = fetchDoble;
    let error: unknown = null;
    try { await fetchRecordsByIds("Shipping Items", ["recA1"]); } catch (e) { error = e; }
    assert(error instanceof ErrorLecturaAirtable, "Un 503 persistente LANZA ErrorLecturaAirtable (nunca devuelve [])");
    assert(llamadas.length === 3, "Se intenta 3 veces antes de rendirse");
  }
  {
    const { fetchDoble, llamadas } = doble(() => falla(422));
    global.fetch = fetchDoble;
    let lanzo = false;
    try { await fetchRecordsByIds("Shipping Items", ["recA1"]); } catch { lanzo = true; }
    assert(lanzo && llamadas.length === 1, "Un 422 no se reintenta, pero igual lanza");
  }
  {
    const { fetchDoble, llamadas } = doble(() => ok([]));
    global.fetch = fetchDoble;
    const r = await fetchRecordsByIds("Shipping Items", ["rec' OR TRUE() OR '", "", "abc"]);
    assert(r.length === 0 && llamadas.length === 0, "Ids que no son de Airtable no llegan a la fórmula (ni se consulta)");
  }
  {
    const { fetchDoble, llamadas } = doble(() => ok([]));
    global.fetch = fetchDoble;
    const ids = Array.from({ length: 120 }, (_, i) => `recLOTE${String(i).padStart(4, "0")}`);
    await fetchRecordsByIds("Shipping Items", [...ids, ids[0]]);
    assert(llamadas.length === 3, "120 ids (con un repetido) se consultan en 3 lotes de hasta 50");
  }
  {
    let pagina = 0;
    const { fetchDoble, llamadas } = doble(() => {
      pagina++;
      return pagina === 1
        ? ({ ok: true, status: 200, json: async () => ({ records: [{ id: "recP1", fields: {} }], offset: "itrSIGUIENTE" }) } as Response)
        : ok([{ id: "recP2", fields: {} }]);
    });
    global.fetch = fetchDoble;
    const r = await fetchRecordsByIds("Shipping Items", ["recP1", "recP2"]);
    assert(r.length === 2 && llamadas[1]?.url.includes("offset=itrSIGUIENTE"), "Se sigue el offset de Airtable si la respuesta viene paginada");
  }

  // ─── 2. fetchRecord ───────────────────────────────────────────────────────
  {
    global.fetch = doble(() => falla(404)).fetchDoble;
    assert((await fetchRecord("Clientes", "recNOEXISTE")) === null, "404 = no existe → null");
    global.fetch = doble(() => falla(503)).fetchDoble;
    let lanzo = false;
    try { await fetchRecord("Clientes", "recC1"); } catch { lanzo = true; }
    assert(lanzo, "503 al leer un registro LANZA (antes daba null = 'no existe' → Consumidor Final)");
  }

  // ─── 3. postEmision: sin lectura, no se escribe nada ─────────────────────
  const FACTURA = "recFACT0001";
  const detallesFactura = [
    { tipo: "producto", shippingItemId: "recITEM0001", cantidad: 1, descripcion: "RAM 8GB" },
    { tipo: "productoDigital", productoDigitalId: "recPD0001", cantidad: 1, descripcion: "Office" },
  ] as unknown as DetalleFactura[];
  {
    const { fetchDoble, llamadas } = doble(() => falla(503));
    global.fetch = fetchDoble;
    const r = await postEmision({ facturaRecordId: FACTURA, detalles: detallesFactura, ambiente: "2" });
    assert(r.estado === "ERROR", "postEmision con inventario ilegible → ERROR");
    assert(patchesA(llamadas, "Shipping Items").length === 0, "postEmision NO toca Shipping Items si no pudo leerlos");
    assert(patchesA(llamadas, "Productos Digitales").length === 0, "postEmision NO toca Productos Digitales si no pudo leerlos");
    const sync = patchesA(llamadas, "Facturas Electrónicas").map((l) => (l.body?.fields ?? {}) as Record<string, unknown>);
    assert(sync.some((f) => Object.values(f).includes("ERROR")), "La factura queda con Sincronización Inventario = ERROR (para reintentar)");
  }
  {
    // Se lee bien, pero el artículo no viene (ya no existe): no se escribe
    // sobre él (antes: Cantidad 0 y Factura = [esta] pisando las anteriores).
    const { fetchDoble, llamadas } = doble(() => ok([]));
    global.fetch = fetchDoble;
    const r = await postEmision({ facturaRecordId: FACTURA, detalles: detallesFactura, ambiente: "2" });
    assert(r.estado === "ERROR", "Artículo no encontrado → ERROR con detalle");
    assert(patchesA(llamadas, "Shipping Items").length === 0 && patchesA(llamadas, "Productos Digitales").length === 0,
      "Nunca se escribe sobre un artículo que no se pudo leer");
  }
  {
    // Camino feliz intacto: 52 unidades, se vende 1 → quedan 51 y se agrega
    // la factura a las que ya tenía.
    const { fetchDoble, llamadas } = doble((tabla) =>
      tabla === "Shipping Items"
        ? ok([{ id: "recITEM0001", fields: { "Cantidad": 52, "Factura": ["recFACTVIEJA"], "Estado Item": "Disponible" } }])
        : ok([{ id: "recPD0001", fields: { "Factura": [], "Orden de Reparación": ["recORD1"] } }])
    );
    global.fetch = fetchDoble;
    const r = await postEmision({ facturaRecordId: FACTURA, detalles: detallesFactura, ambiente: "2" });
    const p = patchesA(llamadas, "Shipping Items")[0]?.body?.fields as Record<string, unknown> | undefined;
    assert(r.estado === "OK", "Camino feliz sigue en OK");
    assert(p?.["Cantidad"] === 51, "Camino feliz: 52 − 1 = 51");
    assert(JSON.stringify(p?.["Factura"]) === JSON.stringify(["recFACTVIEJA", FACTURA]), "Camino feliz: conserva las facturas anteriores");
    const pd = patchesA(llamadas, "Productos Digitales")[0]?.body?.fields as Record<string, unknown> | undefined;
    assert(pd !== undefined && !("Tipo de Uso" in pd), "Producto digital con orden no se marca 'Venta directa'");
  }

  // ─── 4. Recibo interno ────────────────────────────────────────────────────
  {
    const { fetchDoble, llamadas } = doble(() => falla(503));
    global.fetch = fetchDoble;
    const lineas = [{ descripcion: "RAM 8GB", cantidad: 1, precioUnitario: 30, descuento: 0, shippingItemId: "recITEM0001" }] as LineaRecibo[];
    const r = await descontarInventarioRecibo({ reciboRecordId: "recRECIBO01", numeroRecibo: "R-1", lineas, ambiente: "2" });
    assert(r.estado === "ERROR", "Recibo con inventario ilegible → ERROR");
    assert(patchesA(llamadas, "Shipping Items").length === 0, "El recibo NO toca Shipping Items si no pudo leerlos");
    const marcas = patchesA(llamadas, "Recibos").map((l) => JSON.stringify(l.body ?? {}));
    assert(marcas.some((m) => m.includes("ERROR")), "El recibo queda con Sincronización Inventario = ERROR");
  }

  // ─── 5. Nota de crédito ───────────────────────────────────────────────────
  {
    const { fetchDoble, llamadas } = doble(() => falla(503));
    global.fetch = fetchDoble;
    const detalles = [
      { tipo: "producto", shippingItemId: "recITEM0001", devolucionFisica: true, cantidad: 1, descripcion: "RAM 8GB",
        precioUnitario: 30, descuento: 0, precioTotalSinImpuesto: 30, impuestos: [] },
    ] as unknown as DetalleNotaCredito[];
    const r = await revertirInventarioNotaCredito({ notaCreditoRecordId: "recNC0001", detalles, ambiente: "2" });
    assert(r.estado === "ERROR", "NC con inventario ilegible → ERROR");
    assert(patchesA(llamadas, "Shipping Items").length === 0, "La NC NO toca Shipping Items si no pudo leerlos (antes: Cantidad = solo lo devuelto)");
  }

  global.fetch = fetchOriginal;
  delete process.env.AIRTABLE_API_KEY;
  delete process.env.AIRTABLE_BASE_ID;

  // ─── 6. Guardias de código fuente ─────────────────────────────────────────
  const raiz = path.join(__dirname, "..", "..", "..");
  const leer = (rel: string) => fs.readFileSync(path.join(raiz, rel), "utf8");

  const gancho = leer("lib/facturacion/gancho/airtableGancho.ts");
  assert(!/if \(!res\.ok\) return/.test(gancho), "airtableGancho.ts no vuelve a convertir un error en vacío");

  for (const ruta of ["app/api/facturacion/emitir/route.ts", "app/api/facturacion/recibos/route.ts"]) {
    const codigo = leer(ruta);
    assert(!/buscarDocumentoBloqueante\([^)]*\)\s*\.catch\(/.test(codigo),
      `${ruta}: un error al verificar factura/recibo previo NO se convierte en "no hay" (responde 503)`);
  }

  if (fallos > 0) {
    console.error(`\n❌ lecturasFallanCerrado.test.ts — ${fallos} aserción(es) fallida(s)`);
    process.exit(1);
  }
  console.log("\n✅ lecturasFallanCerrado.test.ts — todos los asserts pasaron");
})();
