/**
 * Unidades, series y lotes (punto 10b, decisiones del 16 y 17-oct-2026).
 * Ejecutar: npx tsx lib/shipping-v2/__tests__/unidades-serie.test.ts
 */
import {
  buscarCoincidencias,
  compararProducto,
  esSerieInterna,
  evaluarSerie,
  faltaSerieParaVender,
  nombreUnidad,
  normalizarSerie,
  seguimientoDe,
  seguimientoPorCategoria,
  serieCorta,
  siguienteSerieInterna,
  tomarDeLotes,
  valorCodigoBarras,
} from "../unidades-serie";

let fallos = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { fallos++; console.error("✗", msg); } else console.log("✓", msg);
}

console.log("— Unidad o lote (decisión C a) —");
for (const c of ["Laptop", "Desktop", "All in One", "Monitor", "Consola", "Tablet", "Celular", "Impresora", "Tarjeta gráfica", "Mainboard"]) {
  assert(seguimientoPorCategoria(c) === "Unidad", `${c} → uno por uno`);
}
for (const c of ["RAM", "SSD", "HDD", "Batería", "Pantalla", "Cable", "Cargador", "Accesorio", "", undefined]) {
  assert(seguimientoPorCategoria(c as string) === "Lote", `${c || "(sin categoría)"} → por lote`);
}
assert(seguimientoDe({ categoria: "SSD", seguimiento: "Unidad" }) === "Unidad", "Un SSD usado cambiado a uno por uno se respeta");
assert(seguimientoDe({ categoria: "Laptop", seguimiento: "" }) === "Unidad", "Sin elección: el de la categoría");

console.log("\n— Series —");
assert(normalizarSerie(" s/n: 7hx2 kq3 ") === "7HX2KQ3", "Quita S/N, espacios y pasa a mayúsculas");
assert(normalizarSerie("Service Tag 7HX2KQ3") === "7HX2KQ3", "Quita 'Service Tag'");
assert(siguienteSerieInterna([]) === "SG00000001", "Primera serie interna");
assert(siguienteSerieInterna(["SG00004127", "7HX2KQ3", "sg00000009", null]) === "SG00004128", "Sigue a la mayor");
assert(esSerieInterna("SG00004127") && !esSerieInterna("SG-004127") && !esSerieInterna("LAP-000500"), "Formato SG + 8 números, sin guion");
const otras = new Map([["7HX2KQ3", "LAP-000500"]]);
assert(!evaluarSerie("7hx2kq3", otras).ok, "No se repite una serie (sin importar mayúsculas)");
assert(evaluarSerie("8PL4QR1", otras).ok, "Serie nueva: sí");
assert(!evaluarSerie("LAP-000500", new Map()).ok, "Un SKU no sirve como serie");
assert(!evaluarSerie("", new Map()).ok && !evaluarSerie("AB1", new Map()).ok, "Vacía o muy corta: no");
assert(evaluarSerie("356938035643809", new Map()).ok, "IMEI de 15 dígitos: sí");

console.log("\n— Cómo se muestra y qué lleva el código de barras —");
assert(nombreUnidad("LAP-000500", "7HX2KQ3") === "LAP-000500 · S/N 7HX2KQ3", "LAP-000500 · S/N 7HX2KQ3");
assert(serieCorta("7HX2KQ3") === "…KQ3", "Abreviada …KQ3");
assert(valorCodigoBarras({ sku: "LAP-000500", numeroSerie: "7HX2KQ3", categoria: "Laptop" }).valor === "7HX2KQ3", "Equipo con serie → la serie");
assert(valorCodigoBarras({ sku: "LAP-000500", numeroSerie: "", categoria: "Laptop" }).valor === "LAP-000500", "Equipo sin serie aún → el SKU");
assert(valorCodigoBarras({ sku: "CAB-000010", numeroSerie: "X1234", categoria: "Cable" }).valor === "CAB-000010", "Lote → el SKU");
assert(faltaSerieParaVender({ categoria: "Laptop" }) && !faltaSerieParaVender({ categoria: "Cable" }), "Un equipo sin serie no se vende; un cable sí");

console.log("\n— ¿Ya existe? —");
const dell = { sku: "LAP-000500", nombre: "Dell Latitude 5420 i5 16GB 256GB", categoria: "Laptop", marca: "Dell", condicion: "Usado", modelo: "Latitude 5420", cpuModelo: "i5-1145G7", ram: "16GB", almacenamiento: "256GB" };
const igual = compararProducto({ ...dell, sku: undefined, ram: "16 GB" }, dell);
assert(igual?.nivel === "igual", "Mismo modelo, CPU, RAM, disco y condición → Igual");
assert(compararProducto({ ...dell, ram: "8GB" }, dell)?.nivel !== "igual", "Cambia la RAM → no es igual");
assert(compararProducto({ ...dell, condicion: "Nuevo" }, dell)?.nivel !== "igual", "Nuevo contra usado → no es igual");
const epson = { sku: "REP-000043", nombre: "Kit Botellas Epson T544", categoria: "Repuesto", marca: "Epson", condicion: "Nuevo", numeroParte: "T544520-4P" };
assert(compararProducto({ nombre: "Tinta Epson", categoria: "Repuesto", marca: "Epson", condicion: "Nuevo", numeroParte: "t544520 4p" }, epson)?.nivel === "igual", "Mismo número de parte → Igual");
const parecido = compararProducto({ nombre: "KIT BOTELLAS EPSON T544 4 COLORES", categoria: "Repuesto", marca: "Epson", condicion: "Nuevo" }, { ...epson, numeroParte: "" });
assert(parecido?.nivel === "parecido", "Solo el nombre se parece → Parecido (nunca Igual)");
assert(compararProducto({ nombre: "Cable HDMI", categoria: "Cable", marca: "Ugreen" }, epson) === null, "Otra categoría → nada");
const lista = buscarCoincidencias({ ...dell, sku: undefined }, [dell, { ...dell, sku: "LAP-000501", ram: "8GB" }, dell]);
assert(lista.length >= 1 && lista[0].sku === "LAP-000500" && lista[0].nivel === "igual", "Una sugerencia por SKU, las Igual primero");
assert(buscarCoincidencias({ ...dell, sku: undefined }, [dell], { descartados: ["lap-000500"] }).length === 0, "\"Es otro\" no se vuelve a sugerir");

console.log("\n— Lotes: primero el más antiguo (C2) —");
const lotes = [
  { id: "L2", fecha: "2026-09-10", libres: 10 },
  { id: "L1", fecha: "2026-08-05", libres: 4 },
  { id: "L3", fecha: "2026-10-01", libres: 0 },
];
const una = tomarDeLotes(lotes, 1);
assert(una.ok && una.tomas.length === 1 && una.tomas[0].id === "L1", "1 cable sale del lote de agosto");
const seis = tomarDeLotes(lotes, 6);
assert(seis.ok && seis.tomas[0].id === "L1" && seis.tomas[0].cantidad === 4 && seis.tomas[1].id === "L2" && seis.tomas[1].cantidad === 2, "6 cables: 4 de agosto + 2 de septiembre");
assert(!tomarDeLotes(lotes, 20).ok, "No alcanza: avisa");

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo bien.");
