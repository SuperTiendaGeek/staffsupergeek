/**
 * ✨ Sugerir (punto 10d-3): el pedido a Claude y la limpieza de la respuesta.
 * Ejecutar: npx tsx lib/shipping-v2/__tests__/ia-anuncios.test.ts
 */
import { construirPedido, datosParaIa, limpiarSugerencia } from "../ia-anuncios";
import type { DatosUnidadAnuncio } from "../publicaciones";

let fallos = 0;
function assert(condicion: unknown, mensaje: string) {
  if (condicion) console.log(`✓ ${mensaje}`);
  else { fallos++; console.error(`✗ ${mensaje}`); }
}

const u: DatosUnidadAnuncio = {
  id: "rec1", sku: "LAP-000700", estado: "Disponible", recibido: true, nombre: "Dell Latitude 7420", categoria: "Laptop", condicion: "Usado",
  marca: "Dell", modelo: "Latitude 7420", precio: 450, pantalla: "14\" 3840x2160 (4K UHD)", pantallaTitulo: "14\" 4K",
  procesador: "Intel Core i7-1165G7 2.80-4.70GHz", procesadorTitulo: "i7-1165G7", graficos: "", ram: "16GB RAM DDR4", ramTitulo: "16GB DDR4",
  disco: "512GB NVMe SSD", discoTitulo: "512GB NVMe SSD", conectividad: "Wi-Fi, HDMI", caracteristicas: "", sistema: "WINDOWS 11 PRO",
  bateriaSalud: 86, bateriaEstado: "Muy buena", accesorios: ["Cargador original Dell USB-C"], especificaciones: "",
};

console.log("\n— Datos —");
const datos = datosParaIa([u], "Producto");
assert(datos.includes("- Procesador: Intel Core i7-1165G7") && !datos.includes("Gráficos") && !datos.includes("450"), "Datos sin líneas vacías ni precio");
assert(datos.includes("- Batería: en muy buen estado") && datosParaIa([u], "Unidad").includes("86% salud"), "Batería sin % en el compartido, con % en el aparte");

console.log("\n— Pedido —");
const pres = construirPedido({ que: "presentacion", canal: "Marketplace", alcance: "Producto", unidades: [u] });
assert(pres.mensaje.includes("PRESENTACIÓN") && pres.mensaje.includes("Sin emojis, sin precio") && pres.maxTokens <= 400, "Presentación: reglas y largo");
const tit = construirPedido({ que: "titulo", canal: "Mercado Libre", alcance: "Producto", unidades: [u], tituloPlantilla: "Laptop Dell Latitude 7420 14 i7-1165G7 16GB 512GB", actual: "x" });
assert(tit.mensaje.includes("máximo 60 caracteres") && tit.mensaje.includes("Mercado Libre: sin emojis") && tit.mensaje.includes("Título actual: x"), "Título de ML: límite 60 y reglas del canal");

console.log("\n— Limpieza —");
assert(limpiarSugerencia("\"Laptop Dell Latitude 7420\"", "titulo") === "Laptop Dell Latitude 7420", "Quita comillas que envuelven");
assert(limpiarSugerencia("Laptop Dell 14\"", "titulo") === "Laptop Dell 14\"", "No quita la comilla de pulgadas");
assert(limpiarSugerencia("Título: Laptop Dell\nOtra línea", "titulo") === "Laptop Dell", "Título: sin prefijo y en una línea");
assert(limpiarSugerencia("Presentación: Uno.\n\n\n\nDos.", "presentacion") === "Uno.\nDos.", "Presentación: sin prefijo ni líneas en blanco");

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo bien.");
