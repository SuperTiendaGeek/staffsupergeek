/**
 * Test — migración del historial al pedido especial (punto 10D-0).
 * Ejecutar: npm test migrar-historial
 */
import { planMigracionHistorial } from "../migrar-historial";
import type { OpParaMigrar, OpcionVieja } from "../migrar-abiertos";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const opc = (id: string, texto: string, precio: number | null, extra: Partial<OpcionVieja> = {}): OpcionVieja => ({
  id, texto, cantidad: null, precioUnitario: null, precioVenta: precio, costo: 10, url: "", tiempo: "", nota: "", proveedorId: null, itemIds: [], ...extra,
});
const op = (id: string, estado: string, extra: Partial<OpParaMigrar> = {}): OpParaMigrar => ({
  id, codigo: `OP-${id}`, estado, ordenId: null, categoria: "Laptop", lineaIds: [], opcionIds: [], opcionElegidaId: null, itemIds: [], abonado: 0, ...extra,
});

const { acciones, avisos, omitidasPorOrden } = planMigracionHistorial({
  operaciones: [
    op("ent", "Entregado", { opcionIds: ["a", "b"], opcionElegidaId: "a", itemIds: ["recITEM"] }),
    op("entsin", "Entregado", { opcionIds: ["a"], opcionElegidaId: "a" }),
    op("rec", "Rechazado", { opcionIds: ["a", "b"], opcionElegidaId: "a" }),
    op("recvacia", "Rechazado"),
    op("can", "Cancelado", { opcionIds: ["b"] }),
    op("conorden", "Rechazado", { ordenId: "recOR", opcionIds: ["a"] }),
    op("nueva", "Entregado", { lineaIds: ["recL"], opcionIds: ["a"] }),
    op("abierta", "Cotizando", { opcionIds: ["a"] }),
    op("sinprecio", "Cancelado", { opcionIds: ["c"] }),
  ],
  opciones: [opc("a", "Tapa HP $130", 130, { itemIds: ["recITEM"] }), opc("b", "Otra tapa", 90), opc("c", "Listado en pdf", null)],
});
const de = (c: string) => acciones.filter((a) => (a.tipo === "crear_linea" ? a.linea.op : a.op) === c);
const lineas = (c: string) => de(c).flatMap((a) => (a.tipo === "crear_linea" ? [a.linea] : []));

assert(lineas("OP-ent").find((l) => l.opcionId === "a")?.estado === "Cargada" && lineas("OP-ent").find((l) => l.opcionId === "a")?.itemId === "recITEM", "Entregado: la elegida pasa Cargada con su artículo");
assert(lineas("OP-ent").find((l) => l.opcionId === "b")?.estado === "Rechazada", "Entregado: la otra pasa Rechazada");
assert(!de("OP-ent").some((a) => a.tipo === "estado"), "Entregado sigue Entregado (sin cambio de estado)");
assert(lineas("OP-entsin")[0]?.estado === "Cargada" && lineas("OP-entsin")[0]?.itemId === null, "Entregado sin artículo: Cargada sin artículo");
assert(lineas("OP-rec").every((l) => l.estado === "Rechazada") && lineas("OP-rec").length === 2, "Rechazado: todas las opciones Rechazada");
assert(de("OP-rec").some((a) => a.tipo === "estado" && a.estado === "Cancelado"), "Rechazado pasa a Cancelado");
assert(de("OP-recvacia").length === 1 && de("OP-recvacia")[0].tipo === "estado", "Rechazado sin opciones: solo cambia a Cancelado");
assert(lineas("OP-can").length === 1 && !de("OP-can").some((a) => a.tipo === "estado"), "Cancelado: líneas, sin cambio de estado");
assert(de("OP-conorden").length === 0 && omitidasPorOrden.includes("OP-conorden"), "con orden de reparación: no se toca");
assert(de("OP-nueva").length === 0, "con líneas ya: no se toca (idempotente)");
assert(de("OP-abierta").length === 0, "estados abiertos no son de esta migración");
assert(avisos.some((x) => x.op === "OP-sinprecio"), "opción sin precio: avisa");
assert(!acciones.some((a) => a.tipo === "crear_linea" && (a.linea.estado as string) === "Aprobada"), "nunca crea líneas Aprobada");
assert(acciones.every((a) => a.tipo !== "crear_linea" || a.linea.grupo === "pedido"), "grupo de alternativas \"pedido\"");

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nOK");
