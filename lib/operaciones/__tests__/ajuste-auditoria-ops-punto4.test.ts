/**
 * Test — ajuste de datos del punto 4A (OP-2026-000032 y OP-2026-000015).
 * Ejecutar: npm test ajuste-auditoria-ops-punto4
 */
import { CASO_OP15, CASO_OP32, planOP15, planOP32, type LecturaOperacion, type LecturaOpcion } from "../ajuste-auditoria-ops-punto4";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}
const F = "2026-10-27";

const op32 = (o: Partial<LecturaOperacion> = {}): LecturaOperacion => ({
  existe: true, codigo: CASO_OP32.codigo, estado: "Pedido", producto: "Mainboard de Prueba",
  ordenIds: [CASO_OP32.ordenId], opcionIds: ["reciUrXZYkdL37g6d"], opcionElegidaIds: ["reciUrXZYkdL37g6d"],
  articuloIds: [], observacion: "", ...o,
});
const op15 = (o: Partial<LecturaOperacion> = {}): LecturaOperacion => ({
  existe: true, codigo: CASO_OP15.codigo, estado: "Aprobado", producto: "Cargador Genérico SM130CS-01 20V 6.5A 130W USB-C",
  ordenIds: [CASO_OP15.ordenId], opcionIds: [CASO_OP15.opcionId], opcionElegidaIds: [],
  articuloIds: [], observacion: "nota previa", ...o,
});
const opcion: LecturaOpcion = { existe: true, precio: 45, operacionIds: [CASO_OP15.operacionId] };

{
  const p = planOP32(op32(), F);
  assert(p.acciones.length === 1 && p.acciones[0].campos["Estado"] === "Rechazado", "OP-32 de prueba en Pedido → Rechazado");
  assert(String(p.acciones[0].campos["Observación Interna"]).includes("registro de prueba"), "deja nota en Observación Interna");
  assert(planOP32(op32({ estado: "Rechazado" }), F).acciones.length === 0, "ya aplicado → 0 acciones");
  assert(planOP32(op32({ producto: "Mainboard Dell" }), F).bloqueos.length === 1, "si ya no parece de prueba → se bloquea");
  assert(planOP32(op32({ articuloIds: ["recX"] }), F).bloqueos.length === 1, "con artículo físico → se bloquea");
}
{
  const p = planOP15(op15(), opcion, F);
  assert(p.acciones.length === 1, "OP-15 → una acción");
  const c = p.acciones[0].campos;
  assert(c["Estado"] === "Entregado" && JSON.stringify(c["Opción Elegida"]) === JSON.stringify([CASO_OP15.opcionId]), "elige la opción de $45 y pasa a Entregado");
  assert(String(c["Observación Interna"]).startsWith("nota previa\n"), "conserva la observación anterior");
  assert(planOP15(op15({ estado: "Entregado", opcionElegidaIds: [CASO_OP15.opcionId] }), opcion, F).acciones.length === 0, "ya aplicado → 0 acciones");
  assert(planOP15(op15(), { ...opcion, precio: 50 }, F).bloqueos.length === 1, "si la opción cambió de precio → se bloquea");
  assert(planOP15(op15({ opcionElegidaIds: ["recOTRA"] }), opcion, F).bloqueos.length === 1, "si ya tiene otra opción elegida → se bloquea");
  assert(planOP15(op15({ ordenIds: [] }), opcion, F).bloqueos.length === 1, "si ya no está en OR000344 → se bloquea");
}

if (fallos > 0) { console.error(`\n${fallos} prueba(s) fallaron.`); process.exit(1); }
console.log("\nTodas las pruebas pasaron.");
