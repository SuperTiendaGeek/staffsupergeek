/**
 * Control de acceso a pantallas por módulo (Fase 1: solo pantallas, sin
 * campos todavía — ver comentario de cabecera en ../pantallas.ts).
 * Ejecutar: npx tsx lib/permissions/__tests__/pantallas.test.ts
 */

import {
  parsePantallasRestringidas,
  serializePantallasRestringidas,
  puedeVerPantalla,
  pantallasVisibles,
  PANTALLAS_POR_MODULO,
} from "../pantallas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

// ── parsePantallasRestringidas: defensivo, nunca lanza ──────────────────────
assert(Object.keys(parsePantallasRestringidas("")).length === 0, "vacío → sin restricciones");
assert(Object.keys(parsePantallasRestringidas(undefined)).length === 0, "undefined → sin restricciones");
assert(Object.keys(parsePantallasRestringidas("esto no es json")).length === 0, "JSON inválido → sin restricciones, no lanza");
assert(Object.keys(parsePantallasRestringidas("[1,2,3]")).length === 0, "un array en vez de objeto → sin restricciones");
assert(Object.keys(parsePantallasRestringidas("null")).length === 0, "null literal → sin restricciones");

const parsed = parsePantallasRestringidas('{"shipping-v2":["pagos","packings"],"otro":"no es array"}');
assert(
  JSON.stringify(parsed["shipping-v2"]) === JSON.stringify(["pagos", "packings"]),
  "parsea un módulo válido correctamente"
);
assert(parsed.otro === undefined, "descarta un módulo cuyo valor no es un array de strings");

const parsedMixto = parsePantallasRestringidas('{"shipping-v2":["pagos", 5, null, "packings"]}');
assert(
  JSON.stringify(parsedMixto["shipping-v2"]) === JSON.stringify(["pagos", "packings"]),
  "descarta entradas no-string dentro del array, conserva las válidas"
);

// ── serializePantallasRestringidas ──────────────────────────────────────────
assert(serializePantallasRestringidas({}) === "", "sin restricciones serializa a string vacío, no a '{}'");
assert(serializePantallasRestringidas({ "shipping-v2": [] }) === "", "un módulo con array vacío no ocupa espacio");
assert(
  serializePantallasRestringidas({ "shipping-v2": ["pagos"] }) === '{"shipping-v2":["pagos"]}',
  "serializa un módulo con restricciones reales"
);

// Ida y vuelta.
const original = { "shipping-v2": ["pagos", "recepcion"] };
assert(
  JSON.stringify(parsePantallasRestringidas(serializePantallasRestringidas(original))) === JSON.stringify(original),
  "serializar y volver a parsear reproduce el mismo valor"
);

// ── puedeVerPantalla: lista de EXCLUSIÓN, no de inclusión ──────────────────
assert(puedeVerPantalla({}, "shipping-v2", "pagos") === true, "sin ninguna restricción, todo visible por defecto");
assert(
  puedeVerPantalla({ "shipping-v2": ["pagos"] }, "shipping-v2", "pagos") === false,
  "una pantalla en la lista queda oculta"
);
assert(
  puedeVerPantalla({ "shipping-v2": ["pagos"] }, "shipping-v2", "items") === true,
  "las demás pantallas del módulo siguen visibles"
);
assert(
  puedeVerPantalla({ "otro-modulo": ["pagos"] }, "shipping-v2", "pagos") === true,
  "una restricción de OTRO módulo no afecta a este"
);

// ── pantallasVisibles: para armar menús/accesos rápidos ─────────────────────
const todas = PANTALLAS_POR_MODULO["shipping-v2"].map((p) => p.key);
assert(
  JSON.stringify(pantallasVisibles({}, "shipping-v2").map((p) => p.key)) === JSON.stringify(todas),
  "sin restricciones, se ven todas las pantallas del catálogo"
);
assert(
  pantallasVisibles({ "shipping-v2": ["pagos", "packings"] }, "shipping-v2").map((p) => p.key).join(",") ===
    todas.filter((k) => k !== "pagos" && k !== "packings").join(","),
  "con restricciones, quedan las demás en el mismo orden del catálogo"
);
assert(
  pantallasVisibles({ "shipping-v2": todas }, "shipping-v2").length === 0,
  "se pueden ocultar todas las pantallas de un módulo"
);

if (fallos > 0) {
  console.error(`\n${fallos} assert(s) fallaron.`);
  process.exit(1);
}
console.log("\n✅ pantallas.test.ts — todos los asserts pasaron");
