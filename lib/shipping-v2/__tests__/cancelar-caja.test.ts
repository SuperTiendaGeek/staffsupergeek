/**
 * Cancelar caja (punto 10a, C-5 · decisiones 1a y 2a del 16-oct-2026).
 * Ejecutar: npx tsx lib/shipping-v2/__tests__/cancelar-caja.test.ts
 */
import { camposArticuloFueraDeCaja, evaluarCancelarCaja } from "../cancelar-caja";
import { SHIPPING_V2_ITEM_FIELDS as F } from "../schema.generated";

let fallos = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { fallos++; console.error("✗", msg); } else console.log("✓", msg);
}
const base = { esAdministrador: true, motivo: "No se envía esta caja", pagosLogisticaVivos: [] };
const ok = (estado: string, extra: Partial<Parameters<typeof evaluarCancelarCaja>[0]> = {}) =>
  evaluarCancelarCaja({ ...base, estado, ...extra }).ok;

console.log("— Etapas —");
assert(ok("En Proceso"), "Armando: se cancela");
assert(ok("Cerrado"), "Cerrada sin despachar: se cancela");
for (const e of ["En tránsito", "Recibido", "En revisión", "Con novedad", "Cerrado final"]) {
  assert(!ok(e), `${e}: no se cancela (si se perdió, novedad Extraviado)`);
}
assert(!ok("Cancelado"), "Ya cancelada: no");

console.log("\n— Quién y con qué —");
assert(!ok("Cerrado", { esAdministrador: false }), "Solo Administrador");
assert(!ok("Cerrado", { motivo: "  " }), "Motivo obligatorio");

console.log("\n— Pagos de logística (2a) —");
const conPago = evaluarCancelarCaja({ ...base, estado: "Cerrado", pagosLogisticaVivos: [{ concepto: "Flete", total: 85, referencia: "PAY-1" }] });
assert(!conPago.ok, "Con un flete pagado no se cancela");
assert(!conPago.ok && conPago.motivo.includes("Flete $85.00"), "El mensaje dice qué pago anular");

console.log("\n— Lo que se escribe en cada artículo —");
const campos = camposArticuloFueraDeCaja("Admin", "2026-10-17T00:00:00.000Z");
assert(campos[F.estadoItem] === "Pendiente de packing", "Queda pendiente de caja");
assert(campos[F.requierePacking] === true, "Sigue requiriendo caja");
assert(campos[F.fleteAsignadoRegistro] === null && campos[F.arancelAsignadoRegistro] === null && campos[F.otrosCostosAsignadosRegistro] === null, "Deja de cargar los costos de esa caja");
assert(campos[F.unidadesEnPacking] === null, "Sin unidades en esa caja");

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo bien.");
