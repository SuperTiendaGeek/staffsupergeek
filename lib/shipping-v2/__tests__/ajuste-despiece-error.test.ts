/**
 * Ajuste del inventario 7-nov: piezas registradas por error como "Despiece de equipo".
 * Ejecutar: npm test ajuste-despiece-error
 */
import { planDespieceError, type RegistroDespieceError } from "../ajuste-despiece-error";

let fallos = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { fallos++; console.error("✗", msg); } else console.log("✓", msg);
}

const base: RegistroDespieceError = {
  id: "rec1", sku: "REP-000081", tipoOperacion: "Despiece de equipo", estado: "Destinado a partes", recibido: true,
  requiereInspeccion: false, inspeccionFirmada: false, estadoRevision: "Recibido correctamente", cantidad: 1, cantidadReservada: 0, tieneDespiece: false,
};
const p = planDespieceError(base);
assert(p.tipo === "cambio" && p.fields["Tipo de operación"] === "Reajuste de inventario", "El tipo pasa a Reajuste de inventario");
assert(p.tipo === "cambio" && p.fields["Estado Item"] === "Disponible" && p.fields["Disponible para venta"] === true, "Pieza sin inspección → Disponible y a la venta (REP-000081)");

const pan = planDespieceError({ ...base, sku: "PAN-000003", requiereInspeccion: true, estadoRevision: "Recibido pendiente de revisión" });
assert(pan.tipo === "cambio" && pan.fields["Estado Item"] === "En revisión" && pan.fields["Disponible para venta"] === false, "Pide inspección sin firmar → En revisión, no a la venta (PAN-000003)");

const vendida = planDespieceError({ ...base, sku: "RAM-000002", estado: "Vendido", cantidad: 0 });
assert(vendida.tipo === "cambio" && !("Estado Item" in vendida.fields) && !("Disponible para venta" in vendida.fields), "Ya vendido: solo corrige el tipo, no resucita");

const reservada = planDespieceError({ ...base, cantidadReservada: 1 });
assert(reservada.tipo === "cambio" && reservada.fields["Disponible para venta"] === false, "Todas sus unidades apartadas → no a la venta");

assert(planDespieceError({ ...base, tieneDespiece: true }).tipo === "revisar", "Un equipo que sí se desarma no se toca");
assert(planDespieceError({ ...base, recibido: false }).tipo === "revisar", "Sin Recibido → lo decide el dueño");
assert(planDespieceError({ ...base, tipoOperacion: "Reajuste de inventario" }).tipo === "nada", "Otros tipos no se tocan");

if (fallos > 0) { console.error(`\n${fallos} assert(s) fallaron.`); process.exit(1); }
console.log("\n✅ ajuste-despiece-error.test.ts — todos los asserts pasaron");
