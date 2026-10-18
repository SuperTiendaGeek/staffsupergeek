/**
 * Copiar entre unidades del mismo producto (punto 10b-4b).
 * Ejecutar: npx tsx lib/shipping-v2/__tests__/copiar-unidad.test.ts
 */
import { CAMPO_ESPECIFICACIONES, camposFichaCopiada, evaluarCopiaFicha, resultadosParaCopiar } from "../copiar-unidad";
import { SHIPPING_V2_ITEM_FIELDS as F } from "../schema.generated";

let fallos = 0;
function assert(condicion: unknown, mensaje: string) {
  if (condicion) console.log(`✓ ${mensaje}`);
  else { fallos++; console.error(`✗ ${mensaje}`); }
}

console.log("\n— ¿Se puede copiar? —");
assert(evaluarCopiaFicha({ id: "a", sku: "LAP-000500" }, { id: "b", sku: "lap-000500", estado: "Disponible" }) === null, "Otra unidad del mismo SKU: sí");
assert(evaluarCopiaFicha({ id: "a", sku: "LAP-000500" }, { id: "a", sku: "LAP-000500" }) !== null, "La misma unidad: no");
assert(evaluarCopiaFicha({ id: "a", sku: "LAP-000500" }, { id: "b", sku: "LAP-000501" }) !== null, "Otro SKU: no");
assert(evaluarCopiaFicha({ id: "a", sku: "LAP-000500" }, { id: "b", sku: "LAP-000500", estado: "Vendido" }) !== null, "Vendida: no");

console.log("\n— Qué se copia de la ficha —");
const origen: Record<string, unknown> = {
  [F.marcaFicha]: "Dell",
  [F.modeloFicha]: "Latitude 5420",
  [F.cpuModelo]: "i5-1145G7",
  [F.ramCapacidad]: "16GB",
  [F.conectividadV2]: ["recWifi", "recBt"],
  [F.bateriaSalud]: 95,
  [F.bateriaEstado]: "Buena",
  [F.observacionFichaTecnica]: "Rayón en la tapa",
  [F.fichaTecnicaGenerada]: true,
  [F.fichaTecnicaRevisada]: true,
  [CAMPO_ESPECIFICACIONES]: JSON.stringify({ version: 1, valores: { almacenamiento: "256GB", salud: "95" } }),
};
const c = camposFichaCopiada(origen, { especificaciones: JSON.stringify({ version: 1, valores: { salud: "88", almacenamiento: "128GB" } }), fichaGenerada: false }, { actor: "Joseph", ahora: "2026-10-17T12:00:00Z" });
assert(c[F.marcaFicha] === "Dell" && c[F.cpuModelo] === "i5-1145G7" && c[F.ramCapacidad] === "16GB", "Marca, CPU y RAM del producto");
assert(Array.isArray(c[F.conectividadV2]) && (c[F.conectividadV2] as string[]).length === 2, "Conectividad");
assert(c[F.gpu] === null && Array.isArray(c[F.puertosV2]) && (c[F.puertosV2] as string[]).length === 0, "Lo vacío en el origen queda vacío");
assert(!(F.bateriaSalud in c) && !(F.bateriaEstado in c) && !(F.observacionFichaTecnica in c), "Batería y observación de la unidad no se copian");
assert(!(F.fichaTecnicaRevisada in c) && c[F.fichaTecnicaGenerada] === true, "Queda generada, no revisada");
const espec = JSON.parse(String(c[CAMPO_ESPECIFICACIONES])).valores;
assert(espec.almacenamiento === "256GB" && espec.salud === "88", "Datos de categoría del producto; la salud de batería es la de la unidad");
const yaGenerada = camposFichaCopiada(origen, { fichaGenerada: true }, { actor: "J", ahora: "x" });
assert(!(F.fichaTecnicaGeneradaPor in yaGenerada), "Si ya tenía ficha, no cambia quién la generó");

console.log("\n— Qué se copia de la inspección —");
const puntos = resultadosParaCopiar({ puntos: {
  p1: { r: "ok", txt: "", por: "", en: "" },
  p2: { r: "falla", txt: "", por: "", en: "" },
  p3: { r: "na", txt: "", por: "", en: "" },
} });
assert(puntos.length === 2 && puntos.every((p) => p.resultado !== "falla"), "Solo Conforme y No aplica; las fallas no");

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo bien.");
