/**
 * Órdenes de compra de punta a punta (punto 9d, 14-oct-2026), contra el doble
 * de Airtable en memoria: crear la orden, sus artículos, el pago con su egreso,
 * el artículo olvidado, anular un pago, mover un artículo y la pantalla Pagos.
 * Ejecutar: npm test ordenes-compra-flujo
 */
import type { ShippingV2ItemWriteInput } from "@/types/shipping-v2";
import { systemShippingV2Access } from "../access";
import {
  anularPagoShippingV2,
  createShippingV2Item,
  createShippingV2OrdenCompra,
  eliminarOrdenCompraVacia,
  getShippingV2OrdenCompraById,
  getShippingV2PagosWorkspace,
  moverArticuloDeOrden,
  registrarPagoOrdenCompra,
} from "../airtable";
import { ORDEN_COMPRA_FIELDS } from "../ordenes-compra";
import { SHIPPING_V2_ITEM_FIELDS, SHIPPING_V2_PAYMENT_FIELDS, SHIPPING_V2_PROVIDER_FIELDS, SHIPPING_V2_TABLES } from "../schema.generated";
import { __resetCacheNombreTablaParaPruebas } from "../../finanzas/table-names";
import { MOVIMIENTOS_FIELDS } from "../../finanzas/movimientos-fields";
import {
  activarEnvFalso,
  construirFetchDouble,
  crearCuentaDouble,
  crearEstadoDouble,
  crearRegistroDouble,
  limpiarEnvFalso,
  registrarTablaDouble,
  type AirtableDoubleState,
} from "../../finanzas/__tests__/_airtableDouble";

let fallos = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { fallos++; console.error("✗", msg); } else console.log("✓", msg);
}
async function rechaza(fn: () => Promise<unknown>, fragmento: string, msg: string) {
  try {
    await fn();
    assert(false, `${msg} (debía fallar)`);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    assert(m.includes(fragmento), m.includes(fragmento) ? msg : `${msg} → recibido: ${m}`);
  }
}

const T = SHIPPING_V2_TABLES;
const OC = ORDEN_COMPRA_FIELDS;
const FI = SHIPPING_V2_ITEM_FIELDS;
const FP = SHIPPING_V2_PAYMENT_FIELDS;

/** Airtable mantiene solo los campos inversos; el doble no lo hace para estas tablas. */
function sincronizarInversos(state: AirtableDoubleState) {
  const items = state.otras.get(T.items)!;
  const pagos = state.otras.get(T.pagos)!;
  const ordenes = state.otras.get(T.ordenesCompra)!;
  const ids = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
  for (const item of items.values()) {
    item.fields["Shipping Pagos (Items relacionados)"] = [...pagos.values()].filter((p) => ids(p.fields[FP.itemsRelacionados]).includes(item.id)).map((p) => p.id);
    item.fields["Shipping Pagos (Regalos incluidos)"] = [...pagos.values()].filter((p) => ids(p.fields[FP.regalosIncluidos]).includes(item.id)).map((p) => p.id);
  }
  for (const orden of ordenes.values()) {
    orden.fields[OC.articulos] = [...items.values()].filter((i) => ids(i.fields[FI.ordenCompra]).includes(orden.id)).map((i) => i.id);
    orden.fields[OC.pagos] = [...pagos.values()].filter((p) => ids(p.fields[FP.ordenCompra]).includes(orden.id)).map((p) => p.id);
  }
}

activarEnvFalso();
__resetCacheNombreTablaParaPruebas();
const state = crearEstadoDouble("Movimientos Financieros");
for (const t of [T.proveedores, T.items, T.pagos, T.eventos, T.ordenesCompra, T.packings]) registrarTablaDouble(state, t);
crearCuentaDouble(state, { nombre: "Caja Registradora", saldoInicial: 5000, fechaCorte: "2026-01-01" });
const F_PROV = SHIPPING_V2_PROVIDER_FIELDS;
const ebay = crearRegistroDouble(state, T.proveedores, { [F_PROV.proveedorId]: "eBay", [F_PROV.nombre]: "eBay", [F_PROV.estado]: "Activo", [F_PROV.tipoProveedor]: ["Hardware"], [F_PROV.paisZonaLogistica]: "USA" });
const otro = crearRegistroDouble(state, T.proveedores, { [F_PROV.proveedorId]: "Amazon", [F_PROV.nombre]: "Amazon", [F_PROV.estado]: "Activo", [F_PROV.tipoProveedor]: ["Hardware"], [F_PROV.paisZonaLogistica]: "USA" });

const base = construirFetchDouble(state);
let numero = 0;
global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(input));
  const seg = decodeURIComponent(url.pathname).split("/").filter(Boolean);
  const tabla = seg[2];
  const metodo = (init?.method ?? "GET").toUpperCase();
  if (metodo === "DELETE") {
    state.otras.get(tabla)?.delete(seg[3]);
    return new Response(JSON.stringify({ deleted: true, id: seg[3] }), { status: 200 });
  }
  // Fórmula que el doble no entiende: búsqueda de SKU sin distinguir mayúsculas.
  const formula = url.searchParams.get("filterByFormula") ?? "";
  const lower = formula.match(/^LOWER\(\{([^}]+)\}\)\s*=\s*LOWER\('([^']*)'\)$/);
  if (metodo === "GET" && !seg[3] && lower) {
    const records = [...(state.otras.get(tabla)?.values() ?? [])].filter((r) => String(r.fields[lower[1]] ?? "").toLowerCase() === lower[2].toLowerCase());
    return new Response(JSON.stringify({ records }), { status: 200 });
  }
  if (metodo === "POST" && tabla === T.ordenesCompra) {
    const body = JSON.parse(String(init?.body)) as { records: Array<{ fields: Record<string, unknown> }> };
    body.records.forEach((r) => { r.fields[OC.numero] = ++numero; });
    init = { ...init, body: JSON.stringify(body) };
  }
  const res = await base(input as string, init);
  if (metodo === "POST" || metodo === "PATCH") sincronizarInversos(state);
  return res;
}) as typeof fetch;

const staff = systemShippingV2Access();
const admin = { ...staff, isSiteAdmin: true };
const quien = { registradoPor: "Prueba", access: staff };

function articulo(nombre: string, categoria: string, costo: number | null, extra: Partial<ShippingV2ItemWriteInput> = {}): ShippingV2ItemWriteInput {
  return {
    nombre, categoria, tipoOperacion: "Compra a proveedor", tipoItem: "", estado: "", proveedorId: ebay,
    origenArticulo: "Proveedor extranjero", cantidad: 1, unidad: "Unidad", costoProveedor: costo, condicion: "Usado", ...extra,
  };
}
const respaldo = { fechaPagoReal: "2026-10-14T17:00:00.000Z", metodoPago: "Transferencia bancaria", cuentaOrigen: "Caja" };

async function main() {
try {
  console.log("— Crear la orden y sus artículos —");
  await rechaza(() => createShippingV2OrdenCompra({ proveedorId: "" }, quien), "proveedor", "La orden pide proveedor");
  const orden = await createShippingV2OrdenCompra({ proveedorId: ebay, numeroProveedor: "12-34567", fechaCompra: "2026-10-14" }, quien);
  assert(orden.ocId === "OC-000001", `Código de la orden a partir del número de Airtable (${orden.ocId})`);
  const ram = await createShippingV2Item(articulo("RAM DDR4 16GB", "RAM", 40), { registradoPor: "Prueba", ordenCompraId: orden.id });
  const ssd = await createShippingV2Item(articulo("SSD NVMe 512GB", "SSD", 60), { registradoPor: "Prueba", ordenCompraId: orden.id });
  const regalo = await createShippingV2Item(articulo("Cable USB-C", "Cable", null, { tipoOperacion: "Regalo de proveedor" }), { registradoPor: "Prueba", ordenCompraId: orden.id });
  assert(ram.ordenCompraId === orden.id && regalo.ordenCompraId === orden.id, "Los artículos nacen dentro de la orden");
  await rechaza(() => createShippingV2Item(articulo("Mouse", "Accesorio", 10, { proveedorId: otro }), { registradoPor: "Prueba", ordenCompraId: orden.id }), "mismo proveedor", "Otro proveedor no entra en la orden");

  let o = await getShippingV2OrdenCompraById(orden.id, staff);
  assert(o.resumen.situacion === "falta-respaldo" && o.resumen.total === 100 && o.resumen.porPagarIds.length === 2, "Sin pago: falta respaldo de $100 (el regalo no suma)");
  assert(o.resumen.regalosPorAdjuntarIds.join() === regalo.id, "El regalo se adjuntará al pago");

  console.log("\n— Pagar la orden: un pago, un egreso —");
  await rechaza(() => registrarPagoOrdenCompra(orden.id, { ...respaldo, cuentaOrigen: "" }, quien), "cuenta", "El pago pide la cuenta");
  const pago1 = await registrarPagoOrdenCompra(orden.id, respaldo, quien);
  assert(pago1.totalAPagar === 100 && pago1.estadoPago === "Pagado" && pago1.ordenCompraId === orden.id, "Pago de $100 contra la orden");
  assert(pago1.regalosIds.includes(regalo.id) && pago1.orden === "12-34567", "El pago lleva el regalo y el nº de orden");
  const egresos = () => [...state.movimientos.values()];
  assert(egresos().length === 1 && egresos()[0].fields[MOVIMIENTOS_FIELDS.monto] === 100, "Un egreso de $100 en Finanzas");
  o = await getShippingV2OrdenCompraById(orden.id, staff);
  assert(o.resumen.situacion === "pagada" && o.resumen.pagado === 100, "La orden queda Pagada");
  await rechaza(() => registrarPagoOrdenCompra(orden.id, respaldo, quien), "ya está pagada", "No se paga dos veces");

  console.log("\n— Artículo olvidado: falta $16 y se paga solo eso —");
  const cable = await createShippingV2Item(articulo("Cable HDMI", "Cable", 8, { cantidad: 2 }), { registradoPor: "Prueba", ordenCompraId: orden.id });
  o = await getShippingV2OrdenCompraById(orden.id, staff);
  assert(o.resumen.situacion === "falta" && o.resumen.falta === 16 && o.resumen.total === 116, "La orden muestra Falta $16");
  const pago2 = await registrarPagoOrdenCompra(orden.id, respaldo, quien);
  assert(pago2.totalAPagar === 16 && pago2.itemIds.join() === cable.id, "El segundo pago lleva solo el cable");
  assert(egresos().length === 2, "Segundo egreso, sin tocar el primero");

  console.log("\n— Correcciones del Administrador —");
  await rechaza(() => anularPagoShippingV2(pago2.id, { motivo: "Pago duplicado" }, quien), "Administrador", "Solo el Administrador anula");
  await rechaza(() => anularPagoShippingV2(pago2.id, { motivo: "no" }, { registradoPor: "Admin", access: admin }), "motivo", "Anular pide motivo");
  const anulado = await anularPagoShippingV2(pago2.id, { motivo: "Se pagó con otra tarjeta" }, { registradoPor: "Admin", access: admin });
  assert(anulado.pago.estadoPago === "Anulado", "El pago queda Anulado");
  const mov2 = state.movimientos.get(pago2.movimientoFinanzasIds[0] ?? "");
  assert(mov2?.fields[MOVIMIENTOS_FIELDS.estado] === "Anulado", "Su egreso en Finanzas también queda Anulado");
  o = await getShippingV2OrdenCompraById(orden.id, staff);
  assert(o.resumen.situacion === "falta" && o.resumen.falta === 16, "La orden vuelve a Falta $16");
  await rechaza(() => moverArticuloDeOrden(ram.id, { motivo: "Orden equivocada" }, { registradoPor: "Admin", access: admin }), "primero anula ese pago", "Un artículo pagado no se mueve");
  const orden2 = await createShippingV2OrdenCompra({ proveedorId: ebay, numeroProveedor: "12-99999" }, quien);
  const movido = await moverArticuloDeOrden(cable.id, { destinoOrdenId: orden2.id, motivo: "Venía en otra orden de eBay" }, { registradoPor: "Admin", access: admin });
  assert(movido.destinoOc === orden2.ocId, `Cable movido a ${orden2.ocId}`);
  o = await getShippingV2OrdenCompraById(orden.id, staff);
  assert(o.resumen.situacion === "pagada" && o.resumen.total === 100, "La primera orden vuelve a Pagada");

  console.log("\n— Orden vacía y pantalla Pagos —");
  const vacia = await createShippingV2OrdenCompra({ proveedorId: ebay }, quien);
  await rechaza(() => eliminarOrdenCompraVacia(orden.id, { access: staff }), "no se borra", "Una orden con artículos no se borra");
  const borrada = await eliminarOrdenCompraVacia(vacia.id, { access: staff });
  assert(borrada.eliminada === true && !state.otras.get(T.ordenesCompra)!.has(vacia.id), "La orden vacía se borra");
  const ws = await getShippingV2PagosWorkspace(staff);
  assert((ws.ordenes ?? []).some((x) => x.id === orden2.id && x.resumen.situacion === "falta-respaldo" && x.resumen.falta === 16), "Pagos muestra la orden con Falta respaldo $16");
  assert(!ws.porPagar.some((i) => i.id === cable.id), "Lo que está en una orden no se repite como \"Sin orden\"");
  await rechaza(() => getShippingV2OrdenCompraById(orden.id, { ...staff, providerId: ebay, mode: "provider" as const }), "portal del proveedor", "El portal del proveedor no ve órdenes");
} catch (e) {
  fallos++;
  console.error("✗ Error inesperado:", e);
} finally {
  limpiarEnvFalso();
  __resetCacheNombreTablaParaPruebas();
}
}

main().then(() => {
  if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1); }
  console.log("\nTodas las pruebas pasaron.");
});
