/**
 * Cargar la lista de una compra desde una hoja (punto 9d, entrega 2, 15-oct-2026).
 * Ejecutar: npx tsx lib/shipping-v2/__tests__/importar-lineas.test.ts
 */
import { strToU8, zipSync } from "fflate";
import {
  campoDeEncabezado,
  columnasPlantilla,
  filasALineas,
  limpiarColumnasRecordadas,
  mapeoInicial,
  mapeoParaRecordar,
  mapeoSinTitulos,
  numeroDeCelda,
  parsearTextoTabla,
  separarEncabezado,
} from "../importar-lineas";
import { crearPlantillaXlsx, esXlsx, leerXlsx, textoDeArchivo } from "../hoja-xlsx";
import { faltantesLinea, nuevaLinea } from "../ordenes-compra";
import { SHIPPING_V2_CATEGORIAS, SHIPPING_V2_CONDICIONES } from "@/types/shipping-v2";

let fallos = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { fallos++; console.error("✗", msg); } else console.log("✓", msg);
}
const ctx = { categorias: SHIPPING_V2_CATEGORIAS, condiciones: SHIPPING_V2_CONDICIONES, condicionPorDefecto: "Usado" };

// CSV de prueba que envió el dueño (15-oct), tal cual.
const CSV_DUENO = `Nombre,Catergoria,Condicion,Cantidad,Costo unitario,Precio de venta,SKU proveedor,Regalo (Si/No),Notas internas
Laptop Dell Latitude 5420 i5 16GB 256GB SSD ITEM PRUEBA,Laptop,Usado,2,175.00,285.00,TEST-LAP-001,No,Prueba de importación: dos unidades de laptop usada.
Laptop HP ProBook 450 G7 i7 16GB 512GB SSD ITEM PRUEBA,Laptop,Usado,1,220.00,350.00,TEST-LAP-002,No,Equipo ficticio para validar carga individual.
Desktop Lenovo ThinkCentre M720q i5 8GB 256GB SSD ITEM PRUEBA,Desktop,Usado,3,110.00,195.00,TEST-DES-001,No,Tres unidades para comprobar cantidades múltiples.
Parlante Bluetooth Portátil ITEM PRUEBA,Electrónicos,Nuevo,4,12.50,24.99,TEST-ELE-001,No,Cuatro unidades nuevas con mismo SKU de proveedor.
Cable HDMI 2m ITEM PRUEBA,Electrónicos,Nuevo,2,3.00,0.00,TEST-ELE-002,Si,Regalo promocional: validar precio de venta cero.
`;

console.log("— Títulos de columnas —");
assert(campoDeEncabezado("Catergoria") === "categoria", "“Catergoria” (con la letra de más) es Categoría");
assert(campoDeEncabezado("Regalo (Si/No)") === "regalo" && campoDeEncabezado("Regalo (Sí/No)") === "regalo", "Regalo (Sí/No) con o sin tilde");
assert(campoDeEncabezado("Precio unidad") === "costoUnitario" && campoDeEncabezado("Precio total línea") === "totalLinea", "Hoja de 3R: precio unidad y total de línea");
assert(campoDeEncabezado("Item") === "nombre" && campoDeEncabezado("SKU proveedor") === "skuProveedor", "Hoja de 3R: Item y SKU proveedor");
assert(campoDeEncabezado("Notas internas") === "notas" && campoDeEncabezado("Observaciones") === "notas", "Notas internas");
assert(campoDeEncabezado("Columna rara") === "" && campoDeEncabezado("") === "", "Lo que no se reconoce queda sin asignar");
assert(campoDeEncabezado("Qty") === "cantidad" && campoDeEncabezado("Unit price") === "costoUnitario", "Títulos en inglés");
assert(campoDeEncabezado("Descripción del producto") === "nombre", "Descripción del producto = nombre");
assert(campoDeEncabezado("Lote", { lote: "skuProveedor" }) === "skuProveedor", "Lo recordado para el proveedor manda");
assert(campoDeEncabezado("Precio", { precio: "" }) === "", "Lo recordado como “ignorar” se ignora");

console.log("— Números —");
assert(numeroDeCelda("175.00") === 175 && numeroDeCelda("$1,234.50") === 1234.5, "175.00 y $1,234.50");
assert(numeroDeCelda("1.234,50") === 1234.5 && numeroDeCelda("12,50") === 12.5, "Coma decimal");
assert(numeroDeCelda("1,000") === 1000 && numeroDeCelda("USD 20") === 20, "Separador de miles y USD");
assert(numeroDeCelda("") === null && numeroDeCelda("abc") === null && numeroDeCelda("1-2") === null, "Lo que no es número da null");
assert(numeroDeCelda(12.5) === 12.5, "Un número ya es número");

console.log("— CSV del dueño —");
{
  const filas = parsearTextoTabla(CSV_DUENO);
  assert(filas.length === 6, "6 filas (títulos + 5); la línea vacía del final no cuenta");
  const tabla = separarEncabezado(filas);
  assert(tabla.conTitulos && tabla.filas.length === 5, "Reconoce la fila de títulos");
  const mapeo = mapeoInicial(tabla.encabezados);
  assert(mapeo.join(",") === "nombre,categoria,condicion,cantidad,costoUnitario,precioVenta,skuProveedor,regalo,notas", "Las 9 columnas quedan asignadas solas");
  const r = filasALineas(tabla.filas, mapeo, ctx);
  assert(r.lineas.length === 5 && r.ignoradas === 0, "5 artículos");
  assert(r.lineas.map((l) => l.cantidad).join("/") === "2/1/3/4/2", "Cantidades 2/1/3/4/2");
  assert(r.lineas.map((l) => l.categoria).join("/") === "Laptop/Laptop/Desktop//", "Electrónicos no existe: queda vacía para elegirla");
  assert(r.avisos.some((a) => a.includes("Electrónicos (2)")), "Aviso: Electrónicos en 2 filas");
  const cable = r.lineas[4];
  assert(cable.regalo === true && cable.costoProveedor === "", "El cable es regalo y queda sin costo");
  assert(cable.precioVentaFinal === "0", "Precio de venta 0 se respeta");
  assert(r.avisos.some((a) => a.includes("1 regalo(s) traían costo")), "Aviso: el regalo traía costo");
  assert(r.lineas[0].costoProveedor === "175" && r.lineas[0].precioVentaFinal === "285", "Costo y precio de la primera");
  assert(r.lineas[3].costoProveedor === "12.5" && r.lineas[3].precioVentaFinal === "24.99", "12.50 y 24.99");
  assert(r.lineas[0].skuProveedor === "TEST-LAP-001", "SKU proveedor");
  assert(r.lineas[2].observacionesInternas === "Tres unidades para comprobar cantidades múltiples.", "Notas internas van a observaciones internas (con tildes)");
  assert(r.lineas[3].condicion === "Nuevo" && r.lineas[0].condicion === "Usado", "Condición");
  const lineas = r.lineas.map((l, i) => nuevaLinea(`k${i}`, l));
  const faltan = lineas.map((l) => faltantesLinea(l, { esCompra: true }));
  assert(faltan[0].length === 0 && faltan[1].length === 0 && faltan[2].length === 0, "Las 3 primeras quedan completas");
  assert(faltan[3].join() === "categoría" && faltan[4].join() === "categoría", "Las 2 de Electrónicos solo piden la categoría");
  const total = lineas.filter((l) => !l.regalo).reduce((s, l) => s + Number(l.cantidad) * Number(l.costoProveedor), 0);
  assert(total === 2 * 175 + 220 + 3 * 110 + 4 * 12.5, "Total de la compra $950 (el regalo no suma)");
}

console.log("— Hoja de 3R (sin columna de cantidad) —");
{
  const pegado = "Item\tSKU proveedor\tPrecio unidad\tPrecio total línea\nLenovo T480 i5\t3R-T480\t$150.00\t$450.00\nRAM 8GB DDR4\t3R-RAM8\t$12.00\t$24.00\n\t\t\t\nTOTAL\t\t\t$474.00\n";
  const tabla = separarEncabezado(parsearTextoTabla(pegado));
  const mapeo = mapeoInicial(tabla.encabezados);
  assert(mapeo.join(",") === "nombre,skuProveedor,costoUnitario,totalLinea", "Columnas de 3R asignadas");
  const r = filasALineas(tabla.filas, mapeo, ctx);
  assert(r.lineas.length === 2 && r.ignoradas === 1, "La fila TOTAL se ignora (la vacía ni llega)");
  assert(r.lineas[0].cantidad === "3" && r.lineas[1].cantidad === "2", "Cantidad = total ÷ precio unidad");
  assert(r.avisos.some((a) => a.includes("total ÷ precio unidad en 2")), "Aviso de cantidad calculada");
  assert(r.lineas[0].categoria === "" && r.lineas[0].condicion === "Usado", "Sin categoría (se elige con “Aplicar a todas”) y condición por defecto");
}

console.log("— Otros formatos —");
{
  const sinTitulos = separarEncabezado(parsearTextoTabla("Laptop Dell\t2\t100\nMouse\t1\t5"));
  assert(!sinTitulos.conTitulos && sinTitulos.encabezados.join() === "Columna 1,Columna 2,Columna 3", "Sin títulos: Columna 1, 2, 3");
  assert(mapeoInicial(sinTitulos.encabezados).every((m) => m === ""), "Sin títulos nada se asigna por el título");
  assert(mapeoSinTitulos(sinTitulos).join(",") === "nombre,,", "Sin títulos: la primera columna de texto se propone como Nombre");
  assert(mapeoSinTitulos(separarEncabezado(parsearTextoTabla("12\tMouse\n15\tTeclado"))).join(",") === ",nombre", "…aunque no sea la primera columna");
  const r = filasALineas(sinTitulos.filas, ["nombre", "cantidad", "costoUnitario"], ctx);
  assert(r.lineas.length === 2 && r.lineas[0].cantidad === "2" && r.lineas[1].costoProveedor === "5", "Con las columnas elegidas a mano");

  const pc = parsearTextoTabla("Nombre;Cantidad;Costo unitario;Categoría\nLaptops HP;2;150,50;Laptops\nCargadores;3;8;cargadores");
  const t = separarEncabezado(pc);
  const r2 = filasALineas(t.filas, mapeoInicial(t.encabezados), ctx);
  assert(r2.lineas[0].costoProveedor === "150.5", "CSV con punto y coma y coma decimal");
  assert(r2.lineas[0].categoria === "Laptop" && r2.lineas[1].categoria === "Cargador", "Plurales: Laptops → Laptop, cargadores → Cargador");

  const comillas = parsearTextoTabla('Nombre,Notas\n"Monitor 24"", LG","Línea 1\nLínea 2"\n');
  assert(comillas.length === 2 && comillas[1][0] === 'Monitor 24", LG' && comillas[1][1] === "Línea 1\nLínea 2", "Comillas, comas y saltos de línea dentro de una celda");

  const alias = filasALineas([["Notebook Acer", "Notebook", "used"], ["Parlante JBL", "Parlantes", "Nueva"]], ["nombre", "categoria", "condicion"], ctx);
  assert(alias.lineas[0].categoria === "Laptop" && alias.lineas[0].condicion === "Usado", "Notebook → Laptop, used → Usado");
  assert(alias.lineas[1].categoria === "Audio" && alias.lineas[1].condicion === "Nuevo", "Parlantes → Audio, Nueva → Nuevo");

  const raros = filasALineas([["Mouse", "dos", "", "Sí"], ["Teclado", "", "25", ""]], ["nombre", "cantidad", "costoUnitario", "regalo"], ctx);
  assert(raros.lineas[0].cantidad === "" && raros.lineas[1].cantidad === "1", "Cantidad que no es número queda vacía; vacía es 1");
  assert(raros.lineas[0].regalo === true && raros.lineas[1].regalo === false, "Sí = regalo; vacío = no");

  const sinCosto = filasALineas([["Mouse", "2", "30"]], ["nombre", "cantidad", "totalLinea"], ctx);
  assert(sinCosto.lineas[0].costoProveedor === "15" && sinCosto.avisos.some((a) => a.includes("total ÷ cantidad")), "Costo = total ÷ cantidad si no hay costo unitario");

  const sinNombre = filasALineas([["2", "30"]], ["cantidad", "costoUnitario"], ctx);
  assert(sinNombre.avisos.some((a) => a.includes("Nombre")), "Aviso si ninguna columna es el nombre");

  const muchas = filasALineas(Array.from({ length: 205 }, (_, i) => [`Art ${i}`]), ["nombre"], ctx);
  assert(muchas.lineas.length === 200 && muchas.ignoradas === 5 && muchas.avisos.some((a) => a.includes("200")), "Máximo 200 filas por carga");

  const dup = mapeoInicial(["Nombre", "Costo", "Precio unitario"]);
  assert(dup.join(",") === "nombre,costoUnitario,", "Un campo se asigna a una sola columna (la primera)");
}

console.log("— Recordar columnas por proveedor —");
{
  const enc = ["Item", "Lote", "Precio", "Columna 4"];
  const rec = mapeoParaRecordar(enc, ["nombre", "skuProveedor", "", ""]);
  assert(JSON.stringify(rec) === JSON.stringify({ lote: "skuProveedor", precio: "" }), "Solo se recuerda lo que se cambió a mano");
  assert(mapeoInicial(enc, rec).join(",") === "nombre,skuProveedor,,", "La próxima vez sale igual");
  const rec2 = mapeoParaRecordar(enc, ["nombre", "", "costoUnitario", ""], rec);
  assert(JSON.stringify(rec2) === "{}", "Volver a lo automático borra lo recordado");
}

console.log("— Lo guardado en Airtable —");
assert(JSON.stringify(limpiarColumnasRecordadas('{"Lote":"skuProveedor","x":"malo","Precio":""}')) === JSON.stringify({ lote: "skuProveedor", precio: "" }), "Se limpia: títulos normalizados y solo campos que existen");
assert(JSON.stringify(limpiarColumnasRecordadas("no es json")) === "{}" && JSON.stringify(limpiarColumnasRecordadas(undefined)) === "{}" && JSON.stringify(limpiarColumnasRecordadas("[1]")) === "{}", "Texto dañado o vacío = nada recordado");

console.log("— Excel (.xlsx) —");
{
  const plantilla = crearPlantillaXlsx(columnasPlantilla(SHIPPING_V2_CATEGORIAS, SHIPPING_V2_CONDICIONES));
  assert(esXlsx(plantilla), "La plantilla es un .xlsx");
  const filas = leerXlsx(plantilla);
  assert(filas.length === 1 && filas[0].join(",") === "Nombre,Categoría,Condición,Cantidad,Costo unitario,Precio de venta,SKU proveedor,Regalo (Sí/No),Notas internas", "La plantilla trae las 9 columnas del dueño (lee la hoja Compra, no la oculta)");
  assert(mapeoInicial(filas[0]).every((m) => m !== ""), "Las columnas de la plantilla se reconocen todas");

  // Un libro como lo guarda Excel: textos compartidos, números, Sí/No y celdas saltadas.
  const xml = (s: string) => strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${s}`);
  const libro = zipSync({
    "[Content_Types].xml": xml(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`),
    "xl/workbook.xml": xml(`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Pedido" sheetId="5" r:id="rId7"/><sheet name="Otra" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": xml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/><Relationship Id="rId7" Type="x" Target="worksheets/sheet2.xml"/></Relationships>`),
    "xl/sharedStrings.xml": xml(`<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Item</t></si><si><t>Precio unidad</t></si><si><r><t>Laptop </t></r><r><rPr><b/></rPr><t>Dell &amp; Co</t></r><rPh><t>X</t></rPh></si><si><t>Cantidad</t></si><si><t>Regalo</t></si></sst>`),
    "xl/worksheets/sheet1.xml": xml(`<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>NO ES ESTA</t></is></c></row></sheetData></worksheet>`),
    "xl/worksheets/sheet2.xml": xml(`<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>3</v></c><c r="E1" t="s"><v>4</v></c></row><row r="2"/><row r="3"><c r="A3" t="s"><v>2</v></c><c r="B3" s="2"><v>175.5</v></c><c r="C3"><v>2</v></c><c r="D3" s="1"/><c r="E3" t="b"><v>1</v></c></row><row r="4"><c r="B4" t="str"><f>SUM(B3)</f><v>175.5</v></c><c r="C4" t="e"><v>#N/A</v></c></row></sheetData></worksheet>`),
  });
  const leidas = leerXlsx(libro);
  assert(leidas.length === 3, "Lee la primera hoja del libro (Pedido) y salta la fila vacía");
  assert(leidas[0].join("|") === "Item|Precio unidad|Cantidad||Regalo", "Títulos con una columna vacía en medio");
  assert(leidas[1].join("|") === "Laptop Dell & Co|175.5|2||Sí", "Texto con formato, número, celda vacía y Sí/No");
  assert(leidas[2].join("|") === "|175.5|", "Fórmulas dan su resultado; errores quedan vacíos");
  let error = "";
  try { leerXlsx(strToU8("no soy un zip")); } catch (e) { error = e instanceof Error ? e.message : ""; }
  assert(error.includes(".xlsx o .csv"), "Un archivo dañado da un mensaje claro");
  assert(!esXlsx(strToU8(CSV_DUENO)), "Un CSV no es .xlsx");
}

console.log("— CSV guardado por Excel en Windows —");
{
  const ansi = new Uint8Array([0x43, 0x6f, 0x6e, 0x64, 0x69, 0x63, 0x69, 0xf3, 0x6e]); // "Condición" en Windows-1252
  assert(textoDeArchivo(ansi) === "Condición", "Se lee con tildes aunque no sea UTF-8");
  assert(textoDeArchivo(strToU8("Categoría")) === "Categoría", "UTF-8 normal");
}

if (fallos) {
  console.error(`\n${fallos} prueba(s) fallaron`);
  process.exit(1);
}
console.log("\nTodas las pruebas de importar líneas pasaron");
