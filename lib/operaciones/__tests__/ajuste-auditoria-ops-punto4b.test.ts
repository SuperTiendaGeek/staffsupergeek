/**
 * Test — ajuste de datos del punto 4B: OR000423 (servicio −$20 → descuento).
 * Ejecutar: npm test ajuste-auditoria-ops-punto4b
 */
import { CASO_OR000423 as C, planOR000423, type LecturaItem, type LecturaServicio } from "../ajuste-auditoria-ops-punto4b";
import { calcularEstadoCuenta } from "../../estado-cuenta/reglas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const servicio = (o: Partial<LecturaServicio> = {}): LecturaServicio => ({
  existe: true, costo: -20, ordenIds: [C.ordenId], observacion: "nota", fecha: "2026-08-18T17:00:00.000Z", ...o,
});
const ssd = (o: Partial<LecturaItem> = {}): LecturaItem => ({
  existe: true, sku: C.ssdSku, nombre: "Disco Duro Sólido Interno 120GB", precio: 40, ordenStockIds: [C.ordenId], ...o,
});

{
  const p = planOR000423({ servicio: servicio(), ssd: ssd(), descuentosDeLaOrden: [] });
  assert(p.bloqueos.length === 0 && p.acciones.map((a) => a.tipo).join() === "crear-descuento,eliminar-servicio", "primero crea el descuento, después borra el servicio negativo");
  const crear = p.acciones[0];
  assert(crear.tipo === "crear-descuento" && crear.campos["Monto"] === 20 && crear.campos["Cargo ID"] === C.ssdId && crear.campos["Estado"] === "Vigente", "descuento de $20 vigente sobre el SSD");
}
assert(planOR000423({ servicio: servicio(), ssd: ssd(), descuentosDeLaOrden: [{ cargoId: C.ssdId, estado: "Vigente", monto: 20 }] }).acciones.map((a) => a.tipo).join() === "eliminar-servicio", "si el descuento ya se creó, solo falta borrar el servicio");
assert(planOR000423({ servicio: servicio({ existe: false }), ssd: ssd(), descuentosDeLaOrden: [{ cargoId: C.ssdId, estado: "Vigente", monto: 20 }] }).acciones.length === 0, "ya aplicado → 0 acciones");
assert(planOR000423({ servicio: servicio({ costo: -15 }), ssd: ssd(), descuentosDeLaOrden: [] }).bloqueos.length === 1, "si el servicio cambió de monto → se bloquea");
assert(planOR000423({ servicio: servicio(), ssd: ssd({ precio: 45 }), descuentosDeLaOrden: [] }).bloqueos.length === 1, "si el SSD cambió de precio → se bloquea");
assert(planOR000423({ servicio: servicio(), ssd: ssd({ ordenStockIds: [] }), descuentosDeLaOrden: [] }).bloqueos.length === 1, "si el SSD ya no está en la orden → se bloquea");

// El total de la orden no cambia: antes $130 de cargos − $20 de servicio negativo;
// después $130 de cargos (el rollup ya no incluye el −$20) − $20 de descuento.
{
  const antes = calcularEstadoCuenta({ cargos: { servicios: 25 - 20, productosDigitales: 0, repuestosHistoricos: 0, items: [{ id: C.ssdId, precio: 40 }, { id: "recRAM", precio: 30 }], aprobadoSinArticulo: [], descuentos: [], cargosExistentes: new Set([C.ssdId, "recRAM"]) }, abonos: [] });
  const despues = calcularEstadoCuenta({ cargos: { servicios: 25, productosDigitales: 0, repuestosHistoricos: 0, items: [{ id: C.ssdId, precio: 40 }, { id: "recRAM", precio: 30 }], aprobadoSinArticulo: [], descuentos: [{ cargoId: C.ssdId, monto: 20, estado: "Vigente" }], cargosExistentes: new Set([C.ssdId, "recRAM"]) }, abonos: [] });
  assert(antes.totalCuenta === despues.totalCuenta, `el total de la cuenta no cambia (${antes.totalCuenta} = ${despues.totalCuenta})`);
}

if (fallos > 0) { console.error(`\n${fallos} prueba(s) fallaron.`); process.exit(1); }
console.log("\nTodas las pruebas pasaron.");
