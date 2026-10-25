/**
 * Punto 18b (25-oct-2026): la lista de Artículos, una fila por SKU.
 * Ejecutar: npm test items-por-sku
 */

import { agruparIndicePorSku, agruparItemsPorSku, claveSku, ordenarSegunIndice, paginaDeGrupos, unidadPorDefecto } from "../items-por-sku";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) console.log("✓", msg);
  else {
    fallos += 1;
    console.error("✗", msg);
  }
}

// Claves
assert(claveSku(" acc-000121 ", "rec1") === claveSku("ACC-000121", "rec2"), "El SKU se compara sin espacios ni mayúsculas");
assert(claveSku("", "rec1") !== claveSku("", "rec2"), "Sin SKU, cada registro va solo");

// Índice ordenado (más nuevos primero): el SKU reutilizado sube a donde está su registro más nuevo.
const indice = [
  { id: "r9", sku: "ACC-000121" }, // reutilizado hoy
  { id: "r8", sku: "LAP-000050" },
  { id: "r7", sku: "" },
  { id: "r6", sku: "ACC-000121" },
  { id: "r5", sku: "acc-000121" },
  { id: "r4", sku: "MON-000003" },
];
const grupos = agruparIndicePorSku(indice);
assert(grupos.length === 4, "6 registros → 4 filas (3 SKUs + 1 sin SKU)");
assert(grupos[0].ids.join(",") === "r9,r6,r5", "El SKU reutilizado queda primero, con todos sus registros en orden");
assert(grupos[1].ids.join(",") === "r8" && grupos[2].ids.join(",") === "r7", "Los demás conservan su lugar");

// Páginas por grupos
const p1 = paginaDeGrupos(grupos, 1, 2);
assert(p1.grupos.length === 2 && p1.totalPaginas === 2 && p1.totalGrupos === 4 && p1.totalRegistros === 6, "Se paginan productos, no registros");
const p2 = paginaDeGrupos(grupos, 9, 2);
assert(p2.pagina === 2 && p2.grupos[1].ids[0] === "r4", "Una página fuera de rango va a la última");
assert(paginaDeGrupos([], 1, 100).totalPaginas === 1, "Sin resultados hay una sola página");
assert(paginaDeGrupos(grupos, 1, 2).grupos.flatMap((g) => g.ids).length === 4, "Un grupo nunca se parte entre páginas");

// Agrupar artículos de la página: suma solo lo que llegó (lo filtrado).
const items = [
  { id: "a", sku: "ACC-1", cantidad: 1, estado: "Vendido" },
  { id: "b", sku: "LAP-2", cantidad: 1, estado: "Disponible" },
  { id: "c", sku: "ACC-1", cantidad: 3, estado: "Disponible" },
  { id: "d", sku: "ACC-1", cantidad: null, qty: 2, estado: "En inspección" },
];
const g = agruparItemsPorSku(items);
assert(g.length === 2 && g[0].principal.id === "a" && g[0].items.length === 3, "Una fila por SKU; el principal es el primero de la lista");
assert(g[0].cantidad === 6, "La cantidad del SKU es la suma de sus registros (con el campo viejo si hace falta)");
assert(unidadPorDefecto(g[0].items)?.id === "c", "Al abrir el SKU se elige una unidad disponible");
assert(unidadPorDefecto([{ id: "x", estado: "Vendido" }, { id: "y", estado: "En tránsito" }])?.id === "y", "Si no hay disponible, una que siga en inventario");
assert(unidadPorDefecto([{ id: "x", estado: "Vendido" }])?.id === "x", "Si todo salió, la primera");

// Orden según el índice
const ordenados = ordenarSegunIndice([{ id: "b" }, { id: "z" }, { id: "a" }], ["a", "b"]);
assert(ordenados.map((r) => r.id).join(",") === "a,b,z", "Los registros completos vuelven al orden del índice");

if (fallos > 0) {
  console.error(`\n${fallos} assert(s) fallaron.`);
  process.exit(1);
}
console.log("\n✅ items-por-sku.test.ts — todos los asserts pasaron");
