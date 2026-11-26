/**
 * Test de fuentes — la orden cerrada no se reabre por la puerta de atrás (R6).
 * Ejecutar: npm test regreso
 */
import { readFileSync } from "node:fs";
import path from "node:path";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}
const leer = (rel: string) => readFileSync(path.resolve(__dirname, "../../../..", rel), "utf8");

const ruta = leer("app/api/tecnicos/ordenes/[id]/estado/route.ts");
const iRevisa = ruta.indexOf("revisarCambioDeEstado(");
const iCambia = ruta.indexOf("updateOrdenEstado(");
assert(iRevisa > 0 && iCambia > iRevisa, "la ruta de estado revisa la orden cerrada ANTES de cambiar el estado");
assert(/esAdmin: isAdministratorRole\(session\.user\.rol\)/.test(ruta), "el permiso de administrador sale de la sesión, no de la pantalla");
assert(/tipoActividad: "Reapertura"/.test(ruta), "la reapertura queda en la Actividad");

const regreso = leer("lib/tecnicos/regreso/servidor.ts");
assert(/withLock\(`regreso:\$\{o\.ordenId\}`/.test(regreso), "el regreso tiene turno por orden");
assert(/revisarRegreso\(/.test(regreso) && /createOrdenReparacion\(/.test(regreso), "revisa y crea con la misma función de siempre (sin duplicar)");

const pantalla = leer("app/tecnicos/ordenes/[id]/OrdenDetalleClient.tsx");
// R1: la cabecera nueva calcula «cerrada» una vez y la usa para el selector y el menú ⋯.
assert(/const cerrada = !!orden && esOrdenCerrada\(orden\.estadoActual\)/.test(pantalla) && /\{cerrada \? \(/.test(pantalla), "la pantalla esconde el selector de estado en una orden cerrada");
// Punto 16: el menú ⋯ ahora es de todo administrador (también «Marcar como prueba»); «Reabrir…» sigue solo con la orden cerrada.
assert(/isAdministratorRole\(userRol\) && \(\s*<Desplegable[\s\S]{0,1600}\{cerrada && \(\s*<button[^\n]*setReabrirAbierto\(true\)/.test(pantalla), "«Reabrir…» solo para administradores (menú ⋯ de la orden cerrada)");

if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1); }
console.log("\nTodo bien.");
