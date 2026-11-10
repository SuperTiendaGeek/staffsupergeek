/**
 * Test — separar las operaciones viejas de sus órdenes (punto 10A-0).
 * Ejecutar: npm test separar-de-ordenes
 */
import { mismasCifras, planSeparacion, NOTA_SEPARACION, type OpParaSeparar } from "../separar-de-ordenes";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const OP = (p: Partial<OpParaSeparar> & { id: string; codigo: string }): OpParaSeparar => ({
  estado: "Pedido", ordenId: "recOR507", ordenCodigo: "OR000507", itemIds: [], lineaIds: [], abonoIds: [], solicitudIds: [], documentos: 0, observacion: "", ...p,
});

// Caso real OP-106 (OR000507): bisagras OTR-000216, $100 abonados, SOL-000005.
const base = {
  operaciones: [
    OP({ id: "op106", codigo: "OP-2026-000106", itemIds: ["it216"], lineaIds: ["l106"], abonoIds: ["ab273"], solicitudIds: ["sol5"] }),
    OP({ id: "op134", codigo: "OP-2026-000134", estado: "Requerimiento", ordenId: "recOR530", ordenCodigo: "OR000530", abonoIds: ["ab302"] }),
    OP({ id: "opVieja", codigo: "OP-2026-000054", estado: "Entregado", lineaIds: ["lx"] }),
    OP({ id: "opSuelta", codigo: "OP-2026-000126", ordenId: null, ordenCodigo: "" }),
  ],
  lineas: [{ id: "l106", ordenId: "recOR507", operacionId: "op106", itemId: "it216", estado: "Cargada" }],
  items: [{ id: "it216", sku: "OTR-000216", operacionIds: ["op106"], ordenStockIds: [] }],
  abonos: [
    { id: "ab273", numero: "273", monto: 100, ordenIds: ["recOR507"], operacionIds: ["op106"] },
    { id: "ab302", numero: "302", monto: 25, ordenIds: ["recOR530"], operacionIds: ["op134"] },
  ],
  solicitudes: [{ id: "sol5", codigo: "SOL-000005", operacionId: "op106", ordenId: null, lineaId: null }],
};

const { acciones, bloqueos } = planSeparacion(base);
const de = (op: string) => acciones.filter((a) => a.op === op).map((a) => a.tipo).sort().join();
assert(bloqueos.length === 0, "sin bloqueos");
assert(de("OP-2026-000106") === "abono_solo_orden,cerrar_op,item_a_orden,linea_sin_op,solicitud_a_orden", "OP-106: abono, artículo, línea, solicitud y cierre");
const item = acciones.find((a) => a.tipo === "item_a_orden");
assert(item?.tipo === "item_a_orden" && item.ordenStockIds.join() === "recOR507" && item.operacionIds.length === 0, "OTR-000216 queda apartado para OR000507 y suelta la operación");
const sol = acciones.find((a) => a.tipo === "solicitud_a_orden");
assert(sol?.tipo === "solicitud_a_orden" && sol.ordenId === "recOR507" && sol.lineaId === "l106", "SOL-000005 pasa a la orden y a su línea");
assert(de("OP-2026-000134") === "abono_solo_orden,cerrar_op", "OP-134 (solo un requerimiento con $25): abono a la orden y cierre");
const cierre = acciones.find((a) => a.tipo === "cerrar_op" && a.op === "OP-2026-000134");
assert(cierre?.tipo === "cerrar_op" && cierre.observacion === NOTA_SEPARACION("OR000530"), "nota: pasó a la orden OR000530");
assert(!acciones.some((a) => a.op === "OP-2026-000054" || a.op === "OP-2026-000126"), "no se tocan las entregadas ni los pedidos sin orden");

// Bloqueos: nunca se mueve dinero que no esté ya en la orden.
const sinOrden = planSeparacion({ ...base, abonos: [{ ...base.abonos[0], ordenIds: [] }, base.abonos[1]] });
assert(sinOrden.bloqueos.some((b) => b.op === "OP-2026-000106" && b.motivo.includes("no está enlazado a la orden")), "abono sin la orden: se bloquea esa operación");
assert(!sinOrden.acciones.some((a) => a.op === "OP-2026-000106"), "y no se toca nada de ella");
const conDoc = planSeparacion({ ...base, operaciones: [{ ...base.operaciones[0], documentos: 1 }] });
assert(conDoc.bloqueos.length === 1 && conDoc.acciones.length === 0, "con un documento emitido desde la operación: se bloquea");
const itemSuelto = planSeparacion({ ...base, lineas: [{ ...base.lineas[0], itemId: null }] });
assert(itemSuelto.bloqueos.some((b) => b.motivo.includes("no está cargado")), "artículo que no está en una línea de la orden: se bloquea");

// Idempotente: ya separada (sin orden) no hace nada.
const otraVez = planSeparacion({ ...base, operaciones: base.operaciones.map((o) => ({ ...o, ordenId: null })) });
assert(otraVez.acciones.length === 0, "aplicado, la vista previa da 0 acciones");

assert(mismasCifras({ totalCuenta: 210, totalAbonado: 100, saldo: 110 }, { totalCuenta: 210, totalAbonado: 100, saldo: 110 }), "cifras iguales");
assert(!mismasCifras({ totalCuenta: 210, totalAbonado: 100, saldo: 110 }, { totalCuenta: 175, totalAbonado: 100, saldo: 75 }), "cifras distintas se detectan");

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo OK");
