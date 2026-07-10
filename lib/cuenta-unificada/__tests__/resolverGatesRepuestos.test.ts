/**
 * Test — resolverGatesRepuestos() (fix bug preexistente Fase 11, destapado
 * al construir el gancho de Fase 16 sobre una orden con operación vinculada).
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/cuenta-unificada/__tests__/resolverGatesRepuestos.test.ts
 *
 * Puro, sin red. Cubre exhaustivamente las combinaciones de ordenId/
 * operacionId/modoRepuestos — esta es la lógica exacta que cambió: antes
 * "incluyeStockV2" compartía el mismo gate que "legacyCuentanParaTotal"
 * (ambos exigían operacionId == null), lo que hacía invisibles los
 * repuestos de stock V2 de una orden con operación vinculada.
 *
 * Lanza en la primera falla y sale con código distinto de 0.
 */

import { resolverGatesRepuestos } from "../index";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    fallos++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

// ─── Orden sola (sin operación) ──────────────────────────────────────────────

{
  const r = resolverGatesRepuestos({ ordenId: "recORD1", operacionId: null, modoRepuestos: "v2" });
  assert(r.incluyeStockV2 === true, "Orden sola, modo V2: incluyeStockV2 = true (comportamiento de siempre)");
  assert(r.legacyCuentanParaTotal === false, "Orden sola, modo V2: legacy no cuenta (V2, no legacy)");
}
{
  const r = resolverGatesRepuestos({ ordenId: "recORD1", operacionId: null, modoRepuestos: "legacy" });
  assert(r.incluyeStockV2 === false, "Orden sola, modo legacy: incluyeStockV2 = false (no es V2)");
  assert(r.legacyCuentanParaTotal === true, "Orden sola, modo legacy: legacy SÍ cuenta (comportamiento de siempre)");
}

// ─── Orden CON operación vinculada — el caso del fix ─────────────────────────

{
  const r = resolverGatesRepuestos({ ordenId: "recORD1", operacionId: "recOPE1", modoRepuestos: "v2" });
  assert(r.incluyeStockV2 === true, "FIX: orden con operación, modo V2 → incluyeStockV2 = true (antes era false — el bug)");
  assert(r.legacyCuentanParaTotal === false, "Orden con operación, modo V2: legacy no cuenta (sin cambio de comportamiento)");
}
{
  const r = resolverGatesRepuestos({ ordenId: "recORD1", operacionId: "recOPE1", modoRepuestos: "legacy" });
  assert(r.incluyeStockV2 === false, "Orden con operación, modo legacy: incluyeStockV2 = false (no es V2)");
  assert(
    r.legacyCuentanParaTotal === false,
    "Orden con operación, modo legacy: legacy NO cuenta (evita doble conteo con la operación — SIN CAMBIO, el fix no toca esto)"
  );
}

// ─── Sin orden (consulta por operación, sin orden vinculada) ────────────────

{
  const r = resolverGatesRepuestos({ ordenId: null, operacionId: "recOPE1", modoRepuestos: null });
  assert(r.incluyeStockV2 === false, "Sin orden: incluyeStockV2 = false (no hay de dónde traer stock V2)");
  assert(r.legacyCuentanParaTotal === false, "Sin orden: legacy no cuenta");
}

// ─── Sin modoRepuestos resuelto (no debería pasar en la práctica, pero no debe romper) ──

{
  const r = resolverGatesRepuestos({ ordenId: "recORD1", operacionId: null, modoRepuestos: null });
  assert(r.incluyeStockV2 === false, "modoRepuestos null: incluyeStockV2 = false (ni confirma v2 ni legacy)");
  assert(r.legacyCuentanParaTotal === false, "modoRepuestos null: legacy no cuenta");
}

if (fallos > 0) {
  console.error(`\n❌ resolverGatesRepuestos.test.ts — ${fallos} aserción(es) fallida(s)`);
  process.exit(1);
}
console.log("\n✅ resolverGatesRepuestos.test.ts — todos los asserts pasaron");
