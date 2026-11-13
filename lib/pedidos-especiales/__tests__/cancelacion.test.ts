/**
 * Test — cancelar un pedido especial (punto 10C-3a).
 * Ejecutar: npm test cancelacion
 */
import { CONDICIONES_COMPRA, cargosDelPedido, casoDeCancelacion, planDeCancelacion, totalCargosDelPedido } from "../cancelacion";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

// ─── Cargos propios ──────────────────────────────────────────────────────────
const c = cargosDelPedido("recP", { "Recargo por no retiro": 8, "Gastos de cancelación": 12 });
assert(c.length === 2 && c[0].id === "recargo:recP" && c[0].facturable && c[1].id === "gastos:recP" && !c[1].facturable,
  "recargo (va en la factura) y gastos (sin factura)");
assert(totalCargosDelPedido(c) === 20, "suman a la cuenta");
assert(cargosDelPedido("recP", {}).length === 0 && cargosDelPedido("recP", { "Recargo por no retiro": 0 }).length === 0, "sin valores, sin cargos");

// ─── Casos ───────────────────────────────────────────────────────────────────
assert(casoDeCancelacion(false, null) === "sin_confirmar", "sin confirmar: no se pregunta al proveedor");
assert(casoDeCancelacion(true, true) === "proveedor_acepta" && casoDeCancelacion(true, false) === "proveedor_no_acepta", "confirmado: según el proveedor");
assert(casoDeCancelacion(true, null) === null, "confirmado sin respuesta: falta el dato");

const base = { estado: "Aceptado", motivo: "Ya no lo necesita", confirmado: false, esStaffOAdmin: false, pagado: 80 };

// (a)
const a1 = planDeCancelacion({ ...base, destino: "devolver" });
assert(a1.ok && a1.plan.devolver === 80 && a1.plan.saldoAFavor === 0 && !a1.plan.articuloAStock, "(a) cualquier empleado: se devuelven $80");
const a2 = planDeCancelacion({ ...base, destino: "saldo_a_favor" });
assert(a2.ok && a2.plan.saldoAFavor === 80, "(a) o saldo a favor si el cliente prefiere");
const a3 = planDeCancelacion({ ...base });
assert(!a3.ok && a3.motivo === "Elige si se devuelve o queda como saldo a favor.", "(a) con dinero: hay que elegir");
const a4 = planDeCancelacion({ ...base, pagado: 0 });
assert(a4.ok && a4.plan.devolver === 0, "(a) sin pagos: se cancela sin más");

// (b)
const confirmado = { ...base, confirmado: true, esStaffOAdmin: true };
const b1 = planDeCancelacion({ ...confirmado, proveedorAcepta: true, gastos: 12, tienePrueba: true, destino: "devolver" });
assert(b1.ok && b1.plan.gastos === 12 && b1.plan.devolver === 68 && b1.plan.articuloAlProveedor, "(b) gastos $12 con prueba: se devuelven $68");
const b2 = planDeCancelacion({ ...confirmado, proveedorAcepta: true, gastos: 12, destino: "devolver" });
assert(!b2.ok && b2.motivo === "Adjunta la prueba de los gastos.", "(b) gastos sin prueba: no");
const b3 = planDeCancelacion({ ...confirmado, proveedorAcepta: true, gastos: 90, tienePrueba: true, destino: "devolver" });
assert(!b3.ok && b3.motivo === "Los gastos no pueden pasar de lo pagado.", "(b) gastos mayores a lo pagado: no");
const b4 = planDeCancelacion({ ...confirmado, proveedorAcepta: true, gastos: 80, tienePrueba: true });
assert(b4.ok && b4.plan.devolver === 0 && b4.plan.gastos === 80, "(b) gastos = todo lo pagado: no hay nada que devolver");

// (c)
const c1 = planDeCancelacion({ ...confirmado, proveedorAcepta: false });
assert(c1.ok && c1.plan.saldoAFavor === 80 && c1.plan.devolver === 0 && c1.plan.articuloAStock, "(c) todo a saldo a favor y el artículo a la tienda");

// Permisos y estados
assert(planDeCancelacion({ ...confirmado, esStaffOAdmin: false, proveedorAcepta: false }).ok === false, "(b)/(c) un técnico no");
const sinRespuesta = planDeCancelacion({ ...confirmado, proveedorAcepta: null, destino: "devolver" });
assert(!sinRespuesta.ok && sinRespuesta.motivo === "Indica si el proveedor acepta cancelar.", "confirmado: hay que decir si el proveedor acepta");
assert(!planDeCancelacion({ ...base, motivo: " ", destino: "devolver" }).ok, "sin motivo: no");
assert(!planDeCancelacion({ ...base, estado: "Entregado", destino: "devolver" }).ok, "entregado: no se cancela");

// Texto del dueño
assert(CONDICIONES_COMPRA.secciones[0].puntos[0].startsWith("Antes de confirmarlo con el proveedor"), "condiciones: «antes de confirmarlo con el proveedor»");
assert(!JSON.stringify(CONDICIONES_COMPRA).includes("antes de que lo compremos"), "condiciones: sin «antes de que lo compremos»");

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo OK");
