/**
 * Gestor de publicaciones (punto 10d): plantillas, metacampos y unidades.
 * Ejecutar: npx tsx lib/shipping-v2/__tests__/publicaciones.test.ts
 */
import {
  accesoriosAnuncio, bateriaAnuncio, condicionTitulo, elegirPlantilla, escribirAccesorios, hashtagsAnuncio, leerAccesorios,
  llenarPlantilla, llenarTitulo, unidadesCubiertas, valoresAnuncio,
  type DatosTienda, type DatosUnidadAnuncio, type PlantillaPublicacion,
} from "../publicaciones";

let fallos = 0;
function assert(condicion: unknown, mensaje: string) {
  if (condicion) console.log(`✓ ${mensaje}`);
  else { fallos++; console.error(`✗ ${mensaje}`); }
}

const tienda: DatosTienda = {
  direccion: "Calle Vicente Ramón Roca y C. Cristóbal Colón, Otavalo", horarioSemana: "10:00 - 19:00", horarioSabado: "10:00 - 14:00",
  whatsapp: "096-880-8149", telefonoFijo: "06-500-5244", web: "supertiendageek.com", metodosPago: "Transferencias", garantiaCorta: "6 MESES", garantiaLarga: "6 MESES…",
  hashtagsFijos: "#SUPERGEEK #Otavalo #Garantía", version: 1,
};
const base: DatosUnidadAnuncio = {
  id: "rec1", sku: "LAP-000700", estado: "Disponible", recibido: true, nombre: "Dell Latitude 7420", categoria: "Laptop", condicion: "Usado",
  marca: "Dell", modelo: "Latitude 7420", precio: 450, pantalla: "14\" 3840x2160 (4K UHD)", pantallaTitulo: "14\" 4K",
  procesador: "Intel Core i7-1165G7 2.80-4.70GHz", procesadorTitulo: "i7-1165G7", graficos: "", ram: "16GB RAM DDR4", ramTitulo: "16GB DDR4",
  disco: "512GB NVMe SSD", discoTitulo: "512GB NVMe SSD", conectividad: "Wi-Fi, Bluetooth, HDMI", caracteristicas: "Cámara, teclado retroiluminado",
  sistema: "WINDOWS 11 PRO", bateriaSalud: 86, bateriaEstado: "Muy buena", accesorios: ["Cargador original Dell USB-C"], especificaciones: "",
};
const otra: DatosUnidadAnuncio = { ...base, id: "rec2", bateriaSalud: 95, bateriaEstado: "Excelente", accesorios: ["Cargador original Dell USB-C", "Mouse"] };

console.log("\n— Accesorios —");
assert(leerAccesorios("") === null && leerAccesorios("Sin accesorios")?.length === 0, "Vacío = sin revisar; Sin accesorios = revisado");
assert(escribirAccesorios(["Cargador", " Mouse ", "Cargador"]) === "Cargador\nMouse" && escribirAccesorios([]) === "Sin accesorios", "Se guardan uno por línea");
assert(accesoriosAnuncio([base, otra]).join() === "Cargador original Dell USB-C", "Compartido: solo lo que traen todas");
assert(accesoriosAnuncio([base, { ...otra, accesorios: null }]).length === 1, "Una sin revisar no cuenta");

console.log("\n— Batería —");
assert(bateriaAnuncio([base, otra], "Producto") === "en muy buen estado", "Compartido: sin %, la de menor salud");
assert(bateriaAnuncio([base], "Unidad") === "86% salud, batería en muy buen estado", "Aparte: con su %");

console.log("\n— Textos —");
assert(condicionTitulo("Usado", "Laptop") === "USADA" && condicionTitulo("Usado", "Monitor") === "USADO", "USADA / USADO según la categoría");
assert(hashtagsAnuncio(base, tienda.hashtagsFijos) === "#SUPERGEEK #DellLatitude #TecnologíaUsada #Laptops #Otavalo #Garantía", "Hashtags como en el ejemplo");
const valores = valoresAnuncio({ unidades: [base, otra], alcance: "Producto", tienda, presentacion: "Dell Latitude 7420 – laptop empresarial premium.", precio: 450 });
const titulo = llenarTitulo("{{categoria}} {{marca}} {{modelo}} {{pantalla_titulo}} {{procesador_titulo}} {{ram_titulo}} {{disco_titulo}} {{sistema}} {{con_cargador}}", valores);
assert(titulo === "Laptop Dell Latitude 7420 14\" 4K i7-1165G7 16GB DDR4 512GB NVMe SSD WINDOWS 11 PRO c/ cargador", `Título: ${titulo}`);
const mp = llenarPlantilla("{{categoria}} {{condicion_titulo}} con Garantía en SUPER GEEK Otavalo 🔥\n💻 {{presentacion}}\n📌 Especificaciones:\n- Pantalla: {{pantalla}}\n- Procesador: {{procesador}}\n- Gráficos: {{graficos}}\n- Memoria RAM: {{ram}}\n- Almacenamiento: {{disco}}\n- Conectividad: {{conectividad}}\n- Características: {{caracteristicas}}\n- Sistema Operativo: {{sistema}}\n- Detalles: {{especificaciones}}\n- Batería: {{bateria}}\n- Accesorios incluidos: {{accesorios}}\n✅ Producto {{condicion}} con 6 meses de garantía – Cada equipo es probado y revisado para garantizar su correcto funcionamiento.\n📍 Visítanos en Otavalo:\n{{tienda_direccion}}\n🕒 Horario de atención:\n- Lunes a viernes: {{tienda_horario_semana}}\n- Sábados: {{tienda_horario_sabado}}\n📦 Compra en tienda física o en línea: {{tienda_web}}\n📞 Contáctanos:\n- WhatsApp: {{tienda_whatsapp}}\n- Teléfono fijo: {{tienda_telefono}}\n🚀 Tenemos más modelos disponibles. Lo que ves en el catálogo es solo una muestra.\n🔒 Compra con confianza en SUPER GEEK – Tecnología usada con garantía\n{{hashtags}}", valores);
assert(mp.startsWith("Laptop USADA con Garantía en SUPER GEEK Otavalo 🔥\n💻 Dell Latitude 7420 – laptop empresarial premium."), "Encabezado y presentación");
assert(!mp.includes("Gráficos") && !mp.includes("Detalles:"), "Línea sin dato desaparece (gráficos, detalles)");
assert(mp.includes("- Batería: en muy buen estado") && mp.includes("- Accesorios incluidos: CARGADOR ORIGINAL DELL USB-C"), "Batería y accesorios del compartido");
assert(mp.includes("- WhatsApp: 096-880-8149") && mp.endsWith("#Otavalo #Garantía"), "Datos de la tienda y hashtags");
assert(!mp.includes("{{"), "Sin metacampos sueltos");
const gf = llenarPlantilla("{{categoria}} {{condicion_titulo}} con Garantía en SUPER GEEK Otavalo 🔥\n💻 {{presentacion}}\n💲 Precio: {{precio}}\n📌 Especificaciones:\n- Pantalla: {{pantalla}}\n- Procesador: {{procesador}}\n- Gráficos: {{graficos}}\n- Memoria RAM: {{ram}}\n- Almacenamiento: {{disco}}\n- Conectividad: {{conectividad}}\n- Características: {{caracteristicas}}\n- Sistema Operativo: {{sistema}}\n- Detalles: {{especificaciones}}\n- Batería: {{bateria}}\n- Accesorios incluidos: {{accesorios}}\n✅ Producto {{condicion}} con 6 meses de garantía – Cada equipo es probado y revisado para garantizar su correcto funcionamiento.\n📍 Visítanos en Otavalo:\n{{tienda_direccion}}\n🕒 Horario de atención:\n- Lunes a viernes: {{tienda_horario_semana}}\n- Sábados: {{tienda_horario_sabado}}\n📦 Compra en tienda física o en línea: {{tienda_web}}\n📞 Contáctanos:\n- WhatsApp: {{tienda_whatsapp}}\n- Teléfono fijo: {{tienda_telefono}}\n🚀 Tenemos más modelos disponibles. Lo que ves en el catálogo es solo una muestra.\n🔒 Compra con confianza en SUPER GEEK – Tecnología usada con garantía\n{{hashtags}}", valores);
assert(gf.includes("💲 Precio: $450"), "Grupos Facebook lleva el precio");
assert(llenarPlantilla("Hola {{desconocido}}", valores) === "Hola {{desconocido}}", "Un metacampo desconocido se deja a la vista");

console.log("\n— Plantilla y unidades —");
const plantillas: PlantillaPublicacion[] = [
  { id: "p1", nombre: "Laptop · Marketplace", categoria: "Laptop", canal: "Marketplace", titulo: "", descripcion: "", activa: true },
  { id: "p2", nombre: "Otros · Marketplace", categoria: "Otros", canal: "Marketplace", titulo: "", descripcion: "", activa: true },
];
assert(elegirPlantilla(plantillas, "Laptop", "Marketplace")?.id === "p1" && elegirPlantilla(plantillas, "Desktop", "Marketplace")?.id === "p2", "La de la categoría, o la de Otros");
assert(elegirPlantilla(plantillas, "Laptop", "Shopify") === null, "Sin plantilla del canal: ninguna");
const vendida = { ...base, id: "rec3", estado: "Vendido" };
const pubs = [{ canal: "Marketplace" as const, alcance: "Unidad" as const, unidadId: "rec2", estado: "Publicado" as const }];
assert(unidadesCubiertas([base, otra, vendida], pubs, "Marketplace", "Producto").map((u) => u.id).join() === "rec1", "Producto: sin vendidas ni las que van aparte");
assert(unidadesCubiertas([base, otra, vendida], pubs, "Grupos Facebook", "Producto").length === 2, "En otro canal la unidad aparte sigue en el compartido");
assert(unidadesCubiertas([base, otra], pubs, "Marketplace", "Unidad", "rec2").map((u) => u.id).join() === "rec2", "Unidad: solo esa");

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo bien.");
