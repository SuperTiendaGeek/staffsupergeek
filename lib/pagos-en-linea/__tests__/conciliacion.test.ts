/**
 * Test — revisión automática de pagos en línea (etapa D2, Codex punto 2). Sin red.
 * Ejecutar: npm test pagos-en-linea
 */
import { ordenarParaConciliar, porConciliar, type IntentoParaConciliar } from "../conciliacion-reglas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}
const ahora = new Date("2026-11-26T20:00:00Z");
const hace = (h: number) => new Date(ahora.getTime() - h * 3_600_000).toISOString();
const i = (o: Partial<IntentoParaConciliar>): IntentoParaConciliar => ({
  codigo: "PL-1", pasarela: "DeUna", estado: "Abierto", idTransaccion: "tx", creado: hace(1), pedidoId: null, ordenId: "recOrden", ...o,
});

assert(porConciliar(i({}), ahora), "DeUna abierto de hace 1 h (el cliente cerró la página) → se revisa");
assert(porConciliar(i({ estado: "Vencido", creado: hace(30) }), ahora), "DeUna marcado vencido hace 30 h → se revisa (pudo pagarse al final)");
assert(!porConciliar(i({ creado: hace(49) }), ahora), "DeUna abierto de hace 49 h → ya no");
assert(porConciliar(i({ estado: "Aprobado", creado: hace(24 * 20) }), ahora), "aprobado SIN abono de hace 20 días → se reintenta (dinero real)");
assert(!porConciliar(i({ estado: "Aprobado", creado: hace(24 * 31) }), ahora), "aprobado de hace 31 días → ya no (lo ve el personal)");
assert(!porConciliar(i({ idTransaccion: "" }), ahora), "sin ID (DeUna no generó el cobro) → nada que preguntar");
assert(!porConciliar(i({ pedidoId: null, ordenId: null, estado: "Aprobado" }), ahora), "sin orden ni pedido (bandeja) → no lo toca la revisión");
for (const e of ["Aplicado", "En revisión", "Rechazado", "Por asignar", "No corresponde"] as const) {
  assert(!porConciliar(i({ estado: e }), ahora), `"${e}" → no se vuelve a tocar`);
}
assert(porConciliar(i({ pasarela: "PayPhone", estado: "Abierto" }), ahora), "PayPhone que volvió sin confirmar → se revisa");
assert(!porConciliar(i({ pasarela: "PayPhone", estado: "Vencido" }), ahora), "PayPhone vencido → no (PayPhone reversa a los 5 min)");
const orden = ordenarParaConciliar([i({ codigo: "A", creado: hace(2) }), i({ codigo: "B", estado: "Aprobado", creado: hace(1) }), i({ codigo: "C", creado: hace(5) })]);
assert(orden.map((x) => x.codigo).join("") === "BCA", "primero los aprobados (dinero confirmado), luego los más viejos");

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo bien.");
