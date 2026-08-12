/**
 * Test — emparejar items del sistema viejo con los Shipping Items del portal.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/shipping-v2/__tests__/migracion-emparejar.test.ts
 *
 * Puro: sin red, sin Airtable.
 *
 * Lo que protege: durante un tiempo se usó el portal para la logística y el
 * sistema viejo para facturar, así que hay artículos en los dos lados que son
 * la MISMA mercadería física. Si se importan sin emparejar, el inventario
 * queda contado al doble.
 *
 * Los nombres de prueba son los de artículos reales de SUPER GEEK.
 */

import {
  normalizarParaComparar,
  tokens,
  parecido,
  emparejar,
  proponerCategoria,
  CATEGORIAS,
  type ItemPortal,
} from "../migracion-emparejar";

let fallos = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); }
  else       { console.log("✓", msg); }
}

// ─── Catálogo del portal, con nombres reales ─────────────────────────────────

const PORTAL: ItemPortal[] = [
  { recordId: "rec1", sku: "DES-000005", nombre: "Lenovo ThinkCentre M70q Mini Desktop Core i5-10400T 240GB SSD 16GB RAM Windows 11 Pro c/ cargador", cantidad: 1, precioVentaFinal: 340 },
  { recordId: "rec2", sku: "LAP-000013", nombre: 'Lenovo ThinkPad P1 Gen 3 15.6" Core i7-10750H 1TB 32GB B T2000', cantidad: 1, precioVentaFinal: 908.5 },
  { recordId: "rec3", sku: "REP-000007", nombre: "Memoria RAM DDR Hynix 1GB", cantidad: 5, precioVentaFinal: 12 },
  { recordId: "rec4", sku: "SSD-000002", nombre: "Disco SSD Kingston 480GB SATA", cantidad: 3, precioVentaFinal: 35 },
];

// ═══════════════════════════════════════════════════════════════════════════
// 1. Normalización
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n── el mismo equipo escrito de mil formas ──");

const variantes = [
  "Lenovo ThinkCentre M70q Mini Desktop Core i5-10400T 240GB SSD 16GB RAM Windows 11 Pro c/ cargador",
  "LENOVO THINKCENTRE M70Q MINI DESKTOP CORE I5-10400T 240 GB SSD 16 GB RAM WINDOWS 11 PRO C/ CARGADOR",
  "lenovo thinkcentre m70q mini desktop core i5-10400t 240gb ssd 16gb ram win 11 pro c/cargador",
];
const normalizadas = variantes.map(normalizarParaComparar);
assert(new Set(normalizadas).size === 1,
  "Mayúsculas, '240 GB' vs '240GB' y 'win 11' vs 'Windows 11' dan el MISMO texto normalizado");

assert(normalizarParaComparar("Batería 15.6\" — Dell") === normalizarParaComparar("bateria 15 6 dell"),
  "Tildes, comillas y guiones no cambian la comparación");

assert(!tokens("Disco SSD de la marca Kingston").includes("de"),
  "Las palabras vacías se descartan: no aportan a distinguir un equipo de otro");

// ═══════════════════════════════════════════════════════════════════════════
// 2. Parecido
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n── medir el parecido ──");

assert(parecido("Memoria RAM DDR Hynix 1GB", "Memoria RAM DDR Hynix 1GB") === 1,
  "Idénticos → 1");
assert(parecido("Memoria RAM DDR Hynix 1GB", "Disco SSD Kingston 480GB SATA") < 0.2,
  "Una RAM y un SSD no se parecen");
assert(parecido("Lenovo ThinkPad P1 Gen 3", "Lenovo ThinkPad P1 Gen 3 15.6\" Core i7") > 0.5,
  "El mismo equipo con más detalle sigue pareciéndose");
assert(parecido("", "algo") === 0, "Un nombre vacío no se parece a nada");

// ═══════════════════════════════════════════════════════════════════════════
// 3. Clasificación — el corazón del asunto
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n── el mismo artículo escrito distinto se detecta ──");

const e1 = emparejar(
  { nombre: "LENOVO THINKCENTRE M70Q MINI DESKTOP CORE I5-10400T 240 GB SSD 16 GB RAM WINDOWS 11 PRO C/ CARGADOR", cantidad: 1 },
  PORTAL
);
assert(e1.clasificacion === "YA EXISTE", "En MAYÚSCULAS y con espacios distintos → YA EXISTE");
assert(e1.candidato?.sku === "DES-000005", "…y señala el DES-000005 correcto");
assert(e1.motivo.includes("DES-000005"), "El motivo dice con cuál coincide, para poder verificarlo");

const e2 = emparejar({ nombre: "Memoria RAM DDR Hynix 1GB", cantidad: 3 }, PORTAL);
assert(e2.clasificacion === "YA EXISTE", "Nombre idéntico → YA EXISTE");
assert(e2.candidato?.cantidad === 5,
  "Y trae la cantidad del portal (5) para poder compararla con la del sistema viejo (3)");

console.log("\n── lo nuevo se reconoce como nuevo ──");

const e3 = emparejar({ nombre: "Teclado mecánico Redragon K552", cantidad: 4 }, PORTAL);
assert(e3.clasificacion === "NUEVO", "Un artículo que no está en el portal → NUEVO");

const e4 = emparejar({ nombre: "Monitor Samsung 24 pulgadas", cantidad: 2 }, PORTAL);
assert(e4.clasificacion === "NUEVO", "Otro que tampoco está → NUEVO");

console.log("\n── lo dudoso NO se decide solo ──");

// Mismo modelo, distinta capacidad: peligroso. Debe ir a revisión.
const e5 = emparejar({ nombre: "Disco SSD Kingston 240GB SATA", cantidad: 1 }, PORTAL);
assert(e5.clasificacion === "POSIBLE DUPLICADO",
  "SSD Kingston 240GB vs el 480GB del portal → POSIBLE DUPLICADO, lo mira una persona");
assert(e5.candidato?.sku === "SSD-000002", "…señalando con cuál se confunde");

const e6 = emparejar({ nombre: "Lenovo ThinkPad P1 Gen 3", cantidad: 1 }, PORTAL);
assert(e6.clasificacion === "POSIBLE DUPLICADO",
  "El mismo modelo con menos detalle → POSIBLE DUPLICADO, no se asume nada");

const e7 = emparejar({ nombre: "", cantidad: 1 }, PORTAL);
assert(e7.clasificacion === "POSIBLE DUPLICADO",
  "Sin nombre nunca se crea a ciegas: va a revisión");

console.log("\n── el código, cuando existe, manda ──");

const e8 = emparejar({ nombre: "Nombre completamente distinto", codigo: "DES-000005", cantidad: 1 }, PORTAL);
assert(e8.clasificacion === "YA EXISTE",
  "Si el código coincide con un SKU del portal, es el mismo aunque el nombre no se parezca");

const e9 = emparejar({ nombre: "Teclado mecánico Redragon K552", codigo: "ART-4471", cantidad: 4 }, PORTAL);
assert(e9.clasificacion === "NUEVO",
  "Un código con otra estructura, que no existe en el portal, no estorba");

// ═══════════════════════════════════════════════════════════════════════════
// 4. Categoría propuesta
// ═══════════════════════════════════════════════════════════════════════════

console.log("\n── proponer la categoría desde el nombre ──");

const casos: Array<[string, string]> = [
  ["Lenovo ThinkPad P1 Gen 3 15.6\" Core i7", "Laptop"],
  ["Lenovo ThinkCentre M70q Mini Desktop",    "Desktop"],
  ["Memoria RAM DDR4 Samsung 8GB",            "RAM"],
  ["Disco SSD Kingston 480GB SATA",           "SSD"],
  ["Monitor Samsung 24 pulgadas",             "Monitor"],
  ["Cargador original Dell 65W",              "Cargador"],
  ["Batería para HP Pavilion",                "Batería"],
  ["Teclado mecánico Redragon K552",          "Teclado"],
  ["Cable HDMI 2 metros",                     "Cable"],
  ["iMac 21.5 pulgadas",                      "All in One"],
];
for (const [nombre, esperada] of casos) {
  assert(proponerCategoria(nombre) === esperada,
    `"${nombre}" → ${esperada} (propuso: ${proponerCategoria(nombre) ?? "nada"})`);
}

console.log("\n── el orden de las pistas importa ──");

assert(proponerCategoria("Cargador para laptop Lenovo") === "Cargador",
  "Un cargador de laptop es un Cargador, no una Laptop");
assert(proponerCategoria("Batería para ThinkPad") === "Batería",
  "Una batería de ThinkPad es una Batería, no una Laptop");
assert(proponerCategoria("Pantalla para MacBook Pro") === "Pantalla",
  "Una pantalla de MacBook es una Pantalla");

console.log("\n── los accesorios incluidos no confunden el tipo ──");

// Lo encontró una prueba en seco con datos reales: este equipo se clasificaba
// como CARGADOR porque el nombre termina en "c/ cargador".
assert(proponerCategoria("Lenovo ThinkCentre M70q Mini Desktop Core i5-10400T 240GB SSD 16GB RAM Windows 11 Pro c/ cargador") === "Desktop",
  "Un desktop que viene 'c/ cargador' es un Desktop, no un Cargador");
assert(proponerCategoria("Lenovo ThinkPad P1 con maletín y cargador") === "Laptop",
  "Una laptop 'con maletín y cargador' sigue siendo Laptop");
assert(proponerCategoria("Monitor Samsung 24 pulgadas incluye cable HDMI") === "Monitor",
  "Un monitor que 'incluye cable' es Monitor, no Cable");

console.log("\n── las especificaciones no son el tipo ──");

// La regla real: gana la pista que aparece ANTES en el nombre. El tipo va al
// principio; lo que sigue son specs. Cortar solo por "c/ cargador" no bastaba,
// porque el mismo nombre dice "240GB SSD 16GB RAM".
assert(proponerCategoria("Laptop HP ProBook 8GB RAM 256GB SSD") === "Laptop",
  "Una laptop con 8GB RAM y 256GB SSD es una Laptop, no una RAM ni un SSD");
assert(proponerCategoria("Desktop Dell OptiPlex 1TB HDD 16GB DDR4") === "Desktop",
  "Un desktop con HDD y DDR4 es un Desktop");
assert(proponerCategoria("Memoria RAM DDR4 8GB para laptop") === "RAM",
  "Pero una RAM 'para laptop' sigue siendo RAM: la pista va primero");

// Pero si el accesorio ES el artículo, se reconoce igual.
assert(proponerCategoria("Cargador original Dell 65W con cable de poder") === "Cargador",
  "Un cargador 'con cable' sigue siendo Cargador");

console.log("\n── sin pista clara, no se inventa ──");

assert(proponerCategoria("Artículo genérico sin pistas") === undefined,
  "No propone nada — la celda queda vacía para que una persona la llene");
assert(proponerCategoria("") === undefined, "Un nombre vacío tampoco");
assert(proponerCategoria("Otro") !== "Otro" || proponerCategoria("Otro") === undefined,
  "Nunca rellena con 'Otro' para salir del paso: eso haría pasar el problema de largo");

// Todas las categorías propuestas deben existir en el desplegable de Airtable.
for (const [nombre] of casos) {
  const c = proponerCategoria(nombre);
  assert(!c || (CATEGORIAS as readonly string[]).includes(c),
    `La categoría propuesta para "${nombre}" existe en el desplegable de Airtable`);
}

// ─────────────────────────────────────────────────────────────────────────────

if (fallos > 0) {
  console.error(`\n❌ migracion-emparejar.test.ts — ${fallos} aserción(es) fallida(s)`);
  process.exit(1);
}
console.log("\n✅ migracion-emparejar.test.ts — todos los asserts pasaron");
