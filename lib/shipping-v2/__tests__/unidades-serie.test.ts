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
  evaluarSkuCompartido,
  esIdRegistro,
  esRutaDeUnidad,
  rutaUnidad,
  planDeFila,
  seguimientoDe,
  seguimientoParaGuardar,
  separarSeries,
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
assert(faltaSerieParaVender({ categoria: "Laptop" }) && !faltaSerieParaVender({ categoria: "Cable" }), "A un equipo sin serie le falta registrarla (solo aviso); a un cable no");

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

const cable = { sku: "CAB-000010", nombre: "Cable USB-C a Lightning tela 1 m", categoria: "Cable", marca: "Ugreen", condicion: "Nuevo" };
assert(compararProducto({ ...cable, sku: undefined, nombre: "cable usb-c a lightning, tela 1m" }, cable)?.nivel === "igual", "Lote con el mismo nombre, marca y condición → Igual");
assert(compararProducto({ ...cable, sku: undefined, condicion: "Usado" }, cable)?.nivel !== "igual", "Mismo nombre pero usado → no es igual");
const dellSinSpecs = { sku: "LAP-000600", nombre: "Dell Latitude 5420", categoria: "Laptop", marca: "Dell", condicion: "Usado" };
assert(compararProducto({ ...dellSinSpecs, sku: undefined }, dellSinSpecs)?.nivel === "parecido", "Equipo con el mismo nombre → solo Parecido (puede cambiar la RAM)");

const corto = compararProducto({ nombre: "Dell Latitude 5420 i5 16GB", categoria: "Laptop", condicion: "Usado" }, { sku: "LAP-000500", nombre: "Dell Latitude 5420 i5-1145G7 16 GB 256 GB SSD 14\"", categoria: "Laptop", marca: "Dell", condicion: "Usado" });
assert(corto?.nivel === "parecido", "Nombre corto sin marca dentro de uno largo → Parecido");
assert(compararProducto({ nombre: "Cable USB-C", categoria: "Cable" }, cable) === null, "Dos palabras genéricas no bastan");
const orden = buscarCoincidencias({ nombre: "Dell Latitude 5420 i5 16GB 256GB", categoria: "Laptop", condicion: "Usado" }, [
  { sku: "LAP-000700", nombre: "Dell Latitude 5420 i5 8GB 128GB SSD 14 pulgadas táctil", categoria: "Laptop", condicion: "Usado" },
  { sku: "LAP-000800", nombre: "Dell Latitude 5420 i5 16GB 256GB SSD", categoria: "Laptop", condicion: "Usado" },
]);
assert(orden[0]?.sku === "LAP-000800", "Entre parecidos, primero el más parecido");

console.log("\n— Registrar compra: unidades y lotes —");
assert(seguimientoParaGuardar("unidad") === "Unidad" && seguimientoParaGuardar("LOTE") === "Lote" && seguimientoParaGuardar("") === "", "Seguimiento que se guarda");
assert(separarSeries("S/N 7HX2KQ3\n8pl4qr1, 7HX2KQ3;3BN7ZT5").join() === "7HX2KQ3,8PL4QR1,3BN7ZT5", "Series pegadas o escaneadas: limpias y sin repetir");
const tres = planDeFila({ seguimiento: "Unidad", cantidad: 3, series: ["7HX2KQ3", "8PL4QR1"] });
assert(tres.ok && tres.registros.length === 3 && tres.registros.every((r) => r.cantidad === 1) && tres.registros[2].numeroSerie === "", "3 laptops → 3 registros de 1 (la 3.ª sin serie aún)");
const diez = planDeFila({ seguimiento: "Lote", cantidad: 10 });
assert(diez.ok && diez.registros.length === 1 && diez.registros[0].cantidad === 10, "10 cables → 1 lote de 10");
assert(!planDeFila({ seguimiento: "Unidad", cantidad: 1, series: ["A1234", "B1234"] }).ok, "Más series que unidades → error");
assert(!planDeFila({ seguimiento: "Lote", cantidad: 5, series: ["A1234"] }).ok, "Un lote no lleva series");
assert(!planDeFila({ seguimiento: "Unidad", cantidad: 2, series: ["A1234", "a1234"] }).ok, "Serie repetida → error");
assert(evaluarSkuCompartido({ sku: "LAP-000500", categoria: "Laptop" }, { categoria: "Laptop" }) === null, "Misma categoría → se puede sumar");
assert(evaluarSkuCompartido({ sku: "LAP-000500", categoria: "Laptop" }, { categoria: "Monitor" }) !== null, "Otra categoría → no");
assert(evaluarSkuCompartido({ sku: "MON-000034", categoria: "Monitor", usoLocal: true }, { categoria: "Monitor" }) !== null, "Activo con mercadería → no");

console.log("\n— Direcciones de la unidad (10b-4) —");
const laptop = { id: "recAbCdEfGh123456", sku: "LAP-000500", numeroSerie: "7hx2kq3" };
assert(esIdRegistro(laptop.id) && !esIdRegistro("7HX2KQ3"), "Reconoce un id de registro");
assert(rutaUnidad(laptop, "inspeccion") === "/shipping-v2/items/LAP-000500/u/7HX2KQ3/inspeccion", "Inspección por SKU y serie");
assert(rutaUnidad(laptop, "ficha", { desde: "recepcion" }) === "/shipping-v2/items/LAP-000500/u/7HX2KQ3/ficha?desde=recepcion", "Desde Recepción");
assert(rutaUnidad(laptop, "ficha/print", { imprimir: true }).endsWith("/ficha/print?print=1"), "Imprimir");
const sinSerie = { id: "recZZZZZZZZZZZZZZ", sku: "LAP-000500" };
assert(rutaUnidad(sinSerie, "inspeccion") === "/shipping-v2/items/LAP-000500/u/recZZZZZZZZZZZZZZ/inspeccion", "Sin serie: el id del registro");
assert(esRutaDeUnidad(laptop, "lap-000500", "7HX2KQ3") && esRutaDeUnidad(sinSerie, "LAP-000500", "recZZZZZZZZZZZZZZ"), "Dirección correcta");
assert(!esRutaDeUnidad(laptop, "LAP-000500", laptop.id), "Ya tiene serie: la dirección con el id se corrige");
assert(!esRutaDeUnidad(laptop, "LAP-000999", "7HX2KQ3"), "Cambió el SKU (fusión): se corrige");
assert(rutaUnidad({ id: "recAAAAAAAAAAAAAA", sku: "CEL-000001", numeroSerie: "AB/12" }, "ficha").includes("/u/AB%2F12/"), "Serie con barra va codificada");

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
