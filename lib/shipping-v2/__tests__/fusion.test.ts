/**
 * Fusionar SKU (punto 10c-3).
 * Ejecutar: npx tsx lib/shipping-v2/__tests__/fusion.test.ts
 */
import { agruparProductos, planFusion, sugerirPrincipal, type RegistroFusion } from "../fusion";

let fallos = 0;
function assert(condicion: unknown, mensaje: string) {
  if (condicion) console.log(`✓ ${mensaje}`);
  else { fallos++; console.error(`✗ ${mensaje}`); }
}

const r = (id: string, sku: string, x: Partial<RegistroFusion> = {}): RegistroFusion => ({
  id, sku, nombre: "Kit Botellas Epson T544 4 Colores", categoria: "Repuesto", estado: "Disponible", cantidad: 1, recibido: true,
  usoLocal: false, seguimiento: "", condicion: "Nuevo", numeroSerie: "", precio: 49, costoUnidad: 28.9, documentos: 0, skusAnteriores: [],
  ultimaActualizacion: "2026-10-17T00:00:00Z", ...x,
});

// El caso real del T544.
const t544 = [
  r("rec13", "REP-000043", { cantidad: 2 }),
  r("rec2m", "ACC-000170", { nombre: "KIT BOTELLAS EPSON T544 4 COLORES BLACK-CYAN-MAGENTA-YELLOW", categoria: "Accesorio", estado: "Vendido", cantidad: 0, precio: 48, costoUnidad: 37.48, documentos: 1 }),
  r("recEZ", "OTR-000214", { nombre: "PAQUETE PACK DE BOTELLAS DE TINTA EPSON T544", categoria: "Otro", estado: "Vendido", cantidad: 0, condicion: "Usado", costoUnidad: 37.48, documentos: 1 }),
];
let productos = agruparProductos(t544);
assert(productos.length === 3 && sugerirPrincipal(productos) === "REP-000043", "T544: sugiere como principal el que tiene unidades en la tienda");
let plan = planFusion(productos, "REP-000043");
assert(plan.ok && plan.cambios.length === 2 && plan.etiquetas === 0, "T544: se mueven 2 registros vendidos; no hay etiquetas que reimprimir");
if (plan.ok) {
  const acc = plan.cambios.find((c) => c.id === "rec2m")!;
  assert(acc.campos.sku === "REP-000043" && acc.campos.categoria === "Repuesto" && acc.campos.skusAnteriores.join() === "ACC-000170", "Vendido: cambia SKU y categoría y guarda el código viejo");
  assert(acc.campos.nombre === undefined && acc.campos.precio === undefined, "Vendido: el nombre y el precio quedan como se vendió");
}
assert(planFusion(productos, "ACC-000170").ok, "Un principal sin unidades también sirve si es igual");
const usado = planFusion(productos, "OTR-000214");
assert(!usado.ok && usado.motivo.includes("Nuevo"), "Si el principal dice Usado y lo de la tienda es Nuevo, no se junta");

// En la tienda: toma nombre y precio del principal.
productos = agruparProductos([
  r("a", "MON-000005", { nombre: "Monitor Dell P2219H c/ cable", categoria: "Monitor", seguimiento: "Unidad", precio: 95 }),
  r("b", "MON-000006", { nombre: "Monitor Dell P2219H", categoria: "Monitor", seguimiento: "Unidad", precio: 90, skusAnteriores: ["MON-000099"] }),
]);
plan = planFusion(productos, "MON-000005");
assert(plan.ok && plan.etiquetas === 1, "Monitor en tienda: 1 etiqueta por reimprimir");
if (plan.ok) {
  const b = plan.cambios[0];
  assert(b.campos.nombre === "Monitor Dell P2219H c/ cable" && b.campos.precio === 95 && b.campos.categoria === undefined, "En tienda: toma nombre y precio del principal");
  assert(b.campos.skusAnteriores.join() === "MON-000099,MON-000006", "Conserva también los códigos anteriores que ya tenía");
  assert(plan.avisos.some((x) => x.includes("$90,00 a $95,00")), "Avisa el cambio de precio");
}

// Bloqueos.
assert(!planFusion(agruparProductos([r("a", "OTR-000001"), r("b", "OTR-000002", { usoLocal: true })]), "OTR-000001").ok, "No mezcla activo con mercadería");
assert(!planFusion(agruparProductos([r("a", "OTR-000001"), r("b", "OTR-000002", { condicion: "Usado" })]), "OTR-000001").ok, "No junta Nuevo con Usado en la tienda");
const lote = planFusion(agruparProductos([r("a", "LAP-000001", { categoria: "Laptop", seguimiento: "Unidad" }), r("b", "LAP-000002", { categoria: "Laptop", seguimiento: "Lote", cantidad: 3 })]), "LAP-000001");
assert(!lote.ok && lote.motivo.includes("sepáralo"), "Un lote de 3 no entra a un producto uno por uno");
const unoAlote = planFusion(agruparProductos([r("a", "CAB-000001", { categoria: "Cable", seguimiento: "Lote", cantidad: 5 }), r("b", "CAB-000002", { categoria: "Cable", seguimiento: "Unidad" })]), "CAB-000001");
assert(unoAlote.ok && unoAlote.cambios[0].campos.seguimiento === "Lote", "Una unidad suelta entra a un producto por lote como lote");
assert(!planFusion(agruparProductos([r("a", "OTR-000001")]), "OTR-000001").ok, "Hacen falta al menos dos productos");
assert(!planFusion(productos, "XXX-000001").ok, "El principal tiene que estar en la lista");

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo bien.");
