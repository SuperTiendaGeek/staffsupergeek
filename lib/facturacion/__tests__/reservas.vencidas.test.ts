/**
 * Reservas vencidas (auditoría Shipping V2, punto 6 · 9-oct-2026).
 * Ejecutar: npx tsx lib/facturacion/__tests__/reservas.vencidas.test.ts
 */
import { DIAS_GRACIA_VENCIDA, debeLiberarseSola, fechaLiberacionAutomatica, fechaLimiteExtendida, reservaVencida } from "../reservas/reglas";
import { estadoSegunLlegada } from "../../shipping-v2/item-venta";

let fallos = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { fallos++; console.error("✗", msg); } else console.log("✓", msg);
}
const d = (s: string) => new Date(`${s}T00:00:00`);
const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;

console.log("— Liberación automática (RES-000001 venció el 30-sep) —");
assert(DIAS_GRACIA_VENCIDA === 3, "Gracia de 3 días (decisión del dueño)");
assert(!reservaVencida(d("2026-09-30"), d("2026-09-30")), "El día límite todavía vale");
assert(reservaVencida(d("2026-09-30"), d("2026-10-01")), "Al día siguiente ya está vencida");
assert(!debeLiberarseSola(d("2026-09-30"), d("2026-10-02")), "2 días vencida: todavía no se libera sola");
assert(debeLiberarseSola(d("2026-09-30"), d("2026-10-03")), "3 días vencida: se libera sola");
assert(debeLiberarseSola(d("2026-09-30"), d("2026-10-09")), "RES-000001 hoy (9-oct): se libera sola");
assert(iso(fechaLiberacionAutomatica(d("2026-09-30"))) === "2026-10-03", "Fecha de liberación automática = límite + 3");

console.log("\n— Extender plazo —");
assert(iso(fechaLimiteExtendida(d("2026-09-30"), d("2026-10-09"), 7)) === "2026-10-16", "Vencida: se cuenta desde hoy");
assert(iso(fechaLimiteExtendida(d("2026-10-17"), d("2026-10-09"), 7)) === "2026-10-24", "Todavía no vence: se cuenta desde la fecha límite (no se acorta)");

console.log("\n— Etiqueta al apartar / liberar —");
assert(estadoSegunLlegada({ estado: "En tránsito", recibido: false, todasReservadas: true }) === null, "En camino y todo apartado: conserva su etapa");
assert(estadoSegunLlegada({ estado: "Disponible", recibido: true, todasReservadas: true }) === "Reservado", "En la tienda y todo apartado: Reservado");
assert(estadoSegunLlegada({ estado: "Reservado", recibido: true, todasReservadas: false }) === "Disponible", "Al liberar en la tienda: Disponible");
assert(estadoSegunLlegada({ estado: "Reservado", recibido: true, requiereInspeccion: true, inspeccionFirmada: false, todasReservadas: false }) === "En revisión", "Al liberar con inspección pendiente: En revisión");
assert(estadoSegunLlegada({ estado: "Reservado", recibido: true, todasReservadas: true }) === null, "Sigue todo apartado: no cambia");
assert(estadoSegunLlegada({ estado: "Vendido", recibido: true, todasReservadas: false }) === null, "Vendido no se toca");

if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1); }
console.log("\nTodo bien.");
