/**
 * Cómo vuelve un artículo al inventario (auditoría Shipping V2, punto 7).
 * Ejecutar: npx tsx lib/shipping-v2/__tests__/devoluciones.test.ts
 */
import { camposRetornoItem } from "../devoluciones";

let fallos = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { fallos++; console.error("✗", msg); } else console.log("✓", msg);
}

const laptopVendida = {
  "Estado Item": "Vendido", "Categoría": "Laptop", Cantidad: 0, "Cantidad Reservada": 0, Recibido: true,
  "Requiere inspección": true, "Revisado física/técnicamente": true, "Estado de revisión": "Recibido correctamente",
};
const cableVendido = { "Estado Item": "Vendido", "Categoría": "Cable", Cantidad: 0, Recibido: true, "Requiere inspección": false };

console.log("— Devolución del cliente (nota de crédito) —");
let c = camposRetornoItem(laptopVendida, { cantidad: 1, tipo: "devolucion", condicion: "buena" });
assert(c["Cantidad"] === 1 && c["Estado Item"] === "En revisión", "Laptop devuelta en buen estado → En revisión (su categoría pide inspección)");
assert(c["Revisado física/técnicamente"] === false && c["Estado de revisión"] === "Recibido pendiente de revisión", "…con la inspección reabierta");
assert(c["Disponible para venta"] === true, "…se puede reservar (vender exige firmar la inspección)");
c = camposRetornoItem(cableVendido, { cantidad: 1, tipo: "devolucion", condicion: "buena" });
assert(c["Estado Item"] === "Disponible" && c["Revisado física/técnicamente"] === undefined, "Cable devuelto en buen estado → directo a la venta");
c = camposRetornoItem(cableVendido, { cantidad: 1, tipo: "devolucion", condicion: "falla", notaFalla: "no carga", fecha: "2026-10-09" });
assert(c["Estado Item"] === "En revisión" && c["Requiere inspección"] === true, "Cable devuelto CON FALLA → En revisión siempre");
assert(String(c["Observaciones internas"]).includes("CON FALLA: no carga"), "…con la nota de la falla");
c = camposRetornoItem({ ...cableVendido, Cantidad: 4, "Estado Item": "Disponible", "Cantidad Reservada": 1 }, { cantidad: 1, tipo: "devolucion", condicion: "buena" });
assert(c["Cantidad"] === 5 && c["Cantidad Reservada"] === 1, "Devolución: la unidad vuelve libre (no se reaparta)");

console.log("\n— Anulación (error del documento) —");
c = camposRetornoItem(laptopVendida, { cantidad: 1, tipo: "anulacion", reapartar: false });
assert(c["Estado Item"] === "Disponible" && c["Revisado física/técnicamente"] === undefined, "Anular venta de mostrador: vuelve como estaba, sin reabrir inspección");
c = camposRetornoItem(laptopVendida, { cantidad: 1, tipo: "anulacion", reapartar: true });
assert(c["Cantidad Reservada"] === 1 && c["Reservado"] === true && c["Estado Item"] === "Reservado", "Anular factura de una orden/pedido/reserva: la unidad vuelve apartada");
assert(c["Disponible para venta"] === false, "…y no queda libre para vender");
c = camposRetornoItem({ ...cableVendido, Cantidad: 9, "Estado Item": "Disponible" }, { cantidad: 1, tipo: "anulacion", reapartar: true });
assert(c["Cantidad"] === 10 && c["Cantidad Reservada"] === 1 && c["Estado Item"] === undefined, "Con unidades libres: aparta 1 y la etiqueta no cambia");

console.log("\n— Bloqueos que se respetan (F-4) —");
c = camposRetornoItem({ ...laptopVendida, "Estado Item": "Con novedad", Cantidad: 1 }, { cantidad: 1, tipo: "anulacion" });
assert(c["Estado Item"] === undefined && c["Disponible para venta"] === false, "Con novedad abierta: sigue Con novedad y sin venta");
c = camposRetornoItem({ ...cableVendido, "Es uso local": true }, { cantidad: 1, tipo: "anulacion" });
assert(c["Estado Item"] === "Uso local" && c["Disponible para venta"] === false, "Un activo vuelve como activo, no a la venta");
c = camposRetornoItem({ ...laptopVendida, "Estado de revisión": "Dañado" }, { cantidad: 1, tipo: "devolucion", condicion: "falla" });
assert(c["Estado de revisión"] === "Dañado" && c["Disponible para venta"] === false, "Un veredicto de problema se respeta");

if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1); }
console.log("\nTodo bien.");
