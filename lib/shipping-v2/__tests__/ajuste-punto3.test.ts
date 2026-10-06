/**
 * Ajuste de datos del punto 3 (etiqueta "Repuesto").
 * Ejecutar: npx tsx lib/shipping-v2/__tests__/ajuste-punto3.test.ts
 */
import { planAjustePunto3, type RegistroAjuste3 } from "../ajuste-punto3";

let fallos = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { fallos++; console.error("✗", msg); } else console.log("✓", msg);
}

const base: RegistroAjuste3 = { id: "rec1", sku: "REP-000007", estado: "Repuesto", recibido: true, requiereInspeccion: false, inspeccionFirmada: true, cantidad: 5 };
const destino = (r: RegistroAjuste3) => {
  const p = planAjustePunto3(r);
  return p.tipo === "cambio" ? String(p.fields["Estado Item"]) : p.tipo;
};

assert(destino(base) === "Disponible", "REP-000007 (recibido, no requiere inspección) → Disponible");
assert(destino({ ...base, sku: "REP-000018", inspeccionFirmada: false }) === "Disponible", "REP-000018 (no requiere inspección) → Disponible");
assert(destino({ ...base, requiereInspeccion: true, inspeccionFirmada: false }) === "En revisión", "Requiere inspección sin firmar → En revisión");
assert(destino({ ...base, recibido: false }) === "revisar", "Sin Recibido (RAM-000001) → lo decide el dueño");
assert(destino({ ...base, cantidad: 0 }) === "Agotado", "Sin unidades → Agotado");
assert(destino({ ...base, estado: "Disponible" }) === "nada", "Otras etiquetas no se tocan");

if (fallos > 0) { console.error(`\n${fallos} assert(s) fallaron.`); process.exit(1); }
console.log("\n✅ ajuste-punto3.test.ts — todos los asserts pasaron");
