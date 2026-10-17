/**
 * Código de barras de la etiqueta (punto 10b, 17-oct-2026).
 * Ejecutar: npx tsx lib/shipping-v2/__tests__/codigo-barras.test.ts
 */
import { codigoBarrasEtiqueta } from "../codigo-barras";

let fallos = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { fallos++; console.error("✗", msg); } else console.log("✓", msg);
}

const ANCHO = 47.6; // 50 mm menos los márgenes de la etiqueta
for (const valor of ["7HX2KQ3", "SG00004127", "LAP-000500", "356938035643809", "C02XK1ABJG5J"]) {
  const c = codigoBarrasEtiqueta(valor, { anchoUtilMm: ANCHO, altoMm: 9 });
  assert(Boolean(c && c.svg.startsWith("<svg width=")), `${valor}: genera el código`);
  // 0,25 mm = 2 puntos de la Zebra de 203 ppp: el mínimo cómodo para el lector.
  assert(Boolean(c && c.moduloMm >= 0.25), `${valor}: barra más fina de ${c?.moduloMm} mm (≥ 0,25)`);
  const ancho = Number(c?.svg.match(/width="([\d.]+)mm"/)?.[1]);
  assert(ancho > 25 && ancho <= ANCHO, `${valor}: ocupa ${ancho} mm de ${ANCHO}`);
}
assert(codigoBarrasEtiqueta("", { anchoUtilMm: ANCHO, altoMm: 9 }) === null, "Sin texto: sin código");

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo bien.");
