/**
 * Test — reintentar el descargo de inventario de un recibo sin descontar dos
 * veces (punto 10a de la auditoría Shipping V2, decisión 7 del 16-oct-2026).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/facturacion/__tests__/recibo.reintentoInventario.test.ts
 *
 * Sin red: simula Airtable con un fetch en memoria.
 */
import { planReintentoInventarioRecibo, reciboRequiereAtencionInventario } from "../recibos/reintento";
import { descontarInventarioRecibo } from "../recibos/efectos";

let fallos = 0;
function assert(cond: boolean, msg: string): void { if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); } }

async function main() {
  console.log("— Cuándo se reintenta —");
  const ahora = new Date("2026-10-17T12:00:00Z");
  assert(planReintentoInventarioRecibo({ estado: "Vigente", sincronizacionInventario: "ERROR", ahora }).accion === "reintentar", "ERROR → se reintenta");
  assert(planReintentoInventarioRecibo({ estado: "Vigente", sincronizacionInventario: "OK", ahora }).accion === "nada", "OK → no se toca");
  assert(planReintentoInventarioRecibo({ estado: "Anulado", sincronizacionInventario: "ERROR", ahora }).accion === "nada", "Anulado → no se toca");
  assert(planReintentoInventarioRecibo({ estado: "Vigente", sincronizacionInventario: "N/A", ahora }).accion === "nada", "Sin descargo pendiente → no se toca");
  assert(planReintentoInventarioRecibo({ estado: "Vigente", sincronizacionInventario: "PENDIENTE", creadoEn: "2026-10-17T11:59:30Z", ahora }).accion === "esperar", "PENDIENTE de hace 30 s → esperar (puede seguir emitiéndose)");
  assert(planReintentoInventarioRecibo({ estado: "Vigente", sincronizacionInventario: "PENDIENTE", creadoEn: "2026-10-17T11:50:00Z", ahora }).accion === "reintentar", "PENDIENTE de hace 10 min → se reintenta");
  assert(reciboRequiereAtencionInventario({ estado: "Vigente", sincronizacionInventario: "ERROR" }), "La fila muestra el aviso con ERROR");
  assert(!reciboRequiereAtencionInventario({ estado: "Vigente", sincronizacionInventario: "OK" }), "Sin aviso con OK");

  console.log("\n— Nunca descuenta dos veces —");
  process.env.AIRTABLE_API_KEY = "test";
  process.env.AIRTABLE_BASE_ID = "appTEST0000000000";
  const ITEM = "recITEM0000000001";
  const RECIBO = "recRECIBO00000001";
  const item: Record<string, unknown> = { "Cantidad": 3, "Cantidad Reservada": 0, "Reservado": false, "Recibo": [], "Estado Item": "Disponible" };
  const recibo: Record<string, unknown> = {};
  let patchesItem = 0;
  let fallarPrimerPatch = true;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const u = decodeURIComponent(String(url));
    const metodo = init?.method ?? "GET";
    if (metodo === "GET" && u.includes("/Shipping Items")) {
      return new Response(JSON.stringify({ records: [{ id: ITEM, createdTime: "", fields: { ...item } }] }), { status: 200 });
    }
    if (metodo === "PATCH" && u.includes(`/Shipping Items/${ITEM}`)) {
      if (fallarPrimerPatch) { fallarPrimerPatch = false; return new Response("límite", { status: 422 }); }
      patchesItem++;
      Object.assign(item, JSON.parse(String(init?.body)).fields);
      return new Response(JSON.stringify({ id: ITEM, fields: item }), { status: 200 });
    }
    if (metodo === "PATCH" && u.includes(`/Recibos/${RECIBO}`)) {
      Object.assign(recibo, JSON.parse(String(init?.body)).fields);
      return new Response(JSON.stringify({ id: RECIBO, fields: recibo }), { status: 200 });
    }
    return new Response("no simulado: " + metodo + " " + u, { status: 500 });
  }) as typeof fetch;

  const lineas = [{ descripcion: "Kit T544", cantidad: 1, precioUnitario: 49, descuento: 0, shippingItemId: ITEM }];
  const entrada = { reciboRecordId: RECIBO, numeroRecibo: "REC-999999", lineas, ambiente: "2" };

  const primero = await descontarInventarioRecibo(entrada);
  assert(primero.estado === "ERROR" && recibo["Sincronización Inventario"] === "ERROR", "Al emitir falla el descuento → el recibo queda en ERROR");
  assert(item["Cantidad"] === 3, "El artículo sigue con 3 (no se descontó)");

  const reintento = await descontarInventarioRecibo(entrada);
  assert(reintento.estado === "OK" && recibo["Sincronización Inventario"] === "OK", "Reintentar → OK");
  assert(item["Cantidad"] === 2, "Se descontó 1 unidad: 3 → 2");
  assert(Array.isArray(item["Recibo"]) && (item["Recibo"] as string[]).includes(RECIBO), "El artículo queda vinculado al recibo (marca de hecho)");

  const otraVez = await descontarInventarioRecibo(entrada);
  assert(otraVez.estado === "OK", "Un segundo reintento termina bien");
  assert(item["Cantidad"] === 2 && patchesItem === 1, "…y NO vuelve a descontar (sigue en 2, una sola escritura)");

  if (fallos > 0) { console.error(`\n❌ recibo.reintentoInventario.test.ts — ${fallos} fallidas`); process.exit(1); }
  console.log("\n✅ recibo.reintentoInventario.test.ts — todos los asserts pasaron");
}
main();
