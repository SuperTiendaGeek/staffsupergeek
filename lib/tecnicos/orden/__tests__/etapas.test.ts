/**
 * Test — etapas de la orden y «Qué sigue» (rediseño de la orden, R1).
 * Ejecutar: npm test etapas
 */
import { diasEnTaller, pasosDeLaOrden, queSigue, type ResumenPresupuesto } from "../etapas";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

const r = (x: Partial<ResumenPresupuesto> = {}): ResumenPresupuesto => ({
  lineas: 3, aprobadas: 3, fechaAprobacion: "2026-11-06T18:00:00Z",
  trabajos: { total: 3, hechos: 2, enEspera: 1, enProceso: 0, texto: "2 de 3 hechos" },
  esperaRepuesto: true, esperaPago: false, ...x,
});
const base = { estado: "En Proceso", fechaIngreso: "2026-11-04T15:00:00Z", presupuestoEnviado: "2026-11-06T12:00:00Z" };

{
  const p = pasosDeLaOrden(base, r());
  assert(p.map((x) => x.estado).join(",") === "hecho,hecho,hecho,ahora,pendiente,pendiente", "en trabajo es el paso de ahora");
  assert(p[3].detalle === "2 de 3 hechos" && p[0].detalle !== "", "el paso dice cuántos trabajos van");
  assert(queSigue(base, r()).texto === "Esperar el repuesto" && queSigue(base, r()).accion === null, "solo falta el que espera repuesto: esperar el repuesto, sin botón destacado");
}
assert(queSigue(base, r({ esperaRepuesto: false, trabajos: { total: 3, hechos: 1, enEspera: 0, enProceso: 1, texto: "1 de 3 hechos" } })).texto === "Hacer los trabajos · 1 de 3 hechos", "faltan trabajos");
assert(queSigue(base, r({ trabajos: { total: 3, hechos: 3, enEspera: 0, enProceso: 0, texto: "3 de 3 hechos" } })).texto === "Pasar la orden a Completado", "todo hecho: completar");
assert(queSigue({ ...base, estado: "Pendiente", presupuestoEnviado: null }, null).texto === "Diagnosticar y armar el presupuesto", "sin presupuesto");
assert(queSigue({ ...base, presupuestoEnviado: null }, r({ aprobadas: 0 })).texto === "Enviar el presupuesto al cliente", "presupuesto sin enviar");
assert(queSigue(base, r({ aprobadas: 0 })).texto === "Esperar la respuesta del cliente", "presupuesto enviado sin respuesta");
assert(queSigue({ ...base, estado: "Esperando Respuesta", presupuestoEnviado: null }, r({ aprobadas: 0 })).texto === "Esperar la respuesta del cliente",
  "una orden vieja en «Esperando Respuesta» ya envió el presupuesto");
assert(pasosDeLaOrden({ ...base, estado: "Esperando Respuesta", presupuestoEnviado: null }, r({ lineas: 0, aprobadas: 0 }))[1].estado === "hecho",
  "«Esperando Respuesta» marca el paso Presupuesto aunque las líneas sean del sistema anterior");
assert(pasosDeLaOrden({ ...base, estado: "Pendiente" }, r({ lineas: 0, aprobadas: 0, fechaAprobacion: null }))[1].detalle === "",
  "un paso pendiente no muestra fecha");
assert(queSigue({ ...base, estado: "Completado" }, r()).accion === "avisar", "Completado sin avisar: el botón es «Avisar al cliente»");
assert(queSigue({ ...base, estado: "Completado", clienteAvisado: "2026-11-22T10:00:00Z" }, r()).accion === "entregar", "Completado y avisado: «Entregar»");
assert(queSigue({ ...base, estado: "Finalizado Entregado" }, r()).accion === "regreso", "entregada: «Regresó el equipo»");
{
  const p = pasosDeLaOrden({ ...base, estado: "Finalizado Entregado", fechaEntrega: "2026-11-21T20:00:00Z" }, r());
  assert(p.every((x) => x.estado === "hecho"), "entregada: todo hecho");
}
{
  const p = pasosDeLaOrden({ ...base, estado: "Pendiente", presupuestoEnviado: null }, null);
  assert(p[1].estado === "ahora", "sin presupuesto: el presupuesto es el paso de ahora");
}
assert(diasEnTaller("2026-11-04T15:00:00Z", null, new Date("2026-11-22T16:00:00Z")) === 18, "18 días en el taller");
assert(diasEnTaller("2026-11-04T15:00:00Z", "2026-11-10T15:00:00Z", new Date("2026-11-22T16:00:00Z")) === 6, "hasta la entrega");

if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1); }
console.log("\nTodo bien.");
