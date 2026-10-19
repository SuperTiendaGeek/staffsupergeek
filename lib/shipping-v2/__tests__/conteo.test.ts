/**
 * Conteo físico (punto 10c-2): leer códigos y comparar con el sistema.
 * Ejecutar: npx tsx lib/shipping-v2/__tests__/conteo.test.ts
 */
import { buscarParaContar, compararConteo, entraEnConteo, fotoInicial, indiceCiego, leerCodigo, totalContado, type ItemConteo, type LineaConteo } from "../conteo";

let fallos = 0;
function assert(condicion: unknown, mensaje: string) {
  if (condicion) console.log(`✓ ${mensaje}`);
  else { fallos++; console.error(`✗ ${mensaje}`); }
}

const u = (id: string, serie: string, extra: Partial<ItemConteo> = {}): ItemConteo => ({
  id, sku: "LAP-000500", nombre: "Dell Latitude 5420", categoria: "Laptop", estado: "Disponible", cantidad: 1, recibido: true, usoLocal: false,
  seguimiento: "Unidad", numeroSerie: serie, costoUnidad: 231, ultimaActualizacion: "2026-10-10T12:00:00Z", ...extra,
});
const lote: ItemConteo = { ...u("l1", ""), sku: "OTR-000028", nombre: "Cable USB-C a Lightning", categoria: "Cable", cantidad: 2, seguimiento: "", costoUnidad: 4.2 };
const items: ItemConteo[] = [
  u("a", "7HX2KQ3"), u("b", "8PL4QR1"), u("c", "5ZT9MN2"), u("d", "3KD7PW1"),
  u("v", "9VEND01", { estado: "Vendido", cantidad: 0 }),
  u("x", "AAA111", { sku: "DES-000037", nombre: "Dell OptiPlex 7070", categoria: "Desktop" }),
  u("s", "SOLO01", { sku: "LAP-000102", nombre: "HP Zbook" }),
  u("m", "", { sku: "MON-000001", categoria: "Monitor", nombre: "Monitor Dell" }),
  lote,
  u("act", "ACT1", { sku: "ACT-000001", usoLocal: true, nombre: "Impresora de la tienda" }),
];
const alcance = { categorias: ["Laptop", "Cable"], incluyeActivos: false };
const linea = (id: string, x: Partial<LineaConteo>): LineaConteo => ({ id, codigo: "", sku: "", serie: "", cantidad: 1, tipo: "Unidad", contadoPor: "Juan", fecha: "2026-10-18T15:00:00Z", anulada: false, ...x });

console.log("\n— Qué entra —");
assert(entraEnConteo(items[0], alcance) && !entraEnConteo(items[4], alcance) && !entraEnConteo(items[5], alcance), "Laptop a la venta sí; vendida y otra categoría no");
assert(!entraEnConteo(items[9], alcance) && entraEnConteo(items[9], { ...alcance, incluyeActivos: true }), "Activos solo si se eligen");

console.log("\n— Leer un código —");
let l = leerCodigo("7hx2kq3", items, []);
assert(l.tipo === "unidad" && l.item.id === "a", "La serie (en minúsculas) identifica la unidad");
l = leerCodigo("7HX2KQ3", items, [linea("1", { itemId: "a", sku: "LAP-000500", contadoPor: "Graciela" })]);
assert(l.tipo === "ya-contada" && l.por === "Graciela", "Serie ya contada: avisa quién");
l = leerCodigo("LAP-000500", items, [linea("1", { itemId: "a", sku: "LAP-000500" })]);
assert(l.tipo === "elegir" && l.opciones.length === 3 && l.contadas.length === 1, "SKU con varias unidades: elegir entre las no contadas");
l = leerCodigo("LAP-000102", items, []);
assert(l.tipo === "unidad" && l.item.id === "s", "SKU con una sola unidad: directo");
l = leerCodigo("OTR-000028", items, []);
assert(l.tipo === "lote", "SKU de un lote: suma por cantidad");
l = leerCodigo("XYZ-999", items, []);
assert(l.tipo === "sin-registro" && l.codigo === "XYZ-999", "Código que no existe");
l = leerCodigo("9VEND01", items, []);
assert(l.tipo === "unidad" && l.item.id === "v", "Algo vendido se reconoce (saldrá como sobrante, no sin registro)");
assert(buscarParaContar("latitude 5420", items).length === 4 && buscarParaContar("cable lightning", items).length === 1, "Búsqueda manual: unidades por separado, el lote una vez");

console.log("\n— Comparar —");
const lineas: LineaConteo[] = [
  linea("1", { itemId: "a", sku: "LAP-000500" }),
  linea("2", { itemId: "b", sku: "LAP-000500" }),
  linea("3", { sku: "LAP-000500", tipo: "Sin identificar" }),
  linea("4", { itemId: "v", sku: "LAP-000500" }),
  linea("5", { itemId: "l1", sku: "OTR-000028", tipo: "Lote", cantidad: 3 }),
  linea("6", { codigo: "5CG1234XYZ", tipo: "Sin registro" }),
  linea("7", { itemId: "s", sku: "LAP-000102" }),
  linea("8", { itemId: "s", sku: "LAP-000102", anulada: true }),
];
let r = compararConteo({ items, lineas, alcance, inicio: "2026-10-18T14:00:00Z" });
const lap = r.faltan.find((f) => f.sku === "LAP-000500");
assert(lap?.faltan.length === 1 && lap.sinIdentificar === 1, "LAP-000500: 4 en sistema, 2 por serie + 1 sin identificar → falta 1");
assert(r.sobran.find((f) => f.sku === "LAP-000500")?.sobran[0]?.id === "v", "La unidad vendida que se contó sobra");
const cab = r.sobran.find((f) => f.sku === "OTR-000028");
assert(cab?.sistema === 2 && cab.contado === 3 && Math.abs(cab.valor - 4.2) < 0.001, "OTR-000028: sistema 2, contados 3, +$4,20");
assert(r.coinciden.some((f) => f.sku === "LAP-000102"), "La lectura anulada no cuenta dos veces");
assert(r.sinRegistro[0]?.codigo === "5CG1234XYZ", "Sin registro");
assert(!r.faltan.some((f) => f.sku === "DES-000037") && !r.faltan.some((f) => f.sku === "ACT-000001"), "Lo que no entra en el conteo no falta");
assert(totalContado(lineas) === 9, "Total contado (lo único que ve el Staff)");

const conVenta = items.map((i) => (i.id === "c" ? { ...i, estado: "Vendido", cantidad: 0, ultimaActualizacion: "2026-10-18T15:30:00Z" } : i));
r = compararConteo({ items: conVenta, lineas: lineas.filter((x) => x.id !== "3"), alcance, inicio: "2026-10-18T14:00:00Z" });
assert(r.cambiaron.some((x) => x.item.id === "c") && r.faltan.find((f) => f.sku === "LAP-000500")?.faltan.map((i) => i.id).join() === "d", "Vendida durante el conteo: va a \"Cambió al contar\", no falta");

const foto = fotoInicial(items, alcance);
r = compararConteo({ items: conVenta.map((i) => ({ ...i, ultimaActualizacion: "2026-10-18T16:00:00Z" })), lineas: lineas.filter((x) => x.id !== "3"), alcance, inicio: "2026-10-18T14:00:00Z", foto });
assert(r.cambiaron.length === 1 && r.cambiaron[0].item.id === "c", "Con la foto inicial, solo cuenta como cambio lo que cambió de cantidad o estado (no cualquier edición)");

const ciego = indiceCiego(items);
assert(ciego.every((i) => i.costoUnidad === null && !i.ultimaActualizacion && i.cantidad <= 2), "El índice del conteo no muestra costo ni cantidades");
assert(leerCodigo("OTR-000028", ciego, []).tipo === "lote" && leerCodigo("LAP-000500", ciego, []).tipo === "elegir", "Con el índice ciego el lector reconoce igual lotes y unidades");

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo bien.");
