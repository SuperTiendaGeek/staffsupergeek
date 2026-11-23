/**
 * Test del plan de datos R10 — poner al día las órdenes abiertas para las alertas.
 * Ejecutar: npm test alertas/__tests__/migracion
 */
import { CAMPO_AVISADO, CAMPO_MOVIMIENTO, CAMPO_RESPONSABLE, esMovimientoHistorico, planAlertas, type EntradaMig, type OrdenMig } from "../migracion";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const personas = [{ id: "recEnrique", nombre: "Enrique Martinez" }, { id: "recMaritza", nombre: "Maritza Moreno" }];
const e = (x: Partial<EntradaMig>): EntradaMig => ({ id: "h", fecha: "2026-11-10T15:00:00.000Z", texto: "En Proceso", tipo: "", autorId: "recEnrique", autorNombre: "Enrique Martinez", ...x });
const orden = (x: Partial<OrdenMig>): OrdenMig => ({
  id: "rec1", codigo: "OR000001", estado: "En Proceso", fechaIngreso: "2026-11-01T15:00:00.000Z",
  responsableId: null, ultimoMovimiento: null, clienteAvisado: null, historial: [], ...x,
});

assert(!esMovimientoHistorico(e({ autorNombre: "Migración R5", autorId: null })), "las notas de una migración no cuentan como movimiento");
assert(!esMovimientoHistorico(e({ tipo: "Contraseña vista" })), "ver la contraseña no cuenta");
assert(esMovimientoHistorico(e({ autorId: null, autorNombre: "" })), "una entrada vieja sin autor sí cuenta (era de una persona)");

// Último movimiento y responsable
const p1 = planAlertas({ personas, ordenes: [orden({ historial: [
  e({ id: "a", fecha: "2026-11-10T15:00:00.000Z" }),
  e({ id: "b", fecha: "2026-11-18T15:00:00.000Z", autorId: "recMaritza", autorNombre: "Maritza Moreno", texto: "Recordamos al cliente" }),
  e({ id: "c", fecha: "2026-11-23T03:00:00.000Z", autorId: null, autorNombre: "Migración R5", tipo: "Nota" }),
] })] });
const a1 = p1.acciones[0];
assert(a1.campos[CAMPO_MOVIMIENTO] === "2026-11-18T15:00:00.000Z", "último movimiento = la última entrada de una persona (no la migración)");
assert(JSON.stringify(a1.campos[CAMPO_RESPONSABLE]) === JSON.stringify(["recMaritza"]) && a1.responsable?.nombre === "Maritza Moreno", "responsable = quien hizo el último cambio");

const p2 = planAlertas({ personas, ordenes: [orden({ historial: [e({ autorId: "recOtro", autorNombre: "Ex empleado" })] })] });
assert(!p2.acciones[0].campos[CAMPO_RESPONSABLE] && p2.quedanSinResponsable.length === 1, "si quien escribió ya no está en Técnicos, queda sin responsable (se avisa)");

const p3 = planAlertas({ personas, ordenes: [orden({ historial: [] })] });
assert(p3.acciones[0].campos[CAMPO_MOVIMIENTO] === "2026-11-01T15:00:00.000Z" && p3.acciones[0].movimiento?.de === "Fecha de ingreso", "sin Actividad: la fecha de ingreso");

// Solo campos vacíos
const p4 = planAlertas({ personas, ordenes: [orden({ responsableId: "recEnrique", ultimoMovimiento: "2026-11-20T15:00:00.000Z", historial: [e({ autorId: "recMaritza" })] })] });
assert(p4.acciones.length === 0, "lo que ya tiene valor no se toca (vista previa en 0 después de aplicar)");

// Completado: cliente avisado
const p5 = planAlertas({ personas, ordenes: [orden({ estado: "Completado", historial: [
  e({ fecha: "2026-11-14T15:00:00.000Z", texto: "Completado para ser retirado" }),
  e({ fecha: "2026-11-16T15:00:00.000Z", texto: "Recordemos al cliente que ya está listo", autorId: "recMaritza", autorNombre: "Maritza Moreno" }),
] })] });
assert(p5.acciones[0].campos[CAMPO_AVISADO] === "2026-11-14T15:00:00.000Z", "completado: «avisado» = el día que pasó a Completado");
const p6 = planAlertas({ personas, ordenes: [orden({ estado: "Completado", historial: [e({ fecha: "2026-11-12T15:00:00.000Z", texto: "Listo" })] })] });
assert(p6.acciones[0].campos[CAMPO_AVISADO] === "2026-11-12T15:00:00.000Z", "sin entrada «Completado…»: el último movimiento");
const p7 = planAlertas({ personas, ordenes: [orden({ estado: "En Proceso", historial: [e({ texto: "Completado" })] })] });
assert(!p7.acciones[0].campos[CAMPO_AVISADO], "solo las órdenes en «Completado» reciben «Cliente avisado»");
const p8 = planAlertas({ personas, ordenes: [orden({ estado: "Completado", clienteAvisado: "2026-11-23T17:00:00.000Z", responsableId: "recEnrique", ultimoMovimiento: "2026-11-23T17:00:00.000Z" })] });
assert(p8.acciones.length === 0, "si ya se avisó por el portal, no se cambia");

if (fallos > 0) { console.error(`\n${fallos} fallo(s).`); process.exit(1); }
console.log("\nTodo bien.");
