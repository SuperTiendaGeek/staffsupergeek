/**
 * Test — entregar un pedido especial (punto 10C-2).
 * Ejecutar: npm test pedidos-especiales/__tests__/entrega
 */
import { evaluarEntregaPedido, notaDeEntrega, type ArticuloParaEntrega } from "../entrega";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const kindle: ArticuloParaEntrega = { id: "recL", descripcion: "Kindle Paperwhite", llego: true, detalle: "" };
const factura = { tipo: "factura" as const, numero: "001-002-000000830" };

// Luis: llegó, debe $80, sin documento.
const a = evaluarEntregaPedido({ estado: "Aceptado", saldo: 80, total: 160, documento: null, articulos: [kindle] });
assert(a.revisiones.map((r) => r.clave).join(",") === "llego,cobro,documento", "tres revisiones, en el orden de la maqueta");
assert(a.revisiones[0].ok && a.revisiones[0].texto === "Llegó a la tienda", "llegó: ok");
assert(!a.revisiones[1].ok && a.revisiones[1].texto === "Falta cobrar $80.00", "falta cobrar $80 (la misma regla de la orden)");
assert(!a.revisiones[2].ok && a.revisiones[2].texto === "Falta emitir la factura o el recibo", "falta el documento");
assert(!a.puedeEntregar, "no se entrega todavía");

// Pagado y facturado: falta solo quién retira.
const b = evaluarEntregaPedido({ estado: "Aceptado", saldo: 0, total: 160, documento: factura, articulos: [kindle], datos: { retiradoPor: " " } });
assert(b.revisiones.every((r) => r.ok), "todo en verde");
assert(b.faltas.join() === "Escribe quién retira.", "sin nombre de quien retira no se entrega");
const c = evaluarEntregaPedido({ estado: "Aceptado", saldo: 0, total: 160, documento: factura, articulos: [kindle], datos: { retiradoPor: "Luis Andrade" } });
assert(c.puedeEntregar, "con todo listo, se entrega");

// No llegó.
const d = evaluarEntregaPedido({ estado: "Aceptado", saldo: 0, total: 160, documento: null, articulos: [{ ...kindle, llego: false, detalle: "En camino" }] });
assert(d.revisiones[0].texto === "Aún no llega · En camino" && !d.puedeEntregar, "aún no llega: dice por qué");
const e = evaluarEntregaPedido({ estado: "Aceptado", saldo: 0, total: 200, documento: null, articulos: [{ ...kindle, llego: false, detalle: "" }, { ...kindle, id: "x", llego: false, detalle: "" }] });
assert(e.revisiones[0].texto === "Aún no llegan 2 artículos", "varios sin llegar");

// Sobra dinero, estados.
const f = evaluarEntregaPedido({ estado: "Aceptado", saldo: -5, total: 160, documento: factura, articulos: [kindle] });
assert(f.revisiones[1].texto.startsWith("Sobran $5.00"), "si sobra, se resuelve antes (saldo a favor o devolver)");
assert(evaluarEntregaPedido({ estado: "Entregado", saldo: 0, total: 160, documento: factura, articulos: [kindle] }).faltas[0] === "El pedido ya está entregado.", "entregado: no otra vez");
assert(evaluarEntregaPedido({ estado: "Esperando al cliente", saldo: 0, total: 0, documento: null, articulos: [] }).faltas[0] === 'El pedido está "Esperando al cliente": no se entrega.', "sin aceptar: no");
assert(evaluarEntregaPedido({ estado: "Aceptado", saldo: 0, total: 0, documento: null, articulos: [] }).revisiones[0].texto === "No hay nada aceptado para entregar", "sin líneas aceptadas: no");

assert(notaDeEntrega(" Luis Andrade ", " Caja sellada ") === "Entregado. Retira: Luis Andrade. Caja sellada", "nota del historial");
assert(notaDeEntrega("Luis") === "Entregado. Retira: Luis.", "nota sin observación");

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo OK");
