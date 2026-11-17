/**
 * Test — limpieza de un pedido de PRUEBA de pagos en línea (punto 23 / 10D).
 * Ejecutar: npm test limpieza-prueba
 */
import { planLimpiezaPrueba, type AbonoLeido, type EstadoPedidoPrueba } from "../limpieza-prueba";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const OP = "OP-2026-000140";
const abono = (o: Partial<AbonoLeido>): AbonoLeido => ({
  id: "recA", idAbono: 341, monto: 75, metodo: "PayPhone", estado: "Registrado",
  observacion: "PRUEBA PayPhone (no es dinero real) · PL-000001 · Visa ···· 4891", movimientoId: null, ...o,
});
const pedido = (o: Partial<EstadoPedidoPrueba>): EstadoPedidoPrueba => ({
  codigo: OP, estado: "Pedido confirmado",
  abonos: [abono({}), abono({ id: "recB", idAbono: 342, observacion: "PRUEBA PayPhone (no es dinero real) · PL-000004" })],
  solicitudes: [{ codigo: "SOL-000050", estado: "Por comprar" }], ...o,
});

// Caso de hoy: dos abonos de prueba + pedido confirmado → 3 pasos.
const hoy = planLimpiezaPrueba(pedido({}), OP);
assert(hoy.bloqueos.length === 0, "OP-140 de prueba: sin bloqueos");
assert(hoy.pasos.length === 3, "anula 2 abonos y cancela el pedido");
assert(hoy.pasos[2].tipo === "cancelar_pedido" && hoy.pasos[2].texto.includes("SOL-000050"), "el último paso cancela el pedido y nombra la solicitud");

// Después de aplicar → 0 pasos (la vista previa queda en 0).
const despues = planLimpiezaPrueba(pedido({ estado: "Cancelado", abonos: [abono({ estado: "Anulado" }), abono({ id: "recB", estado: "Anulado" })], solicitudes: [{ codigo: "SOL-000050", estado: "Cancelada" }] }), OP);
assert(despues.bloqueos.length === 0 && despues.pasos.length === 0, "ya limpio: 0 acciones");

// Protecciones: nunca toca dinero real ni otro pedido.
assert(planLimpiezaPrueba(pedido({ abonos: [abono({ observacion: "Pago en línea PayPhone · PL-000009" })] }), OP).bloqueos.length === 1, "abono PayPhone real → se detiene");
assert(planLimpiezaPrueba(pedido({ abonos: [abono({ metodo: "Transferencia", observacion: "" })] }), OP).bloqueos.length === 1, "transferencia → se detiene");
assert(planLimpiezaPrueba(pedido({ abonos: [abono({ movimientoId: "recMov" })] }), OP).bloqueos.length === 1, "abono de prueba con movimiento en Finanzas → se detiene");
assert(planLimpiezaPrueba(pedido({ solicitudes: [{ codigo: "SOL-000050", estado: "Comprada" }] }), OP).bloqueos.length === 1, "compra ya hecha → se detiene");
assert(planLimpiezaPrueba(pedido({ codigo: "OP-2026-000141" }), OP).bloqueos.length === 1, "otro pedido → se detiene");
assert(planLimpiezaPrueba(pedido({ estado: "Entregado" }), OP).bloqueos.length === 1, "pedido entregado → se detiene");
const conBloqueo = planLimpiezaPrueba(pedido({ abonos: [abono({}), abono({ id: "recR", metodo: "Efectivo", observacion: "" })] }), OP);
assert(conBloqueo.pasos.length === 0, "con un bloqueo no se propone ningún paso");
// Un abono real ya anulado no estorba.
assert(planLimpiezaPrueba(pedido({ abonos: [abono({}), abono({ id: "recX", metodo: "Efectivo", observacion: "", estado: "Anulado" })] }), OP).bloqueos.length === 0, "abono real ya anulado: no bloquea");

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo bien.");
