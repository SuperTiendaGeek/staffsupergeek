/**
 * Test de fuentes — ficha del equipo y contraseña oculta (rediseño R4 + R5).
 * Ejecutar: npm test equipos
 */
import { readFileSync } from "node:fs";
import path from "node:path";

let fallos = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) { fallos++; console.error("✗", msg); } else { console.log("✓", msg); }
}
const leer = (rel: string) => readFileSync(path.resolve(__dirname, "../../../..", rel), "utf8");

const servidor = leer("lib/tecnicos/equipos/servidor.ts");
const aFicha = servidor.slice(servidor.indexOf("const aFicha"), servidor.indexOf("export async function leerFichas"));
assert(/tieneContrasena: !!texto\(r\.fields\[E\.contrasena\]\)/.test(aFicha) && !/contrasena: texto/.test(aFicha), "la ficha que viaja a la pantalla NO lleva la contraseña");
assert(/tipoActividad: "Contraseña vista"/.test(servidor), "«Mostrar» queda en la Actividad");
assert(/ids\(r\.fields\[E\.ordenes\]\)\.includes\(o\.ordenId\)/.test(servidor), "solo se muestra desde una orden de ese equipo");

const ruta = leer("app/api/tecnicos/ordenes/[id]/equipo/contrasena/route.ts");
assert(/"Cache-Control": "no-store"/.test(ruta), "la contraseña no queda en caché");

const pantalla = leer("app/tecnicos/ordenes/[id]/OrdenDetalleClient.tsx");
assert(/<EquipoFicha\s/.test(pantalla), "la orden muestra la ficha del equipo");
assert(!/onSave=\{saveNotaInterna\}/.test(pantalla), "la tarjeta «Nota interna» ya no está");

const ia = leer("lib/asistente/servidor.ts");
assert(!/f\["Nota interna"\]/.test(ia), "la IA ya no lee la nota interna vieja (podía tener contraseñas)");

const crear = leer("app/api/tecnicos/ordenes/route.ts");
assert(/fichaParaOrdenNueva\(/.test(crear), "al registrar una orden se crea (o reusa) la ficha del equipo");

const script = leer("scripts/rediseno-r5-equipos.ts");
assert(/const APLICAR = process\.argv\.includes\("--aplicar"\)/.test(script) && /if \(!APLICAR\) return;/.test(script), "el script solo escribe con --aplicar");

if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1); }
console.log("\nTodo bien.");
