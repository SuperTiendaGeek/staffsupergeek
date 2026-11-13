/**
 * Test — plazos de retiro, recargo y liberar (punto 10C-3b).
 * Ejecutar: npm test retiro
 */
import { avisoDeRetiro, debeLiberarse, notaRecargoQuitado, plazosDeRetiro, recargoQueCorresponde, textoPlazos } from "../retiro";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}

// Kindle de Luis: llegó el mar 17-nov-2026 (Recepción a las 15:20 de Ecuador).
const llego = "2026-11-17T20:20:00.000Z";
const p = plazosDeRetiro(llego)!;
assert(p.llego === "2026-11-17" && p.recargoDesde === "2026-11-24" && p.guardadoHasta === "2027-02-17", "plazos: 7 días y 3 meses");
assert(plazosDeRetiro("2026-11-30")!.guardadoHasta === "2027-02-28", "30-nov + 3 meses = 28-feb (mes corto)");
assert(plazosDeRetiro(null) === null && plazosDeRetiro("") === null, "sin llegada, sin plazos");
assert(textoPlazos(llego) === "Llegó mar 17-nov · recargo desde mar 24-nov · plazo máximo mié 17-feb", "línea interna");

// Recargo
const base = { estado: "Aceptado", llegoEn: llego, saldoPendiente: 80, recargoActual: 0, recargoQuitado: false };
assert(recargoQueCorresponde({ ...base, hoy: "2026-11-23" }) === 0, "día 6: todavía no");
assert(recargoQueCorresponde({ ...base, hoy: "2026-11-24" }) === 8, "día 7 con $80 pendientes: $8");
assert(recargoQueCorresponde({ ...base, hoy: "2026-12-10", saldoPendiente: 0 }) === 0, "saldado: sin recargo");
assert(recargoQueCorresponde({ ...base, hoy: "2026-12-10", recargoActual: 8 }) === 0, "una sola vez");
assert(recargoQueCorresponde({ ...base, hoy: "2026-12-10", recargoQuitado: true }) === 0, "quitado por un administrador: no vuelve");
assert(recargoQueCorresponde({ ...base, hoy: "2026-12-10", estado: "Entregado" }) === 0, "entregado: no");
assert(recargoQueCorresponde({ ...base, hoy: "2026-12-10", llegoEn: null }) === 0, "sin llegar: no");
assert(recargoQueCorresponde({ ...base, hoy: "2026-11-24", saldoPendiente: 33.33 }) === 3.33, "10 % redondeado a centavos");

// Liberar
assert(!debeLiberarse({ estado: "Aceptado", llegoEn: llego, hoy: "2027-02-17" }), "el 17-feb todavía se guarda");
assert(debeLiberarse({ estado: "Aceptado", llegoEn: llego, hoy: "2027-02-18" }), "desde el 18-feb: por liberar");
assert(!debeLiberarse({ estado: "Entregado", llegoEn: llego, hoy: "2027-03-01" }), "entregado: no");

// Lo que ve el cliente
const a1 = avisoDeRetiro({ llegoEn: llego, hoy: "2026-11-18", recargo: 0, debe: 80 })!;
assert(a1.aviso === "Retíralo antes del mar 24-nov" && a1.detalle === "Después se suma un recargo del 10 % de lo que falta.", "antes del plazo, debiendo");
const a2 = avisoDeRetiro({ llegoEn: llego, hoy: "2026-11-18", recargo: 0, debe: 0 })!;
assert(a2.detalle === "Te lo guardamos hasta el mié 17-feb.", "antes del plazo, pagado");
const a3 = avisoDeRetiro({ llegoEn: llego, hoy: "2026-11-25", recargo: 8, debe: 88 })!;
assert(a3.aviso === "Pasó el plazo de 7 días" && a3.detalle === "Se sumó un recargo de $8. Te lo guardamos hasta el mié 17-feb.", "con recargo");
assert(avisoDeRetiro({ llegoEn: null, hoy: "2026-11-25", recargo: 0, debe: 0 }) === null, "sin llegar: nada");

// Lo que llegó antes de que exista la regla no recibe recargo automático.
assert(recargoQueCorresponde({ ...base, llegoEn: "2026-11-10", hoy: "2026-11-24" }) === 0, "llegó antes de la regla: sin recargo");
assert(recargoQueCorresponde({ ...base, llegoEn: "2026-11-14", hoy: "2026-11-21" }) === 8, "llegó el día que empieza la regla: sí");
assert(avisoDeRetiro({ llegoEn: "2026-11-10", hoy: "2026-11-12", recargo: 0, debe: 80 })!.detalle.startsWith("Te lo guardamos"), "antes de la regla: no promete recargo");
assert(textoPlazos("2026-11-10").includes("sin recargo"), "línea interna: sin recargo");
assert(notaRecargoQuitado(" Cliente avisó que viajaba ", "Alex", 8, new Date("2026-11-26T15:00:00Z")) === "2026-11-26 · Alex quitó $8: Cliente avisó que viajaba", "nota del recargo quitado");

if (fallos) { console.error(`\n${fallos} fallo(s)`); process.exit(1); }
console.log("\nTodo OK");
