/**
 * Cerrar, retroceder, eliminar y anular una Operación Comercial
 * (auditoría Shipping V2, punto 6 · 9-oct-2026).
 * Ejecutar: npx tsx lib/operaciones/__tests__/cierre.test.ts
 */
import { evaluarAnularPedido, evaluarCambioEstadoOperacion, evaluarEliminarOperacion, type ArticuloDelPedido } from "../cierre";

let fallos = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { fallos++; console.error("✗", msg); } else console.log("✓", msg);
}

console.log("— Cambiar estado a mano —");
assert(!evaluarCambioEstadoOperacion({ estadoActual: "Pedido", estadoNuevo: "Entregado" }).ok, "Entregado no se marca a mano");
assert(!evaluarCambioEstadoOperacion({ estadoActual: "Pedido", estadoNuevo: "Aprobado", articuloSku: "PAN-000001" }).ok, "Con artículo no se regresa a Aprobado (C-7)");
assert(!evaluarCambioEstadoOperacion({ estadoActual: "Pedido", estadoNuevo: "Rechazado", articuloSku: "PAN-000001" }).ok, "Con artículo no se rechaza por aquí: se anula eligiendo destino");
assert(evaluarCambioEstadoOperacion({ estadoActual: "Aprobado", estadoNuevo: "Cotizado" }).ok, "Sin artículo se puede regresar");
assert(evaluarCambioEstadoOperacion({ estadoActual: "Cotizado", estadoNuevo: "Rechazado" }).ok, "Sin artículo se puede rechazar");
assert(!evaluarCambioEstadoOperacion({ estadoActual: "Entregado", estadoNuevo: "Pedido" }).ok, "Entregado no se revierte a mano");

console.log("\n— Eliminar —");
assert(!evaluarEliminarOperacion({ articuloSku: "REP-000105" }).ok, "Con artículo no se elimina");
assert(evaluarEliminarOperacion({}).ok, "Sin artículo sí");

console.log("\n— Anular un pedido con artículo —");
const enCamino: ArticuloDelPedido = { sku: "REP-1", estado: "En tránsito", recibido: false, pagos: [], vendido: false };
assert(!evaluarAnularPedido({ articulo: enCamino, destino: null }).ok, "Hay que elegir destino");
assert(evaluarAnularPedido({ articulo: enCamino, destino: "stock" }).ok, "Queda como stock: siempre que no se haya vendido");
assert(evaluarAnularPedido({ articulo: enCamino, destino: "cancelar" }).ok, "En camino sin pago: se cancela la compra");
assert(!evaluarAnularPedido({ articulo: { ...enCamino, recibido: true }, destino: "cancelar" }).ok, "Ya llegó: no se cancela");
assert(!evaluarAnularPedido({ articulo: { ...enCamino, enPacking: true }, destino: "cancelar" }).ok, "En una caja: no se cancela");
assert(!evaluarAnularPedido({ articulo: { ...enCamino, pagos: [{ codigo: "PAY-1", estado: "Pendiente" }] }, destino: "cancelar" }).ok, "En un pago: no se cancela");
assert(!evaluarAnularPedido({ articulo: { ...enCamino, pagos: [{ codigo: "PAY-1", estado: "Pagado" }] }, destino: "cancelar" }).ok, "Pagado: no se cancela");
assert(evaluarAnularPedido({ articulo: { ...enCamino, pagos: [{ codigo: "PAY-1", estado: "Pagado" }] }, destino: "stock" }).ok, "Pagado: sí queda como stock");
assert(!evaluarAnularPedido({ articulo: { ...enCamino, vendido: true }, destino: "stock" }).ok, "Ya facturado: se anula el documento");
assert(evaluarAnularPedido({ articulo: { ...enCamino, estado: "Cancelado" }, destino: null }).ok, "Compra ya cancelada: se anula sin preguntar");
assert(!evaluarAnularPedido({ desdeOrden: "OR000491", articulo: enCamino, destino: "stock" }).ok, "Repuesto de una orden: se anula desde la orden");
assert(evaluarAnularPedido({ articulo: null, destino: null }).ok, "Sin artículo: se anula directo");

if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1); }
console.log("\nTodo bien.");
