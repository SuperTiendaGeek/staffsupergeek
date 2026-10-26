/**
 * Filtros y búsqueda de Artículos (rediseño 15-oct-2026).
 * Ejecutar: npm test items-filtro
 */
import {
  coincidenTerminos,
  formulaFiltroArticulos,
  FILTRO_ARTICULOS_VACIO,
  hayFiltroArticulos,
  hrefArticulos,
  interpretarBusqueda,
  leerFiltroArticulos,
  normalizarBusqueda,
  terminosBusqueda,
} from "../items-filtro";

let fallos = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { fallos++; console.error("✗", msg); } else console.log("✓", msg);
}
function igual(a: unknown, b: unknown, msg: string) {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  assert(ok, ok ? msg : `${msg} → ${JSON.stringify(a)} (esperado ${JSON.stringify(b)})`);
}

console.log("— El buscador entiende categoría y estado —");
igual(interpretarBusqueda("laptops hp disponibles"), { categoria: "Laptop", estado: "Disponible", resto: "hp" }, "laptops hp disponibles");
igual(interpretarBusqueda("Desktops vendidos"), { categoria: "Desktop", estado: "Vendido", resto: "" }, "Desktops vendidos");
igual(interpretarBusqueda("laptops en tránsito"), { categoria: "Laptop", estado: "En tránsito", resto: "" }, "laptops en tránsito (con tilde)");
igual(interpretarBusqueda("laptop en transito"), { categoria: "Laptop", estado: "En tránsito", resto: "" }, "laptop en transito (sin tilde)");
igual(interpretarBusqueda("MacBook"), { resto: "macbook" }, "MacBook queda como texto");
igual(interpretarBusqueda("LAP-000412"), { resto: "lap-000412" }, "un SKU no se confunde con la categoría Laptop");
igual(interpretarBusqueda("tarjetas gráficas rtx"), { categoria: "Tarjeta gráfica", resto: "rtx" }, "categoría de dos palabras en plural");
igual(interpretarBusqueda("ram 16gb"), { categoria: "RAM", resto: "16gb" }, "ram 16gb");
igual(interpretarBusqueda("monitores reservados"), { categoria: "Monitor", estado: "Reservado", resto: "" }, "plural en -es");
igual(interpretarBusqueda("ipad wifi"), { resto: "ipad wifi" }, "wifi no se toma como categoría");
igual(interpretarBusqueda("dado de baja"), { estado: "Dado de baja", resto: "" }, "estado de tres palabras");
igual(interpretarBusqueda("portátiles lenovo"), { categoria: "Laptop", resto: "lenovo" }, "sinónimo portátil");

console.log("\n— Palabras a buscar —");
igual(terminosBusqueda("Core i5  8GB a"), ["core", "i5", "8gb"], "sin tildes, en minúscula, sin letras sueltas");
assert(coincidenTerminos(normalizarBusqueda("Apple MacBook Pro 13"), ["mac"]), "«mac» encuentra MacBook (comienzo de palabra)");
assert(!coincidenTerminos(normalizarBusqueda("Chip de audio"), ["hp"]), "«hp» no encuentra «chip»");
assert(coincidenTerminos(normalizarBusqueda("HP EliteBook 840"), ["hp", "elite"]), "varias palabras a la vez");
assert(coincidenTerminos(normalizarBusqueda("Lenovo Core i5-8350U"), ["i5"]), "«i5» encuentra i5-8350U");
assert(coincidenTerminos(normalizarBusqueda("ec88812345670"), ["45670"]), "con números se busca en cualquier parte (rastreo)");
assert(coincidenTerminos(normalizarBusqueda("Cámara web"), ["camara"]), "sin importar tildes");

console.log("\n— Leer y escribir el filtro en la dirección —");
const leido = leerFiltroArticulos({ q: "  hp  ", estado: "Disponible", categoria: "Inventado", operacion: "Compra a proveedor", proveedor: "recAAAAAAAAAAAAAA" });
igual(leido, { q: "hp", categoria: "", estado: "Disponible", operacion: "Compra a proveedor", proveedor: "recAAAAAAAAAAAAAA", inspeccion: "" }, "lo que no existe se ignora");
igual(leerFiltroArticulos(new URLSearchParams("proveedor=hola&estado=Vendido")), { ...FILTRO_ARTICULOS_VACIO, estado: "Vendido" }, "proveedor inválido se ignora");
assert(!hayFiltroArticulos(FILTRO_ARTICULOS_VACIO) && hayFiltroArticulos(leido), "hayFiltroArticulos");
assert(
  hrefArticulos({ ...FILTRO_ARTICULOS_VACIO, q: "hp", categoria: "Laptop" }, { sort: "precio-desc" }) === "/shipping-v2/items?q=hp&categoria=Laptop&sort=precio-desc",
  "la dirección lleva el filtro y el orden"
);
assert(hrefArticulos(FILTRO_ARTICULOS_VACIO, { sort: "newest" }) === "/shipping-v2/items", "sin filtro ni orden especial: dirección limpia");

console.log("\n— Fórmula de Airtable —");
assert(formulaFiltroArticulos(FILTRO_ARTICULOS_VACIO) === "", "sin filtro: sin condición");
const formula = formulaFiltroArticulos({ ...FILTRO_ARTICULOS_VACIO, categoria: "Laptop", estado: "Disponible", q: "hp 16gb" });
assert(formula.startsWith("AND(") && formula.includes("{Categoría}='Laptop'") && formula.includes("{Estado Item}='Disponible'"), "categoría y estado exactos");
assert(formula.includes("REGEX_MATCH(") && formula.includes("'(^|[^a-z0-9])hp'"), "«hp» busca el comienzo de una palabra");
assert(formula.includes("FIND('16gb',"), "«16gb» se busca en cualquier parte");
assert(formula.includes("{Nombre del item}") && formula.includes("{Marca}") && formula.includes("ARRAYJOIN({Proveedor de compra},' ')") && formula.includes("SUBSTITUTE("), "busca en nombre, marca, proveedor… sin tildes");
assert(formulaFiltroArticulos({ ...FILTRO_ARTICULOS_VACIO, q: "o'brien" }).includes("o\\'brien"), "las comillas no rompen la fórmula");
assert(formulaFiltroArticulos({ ...FILTRO_ARTICULOS_VACIO, proveedor: "recAAAAAAAAAAAAAA" }) === "AND(FALSE())", "proveedor sin etiqueta conocida: no devuelve nada");
assert(formulaFiltroArticulos({ ...FILTRO_ARTICULOS_VACIO, proveedor: "recAAAAAAAAAAAAAA" }, { proveedorEtiqueta: "eBay-Hardware" }).includes("FIND('|eBay-Hardware|','|'&ARRAYJOIN({Proveedor de compra},'|')&'|')>0"), "proveedor por su etiqueta");
assert(formulaFiltroArticulos({ ...FILTRO_ARTICULOS_VACIO, q: "1.5" }).includes("FIND('1.5',"), "con números va por FIND (sin expresión regular)");
assert(formulaFiltroArticulos({ ...FILTRO_ARTICULOS_VACIO, q: "c++" }).includes("'(^|[^a-z0-9])c\\\\+\\\\+'"), "los signos especiales se escapan");

if (fallos > 0) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo OK");
