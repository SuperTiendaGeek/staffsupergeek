/**
 * Qué repuestos entran en la cuenta de una orden.
 * Ejecutar: NODE_OPTIONS="--conditions react-server" npx tsx lib/cuenta-unificada/__tests__/resolverGatesRepuestos.test.ts
 *
 * Historia de este archivo: antes probaba un comportamiento donde el campo
 * "Modo repuestos" (Legacy/V2) de la orden decidía qué sumaba. Ese campo era un
 * andamio de la migración al inventario único y hacía daño:
 *
 *   · Los repuestos históricos ("Repuestos por Orden") solo contaban si la
 *     orden era Legacy Y no tenía operación vinculada. OR000346 perdía $70 y
 *     OR000343 $45 del total, aunque Airtable sí los sumaba — dos totales
 *     distintos para la misma orden.
 *   · Los repuestos de stock solo contaban si la orden era V2, y el botón para
 *     agregarlos solo salía en V2: 11 órdenes abiertas en Legacy no podían
 *     agregar un repuesto por ninguna vía.
 *
 * Ahora las dos fuentes cuentan siempre que haya orden, y el modo se ignora.
 * Puro, sin red. Sale con código distinto de 0 si algo falla.
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

// ─── Con orden: las dos fuentes cuentan, sin importar el modo ────────────────

{
  const r = resolverGatesRepuestos({ ordenId: "recORD1", operacionId: null, modoRepuestos: "v2" });
  assert(r.legacyCuentanParaTotal === true, "Orden sola en V2: los históricos SÍ cuentan");
  assert(r.incluyeStockV2 === true, "Orden sola en V2: el stock SÍ cuenta");
}

{
  const r = resolverGatesRepuestos({ ordenId: "recORD1", operacionId: null, modoRepuestos: "legacy" });
  assert(r.legacyCuentanParaTotal === true, "Orden sola en Legacy: los históricos SÍ cuentan");
  assert(
    r.incluyeStockV2 === true,
    "FIX: Orden sola en Legacy ahora SÍ puede sumar repuestos de stock (antes false)"
  );
}

{
  const r = resolverGatesRepuestos({ ordenId: "recORD1", operacionId: "recOPE1", modoRepuestos: "v2" });
  assert(
    r.legacyCuentanParaTotal === true,
    "FIX: con operación vinculada los históricos ya NO se silencian (caso OR000346, $70)"
  );
  assert(r.incluyeStockV2 === true, "Orden con operación en V2: el stock cuenta");
}

{
  const r = resolverGatesRepuestos({ ordenId: "recORD1", operacionId: "recOPE1", modoRepuestos: "legacy" });
  assert(r.legacyCuentanParaTotal === true, "FIX: Legacy con operación — los históricos cuentan (caso OR000343, $45)");
  assert(r.incluyeStockV2 === true, "FIX: Legacy con operación — el stock cuenta");
}

// ─── El modo ya no decide nada ───────────────────────────────────────────────

{
  const sinModo = resolverGatesRepuestos({ ordenId: "recORD1", operacionId: null });
  const conV2 = resolverGatesRepuestos({ ordenId: "recORD1", operacionId: null, modoRepuestos: "v2" });
  const conLegacy = resolverGatesRepuestos({ ordenId: "recORD1", operacionId: null, modoRepuestos: "legacy" });
  const conNull = resolverGatesRepuestos({ ordenId: "recORD1", operacionId: null, modoRepuestos: null });

  const iguales =
    JSON.stringify(sinModo) === JSON.stringify(conV2) &&
    JSON.stringify(conV2) === JSON.stringify(conLegacy) &&
    JSON.stringify(conLegacy) === JSON.stringify(conNull);
  assert(iguales, "El resultado es idéntico con modo v2, legacy, null o ausente: el modo se ignora");
}

// ─── Sin orden no hay repuestos de orden ─────────────────────────────────────

{
  const r = resolverGatesRepuestos({ ordenId: null, operacionId: "recOPE1", modoRepuestos: null });
  assert(r.incluyeStockV2 === false, "Sin orden: no hay stock que traer (el link vive en la orden)");
  assert(r.legacyCuentanParaTotal === false, "Sin orden: no hay históricos que sumar");
}

{
  const r = resolverGatesRepuestos({ ordenId: null, operacionId: null, modoRepuestos: null });
  assert(r.incluyeStockV2 === false, "Sin orden ni operación: nada que sumar");
  assert(r.legacyCuentanParaTotal === false, "Sin orden ni operación: nada que sumar");
}

if (fallos > 0) {
  console.error(`\n❌ resolverGatesRepuestos.test.ts — ${fallos} aserción(es) fallida(s)`);
  process.exit(1);
}
console.log("\n✅ resolverGatesRepuestos.test.ts — todos los asserts pasaron");
