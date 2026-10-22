/**
 * Punto 10b-5 (Shipping V2): vender la unidad exacta y los lotes del más antiguo.
 * Ejecutar: npx tsx lib/facturacion/__tests__/productos.unidadesSerie.test.ts
 */
import { buildShippingItemsProductFilterFormula, mapShippingItemProductRecord, ordenarYDetallarProductos, type ProductoCatalogo } from "../airtable/productosShippingItems";
import { camposLineaDesdeProducto, descripcionDeProducto } from "../lineaDesdeProductoCatalogo";
import { evaluarVentaItem } from "../../shipping-v2/item-venta";

let fallos = 0;
function assert(condicion: unknown, mensaje: string) {
  if (condicion) console.log(`✓ ${mensaje}`);
  else { fallos++; console.error(`✗ ${mensaje}`); }
}

console.log("\n— Buscador —");
const venta = buildShippingItemsProductFilterFormula("7hx2kq3");
assert(venta.includes(`LOWER(SUBSTITUTE({Número de serie}&""," ",""))`), "Escanear la serie encuentra la unidad");
assert(venta.includes(`LOWER({SKUs anteriores}&"")`), "Escanear la etiqueta vieja de un SKU fusionado encuentra el producto");
assert(!venta.includes("{Seguimiento}"), "La serie no es requisito para vender (dueño, 18-oct)");

const reg = (id: string, campos: Record<string, unknown>) => mapShippingItemProductRecord({ id, fields: { SKU: "LAP-000500", "Nombre del item": "Dell Latitude 5420", "Precio venta final": 390, Cantidad: 1, Unidad: "Unidad", ...campos } });
const laptop = reg("rec1", { "Número de serie": "7hx2kq3", Seguimiento: "Unidad", Categoría: "Laptop" }) as ProductoCatalogo;
assert(laptop.numeroSerie === "7HX2KQ3" && laptop.seguimiento === "Unidad", "Lee la serie y el seguimiento");

console.log("\n— Orden y detalle —");
const cable = (id: string, fecha: string) => ({ ...(mapShippingItemProductRecord({ id, fields: { SKU: "CAB-000010", "Nombre del item": "Cable USB-C", "Precio venta final": 8, Cantidad: 5, Categoría: "Cable", "Fecha de registro": fecha } }) as ProductoCatalogo) });
const lista = ordenarYDetallarProductos([cable("c2", "2026-10-05T10:00:00Z"), laptop, cable("c1", "2026-08-05T10:00:00Z")]);
assert(lista[0].id === "c1" && lista[1].id === "c2", "Los lotes del mismo SKU, el más antiguo primero");
assert(lista[0].detalle?.includes("más antiguo") && !lista[1].detalle?.includes("más antiguo"), "Se marca el más antiguo");
assert(lista[2].detalle === "S/N 7HX2KQ3", "La unidad muestra su serie");
const solo = ordenarYDetallarProductos([cable("c9", "2026-08-05T10:00:00Z")]);
assert(!solo[0].detalle, "Un solo lote: sin etiqueta");

console.log("\n— Factura —");
assert(descripcionDeProducto(laptop) === "Dell Latitude 5420 S/N 7HX2KQ3", "La línea lleva la serie");
assert(camposLineaDesdeProducto(laptop).descripcion === "Dell Latitude 5420 S/N 7HX2KQ3", "También al agregar en mostrador");
assert(descripcionDeProducto(lista[0]) === "Cable USB-C", "Un lote no lleva serie");

const sinSerie = ordenarYDetallarProductos([reg("rec2", { Seguimiento: "Unidad", Categoría: "Laptop" }) as ProductoCatalogo]);
assert(sinSerie[0].detalle === "sin serie" && descripcionDeProducto(sinSerie[0]) === "Dell Latitude 5420", "Unidad sin serie: se ve y se vende igual");

console.log("\n— Regla de venta —");
assert(evaluarVentaItem({ recibido: true, requiereInspeccion: false }).vendible === true, "Llegó y no pide inspección: se vende (la serie no se exige)");

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo bien.");
