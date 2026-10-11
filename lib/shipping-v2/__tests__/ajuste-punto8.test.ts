/**
 * Limpieza de datos del punto 8 (Novedades).
 * Ejecutar: npx tsx lib/shipping-v2/__tests__/ajuste-punto8.test.ts
 */
import {
  NOVEDAD_ACC_000027,
  NOVEDAD_LAP_000032,
  NOVEDAD_OTR_000199_RAYONES,
  NOVEDAD_REP_000021,
  planAjustePunto8Item,
  planAjustePunto8Novedad,
  type NovedadParaAjuste8,
} from "../ajuste-punto8";

let fallos = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { fallos++; console.error("✗", msg); } else console.log("✓", msg);
}
const AHORA = "2026-10-10T15:00:00.000Z";
const base: NovedadParaAjuste8 = { id: "rec1", novedadId: "NOV-LAP-000011-x", tipo: "Observación menor", estado: "Cerrada", solucion: "Se descarta", decision: "", observacionFinal: "No requiere accion", bloqueaVenta: false };

let c = planAjustePunto8Novedad(base, AHORA);
assert(c?.fields["Decisión sobre el artículo"] === "No requiere solución" && c.fields["Solución"] === null, "«Se descarta» → «No requiere solución» y se limpia la solución vieja");
assert(String(c?.fields["Observación final"]).startsWith("No requiere accion\n[Ajuste 10-oct-2026: la solución decía «Se descarta»]"), "Se conserva el texto y se anota la solución vieja");
assert(c?.fields["Tipo de novedad"] === undefined && c?.fields["Bloquea venta"] === undefined, "No toca el tipo válido ni bloquea nada");
assert(planAjustePunto8Novedad({ ...base, solucion: "Se repara internamente" }, AHORA)?.fields["Decisión sobre el artículo"] === "Reparado", "«Se repara internamente» → «Reparado»");
assert(planAjustePunto8Novedad({ ...base, solucion: "Se vende con descuento" }, AHORA)?.fields["Decisión sobre el artículo"] === "Se vende con descuento", "«Se vende con descuento» se conserva");
c = planAjustePunto8Novedad({ ...base, tipo: "Otro", solucion: "Otro" }, AHORA);
assert(c?.fields["Decisión sobre el artículo"] === "No requiere solución" && c?.fields["Tipo de novedad"] === "Asunto interno", "«Otro» → «No requiere solución» y tipo «Asunto interno»");
c = planAjustePunto8Novedad({ ...base, novedadId: NOVEDAD_LAP_000032, tipo: "Faltante", estado: "En solución", solucion: "Otro" }, AHORA);
assert(c?.fields["Solución"] === "Reemplazo" && c?.fields["Tipo de novedad"] === "Incompleto" && c?.fields["Estado Novedad"] === undefined, "LAP-000032: propuesta Reemplazo, Incompleto, sigue En solución");
c = planAjustePunto8Novedad({ ...base, novedadId: NOVEDAD_ACC_000027, tipo: "Faltante", estado: "Abierta", solucion: "", observacionFinal: "" }, AHORA);
assert(c?.fields["Tipo de novedad"] === "Perdido en tienda" && c?.fields["Bloquea venta"] === true && c?.fields["Estado Novedad"] === undefined, "ACC-000027: Perdido en tienda, bloqueada y sigue Abierta");
c = planAjustePunto8Novedad({ ...base, novedadId: NOVEDAD_OTR_000199_RAYONES, tipo: "Faltante" }, AHORA);
assert(c?.fields["Tipo de novedad"] === "Dañado", "OTR-000199 «rayones» → Dañado");
c = planAjustePunto8Novedad({ ...base, novedadId: NOVEDAD_REP_000021, estado: "Abierta", solucion: "", observacionFinal: "" }, AHORA);
assert(c?.fields["Estado Novedad"] === "Cerrada" && c?.fields["Decisión sobre el artículo"] === "No requiere solución", "REP-000021 se cierra con «No requiere solución»");

console.log("— Ya aplicado: no hace nada —");
assert(planAjustePunto8Novedad({ ...base, solucion: "", decision: "No requiere solución" }, AHORA) === null, "Una novedad ya ajustada no cambia");
assert(planAjustePunto8Novedad({ ...base, novedadId: NOVEDAD_LAP_000032, tipo: "Incompleto", estado: "En solución", solucion: "Reemplazo", decision: "No requiere solución" }, AHORA) === null, "LAP-000032 ajustada no cambia");
assert(planAjustePunto8Novedad({ ...base, novedadId: NOVEDAD_ACC_000027, tipo: "Perdido en tienda", estado: "Abierta", solucion: "", bloqueaVenta: true }, AHORA) === null, "ACC-000027 ajustada no cambia");
assert(planAjustePunto8Novedad({ ...base, novedadId: NOVEDAD_REP_000021, estado: "Cerrada", solucion: "", decision: "No requiere solución" }, AHORA) === null, "REP-000021 cerrada no cambia");

console.log("— Artículo —");
assert(planAjustePunto8Item({ id: "r", sku: "ACC-000027", estado: "Con novedad" }, AHORA)?.fields["Estado Item"] === "Perdido en tienda", "ACC-000027 pasa a «Perdido en tienda»");
assert(planAjustePunto8Item({ id: "r", sku: "ACC-000027", estado: "Perdido en tienda" }, AHORA) === null, "…una sola vez");
assert(planAjustePunto8Item({ id: "r", sku: "LAP-000001", estado: "Con novedad" }, AHORA) === null, "Ningún otro artículo se toca");

if (fallos) { console.error(`Fallaron ${fallos}.`); process.exit(1); }
console.log("✅ ajuste-punto8.test.ts — todos los asserts pasaron");
